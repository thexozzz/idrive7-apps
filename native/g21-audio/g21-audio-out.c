// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * g21-audio-out - G21 Audio's PCM writer for the head unit's speakers.
 *
 *   g21-audio-out play DEVICE                      S16LE, 48 kHz, stereo from stdin into an ALSA device
 *   g21-audio-out tone DEVICE SECONDS [AMPLITUDE]  a quiet 440 Hz tone (faded in and out): the audible test
 *
 * On the car DEVICE is plug:smartx:<source>_CF_48_STEREO (SmartXbar's ALSA plugin), e.g.
 * plug:smartx:CarLifeMedia_CF_48_STEREO. Who hears it is the AudioManager's business (g21-audiod.js claims
 * the speakers for the source); this program only writes.
 *
 * play: stdin is a pipe or a FIFO that a player writes in real time. The program waits for the first sound,
 * says "[G21-AUDIO] out: active" on stderr, opens the device and writes one 10 ms chunk every 10 ms of the
 * clock (so the player is held to real time through the pipe whether or not anyone hears it). After 3 s
 * without sound it says "[G21-AUDIO] out: idle" and exits: its owner starts a fresh one for the next sound.
 * It leaves by _exit: snd_pcm_close on a SmartX stream did not return on the car (2026-11-15).
 *
 * The way of writing is the one Moonride's native/mgu-moonlight/src/audio.cpp measured on the car
 * (Copyright (C) 2026 JustAnotherPU, GPL-3.0-or-later): the system's libasound.so.2 is dlopen'd, the device is
 * opened non-blocking (a source nobody is connected to must never park the writer), smartx imposes
 * 1024-frame periods x 3 = 64 ms, and what does not fit is dropped, never queued: old sound is worth nothing.
 *
 * Built against the head unit's generation of glibc (Ubuntu 18.04) with the head unit's loader path, it runs
 * on the system's loader and libraries; nothing of BMW's is copied. The lock SmartX makes for a stream must
 * stay usable for the other audio clients (group mgu_alsa, 0660): umask 0007 before the device is opened.
 *
 * Lines on stderr start with [G21-AUDIO].
 */
#define _GNU_SOURCE
#include <dlfcn.h>
#include <errno.h>
#include <fcntl.h>
#include <math.h>
#include <poll.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>

typedef struct snd_pcm snd_pcm_t;
static struct {
    int (*open)(snd_pcm_t **, const char *, int, int);
    int (*set_params)(snd_pcm_t *, int, int, unsigned, unsigned, int, unsigned);
    long (*writei)(snd_pcm_t *, const void *, unsigned long);
    int (*recover)(snd_pcm_t *, int, int);
    int (*delay)(snd_pcm_t *, long *);
    long (*avail)(snd_pcm_t *);   /* optional */
    const char *(*strerror)(int);
} A;
enum { PLAYBACK = 0, NONBLOCK = 1, S16_LE = 2, RW_INTERLEAVED = 3 };
#define RATE 48000
#define CH 2
#define CHUNK 480      /* frames: 10 ms */
#define PREFILL 8      /* the most chunks gathered before the first one is played, and again after an underrun */
#define IDLE_MS 3000   /* this long without sound: the speakers go back */

static volatile sig_atomic_t stopping;
static void on_stop(int s) { (void)s; stopping = 1; }
static double mono_ms(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return t.tv_sec * 1000.0 + t.tv_nsec / 1e6; }
static unsigned buffer_us(void) { const char *e = getenv("G21_AUDIO_US"); long v = e ? atol(e) : 0; return v >= 20000 && v <= 500000 ? (unsigned)v : 250000; }
static void leave(int code) { fflush(stderr); _exit(code); }

static int alsa_load(void)
{
    void *h = dlopen("libasound.so.2", RTLD_NOW);
    if (!h) { fprintf(stderr, "[G21-AUDIO] out: libasound.so.2: %s\n", dlerror()); return 0; }
#define SYM(f, n) ((A.f = dlsym(h, n)) != NULL)
    if (SYM(open, "snd_pcm_open") && SYM(set_params, "snd_pcm_set_params") && SYM(writei, "snd_pcm_writei") &&
        SYM(recover, "snd_pcm_recover") && SYM(delay, "snd_pcm_delay") && SYM(strerror, "snd_strerror")) { A.avail = dlsym(h, "snd_pcm_avail_update"); return 1; }
#undef SYM
    fprintf(stderr, "[G21-AUDIO] out: libasound.so.2 lacks a function\n");
    return 0;
}
static snd_pcm_t *dev_open(const char *dev)
{
    snd_pcm_t *pcm = NULL;
    int rc;
    umask(0007);
    rc = A.open(&pcm, dev, PLAYBACK, NONBLOCK);
    if (rc < 0) { fprintf(stderr, "[G21-AUDIO] out: open %s: %s\n", dev, A.strerror(rc)); return NULL; }
    rc = A.set_params(pcm, S16_LE, RW_INTERLEAVED, CH, RATE, 1, buffer_us());
    if (rc < 0) { fprintf(stderr, "[G21-AUDIO] out: set_params %s: %s\n", dev, A.strerror(rc)); return NULL; }
    fprintf(stderr, "[G21-AUDIO] out: open %s, S16LE %d Hz %d ch, buffer %u us\n", dev, RATE, CH, buffer_us());
    return pcm;
}

/* one chunk from stdin; 1 = got it, 0 = nothing for IDLE_MS (or the end), -1 = stopping */
static int read_chunk(int16_t *buf, int wait_ms)
{
    size_t got = 0;
    const size_t want = CHUNK * CH * sizeof(int16_t);
    while (got < want) {
        struct pollfd p = { 0, POLLIN, 0 };
        int r = poll(&p, 1, wait_ms);
        ssize_t n;
        if (stopping) return -1;
        if (r == 0) return 0;
        if (r < 0) { if (errno == EINTR) continue; return 0; }
        n = read(0, (char *)buf + got, want - got);
        if (n == 0) return 0;
        if (n < 0) { if (errno == EINTR || errno == EAGAIN) continue; return 0; }
        got += (size_t)n;
    }
    return 1;
}

/*
 * One chunk to the device, all of it. A device that is full is waited for, never skipped: SmartX holds 64 ms
 * (3072 frames) whatever is asked, and sound that came in a burst (the head unit busy with a large picture) was
 * thrown away while it was full: a quarter of an AirPlay session, which is the stutter heard (car, 2026-11-15:
 * frames 4310592 dropped 1461888, full 3045, xruns 0). Waiting holds the player back through the pipe instead.
 * 1: the device ran empty (the caller gathers a cushion again); 0 otherwise.
 */
static int write_chunk(snd_pcm_t *pcm, const int16_t *b, unsigned long *frames, unsigned long *dropped, unsigned long *full, unsigned long *xruns)
{
    int off = 0, waited = 0;
    while (off < CHUNK) {
        long w = A.writei(pcm, b + off * CH, (unsigned long)(CHUNK - off));
        if (w == -EAGAIN || w == 0) {
            if (stopping) return 0;
            if (waited >= 400) { *dropped += (unsigned long)(CHUNK - off); (*full)++; return 0; }   /* a device that takes nothing */
            usleep(2000);
            waited += 2;
            continue;
        }
        if (w < 0) { (*xruns)++; A.recover(pcm, (int)w, 1); *dropped += (unsigned long)(CHUNK - off); return 1; }
        off += (int)w;
        *frames += (unsigned long)w;
    }
    return 0;
}

static int play(const char *dev)
{
    static int16_t buf[CHUNK * CH];
    static int16_t pre[PREFILL][CHUNK * CH];
    int need = 1, cushion = 4;
    snd_pcm_t *pcm;
    unsigned long frames = 0, dropped = 0, xruns = 0, full = 0;
    double report;
    long d = 0;
    int r;
    /* a short pipe: what waits in it is delay between the picture and the sound (16 KiB = 85 ms) */
    fcntl(0, F_SETPIPE_SZ, 16384);
    fprintf(stderr, "[G21-AUDIO] out: waiting for sound\n");
    while ((r = read_chunk(buf, 1000)) == 0) { if (stopping) leave(0); }
    if (r < 0) leave(0);
    fprintf(stderr, "[G21-AUDIO] out: active\n");
    pcm = dev_open(dev);
    if (!pcm) leave(1);
    /* the cushion: what the device really holds, less two chunks of room (SmartX: 3072 frames -> 4 chunks, 40 ms) */
    if (A.avail) {
        long room = A.avail(pcm);
        if (room >= 3 * CHUNK) { cushion = (int)(room / CHUNK) - 2; if (cushion > PREFILL) cushion = PREFILL; if (cushion < 1) cushion = 1; }
        fprintf(stderr, "[G21-AUDIO] out: device holds %ld frames, cushion %d ms\n", room, cushion * 10);
    }
    report = mono_ms() + 5000;
    for (;;) {
        double now;
        if (need) {
            /*
             * A cushion. A player that sends its sound in step with the clock (AirPlay) has nothing ahead: played
             * chunk by chunk as it comes, every late chunk empties the device and the speakers buzz. So some
             * chunks are gathered first and played together; the device then holds that much ahead. The same
             * again after it ran empty. Nothing paces the writing but the device itself: it takes a chunk when
             * it has room, and a player that is ahead waits in the pipe.
             */
            int n = 1, i, got = 1;
            memcpy(pre[0], buf, sizeof buf);
            while (n < cushion && (got = read_chunk(pre[n], 200)) > 0) n++;
            if (got < 0) { r = -1; break; }
            for (i = 0; i < n; i++) write_chunk(pcm, pre[i], &frames, &dropped, &full, &xruns);
            need = 0;
        } else {
            need = write_chunk(pcm, buf, &frames, &dropped, &full, &xruns);
        }
        now = mono_ms();
        if (now >= report) {
            report = now + 5000;
            if (A.delay(pcm, &d) < 0) d = 0;
            fprintf(stderr, "[G21-AUDIO] out: frames %lu dropped %lu (full %lu) xruns %lu delay_ms %ld\n", frames, dropped, full, xruns, d * 1000 / RATE);
        }
        r = read_chunk(buf, IDLE_MS);
        if (r <= 0) break;
    }
    fprintf(stderr, "[G21-AUDIO] out: %s, frames %lu dropped %lu (full %lu) xruns %lu\n", r < 0 ? "stopped" : "idle", frames, dropped, full, xruns);
    leave(0);
    return 0;
}

/*
 * The writer, for every player. Measured on the car (2026-11-15, "probe", silence written four ways: through
 * "plug:" 480 and 1024 frames a write, the device itself, blocking): the speakers' device takes 36 000 frames a
 * second whichever way it is written to, though its name says 48. What is written as 48 kHz sound therefore lasts a
 * third longer than it should. Seen from the players: AirPlay gives 48 000 a second and a quarter had to be thrown
 * away (cuts); the browser's engine, which keeps a film's time by the sound it has written, ran its films at three
 * quarters of their speed.
 * So the sound is fitted to the device: a store of what came, and from it frames are made at the device's pace
 * (straight-line interpolation), about 4 frames in for 3 out. How many exactly is not fixed: the step follows how
 * full the store is (more waits than wanted: a little faster through it), so a device that takes another number of
 * frames, or a phone whose clock is a little off, is followed too.
 *   live (AirPlay): the pipe is emptied at once, always. UxPlay's own pipeline has a queue of 8 buffers that
 *     leaks: whenever it was held, sound was lost there.
 *   otherwise (the browser, a film): the pipe is read at the pace of the clock, 48 000 frames a second, and what
 *     is not read yet holds the player. The browser's engine has no clock of its own for its sound; unheld it
 *     wrote 49 times faster than time passes.
 * Playing begins when 180 ms have gathered, again after the store ran dry; more than 600 ms waiting is cut back.
 */
#define RING (RATE * 2)
#define LIVE_TARGET (RATE * 180 / 1000)
#define LIVE_MAX (RATE * 600 / 1000)
static int engine(const char *dev, int greedy)
{
    static int16_t ring[RING * CH];
    static int16_t one[CHUNK * CH];
    static char in[16384];
    const size_t fb = CH * sizeof(int16_t);
    size_t part = 0;                      /* bytes of a frame that has not come whole yet */
    unsigned long head = 0, fill = 0;     /* frames of the store: the first that waits, how many wait */
    unsigned long taken = 0, frames = 0, skipped = 0, xruns = 0, gaps = 0;
    unsigned made = 0, sent = 0;          /* frames in `one`: made, and given to the device already */
    double phase = 0.0;                   /* where the next frame out lies between ring[head] and ring[head + 1] */
    /* Frames in for one frame out. 0.1.9 had 48000 / 36000 here and a step that followed the store: the device took
     * the fitted frames and played them at 48 kHz, a third too high and too fast, with pauses (car, 2026-11-15).
     * So the device does play at 48 kHz and simply takes only three quarters of the time; nothing written here
     * mends that. One for one again. */
    double step = 1.0;
    double integ = 0.0, budget = 0.0;
    snd_pcm_t *pcm = NULL;
    int playing = 0;
    double last_in = mono_ms(), last = mono_ms(), report = 0, now;
    long d = 0;
    fcntl(0, F_SETFL, fcntl(0, F_GETFL) | O_NONBLOCK);
    if (!greedy) fcntl(0, F_SETPIPE_SZ, 16384);   /* a short pipe: what waits in it is delay (16 KiB = 85 ms) */
    fprintf(stderr, "[G21-AUDIO] out: waiting for sound\n");
    for (;;) {
        struct pollfd p = { 0, POLLIN, 0 };
        int got = 0;
        if (stopping) break;
        if (poll(&p, 1, pcm ? 4 : 1000) < 0 && errno != EINTR) break;
        now = mono_ms();
        /* how much may be read: all of it (live), or what the clock allows since the last look */
        budget += (now - last) * RATE / 1000.0;
        if (budget > RATE / 10) budget = RATE / 10;      /* no catching up after a pause */
        last = now;
        for (;;) {
            size_t want = sizeof in - part, bytes, whole, i;
            ssize_t n;
            if (!greedy) {
                size_t may = budget >= 1.0 ? (size_t)budget * fb : 0;
                if (may < fb) break;
                if (want > may) want = may;
            }
            n = read(0, in + part, want);
            if (n <= 0) break;            /* nothing waits (or the pipe's other end is closed for now) */
            got = 1;
            bytes = part + (size_t)n;
            whole = bytes / fb;
            for (i = 0; i < whole; i++) {
                if (fill == RING) { head = (head + 1) % RING; fill--; skipped++; }
                memcpy(&ring[((head + fill) % RING) * CH], in + i * fb, fb);
                fill++;
            }
            taken += whole;
            budget -= (double)whole;
            part = bytes - whole * fb;
            if (part) memmove(in, in + whole * fb, part);
        }
        if (got) last_in = now;
        if (!pcm) {
            if (!fill) { budget = 0.0; continue; }
            fprintf(stderr, "[G21-AUDIO] out: active\n");
            pcm = dev_open(dev);
            if (!pcm) leave(1);
            fprintf(stderr, "[G21-AUDIO] out: %s, fitted to the device's pace: plays from 180 ms gathered, at most 600 ms behind\n", greedy ? "live" : "held to the clock");
            report = now + 5000;
            last = mono_ms();
            budget = 0.0;
        }
        if (fill > LIVE_MAX) { const unsigned long cut = fill - LIVE_TARGET; head = (head + cut) % RING; fill -= cut; skipped += cut; }
        if (!playing && fill >= LIVE_TARGET) { playing = 1; phase = 0.0; }
        while (playing) {
            long w;
            if (sent == made) {
                /* the next frames out, as many as the store has for: each lies between two that came in */
                double err = ((double)fill - (double)LIVE_TARGET) / (double)RATE;     /* seconds too much in the store */
                double s;
                integ += err * 0.0002;   /* slowly: a few hundred looks a second */
                if (integ > 0.4) integ = 0.4;
                if (integ < -0.4) integ = -0.4;
                s = step;       /* (not fitted: see above) */
                made = sent = 0;
                while (made < CHUNK && fill >= 2) {
                    const int16_t *a = &ring[head * CH], *b = &ring[((head + 1) % RING) * CH];
                    int c;
                    for (c = 0; c < CH; c++) one[made * CH + c] = (int16_t)((double)a[c] + ((double)b[c] - (double)a[c]) * phase);
                    made++;
                    phase += s;
                    while (phase >= 1.0 && fill >= 2) { phase -= 1.0; head = (head + 1) % RING; fill--; }
                    if (phase >= 1.0) break;       /* the store has no more for now */
                }
                if (!made) break;
            }
            w = A.writei(pcm, one + sent * CH, (unsigned long)(made - sent));
            if (w == -EAGAIN || w == 0) break;                 /* the device is full: when it has room */
            if (w < 0) { xruns++; A.recover(pcm, (int)w, 1); playing = 0; made = sent = 0; break; }
            sent += (unsigned)w;
            frames += (unsigned long)w;
        }
        if (playing && fill < 2 && sent == made) { playing = 0; gaps++; }    /* ran dry: gathered again before it goes on */
        if (now >= report) {
            report = now + 5000;
            if (A.delay(pcm, &d) < 0) d = 0;
            fprintf(stderr, "[G21-AUDIO] out: frames %lu dropped %lu (full 0) xruns %lu delay_ms %ld waiting_ms %lu gaps %lu taken %lu step %.4f\n",
                frames, skipped, xruns, d * 1000 / 36000, fill * 1000 / RATE, gaps, taken, step + integ);
        }
        if (now - last_in > IDLE_MS && fill < 2) break;
    }
    fprintf(stderr, "[G21-AUDIO] out: %s, frames %lu dropped %lu (full 0) xruns %lu gaps %lu taken %lu\n", stopping ? "stopped" : "idle", frames, skipped, xruns, gaps, taken);
    leave(0);
    return 0;
}

/*
 * probe DEVICE MODE: how many frames a second the device really takes, written in one of several ways. Silence only
 * (zeros): nothing is heard. Car, 2026-11-15: the live writer above was given 48 000 frames a second and the device
 * took exactly 36 000 of them, three reports in a row; the question is whether another way of writing gets all.
 *   plug480    through "plug:", 480 frames a write, not blocking (what the writers above do)
 *   plug1024   through "plug:", one period (1024 frames) a write, not blocking
 *   raw1024    the device itself (without "plug:"), 1024 frames a write, not blocking
 *   block1024  through "plug:", 1024 frames a write, blocking
 * One mode a run (a second open of the same stream in one process is not safe here). The first second is left out
 * of the rate: it is the buffer being filled.
 */
static int probe(const char *dev, const char *mode)
{
    static int16_t zero[1024 * CH];
    const int blocking = !strcmp(mode, "block1024");
    const int chunk = !strcmp(mode, "plug480") ? 480 : 1024;
    const char *name = !strcmp(mode, "raw1024") && !strncmp(dev, "plug:", 5) ? dev + 5 : dev;
    snd_pcm_t *pcm = NULL;
    unsigned long frames = 0, at1 = 0, refused = 0, errors = 0;
    double t0, t, mark = 0;
    int rc;
    umask(0007);
    rc = A.open(&pcm, name, PLAYBACK, blocking ? 0 : NONBLOCK);
    if (rc < 0) { fprintf(stderr, "[G21-AUDIO] out: probe %s: open %s: %s\n", mode, name, A.strerror(rc)); leave(1); }
    rc = A.set_params(pcm, S16_LE, RW_INTERLEAVED, CH, RATE, 1, buffer_us());
    if (rc < 0) { fprintf(stderr, "[G21-AUDIO] out: probe %s: set_params %s: %s\n", mode, name, A.strerror(rc)); leave(1); }
    t0 = mono_ms();
    while ((t = mono_ms()) - t0 < 6000 && !stopping) {
        long w;
        if (!mark && t - t0 >= 1000) { mark = t; at1 = frames; }
        w = A.writei(pcm, zero, (unsigned long)chunk);
        if (w == -EAGAIN || w == 0) { refused++; usleep(1000); continue; }
        if (w < 0) { errors++; A.recover(pcm, (int)w, 1); continue; }
        frames += (unsigned long)w;
    }
    t = mono_ms();
    fprintf(stderr, "[G21-AUDIO] out: probe %s: %lu frames in %.0f ms, %.0f a second after the first second (%lu writes refused, %lu errors)\n",
        mode, frames, t - t0, mark && t > mark ? (double)(frames - at1) * 1000.0 / (t - mark) : 0.0, refused, errors);
    leave(0);
    return 0;
}

/* a quiet tone, 150 ms fades */
static int tone(const char *dev, int seconds, int amp)
{
    static int16_t buf[CHUNK * CH];
    snd_pcm_t *pcm;
    const long total = (long)(seconds < 1 ? 1 : seconds > 30 ? 30 : seconds) * RATE, fade = RATE * 150 / 1000;
    long at = 0, written = 0, eagain = 0;
    double next = mono_ms();
    pcm = dev_open(dev);
    if (!pcm) leave(1);
    while (at < total && !stopping) {
        long w;
        int i;
        for (i = 0; i < CHUNK; i++) {
            const long n = at + i;
            double g = 1.0;
            if (n < fade) g = (double)n / fade;
            if (total - n < fade) g = (double)(total - n) / fade;
            buf[2 * i] = buf[2 * i + 1] = (int16_t)((double)amp * g * sin(2 * M_PI * 440.0 * n / RATE));
        }
        w = A.writei(pcm, buf, CHUNK);
        if (w == -EAGAIN) eagain++;
        else if (w < 0) A.recover(pcm, (int)w, 1);
        else written += w;
        at += CHUNK;
        next += 10.0;
        { double wait = next - mono_ms(); if (wait > 0) usleep((useconds_t)(wait * 1000)); }
    }
    usleep(120000); /* what is in the device's buffer plays out */
    fprintf(stderr, "[G21-AUDIO] out: tone end, %ld of %ld frames taken by the device, %ld chunks refused (nobody reads: the source is not connected)\n", written, at, eagain);
    leave(written > 0 ? 0 : 2);
    return 0;
}

int main(int argc, char **argv)
{
    struct sigaction sa;
    memset(&sa, 0, sizeof sa);
    sa.sa_handler = on_stop;
    sigaction(SIGTERM, &sa, NULL);
    sigaction(SIGINT, &sa, NULL);
    signal(SIGPIPE, SIG_IGN);
    if (argc >= 4 && !strcmp(argv[1], "probe")) return alsa_load() ? probe(argv[2], argv[3]) : 1;
    if (argc >= 4 && !strcmp(argv[1], "play") && !strcmp(argv[3], "live")) return alsa_load() ? engine(argv[2], 1) : 1;
    if (argc >= 4 && !strcmp(argv[1], "play") && !strcmp(argv[3], "plain")) return alsa_load() ? play(argv[2]) : 1;   /* the writer before 0.1.9 */
    if (argc >= 3 && !strcmp(argv[1], "play")) return alsa_load() ? engine(argv[2], 0) : 1;
    if (argc >= 4 && !strcmp(argv[1], "tone")) {
        /* amplitude out of 32767: 1036 is about -30 dBFS (the default), at most 8000 (about -12 dBFS) */
        int amp = argc >= 5 ? atoi(argv[4]) : 1036;
        if (amp < 100) amp = 100;
        if (amp > 8000) amp = 8000;
        return alsa_load() ? tone(argv[2], atoi(argv[3]), amp) : 1;
    }
    fprintf(stderr, "usage: g21-audio-out play DEVICE | tone DEVICE SECONDS [AMPLITUDE]\n");
    return 2;
}
