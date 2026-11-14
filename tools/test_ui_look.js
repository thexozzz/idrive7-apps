'use strict';

// THEiPlay's menu since 0.1.135: drawn with the renderer's own ops and the Ubuntu atlases (as the
// YouTube screen), not one RECT per pixel of a pixel font. Checked against a fake mgu-render/1 on a
// temporary socket: the atlases go up before the first frame, a frame is small, the same frame is not
// sent twice, a sheet over the page is modal, the two footer buttons change an armed slider.
var assert = require('assert');
var fs = require('fs');
var net = require('net');
var os = require('os');
var path = require('path');

var src = path.join(__dirname, '..', 'apps', 'g21_airplay', 'src');
var menu = require(path.join(src, 'menu_draw.js'));
var i18n = require(path.join(src, 'rt_i18n.js'));

// ---- frames
var air = { on: true, online: true, status: 'połączono', screens: [{ key: 'central', on: true }, { key: 'cluster', on: true }, { key: 'hud', on: false }], mirrored: true, window: { x: 1150, y: 196, w: 660, h: 304 } };
var root = menu.buildFrame(menu.ROOT_ITEMS, 0, 1920, 720, '', 'THEiPlay', '0.1.135', null, null, null, 'THEiPlay', air, null);
assert.ok(root.frame.length < 12000, 'a menu frame is a few kB (was 46 kB of rects): ' + root.frame.length);
assert.ok(root.rects < 200, 'about 100 drawing ops (was about 2000): ' + root.rects);
assert.ok(Array.isArray(root.frame.atlases) && root.frame.atlases.length >= 1, 'the frame names its glyph atlases');
function ops(frame) {
    // the op numbers in a frame, in order (enough of kit/renderd PROTOCOL.md to walk the menu's frames)
    var u = new Uint32Array(frame.buffer.slice(frame.byteOffset + 8, frame.byteOffset + frame.length));
    var seen = {}, i = 0, op, k;
    while (i < u.length) {
        op = u[i]; seen[op] = (seen[op] || 0) + 1;
        if (op === 1) i += 2; else if (op === 2) i += 6; else if (op === 4) i += 7; else if (op === 5) i += 8;
        else if (op === 3) { k = u[i + 5]; i += 6 + k * 2; } else if (op === 6) { k = u[i + 6]; i += 7 + k * 2; }
        else if (op === 8) i += 12; else if (op === 9) i += 7; else if (op === 11) { k = u[i + 3]; i += 4 + k * 8; }
        else if (op === 15) i += 10; else if (op === 19) i += 7;
        else throw new Error('op ' + op + ' at word ' + i);
    }
    return seen;
}
var seen = ops(root.frame);
assert.ok(seen[11] > 5, 'text is GLYPHS');
assert.ok(seen[4] > 5, 'rounded rows and buttons (RRECT)');
assert.ok(!seen[6] && !seen[7] && !seen[10], 'only ops the YouTube screen draws on the car (no CARD, RAMPRECT, TRIS)');
assert.strictEqual(seen[19], 1, 'the AirPlay picture in its window (VIDEO)');
assert.ok((seen[2] || 0) < 10, 'hardly a plain RECT left: ' + (seen[2] || 0));
[['airplay', 1], ['quality-kombi', 3], ['pos-out', 2], ['label', 0], ['settings', 0], ['youtube', 0]].forEach(function (s) {
    var b = menu.buildFrame(menu.SCREENS[s[0]], s[1], 1920, 720, 'stan', 'THEiPlay', '0.1.135', null, null, null, menu.crumbFor(s[0], 'THEiPlay', ''), air, null);
    ops(b.frame);       // walks to the end: every op is one the renderer knows
    assert.ok(b.frame.length < 14000, s[0] + ' frame size ' + b.frame.length);
});
// the caption keeps its pixel font (the option "Czcionka: Pixel"): rects, more of them
var cap = menu.buildFrame(menu.ROOT_ITEMS, 0, 1920, 720, '', 'THEiPlay', '', null, null, { on: true, text: 'G21', x: 1200, y: 300, scale: 4, color: 0xFFFFFFFF }, 'THEiPlay', null, null);
assert.ok(ops(cap.frame)[2] > 20, 'the caption is still drawn in the pixel font');

// ---- words: Polish with its marks; the YouTube screen in THEiPlay's language
var text = fs.readFileSync(path.join(src, 'menu_draw.js'), 'utf8') + fs.readFileSync(path.join(src, 'main.js'), 'utf8');
['wlaczone', 'wylaczone', 'blad lustra', 'iPhone laczy', 'odbiornik spadl', 'AirPlay dziala', 'pokretlo zmienia'].forEach(function (w) {
    assert.ok(text.indexOf("'" + w + "'") === -1 || text.indexOf("'" + w + "':") !== -1, 'no "' + w + '" shown any more');
});
assert.ok(!/draw\.text\('RideTube'/.test(text) && !/hint: 'RideTube'/.test(text), 'the menu says YouTube, not RideTube');
assert.strictEqual(i18n.ui('Subscriptions'), 'Subskrypcje');
assert.strictEqual(i18n.ui('The RideTube service (jap-ridetube-d) is not running'), 'Usługa YouTube w aucie nie działa');
assert.strictEqual(i18n.ui('5 videos'), '5 filmów');
assert.strictEqual(i18n.ui('Skip intro'), 'Pomiń: czołówka');
assert.strictEqual(i18n.ui('Skip the queue at the airport'), 'Skip the queue at the airport', 'a title is left alone');
i18n.setUiLanguage('en');
assert.strictEqual(i18n.ui('Subscriptions'), 'Subscriptions');
assert.strictEqual(i18n.ui('Wyświetl na HUD'), 'Show on the HUD');
i18n.setUiLanguage('pl');
var view = fs.readFileSync(path.join(src, 'rt_view.js'), 'utf8');
assert.ok(/bg: '#090807'/.test(view) && /red: '#e6a15c'/.test(view), "the YouTube screen has THEiPlay's colours");
assert.ok(view.indexOf("'#ff3f8e'") === -1 && view.indexOf("'#3ea6ff'") === -1, 'no pink, no blue left');
assert.ok(/themes\.theme\('theiplay'\)/.test(fs.readFileSync(path.join(src, 'rt_host.js'), 'utf8')), "its settings sheet too");

// ---- the surface against a fake renderer
var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-look-'));
var SOCK = process.platform === 'win32' ? '\\\\.\\pipe\\ui-look-' + process.pid : path.join(dir, 'render.sock');
function msg(type, payload) {
    var b = Buffer.alloc(8 + payload.length + ((4 - (payload.length & 3)) & 3));
    b.writeUInt32LE(type, 0); b.writeUInt32LE(b.length - 8, 4); payload.copy(b, 8);
    return b;
}
function u32(arr) { var b = Buffer.alloc(arr.length * 4); arr.forEach(function (v, i) { b.writeUInt32LE(v >>> 0, i * 4); }); return b; }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
var got = [];       // message types in the order they came
var frames = [];
var conn = null;
var server = net.createServer(function (c) {
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
            if (type === 1) {
                c.write(msg(0x4d520101, u32([1, 0, 3])));
                c.write(msg(101, u32([1, 1920, 720, 1])));
            } else if (type === 7) {
                frames.push(whole);
                c.write(msg(102, u32([frames.length, 0])));
            }
        }
    });
});
function touch(phase, x, y) {
    var b = Buffer.alloc(12);
    b.writeUInt32LE(phase, 0); b.writeFloatLE(x, 4); b.writeFloatLE(y, 8);
    conn.write(msg(105, b));
}
async function tap(box) {
    touch(1, box.x + box.w / 2, box.y + box.h / 2);
    await sleep(30);
    touch(3, box.x + box.w / 2, box.y + box.h / 2);
    await sleep(60);
}

server.listen(SOCK, async function () {
    var chosen = [];
    var adjusted = [];
    var surf = menu.createMenuSurface({
        sockets: [SOCK], version: '0.1.135',
        choose: function (name) { chosen.push(name); },
        adjust: function (name, delta) { adjusted.push([name, delta]); return true; }
    });
    try {
        surf.open();
        await sleep(300);
        var firstFrame = got.indexOf(7);
        assert.ok(firstFrame > 0, 'a frame came');
        assert.ok(got.slice(0, firstFrame).indexOf(4) !== -1, 'ATLAS before the first FRAME');
        assert.ok(frames[0].length < 12000, 'the first frame is small: ' + frames[0].length);
        var atlasCount = got.filter(function (t) { return t === 4; }).length;

        // the same picture again: nothing is sent; a change: one frame, no atlas twice
        var n = frames.length;
        surf.repaint(); surf.repaint(); surf.repaint();
        await sleep(120);
        assert.strictEqual(frames.length, n, 'an identical frame is not sent again');
        surf.setStatus('czeka na iPhone');
        surf.setItemHint('airplay', 'lustro iPhone 2');
        await sleep(350);
        assert.strictEqual(frames.length, n + 1, 'two changes in one turn: one frame');
        assert.strictEqual(got.filter(function (t) { return t === 4; }).length, atlasCount, 'atlases are sent once a connection');

        // "Gdzie pokazać" is modal: a tap where "Wyłącz aplikację" lies under it closes the sheet, not the app
        var st = { on: false, online: false, status: 'wyłączony', screens: [{ key: 'central', on: true }], mirrored: false, window: null };
        surf.setAirState(st);
        await sleep(350);
        var lay = menu.buildFrame(menu.ROOT_ITEMS, 0, 1920, 720, 'czeka na iPhone', '', '0.1.135', null, null, null, 'THEiPlay', st, null).layout;
        var whereBtn = lay.airHits.filter(function (h) { return h.name === 'air-where'; })[0];
        assert.ok(whereBtn && whereBtn.h >= 44, 'the Ekrany button is a finger tall');
        await tap(whereBtn);
        await sleep(300);
        chosen.length = 0;
        await tap(lay.nav.ok);
        await sleep(300);
        assert.ok(chosen.indexOf('app-exit') === -1, 'under the sheet "Wyłącz aplikację" does not answer: ' + chosen.join(','));
        await tap(lay.nav.ok);      // the sheet is closed now: the button works
        await sleep(300);
        assert.ok(chosen.indexOf('app-exit') !== -1, 'with the sheet closed it does');

        // an armed slider: + and - change its value (a finger alone could not before)
        surf.setItems([
            { name: 'pos-x', title: 'Poziomo', hint: 'klik, potem pokrętło', icon: 'grid', adjust: true },
            { name: 'pos-back', title: 'Wstecz', hint: '', icon: 'back' }
        ], 'Pozycja');
        await sleep(350);
        var list = menu.buildFrame([{ name: 'pos-x', title: 'Poziomo', hint: 'x', icon: 'grid', adjust: true }, { name: 'pos-back', title: 'Wstecz', hint: '', icon: 'back' }],
            0, 1920, 720, '', 'Pozycja', '', null, null, null, 'Pozycja', st, null).layout;
        // (two items: the large tiles) the first tile arms it
        await tap(list.bubbles[0]);
        await sleep(300);
        chosen.length = 0;
        await tap(list.nav.right);
        await tap(list.nav.right);
        await tap(list.nav.left);
        await sleep(200);
        assert.deepStrictEqual(adjusted, [['pos-x', 1], ['pos-x', 1], ['pos-x', -1]], 'the footer buttons step the armed slider');
        assert.strictEqual(surf.selectedName(), 'pos-x', 'and the slider stays chosen');
        // held: it repeats
        adjusted.length = 0;
        touch(1, list.nav.right.x + 10, list.nav.right.y + 10);
        await sleep(700);
        touch(3, list.nav.right.x + 10, list.nav.right.y + 10);
        await sleep(200);
        var held = adjusted.length;
        assert.ok(held >= 3, 'held for 0.7 s: several steps (' + held + ')');
        await sleep(300);
        assert.strictEqual(adjusted.length, held, 'released: it stops');

        console.log('test_ui_look OK (' + root.rects + ' ops, ' + root.frame.length + ' B a frame)');
    } finally {
        surf.close();
        server.close();
        if (conn) { conn.destroy(); }
    }
});
