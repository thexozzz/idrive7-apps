#!/usr/bin/node
// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/*
 * g21-audiod - G21 Audio: THEiPlay's one way to the car's speakers for sound that comes as a stream.
 *
 * Runs as root on the head unit's own Node 8 (/usr/bin/node: /usr/lib/someip.node is built for it).
 *
 *   a player (the browser engine, AirPlay ...) --S16LE 48 kHz stereo--> FIFO /run/g21-audio/<name>.pcm
 *        --> g21-audio-out (nobody, group mgu_alsa) --> ALSA plug:smartx:CarLifeMedia_CF_48_STEREO
 *        --> SmartXbar --> the AudioManager's route 287 -> 1024 (MediaSink_Front) --> amplifier, iDrive volume
 *
 * The speakers are taken only while sound flows: the writer says "active" at the first sound, this daemon then
 * claims them (speakers.js: CarLifeMedia marked available, connected to the front speakers; about 1.4 s on
 * the car), and when the writer has had 3 s of nothing it leaves and the speakers go back to the source that
 * had them (CarPlay, the radio). One stream at a time: there is one CarLifeMedia.
 *
 * VERIFIED on the car 2026-11-15 (G21, 4.14.198-apl): claim -> CS_CONNECTED in 1.4 s, a 440 Hz tone written by
 * g21-audio-out as nobody:mgu_alsa is heard from the speakers, the device takes the samples in real time,
 * release gives the speakers back to CarPlayMedia (266).
 *
 * Control: /run/g21-audio/ctl.sock, one JSON object per line (root only: 0600).
 *   {"op":"caps"}                       -> {"ev":"caps", ...}      what this backend can and cannot do
 *   {"op":"open","name":"chromium","uid":12710}
 *                                       -> {"ev":"open","ok":true,"fifo":"/run/g21-audio/chromium.pcm",...}
 *                                          the FIFO belongs to uid (who writes), group mgu_alsa (who reads)
 *   {"op":"close"}                      -> {"ev":"closed"}         also when the connection goes away
 *   {"op":"tone","seconds":2}           -> {"ev":"tone","ok":true} the audible test
 *   {"op":"status"}                     -> {"ev":"status", ...}
 *
 * What is NOT here: files. A finished audio file (YouTube) is played by BMW's MediaPlayer through
 * jap-ridetube-d (source OAPGenericMedia 1046, playFile); see caps.file.
 *
 * speakers.js is Vizualyse/idrive-apps' platform/tool/speakers (Copyright (C) 2026 Yousaf Khan,
 * GPL-3.0-or-later), unchanged. The writer follows Moonride's audio.cpp (Copyright (C) 2026 JustAnotherPU).
 */
const cp = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');

const env = process.env;
const RUN = env.G21_AUDIO_RUN || '/run/g21-audio';
const ROOT = env.G21_AUDIO_ROOT || '/var/opt/g21-audio';
const SOCK = path.join(RUN, 'ctl.sock');
const OUT = env.G21_AUDIO_OUT || path.join(__dirname, 'g21-audio-out');
const SPEAKERS = env.G21_AUDIO_SPEAKERS || path.join(__dirname, 'speakers.js');
const DEVICE = env.G21_AUDIO_DEVICE || '';      // tests: an ALSA device instead of the speakers' own
const NOSETUID = env.G21_AUDIO_NOSETUID === '1'; // tests not run as root
const WRITER_UID = 65534;                        // nobody
const VERSION = (function () { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'component.json'), 'utf8')).version; } catch (e) { return ''; } }());

function log(text) {
    const line = new Date().toISOString() + ' [G21-AUDIO] ' + text;
    try { fs.mkdirSync(path.join(ROOT, 'log')); } catch (e) { /* there */ }
    try {
        const f = path.join(ROOT, 'log', 'audiod.log');
        try { if (fs.statSync(f).size > 512 * 1024) fs.renameSync(f, f + '.1'); } catch (e) { /* none yet */ }
        fs.appendFileSync(f, line + '\n');
    } catch (e) { /* stdout has it */ }
    console.log(line);
}
function groupId(name) {
    try {
        const l = fs.readFileSync('/etc/group', 'utf8').split('\n').filter(function (x) { return x.indexOf(name + ':') === 0; })[0];
        const n = l ? Number(l.split(':')[2]) : NaN;
        return n > 0 && n < 65535 ? n : null;
    } catch (e) { return null; }
}
const ALSA_GID = env.G21_AUDIO_GID ? Number(env.G21_AUDIO_GID) : groupId('mgu_alsa');

/*
 * Which input of the car the sound goes into. "media" (default since 0.1.18): the media player's own SmartX input,
 * MediaSink_AudioOut_Front, with BMW's media source (1046) connected to the front speakers: what RideTube's sound
 * goes through, which plays right at once. Car, 2026-11-20, with the owner: silence written into it five times,
 * 47 997 to 48 007 frames a second each time, and a tone the owner heard. The CarLife input used until then takes
 * 48 000 or only 36 000 frames a second, by chance, at every connection ("input": "carlife" in config.json brings
 * it back; what was built around that, the tries for the full pace, stays for it).
 * Only root may open that device, so its writer starts as root and gives root up once the device is open
 * (g21-audio-out.c, G21_AUDIO_DROP). The source is BMW's, shared with RideTube: it is not marked available or
 * tidied up by this tool, and the two cannot sound at once.
 */
const MEDIA_INPUT = (function () { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')).input !== 'carlife'; } catch (e) { return true; } })() && !DEVICE;
const MEDIA_DEVICE = 'smartx:MediaSink_AudioOut_Front_CF_48_COMBINED_STEREO_MULTICHANNEL';
// how the writer is started: as nobody in the group mgu_alsa, or (the media input) as root that gives root up
// how long the channel is held through a silence (ms): "holdMs" in config.json, 20 s when it says nothing
function holdMs() { const h = Number(conf().holdMs); return h >= 3000 && h <= 600000 ? Math.round(h) : 20000; }
function asWriter(opts) {
    opts.env = Object.assign({}, opts.env || process.env, { G21_AUDIO_IDLE_MS: String(holdMs()) });
    if (NOSETUID) return opts;
    if (onMedia()) { opts.env = Object.assign({}, opts.env || process.env, { G21_AUDIO_DROP: WRITER_UID + ':' + ALSA_GID, G21_AUDIO_DEAD: '1' }); return opts; }
    opts.uid = WRITER_UID; opts.gid = ALSA_GID;
    return opts;
}
const mod = require(SPEAKERS);
// Two ways to the speakers: the media input (when it is the rule) and the CarLife input. `sp` is the one in use.
// A media input that does not work (its device does not open, the speakers are not connected, or the device takes
// nothing though it is open: car, 2026-11-20, 0.1.18: the first stream sounded at once, every one after it not at
// all) is left for the CarLife input until this tool starts again: fallBack(). Sound in the old way, with its
// faults, rather than none; the log says why.
const spOpts = { log: function (t) { log(String(t)); }, record: path.join(RUN, 'speakers.json') };
const spCar = new mod.Speakers(spOpts);
const spMedia = MEDIA_INPUT ? new mod.Speakers(Object.assign({}, spOpts, { source: 1046, device: MEDIA_DEVICE, own: false })) : null;
let sp = spMedia || spCar;
function onMedia() { return sp === spMedia; }
const device = function () { return DEVICE || ('plug:' + sp.device); };

// the one stream
const st = { holder: null, name: '', fifo: '', fd: -1, writer: null, active: false, sound: false, claimed: false, stats: '', since: 0, lost: 0 };
[spCar, spMedia].filter(Boolean).forEach(function (x) { x.on('lost', function () { if (x !== sp) return; st.lost += 1; st.claimed = false; log('speakers lost: another source took them'); }); });
function fallBack(why) {
    if (!onMedia()) return Promise.resolve();
    const old = sp, was = st.claimed;
    log('media input: ' + why + '; the CarLife input is used until the tool starts again');
    sp = spCar;
    st.claimed = false;
    return (was ? old.release() : Promise.resolve()).then(function () {}, function () {});
}

/*
 * The clock. The SmartX input this tool writes into takes sound at the full pace only while BMW's media player is
 * playing something; otherwise it takes 36 000 of 48 000 frames a second, whichever way it is written to, and the
 * sound is cut (AirPlay) or slow (the browser, a film). Found on the car, 2026-11-15: the thirty seconds the owner
 * called right were the ones after a test of the media player (frames 1413729, dropped 20392); then, with the
 * media player playing a file of silence beside it, five reports in a row: 240 000 frames taken every 5 s, none
 * dropped, and the owner: "w tym momencie jest prawidłowo". Why the player's playing drives that input is not
 * known; that it does was seen twice.
 * So while a stream has the speakers the media player plays silence (mediaout.js, a sparse file: it takes no
 * room): started before the speakers are claimed, stopped after they are given back, and the speakers go back to
 * the source that had them before.
 *
 * OFF since 0.1.14 ("clock": true in config.json brings it back). The car, 2026-11-19, with the owner: it does not
 * do what it was made for. The media player stops the moment this tool's source takes the speakers, every time
 * (PLAY, then STOP 0.6 s later; after a minute of playing just the same), playFile without the speakers leaves it
 * stopped, and the input still takes 36 000 of 48 000 frames a second (AirPlay, five reports: 240 000 in, 180 000
 * written, 54 000 dropped every 5 s; the probe: 35 846 to 36 104 a second, four ways of writing). In the one good
 * minute of 2026-11-15 the media player was stopped as well (the log of that minute), so its playing was not the
 * reason. The reason for the 36 000 is not known. The keeper only made the sound start 0.4 s later and started and
 * stopped BMW's player with every stream.
 */
let keeper = null;
let heals = [];                 // when the writer left because the device was slow (the last minute)
function keeperStart() {
    if (keeper || conf().clock !== true || DEVICE) return Promise.resolve();
    let K;
    try { K = require(path.join(__dirname, 'mediaout.js')).MediaOut; } catch (e) { log('clock: ' + e.message); return Promise.resolve(); }
    const k = new K({ log: log, mode: 'file', dir: path.join(ROOT, 'media') });
    keeper = k;
    const t0 = Date.now();
    k.watch = setInterval(function () {
        // (the file of silence is four hours long; and another program may have stopped the player)
        // Carefully: a start every 5 s whenever the player was not playing would itself break the clock every 5 s.
        // Paused: asked to play on, at most every 20 s. Stopped (the file ended, or another program): the file again,
        // at most once a minute. Each is written down, to be read from the log.
        if (keeper !== k || !k.started || !k.state || k.state === 'PLAYER_STATE_PLAY' || Date.now() - t0 < 5000) return;
        const now = Date.now();
        if (k.state === 'PLAYER_STATE_PAUSE') {
            if (now - (k.nudged || 0) < 20000) return;
            k.nudged = now;
            log('clock: the media player is paused, asked to play on');
            if (k.mp) k.mp.callMethod('sendButtonEvent', { button: 'PLAY', action: 'PRESS' }, 3000).then(function () {}, function (e) { log('clock: PLAY ' + (e && e.message || e)); });
            return;
        }
        if (now - (k.restarted || 0) < 60000) return;
        k.restarted = now;
        log('clock: the media player is ' + k.state + ', its file started again');
        k.again();
    }, 5000);
    return k.start().then(function () {
        // the player needs a moment to really play
        return new Promise(function (resolve) { const until = Date.now() + 2500; const look = function () { if (k.playing || Date.now() > until) resolve(); else setTimeout(look, 50); }; look(); });
    }).then(function () { log('clock: the media player plays silence (' + (Date.now() - t0) + ' ms)'); }, function (e) { log('clock: not started (' + (e && e.message || e) + '): the sound may be cut'); });
}
function keeperStop() {
    const k = keeper;
    if (!k) return Promise.resolve();
    keeper = null;
    clearInterval(k.watch);
    return k.stop().then(function () {}, function () {});
}
function claim() {
    if (st.claimed) return;
    st.claimed = true;
    const t0 = Date.now();
    keeperStart().then(function () { return sp.claim(); }).then(function () { log('speakers claimed for "' + st.name + '" in ' + (Date.now() - t0) + ' ms'); quietPlayer(); },
        function (e) {
            st.claimed = false;
            log('speakers not claimed: ' + (e && e.message || e));
            if (onMedia()) fallBack('the speakers were not connected').then(function () { if (st.active) claim(); });
        });
}
/*
 * The media input: the speakers now belong to BMW's media source, and its player may take that as its turn and play
 * on what it had last (a RideTube film's sound). So the player is looked at twice after the claim and, if it
 * plays, stopped (the STOP button, as RideTube sends it). Later it is left alone: a film started in RideTube while
 * a stream of ours sounds is the owner's doing.
 */
let playerLook = null;
function quietPlayer() {
    if (!onMedia()) return;
    let K;
    try { K = require(path.join(__dirname, 'mediaout.js')).MediaOut; } catch (e) { return; }
    if (!playerLook) playerLook = new K({ log: function (t) { if (!/PLAYER_STATE/.test(String(t))) log(String(t)); }, mode: 'file' });
    const k = playerLook;
    const look = function () {
        if (!st.claimed || !k.mp) return;
        if (k.state === 'PLAYER_STATE_PLAY') {
            log('media player: it began to play as the speakers were claimed; stopped');
            k.mp.callMethod('sendButtonEvent', { button: 'STOP', action: 'PRESS' }, 3000).then(function () {}, function (e) { log('media player: STOP ' + (e && e.message || e)); });
        }
    };
    k._proxies().then(function () { setTimeout(look, 500); setTimeout(look, 2000); }, function (e) { log('media player: ' + (e && e.message || e)); });
}
function release(why) {
    if (!st.claimed) return Promise.resolve();
    st.claimed = false;
    return sp.release().then(function () { log('speakers released (' + why + ')'); }).then(keeperStop, keeperStop);
}
/*
 * A player must never wait for the speakers. Its sound comes through a pipe; while no writer reads it (the device
 * cannot be opened, the writer hangs in the open, it is being started again) the pipe fills in 85 ms and the
 * player's audio thread stops in its write: a film then stalls and its page says "coś poszło nie tak". So
 * without a working writer this daemon reads the stream itself, at the pace of real time, and drops it.
 */
let drain = null, drainAt = 0;
const drainBuf = Buffer.alloc(65536);
function stopDrain() { if (drain) { clearInterval(drain); drain = null; } }
function startDrain(why) {
    if (drain || st.fd < 0) return;
    log('no writer (' + why + '): the stream is read and dropped, its player keeps its pace');
    drainAt = Date.now();
    drain = setInterval(function () {
        const now = Date.now();
        if (st.fd < 0 || st.writer) { stopDrain(); return; }
        // 48 kHz stereo S16: 192 bytes a millisecond
        let want = Math.min(drainBuf.length, Math.floor((now - drainAt) * 192)) & ~3;
        drainAt = now;
        while (want > 0) {
            let n = 0;
            try { n = fs.readSync(st.fd, drainBuf, 0, want, null); } catch (e) { break; }   // EAGAIN: nothing waits
            if (!n) break;
            want -= n;
        }
    }, 20);
}
/*
 * The other way out, as RideTube's: BMW's media player plays the stream (mediaout.js). Chosen in
 * /var/opt/g21-audio/config.json, {"backend": "media-http" | "media-file" | "smartx", "leadMs": 600}, or with
 * `g21-audio-client.js backend <name> [leadMs]`; "smartx" (the writer above) is the default until the media
 * player's way has been heard to work on the car.
 * Here this daemon reads the pipe itself: all of it at once for AirPlay (it throws away what is not taken), at
 * the pace of the clock for the others (the browser's engine has no clock of its own for its sound).
 */
function conf() {
    try { const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')); return j && typeof j === 'object' ? j : {}; } catch (e) { return {}; }
}
let mediaBroken = false;       // the media player's way failed in this run: the SmartX writer until the tool starts again
function backend() {
    const b = String(conf().backend || '');
    return !mediaBroken && (b === 'media-http' || b === 'media-file') ? b : 'smartx';
}
let media = null;
function stopMedia(why, again) {
    const m = media;
    if (!m) return;
    media = null;
    clearInterval(m.timer);
    if (st.writer === m.handle) st.writer = null;
    st.active = false;
    log('media: ' + why + (m.out ? ', ' + m.out.stats() : ''));
    const done = function () { if (again && st.holder) setTimeout(startWriter, 100); };
    if (m.out) m.out.stop().then(done, done); else done();
}
function startMedia(kind) {
    if (!st.holder || st.writer || media) return;
    stopDrain();
    const greedy = st.name === 'airplay';
    const MediaOut = require(path.join(__dirname, 'mediaout.js')).MediaOut;
    const m = { out: null, ready: false, lastData: 0, last: Date.now(), budget: 0, pend: [], pendBytes: 0, part: null, timer: null, said: 0, handle: null };
    m.handle = { kill: function () { stopMedia('the stream is closed', false); } };
    media = m;
    st.writer = m.handle;
    const buf = Buffer.alloc(65536);
    const feed = function (chunk) {
        let b = m.part ? Buffer.concat([m.part, chunk]) : chunk;
        const whole = b.length - (b.length % 4);
        m.part = whole < b.length ? Buffer.from(b.slice(whole)) : null;
        if (!whole) return;
        b = b.slice(0, whole);
        if (!m.out) {
            // the first sound: the media player is asked to play; what comes meanwhile is kept (a second at most)
            st.active = true; st.since = Date.now();
            m.out = new MediaOut({ log: log, mode: kind === 'media-file' ? 'file' : 'http', leadMs: Number(conf().leadMs) || 600, dir: path.join(ROOT, 'media') });
            const t0 = Date.now();
            m.out.start().then(function () {
                if (media !== m) return;
                m.ready = true;
                log('media: started in ' + (Date.now() - t0) + ' ms for "' + st.name + '"');
                m.pend.forEach(function (p) { m.out.write(p); });
                m.pend = []; m.pendBytes = 0;
            }, function (e) {
                log('media: did not start (' + (e && e.message || e) + '): the SmartX writer takes over until the tool starts again');
                mediaBroken = true;
                if (media === m) stopMedia('failed', true);
            });
        }
        if (m.ready) { m.out.write(b); return; }
        m.pend.push(b); m.pendBytes += b.length;
        while (m.pendBytes > 192000 && m.pend.length > 1) m.pendBytes -= m.pend.shift().length;
    };
    m.timer = setInterval(function () {
        if (media !== m || st.fd < 0) return;
        const now = Date.now();
        m.budget = Math.min(19200, m.budget + (now - m.last) * 192);      // bytes the clock allows; no catching up after a pause
        m.last = now;
        let got = 0;
        for (;;) {
            let want = buf.length;
            if (!greedy) { want = Math.min(want, Math.floor(m.budget / 4) * 4); if (want < 4) break; }
            let n = 0;
            try { n = fs.readSync(st.fd, buf, 0, want, null); } catch (e) { break; }      // EAGAIN: nothing waits
            if (!n) break;
            got += n;
            m.budget -= n;
            feed(Buffer.from(buf.slice(0, n)));
            if (n < want) break;
        }
        if (got) m.lastData = now;
        if (m.out && now - m.said > 10000) { m.said = now; st.stats = m.out.stats(); log(st.stats); }
        // three seconds without sound: the speakers go back, and the next sound starts it again
        if (m.out && m.lastData && now - m.lastData > 3000) stopMedia('no sound', true);
    }, 10);
}
function setBackend(m) {
    const value = String(m.value || '');
    if (['smartx', 'media-http', 'media-file'].indexOf(value) < 0) return { ev: 'backend', ok: false, err: 'smartx | media-http | media-file' };
    const next = conf();
    next.backend = value;
    if (m.leadMs !== undefined) { const l = Number(m.leadMs); if (l > 50 && l < 5000) next.leadMs = Math.round(l); }
    try {
        const f = path.join(ROOT, 'config.json');
        fs.writeFileSync(f + '.new', JSON.stringify(next, null, 2) + '\n');
        fs.renameSync(f + '.new', f);
    } catch (e) { return { ev: 'backend', ok: false, err: e.message }; }
    mediaBroken = false;
    log('backend: ' + value + (next.leadMs ? ', lead ' + next.leadMs + ' ms' : ''));
    // what plays now goes on in the new way
    if (media) stopMedia('another backend', true);
    else if (st.writer && typeof st.writer.kill === 'function') { try { st.writer.kill('SIGKILL'); } catch (e) { /* gone */ } }
    return { ev: 'backend', ok: true, backend: backend(), leadMs: next.leadMs || 600 };
}
function startWriter() {
    if (!st.holder || st.writer) return;
    { const kind = backend(); if (kind !== 'smartx') { startMedia(kind); return; } }
    stopDrain();
    let openWatch = null;
    const opts = { stdio: [st.fd, 'ignore', 'pipe'] };
    // (the writer leaves by itself when its opening of the device got three quarters of the pace: see below. After
    // eight such tries in a minute it is told to stay whatever the pace)
    { const now = Date.now(); heals = heals.filter(function (t) { return now - t < 60000; }); if (heals.length >= 8) { opts.env = Object.assign({}, process.env, { G21_AUDIO_NOHEAL: '1' }); log('out: eight openings in a minute at three quarters of the pace: this one stays'); heals = []; } }
    asWriter(opts);
    // AirPlay passes on what a phone sends and throws away what is not taken at once: its writer never holds it.
    // The browser's engine as well: it writes its sound by its own clock and counts a film's time by what it has
    // written, so a writer that held it made the page's film run slow, sound and picture both (car, 2026-11-15:
    // about 25 000 frames a second taken from it instead of 48 000). Every player now writes without being held.
    // (0.1.6 took the browser's sound at once as well. Wrong: with nothing holding it the engine wrote 49 times
    // faster than time passes and the page's film raced: car, 2026-11-15, frames 1005856 dropped 48570080. The
    // engine has no clock of its own for its sound; being held by this writer IS its clock.)
    const child = cp.spawn(OUT, ['play', device()].concat(st.name === 'airplay' ? ['live'] : ['plain']), opts);
    child.g21media = onMedia();
    st.writer = child;
    let buf = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', function (d) {
        buf += d;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
            const l = buf.slice(0, i).replace(/^\[G21-AUDIO\] out: /, '');
            buf = buf.slice(i + 1);
            if (l === 'sound' || l === 'quiet') { st.sound = l === 'sound'; continue; }
            if (l === 'active') {
                st.active = true; st.sound = true; st.since = Date.now(); claim();
                // the writer opens the device now; an open that does not come back would hold the player for ever
                openWatch = setTimeout(function () { log('writer: the device did not open in 4 s, stopping it'); try { child.kill('SIGKILL'); } catch (e) { /* gone */ } }, 4000);
            }
            else if (/^open /.test(l)) { clearTimeout(openWatch); log('out: ' + l); }
            else if (/^frames /.test(l)) st.stats = l;
            else if (l !== 'waiting for sound') log('out: ' + l);
        }
    });
    child.on('error', function (e) { log('writer: ' + e.message); });
    child.on('exit', function (code, sig) {
        clearTimeout(openWatch);
        if (st.writer !== child) return;
        st.writer = null;
        st.active = false;
        // Code 3: this opening of the device took three quarters of the pace (g21-audio-out.c, "The pace"). Not a
        // failure: the writer is started again at once and opens the device anew, the stream stays held meanwhile
        // (nothing is read and dropped: the browser's engine, unheld, races its film).
        // The media input: its device did not open (1) or is not read (4, and the speakers are ours): the CarLife input
        // from here on, the stream held meanwhile.
        if (child.g21media && onMedia() && !sig && (code === 1 || (code === 4 && st.claimed))) {
            fallBack(code === 4 ? 'the device is open and the speakers are ours, but it takes nothing' : 'the device did not open').then(function () { if (st.holder) setTimeout(startWriter, 200); });
            return;
        }
        const pace = code === 3 && !sig;
        if (pace) {
            /*
             * What brings the full pace back is taking our connection away and making it anew: 0.1.15 did that by
             * giving the speakers back each time (it worked, once at the first try, once at the eighth, and the
             * radio played between the tries); 0.1.16 only opened the device again and "reconnected" without the
             * connection ever being gone: eight tries in a row stayed slow (car, 2026-11-20). Now the connection is
             * really taken away, but given to no other source:
             *   tries 1 to 3: connected again first, the device opened after that;
             *   tries 4 to 6: the device opened first, connected 0.4 s later (the order 0.1.15 had);
             *   tries 7 and 8: as 0.1.15, the speakers given back in between (the radio may be heard).
             * The log tells which one it was.
             */
            heals.push(Date.now());
            const n = heals.length, how = n <= 3 ? 'connected first' : (n <= 6 ? 'device first' : 'speakers given back');
            const again = function () { if (st.holder) setTimeout(startWriter, 100); };
            const giveBack = function (e) { if (e) log('speakers: ' + (e && e.message || e)); release('slow device').then(again); };
            log('out: the device took three quarters of the pace, opened again (try ' + n + ', ' + how + ')');
            if (!st.claimed || typeof sp.park !== 'function' || n > 6) { giveBack(); return; }
            if (n <= 3) { sp.park().then(function () { return sp.unpark(); }).then(again, giveBack); return; }
            sp.park().then(function () {
                again();
                setTimeout(function () { sp.unpark().catch(function (e) { log('speakers: not connected again: ' + (e && e.message || e)); st.claimed = false; }); }, 400);
            }, giveBack);
            return;
        }
        if (code || sig) { log('writer exit ' + code + (sig ? ' ' + sig : '')); if (st.holder) startDrain('writer failed'); }
        release(pace ? 'slow device' : 'no sound').then(function () { if (st.holder) setTimeout(startWriter, (code || sig) && !pace ? 2000 : 100); });
    });
}
function closeStream(why) {
    if (!st.holder) return Promise.resolve();
    log('stream "' + st.name + '" closed (' + why + ')');
    st.holder = null;
    const w = st.writer;
    st.writer = null;
    st.active = false;
    if (w) { try { w.kill('SIGKILL'); } catch (e) { /* gone */ } }
    stopDrain();
    if (st.fd >= 0) { try { fs.closeSync(st.fd); } catch (e) { /* closed */ } st.fd = -1; }
    try { fs.unlinkSync(st.fifo); } catch (e) { /* none */ }
    st.fifo = '';
    st.name = '';
    return release(why);
}
/*
 * One stream at a time. A player that asks for it on purpose ("take": true: AirPlay being switched on, the browser
 * starting, a film starting) gets it from another player that is silent at that moment; the other one is told by
 * its connection closing. The browser keeps its stream as long as its engine lives, also when nothing plays:
 * AirPlay switched on meanwhile was answered "busy" and had no sound at all (car, 2026-11-15). A player that
 * only asks again after losing the stream does not say "take", so two silent players do not pass it back and
 * forth.
 */
function openAsk(c, m, send) {
    const other = st.holder && st.holder !== c ? st.holder : null;
    // (silent: its writer does not run, or runs and only holds the channel: nothing heard for 1.5 s)
    if (!other || !m.take || (st.active && st.sound !== false)) { send(openStream(c, m)); return; }
    log('stream "' + st.name + '" is silent' + (st.active ? ' (it only holds the channel)' : '') + ': given to "' + String(m.name || '').slice(0, 24) + '"');
    closeStream('taken by another player').then(function () {
        try { other.destroy(); } catch (e) { /* gone */ }
        send(openStream(c, m));
    }, function () { send(openStream(c, m)); });
}
function openStream(c, m) {
    const name = String(m.name || '');
    const uid = Number(m.uid);
    if (!/^[a-z][a-z0-9-]{1,23}$/.test(name)) return { ev: 'open', ok: false, err: 'bad name' };
    if (!(uid >= 0 && uid < 65535) || Math.floor(uid) !== uid) return { ev: 'open', ok: false, err: 'bad uid' };
    if (!NOSETUID && !ALSA_GID) return { ev: 'open', ok: false, err: 'no group mgu_alsa on this system' };
    if (st.holder && st.holder !== c) return { ev: 'open', ok: false, err: 'busy', holder: st.name };
    if (st.holder === c) return { ev: 'open', ok: true, fifo: st.fifo, format: 's16le', rate: 48000, channels: 2 };
    const fifo = path.join(RUN, name + '.pcm');
    try { fs.unlinkSync(fifo); } catch (e) { /* none */ }
    const mk = cp.spawnSync('mkfifo', ['-m', '0620', fifo]);
    if (mk.status !== 0) return { ev: 'open', ok: false, err: 'mkfifo: ' + String(mk.stderr || (mk.error && mk.error.message) || mk.status).trim() };
    try {
        // the player writes (owner), the writer process reads (group); nobody else
        if (!NOSETUID) fs.chownSync(fifo, uid, ALSA_GID);
        fs.chmodSync(fifo, NOSETUID ? 0o666 : 0o620);
        // held open for reading and writing: the FIFO lives across the player's own opens and closes
        st.fd = fs.openSync(fifo, fs.constants.O_RDWR | fs.constants.O_NONBLOCK);
    } catch (e) { try { fs.unlinkSync(fifo); } catch (x) { /* none */ } return { ev: 'open', ok: false, err: e.message }; }
    st.holder = c;
    st.name = name;
    st.fifo = fifo;
    st.stats = '';
    log('stream "' + name + '" open for uid ' + uid + ': ' + fifo + ' -> ' + device());
    startWriter();
    return { ev: 'open', ok: true, fifo: fifo, format: 's16le', rate: 48000, channels: 2 };
}
function tone(m) {
    if (st.active) return Promise.resolve({ ev: 'tone', ok: false, err: 'a stream is playing' });
    const secs = Math.max(1, Math.min(10, Number(m.seconds) || 2));
    const amp = Math.max(100, Math.min(8000, Number(m.amp) || 2000));
    const t0 = Date.now();
    let held = false;
    return sp.claim().then(function () {
        held = true;
        log('tone: speakers claimed in ' + (Date.now() - t0) + ' ms');
        return new Promise(function (resolve) {
            const opts = { stdio: ['ignore', 'ignore', 'pipe'] };
            asWriter(opts);
            const child = cp.spawn(OUT, ['tone', device(), String(secs), String(amp)], opts);
            let err = '';
            child.stderr.on('data', function (d) { err += d; });
            const kill = setTimeout(function () { try { child.kill('SIGKILL'); } catch (e) { /* gone */ } }, (secs + 4) * 1000);
            child.on('error', function (e) { err += e.message; });
            child.on('exit', function (code) { clearTimeout(kill); resolve({ code: code, said: err.trim().split('\n').pop().replace(/^\[G21-AUDIO\] out: /, '') }); });
        });
    }).then(function (r) {
        log('tone: ' + r.said);
        return { ev: 'tone', ok: r.code === 0, claimMs: Date.now() - t0 - secs * 1000, said: r.said };
    }, function (e) { return { ev: 'tone', ok: false, err: String(e && e.message || e) }; })
        .then(function (reply) { return (held && !st.claimed ? sp.release() : Promise.resolve()).then(function () { return reply; }); });
}
/*
 * probe: how many frames a second the speakers' device takes, for each way of writing (g21-audio-out probe). Silence
 * is written, nothing is heard; the speakers are claimed for it meanwhile (about 30 s), so not while a stream plays.
 */
function probe() {
    if (st.active) return Promise.resolve({ ev: 'probe', ok: false, err: 'a stream is playing' });
    const modes = ['plug480', 'plug1024', 'raw1024', 'block1024'];
    const lines = [];
    let held = false;
    const one = function (mode) {
        return new Promise(function (resolve) {
            const opts = { stdio: ['ignore', 'ignore', 'pipe'] };
            asWriter(opts);
            const child = cp.spawn(OUT, ['probe', device(), mode], opts);
            let err = '';
            child.stderr.on('data', function (d) { err += d; });
            const kill = setTimeout(function () { err += '\n[G21-AUDIO] out: probe ' + mode + ': did not come back in 12 s, stopped'; try { child.kill('SIGKILL'); } catch (e) { /* gone */ } }, 12000);
            child.on('error', function (e) { err += e.message; });
            child.on('exit', function () { clearTimeout(kill); const l = (err.trim().split('\n').pop() || mode + ': nothing said').replace(/^\[G21-AUDIO\] out: /, ''); log(l); lines.push(l); setTimeout(resolve, 600); });
        });
    };
    return sp.claim().then(function () {
        held = true;
        return modes.reduce(function (p, m) { return p.then(function () { return one(m); }); }, Promise.resolve());
    }).then(function () { return { ev: 'probe', ok: true, lines: lines }; }, function (e) { return { ev: 'probe', ok: false, err: String(e && e.message || e), lines: lines }; })
        .then(function (reply) { return (held && !st.claimed ? sp.release() : Promise.resolve()).then(function () { return reply; }, function () { return reply; }); });
}
function caps() {
    return {
        ev: 'caps', version: VERSION,
        stream: { backend: 'smartx', device: device(), formats: ['s16le'], rates: [48000], channels: [2], latencyMs: 64 + 85,
            ops: ['open', 'close', 'tone', 'status'], focus: 'taken at the first sound, given back after 3 s of none',
            not: ['setVolume (the iDrive volume applies)', 'getPosition', 'pause/resume (the player stops writing)', 'float32, 44.1 kHz, mono (the player converts)'] },
        file: { backend: 'bmw-mediaplayer', via: 'jap-ridetube-d (source 1046, MediaPlayer.playFile)', here: false }
    };
}
function status() {
    return { ev: 'status', version: VERSION, backend: backend(), device: device(), stream: st.name || null, active: st.active, sound: st.active && st.sound !== false, claimed: st.claimed,
        activeMs: st.active ? Date.now() - st.since : 0, stats: st.stats, lost: st.lost };
}

function serve() {
    try { fs.mkdirSync(RUN); } catch (e) { /* there */ }
    try { fs.chmodSync(RUN, 0o755); } catch (e) { /* tests */ }
    try { fs.unlinkSync(SOCK); } catch (e) { /* none */ }
    const server = net.createServer(function (c) {
        let buf = '';
        const send = function (o) { try { c.write(JSON.stringify(o) + '\n'); } catch (e) { /* gone */ } };
        c.setEncoding('utf8');
        c.on('data', function (d) {
            buf += d;
            if (buf.length > 8192 && buf.indexOf('\n') < 0) { buf = ''; return; }
            let i;
            while ((i = buf.indexOf('\n')) >= 0) {
                let m = null;
                try { m = JSON.parse(buf.slice(0, i)); } catch (e) { m = null; }
                buf = buf.slice(i + 1);
                if (!m || typeof m.op !== 'string') continue;
                if (m.op === 'caps') send(caps());
                else if (m.op === 'status') send(status());
                else if (m.op === 'open') openAsk(c, m, send);
                else if (m.op === 'close') { if (st.holder === c) closeStream('closed by its player').then(function () { send({ ev: 'closed' }); }); else send({ ev: 'closed' }); }
                else if (m.op === 'tone') tone(m).then(send);
                else if (m.op === 'probe') probe().then(send);
                else if (m.op === 'backend') send(setBackend(m));
            }
        });
        c.on('error', function () { /* close follows */ });
        c.on('close', function () { if (st.holder === c) closeStream('its player went away'); });
    });
    const mask = process.umask(0o177);
    server.listen(SOCK, function () {
        process.umask(mask);
        log('g21-audiod ' + VERSION + ' listening on ' + SOCK + ', device ' + device() + ', source ' + sp.source + ', writer ' + (NOSETUID ? 'as this user' : (onMedia() ? 'root until the device is open, then ' : '') + 'nobody:' + ALSA_GID));
    });
    const stop = function () {
        log('stopping');
        closeStream('daemon stops').then(function () { return sp.release(); }).then(function () { process.exit(0); }, function () { process.exit(0); });
        setTimeout(function () { process.exit(0); }, 4000);
    };
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
    process.on('uncaughtException', function (e) { log('fault: ' + (e && e.stack || e)); });
    process.on('unhandledRejection', function (e) { log('fault: ' + (e && e.stack || e)); });
    // what a crash or a power-off left claimed goes back
    spCar.recover().then(function () { log('speakers checked at start'); });
}

if (require.main === module) {
    if (process.argv[2] === '--check') {
        // mgu-deploy's check: the parts are here and the head unit has what they need
        const need = [OUT, SPEAKERS];
        need.forEach(function (f) { fs.accessSync(f); });
        if (!NOSETUID && !ALSA_GID) { console.error('no group mgu_alsa'); process.exit(1); }
        console.log('g21-audio ok');
        process.exit(0);
    }
    serve();
}
module.exports = { caps: caps };
