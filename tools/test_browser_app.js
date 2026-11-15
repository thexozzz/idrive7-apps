'use strict';

// "Przeglądarka" in the app (0.1.136): the menu item, the browser screen's frame, touch and knob
// passed to the page, the keyboard's web layouts, the link to g21-browserd (against a fake daemon)
// and main.js's glue. The engine itself is tested by tools/test_browser_tool.js.
var assert = require('assert');
var fs = require('fs');
var net = require('net');
var os = require('os');
var path = require('path');

var root = path.join(__dirname, '..');
var src = path.join(root, 'apps', 'g21_airplay', 'src');
var menu = require(path.join(src, 'menu_draw.js'));
var kb = require(path.join(src, 'knob_keyboard.js'));
var client = require(path.join(src, 'browser_client.js'));
var main = fs.readFileSync(path.join(src, 'main.js'), 'utf8');

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function ops(frame) {
    var u = new Uint32Array(frame.buffer.slice(frame.byteOffset + 8, frame.byteOffset + frame.length));
    var seen = {}, i = 0, op, k;
    seen.video = null;
    while (i < u.length) {
        op = u[i]; seen[op] = (seen[op] || 0) + 1;
        if (op === 1) i += 2; else if (op === 2) i += 6; else if (op === 4) i += 7; else if (op === 5) i += 8;
        else if (op === 3) { k = u[i + 5]; i += 6 + k * 2; } else if (op === 6) { k = u[i + 6]; i += 7 + k * 2; }
        else if (op === 8) i += 12; else if (op === 9) i += 7; else if (op === 11) { k = u[i + 3]; i += 4 + k * 8; }
        else if (op === 15) i += 10; else if (op === 19) { seen.video = new Float32Array(u.buffer, (i + 1) * 4, 4); i += 7; }
        else throw new Error('op ' + op + ' at word ' + i);
    }
    return seen;
}

// ---- the menu: one new item at the end, nothing else moved
assert.deepStrictEqual(menu.ROOT_ITEMS.map(function (i) { return i.name; }), ['airplay', 'youtube', 'label-toggle', 'lang-toggle', 'settings', 'position', 'browser']);
assert.strictEqual(menu.ROOT_ITEMS[6].title, 'Przeglądarka');
var rootFrame = menu.buildFrame(menu.ROOT_ITEMS, 6, 1920, 720, '', 'THEiPlay', '0.1.136', null, null, null, 'THEiPlay', null, null);
assert.ok(rootFrame.layout.count === 7 && rootFrame.rects > 20);

// ---- the browser screen's frame
var page = menu.webLayout(1920, 720).page;
assert.deepStrictEqual(page, { x: 0, y: 84, w: 1920, h: 636 }, 'the page area: the whole width under the toolbar, even sizes');
var live = { connected: true, engine: 'ready', url: 'https://pl.wikipedia.org/wiki/BMW_serii_3', title: 'BMW serii 3 – Wikipedia', live: true, video: true, back: true, fwd: false, zoom: 1.5 };
var f = menu.buildWebFrame(1920, 720, live);
var seen = ops(f.frame);
assert.strictEqual(seen[19], 1, 'the page is the VIDEO op');
assert.deepStrictEqual(Array.prototype.slice.call(seen.video), [0, 84, 1920, 636], 'drawn 1:1 in the page area');
assert.ok(!seen[6] && !seen[7] && !seen[10], 'only ops proven on the car (no CARD, RAMPRECT, TRIS)');
assert.ok(f.frame.length < 8000, 'a small frame: ' + f.frame.length);
var names = f.layout.webHits.map(function (h) { return h.name; });
assert.deepStrictEqual(names, ['web-exit', 'web-back', 'web-reload', 'web-home', 'web-url', 'web-keys', 'web-enter', 'web-zoom-out', 'web-zoom-in', 'app-exit'], 'forward is off without a page ahead');
f.layout.webHits.forEach(function (h) { assert.ok(h.h >= 56 && h.w >= 64 && h.y + h.h <= 84, h.name + ' is a finger wide and inside the toolbar'); });
assert.ok(names.indexOf('app-exit') !== -1, '"Wyłącz aplikację" is on this screen too');
// zoom at its ends
assert.ok(menu.buildWebFrame(1920, 720, Object.assign({}, live, { zoom: 2 })).layout.webHits.every(function (h) { return h.name !== 'web-zoom-in'; }));
assert.ok(menu.buildWebFrame(1920, 720, Object.assign({}, live, { zoom: 1 })).layout.webHits.every(function (h) { return h.name !== 'web-zoom-out'; }));
// no daemon, engine being fetched, engine failed: no video, the way out stays
[{ connected: false, engine: 'off' }, { connected: true, engine: 'downloading', pct: 37 }, { connected: true, engine: 'unpacking', pct: 80 }, { connected: true, engine: 'starting' },
    { connected: true, engine: 'failed', err: 'nie udało się pobrać silnika: sprawdź internet w aucie' }].forEach(function (st) {
    var b = menu.buildWebFrame(1920, 720, Object.assign({ video: true }, st));
    var o = ops(b.frame);
    var n = b.layout.webHits.map(function (h) { return h.name; });
    assert.ok(!o[19], st.engine + ': no video op');
    assert.ok(n.indexOf('web-exit') !== -1 && n.indexOf('app-exit') !== -1, st.engine + ': Menu and "Wyłącz aplikację" answer');
    assert.ok(n.indexOf('web-url') === -1 && n.indexOf('web-back') === -1, st.engine + ': no address, no history yet');
    assert.strictEqual(n.indexOf('web-reload') !== -1, !!st.connected, st.engine + ': reload when there is a daemon to ask');
    assert.strictEqual(n.indexOf('web-sandbox-off'), -1, st.engine + ': no sandbox button unless the daemon asks');
});
// the daemon asks about the sandbox: one button in the page area, a finger wide, below the toolbar
(function () {
    var b = menu.buildWebFrame(1920, 720, { connected: true, engine: 'failed', err: 'system auta nie pozwala na piaskownicę silnika', ask: 'sandbox', video: true });
    var hit = b.layout.webHits.filter(function (h) { return h.name === 'web-sandbox-off'; });
    assert.strictEqual(hit.length, 1, 'the owner can answer');
    assert.ok(hit[0].y >= 84 && hit[0].h >= 56 && hit[0].w >= 200 && hit[0].y + hit[0].h <= 720 && hit[0].x >= 0 && hit[0].x + hit[0].w <= 1920, 'inside the page area');
    assert.ok(/web\.send\(\{ op: 'sandbox-off' \}\)/.test(fs.readFileSync(path.join(__dirname, '..', 'apps', 'g21_airplay', 'src', 'main.js'), 'utf8')), 'main.js sends the answer');
}());

// ---- the keyboard's web layouts
['url', 'text', 'webpass'].forEach(function (mode) {
    var e = kb.createEdit({ mode: mode, value: '' });
    ['@', '.', '-', '/', ':', '?', '=', '&', '%', '#', '_', '+', 'q', '0'].forEach(function (k) { assert.ok(e.keys.indexOf(k) !== -1, mode + ' has ' + k); });
    assert.strictEqual(e.keys[e.keyIndex], 'q', mode + ' starts on a letter');
});
var addr = kb.createEdit({ mode: 'url', value: 'https://example.com/' + new Array(600).join('a') });
assert.strictEqual(addr.value.length, 512, 'an address up to 512 characters');
kb.applyKey(addr, 'DEL'); kb.applyKey(addr, '/');
assert.strictEqual(addr.value.slice(-1), '/');
var secret = kb.createEdit({ mode: 'webpass', value: '' });
kb.applyKey(secret, 'a'); kb.applyKey(secret, '!');
assert.strictEqual(kb.displayValue(secret), '**', 'a page password is masked');
assert.deepStrictEqual(kb.altsFor('z'), ['ź', 'ż'], 'Polish letters by long press');
assert.ok(menu.buildKeyboardFrame(kb.createEdit({ mode: 'url', value: 'wp.pl', title: 'Adres' }), 1920, 720, 'Adres', null, '0.1.136').layout.keys.length >= 55);

// ---- main.js's glue, with a recorded client and menu
function method(name, deps) {
    var m = new RegExp('AirPlayApp\\.prototype\\.' + name + ' = (function \\([^)]*\\) \\{[\\s\\S]*?\\r?\\n\\});').exec(main);
    assert.ok(m, name + ' found');
    return new Function('noteStart', 'browserClient', 'menuDraw', 'return ' + m[1])(function () {}, deps, menu);
}
function glueApp() {
    var sent = [], calls = [], made = [];
    var state = client.blank();
    var deps = {
        blank: client.blank,
        createBrowserClient: function (opts) {
            var c = { opts: opts, open: function (w, h) { calls.push('open ' + w + 'x' + h); }, leave: function () { calls.push('leave'); }, shutdown: function () { calls.push('shutdown'); },
                send: function (o) { sent.push(o); return true; }, state: function () { return state; } };
            made.push(c);
            return c;
        }
    };
    var app = {
        _web: null, _webOn: false, _webIno: 0, _webOpenAt: 0, sent: sent, calls: calls, made: made, web: [], edits: [], rebinds: 0, editing: false,
        setState: function (patch) { state = Object.assign({}, state, patch); },
        tell: function () { made[0].opts.onState(state); },
        _menu: {
            setWeb: function (info) { app.web.push(info); },
            webPage: function () { return menu.webLayout(1920, 720).page; },
            rebindVideo: function () { app.rebinds += 1; },
            startEdit: function (o) { app.edits.push(o); app.editing = true; return true; },
            editing: function () { return app.editing; }
        }
    };
    ['_webClient', '_openBrowser', '_closeBrowser', '_paintWeb', '_onWebState', '_onWebEdit', '_onWebChoice', '_webTouch', '_webScroll'].forEach(function (n) { app[n] = method(n, deps); });
    return app;
}
var a = glueApp();
assert.strictEqual(a._onWebChoice('settings'), false, 'another screen\'s choice is not taken');
assert.strictEqual(a._onWebChoice('web-back'), true);
assert.strictEqual(a.sent.length, 0, 'closed: nothing is sent');
assert.strictEqual(a._onWebChoice('browser'), true);
assert.deepStrictEqual(a.calls, ['open 1920x636']);
assert.ok(a.web[0].on && a.web[0].connected && a.web[0].engine === 'starting', 'the first moments say "Uruchamiam", not "brak narzędzia"');
a.setState({ connected: true, engine: 'ready', url: 'https://wp.pl/', title: 'WP', live: true, ino: 77, zoom: 1.5, ring: '/dev/shm/mgu-video-g21browser' });
a.tell();
assert.strictEqual(a.rebinds, 1, 'a new video file is named to the renderer');
a.tell();
assert.strictEqual(a.rebinds, 1, 'once');
assert.strictEqual(a.web[a.web.length - 1].ring, '/dev/shm/mgu-video-g21browser');
a._onWebChoice('web-back'); a._onWebChoice('web-fwd'); a._onWebChoice('web-home'); a._onWebChoice('web-enter'); a._onWebChoice('web-reload'); a._onWebChoice('web-zoom-in'); a._onWebChoice('web-zoom-out');
assert.deepStrictEqual(a.sent, [{ op: 'back' }, { op: 'fwd' }, { op: 'home' }, { op: 'key', k: 'Enter' }, { op: 'reload' }, { op: 'zoom', z: 1.75 }, { op: 'zoom', z: 1.25 }]);
a.sent.length = 0;
a.setState({ loading: true, zoom: 2 });
a._onWebChoice('web-reload'); a._onWebChoice('web-zoom-in');
assert.deepStrictEqual(a.sent, [{ op: 'stop' }], 'loading: the button stops; at 200% there is no further step');
a.sent.length = 0;
a._onWebChoice('web-url');
assert.ok(a.edits[0].mode === 'url' && a.edits[0].value === 'https://wp.pl/', 'the address keyboard starts with the page\'s address');
a.edits[0].onDone('  '); a.edits[0].onDone('onet.pl');
assert.deepStrictEqual(a.sent, [{ op: 'nav', url: 'onet.pl' }]);
a.sent.length = 0; a.editing = true;
a.made[0].opts.onEdit({ kind: 'text', value: 'x', submit: true });
assert.strictEqual(a.edits.length, 1, 'a keyboard that is open is not replaced');
a.editing = false;
a.made[0].opts.onEdit({ kind: 'password', value: '', submit: false });
assert.ok(a.edits[1].mode === 'webpass' && a.edits[1].title === 'Hasło');
a.edits[1].onDone('tajne');
a.editing = false;
a.made[0].opts.onEdit({ kind: 'search', value: 'bmw', submit: true });
assert.ok(a.edits[2].mode === 'text' && a.edits[2].value === 'bmw');
a.edits[2].onDone('bmw g21');
assert.deepStrictEqual(a.sent, [{ op: 'text', s: 'tajne', replace: true, enter: false }, { op: 'text', s: 'bmw g21', replace: true, enter: true }]);
a.sent.length = 0;
a._webTouch(1, 10.6, 20.2); a._webScroll(0, 96);
assert.deepStrictEqual(a.sent, [{ op: 'touch', p: 1, x: 11, y: 20 }, { op: 'scroll', dx: 0, dy: 96 }]);
a._onWebChoice('web-exit');
assert.ok(a.calls.indexOf('leave') !== -1 && a.web[a.web.length - 1] === null && a._webOn === false, 'Menu: the socket is left, the screen goes back');
a.sent.length = 0;
a._webTouch(1, 1, 1); a._onWebChoice('web-home');
assert.strictEqual(a.sent.length, 0, 'after leaving nothing reaches the page');
assert.ok(/this\._web\.shutdown\(\)/.test(main.slice(main.indexOf('AirPlayApp.prototype._exitApp'))), '"Wyłącz aplikację" stops the engine at once');
assert.ok(!/web-(open|close|up|down|sock)[^']*' \+ [^;]*(url|title)/.test(main), 'no address or title goes to the app log');

// ---- the surface against a fake renderer, the client against a fake daemon
var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-app-'));
var RSOCK = process.platform === 'win32' ? '\\\\.\\pipe\\web-app-r-' + process.pid : path.join(dir, 'render.sock');
var DSOCK = process.platform === 'win32' ? '\\\\.\\pipe\\web-app-d-' + process.pid : path.join(dir, 'ctl.sock');
function msg(type, payload) {
    var b = Buffer.alloc(8 + payload.length + ((4 - (payload.length & 3)) & 3));
    b.writeUInt32LE(type, 0); b.writeUInt32LE(b.length - 8, 4); payload.copy(b, 8);
    return b;
}
function u32(arr) { var b = Buffer.alloc(arr.length * 4); arr.forEach(function (v, i) { b.writeUInt32LE(v >>> 0, i * 4); }); return b; }
var got = [], frames = [], videos = [], conn = null;
var renderer = net.createServer(function (c) {
    var buf = Buffer.alloc(0);
    conn = c;
    c.on('error', function () {});
    c.on('data', function (d) {
        buf = Buffer.concat([buf, d]);
        while (buf.length >= 8) {
            var type = buf.readUInt32LE(0), len = buf.readUInt32LE(4);
            if (buf.length < 8 + len) break;
            var whole = buf.slice(0, 8 + len);
            buf = buf.slice(8 + len);
            got.push(type);
            if (type === 1) { c.write(msg(0x4d520101, u32([1, 0, 3]))); c.write(msg(101, u32([1, 1920, 720, 1]))); }
            else if (type === 7) { frames.push(whole); c.write(msg(102, u32([frames.length, 0]))); }
            else if (type === 13) videos.push(whole.toString('latin1', 12).replace(/\0+$/, ''));
            else if (type === 14) videos.push('drop');
        }
    });
});
function touch(phase, x, y) { var b = Buffer.alloc(12); b.writeUInt32LE(phase, 0); b.writeFloatLE(x, 4); b.writeFloatLE(y, 8); conn.write(msg(105, b)); }
function knob(op, push, df) { var b = Buffer.alloc(5); b.writeUInt16BE(op & 0xffff, 1); b[3] = push; b[4] = df; conn.write(msg(0x4d520103, b)); }

renderer.listen(RSOCK, async function () {
    var chosen = [], touches = [], scrolls = [];
    var surf = menu.createMenuSurface({
        sockets: [RSOCK], version: '0.1.136',
        choose: function (name) { chosen.push(name); },
        onWebTouch: function (p, x, y) { touches.push([p, Math.round(x), Math.round(y)]); },
        onWebScroll: function (dx, dy) { scrolls.push([dx, dy]); }
    });
    var daemon = null, dconn = null, dgot = [];
    var web = null;
    try {
        surf.open();
        await sleep(300);
        assert.ok(frames.length >= 1, 'the menu shows');
        assert.deepStrictEqual(surf.webPage(), { x: 0, y: 84, w: 1920, h: 636 });
        var n = frames.length;
        var st = { on: true, connected: true, engine: 'ready', err: '', url: 'https://wp.pl/', title: 'WP', loading: false, back: true, fwd: false, live: true, zoom: 1.5, editable: false, pct: 100, ring: '/dev/shm/mgu-video-g21browser' };
        surf.setWeb(st);
        await sleep(200);
        assert.strictEqual(frames.length, n + 1, 'the browser screen is one frame');
        assert.strictEqual(ops(frames[frames.length - 1])[19], 1);
        assert.strictEqual(videos[videos.length - 1], '/dev/shm/mgu-video-g21browser', 'the renderer is told the browser\'s video file');
        surf.setWeb(Object.assign({}, st)); surf.repaint();
        await sleep(150);
        assert.strictEqual(frames.length, n + 1, 'the same state: no new frame');
        // toolbar: a tap that ends on the button
        var lay = menu.webLayout(1920, 720);
        touch(1, lay.back.x + 20, lay.back.y + 20); await sleep(30); touch(3, lay.back.x + 22, lay.back.y + 22); await sleep(60);
        touch(1, lay.home.x + 20, lay.home.y + 20); await sleep(30); touch(3, 900, 400); await sleep(60);
        touch(1, lay.fwd.x + 20, lay.fwd.y + 20); await sleep(30); touch(3, lay.fwd.x + 20, lay.fwd.y + 20); await sleep(60);
        assert.deepStrictEqual(chosen, ['web-back'], 'a tap that slides off does nothing; a button that is off does nothing');
        assert.strictEqual(touches.length, 0, 'toolbar taps do not reach the page');
        // the page: down, moves and up in the page's own pixels
        touch(1, 300, 284); await sleep(20); touch(2, 300, 250); await sleep(20); touch(2, 300, 60); await sleep(20); touch(3, 310, 700); await sleep(60);
        assert.deepStrictEqual(touches, [[1, 300, 200], [2, 300, 166], [2, 300, 0], [3, 310, 616]], 'a drag that leaves the page is held at its edge');
        // the knob: turn scrolls, left / right is back / forward, press opens the address
        chosen.length = 0;
        knob(100, 0, 0); await sleep(30); knob(101, 0, 0); await sleep(30); knob(99, 0, 0); await sleep(30);
        assert.ok(scrolls.length === 2 && scrolls[0][1] > 0 && scrolls[1][1] < 0, 'turning scrolls both ways: ' + JSON.stringify(scrolls));
        knob(99, 1, 0); await sleep(30); knob(99, 0, 0); await sleep(60);
        assert.deepStrictEqual(chosen, ['web-url'], 'a press opens the address field');
        // the keyboard over the browser: the page's video is not under it; back after "anuluj"
        var done = [];
        surf.startEdit({ mode: 'url', field: 'web-url', title: 'Adres', value: 'wp.pl', onDone: function (v) { done.push(v); } });
        await sleep(150);
        assert.ok(!ops(frames[frames.length - 1])[19], 'the keyboard frame has no video op');
        assert.strictEqual(videos[videos.length - 1], 'drop', 'and the video file is let go while typing');
        touches.length = 0;
        touch(1, 300, 400); await sleep(20); touch(3, 300, 400); await sleep(60);
        assert.strictEqual(touches.length, 0, 'while typing no touch goes to the page');
        surf.cancelEdit();
        await sleep(150);
        assert.strictEqual(ops(frames[frames.length - 1])[19], 1, 'the page is back after the keyboard');
        assert.strictEqual(videos[videos.length - 1], '/dev/shm/mgu-video-g21browser');
        // leaving: the menu again, the video file let go
        surf.setWeb(null);
        await sleep(200);
        assert.ok(!ops(frames[frames.length - 1])[19] && videos[videos.length - 1] === 'drop', 'Menu: the list again, no browser video');
        touch(1, 300, 284); await sleep(20); touch(3, 300, 284); await sleep(60);
        assert.strictEqual(touches.length, 0);

        // ---- browser_client.js against a fake daemon
        var states = [], edits = [];
        daemon = net.createServer(function (c) {
            var buf = '';
            dconn = c;
            c.setEncoding('utf8');
            c.on('error', function () {});
            c.on('data', function (d) { buf += d; var i; while ((i = buf.indexOf('\n')) >= 0) { dgot.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); } });
            c.write(JSON.stringify({ ev: 'state', engine: 'off' }) + '\n');
        });
        await new Promise(function (r) { daemon.listen(DSOCK, r); });
        web = client.createBrowserClient({ socket: DSOCK, onState: function (s) { states.push(s); }, onEdit: function (e) { edits.push(e); } });
        assert.strictEqual(web.send({ op: 'back' }), false, 'not connected: nothing is sent');
        web.open(1920, 636);
        await sleep(200);
        assert.deepStrictEqual(dgot, [{ op: 'open', w: 1920, h: 636 }], 'connecting says the page area');
        assert.ok(states.length === 1 && states[0].connected && states[0].engine === 'off');
        dconn.write(JSON.stringify({ ev: 'state', engine: 'ready', url: 'https://wp.pl/', title: 'WP', live: true, w: 1920, h: 636, ino: 5, zoom: 1.5, ring: '/dev/shm/mgu-video-g21browser' }) + '\n{"ev":"edit","kind":"search","value":"a","submit":true}\nnot json\n');
        await sleep(100);
        assert.ok(states[1].live && states[1].ino === 5 && states[1].ring === '/dev/shm/mgu-video-g21browser');
        assert.deepStrictEqual(edits, [{ kind: 'search', value: 'a', submit: true, multi: false }]);
        assert.strictEqual(web.send({ op: 'nav', url: 'onet.pl' }), true);
        await sleep(60);
        assert.deepStrictEqual(dgot[1], { op: 'nav', url: 'onet.pl' });
        var closed = false;
        dconn.on('close', function () { closed = true; });
        web.shutdown();
        await sleep(150);
        assert.deepStrictEqual(dgot[dgot.length - 1], { op: 'close' }, '"Wyłącz aplikację": the daemon is told to stop the engine now');
        assert.ok(closed && !web.isOpen() && web.state().connected === false);
        web.open(1920, 636);
        await sleep(200);
        closed = false;
        dconn.on('close', function () { closed = true; });
        dgot.length = 0;
        web.leave();
        await sleep(150);
        assert.ok(closed && dgot.length === 0, 'Menu: the socket just closes (the daemon keeps the page a little)');
        console.log('test_browser_app OK (browser frame ' + f.rects + ' ops, ' + f.frame.length + ' B)');
    } finally {
        if (web) { web.leave(); }
        surf.close();
        renderer.close();
        if (daemon) { daemon.close(); }
        if (conn) { conn.destroy(); }
        if (dconn) { dconn.destroy(); }
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (err) { /* a temp dir */ }
    }
});
