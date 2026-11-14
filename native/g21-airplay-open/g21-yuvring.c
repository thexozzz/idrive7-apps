/*
 * g21-yuvring - AirPlay picture straight to mgu-render, without the app (as RideTube's ytdec).
 *
 * UxPlay (G21 tee) writes each decoded frame to /run/g21-airplay/latest.yuv by rename():
 *   "G21Y" + u16 w + u16 h (LE) + I420.
 * This program waits for each new frame (inotify), scales it to the centre profile
 * (/run/g21-session/airplay-size, "600x400", either orientation, aspect kept, never enlarged,
 * width % 4) and puts it into the video file mgu-render draws (op 19):
 *   64-byte head: magic "MGVF" (0x4656474d), 1, w, h, seq, slot, nslot, 1, 1; then nslot I420 slots.
 * A new size is a new file put in place with rename(), so the renderer never reads a file cut
 * down under it; /run/g21-airplay/ring says "w h seq ino" for the app (it names the file to the
 * renderer again when ino changes).
 *
 * Usage: g21-yuvring [in] [out] [status] [size-file]
 * No root actions beyond writing those files. Ends on SIGTERM.
 */
#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/inotify.h>
#include <sys/select.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <time.h>
#include <unistd.h>

#define NSLOT 4
#define MAGIC 0x4656474du
#define MAX_W 1920
#define MAX_H 1080

static volatile sig_atomic_t stop_now = 0;
static void on_term(int s) { (void)s; stop_now = 1; }

static const char *in_path = "/run/g21-airplay/latest.yuv";
static const char *out_path = "/dev/shm/mgu-video-g21airplay";
static const char *status_path = "/run/g21-airplay/ring";
static const char *size_path = "/run/g21-session/airplay-size";

static int out_fd = -1;
static int out_w = 0, out_h = 0;
static uint32_t seq = 0, slot = 0;
static ino_t out_ino = 0;

static void put32(unsigned char *b, uint32_t v) { b[0] = v & 255; b[1] = (v >> 8) & 255; b[2] = (v >> 16) & 255; b[3] = (v >> 24) & 255; }

static void profile(int *pw, int *ph)
{
    char buf[64];
    int fd = open(size_path, O_RDONLY);
    int w = 600, h = 400;
    if (fd >= 0) {
        ssize_t n = read(fd, buf, sizeof buf - 1);
        close(fd);
        if (n > 0) {
            int a, b;
            buf[n] = 0;
            if (sscanf(buf, "%dx%d", &a, &b) == 2 && a >= 64 && b >= 32 && a <= MAX_W && b <= MAX_H) { w = a; h = b; }
        }
    }
    *pw = w; *ph = h;
}

/* as frame_fit.js profileDims: portrait turns the profile; scale <= 1; rounded, both sides % 4; >= 64x32 */
static int even4(int n) { if (n < 4) n = 4; return n - n % 4; }
static void fit_dims(int sw, int sh, int pw, int ph, int *dw, int *dh)
{
    double s, sx, sy;
    int w, h;
    if (sh > sw) { int t = pw; pw = ph; ph = t; }
    sx = (double)pw / sw; sy = (double)ph / sh;
    s = sx < sy ? sx : sy;
    if (s > 1) s = 1;
    w = even4((int)(sw * s + 0.5)); h = even4((int)(sh * s + 0.5));
    if (w < 64) w = 64;
    if (h < 32) h = 32;
    *dw = w; *dh = h;
}

/* box-average scale of one plane (each output pixel = mean of its source area): sharp and cheap */
static void scale_plane(const unsigned char *src, int sw, int sh, unsigned char *dst, int dw, int dh)
{
    static int *x0 = NULL, *x1 = NULL;
    static int cap = 0;
    int x, y;
    if (cap < dw + 1) { free(x0); free(x1); cap = dw + 1; x0 = malloc(sizeof(int) * cap); x1 = malloc(sizeof(int) * cap); }
    for (x = 0; x < dw; x++) {
        x0[x] = (int)((long)x * sw / dw);
        x1[x] = (int)((long)(x + 1) * sw / dw);
        if (x1[x] <= x0[x]) x1[x] = x0[x] + 1;
    }
    for (y = 0; y < dh; y++) {
        int y0 = (int)((long)y * sh / dh), y1 = (int)((long)(y + 1) * sh / dh);
        if (y1 <= y0) y1 = y0 + 1;
        for (x = 0; x < dw; x++) {
            unsigned sum = 0, n = 0;
            int yy, xx;
            for (yy = y0; yy < y1; yy++) {
                const unsigned char *row = src + (size_t)yy * sw;
                for (xx = x0[x]; xx < x1[x]; xx++) { sum += row[xx]; n++; }
            }
            dst[(size_t)y * dw + x] = (unsigned char)((sum + n / 2) / n);
        }
    }
}

static int write_all(int fd, const void *b, size_t n, off_t at)
{
    const unsigned char *p = b;
    while (n) {
        ssize_t k = pwrite(fd, p, n, at);
        if (k < 0) { if (errno == EINTR) continue; return -1; }
        p += k; n -= (size_t)k; at += k;
    }
    return 0;
}

static void write_status(void)
{
    char tmp[256], buf[128];
    int fd, n;
    snprintf(tmp, sizeof tmp, "%s.tmp", status_path);
    fd = open(tmp, O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (fd < 0) return;
    n = snprintf(buf, sizeof buf, "%d %d %u %lu\n", out_w, out_h, seq, (unsigned long)out_ino);
    if (write(fd, buf, (size_t)n) == n) { fchmod(fd, 0644); close(fd); rename(tmp, status_path); } else { close(fd); unlink(tmp); }
}

/* a new file for a new size (rename: the renderer keeps the one it has until named again) */
static int open_ring(int w, int h)
{
    char tmp[256];
    unsigned char head[64];
    size_t frame = (size_t)w * h * 3 / 2, size = 64 + NSLOT * frame;
    struct stat st;
    int fd;
    snprintf(tmp, sizeof tmp, "%s.ring", out_path);
    fd = open(tmp, O_RDWR | O_CREAT | O_TRUNC, 0644);
    if (fd < 0) return -1;
    if (ftruncate(fd, (off_t)size) != 0) { close(fd); unlink(tmp); return -1; }
    memset(head, 0, sizeof head);
    put32(head, MAGIC); put32(head + 4, 1); put32(head + 8, (uint32_t)w); put32(head + 12, (uint32_t)h);
    put32(head + 24, NSLOT); put32(head + 28, 1); put32(head + 32, 1);
    if (write_all(fd, head, sizeof head, 0) != 0) { close(fd); unlink(tmp); return -1; }
    fchmod(fd, 0644);
    if (rename(tmp, out_path) != 0) { close(fd); unlink(tmp); return -1; }
    if (out_fd >= 0) close(out_fd);
    out_fd = fd; out_w = w; out_h = h; seq = 0; slot = 0;
    out_ino = fstat(fd, &st) == 0 ? st.st_ino : 0;
    return 0;
}

static unsigned char *inbuf = NULL, *outbuf = NULL;
static size_t incap = 0, outcap = 0;

static int one_frame(void)
{
    int fd = open(in_path, O_RDONLY);
    struct stat st;
    ssize_t got = 0;
    int sw, sh, pw, ph, dw, dh;
    size_t need, frame;
    unsigned char word[4];
    if (fd < 0) return 0;
    if (fstat(fd, &st) != 0 || st.st_size < 8 || st.st_size > 8 + MAX_W * MAX_H * 3 / 2) { close(fd); return 0; }
    if (incap < (size_t)st.st_size) { free(inbuf); incap = (size_t)st.st_size; inbuf = malloc(incap); if (!inbuf) { incap = 0; close(fd); return 0; } }
    while (got < st.st_size) {
        ssize_t k = read(fd, inbuf + got, (size_t)(st.st_size - got));
        if (k < 0 && errno == EINTR) continue;
        if (k <= 0) break;
        got += k;
    }
    close(fd);
    if (got < 8 || memcmp(inbuf, "G21Y", 4) != 0) return 0;
    sw = inbuf[4] | (inbuf[5] << 8); sh = inbuf[6] | (inbuf[7] << 8);
    if (sw < 16 || sh < 16 || (sw & 1) || (sh & 1)) return 0;
    need = 8 + (size_t)sw * sh * 3 / 2;
    if ((size_t)got < need) return 0;
    profile(&pw, &ph);
    fit_dims(sw, sh, pw, ph, &dw, &dh);
    frame = (size_t)dw * dh * 3 / 2;
    if (outcap < frame) { free(outbuf); outcap = frame; outbuf = malloc(outcap); if (!outbuf) { outcap = 0; return 0; } }
    {
        const unsigned char *y = inbuf + 8, *u = y + (size_t)sw * sh, *v = u + (size_t)(sw / 2) * (sh / 2);
        unsigned char *oy = outbuf, *ou = oy + (size_t)dw * dh, *ov = ou + (size_t)(dw / 2) * (dh / 2);
        if (dw == sw && dh == sh) memcpy(outbuf, y, frame);
        else {
            scale_plane(y, sw, sh, oy, dw, dh);
            scale_plane(u, sw / 2, sh / 2, ou, dw / 2, dh / 2);
            scale_plane(v, sw / 2, sh / 2, ov, dw / 2, dh / 2);
        }
    }
    if (out_fd < 0 || dw != out_w || dh != out_h) {
        if (open_ring(dw, dh) != 0) return 0;
        write_status();
        fprintf(stderr, "g21-yuvring: %dx%d -> %dx%d (profile %dx%d)\n", sw, sh, dw, dh, pw, ph);
    }
    slot = (slot + 1) % NSLOT;
    if (write_all(out_fd, outbuf, frame, 64 + (off_t)slot * frame) != 0) return 0;
    put32(word, slot);
    write_all(out_fd, word, 4, 20);
    seq++;
    put32(word, seq);
    write_all(out_fd, word, 4, 16);
    return 1;
}

int main(int argc, char **argv)
{
    char dir[256], name[128];
    const char *slash;
    int in, wd;
    char evbuf[4096] __attribute__((aligned(8)));
    struct timespec last = {0, 0};
    if (argc > 1) in_path = argv[1];
    if (argc > 2) out_path = argv[2];
    if (argc > 3) status_path = argv[3];
    if (argc > 4) size_path = argv[4];
    signal(SIGTERM, on_term); signal(SIGINT, on_term); signal(SIGPIPE, SIG_IGN);
    slash = strrchr(in_path, '/');
    if (!slash) { snprintf(dir, sizeof dir, "."); snprintf(name, sizeof name, "%s", in_path); }
    else { snprintf(dir, sizeof dir, "%.*s", (int)(slash - in_path), in_path); snprintf(name, sizeof name, "%s", slash + 1); }
    in = inotify_init1(IN_CLOEXEC);
    wd = in >= 0 ? inotify_add_watch(in, dir, IN_MOVED_TO | IN_CLOSE_WRITE) : -1;
    fprintf(stderr, "g21-yuvring: %s -> %s (%s)\n", in_path, out_path, wd >= 0 ? "inotify" : "polling");
    while (!stop_now) {
        int fresh = 0;
        if (wd >= 0) {
            fd_set rd;
            struct timeval tv = {1, 0};
            FD_ZERO(&rd); FD_SET(in, &rd);
            if (select(in + 1, &rd, NULL, NULL, &tv) > 0) {
                ssize_t n = read(in, evbuf, sizeof evbuf), i = 0;
                while (n > 0 && i < n) {
                    struct inotify_event *e = (struct inotify_event *)(evbuf + i);
                    if (e->len && strcmp(e->name, name) == 0) fresh = 1;
                    i += (ssize_t)sizeof(struct inotify_event) + e->len;
                }
            }
        } else {
            struct stat st;
            usleep(5000);
            if (stat(in_path, &st) == 0 && (st.st_mtim.tv_sec != last.tv_sec || st.st_mtim.tv_nsec != last.tv_nsec)) { last = st.st_mtim; fresh = 1; }
        }
        if (fresh && one_frame()) {
            static uint32_t told = 0;
            if (seq - told >= 12 || seq == 1) { told = seq; write_status(); }
        }
    }
    if (out_fd >= 0) close(out_fd);
    unlink(status_path);
    return 0;
}
