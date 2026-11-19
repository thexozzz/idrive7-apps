// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * A stand-in for libasound.so.2 on the development machine, for g21-audio-out: a playback device that holds 3072
 * frames and plays them at FAKE_RATE frames a second (default 48000; the head unit's SmartX input sometimes takes
 * 36000). Only what g21-audio-out calls.
 *   gcc -shared -fPIC -o libasound.so.2 fake_alsa.c
 */
#define _GNU_SOURCE
#include <errno.h>
#include <stdlib.h>
#include <time.h>
#include <unistd.h>

typedef struct snd_pcm { int nonblock; double t0; double played; double held; } snd_pcm_t;
static double now_ms(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return t.tv_sec * 1000.0 + t.tv_nsec / 1e6; }
static double rate(void) { const char *e = getenv("FAKE_RATE"); double r = e ? atof(e) : 0; return r > 1000 ? r : 48000.0; }
static void run(snd_pcm_t *p)
{
    double t = now_ms(), took = (t - p->t0) * rate() / 1000.0;
    p->t0 = t;
    p->held -= took;
    if (p->held < 0) p->held = 0;
}
int snd_pcm_open(snd_pcm_t **pcm, const char *name, int stream, int mode)
{
    (void)name; (void)stream;
    *pcm = calloc(1, sizeof **pcm);
    if (!*pcm) return -ENOMEM;
    (*pcm)->nonblock = mode & 1;
    (*pcm)->t0 = now_ms();
    return 0;
}
int snd_pcm_set_params(snd_pcm_t *p, int f, int a, unsigned c, unsigned r, int s, unsigned l) { (void)p; (void)f; (void)a; (void)c; (void)r; (void)s; (void)l; return 0; }
long snd_pcm_writei(snd_pcm_t *p, const void *buf, unsigned long n)
{
    (void)buf;
    for (;;) {
        double room;
        run(p);
        room = 3072.0 - p->held;
        if (room >= 1.0) { unsigned long w = n < (unsigned long)room ? n : (unsigned long)room; p->held += (double)w; return (long)w; }
        if (p->nonblock) return -EAGAIN;
        usleep(1000);
    }
}
int snd_pcm_recover(snd_pcm_t *p, int err, int silent) { (void)p; (void)err; (void)silent; return 0; }
int snd_pcm_delay(snd_pcm_t *p, long *d) { run(p); *d = (long)p->held; return 0; }
long snd_pcm_avail(snd_pcm_t *p) { run(p); return (long)(3072.0 - p->held); }
const char *snd_strerror(int e) { (void)e; return "fake"; }
