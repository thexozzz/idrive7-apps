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

const mod = require(SPEAKERS);
const sp = new mod.Speakers({ log: function (t) { log(String(t)); }, record: path.join(RUN, 'speakers.json') });
const device = function () { return DEVICE || ('plug:' + mod.DEVICE); };

// the one stream
const st = { holder: null, name: '', fifo: '', fd: -1, writer: null, active: false, claimed: false, stats: '', since: 0, lost: 0 };
sp.on('lost', function () { st.lost += 1; st.claimed = false; log('speakers lost: another source took them'); });

function claim() {
    if (st.claimed) return;
    st.claimed = true;
    const t0 = Date.now();
    sp.claim().then(function () { log('speakers claimed for "' + st.name + '" in ' + (Date.now() - t0) + ' ms'); },
        function (e) { st.claimed = false; log('speakers not claimed: ' + (e && e.message || e)); });
}
function release(why) {
    if (!st.claimed) return Promise.resolve();
    st.claimed = false;
    return sp.release().then(function () { log('speakers released (' + why + ')'); });
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
function startWriter() {
    if (!st.holder || st.writer) return;
    stopDrain();
    let openWatch = null;
    const opts = { stdio: [st.fd, 'ignore', 'pipe'] };
    if (!NOSETUID) { opts.uid = WRITER_UID; opts.gid = ALSA_GID; }
    // AirPlay passes on what a phone sends and throws away what is not taken at once: its writer never holds it
    const child = cp.spawn(OUT, ['play', device()].concat(st.name === 'airplay' ? ['live'] : []), opts);
    st.writer = child;
    let buf = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', function (d) {
        buf += d;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
            const l = buf.slice(0, i).replace(/^\[G21-AUDIO\] out: /, '');
            buf = buf.slice(i + 1);
            if (l === 'active') {
                st.active = true; st.since = Date.now(); claim();
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
        if (code || sig) { log('writer exit ' + code + (sig ? ' ' + sig : '')); if (st.holder) startDrain('writer failed'); }
        release('no sound').then(function () { if (st.holder) setTimeout(startWriter, code || sig ? 2000 : 100); });
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
    if (!other || !m.take || st.active) { send(openStream(c, m)); return; }
    log('stream "' + st.name + '" is silent: given to "' + String(m.name || '').slice(0, 24) + '"');
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
            if (!NOSETUID) { opts.uid = WRITER_UID; opts.gid = ALSA_GID; }
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
    return { ev: 'status', version: VERSION, backend: 'smartx', device: device(), stream: st.name || null, active: st.active, claimed: st.claimed,
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
            }
        });
        c.on('error', function () { /* close follows */ });
        c.on('close', function () { if (st.holder === c) closeStream('its player went away'); });
    });
    const mask = process.umask(0o177);
    server.listen(SOCK, function () {
        process.umask(mask);
        log('g21-audiod ' + VERSION + ' listening on ' + SOCK + ', device ' + device() + ', writer ' + (NOSETUID ? 'as this user' : 'nobody:' + ALSA_GID));
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
    sp.recover().then(function () { log('speakers checked at start'); });
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
