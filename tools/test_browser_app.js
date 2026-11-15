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

// ---- the menu: three tiles; Przeglądarka is the first tile of Aplikacje
assert.deepStrictEqual(menu.ROOT_ITEMS.map(function (i) { return i.name; }), ['multimedia', 'apps', 'system']);
assert.strictEqual(menu.ROOT_ITEMS[1].title, 'Aplikacje');
assert.strictEqual(menu.APPS_ITEMS[0].title, 'Przeglądarka');
var rootFrame = menu.buildFrame(menu.ROOT_ITEMS, 1, 1920, 720, '', 'THEiPlay', '0.1.136', null, null, null, 'THEiPlay', null, null);
assert.ok(rootFrame.layout.count === 3 && rootFrame.rects > 20);

// ---- the browser screen's frame
var page = menu.webLayout(1920, 720).page;
// inside the area mgu-renderd lets an app claim for touch (104,88 1796x632 on the car): outside it a tap goes to the HMI
assert.deepStrictEqual(page, { x: 104, y: 172, w: 1796, h: 548 }, 'the page area: under the toolbar, inside the claim, width % 4, even height');
var live = { connected: true, engine: 'ready', url: 'https://pl.wikipedia.org/wiki/BMW_serii_3', title: 'BMW serii 3 – Wikipedia', live: true, video: true, back: true, fwd: false, zoom: 1.5 };
var f = menu.buildWebFrame(1920, 720, live);
var seen = ops(f.frame);
assert.strictEqual(seen[19], 1, 'the page is the VIDEO op');
assert.deepStrictEqual(Array.prototype.slice.call(seen.video), [104, 172, 1796, 548], 'drawn 1:1 in the page area');
assert.ok(!seen[6] && !seen[7] && !seen[10], 'only ops proven on the car (no CARD, RAMPRECT, TRIS)');
assert.ok(f.frame.length < 8000, 'a small frame: ' + f.frame.length);
var names = f.layout.webHits.map(function (h) { return h.name; });
assert.deepStrictEqual(names, ['web-exit', 'web-back', 'web-reload', 'web-home', 'web-url', 'web-keys', 'web-enter', 'web-zoom-out', 'web-zoom-in', 'app-exit'], 'forward is off without a page ahead');
f.layout.webHits.forEach(function (h) { assert.ok(h.h >= 56 && h.w >= 64 && h.x >= 104 && h.x + h.w <= 1900 && h.y >= 88 && h.y + h.h <= 172, h.name + ' is a finger wide, inside the toolbar and inside the touch claim'); });
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
    assert.ok(hit[0].y >= 172 && hit[0].h >= 56 && hit[0].w >= 200 && hit[0].y + hit[0].h <= 720 && hit[0].x >= 104 && hit[0].x + hit[0].w <= 1900, 'inside the page area');
    assert.ok(/web\.send\(\{ op: 'sandbox-off' \}\)/.test(fs.readFileSync(path.join(__dirname, '..', 'apps', 'g21_airplay', 'src', 'main.js'), 'utf8')), 'main.js sends the answer');
}());

// ---- Aplikacje: the browser's place in the menu, its screens, the client that only looks
(function () {
    var mainSrc = fs.readFileSync(path.join(__dirname, '..', 'apps', 'g21_airplay', 'src', 'main.js'), 'utf8');
    assert.ok(menu.ROOT_ITEMS.every(function (i) { return i.name !== 'browser'; }) && menu.APPS_ITEMS[0].name === 'browser', 'Przeglądarka is inside Aplikacje');
    assert.ok(/self\._takeWeb\(\);/.test(mainSrc) && /_placeMirrorFaces\(this\._webFrame\.i420, this\._webFrame\.w, this\._webFrame\.h, outs\)/.test(mainSrc), 'the page goes to the cluster and HUD layers AirPlay and YouTube use');
    assert.ok(/createYoutubeFile\(menuDraw\.WEB_FILE\)/.test(mainSrc) && menu.WEB_FILE === '/dev/shm/mgu-video-g21browser');
    assert.ok(/op: 'policy', key: 'picture'/.test(mainSrc) && !/op: 'policy', key: 'sandbox', value: 'off'/.test(mainSrc), 'the menu sets rules through the daemon, never the sandbox off');
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
    return new Function('noteStart', 'browserClient', 'menuDraw', 'inputClient', 'AirPlayApp', 'return ' + m[1])(function () {}, deps, menu, deps.input, { APPS: { chromium: { mouse: 'yes' }, youtube: { mouse: 'yes' } } });
}
function glueApp() {
    var sent = [], calls = [], made = [];
    var state = client.blank();
    var inputLog = [];
    var deps = {
        input: { createInputClient: function (o) { inputLog.push('create'); return { opts: o, on: function (a) { inputLog.push('on ' + a); }, off: function () { inputLog.push('off'); } }; } },
        blank: client.blank,
        createBrowserClient: function (opts) {
            var c = { opts: opts, open: function (w, h) { calls.push('open ' + w + 'x' + h); }, look: function () { calls.push('look'); }, leave: function () { calls.push('leave'); }, shutdown: function () { calls.push('shutdown'); },
                send: function (o) { sent.push(o); return true; }, state: function () { return state; } };
            made.push(c);
            return c;
        }
    };
    var app = {
        _web: null, _webOn: false, _webIno: 0, _webOpenAt: 0, sent: sent, calls: calls, made: made, web: [], edits: [], rebinds: 0, editing: false,
        screen: 'root', hints: {}, faces: [], dropped: [], saved: 0, chosen: [], ring: null, inputLog: inputLog, _mouseOn: true, _appFront: true,
        _menuScreen: function () { return app.screen; },
        _onMenuChoice: function (n) { app.chosen.push(n); },
        _desk: { setWebScreens: function (v) { app.deskWeb = v; }, mouseSpeed: function () { return 3; } },
        _saveDesk: function () { app.saved += 1; },
        _placeMirrorFaces: function (i420, w, h, outs) { app.faces.push([w, h, outs.join(',')]); return true; },
        _dropMirrorFace: function (n) { app.dropped.push(n); },
        _webFile: { pull: function () { var r = app.ring; app.ring = false; return r; } },
        setState: function (patch) { state = Object.assign({}, state, patch); },
        tell: function () { made[0].opts.onState(state); },
        _menu: {
            setWeb: function (info) { app.web.push(info); },
            setScreen: function (n) { app.screen = n; },
            setItemHint: function (n, h) { app.hints[n] = h; },
            repaint: function () {},
            webPage: function () { return menu.webLayout(1920, 720).page; },
            rebindVideo: function () { app.rebinds += 1; },
            startEdit: function (o) { app.edits.push(o); app.editing = true; return true; },
            editing: function () { return app.editing; }
        }
    };
    ['_webClient', '_openBrowser', '_closeBrowser', '_paintWeb', '_onWebState', '_onWebEdit', '_onWebChoice', '_webTouch', '_webScroll', '_onAppsChoice', '_paintApps', '_takeWeb', '_dropWebFaces', '_syncMouse', '_mouseMove', '_mouseButton', '_mouseTap', '_syncStoreMenu', '_storeMouse', '_onStoreApps', '_onStoreProgress', '_paintSystem', '_webFsBox', '_syncWebMouse', '_syncMenuMouse', '_padClient', '_menuMouseMove', '_menuMouseTap', '_mouseScroll', '_endAirplayFor', '_killApp', '_webPageBox', '_mouseBox', '_mouseHome', '_mouseTapMenu', '_padTwo', '_padSwipe', '_paintSysInfo'].forEach(function (n) { app[n] = method(n, deps); });
    return app;
}
// ---- Aplikacje and its Ustawienia; the page on the cluster and the HUD
(function () {
    var g = glueApp();
    assert.strictEqual(g._onAppsChoice('settings'), false, 'another screen\'s choice is not taken');
    assert.ok(g._onAppsChoice('apps') && g.screen === 'apps');
    assert.ok(g._onAppsChoice('multimedia') && g.screen === 'multimedia' && g._onAppsChoice('media-back') && g.screen === 'root', 'Multimedia opens and goes back');
    assert.ok(g._onAppsChoice('system') && g.screen === 'system' && g._onAppsChoice('system-back') && g.screen === 'root', 'Ustawienia opens and goes back');
    assert.ok(g._onAppsChoice('apps') && g._onAppsChoice('apps-store') && g.screen === 'apps-store' && g._onAppsChoice('store-soon') && g._onAppsChoice('store-back') && g.screen === 'apps', 'Sklep says it is to come and goes back');
    assert.ok(g._onAppsChoice('apps-settings') && g.screen === 'system', 'Aplikacje > Ustawienia is the one Ustawienia');
    assert.ok(g._onAppsChoice('sg-display') && g.screen === 'set-display' && g._onAppsChoice('sgd-back') && g.screen === 'system', 'a group opens and goes back');
    assert.ok(g._onAppsChoice('sg-browser') && g.screen === 'apps-settings', 'the group of Przegladarka');
    assert.ok(g.calls.length > 0 && g.calls.every(function (c) { return c === 'look'; }), 'the settings only look at the daemon: no page is opened');
    g.sent.length = 0;
    assert.strictEqual(g.hints['aset-picture'], '—', 'no daemon yet: a dash, not a made-up value');
    g._onAppsChoice('aset-picture');
    assert.strictEqual(g.sent.length, 0, 'and nothing is sent');
    g.setState({ connected: true, pol: { sandbox: 'ask', picture: 0.75, memoryLimitMb: 900 } });
    g.tell();
    assert.deepStrictEqual([g.hints['aset-picture'], g.hints['aset-sandbox'], g.hints['aset-memory']], ['75%', 'pytaj, gdy się nie da', '900 MB']);
    g._onAppsChoice('aset-picture'); g._onAppsChoice('aset-sandbox'); g._onAppsChoice('aset-memory');
    assert.deepStrictEqual(g.sent, [{ op: 'policy', key: 'picture', value: 0.5 }, { op: 'policy', key: 'sandbox', value: 'required' }, { op: 'policy', key: 'memoryLimitMb', value: 1200 }]);
    g.setState({ pol: { sandbox: 'required', picture: 0.5, memoryLimitMb: 1500 } });
    g.sent.length = 0;
    g._onAppsChoice('aset-picture'); g._onAppsChoice('aset-sandbox'); g._onAppsChoice('aset-memory');
    assert.deepStrictEqual(g.sent.map(function (o) { return o.value; }), [1, 'ask', 600], 'the choices go round; the sandbox is never set to off from here');
    // cluster and HUD for the page
    g._onAppsChoice('aset-cluster');
    assert.deepStrictEqual([g._webCluster, !!g._webHud, g.deskWeb, g.saved, g.hints['aset-cluster'], g.hints['aset-hud']], [true, false, { cluster: true, hud: false }, 1, 'włączone', 'wyłączone']);
    g.ring = { i420: Buffer.alloc(6), w: 1332, h: 396 };
    g._takeWeb();
    assert.deepStrictEqual(g.faces, [], 'the browser is not open: nothing goes to the cluster');
    g._webOn = true;
    g.setState({ live: true });
    g.ring = { i420: Buffer.alloc(6), w: 1332, h: 396 };
    g._takeWeb();
    assert.deepStrictEqual(g.faces, [[1332, 396, 'cluster']], 'the page goes to the cluster layer');
    g._webGaugeAt = 0; g._takeWeb();
    assert.strictEqual(g.faces.length, 1, 'the same page is not sent again');
    g._onAppsChoice('aset-hud');
    g._webGaugeAt = 0; g._takeWeb();
    assert.deepStrictEqual(g.faces[1], [1332, 396, 'cluster,hud'], 'HUD switched on: the page goes there too');
    g._ytGaugeFrame = {}; g.ring = { i420: Buffer.alloc(6), w: 1332, h: 396 }; g._webGaugeAt = 0; g._takeWeb();
    assert.strictEqual(g.faces.length, 2, 'a YouTube film has the cluster and the HUD first');
    g._ytGaugeFrame = null;
    g._webOn = false; g._webGaugeAt = 0; g._takeWeb();
    assert.deepStrictEqual(g.dropped, ['cluster', 'hud'], 'the browser closed: its picture leaves the cluster and the HUD');
    g._onAppsChoice('aset-back');
    assert.ok(g.screen === 'system' && g.calls.indexOf('leave') !== -1, 'leaving the group lets the daemon go');
    console.log('ok Aplikacje: Przeglądarka, YouTube, Ustawienia; rules through the daemon; the page on the cluster and the HUD');
}());
// ---- G21 Input: the cursor only in an app with mouse: yes, in front, with the switch on
(function () {
    var g = glueApp();
    g._syncMouse('start');
    assert.ok(!g._mouseActive && g.inputLog.length === 0, 'the menu: no cursor, the daemon is not asked');
    g._onWebChoice('browser');
    assert.ok(!g._mouseActive, 'the engine is not up yet: no cursor');
    g.setState({ connected: true, engine: 'ready', live: true, w: 1776, h: 528 });
    g.tell();
    assert.ok(g._mouseActive, 'the page shows: the cursor is on');
    assert.deepStrictEqual(g.inputLog, ['create', 'on chromium']);
    assert.deepStrictEqual([g._mouseX, g._mouseY], [888, 264], 'it starts in the middle of the page');
    var last = g.web[g.web.length - 1];
    assert.ok(last.mouse && last.cx === 888 && last.cy === 264, 'the screen is told where the cursor is');
    var withCursor = menu.buildWebFrame(1920, 720, Object.assign({}, last, { video: true }));
    var without = menu.buildWebFrame(1920, 720, Object.assign({}, last, { video: true, mouse: false }));
    assert.ok(withCursor.rects > without.rects, 'the cursor is drawn over the page');
    // the finger moves: relative, faster for a fast finger; over the whole screen, not shut inside the page
    g._mouseMove(10, 0);
    assert.ok(g._mouseX > 888 + 10 && g._mouseY === 264, 'the cursor moved right by more than the pad units');
    g._mouseMove(-5000, -5000);
    assert.deepStrictEqual([g._scrX, g._scrY], [0, 0], 'held at the screen edge');
    g._mouseMove(100000, 100000);
    assert.ok(g._scrX >= 1900 && g._scrY >= 700 && g._mouseIn === false, 'past the page: on the screen, outside the page');
    // outside the page a tap is a touch of the menu there, not a click in the page
    g.sent.length = 0;
    g._mouseTap();
    assert.deepStrictEqual(g.sent, [], 'no click goes to the page from outside it');
    g._mouseHome();
    assert.ok(g._mouseIn === true, 'back in the middle of the page');
    // the knob: down and up, one of each; a tap right after the knob is not a second click
    g.sent.length = 0;
    g._mouseButton(true); g._mouseButton(true); g._mouseTap(); g._mouseButton(false); g._mouseTap();
    assert.deepStrictEqual(g.sent.map(function (o) { return o.op + ' ' + o.t; }), ['mouse down', 'mouse up'], 'one press of the knob is one click');
    g._mouseTapAt = 0; g.sent.length = 0;
    g._mouseTap();
    assert.deepStrictEqual(g.sent.map(function (o) { return o.t; }), ['down', 'up'], 'a tap is a click');
    // the switch off: the cursor goes, the daemon is told; on again: it comes back
    g._mouseOn = false; g._syncMouse('switch');
    assert.ok(!g._mouseActive && g.inputLog[g.inputLog.length - 1] === 'off');
    g._mouseButton(true);
    assert.strictEqual(g.sent.length, 2, 'with the mouse off the knob sends no mouse event');
    g._mouseOn = true; g._syncMouse('switch');
    assert.ok(g._mouseActive);
    // not in front, then the browser closed: off both times
    g._appFront = false; g._syncMouse('away');
    assert.ok(!g._mouseActive);
    g._appFront = true; g._syncMouse('front');
    assert.ok(g._mouseActive);
    g._closeBrowser();
    assert.ok(!g._mouseActive && g.inputLog[g.inputLog.length - 1] === 'off', 'the browser closed: the controller is given back');
    // the menu's switch beside "Wyłącz aplikację"
    var root = menu.buildFrame(menu.ROOT_ITEMS, 0, 1920, 720);
    assert.ok(root.layout.nav && root.layout.nav.mouse && root.layout.nav.ok.exit, 'the mouse switch is in the navigation row of a menu page');
    assert.ok(root.layout.nav.mouse.x + root.layout.nav.mouse.w <= root.layout.nav.left.x && root.layout.nav.mouse.w >= 64, 'left of the arrows, a finger wide');
    console.log('ok G21 Input: cursor only in a mouse: yes app that is in front and ready; relative movement; one click per press; the switch');
}());
var a = glueApp();
assert.strictEqual(a._onWebChoice('settings'), false, 'another screen\'s choice is not taken');
assert.strictEqual(a._onWebChoice('web-back'), true);
assert.strictEqual(a.sent.length, 0, 'closed: nothing is sent');
assert.strictEqual(a._onWebChoice('browser'), true);
assert.deepStrictEqual(a.calls, ['open 1796x548']);
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
        assert.deepStrictEqual(surf.webPage(), { x: 104, y: 172, w: 1796, h: 548 });
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
        // the renderer closes the surface (the HMI was touched): the next frame shows, claims and names the video again
        var before = got.length, vids = videos.length;
        conn.write(msg(106, Buffer.alloc(0)));
        await sleep(60);
        surf.setWeb(Object.assign({}, st, { title: 'WP 2' }));
        await sleep(200);
        var again = got.slice(before);
        assert.ok(again.indexOf(3) !== -1 && again.indexOf(9) !== -1, 'after CLOSED the surface is shown and claimed again: ' + again.join(','));
        assert.strictEqual(videos.length, vids + 1, 'and the video file is named again');
        assert.strictEqual(videos[videos.length - 1], '/dev/shm/mgu-video-g21browser');
        surf.setWeb(st);
        await sleep(200);
        n = frames.length - 1;
        // toolbar: a tap that ends on the button
        var lay = menu.webLayout(1920, 720);
        touch(1, lay.back.x + 20, lay.back.y + 20); await sleep(30); touch(3, lay.back.x + 22, lay.back.y + 22); await sleep(60);
        touch(1, lay.home.x + 20, lay.home.y + 20); await sleep(30); touch(3, 900, 400); await sleep(60);
        touch(1, lay.fwd.x + 20, lay.fwd.y + 20); await sleep(30); touch(3, lay.fwd.x + 20, lay.fwd.y + 20); await sleep(60);
        assert.deepStrictEqual(chosen, ['web-back'], 'a tap that slides off does nothing; a button that is off does nothing');
        assert.strictEqual(touches.length, 0, 'toolbar taps do not reach the page');
        // the page: down, moves and up in the page's own pixels
        touch(1, 404, 372); await sleep(20); touch(2, 404, 338); await sleep(20); touch(2, 404, 100); await sleep(20); touch(3, 414, 719); await sleep(60);
        assert.deepStrictEqual(touches, [[1, 300, 200], [2, 300, 166], [2, 300, 0], [3, 310, 547]], 'a drag that leaves the page is held at its edge');
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
        assert.deepStrictEqual(dgot, [{ op: 'open', w: 1920, h: 636 }, { op: 'apps' }], 'connecting says the page area and asks for the apps from Sklep');
        assert.ok(states.length === 1 && states[0].connected && states[0].engine === 'off');
        dconn.write(JSON.stringify({ ev: 'state', engine: 'ready', url: 'https://wp.pl/', title: 'WP', live: true, w: 1920, h: 636, ino: 5, zoom: 1.5, ring: '/dev/shm/mgu-video-g21browser' }) + '\n{"ev":"edit","kind":"search","value":"a","submit":true}\nnot json\n');
        await sleep(100);
        assert.ok(states[1].live && states[1].ino === 5 && states[1].ring === '/dev/shm/mgu-video-g21browser');
        assert.deepStrictEqual(edits, [{ kind: 'search', value: 'a', submit: true, multi: false }]);
        assert.strictEqual(web.send({ op: 'nav', url: 'onet.pl' }), true);
        await sleep(60);
        assert.deepStrictEqual(dgot[2], { op: 'nav', url: 'onet.pl' });
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
