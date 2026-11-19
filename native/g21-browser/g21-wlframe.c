// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * g21-wlframe - the browser's page picture straight from the engine's window to mgu-render, with no JPEG between.
 *
 * g21-webframe takes the page as DevTools photographs it (Page.startScreencast): every frame is read back, coded
 * as a JPEG, sent as base64 inside JSON, and decoded again here. Measured on the development machine (2026-11-19,
 * a page scrolled 60 times a second, 1346 x 410): 7.8 ms of the engine's CPU a frame with the photographs, about
 * 1.5 ms when it only draws its window. This program is that window's other end: a display server of the smallest
 * kind (Wayland, written out by hand: no library), for one client, the engine, which runs with
 * --ozone-platform=wayland. The engine draws its page into shared memory (wl_shm) and hands the buffer over; the
 * buffer's pixels (BGRA) go into the video file as I420, only the part the engine says has changed.
 *
 * It shows one window (the first xdg_toplevel), always "full screen" and "active" at the size it is told. Pop-up
 * windows (menus, tool tips) are sent away at once: nothing here could click them. No keyboard, no pointer: the
 * daemon drives the page through DevTools as before.
 *
 * The video file is g21-webframe's:
 *   64-byte head: magic "MGVF" (0x4656474d), 1, w, h, seq, slot, nslot, 1, 1; then nslot I420 slots.
 *
 * Pace: the engine draws its next frame when it gets the frame callback of the last one; the callback is held
 * back so that frames are never closer than 1/fps. The engine waits about 50 ms for it and then draws on by
 * itself (development machine, 2026-11-19: 20 frames a second asked for gave 20, 10 gave 52), so the pace works
 * from 20 frames a second up and the engine cannot be stopped this way. With "run 0" (nobody is watching) its
 * frames are not converted; the newest buffer is kept and shown at "run 1".
 *
 * stdin, one line each:   "size <w> <h>"   the window's size in pixels
 *                         "fps <n>"        at most n frames a second (20..120)
 *                         "run <0|1>"      0: frames are not put into the video file; 1: they are again
 *                         "mark"           a tap was sent to the page now (answered with "m")
 * stdout, one line each:  "ring <w> <h> <ino>"   a new video file
 *                         "f <seq> <us>"         a frame is in the file (us: conversion time); at most 4 a second
 *                         "s <frames> <ms> <med> <p95> <max> <us> <pct>"   every 2 s with frames: how many in how
 *                              many ms, the time between frames (middle, 95th of 100, longest, ms), the mean
 *                              conversion time and the share of the picture converted (percent)
 *                         "m <us>"               the first new picture came so long after "mark"
 *                         "c <text>"             the engine came / went, a window appeared
 *                         "e <text>"             something that could not be done
 *
 * Usage: g21-wlframe <video file> <601|709|full> <socket path> <w> <h> [fps]
 * No root actions. Ends when stdin closes or on SIGTERM.
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
#include <sys/mman.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/un.h>
#include <time.h>
#include <unistd.h>

#define NSLOT 4
#define MAGIC 0x4656474du
#define MAX_W 4096
#define MAX_H 2304
#define REPEAT_MS 500
#define MAXCLIENT 4
#define MAXSURF 64
#define MAXCB 64
#define MAXOBJ (1u << 16)
#define INBUF 65536
#define OUTBUF 16384

enum { T_NONE, T_DISPLAY, T_REGISTRY, T_COMPOSITOR, T_SHM, T_POOL, T_BUFFER, T_SURFACE, T_REGION, T_SUBCOMP, T_SUBSURF,
    T_OUTPUT, T_SEAT, T_WMBASE, T_POSITIONER, T_XDGSURF, T_TOPLEVEL, T_POPUP, T_OTHER };

/* the globals, by registry name (1-based) */
static const struct { const char *name; uint32_t ver; int type; } GLOBALS[] = {
    { "wl_compositor", 4, T_COMPOSITOR }, { "wl_shm", 1, T_SHM }, { "wl_subcompositor", 1, T_SUBCOMP },
    { "wl_output", 2, T_OUTPUT }, { "wl_seat", 5, T_SEAT }, { "xdg_wm_base", 2, T_WMBASE }
};
#define NGLOBAL ((int)(sizeof GLOBALS / sizeof GLOBALS[0]))

typedef struct { int fd; uint8_t *map; size_t size; int refs; int dead; } pool_t;
typedef struct { pool_t *pool; int32_t off, w, h, stride; uint32_t fmt; uint32_t id; } buf_t;
typedef struct {
    int used;
    uint32_t id, xdg, top;
    buf_t *pend;
    int pend_set;
    int dx0, dy0, dx1, dy1, damaged;    /* pending damage (bounding box) */
    uint32_t cb[MAXCB]; int ncb;        /* frame callbacks asked for, not yet committed */
    uint32_t due[MAXCB]; int ndue;      /* committed: to be answered */
    int configured;
} surf_t;
typedef struct { uint8_t type; void *p; } obj_t;
typedef struct {
    int fd;
    obj_t *obj; uint32_t nobj;
    uint8_t in[INBUF]; size_t nin;
    int fds[32]; int nfds;
    uint8_t out[OUTBUF]; size_t nout;
    surf_t surf[MAXSURF];
    surf_t *main;                       /* the surface with the first xdg_toplevel */
    uint32_t serial;
} client_t;

static client_t *clients[MAXCLIENT];
static int win_w = 0, win_h = 0, fps = 60, running = 1;
static long long last_cb_us = 0, mark_us = 0;
static void *held_client = NULL;     /* "run 0": the newest buffer of the main window, not yet released */
static uint32_t held_id = 0;
static long long retry_us = 0;       /* the kept buffer is tried again then (the video file could not be made) */
static int retry_left = 0;
static volatile sig_atomic_t stop_now = 0;

static long long now_us(void)
{
    struct timespec t;
    clock_gettime(CLOCK_MONOTONIC, &t);
    return (long long)t.tv_sec * 1000000LL + t.tv_nsec / 1000;
}

/* ------------------------------------------------------------------ colour + ring */

enum { COL_601, COL_709, COL_FULL };
static int colour = COL_601;
static int k_yr, k_yg, k_yb, k_ya, k_ur, k_ug, k_ub, k_vr, k_vg, k_vb;

static void make_coef(void)
{
    if (colour == COL_709) { k_yr = 47; k_yg = 157; k_yb = 16; k_ya = 16; k_ur = -26; k_ug = -87; k_ub = 112; k_vr = 112; k_vg = -102; k_vb = -10; }
    else if (colour == COL_FULL) { k_yr = 77; k_yg = 150; k_yb = 29; k_ya = 0; k_ur = -43; k_ug = -85; k_ub = 128; k_vr = 128; k_vg = -107; k_vb = -21; }
    else { k_yr = 66; k_yg = 129; k_yb = 25; k_ya = 16; k_ur = -38; k_ug = -74; k_ub = 112; k_vr = 112; k_vg = -94; k_vb = -18; }
}

static const char *ring_path = "";
static int ring_fd = -1, ring_w = 0, ring_h = 0;
static uint8_t *ring = NULL;
static size_t ring_size = 0;
static uint32_t seq = 0, slot = 0;
static int have_frame = 0;
/* figures for the "s" line */
static long long st_t0 = 0, st_last = 0, st_us = 0, st_px = 0, f_last = 0;
static int st_n = 0, st_iv[512], st_niv = 0;

static void put32(uint8_t *p, uint32_t v) { p[0] = (uint8_t)v; p[1] = (uint8_t)(v >> 8); p[2] = (uint8_t)(v >> 16); p[3] = (uint8_t)(v >> 24); }

static int open_ring(int w, int h)
{
    char tmp[512];
    uint8_t head[64];
    size_t frame = (size_t)w * (size_t)h * 3 / 2, size = 64 + NSLOT * frame;
    struct stat st;
    uint8_t *m;
    int fd;
    if (snprintf(tmp, sizeof tmp, "%s.ring", ring_path) >= (int)sizeof tmp) return -1;
    fd = open(tmp, O_RDWR | O_CREAT | O_TRUNC | O_CLOEXEC, 0644);
    if (fd < 0) return -1;
    if (ftruncate(fd, (off_t)size) != 0) { close(fd); unlink(tmp); return -1; }
    m = mmap(NULL, size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
    if (m == MAP_FAILED) { close(fd); unlink(tmp); return -1; }
    memset(head, 0, sizeof head);
    put32(head, MAGIC); put32(head + 4, 1); put32(head + 8, (uint32_t)w); put32(head + 12, (uint32_t)h);
    put32(head + 24, NSLOT); put32(head + 28, 1); put32(head + 32, 1);
    memcpy(m, head, sizeof head);
    fchmod(fd, 0644);
    if (rename(tmp, ring_path) != 0) { munmap(m, size); close(fd); unlink(tmp); return -1; }
    if (ring) munmap(ring, ring_size);
    if (ring_fd >= 0) close(ring_fd);
    ring = m; ring_size = size; ring_fd = fd; ring_w = w; ring_h = h; seq = 0; slot = 0; have_frame = 0;
    printf("ring %d %d %lu\n", w, h, fstat(fd, &st) == 0 ? (unsigned long)st.st_ino : 0ul);
    return 0;
}

/* BGRA rows (x0..x1, y0..y1, all even) into the I420 frame at dst */
static void convert(const uint8_t *src, int stride, uint8_t *dst, int w, int h, int x0, int y0, int x1, int y1)
{
    uint8_t *Y = dst, *U = Y + (size_t)w * h, *V = U + (size_t)(w / 2) * (h / 2);
    const int yr = k_yr, yg = k_yg, yb = k_yb, ya = k_ya * 256 + 128, ur = k_ur, ug = k_ug, ub = k_ub, vr = k_vr, vg = k_vg, vb = k_vb;
    int x, y;
    for (y = y0; y < y1; y += 2) {
        const uint8_t *s0 = src + (size_t)y * stride + (size_t)x0 * 4, *s1 = s0 + stride;
        uint8_t *d0 = Y + (size_t)y * w + x0, *d1 = d0 + w;
        uint8_t *du = U + (size_t)(y / 2) * (w / 2) + x0 / 2, *dv = V + (size_t)(y / 2) * (w / 2) + x0 / 2;
        for (x = x0; x < x1; x += 2, s0 += 8, s1 += 8, d0 += 2, d1 += 2) {
            int b0 = s0[0], g0 = s0[1], r0 = s0[2], b1 = s0[4], g1 = s0[5], r1 = s0[6];
            int b2 = s1[0], g2 = s1[1], r2 = s1[2], b3 = s1[4], g3 = s1[5], r3 = s1[6];
            int r = r0 + r1 + r2 + r3, g = g0 + g1 + g2 + g3, b = b0 + b1 + b2 + b3;
            d0[0] = (uint8_t)((yr * r0 + yg * g0 + yb * b0 + ya) >> 8);
            d0[1] = (uint8_t)((yr * r1 + yg * g1 + yb * b1 + ya) >> 8);
            d1[0] = (uint8_t)((yr * r2 + yg * g2 + yb * b2 + ya) >> 8);
            d1[1] = (uint8_t)((yr * r3 + yg * g3 + yb * b3 + ya) >> 8);
            *du++ = (uint8_t)(((ur * r + ug * g + ub * b + 512) >> 10) + 128);
            *dv++ = (uint8_t)(((vr * r + vg * g + vb * b + 512) >> 10) + 128);
        }
    }
}

static void count_frame(long long t0, long long t1, long long px)
{
    if (!st_t0) st_t0 = t0;
    if (st_last && st_niv < 512) st_iv[st_niv++] = (int)((t0 - st_last) / 1000);
    st_last = t0; st_us += t1 - t0; st_px += px; st_n++;
    if (t1 - f_last >= 250000) { f_last = t1; printf("f %u %lld\n", seq, t1 - t0); }
}

static int cmp_int(const void *a, const void *b) { return *(const int *)a - *(const int *)b; }

static void stats(long long now)
{
    if (!st_n || now - st_t0 < 2000000) return;
    qsort(st_iv, (size_t)st_niv, sizeof st_iv[0], cmp_int);
    printf("s %d %lld %d %d %d %lld %lld\n", st_n, (now - st_t0) / 1000, st_niv ? st_iv[st_niv / 2] : 0, st_niv ? st_iv[st_niv * 95 / 100] : 0,
        st_niv ? st_iv[st_niv - 1] : 0, st_us / st_n, ring_w && ring_h ? st_px * 100 / ((long long)st_n * ring_w * ring_h) : 0);
    st_t0 = 0; st_n = 0; st_niv = 0; st_us = 0; st_px = 0; st_last = 0;
}

/* The main window's buffer into the video file. 0: done; -1: the video file could not be made (tried again); 1: a
 * buffer that cannot be shown. */
static int show(const buf_t *b, int x0, int y0, int x1, int y1, int damaged)
{
    int w = b->w & ~1, h = b->h & ~1;
    size_t frame = (size_t)w * (size_t)h * 3 / 2;
    long long t0 = now_us();
    uint32_t next;
    int full = !damaged || !have_frame;
    if (w < 16 || h < 16 || w > MAX_W || h > MAX_H || b->stride < b->w * 4) { printf("e buffer %dx%d stride %d\n", b->w, b->h, b->stride); return 1; }
    if (b->off < 0 || (size_t)b->off + (size_t)b->stride * (size_t)b->h > b->pool->size) { printf("e buffer outside its pool\n"); return 1; }
    if (b->fmt > 1) { printf("e buffer format %u\n", b->fmt); return 1; }
    if (w != ring_w || h != ring_h || ring_fd < 0) {
        if (open_ring(w, h) != 0) { printf("e video file: %s\n", strerror(errno)); return -1; }
        full = 1;
    }
    if (!full) {
        x0 &= ~1; y0 &= ~1; x1 = (x1 + 1) & ~1; y1 = (y1 + 1) & ~1;
        if (x0 < 0) x0 = 0;
        if (y0 < 0) y0 = 0;
        if (x1 > w) x1 = w;
        if (y1 > h) y1 = h;
        if (x1 <= x0 || y1 <= y0) { x0 = y0 = x1 = y1 = 0; }
    }
    if (full) { x0 = 0; y0 = 0; x1 = w; y1 = h; }
    next = (slot + 1) % NSLOT;
    if (!full) memcpy(ring + 64 + (size_t)next * frame, ring + 64 + (size_t)slot * frame, frame);
    convert(b->pool->map + b->off, b->stride, ring + 64 + (size_t)next * frame, w, h, x0, y0, x1, y1);
    slot = next;
    put32(ring + 20, slot);
    seq++;
    put32(ring + 16, seq);
    have_frame = 1;
    if (mark_us) { printf("m %lld\n", now_us() - mark_us); mark_us = 0; }
    count_frame(t0, now_us(), (long long)(x1 - x0) * (y1 - y0));
    return 0;
}

/* a page that stands still: the same picture under a new number (see g21-webframe) */
static void repeat(void)
{
    size_t frame = (size_t)ring_w * (size_t)ring_h * 3 / 2;
    uint32_t next = (slot + 1) % NSLOT;
    if (!have_frame || !ring) return;
    memcpy(ring + 64 + (size_t)next * frame, ring + 64 + (size_t)slot * frame, frame);
    slot = next;
    put32(ring + 20, slot);
    seq++;
    put32(ring + 16, seq);
}

/* ------------------------------------------------------------------ Wayland, by hand */

static void drop_client(client_t *c);

static void flush(client_t *c)
{
    size_t done = 0;
    while (done < c->nout && c->fd >= 0) {
        ssize_t n = send(c->fd, c->out + done, c->nout - done, MSG_NOSIGNAL);
        if (n < 0) {
            if (errno == EINTR) continue;
            if (errno == EAGAIN) { struct pollfd p = { c->fd, POLLOUT, 0 }; if (poll(&p, 1, 2000) > 0) continue; }
            close(c->fd); c->fd = -1;
            break;
        }
        done += (size_t)n;
    }
    c->nout = 0;
}

/* an event: object, opcode, then words (strings and arrays are laid out by the caller) */
static void ev(client_t *c, uint32_t id, uint32_t op, const uint32_t *args, int nargs)
{
    uint32_t size = 8 + 4 * (uint32_t)nargs, head[2];
    if (c->fd < 0) return;
    if (c->nout + size > OUTBUF) flush(c);
    head[0] = id; head[1] = (size << 16) | op;
    memcpy(c->out + c->nout, head, 8);
    if (nargs) memcpy(c->out + c->nout + 8, args, 4 * (size_t)nargs);
    c->nout += size;
}
static void ev0(client_t *c, uint32_t id, uint32_t op) { ev(c, id, op, NULL, 0); }
static void ev1(client_t *c, uint32_t id, uint32_t op, uint32_t a) { ev(c, id, op, &a, 1); }
/* words of a string argument (length with its zero, padded) at a; returns how many words */
static int put_str(uint32_t *a, const char *s)
{
    size_t n = strlen(s) + 1;
    a[0] = (uint32_t)n;
    memset(a + 1, 0, (n + 3) & ~(size_t)3);
    memcpy(a + 1, s, n);
    return 1 + (int)((n + 3) / 4);
}

static obj_t *get(client_t *c, uint32_t id) { return id && id < c->nobj && c->obj[id].type ? &c->obj[id] : NULL; }

static int set(client_t *c, uint32_t id, int type, void *p)
{
    if (!id || id >= MAXOBJ) return -1;
    if (id >= c->nobj) {
        uint32_t n = c->nobj ? c->nobj : 256;
        obj_t *o;
        while (n <= id) n *= 2;
        o = realloc(c->obj, n * sizeof *o);
        if (!o) return -1;
        memset(o + c->nobj, 0, (n - c->nobj) * sizeof *o);
        c->obj = o; c->nobj = n;
    }
    c->obj[id].type = (uint8_t)type; c->obj[id].p = p;
    return 0;
}

/* an object is gone: the client may use its number again */
static void gone(client_t *c, uint32_t id)
{
    if (id < c->nobj) { c->obj[id].type = T_NONE; c->obj[id].p = NULL; }
    ev1(c, 1, 1, id);
}

static void pool_unref(pool_t *p)
{
    if (--p->refs > 0) return;
    if (p->map) munmap(p->map, p->size);
    if (p->fd >= 0) close(p->fd);
    free(p);
}

static void configure(client_t *c, surf_t *s)
{
    uint32_t a[5];
    if (!s->top || !s->xdg) return;
    /* xdg_toplevel.configure(width, height, states: fullscreen, activated) */
    a[0] = (uint32_t)win_w; a[1] = (uint32_t)win_h; a[2] = 8; a[3] = 2; a[4] = 4;
    ev(c, s->top, 0, a, 5);
    ev1(c, s->xdg, 0, ++c->serial);
    s->configured = 1;
}

static void callbacks(long long now)
{
    int i, j, k, any = 0;
    for (i = 0; i < MAXCLIENT; i++) {
        client_t *c = clients[i];
        if (!c) continue;
        for (j = 0; j < MAXSURF; j++) {
            surf_t *s = &c->surf[j];
            if (!s->used || !s->ndue) continue;
            for (k = 0; k < s->ndue; k++) { ev1(c, s->due[k], 0, (uint32_t)(now / 1000)); gone(c, s->due[k]); }
            s->ndue = 0; any = 1;
        }
        flush(c);
    }
    if (any) last_cb_us = now;
}

static int due_any(void)
{
    int i, j;
    for (i = 0; i < MAXCLIENT; i++) if (clients[i]) for (j = 0; j < MAXSURF; j++) if (clients[i]->surf[j].used && clients[i]->surf[j].ndue) return 1;
    return 0;
}

static int held_seen = 0;            /* frames were skipped: the next one is converted whole */

static surf_t *surf_of(client_t *c, uint32_t id) { obj_t *o = get(c, id); return o && o->type == T_SURFACE ? (surf_t *)o->p : NULL; }

static void commit(client_t *c, surf_t *s)
{
    int k;
    if (s->top && !s->configured) configure(c, s);
    if (s->pend_set) {
        buf_t *b = s->pend;
        s->pend = NULL; s->pend_set = 0;
        if (b && s == c->main && !running) {
            /* kept instead of converted; the one kept before goes back to the engine */
            if (held_client == c && held_id && held_id != b->id && get(c, held_id)) ev0(c, held_id, 0);
            held_client = c; held_id = b->id;
        } else if (b) {
            if (held_client == c && held_id && held_id != b->id && get(c, held_id)) ev0(c, held_id, 0);
            if (held_client == c) { held_client = NULL; held_id = 0; }
            if (s == c->main && show(b, s->dx0, s->dy0, s->dx1, s->dy1, held_seen ? 0 : s->damaged) < 0) {
                /* kept: the daemon removes the old file, then it goes in whole */
                held_client = c; held_id = b->id; held_seen = 1;
                retry_us = now_us() + 40000; retry_left = 100;
            } else {
                held_seen = 0; retry_us = 0;
                ev0(c, b->id, 0);   /* wl_buffer.release: its pixels are copied */
            }
        }
    }
    s->damaged = 0;
    for (k = 0; k < s->ncb && s->ndue < MAXCB; k++) s->due[s->ndue++] = s->cb[k];
    for (; k < s->ncb; k++) { ev1(c, s->cb[k], 0, 0); gone(c, s->cb[k]); }
    s->ncb = 0;
}

static void damage(surf_t *s, int x, int y, int w, int h)
{
    if (w <= 0 || h <= 0) return;
    if (w > MAX_W * 4) w = MAX_W * 4;
    if (h > MAX_H * 4) h = MAX_H * 4;
    if (!s->damaged) { s->dx0 = x; s->dy0 = y; s->dx1 = x + w; s->dy1 = y + h; s->damaged = 1; return; }
    if (x < s->dx0) s->dx0 = x;
    if (y < s->dy0) s->dy0 = y;
    if (x + w > s->dx1) s->dx1 = x + w;
    if (y + h > s->dy1) s->dy1 = y + h;
}

static int take_fd(client_t *c)
{
    int fd;
    if (!c->nfds) return -1;
    fd = c->fds[0];
    memmove(c->fds, c->fds + 1, (size_t)(--c->nfds) * sizeof c->fds[0]);
    return fd;
}

/* one request; a is its arguments (n bytes) */
static void request(client_t *c, uint32_t id, uint32_t op, const uint8_t *raw, uint32_t n)
{
    uint32_t a[8] = { 0 }, na = n / 4 > 8 ? 8 : n / 4;
    obj_t *o = get(c, id);
    memcpy(a, raw, na * 4);
    if (!o) return;
    switch (o->type) {
    case T_DISPLAY:
        if (op == 0) { ev1(c, a[0], 0, ++c->serial); ev1(c, 1, 1, a[0]); }      /* sync */
        else if (op == 1) {                                                      /* get_registry */
            int i;
            set(c, a[0], T_REGISTRY, NULL);
            for (i = 0; i < NGLOBAL; i++) {
                uint32_t w[16]; int k;
                w[0] = (uint32_t)i + 1;
                k = 1 + put_str(w + 1, GLOBALS[i].name);
                w[k++] = GLOBALS[i].ver;
                ev(c, a[0], 0, w, k);
            }
        }
        break;
    case T_REGISTRY:
        if (op == 0 && n >= 16) {   /* bind(name, interface string, version, new id) */
            uint32_t name = a[0], slen = a[1], words = (slen + 3) / 4, ver, nid;
            if (8 + words * 4 + 8 > n || name < 1 || name > (uint32_t)NGLOBAL) return;
            memcpy(&ver, raw + 8 + words * 4, 4);
            memcpy(&nid, raw + 12 + words * 4, 4);
            set(c, nid, GLOBALS[name - 1].type, NULL);
            if (GLOBALS[name - 1].type == T_SHM) { ev1(c, nid, 0, 0); ev1(c, nid, 0, 1); }   /* ARGB8888, XRGB8888 */
            else if (GLOBALS[name - 1].type == T_OUTPUT) {
                uint32_t w[16]; int k = 0;
                w[k++] = 0; w[k++] = 0; w[k++] = 260; w[k++] = 98; w[k++] = 0;
                k += put_str(w + k, "G21"); k += put_str(w + k, "page"); w[k++] = 0;
                ev(c, nid, 0, w, k);                                                          /* geometry */
                w[0] = 3; w[1] = (uint32_t)(win_w > 1920 ? win_w : 1920); w[2] = (uint32_t)(win_h > 720 ? win_h : 720); w[3] = 60000;
                ev(c, nid, 1, w, 4);                                                          /* mode: current, preferred */
                if (ver >= 2) { ev1(c, nid, 3, 1); ev0(c, nid, 2); }                          /* scale 1, done */
            } else if (GLOBALS[name - 1].type == T_SEAT) ev1(c, nid, 0, 0);                   /* no pointer, no keyboard */
        }
        break;
    case T_COMPOSITOR:
        if (op == 0) {              /* create_surface */
            int i;
            for (i = 0; i < MAXSURF && c->surf[i].used; i++) { /* a free one */ }
            if (i == MAXSURF) { set(c, a[0], T_OTHER, NULL); break; }
            memset(&c->surf[i], 0, sizeof c->surf[i]);
            c->surf[i].used = 1; c->surf[i].id = a[0];
            set(c, a[0], T_SURFACE, &c->surf[i]);
        } else if (op == 1) set(c, a[0], T_REGION, NULL);
        break;
    case T_REGION: if (op == 0) gone(c, id); break;
    case T_SHM:
        if (op == 0) {              /* create_pool(new id, fd, size) */
            pool_t *p = calloc(1, sizeof *p);
            int fd = take_fd(c);
            if (!p || fd < 0 || (int32_t)a[1] <= 0) { if (fd >= 0) close(fd); free(p); set(c, a[0], T_OTHER, NULL); printf("e shm pool\n"); break; }
            p->fd = fd; p->size = a[1]; p->refs = 1;
            p->map = mmap(NULL, p->size, PROT_READ, MAP_SHARED, fd, 0);
            if (p->map == MAP_FAILED) { p->map = NULL; printf("e shm pool: %s\n", strerror(errno)); }
            set(c, a[0], T_POOL, p);
        }
        break;
    case T_POOL: {
        pool_t *p = o->p;
        if (op == 0) {              /* create_buffer(new id, offset, width, height, stride, format) */
            buf_t *b = calloc(1, sizeof *b);
            if (!b) { set(c, a[0], T_OTHER, NULL); break; }
            b->pool = p; p->refs++; b->id = a[0];
            b->off = (int32_t)a[1]; b->w = (int32_t)a[2]; b->h = (int32_t)a[3]; b->stride = (int32_t)a[4]; b->fmt = a[5];
            set(c, a[0], T_BUFFER, b);
        } else if (op == 1) { gone(c, id); pool_unref(p); }
        else if (op == 2 && (int32_t)a[0] > 0 && (size_t)a[0] > p->size) {      /* resize: larger only */
            uint8_t *m = mmap(NULL, a[0], PROT_READ, MAP_SHARED, p->fd, 0);
            if (m != MAP_FAILED) { if (p->map) munmap(p->map, p->size); p->map = m; p->size = a[0]; }
        }
        break;
    }
    case T_BUFFER:
        if (op == 0) {
            buf_t *b = o->p;
            int i;
            for (i = 0; i < MAXSURF; i++) if (c->surf[i].used && c->surf[i].pend == b) c->surf[i].pend = NULL;
            if (held_client == c && held_id == id) { held_client = NULL; held_id = 0; }
            gone(c, id);
            pool_unref(b->pool);
            free(b);
        }
        break;
    case T_SURFACE: {
        surf_t *s = o->p;
        switch (op) {
        case 0: {                   /* destroy */
            int k;
            for (k = 0; k < s->ncb; k++) gone(c, s->cb[k]);
            for (k = 0; k < s->ndue; k++) gone(c, s->due[k]);
            if (c->main == s) { c->main = NULL; printf("c window closed\n"); }
            s->used = 0;
            gone(c, id);
            break;
        }
        case 1: { obj_t *b = get(c, a[0]); s->pend = b && b->type == T_BUFFER ? (buf_t *)b->p : NULL; if (b && b->type == T_BUFFER && !((buf_t *)b->p)->pool->map) s->pend = NULL; s->pend_set = 1; break; }
        case 2: case 9: damage(s, (int32_t)a[0], (int32_t)a[1], (int32_t)a[2], (int32_t)a[3]); break;
        case 3: if (s->ncb < MAXCB) { s->cb[s->ncb++] = a[0]; set(c, a[0], T_OTHER, NULL); } else { set(c, a[0], T_OTHER, NULL); ev1(c, a[0], 0, 0); gone(c, a[0]); } break;
        case 6: commit(c, s); break;
        default: break;             /* regions, transform, scale: one opaque window at scale 1 */
        }
        break;
    }
    case T_SUBCOMP:
        if (op == 0) gone(c, id);
        else if (op == 1) set(c, a[0], T_SUBSURF, NULL);
        break;
    case T_SUBSURF: if (op == 0) gone(c, id); break;
    case T_SEAT: if (op == 3) gone(c, id); else if (op <= 2) set(c, a[0], T_OTHER, NULL); break;
    case T_WMBASE:
        if (op == 0) gone(c, id);
        else if (op == 1) set(c, a[0], T_POSITIONER, NULL);
        else if (op == 2) { surf_t *s = surf_of(c, a[1]); if (s) s->xdg = a[0]; set(c, a[0], T_XDGSURF, s); }
        break;
    case T_POSITIONER: if (op == 0) gone(c, id); break;
    case T_XDGSURF: {
        surf_t *s = o->p;
        if (op == 0) { if (s && s->used && s->xdg == id) { s->xdg = 0; s->top = 0; } gone(c, id); }
        else if (op == 1) {         /* get_toplevel */
            set(c, a[0], T_TOPLEVEL, s);
            if (s && s->used) {
                if (!c->main) { c->main = s; s->top = a[0]; printf("c window\n"); }
                else { ev0(c, a[0], 1); }   /* a second window: asked to close */
            }
        } else if (op == 2) {       /* get_popup: sent away at once */
            set(c, a[0], T_POPUP, NULL);
            ev0(c, a[0], 1);
        }
        break;
    }
    case T_TOPLEVEL: {
        surf_t *s = o->p;
        if (op == 0) { if (s && s->used && s->top == id) { s->top = 0; s->configured = 0; if (c->main == s) { c->main = NULL; printf("c window closed\n"); } } gone(c, id); }
        else if ((op >= 9 && op <= 13) && s && s->used && s->top == id && s->configured) configure(c, s);  /* (un)maximise, full screen: it stays as it is */
        break;
    }
    case T_POPUP: if (op == 0) gone(c, id); break;
    default: break;
    }
}

static void drop_client(client_t *c)
{
    uint32_t i;
    for (i = 0; i < MAXCLIENT; i++) if (clients[i] == c) clients[i] = NULL;
    if (held_client == c) { held_client = NULL; held_id = 0; }
    for (i = 0; i < c->nobj; i++) {
        if (c->obj[i].type == T_BUFFER) { buf_t *b = c->obj[i].p; pool_unref(b->pool); free(b); }
    }
    for (i = 0; i < c->nobj; i++) if (c->obj[i].type == T_POOL) pool_unref(c->obj[i].p);
    for (i = 0; i < (uint32_t)c->nfds; i++) close(c->fds[i]);
    if (c->fd >= 0) close(c->fd);
    free(c->obj);
    free(c);
    printf("c engine gone\n");
}

static void read_client(client_t *c)
{
    union { char buf[CMSG_SPACE(sizeof(int) * 28)]; struct cmsghdr align; } u;
    struct iovec io = { c->in + c->nin, INBUF - c->nin };
    struct msghdr m;
    struct cmsghdr *cm;
    ssize_t n;
    size_t at = 0;
    memset(&m, 0, sizeof m);
    m.msg_iov = &io; m.msg_iovlen = 1; m.msg_control = u.buf; m.msg_controllen = sizeof u.buf;
    n = recvmsg(c->fd, &m, MSG_DONTWAIT | MSG_CMSG_CLOEXEC);
    if (n < 0 && (errno == EAGAIN || errno == EINTR)) return;
    if (n <= 0) { close(c->fd); c->fd = -1; return; }
    for (cm = CMSG_FIRSTHDR(&m); cm; cm = CMSG_NXTHDR(&m, cm)) {
        if (cm->cmsg_level == SOL_SOCKET && cm->cmsg_type == SCM_RIGHTS) {
            int k, cnt = (int)((cm->cmsg_len - CMSG_LEN(0)) / sizeof(int));
            for (k = 0; k < cnt; k++) {
                int fd;
                memcpy(&fd, CMSG_DATA(cm) + k * sizeof(int), sizeof fd);
                if (c->nfds < 32) c->fds[c->nfds++] = fd; else close(fd);
            }
        }
    }
    c->nin += (size_t)n;
    while (c->nin - at >= 8 && c->fd >= 0) {
        uint32_t id, word, size;
        memcpy(&id, c->in + at, 4);
        memcpy(&word, c->in + at + 4, 4);
        size = word >> 16;
        if (size < 8 || (size & 3)) { close(c->fd); c->fd = -1; break; }
        if (c->nin - at < size) break;
        request(c, id, word & 0xFFFF, c->in + at + 8, size - 8);
        at += size;
    }
    memmove(c->in, c->in + at, c->nin - at);
    c->nin -= at;
    flush(c);
}

static void on_term(int sig) { (void)sig; stop_now = 1; }

int main(int argc, char **argv)
{
    struct sockaddr_un sa;
    struct sigaction act;
    char line[256];
    size_t nline = 0;
    int lfd, i;
    if (argc < 6) { fprintf(stderr, "usage: g21-wlframe <video file> <601|709|full> <socket path> <w> <h> [fps]\n"); return 2; }
    ring_path = argv[1];
    if (strcmp(argv[2], "709") == 0) colour = COL_709;
    else if (strcmp(argv[2], "full") == 0) colour = COL_FULL;
    make_coef();
    win_w = atoi(argv[4]); win_h = atoi(argv[5]);
    if (argc > 6) fps = atoi(argv[6]);
    if (win_w < 16 || win_h < 16 || win_w > MAX_W || win_h > MAX_H) { fprintf(stderr, "size out of range\n"); return 2; }
    if (fps < 20 || fps > 120) fps = 60;
    memset(&act, 0, sizeof act);
    act.sa_handler = on_term;
    sigaction(SIGTERM, &act, NULL);
    sigaction(SIGINT, &act, NULL);
    signal(SIGPIPE, SIG_IGN);
    setvbuf(stdout, NULL, _IOLBF, 0);
    memset(&sa, 0, sizeof sa);
    sa.sun_family = AF_UNIX;
    if (strlen(argv[3]) >= sizeof sa.sun_path) { fprintf(stderr, "socket path too long\n"); return 2; }
    strcpy(sa.sun_path, argv[3]);
    unlink(argv[3]);
    lfd = socket(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC, 0);
    if (lfd < 0 || bind(lfd, (struct sockaddr *)&sa, sizeof sa) != 0 || listen(lfd, 4) != 0) { printf("e socket: %s\n", strerror(errno)); return 1; }
    chmod(argv[3], 0600);
    printf("c listening\n");
    while (!stop_now) {
        struct pollfd pf[2 + MAXCLIENT];
        client_t *who[MAXCLIENT];
        long long now = now_us(), gap = 1000000LL / fps, wait = REPEAT_MS * 1000LL;
        struct timespec ts;
        int np = 2, r;
        pf[0].fd = 0; pf[0].events = POLLIN; pf[0].revents = 0;
        pf[1].fd = lfd; pf[1].events = POLLIN; pf[1].revents = 0;
        for (i = 0; i < MAXCLIENT; i++) {
            if (clients[i] && clients[i]->fd < 0) drop_client(clients[i]);
            if (clients[i]) { who[np - 2] = clients[i]; pf[np].fd = clients[i]->fd; pf[np].events = POLLIN; pf[np].revents = 0; np++; }
        }
        if (retry_us && running) {
            if (now >= retry_us) {
                client_t *hc = held_client;
                obj_t *ho = hc ? get(hc, held_id) : NULL;
                retry_us = 0;
                if (ho && ho->type == T_BUFFER && retry_left-- > 0 && show((buf_t *)ho->p, 0, 0, 0, 0, 0) < 0) retry_us = now + 40000;
                else { if (ho) { ev0(hc, held_id, 0); flush(hc); } held_client = NULL; held_id = 0; held_seen = 0; }
                continue;
            }
            if (retry_us - now < wait) wait = retry_us - now;
        }
        if (running && due_any()) {
            long long w2 = last_cb_us + gap - now;
            if (w2 <= 0) { callbacks(now); continue; }
            if (w2 < wait) wait = w2;
        }
        ts.tv_sec = (time_t)(wait / 1000000); ts.tv_nsec = (long)(wait % 1000000) * 1000;
        r = ppoll(pf, (nfds_t)np, &ts, NULL);
        if (r < 0) { if (errno == EINTR) continue; break; }
        now = now_us();
        stats(now);
        if (r == 0) {
            if (!(running && due_any())) repeat();
            continue;
        }
        if (pf[0].revents) {
            ssize_t n = read(0, line + nline, sizeof line - 1 - nline);
            char *nl;
            if (n <= 0) break;
            nline += (size_t)n;
            line[nline] = 0;
            while ((nl = strchr(line, '\n')) != NULL) {
                int a = 0, b = 0;
                *nl = 0;
                if (sscanf(line, "size %d %d", &a, &b) == 2 && a >= 16 && b >= 16 && a <= MAX_W && b <= MAX_H) {
                    win_w = a; win_h = b;
                    printf("c size %d %d\n", a, b);
                    for (i = 0; i < MAXCLIENT; i++) if (clients[i] && clients[i]->main && clients[i]->main->configured) { configure(clients[i], clients[i]->main); flush(clients[i]); }
                } else if (sscanf(line, "fps %d", &a) == 1 && a >= 20 && a <= 120) fps = a;
                else if (sscanf(line, "run %d", &a) == 1) {
                    running = a != 0;
                    if (!running) held_seen = 1;
                    else if (held_client && held_id) {
                        /* what the engine drew last while nobody watched */
                        client_t *hc = held_client;
                        obj_t *ho = get(hc, held_id);
                        if (ho && ho->type == T_BUFFER && show((buf_t *)ho->p, 0, 0, 0, 0, 0) < 0) { retry_us = now_us() + 40000; retry_left = 100; }
                        else { if (ho) { ev0(hc, held_id, 0); flush(hc); } held_seen = 0; held_client = NULL; held_id = 0; }
                    }
                }
                else if (strcmp(line, "mark") == 0) mark_us = now_us();
                nline -= (size_t)(nl + 1 - line);
                memmove(line, nl + 1, nline + 1);
            }
            if (nline >= sizeof line - 1) nline = 0;
        }
        if (pf[1].revents) {
            int fd = accept4(lfd, NULL, NULL, SOCK_CLOEXEC);
            if (fd >= 0) {
                for (i = 0; i < MAXCLIENT && clients[i]; i++) { /* a free place */ }
                if (i == MAXCLIENT) close(fd);
                else {
                    client_t *c = calloc(1, sizeof *c);
                    if (!c) close(fd);
                    else { c->fd = fd; set(c, 1, T_DISPLAY, NULL); clients[i] = c; printf("c engine connected\n"); }
                }
            }
        }
        for (i = 2; i < np; i++) if (pf[i].revents && who[i - 2]->fd >= 0) read_client(who[i - 2]);
    }
    unlink(argv[3]);
    return 0;
}
