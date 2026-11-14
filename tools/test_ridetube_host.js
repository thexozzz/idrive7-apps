'use strict';

// RideTube's screen inside THEiPlay (apps/g21_airplay/src/rt_host.js), against a fake mgu-render/1
// renderer and a fake jap-ridetube-d on temporary Unix sockets. No SDK, no car:
//   node tools/test_ridetube_host.js [out-dir]     (out-dir: PNG previews of the frames)
// Checks: one daemon connection, the screen holds the renderer only while open, frames come with
// thumbnails (pictures), Search goes to the keyboard and its text searches, a tile plays with the
// small picture and op 19 video, the THEiPlay rail entry closes the screen, the cluster/HUD keep the
// picture while it is closed.

var assert = require('assert');
var fs = require('fs');
var net = require('net');
var os = require('os');
var path = require('path');

var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-host-'));
// Windows (the owner's PC): named pipes in place of Unix sockets
var PIPE = process.platform === 'win32' ? '\\\\.\\pipe\\rt-host-' + process.pid + '-' : '';
var RSOCK = PIPE ? PIPE + 'render' : path.join(dir, 'render.sock');
var YSOCK = PIPE ? PIPE + 'ctl' : path.join(dir, 'ctl.sock');
var VFILE = path.join(dir, 'video');
process.env.MGU_RENDERD_SOCKET = RSOCK;
process.env.MGU_YT_SOCKET = YSOCK;
process.env.MGU_YT_VIDEO = VFILE;
var outDir = process.argv[2] || '';

var src = path.join(__dirname, '..', 'apps', 'g21_airplay', 'src');
var rideTube = require(path.join(src, 'rt_host.js'));
var rec = require(path.join(src, 'rt_record.js'));
var Canvas = require(path.join(src, 'rt_canvas.js')).Canvas;

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function until(fn, ms, what) {
    var end = Date.now() + (ms || 3000);
    return new Promise(function (resolve, reject) {
        (function look() {
            var v;
            try { v = fn(); } catch (e) { v = false; }
            if (v) { resolve(v); return; }
            if (Date.now() > end) { reject(new Error('timed out: ' + what)); return; }
            setTimeout(look, 10);
        })();
    });
}
function msg(type, payload) {
    var b = Buffer.alloc(8 + payload.length + ((4 - (payload.length & 3)) & 3));
    b.writeUInt32LE(type, 0); b.writeUInt32LE(b.length - 8, 4); payload.copy(b, 8);
    return b;
}
function u32(arr) { var b = Buffer.alloc(arr.length * 4); arr.forEach(function (v, i) { b.writeUInt32LE(v >>> 0, i * 4); }); return b; }
function touchMsg(phase, x, y) { var b = Buffer.alloc(12); b.writeUInt32LE(phase, 0); b.writeFloatLE(x, 4); b.writeFloatLE(y, 8); return msg(105, b); }

// mgu-render/1 as far as the kit needs it: X_READY (touch + controller), READY 1920x720 with touch,
// X_STATE "front" false (as on this G21), a TICK for every FRAME
function fakeRenderer() {
    var r = { conns: 0, open: 0, hellos: [], types: {}, frames: 0, pictures: 0, videos: [], drops: 0, conn: null };
    r.server = net.createServer(function (c) {
        var buf = Buffer.alloc(0);
        r.conns += 1; r.open += 1; r.conn = c;
        c.on('close', function () { r.open -= 1; if (r.conn === c) r.conn = null; });
        c.on('error', function () {});
        c.on('data', function (d) {
            buf = Buffer.concat([buf, d]);
            while (buf.length >= 8) {
                var type = buf.readUInt32LE(0), len = buf.readUInt32LE(4);
                if (buf.length < 8 + len) break;
                var p = buf.slice(8, 8 + len);
                buf = buf.slice(8 + len);
                r.types[type] = (r.types[type] || 0) + 1;
                if (type === 1) {
                    r.hellos.push(p.toString('latin1').split('\0')[0]);
                    c.write(msg(0x4d520101, u32([1, 0, 3])));
                    c.write(msg(101, u32([1, 1920, 720, 1])));
                    c.write(msg(0x4d520102, u32([0, 1, 0])));
                } else if (type === 7) {
                    r.frames += 1;
                    c.write(msg(102, u32([r.frames, 0])));
                } else if (type === 10) {
                    r.pictures += 1;
                } else if (type === 13) {
                    r.videos.push(p.slice(4).toString('latin1').split('\0')[0]);
                } else if (type === 14) {
                    r.drops += 1;
                }
            }
        });
    });
    return new Promise(function (res) { r.server.listen(RSOCK, function () { res(r); }); });
}

function fakeDaemon() {
    var d = { got: [], conn: null, conns: 0 };
    d.server = net.createServer(function (c) {
        var buf = '';
        d.conn = c; d.conns += 1;
        c.setEncoding('utf8');
        c.on('error', function () {});
        c.on('data', function (x) {
            buf += x;
            var i;
            while ((i = buf.indexOf('\n')) >= 0) { d.got.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); }
        });
    });
    d.send = function (o) { d.conn.write(JSON.stringify(o) + '\n'); };
    d.cmds = function (cmd) { return d.got.filter(function (m) { return m.cmd === cmd; }); };
    return new Promise(function (res) { d.server.listen(YSOCK, function () { res(d); }); });
}

function thumb(id, k) {
    var w = 320, h = 180, b = Buffer.alloc(w * h * 4);
    for (var i = 0; i < w * h; i += 1) {
        b[i * 4] = (k * 70 + (i % w)) & 255; b[i * 4 + 1] = (k * 40 + Math.floor(i / w)) & 255; b[i * 4 + 2] = 160; b[i * 4 + 3] = 255;
    }
    return { ev: 'thumb', id: id, w: w, h: h, rgba: b.toString('base64') };
}
var ITEMS = ['Cars review', 'Night drive', 'Podcast 12', 'Track day', 'Trailer'].map(function (t, k) {
    return { id: ('vid' + k + 'xxxxxxxxxx').slice(0, 11), title: t, channel: 'Channel ' + k, duration_s: 300 + k * 61, meta: ['12K views', '1 day ago'] };
});

(async function main() {
    var r = await fakeRenderer();
    var d = await fakeDaemon();
    var notes = [];
    var spellAsked = [];
    var exits = 0;
    var kombi = false;
    var rt = rideTube.createRideTube({
        log: function (t) { notes.push(t); },
        dataDir: dir,
        version: '0.0.0-test',
        spell: function (title) { spellAsked.push(title); return Promise.resolve('cars'); },
        onExit: function () { exits += 1; },
        screen: function () { return false; },
        setScreen: function () {},
        kombiWanted: function () { return kombi; },
        videoRect: function () { return '848x480'; },
    });
    var frames = [];
    var send0 = rt.display._send.bind(rt.display);
    rt.display._send = function (name, out, soft, force) { frames.push(new Uint32Array(out.words())); return send0(name, out, soft, force); };
    function png(name) {
        if (!outDir) return;
        var cv = new Canvas(1600, 520);
        // pictures (thumbnails) as the renderer draws them: nearest pixel into the box
        cv.drawImage = function (data, w, h, x, y, dw, dh) {
            for (var yy = 0; yy < dh; yy += 1) {
                for (var xx = 0; xx < dw; xx += 1) {
                    var tx = Math.round(x + xx), ty = Math.round(y + yy);
                    if (tx < 0 || ty < 0 || tx >= cv.w || ty >= cv.h) continue;
                    var s = (Math.floor(yy * h / dh) * w + Math.floor(xx * w / dw)) * 4, o = (ty * cv.w + tx) * 4;
                    cv.d[o] = data[s]; cv.d[o + 1] = data[s + 1]; cv.d[o + 2] = data[s + 2]; cv.d[o + 3] = 255;
                }
            }
        };
        rec.play(frames[frames.length - 1], cv);
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, name + '.png'), cv.png());
    }

    // one daemon connection (THEiPlay has no second one: the daemon keeps one client)
    await until(function () { return d.cmds('status').length; }, 3000, 'daemon status');
    assert.strictEqual(d.conns, 1);
    assert.ok(rt.model && rt.model.connected, 'the shared model is connected');
    // closed: no renderer connection (the THEiPlay menu has it)
    await sleep(200);
    assert.strictEqual(r.conns, 0, 'no renderer connection while closed');

    rt.open();
    await until(function () { return r.open === 1 && r.frames > 0; }, 3000, 'first frame');
    assert.deepStrictEqual(r.hellos, ['g21_airplay']);
    assert.ok(rt.display.own(), 'the kit runs the screen (mgu-render/1, touch, full layout)');
    // signed in, Home with tiles and thumbnails
    d.send({ ev: 'auth', state: 'signed_in' });
    await until(function () { return d.cmds('feed').length; }, 3000, 'home feed asked');
    d.send({ ev: 'feed', which: 'home', items: ITEMS, shelves: [{ title: 'Recommended', items: ITEMS }] });
    await until(function () { return d.cmds('thumb').length >= 4; }, 3000, 'thumbs asked for drawn tiles');
    d.cmds('thumb').forEach(function (m, k) { d.send(thumb(m.id, k)); });
    await until(function () { return r.pictures >= 4; }, 3000, 'thumbnails sent as pictures');
    await sleep(400);
    png('home');

    // Search (rail): the keyboard, then its text searches
    var searchTile = rt.display.pageTargets.filter(function (t) { return t.key === 'rail:search'; })[0];
    assert.ok(searchTile, 'Search on the rail');
    rt.display.pageTargets.filter(function (t) { return t.key === 'rail:search'; })[0].run();
    await until(function () { return spellAsked.length === 1; }, 2000, 'keyboard asked');
    await until(function () { return d.cmds('search').length; }, 2000, 'search sent');
    assert.strictEqual(d.cmds('search')[0].q, 'cars');
    await until(function () { return r.open === 1 && rt.ui.isVisible('VIEW'); }, 3000, 'screen back after the keyboard');
    d.send({ ev: 'results', q: 'cars', items: ITEMS });
    await sleep(400);
    png('results');

    // a tile plays: the small picture, video op once playing
    var tile = rt.display.pageTargets.filter(function (t) { return /^tile|^res|vid/.test(t.key); })[0] ||
        rt.display.pageTargets.filter(function (t) { return t.key.indexOf('rail:') !== 0; })[0];
    assert.ok(tile, 'a tile to press');
    tile.run();
    await until(function () { return d.cmds('play').length; }, 2000, 'play sent');
    assert.strictEqual(d.cmds('play')[0].rect, '848x480', 'the small decoder picture');
    fs.writeFileSync(VFILE, Buffer.alloc(64));
    d.send({ ev: 'state', state: 'playing', pct: 100, id: d.cmds('play')[0].id, title: 'Cars review' });
    d.send({ ev: 'time', elapsed: 5000, total: 300000 });
    await until(function () { return r.videos.length; }, 3000, 'video to the renderer');
    assert.strictEqual(r.videos[0], VFILE);
    await until(function () { return d.cmds('video').some(function (m) { return m.on === true; }); }, 2000, 'video on');
    await sleep(400);
    png('player');

    // back to the list, then the THEiPlay entry on the rail: the screen closes, the renderer goes
    rt.display.onBack(false);
    await sleep(300);
    var back = rt.display.pageTargets.filter(function (t) { return t.key === 'rail:theiplay'; })[0];
    assert.ok(back, 'THEiPlay entry on the rail');
    back.run();
    assert.strictEqual(exits, 1, 'onExit: THEiPlay menu');
    assert.ok(!rt.isOpen());
    await until(function () { return r.open === 0; }, 2000, 'renderer let go');
    // closed, no gauges: the picture goes off (sound plays on); gauges on: it stays on
    await until(function () { var v = d.cmds('video'); return v.length && v[v.length - 1].on === false; }, 2000, 'video off while closed');
    kombi = true;
    await until(function () { var v = d.cmds('video'); return v[v.length - 1].on === true; }, 2000, 'video on for the cluster/HUD');
    assert.strictEqual(d.conns, 1, 'still one daemon connection');
    var errs = notes.filter(function (n) { return n.indexOf('rt-error') === 0; });
    assert.deepStrictEqual(errs, [], 'no errors');
    console.log('ridetube-host: one daemon link, renderer only while open, thumbnails, search via keyboard, small video, THEiPlay back');
    process.exit(0);
})().catch(function (e) { console.error(e && e.stack || e); process.exit(1); });
