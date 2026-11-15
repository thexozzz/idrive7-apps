// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * g21-webframe - the browser's page picture straight to mgu-render, without the app
 * (as g21-yuvring does for AirPlay and ytdec for YouTube).
 *
 * stdin: frames from g21-browserd.js, each "u32 LE length" + one baseline JPEG (what Chromium's
 * Page.startScreencast sends: 8-bit, Huffman, 4:2:0; 4:4:4, 4:2:2, 4:4:0 and grey are read too).
 * Each frame is decoded to planar YCbCr and put into the video file mgu-render draws (op 19):
 *   64-byte head: magic "MGVF" (0x4656474d), 1, w, h, seq, slot, nslot, 1, 1; then nslot I420 slots.
 * A new size is a new file put in place with rename(), so the renderer never reads a file cut
 * down under it.
 *
 * stdout, one line each:
 *   "ring <w> <h> <ino>"   a new video file (the app names it to the renderer again)
 *   "f <seq> <us>"         a frame is in the file (us: decode + write time)
 *   "e <text>"             a frame that could not be decoded (it is skipped)
 *
 * The last frame is written again under a new seq every 0.5 s without input: a page that stands
 * still sends no frames, and the renderer shows a video only after it has seen a new seq
 * (the black centre screen AirPlay had after the app was minimised, car 2026-11-14).
 *
 * Colour: JPEG is full-range BT.601. The file gets, by argv[2]:
 *   601  (default) limited-range BT.601   709  limited-range BT.709   full  the JPEG's own values
 * Which one mgu-render expects is NOT verified on the car; g21-browserd.js reads the choice from
 * state/color so it can be changed without a new build.
 *
 * Usage: g21-webframe <video file> [601|709|full]
 * No root actions; it only writes that file. Ends when stdin closes or on SIGTERM.
 */
#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>

#define NSLOT 4
#define MAGIC 0x4656474du
#define MAX_W 4096
#define MAX_H 2304
#define MAX_JPEG (16u * 1024u * 1024u)
#define REPEAT_MS 500

/* ------------------------------------------------------------------ JPEG */

typedef struct {
    uint16_t look[512];     /* 9 bits ahead: (length << 8) | symbol, 0 = a longer code */
    int32_t maxcode[18];
    int32_t mincode[17];
    int32_t valptr[17];
    uint8_t vals[256];
    int ok;
} huff_t;

typedef struct {
    const uint8_t *p, *end;
    uint32_t acc;           /* bits, most significant first */
    int n;
} bits_t;

typedef struct {
    int id, h, v, tq, td, ta;
    int pred;
    int stride, rows;       /* decoded plane, whole MCUs */
    uint8_t *buf;
    size_t cap;
} comp_t;

typedef struct {
    uint16_t q[4][64];      /* zigzag order, as stored */
    int qok[4];
    huff_t dc[4], ac[4];
    comp_t c[3];
    int ncomp, w, h, hmax, vmax, mcux, mcuy;
    int restart;
    int sof;
} jpeg_t;

static const uint8_t ZIGZAG[64] = {
     0,  1,  8, 16,  9,  2,  3, 10, 17, 24, 32, 25, 18, 11,  4,  5,
    12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13,  6,  7, 14, 21, 28,
    35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51,
    58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63
};

static const char *jerr = "";

static int build_huff(huff_t *h, const uint8_t *bits, const uint8_t *vals, int nvals)
{
    int len, i, j, k = 0;
    int32_t code = 0;
    memset(h, 0, sizeof *h);
    memcpy(h->vals, vals, (size_t)nvals);
    for (len = 1; len <= 16; len++) {
        h->valptr[len] = k;
        h->mincode[len] = code;
        for (i = 0; i < bits[len - 1]; i++, k++, code++) {
            if (k >= nvals || code >= (1 << len)) return -1;
            if (len <= 9) {
                int base = code << (9 - len);
                for (j = 0; j < (1 << (9 - len)); j++) h->look[base | j] = (uint16_t)((len << 8) | vals[k]);
            }
        }
        h->maxcode[len] = bits[len - 1] ? code - 1 : -1;
        code <<= 1;
    }
    h->maxcode[17] = 0x7fffffff;
    h->ok = 1;
    return 0;
}

static inline void fill(bits_t *b)
{
    while (b->n <= 24) {
        uint32_t c = 0;
        if (b->p < b->end) {
            if (*b->p != 0xFF) c = *b->p++;
            else if (b->p + 1 < b->end && b->p[1] == 0) { c = 0xFF; b->p += 2; }
            /* else a marker: zeros from here, the pointer stays on it */
        }
        b->acc |= c << (24 - b->n);
        b->n += 8;
    }
}

static inline int getbits(bits_t *b, int n)
{
    uint32_t v;
    if (b->n < n) fill(b);
    v = b->acc >> (32 - n);
    b->acc <<= n;
    b->n -= n;
    return (int)v;
}

static inline int decode(bits_t *b, const huff_t *h)
{
    unsigned look;
    int len;
    int32_t code;
    if (b->n < 16) fill(b);
    look = h->look[b->acc >> 23];
    if (look) {
        len = (int)(look >> 8);
        b->acc <<= len;
        b->n -= len;
        return (int)(look & 0xFF);
    }
    for (len = 10; len <= 16; len++) {
        code = (int32_t)(b->acc >> (32 - len));
        if (code <= h->maxcode[len]) break;
    }
    if (len > 16) return -1;
    b->acc <<= len;
    b->n -= len;
    return h->vals[(h->valptr[len] + code - h->mincode[len]) & 0xFF];
}

static inline int extend(int v, int t)
{
    return v < (1 << (t - 1)) ? v - (1 << t) + 1 : v;
}

/* One block: coefficients (dequantised, natural order) into blk (zeroed by the caller).
 * Returns the last coefficient's zigzag index, -1 for a broken stream. */
static inline int decode_block(bits_t *b, const huff_t *dc, const huff_t *ac, const uint16_t *q, int *pred, int *blk)
{
    int t, k, rs, r, s, last = 0;
    t = decode(b, dc);
    if (t < 0 || t > 11) return -1;
    if (t) *pred += extend(getbits(b, t), t);
    blk[0] = *pred * q[0];
    for (k = 1; k < 64;) {
        rs = decode(b, ac);
        if (rs < 0) return -1;
        r = rs >> 4;
        s = rs & 15;
        if (s == 0) {
            if (r == 15) { k += 16; continue; }
            break;
        }
        k += r;
        if (k > 63) return -1;
        blk[ZIGZAG[k]] = extend(getbits(b, s), s) * q[k];
        last = k;
        k++;
    }
    return last;
}

#define CONST_BITS 13
#define PASS1_BITS 2
#define FIX_0_298631336 2446
#define FIX_0_390180644 3196
#define FIX_0_541196100 4433
#define FIX_0_765366865 6270
#define FIX_0_899976223 7373
#define FIX_1_175875602 9633
#define FIX_1_501321110 12299
#define FIX_1_847759065 15137
#define FIX_1_961570560 16069
#define FIX_2_053119869 16819
#define FIX_2_562915447 20995
#define FIX_3_072711026 25172
#define DESCALE(x, n) (((x) + (1 << ((n) - 1))) >> (n))

static inline uint8_t clamp8(int v)
{
    return (uint8_t)(v < 0 ? 0 : (v > 255 ? 255 : v));
}

/* The accurate integer inverse DCT (Loeffler, Ligtenberg, Moschytz), 8x8, to out with stride. */
static void idct(const int *in, uint8_t *out, int stride)
{
    int ws[64];
    int tmp0, tmp1, tmp2, tmp3, tmp10, tmp11, tmp12, tmp13, z1, z2, z3, z4, z5;
    const int *ip = in;
    int *wp = ws;
    int i;
    for (i = 0; i < 8; i++, ip++, wp++) {
        if (!(ip[8] | ip[16] | ip[24] | ip[32] | ip[40] | ip[48] | ip[56])) {
            int dc = ip[0] << PASS1_BITS;
            wp[0] = wp[8] = wp[16] = wp[24] = wp[32] = wp[40] = wp[48] = wp[56] = dc;
            continue;
        }
        z2 = ip[16]; z3 = ip[48];
        z1 = (z2 + z3) * FIX_0_541196100;
        tmp2 = z1 + z3 * (-FIX_1_847759065);
        tmp3 = z1 + z2 * FIX_0_765366865;
        z2 = ip[0]; z3 = ip[32];
        tmp0 = (z2 + z3) << CONST_BITS;
        tmp1 = (z2 - z3) << CONST_BITS;
        tmp10 = tmp0 + tmp3; tmp13 = tmp0 - tmp3;
        tmp11 = tmp1 + tmp2; tmp12 = tmp1 - tmp2;
        tmp0 = ip[56]; tmp1 = ip[40]; tmp2 = ip[24]; tmp3 = ip[8];
        z1 = tmp0 + tmp3; z2 = tmp1 + tmp2; z3 = tmp0 + tmp2; z4 = tmp1 + tmp3;
        z5 = (z3 + z4) * FIX_1_175875602;
        tmp0 *= FIX_0_298631336; tmp1 *= FIX_2_053119869; tmp2 *= FIX_3_072711026; tmp3 *= FIX_1_501321110;
        z1 *= -FIX_0_899976223; z2 *= -FIX_2_562915447; z3 *= -FIX_1_961570560; z4 *= -FIX_0_390180644;
        z3 += z5; z4 += z5;
        tmp0 += z1 + z3; tmp1 += z2 + z4; tmp2 += z2 + z3; tmp3 += z1 + z4;
        wp[0]  = DESCALE(tmp10 + tmp3, CONST_BITS - PASS1_BITS);
        wp[56] = DESCALE(tmp10 - tmp3, CONST_BITS - PASS1_BITS);
        wp[8]  = DESCALE(tmp11 + tmp2, CONST_BITS - PASS1_BITS);
        wp[48] = DESCALE(tmp11 - tmp2, CONST_BITS - PASS1_BITS);
        wp[16] = DESCALE(tmp12 + tmp1, CONST_BITS - PASS1_BITS);
        wp[40] = DESCALE(tmp12 - tmp1, CONST_BITS - PASS1_BITS);
        wp[24] = DESCALE(tmp13 + tmp0, CONST_BITS - PASS1_BITS);
        wp[32] = DESCALE(tmp13 - tmp0, CONST_BITS - PASS1_BITS);
    }
    wp = ws;
    for (i = 0; i < 8; i++, wp += 8, out += stride) {
        z2 = wp[2]; z3 = wp[6];
        z1 = (z2 + z3) * FIX_0_541196100;
        tmp2 = z1 + z3 * (-FIX_1_847759065);
        tmp3 = z1 + z2 * FIX_0_765366865;
        tmp0 = (wp[0] + wp[4]) << CONST_BITS;
        tmp1 = (wp[0] - wp[4]) << CONST_BITS;
        tmp10 = tmp0 + tmp3; tmp13 = tmp0 - tmp3;
        tmp11 = tmp1 + tmp2; tmp12 = tmp1 - tmp2;
        tmp0 = wp[7]; tmp1 = wp[5]; tmp2 = wp[3]; tmp3 = wp[1];
        z1 = tmp0 + tmp3; z2 = tmp1 + tmp2; z3 = tmp0 + tmp2; z4 = tmp1 + tmp3;
        z5 = (z3 + z4) * FIX_1_175875602;
        tmp0 *= FIX_0_298631336; tmp1 *= FIX_2_053119869; tmp2 *= FIX_3_072711026; tmp3 *= FIX_1_501321110;
        z1 *= -FIX_0_899976223; z2 *= -FIX_2_562915447; z3 *= -FIX_1_961570560; z4 *= -FIX_0_390180644;
        z3 += z5; z4 += z5;
        tmp0 += z1 + z3; tmp1 += z2 + z4; tmp2 += z2 + z3; tmp3 += z1 + z4;
        out[0] = clamp8(DESCALE(tmp10 + tmp3, CONST_BITS + PASS1_BITS + 3) + 128);
        out[7] = clamp8(DESCALE(tmp10 - tmp3, CONST_BITS + PASS1_BITS + 3) + 128);
        out[1] = clamp8(DESCALE(tmp11 + tmp2, CONST_BITS + PASS1_BITS + 3) + 128);
        out[6] = clamp8(DESCALE(tmp11 - tmp2, CONST_BITS + PASS1_BITS + 3) + 128);
        out[2] = clamp8(DESCALE(tmp12 + tmp1, CONST_BITS + PASS1_BITS + 3) + 128);
        out[5] = clamp8(DESCALE(tmp12 - tmp1, CONST_BITS + PASS1_BITS + 3) + 128);
        out[3] = clamp8(DESCALE(tmp13 + tmp0, CONST_BITS + PASS1_BITS + 3) + 128);
        out[4] = clamp8(DESCALE(tmp13 - tmp0, CONST_BITS + PASS1_BITS + 3) + 128);
    }
}

static inline void flat8(uint8_t *out, int stride, int dc)
{
    uint8_t v = clamp8(((dc + 4) >> 3) + 128);
    int i;
    for (i = 0; i < 8; i++, out += stride) memset(out, v, 8);
}

static int scan(jpeg_t *j, const uint8_t *p, const uint8_t *end)
{
    bits_t b;
    int blk[64];
    int mx, my, ci, bx, by, last, todo;
    comp_t *c;
    b.p = p; b.end = end; b.acc = 0; b.n = 0;
    for (ci = 0; ci < j->ncomp; ci++) j->c[ci].pred = 0;
    todo = j->restart;
    for (my = 0; my < j->mcuy; my++) {
        for (mx = 0; mx < j->mcux; mx++) {
            if (j->restart && todo == 0) {
                b.acc = 0; b.n = 0;
                if (b.p + 1 < b.end && b.p[0] == 0xFF && b.p[1] >= 0xD0 && b.p[1] <= 0xD7) b.p += 2;
                else { jerr = "restart marker missing"; return -1; }
                for (ci = 0; ci < j->ncomp; ci++) j->c[ci].pred = 0;
                todo = j->restart;
            }
            for (ci = 0; ci < j->ncomp; ci++) {
                c = &j->c[ci];
                for (by = 0; by < c->v; by++) {
                    for (bx = 0; bx < c->h; bx++) {
                        uint8_t *out = c->buf + (size_t)(my * c->v + by) * 8 * (size_t)c->stride + (size_t)(mx * c->h + bx) * 8;
                        memset(blk, 0, sizeof blk);
                        last = decode_block(&b, &j->dc[c->td], &j->ac[c->ta], j->q[c->tq], &c->pred, blk);
                        if (last < 0) { jerr = "broken entropy data"; return -1; }
                        if (last == 0) flat8(out, c->stride, blk[0]);
                        else idct(blk, out, c->stride);
                    }
                }
            }
            if (j->restart) todo--;
        }
    }
    return 0;
}

static inline int be16(const uint8_t *p) { return (p[0] << 8) | p[1]; }

/* Decodes one JPEG into j->c[].buf (whole MCUs). 0 = done. */
static int jpeg_decode(jpeg_t *j, const uint8_t *d, size_t n)
{
    const uint8_t *p = d, *end = d + n;
    int i, len, m;
    j->sof = 0; j->restart = 0;
    if (n < 4 || p[0] != 0xFF || p[1] != 0xD8) { jerr = "not a JPEG"; return -1; }
    p += 2;
    while (p + 4 <= end) {
        if (p[0] != 0xFF) { jerr = "marker expected"; return -1; }
        m = p[1];
        if (m == 0xFF) { p++; continue; }
        p += 2;
        if (m == 0xD9) break;
        if (m >= 0xD0 && m <= 0xD7) continue;
        if (p + 2 > end) break;
        len = be16(p);
        if (len < 2 || p + len > end) { jerr = "segment past the end"; return -1; }
        if (m == 0xDB) {
            const uint8_t *s = p + 2, *se = p + len;
            while (s < se) {
                int pq = s[0] >> 4, tq = s[0] & 15;
                if (tq > 3 || pq > 1 || s + 1 + 64 * (pq + 1) > se) { jerr = "bad DQT"; return -1; }
                s++;
                for (i = 0; i < 64; i++) { j->q[tq][i] = (uint16_t)(pq ? be16(s) : s[0]); s += pq + 1; }
                j->qok[tq] = 1;
            }
        } else if (m == 0xC4) {
            const uint8_t *s = p + 2, *se = p + len;
            while (s < se) {
                int tc = s[0] >> 4, th = s[0] & 15, total = 0;
                if (tc > 1 || th > 3 || s + 17 > se) { jerr = "bad DHT"; return -1; }
                for (i = 0; i < 16; i++) total += s[1 + i];
                if (total > 256 || s + 17 + total > se) { jerr = "bad DHT"; return -1; }
                if (build_huff(tc ? &j->ac[th] : &j->dc[th], s + 1, s + 17, total) != 0) { jerr = "bad Huffman table"; return -1; }
                s += 17 + total;
            }
        } else if (m == 0xC0 || m == 0xC1) {
            if (len < 8 || p[2] != 8) { jerr = "only 8-bit JPEG"; return -1; }
            j->h = be16(p + 3); j->w = be16(p + 5); j->ncomp = p[7];
            if (j->w < 2 || j->h < 2 || j->w > MAX_W || j->h > MAX_H) { jerr = "size out of range"; return -1; }
            if ((j->ncomp != 1 && j->ncomp != 3) || len < 8 + 3 * j->ncomp) { jerr = "1 or 3 components only"; return -1; }
            j->hmax = j->vmax = 1;
            for (i = 0; i < j->ncomp; i++) {
                comp_t *c = &j->c[i];
                c->id = p[8 + 3 * i]; c->h = p[9 + 3 * i] >> 4; c->v = p[9 + 3 * i] & 15; c->tq = p[10 + 3 * i];
                if (j->ncomp == 1) c->h = c->v = 1;
                if (c->h < 1 || c->h > 2 || c->v < 1 || c->v > 2 || c->tq > 3) { jerr = "sampling not supported"; return -1; }
                if (c->h > j->hmax) j->hmax = c->h;
                if (c->v > j->vmax) j->vmax = c->v;
            }
            if (j->ncomp == 3 && (j->c[0].h != j->hmax || j->c[0].v != j->vmax || j->c[1].h != 1 || j->c[1].v != 1 || j->c[2].h != 1 || j->c[2].v != 1)) {
                jerr = "sampling not supported"; return -1;
            }
            j->mcux = (j->w + 8 * j->hmax - 1) / (8 * j->hmax);
            j->mcuy = (j->h + 8 * j->vmax - 1) / (8 * j->vmax);
            for (i = 0; i < j->ncomp; i++) {
                comp_t *c = &j->c[i];
                size_t need;
                c->stride = j->mcux * c->h * 8; c->rows = j->mcuy * c->v * 8;
                need = (size_t)c->stride * (size_t)c->rows;
                if (need > c->cap) {
                    uint8_t *nb = realloc(c->buf, need);
                    if (!nb) { jerr = "no memory"; return -1; }
                    c->buf = nb; c->cap = need;
                }
            }
            j->sof = 1;
        } else if (m == 0xC2 || (m >= 0xC5 && m <= 0xCF && m != 0xC8 && m != 0xCC)) {
            jerr = "progressive or arithmetic JPEG"; return -1;
        } else if (m == 0xDD) {
            if (len < 4) { jerr = "bad DRI"; return -1; }
            j->restart = be16(p + 2);
        } else if (m == 0xDA) {
            int ns;
            if (!j->sof) { jerr = "scan before frame header"; return -1; }
            ns = p[2];
            if (ns != j->ncomp || len < 6 + 2 * ns) { jerr = "scan layout not supported"; return -1; }
            for (i = 0; i < ns; i++) {
                comp_t *c = &j->c[i];
                if (p[3 + 2 * i] != c->id) { jerr = "scan layout not supported"; return -1; }
                c->td = p[4 + 2 * i] >> 4; c->ta = p[4 + 2 * i] & 15;
                if (c->td > 3 || c->ta > 3 || !j->dc[c->td].ok || !j->ac[c->ta].ok || !j->qok[c->tq]) { jerr = "table missing"; return -1; }
            }
            return scan(j, p + len, end);
        }
        p += len;
    }
    jerr = "no picture data";
    return -1;
}

/* ------------------------------------------------------------------ colour + ring */

enum { COL_601, COL_709, COL_FULL };
static int colour = COL_601;
static uint8_t lut_y[256], lut_c[256];
static int32_t y_cb[256], y_cr[256], u_cb[256], u_cr[256], v_cb[256], v_cr[256];

static void make_luts(void)
{
    int i;
    for (i = 0; i < 256; i++) {
        double c = i - 128;
        if (colour == COL_FULL) { lut_y[i] = (uint8_t)i; lut_c[i] = (uint8_t)i; }
        else {
            lut_y[i] = (uint8_t)(16 + (i * 219 + 127) / 255);
            lut_c[i] = clamp8((int)(128.5 + c * 224.0 / 255.0));
        }
        /* BT.601 -> BT.709 (both full range), then the limited-range scale; 16.16 fixed point */
        y_cb[i] = (int32_t)(-0.118188 * c * (219.0 / 255.0) * 65536.0);
        y_cr[i] = (int32_t)(-0.212685 * c * (219.0 / 255.0) * 65536.0);
        u_cb[i] = (int32_t)(1.018640 * c * (224.0 / 255.0) * 65536.0);
        u_cr[i] = (int32_t)(0.114618 * c * (224.0 / 255.0) * 65536.0);
        v_cb[i] = (int32_t)(0.075049 * c * (224.0 / 255.0) * 65536.0);
        v_cr[i] = (int32_t)(1.025327 * c * (224.0 / 255.0) * 65536.0);
    }
}

static const char *ring_path = "";
static int ring_fd = -1, ring_w = 0, ring_h = 0;
static uint32_t seq = 0, slot = 0;
static uint8_t *frame_buf = NULL;
static size_t frame_cap = 0;
static int have_frame = 0;
static volatile sig_atomic_t stop_now = 0;

static void put32(uint8_t *p, uint32_t v) { p[0] = (uint8_t)v; p[1] = (uint8_t)(v >> 8); p[2] = (uint8_t)(v >> 16); p[3] = (uint8_t)(v >> 24); }

static int write_all(int fd, const uint8_t *buf, size_t len, off_t at)
{
    while (len) {
        ssize_t n = pwrite(fd, buf, len, at);
        if (n < 0) { if (errno == EINTR) continue; return -1; }
        buf += n; len -= (size_t)n; at += n;
    }
    return 0;
}

static int open_ring(int w, int h)
{
    char tmp[512];
    uint8_t head[64];
    size_t frame = (size_t)w * (size_t)h * 3 / 2, size = 64 + NSLOT * frame;
    struct stat st;
    int fd;
    if (snprintf(tmp, sizeof tmp, "%s.ring", ring_path) >= (int)sizeof tmp) return -1;
    fd = open(tmp, O_RDWR | O_CREAT | O_TRUNC | O_CLOEXEC, 0644);
    if (fd < 0) return -1;
    if (ftruncate(fd, (off_t)size) != 0) { close(fd); unlink(tmp); return -1; }
    memset(head, 0, sizeof head);
    put32(head, MAGIC); put32(head + 4, 1); put32(head + 8, (uint32_t)w); put32(head + 12, (uint32_t)h);
    put32(head + 24, NSLOT); put32(head + 28, 1); put32(head + 32, 1);
    if (write_all(fd, head, sizeof head, 0) != 0) { close(fd); unlink(tmp); return -1; }
    fchmod(fd, 0644);
    if (rename(tmp, ring_path) != 0) { close(fd); unlink(tmp); return -1; }
    if (ring_fd >= 0) close(ring_fd);
    ring_fd = fd; ring_w = w; ring_h = h; seq = 0; slot = 0;
    printf("ring %d %d %lu\n", w, h, fstat(fd, &st) == 0 ? (unsigned long)st.st_ino : 0ul);
    return 0;
}

static int publish(void)
{
    uint8_t word[4];
    size_t frame = (size_t)ring_w * (size_t)ring_h * 3 / 2;
    slot = (slot + 1) % NSLOT;
    if (write_all(ring_fd, frame_buf, frame, 64 + (off_t)slot * (off_t)frame) != 0) return -1;
    put32(word, slot);
    write_all(ring_fd, word, 4, 20);
    seq++;
    put32(word, seq);
    write_all(ring_fd, word, 4, 16);
    return 0;
}

/* The decoded planes into one I420 frame (even size), in the chosen colour form. */
static int to_frame(const jpeg_t *j)
{
    int w = j->w & ~1, h = j->h & ~1, cw = w / 2, ch = h / 2, x, y;
    size_t need = (size_t)w * (size_t)h * 3 / 2;
    uint8_t *Y, *U, *V;
    const comp_t *c0 = &j->c[0];
    if (need > frame_cap) {
        uint8_t *nb = realloc(frame_buf, need);
        if (!nb) return -1;
        frame_buf = nb; frame_cap = need;
    }
    Y = frame_buf; U = Y + (size_t)w * h; V = U + (size_t)cw * ch;
    for (y = 0; y < h; y++) {
        const uint8_t *s = c0->buf + (size_t)y * c0->stride;
        uint8_t *d = Y + (size_t)y * w;
        if (colour == COL_FULL) memcpy(d, s, (size_t)w);
        else for (x = 0; x < w; x++) d[x] = lut_y[s[x]];
    }
    if (j->ncomp == 1) { memset(U, 128, (size_t)cw * ch * 2); return w != ring_w || h != ring_h; }
    for (y = 0; y < ch; y++) {
        uint8_t *du = U + (size_t)y * cw, *dv = V + (size_t)y * cw;
        const comp_t *cb = &j->c[1], *cr = &j->c[2];
        /* chroma planes are (w / hmax) x (h / vmax): bring them to w/2 x h/2 */
        int sy0 = j->vmax == 2 ? y : 2 * y, sy1 = j->vmax == 2 ? y : 2 * y + 1;
        const uint8_t *b0 = cb->buf + (size_t)sy0 * cb->stride, *b1 = cb->buf + (size_t)sy1 * cb->stride;
        const uint8_t *r0 = cr->buf + (size_t)sy0 * cr->stride, *r1 = cr->buf + (size_t)sy1 * cr->stride;
        for (x = 0; x < cw; x++) {
            int ub, vr;
            if (j->hmax == 2) { ub = (b0[x] + b1[x] + 1) >> 1; vr = (r0[x] + r1[x] + 1) >> 1; }
            else { ub = (b0[2 * x] + b0[2 * x + 1] + b1[2 * x] + b1[2 * x + 1] + 2) >> 2; vr = (r0[2 * x] + r0[2 * x + 1] + r1[2 * x] + r1[2 * x + 1] + 2) >> 2; }
            if (colour == COL_709) {
                int dy = (y_cb[ub] + y_cr[vr] + 32768) >> 16;
                uint8_t *p0 = Y + (size_t)(2 * y) * w + 2 * x, *p1 = p0 + w;
                int v;
                if (dy) {
                    v = p0[0] + dy; p0[0] = (uint8_t)(v < 16 ? 16 : (v > 235 ? 235 : v));
                    v = p0[1] + dy; p0[1] = (uint8_t)(v < 16 ? 16 : (v > 235 ? 235 : v));
                    v = p1[0] + dy; p1[0] = (uint8_t)(v < 16 ? 16 : (v > 235 ? 235 : v));
                    v = p1[1] + dy; p1[1] = (uint8_t)(v < 16 ? 16 : (v > 235 ? 235 : v));
                }
                v = 128 + ((u_cb[ub] + u_cr[vr] + 32768) >> 16); du[x] = (uint8_t)(v < 16 ? 16 : (v > 240 ? 240 : v));
                v = 128 + ((v_cb[ub] + v_cr[vr] + 32768) >> 16); dv[x] = (uint8_t)(v < 16 ? 16 : (v > 240 ? 240 : v));
            } else {
                du[x] = lut_c[ub];
                dv[x] = lut_c[vr];
            }
        }
    }
    return w != ring_w || h != ring_h;
}

static int read_all(int fd, uint8_t *buf, size_t len)
{
    while (len) {
        ssize_t n = read(fd, buf, len);
        if (n == 0) return 1;
        if (n < 0) { if (errno == EINTR) { if (stop_now) return 1; continue; } return -1; }
        buf += n; len -= (size_t)n;
    }
    return 0;
}

static void on_term(int sig) { (void)sig; stop_now = 1; }

static long long now_us(void)
{
    struct timespec t;
    clock_gettime(CLOCK_MONOTONIC, &t);
    return (long long)t.tv_sec * 1000000LL + t.tv_nsec / 1000;
}

int main(int argc, char **argv)
{
    static jpeg_t j;
    uint8_t *in = NULL, lenb[4];
    size_t in_cap = 0;
    struct sigaction sa;
    if (argc < 2) { fprintf(stderr, "usage: g21-webframe <video file> [601|709|full]\n"); return 2; }
    ring_path = argv[1];
    if (argc > 2 && strcmp(argv[2], "709") == 0) colour = COL_709;
    else if (argc > 2 && strcmp(argv[2], "full") == 0) colour = COL_FULL;
    make_luts();
    memset(&sa, 0, sizeof sa);
    sa.sa_handler = on_term;
    sigaction(SIGTERM, &sa, NULL);
    sigaction(SIGINT, &sa, NULL);
    signal(SIGPIPE, SIG_IGN);
    setvbuf(stdout, NULL, _IOLBF, 0);
    while (!stop_now) {
        struct pollfd pf = { 0, POLLIN, 0 };
        uint32_t n;
        long long t0;
        int r = poll(&pf, 1, REPEAT_MS);
        if (r < 0) { if (errno == EINTR) continue; break; }
        if (r == 0) {
            if (have_frame && ring_fd >= 0) publish();
            continue;
        }
        r = read_all(0, lenb, 4);
        if (r) break;
        n = (uint32_t)lenb[0] | ((uint32_t)lenb[1] << 8) | ((uint32_t)lenb[2] << 16) | ((uint32_t)lenb[3] << 24);
        if (n == 0 || n > MAX_JPEG) { printf("e frame length %u\n", n); break; }
        if (n > in_cap) {
            uint8_t *nb = realloc(in, n);
            if (!nb) { printf("e no memory\n"); break; }
            in = nb; in_cap = n;
        }
        if (read_all(0, in, n)) break;
        t0 = now_us();
        if (jpeg_decode(&j, in, n) != 0) { printf("e %s\n", jerr); continue; }
        r = to_frame(&j);
        if (r < 0) { printf("e no memory\n"); continue; }
        if (r > 0 || ring_fd < 0) {
            if (open_ring(j.w & ~1, j.h & ~1) != 0) { printf("e video file: %s\n", strerror(errno)); continue; }
        }
        if (publish() != 0) { printf("e video file: %s\n", strerror(errno)); continue; }
        have_frame = 1;
        printf("f %u %lld\n", seq, now_us() - t0);
    }
    return 0;
}
