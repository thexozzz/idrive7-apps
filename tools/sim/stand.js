'use strict';
// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * tools/sim/stand.js - THEiPlay as a whole on a development machine (Linux / WSL).
 *
 * What runs for real: the app's own main.js with everything it loads (the menu's drawing and input code, the browser
 * client, the settings store, the sessions) and, when asked for, the browser tool's daemon g21-browserd.js with the
 * full engine of tools/browser-bench (a real Chrome, real pages, the real video file).
 * What is stood in for, because it is the car: BMW's SDK (tools/sim/oap-sdk), the renderer mgu-render (a socket that
 * takes the app's frames, answers as the renderer does and sends touches and the controller), G21 Input (the pad as
 * a mouse) and systemd (tools/test_services.js's stand-in). Tools that are not started (the sound, AirPlay's
 * receiver, YouTube's daemon, the gauges' renderer) are simply absent, as on a head unit without them.
 * This is not an emulation of the head unit: no BMW HMI, no SOME/IP, no GPU of the car, another processor. It shows
 * what the app's own code does with its inputs, and how much work that is on this machine.
 *
 *   const stand = await require('./stand.js').start({ repo, dir, browser: true, input: true });
 *   stand.turn(1); stand.push(); stand.tilt('n'); stand.tap(x, y); stand.padMove(dx, dy); stand.padTap();
 *   stand.shot('name');            a PNG of what the centre screen shows (with the page's picture, when there is one)
 *   stand.app / stand.menu         the app object and its menu surface
 */
const fs = require('fs');
const path = require('path');
const net = require('net');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function msg(type, payload) {
    const b = Buffer.alloc(8 + payload.length + ((4 - (payload.length & 3)) & 3));
    b.writeUInt32LE(type >>> 0, 0); b.writeUInt32LE(b.length - 8, 4); payload.copy(b, 8);
    return b;
}
function u32(arr) { const b = Buffer.alloc(arr.length * 4); arr.forEach((v, i) => b.writeUInt32LE(v >>> 0, i * 4)); return b; }
const MAGIC = [15, 16, 19, 255];     // where a video shows: replaced by the video file's picture in a screenshot

async function start(opts) {
    const repo = opts.repo;
    const dir = opts.dir;
    const src = path.join(repo, 'apps', 'g21_airplay', 'src');
    const renderSock = opts.renderSock || '/run/mgu-renderd/renderd.sock';
    const inputSock = '/run/g21-input/ctl.sock';
    const stand = { frames: 0, bytes: 0, frameTimes: [], last: null, videoRect: null, videoFile: '', notes: [], shots: [], op: 100, conn: null, pad: null, daemon: null };
    fs.mkdirSync(path.join(dir, 'app'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'shots'), { recursive: true });

    // ---- the renderer's stand-in
    try { fs.unlinkSync(renderSock); } catch (e) { /* none */ }
    stand.renderer = net.createServer((c) => {
        let buf = Buffer.alloc(0);
        stand.conn = c;
        c.on('error', () => {});
        c.on('data', (d) => {
            buf = buf.length ? Buffer.concat([buf, d]) : d;
            while (buf.length >= 8) {
                const type = buf.readUInt32LE(0), len = buf.readUInt32LE(4);
                if (buf.length < 8 + len) break;
                const whole = buf.slice(0, 8 + len);
                buf = buf.slice(8 + len);
                if (type === 1) { c.write(msg(0x4d520101, u32([1, 0, 3]))); c.write(msg(101, u32([1, 1920, 720, 1]))); }
                else if (type === 7) {
                    stand.frames += 1; stand.bytes += whole.length; stand.last = whole; stand.frameTimes.push(Date.now());
                    if (stand.frameTimes.length > 4000) stand.frameTimes.shift();
                    stand.lastVideoRect = stand.videoRect;
                    // the screen draws it in its own time: at most 60 a second
                    setTimeout(() => { try { c.write(msg(102, u32([stand.frames, 0]))); } catch (e) { /* gone */ } }, 16);
                } else if (type === 13) stand.videoFile = whole.toString('latin1', 12).replace(/\0+$/, '');
                else if (type === 14) stand.videoFile = '';
            }
        });
    });
    await new Promise((r) => stand.renderer.listen(renderSock, r));

    // ---- G21 Input's stand-in: the pad as a mouse
    if (opts.input) {
        fs.mkdirSync(path.dirname(inputSock), { recursive: true });
        try { fs.unlinkSync(inputSock); } catch (e) { /* none */ }
        stand.inputServer = net.createServer((c) => {
            stand.pad = c;
            c.on('error', () => {});
            c.on('data', () => { try { c.write(JSON.stringify({ ev: 'state', on: true, pad: 1, speed: 0, moving: false }) + '\n'); } catch (e) { /* gone */ } });
            c.on('close', () => { if (stand.pad === c) stand.pad = null; });
        });
        await new Promise((r) => stand.inputServer.listen(inputSock, r));
    }

    // ---- the browser tool's daemon, for real, with the stand's engine
    if (opts.browser) {
        const B = opts.bench || '/opt/scr/bench';
        process.env.G21_BROWSER_ROOT = path.join(dir, 'browser');
        process.env.G21_BROWSER_NOSETUID = '1';
        process.env.G21_BROWSER_ALLOW_LOCAL = '1';
        const d = require(path.join(repo, 'native', 'g21-browser', 'g21-browserd.js'));
        stand.makeDaemon = async () => {
            const dm = new d.Daemon(Object.assign({ idleMs: opts.idleMs || 90000, pollMs: 300, wlframe: B + '/g21-wlframe', webframe: B + '/g21-webframe', libDir: B + '/lib' }, opts.daemon || {}));
            dm.prepare = async function () {
                const profile = path.join(dir, 'browser', 'profile'), tmp = path.join(dir, 'browser', 'tmp');
                [profile, tmp].forEach((x) => { fs.mkdirSync(x, { recursive: true, mode: 0o700 }); });
                fs.writeFileSync(path.join(dir, 'fonts.conf'), '<?xml version="1.0"?><fontconfig><dir>/usr/share/fonts</dir><cachedir>' + dir + '/fc</cachedir></fontconfig>');
                this.fullEngine = true;
                return { engine: B + '/engine', binary: 'chrome', kind: 'chrome', profile: profile, tmp: tmp, conf: path.join(dir, 'fonts.conf'), major: '153' };
            };
            dm.engineProcs = function () {
                return fs.readdirSync('/proc').filter((p) => /^\d+$/.test(p)).filter((p) => { try { return fs.readFileSync('/proc/' + p + '/cmdline', 'latin1').indexOf(B + '/engine/chrome') === 0; } catch (e) { return false; } }).map(Number);
            };
            if (opts.apps) {
                // the stand's apps: pages of the test server (no import from git here)
                dm.appUrl = async function (id) { return opts.apps[id] ? opts.apps[id].url : null; };
                dm.appsList = function () { return Object.keys(opts.apps).map((id) => ({ id: id, name: opts.apps[id].name, repo: 'stand/' + id, mouse: 'yes' })); };
                dm.appsPort = 1;
                const startProxy = dm.startProxy;
                dm.startProxy = async function () { const r = await startProxy.apply(this, arguments); this.proxyKey = String(this.proxyKey || '') + ' 127.0.0.1:1'; return r; };
            }
            await dm.start();
            stand.daemon = dm;
            return dm;
        };
        await stand.makeDaemon();
    }

    // ---- the app
    process.env.NODE_PATH = __dirname + (process.env.NODE_PATH ? path.delimiter + process.env.NODE_PATH : '');
    require('module').Module._initPaths();
    process.chdir(path.join(dir, 'app'));
    const record = require(path.join(src, 'rt_record.js'));
    const realVideo = record.Recorder.prototype.video;
    record.Recorder.prototype.video = function (id, x, y, w, h, r) {
        this.roundRect(x, y, w, h, 0, ((MAGIC[0] << 24) | (MAGIC[1] << 16) | (MAGIC[2] << 8) | 255) >>> 0);
        stand.videoRect = { x: x, y: y, w: w, h: h };
        return realVideo.call(this, id, x, y, w, h, r);
    };
    const menuDraw = require(path.join(src, 'menu_draw.js'));
    // how long the app's own code takes to make one frame
    stand.build = { n: 0, ms: 0, max: 0 };
    ['buildFrame', 'buildWebFrame', 'buildKeyboardFrame'].forEach((name) => {
        const real = menuDraw[name];
        menuDraw[name] = function () {
            stand.videoRect = null;
            const t0 = process.hrtime.bigint();
            const out = real.apply(this, arguments);
            const ms = Number(process.hrtime.bigint() - t0) / 1e6;
            stand.build.n += 1; stand.build.ms += ms; if (ms > stand.build.max) stand.build.max = ms;
            return out;
        };
    });
    require(path.join(src, 'main.js'));
    stand.app = global.__SIM_APP;
    for (let i = 0; i < 100 && !(stand.frames && stand.app && stand.app._menu); i++) await sleep(100);
    if (!stand.frames) throw new Error('the app drew nothing in 10 s');
    stand.menu = stand.app._menu;
    stand.record = record;
    stand.Canvas = require(path.join(src, 'rt_canvas.js')).Canvas;

    // ---- inputs, as the renderer and the pad send them
    stand.touch = (phase, x, y) => { const b = Buffer.alloc(12); b.writeUInt32LE(phase, 0); b.writeFloatLE(x, 4); b.writeFloatLE(y, 8); stand.conn.write(msg(105, b)); };
    stand.tap = async (x, y) => { stand.touch(1, x, y); await sleep(40); stand.touch(3, x, y); await sleep(120); };
    const ccu = (push, df) => { const b = Buffer.alloc(5); b.writeUInt16BE(stand.op & 0xffff, 1); b[3] = push; b[4] = df; stand.conn.write(msg(0x4d520103, b)); };
    stand.turn = async (n) => { const d = n > 0 ? 1 : -1; for (let i = 0; i < Math.abs(n); i++) { stand.op += d; ccu(0, 0); await sleep(45); } await sleep(60); };
    stand.push = async () => { ccu(1, 0); await sleep(40); ccu(0, 0); await sleep(140); };
    stand.tilt = async (dir) => { ccu(0, { n: 1, e: 4, s: 7, w: 10 }[dir]); await sleep(40); ccu(0, 0); await sleep(120); };
    stand.padMove = (dx, dy) => { if (stand.pad) stand.pad.write(JSON.stringify({ ev: 'm', dx: dx, dy: dy }) + '\n'); };
    stand.padTap = async () => { if (stand.pad) stand.pad.write(JSON.stringify({ ev: 'tap' }) + '\n'); await sleep(200); };
    stand.sleep = sleep;
    // (the controller's first report only says where its wheel stands)
    ccu(0, 0);
    await sleep(80);
    stand.until = async (what, fn, ms) => { const t = Date.now(); while (Date.now() - t < (ms || 10000)) { if (fn()) return true; await sleep(80); } throw new Error('timeout: ' + what); };

    // ---- a picture of the centre screen
    stand.shot = async (name) => {
        await sleep(120);
        const f = stand.last;
        const words = new Uint32Array(f.buffer.slice(f.byteOffset + 8, f.byteOffset + f.length));
        const cv = new stand.Canvas(1920, 720);
        cv.clear([0, 0, 0, 255]);
        cv.fillRect(0, 0, 1920, 88, [16, 18, 22, 255]);     // what the HMI shows around the app's page
        cv.fillRect(0, 88, 104, 632, [16, 18, 22, 255]);
        record.play(words, cv);
        const vr = stand.lastVideoRect;
        if (vr && stand.videoFile) {
            try {
                const d = fs.readFileSync(stand.videoFile);
                const w = d.readUInt32LE(8), h = d.readUInt32LE(12), slot = d.readUInt32LE(20), fr = w * h * 3 / 2, o = 64 + slot * fr;
                const px = cv.d;
                for (let y = 0; y < vr.h && y < h && vr.y + y < 720; y++) {
                    for (let x = 0; x < vr.w && x < w && vr.x + x < 1920; x++) {
                        const at = ((vr.y + y) * 1920 + vr.x + x) * 4;
                        if (px[at] !== MAGIC[0] || px[at + 1] !== MAGIC[1] || px[at + 2] !== MAGIC[2]) continue;    // something is drawn over the picture here
                        const Y = (d[o + y * w + x] - 16) * 1.164, U = d[o + w * h + (y >> 1) * (w >> 1) + (x >> 1)] - 128, V = d[o + w * h + (w >> 1) * (h >> 1) + (y >> 1) * (w >> 1) + (x >> 1)] - 128;
                        px[at] = Math.max(0, Math.min(255, Y + 1.596 * V)); px[at + 1] = Math.max(0, Math.min(255, Y - 0.392 * U - 0.813 * V)); px[at + 2] = Math.max(0, Math.min(255, Y + 2.017 * U));
                    }
                }
            } catch (e) { /* no picture yet: the dark box stays */ }
        }
        const file = path.join(dir, 'shots', name + '.png');
        fs.writeFileSync(file, cv.png());
        stand.shots.push(name);
        return file;
    };
    // ---- this process's own cost
    stand.usage = () => { const u = process.cpuUsage(); return { cpuMs: (u.user + u.system) / 1000, rssMb: process.memoryUsage().rss / 1048576, frames: stand.frames, bytes: stand.bytes, build: Object.assign({}, stand.build), t: Date.now(), handles: process._getActiveHandles().length }; };
    stand.diff = (a, b) => { const s = (b.t - a.t) / 1000; return { secs: +s.toFixed(1), cpuPct: +(((b.cpuMs - a.cpuMs) / (s * 1000)) * 100).toFixed(1), frames: b.frames - a.frames, fps: +((b.frames - a.frames) / s).toFixed(1), kbPerS: +(((b.bytes - a.bytes) / 1024) / s).toFixed(1),
        buildMs: b.build.n > a.build.n ? +((b.build.ms - a.build.ms) / (b.build.n - a.build.n)).toFixed(2) : 0, builds: b.build.n - a.build.n, rssMb: +b.rssMb.toFixed(1), handles: b.handles }; };
    return stand;
}

module.exports = { start: start, sleep: sleep };
