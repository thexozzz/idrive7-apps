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
    if (argc >= 3 && !strcmp(argv[1], "play")) return alsa_load() ? play(argv[2]) : 1;
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
