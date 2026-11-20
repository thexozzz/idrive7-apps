'use strict';
// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * G21 Audio's streams (g21-audiod 0.1.22): every player has a pipe of its own for as long as it is connected, and
 * the speakers go to the one that sounds. The real daemon runs here with a stand-in for the speakers
 * (tools/fake_speakers.js) and a stand-in for the PCM writer (this file, --fake-out: it speaks g21-audio-out's
 * lines on stderr and counts what it reads). No sound device, no audio manager: what is tested is who gets the
 * speakers and when, not what is heard in the car.
 * Needs named pipes (mkfifo): on Windows the whole test says SKIP and nothing is reported as passed.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

if (process.argv[2] === '--fake-out') {
    // g21-audio-out play DEVICE live|plain, as far as g21-audiod sees it
    const mode = process.argv[5] || '';
    const note = (t) => { try { fs.appendFileSync(process.env.FAKE_OUT_LOG, Date.now() + ' ' + t + '\n'); } catch (e) { /* no file */ } };
    const say = (t) => process.stderr.write('[G21-AUDIO] out: ' + t + '\n');
    const idle = Number(process.env.G21_AUDIO_IDLE_MS) || 3000;
    const buf = Buffer.alloc(65536);
    // (its own opening of the pipe, not blocking: Node makes the inherited fd 0 a blocking one)
    const fd = fs.openSync('/proc/self/fd/0', fs.constants.O_RDWR | fs.constants.O_NONBLOCK);
    let bytes = 0, active = false, last = Date.now(), loudAt = 0, quiet = false;
    note('start ' + mode + ' ' + process.pid);
    say('waiting for sound');
    process.on('SIGTERM', () => { note('stopped ' + mode + ' ' + bytes); say('stopped, frames ' + (bytes >> 2)); process.exit(0); });
    setInterval(() => {
        const now = Date.now();
        let loud = false;
        for (;;) {
            let n = 0;
            try { n = fs.readSync(fd, buf, 0, buf.length, null); } catch (e) { break; }
            if (!n) break;
            bytes += n; last = now;
            for (let i = 0; i + 1 < n; i += 6) { const v = buf.readInt16LE(i); if (v > 16 || v < -16) { loud = true; break; } }
        }
        if (!active && bytes) { active = true; loudAt = now; say('active'); say('open ' + process.argv[4] + ', S16LE 48000 Hz 2 ch, buffer 250000 us'); note('open ' + mode); }
        if (!active) return;
        if (loud) { loudAt = now; if (quiet) { quiet = false; say('sound'); } }
        else if (!quiet && now - loudAt > 1500) { quiet = true; say('quiet'); }
        if (now - last > idle) { note('idle ' + mode + ' ' + bytes); say('idle, frames ' + (bytes >> 2)); process.exit(0); }
    }, 10);
    return;
}

if (os.platform() === 'win32') { console.log('SKIP test_audio_streams: needs named pipes (run it under Linux: node tools/test_audio_streams.js)'); process.exit(0); }

const assert = require('assert');
const cp = require('child_process');
const net = require('net');
const root = path.join(__dirname, '..');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'g21aud-'));
const run = path.join(base, 'run'), state = path.join(base, 'state');
const spLog = path.join(base, 'speakers.log'), outLog = path.join(base, 'out.log');
fs.mkdirSync(run); fs.mkdirSync(state);
fs.writeFileSync(path.join(state, 'config.json'), JSON.stringify({ holdMs: 3000 }));
const fakeOut = path.join(base, 'fake-out');
fs.writeFileSync(fakeOut, '#!/bin/sh\nexec "' + process.execPath + '" "' + __filename + '" --fake-out "$@"\n');
fs.chmodSync(fakeOut, 0o755);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lines = (f) => { try { return fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean); } catch (e) { return []; } };
const count = (f, re) => lines(f).filter((l) => re.test(l)).length;

let dlog = '';
const daemon = cp.spawn(process.execPath, [path.join(root, 'native', 'g21-audio', 'g21-audiod.js')], { stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, {
    G21_AUDIO_RUN: run, G21_AUDIO_ROOT: state, G21_AUDIO_SPEAKERS: path.join(root, 'tools', 'fake_speakers.js'), G21_AUDIO_DEVICE: 'null', G21_AUDIO_NOSETUID: '1',
    G21_AUDIO_OUT: fakeOut, G21_AUDIO_SETTLE_MS: '0', G21_FAKE_SPEAKERS_LOG: spLog, G21_FAKE_SPEAKERS_LOSE: path.join(base, 'lose'), FAKE_OUT_LOG: outLog }) });
daemon.stdout.on('data', (d) => { dlog += d; });
daemon.stderr.on('data', (d) => { dlog += d; });
const sock = path.join(run, 'ctl.sock');

function client(to) {
    const c = net.connect(to || sock);
    const waiters = [];
    let buf = '';
    c.setEncoding('utf8');
    c.on('error', () => {});
    c.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); const w = waiters.shift(); if (w) w(m); } });
    c.ask = (o) => new Promise((resolve, reject) => { const t = setTimeout(() => reject(new Error('no answer to ' + JSON.stringify(o))), 3000); waiters.push((m) => { clearTimeout(t); resolve(m); }); c.write(JSON.stringify(o) + '\n'); });
    return c;
}
// a player: writes 20 ms of sound (or of silence) every 20 ms into its pipe while it is "on"
function player(fifo) {
    const fd = fs.openSync(fifo, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK);
    const loud = Buffer.alloc(3840), zero = Buffer.alloc(3840);
    for (let i = 0; i < loud.length; i += 2) loud.writeInt16LE(i % 8 < 4 ? 3000 : -3000, i);
    const p = { mode: 'off', sent: 0 };
    p.timer = setInterval(() => { if (p.mode === 'off') return; try { p.sent += fs.writeSync(fd, p.mode === 'loud' ? loud : zero); } catch (e) { /* the pipe is full: dropped */ } }, 20);
    p.end = () => { clearInterval(p.timer); try { fs.closeSync(fd); } catch (e) { /* closed */ } };
    return p;
}
async function until(what, fn, ms) {
    const end = Date.now() + (ms || 6000);
    for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('not in time: ' + what + '\n--- daemon\n' + dlog.split('\n').slice(-25).join('\n') + '\n--- speakers\n' + lines(spLog).join(' ') + '\n--- writer\n' + lines(outLog).join(' | ')); await sleep(60); }
}

(async () => {
    await until('the daemon listens', () => fs.existsSync(sock), 5000);
    const ctl = client();
    const status = () => ctl.ask({ op: 'status' });
    const has = (name) => until('"' + name + '" has the speakers', async () => { const s = await status(); return s.stream === name && s.active && s.claimed ? s : null; });

    // ---- 1. two players, each with a pipe of its own; nobody is refused, nothing is claimed for nothing
    const a = client(), b = client();
    const oa = await a.ask({ op: 'open', name: 'airplay', uid: process.getuid(), take: true });
    const ob = await b.ask({ op: 'open', name: 'chromium', uid: process.getuid(), take: true });
    assert.ok(oa.ok && ob.ok && oa.fifo !== ob.fifo, 'both are given a stream: ' + JSON.stringify([oa, ob]));
    assert.ok(fs.statSync(oa.fifo).isFIFO() && fs.statSync(ob.fifo).isFIFO(), 'both pipes are there');
    assert.deepStrictEqual((await status()).streams, ['airplay', 'chromium']);
    const pa = player(oa.fifo), pb = player(ob.fifo);
    pa.mode = 'zero';
    await sleep(700);
    assert.strictEqual(count(spLog, /^claim/), 0, 'silence (a phone that only mirrors) does not take the speakers');
    assert.strictEqual((await status()).stream, null);
    assert.ok(pa.sent > 60000, 'and a player that is not heard is not held: its pipe is read');
    console.log('ok streams: two players, two pipes; silence takes no speakers and holds nobody');

    // ---- 2. the one that sounds gets the speakers: connected first, the device opened after
    pa.mode = 'loud';
    await has('airplay');
    assert.deepStrictEqual(lines(outLog).map((l) => l.split(' ').slice(1, 3).join(' ')).slice(0, 2), ['start live', 'open live'], 'AirPlay\'s writer');
    const claimedAt = fs.statSync(spLog).mtimeMs, startedAt = Number(lines(outLog)[0].split(' ')[0]);
    assert.ok(startedAt >= claimedAt + 40, 'the writer starts after the speakers are connected (' + Math.round(startedAt - claimedAt) + ' ms after the claim began)');
    // ---- 3. while it sounds the other one is not heard, and is not held either
    pb.mode = 'loud';
    const sentB = pb.sent;
    await sleep(1200);
    assert.strictEqual((await status()).stream, 'airplay', 'a second player does not take the speakers from one that sounds');
    assert.ok(pb.sent - sentB > 150000, 'the browser\'s sound is read at the pace of the clock meanwhile (' + (pb.sent - sentB) + ' bytes in 1.2 s)');
    assert.ok(pb.sent - sentB < 300000, 'and not faster than the clock');
    console.log('ok streams: the one that sounds has the speakers; the other is read and dropped at the clock\'s pace');

    // ---- 4. AirPlay stops, the browser plays: the speakers pass to it, without being given back in between
    pa.mode = 'zero';
    await has('chromium');
    assert.strictEqual(count(spLog, /^release/), 0, 'not given back to the radio on the way');
    assert.strictEqual(count(spLog, /^claim/), 1, 'and not claimed anew');
    assert.ok(/stream "airplay" is silent: the speakers go to "chromium"/.test(dlog), 'said in the log');
    assert.ok(count(outLog, /start plain/) === 1 && count(outLog, /stopped live/) === 1, 'AirPlay\'s writer ended before the browser\'s began: ' + lines(outLog).join(' | '));
    assert.ok(fs.statSync(oa.fifo).isFIFO(), 'AirPlay keeps its pipe');
    // ---- 5. and back: the browser stops, AirPlay plays again (until 0.1.21 it was mute from here on)
    pa.mode = 'loud';
    await sleep(500);
    assert.strictEqual((await status()).stream, 'chromium', 'not while the browser sounds');
    pb.mode = 'off';
    await has('airplay');
    assert.strictEqual(count(outLog, /start live/), 2);
    assert.strictEqual(count(spLog, /^release/), 0);
    console.log('ok streams: AirPlay -> browser -> AirPlay, each heard when the other is silent; the speakers stay ours meanwhile');

    // ---- 6. AirPlay is switched off while it has the speakers: given back; the browser's stream is untouched and sounds next
    a.destroy();
    await until('the speakers are given back', () => count(spLog, /^release/) === 1);
    assert.deepStrictEqual((await status()).streams, ['chromium']);
    assert.ok(!fs.existsSync(oa.fifo) && fs.statSync(ob.fifo).isFIFO(), 'only AirPlay\'s pipe is gone');
    pb.mode = 'loud';
    await has('chromium');
    assert.strictEqual(count(spLog, /^claim/), 2, 'claimed anew for the browser');
    console.log('ok streams: a player that leaves gives the speakers back; the other one gets them at its next sound');

    // ---- 7. only silence for as long as the channel is held: the radio comes back, the stream stays and returns
    pb.mode = 'zero';
    await until('given back after silence', async () => count(spLog, /^release/) === 2 && (await status()).stream === null, 9000);
    assert.ok(/stream "chromium" waits again \(only silence for 3 s\)/.test(dlog) || /stream "chromium" waits again/.test(dlog), 'said in the log');
    assert.ok(fs.statSync(ob.fifo).isFIFO());
    pb.mode = 'loud';
    await has('chromium');
    pb.mode = 'off';
    await until('given back when nothing comes', async () => count(spLog, /^release/) === 3 && (await status()).stream === null, 9000);
    console.log('ok streams: silence gives the speakers back after the hold; the next sound takes them again');

    // ---- 8. the same player again on a new connection (it started anew): the old one is replaced, not "busy"
    const b2 = client();
    const ob2 = await b2.ask({ op: 'open', name: 'chromium', uid: process.getuid() });
    assert.ok(ob2.ok && ob2.fifo === ob.fifo && fs.statSync(ob2.fifo).isFIFO(), JSON.stringify(ob2));
    await sleep(200);
    assert.deepStrictEqual((await status()).streams, ['chromium']);
    assert.ok(fs.statSync(ob2.fifo).isFIFO(), 'the old connection\'s end did not take the new pipe away');
    const pb2 = player(ob2.fifo);
    pb2.mode = 'loud';
    await has('chromium');
    console.log('ok streams: a player that opens its stream again replaces its old one');

    // ---- 8b. another source takes the speakers (the owner picks the radio) while a film sounds: the film's sound is
    // read on at the clock's pace (its page does not stall), nothing is taken back while it sounds, and after a
    // pause its next sound claims the speakers anew
    const rel = count(spLog, /^release/), cl = count(spLog, /^claim/);
    fs.writeFileSync(path.join(base, 'lose'), '');
    await until('the stream waits again after the speakers were lost', async () => { const s = await status(); return s.stream === null && !s.claimed; });
    const sentL = pb2.sent;
    await sleep(2500);
    assert.ok(pb2.sent - sentL > 350000 && pb2.sent - sentL < 620000, 'the player keeps its pace unheard (' + (pb2.sent - sentL) + ' bytes in 2.5 s)');
    assert.strictEqual((await status()).stream, null, 'the speakers are not taken back while it goes on sounding');
    assert.strictEqual(count(spLog, /^release/), rel, 'and nothing is "given back" over the source that has them');
    assert.strictEqual(count(spLog, /^claim/), cl);
    pb2.mode = 'zero';
    await sleep(2000);
    pb2.mode = 'loud';
    await has('chromium');
    console.log('ok streams: speakers lost to another source: the player keeps its pace, nothing is taken back until it has paused');

    pa.end(); pb.end(); pb2.end();
    const gone = new Promise((r) => daemon.on('exit', r));
    daemon.kill('SIGTERM');
    await gone;
    assert.ok(!fs.existsSync(ob2.fifo), 'the daemon leaves no pipe behind');

    // ---- 9. the same with the real writer (native/g21-audio/g21-audio-out, the binary the car gets) on ALSA's
    // "null" device, where this machine can run it: the daemon's lines and the writer's really fit together
    const realOut = path.join(root, 'native', 'g21-audio', 'g21-audio-out');
    const loader = ['/lib/ld-linux-x86-64.so.2', '/lib64/ld-linux-x86-64.so.2'].filter((l) => fs.existsSync(l))[0];
    const bin = path.join(base, 'g21-audio-out');
    fs.copyFileSync(realOut, bin); fs.chmodSync(bin, 0o755);
    const tryIt = loader ? cp.spawnSync(loader, [bin, 'tone', 'null', '1', '100'], { encoding: 'utf8', timeout: 8000 }) : { status: 1, stderr: 'no loader' };
    if (tryIt.status !== 0) console.log('SKIP streams with the real writer: g21-audio-out does not run here (' + String(tryIt.stderr || (tryIt.error && tryIt.error.message) || '').trim().split('\n').pop().slice(0, 100) + ')');
    else {
        const run2 = path.join(base, 'run2'), wrap = path.join(base, 'real-out');
        fs.mkdirSync(run2);
        fs.writeFileSync(wrap, '#!/bin/sh\nexec "' + loader + '" "' + bin + '" "$@"\n'); fs.chmodSync(wrap, 0o755);
        fs.writeFileSync(spLog, '');
        // (above 3 s the real writer holds the channel through a pause and says "quiet" meanwhile, as on the car with 20 s)
        fs.writeFileSync(path.join(state, 'config.json'), JSON.stringify({ holdMs: 6000 }));
        dlog = '';
        const d2 = cp.spawn(process.execPath, [path.join(root, 'native', 'g21-audio', 'g21-audiod.js')], { stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, {
            G21_AUDIO_RUN: run2, G21_AUDIO_ROOT: state, G21_AUDIO_SPEAKERS: path.join(root, 'tools', 'fake_speakers.js'), G21_AUDIO_DEVICE: 'null', G21_AUDIO_NOSETUID: '1',
            G21_AUDIO_OUT: wrap, G21_AUDIO_SETTLE_MS: '0', G21_FAKE_SPEAKERS_LOG: spLog }) });
        d2.stdout.on('data', (d) => { dlog += d; });
        d2.stderr.on('data', (d) => { dlog += d; });
        try {
            const sock2 = path.join(run2, 'ctl.sock');
            await until('the second daemon listens', () => fs.existsSync(sock2), 5000);
            const ctl2 = client(sock2), ra = client(sock2), rb = client(sock2);
            const st2 = () => ctl2.ask({ op: 'status' });
            const has2 = (name) => until('"' + name + '" has the speakers (real writer)', async () => { const s = await st2(); return s.stream === name && s.active && s.claimed ? s : null; });
            const fa = (await ra.ask({ op: 'open', name: 'airplay', uid: process.getuid() })).fifo, fb = (await rb.ask({ op: 'open', name: 'chromium', uid: process.getuid() })).fifo;
            const qa = player(fa), qb = player(fb);
            qa.mode = 'loud';
            await has2('airplay');
            await until('AirPlay\'s frames reach the device', async () => /frames [1-9]\d{4}/.test((await st2()).stats || ''), 9000);
            qb.mode = 'loud'; qa.mode = 'zero';
            await has2('chromium');
            const fr = await until('the browser\'s frames reach the device', async () => { const m = /frames (\d+)/.exec((await st2()).stats || ''); return m && Number(m[1]) > 48000 ? Number(m[1]) : 0; }, 9000);
            qa.mode = 'loud'; qb.mode = 'off';
            await has2('airplay');
            assert.strictEqual(count(spLog, /^release/), 0, 'the speakers stayed ours through both changes');
            assert.strictEqual(count(spLog, /^claim/), 1);
            qa.end(); qb.end();
            console.log('ok streams with the real writer: AirPlay -> browser (' + fr + ' frames written to the device) -> AirPlay on one claim of the speakers');
        } finally { const g2 = new Promise((r) => d2.on('exit', r)); d2.kill('SIGTERM'); await g2; }
    }
    fs.rmSync(base, { recursive: true, force: true });
    console.log('test_audio_streams: ok');
    process.exit(0);
})().catch((e) => { console.error(e && e.stack || e); console.error('--- daemon\n' + dlog.split('\n').slice(-40).join('\n')); try { daemon.kill('SIGKILL'); } catch (x) { /* gone */ } process.exit(1); });
