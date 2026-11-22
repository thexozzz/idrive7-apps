'use strict';
// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * The menu surface against a stand-in renderer: the states of what can be touched (pressed, hover, the knob's focus
 * outside the list), the knob's zones (head, list, foot, a grid's rows), the panel "Ekrany" on every kind of page, the
 * way back that finds its row, a layer over a page of Przeglądarka, the cursor's frame rate.
 */
var assert = require('assert');
var fs = require('fs');
var os = require('os');
var net = require('net');
var path = require('path');
var menu = require(path.join(__dirname, '..', 'apps', 'g21_airplay', 'src', 'menu_draw.js'));

var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-ix-'));
var SOCK = process.platform === 'win32' ? '\\\\.\\pipe\\ui-ix-' + process.pid : path.join(dir, 'render.sock');
function msg(type, payload) {
    var b = Buffer.alloc(8 + payload.length + ((4 - (payload.length & 3)) & 3));
    b.writeUInt32LE(type >>> 0, 0); b.writeUInt32LE(b.length - 8, 4); payload.copy(b, 8);
    return b;
}
function u32(arr) { var b = Buffer.alloc(arr.length * 4); arr.forEach(function (v, i) { b.writeUInt32LE(v >>> 0, i * 4); }); return b; }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
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
            if (buf.length < 8 + len) { break; }
            var whole = buf.slice(0, 8 + len);
            buf = buf.slice(8 + len);
            if (type === 1) { c.write(msg(0x4d520101, u32([1, 0, 3]))); c.write(msg(101, u32([1, 1920, 720, 1]))); }
            else if (type === 7) { frames.push(whole); c.write(msg(102, u32([frames.length, 0]))); }
        }
    });
});
function touch(phase, x, y) { var b = Buffer.alloc(12); b.writeUInt32LE(phase, 0); b.writeFloatLE(x, 4); b.writeFloatLE(y, 8); conn.write(msg(105, b)); }
var op = 500;
function ccu(push, df) { var b = Buffer.alloc(5); b.writeUInt16BE(op & 0xffff, 1); b[3] = push; b[4] = df; conn.write(msg(0x4d520103, b)); }
async function turn(n) { var d = n > 0 ? 1 : -1, i; for (i = 0; i < Math.abs(n); i += 1) { op += d; ccu(0, 0); await sleep(25); } await sleep(40); }
async function push() { ccu(1, 0); await sleep(25); ccu(0, 0); await sleep(60); }
async function tilt(d) { ccu(0, { n: 1, e: 4, s: 7, w: 10 }[d]); await sleep(25); ccu(0, 0); await sleep(60); }
function last() { return frames[frames.length - 1]; }

server.listen(SOCK, async function () {
    var chosen = [];
    var surf = menu.createMenuSurface({ sockets: [SOCK], version: '0.2.1', choose: function (name) { chosen.push(name); } });
    var air = { on: false, online: false, status: 'wyłączony', screens: [{ key: 'central', on: true }, { key: 'cluster', on: false }, { key: 'hud', on: false }], mirrored: false };
    try {
        surf.open();
        surf.setAirState(air);
        await sleep(300);
        ccu(0, 0); await sleep(60);

        // ---- pressed and hover are drawn, and neither chooses
        var lay = menu.buildFrame(menu.ROOT_ITEMS, 0, 1920, 720, '', 'THEiPlay', '0.2.1', null, null, null, 'THEiPlay', air, null).layout;
        var tile = lay.bubbles[2];
        var still = last();
        touch(1, tile.x + 40, tile.y + 40); await sleep(80);
        var down = last();
        assert.ok(!down.equals(still) && down.length > still.length, 'a finger down is drawn (pressed)');
        touch(2, tile.x + 40, 700); await sleep(20); touch(3, 1880, 100); await sleep(80);
        assert.deepStrictEqual(chosen, [], 'a finger that slides off chooses nothing');
        var up = last();
        assert.ok(up.length < down.length, 'and the pressed look is gone with the finger');
        surf.setPointer({ x: 1400, y: 660 }); await sleep(60);
        var away = last();
        var key = lay.airHits[0];
        surf.setPointer({ x: key.x + 20, y: key.y + 20 }); await sleep(80);
        assert.ok(!last().equals(away), 'the cursor over "Ekrany" is drawn (hover)');
        assert.deepStrictEqual(chosen, [], 'a hover chooses nothing');
        // the cursor: at most about 40 frames a second, however fast the pad reports
        var f0 = frames.length, i;
        for (i = 0; i < 120; i += 1) { surf.setPointer({ x: 400 + i * 3, y: 400 }); await sleep(4); }
        await sleep(60);
        assert.ok(frames.length - f0 <= 36 && frames.length - f0 >= 6, 'cursor frames in about 0.6 s: ' + (frames.length - f0));
        f0 = frames.length;
        for (i = 0; i < 20; i += 1) { surf.setPointer({ x: 760, y: 400 }); await sleep(4); }
        await sleep(60);
        assert.ok(frames.length - f0 <= 1, 'a cursor that does not move draws nothing: ' + (frames.length - f0));
        // the knob pressed after the cursor was moved: a click where the cursor is, not on the selected tile
        surf.setPointer({ x: lay.bubbles[0].x + 40, y: lay.bubbles[0].y + 40 }); await sleep(60);
        await push(); await sleep(60);
        assert.deepStrictEqual(chosen, ['youtube'], 'the knob clicks where the cursor points');
        chosen.length = 0;
        // the knob turned: its press is for what it selected again, wherever the cursor rests
        await turn(1); await turn(1);
        await push(); await sleep(60);
        assert.ok(chosen.length === 1 && chosen[0] !== 'youtube', 'after a turn the press is the selected tile\'s: ' + chosen.join());
        chosen.length = 0;
        surf.setPointer(null); await sleep(60);

        // ---- the knob: head, list, foot
        assert.deepStrictEqual(surf.focus().zone, 'list');
        await tilt('n');
        assert.deepStrictEqual([surf.focus().zone, surf.focus().name], ['head', 'base-where'], 'up from the tiles: "Ekrany"');
        var inHead = last();
        assert.ok(inHead.length > up.length - 200, 'a frame with the focus ring');
        await push();
        assert.deepStrictEqual([surf.focus().where, surf.focus().cursor, chosen], ['base', 4, []], 'no module plays: the panel with "Opcje" and the way out only');
        await turn(1); await turn(1); await turn(1);
        assert.ok(surf.focus().cursor === 3 || surf.focus().cursor === 4, 'the knob cannot reach a screen that cannot be chosen');
        if (surf.focus().cursor !== 3) { await turn(1); }
        await push();
        assert.deepStrictEqual([surf.focus().where, surf.focus().zone, surf.focus().name], ['', 'head', 'base-where'], 'the panel closed: the knob is where it was');
        await tilt('s');
        assert.strictEqual(surf.focus().zone, 'list');
        await tilt('s');
        assert.deepStrictEqual([surf.focus().zone, surf.focus().name], ['foot', '@mouse']);
        await turn(1);
        assert.strictEqual(surf.focus().name, '@exit');
        await turn(-1); await push();
        assert.deepStrictEqual(chosen, ['mouse-toggle'], 'a press uses the foot\'s button');
        chosen.length = 0;
        await tilt('n');
        // AirPlay switched on: THEiPlay's own pages offer its screens
        surf.setAirState(Object.assign({}, air, { on: true, status: 'czeka na iPhone' })); await sleep(60);
        await tilt('n'); await push();
        assert.deepStrictEqual([surf.focus().where, surf.focus().cursor], ['air', 0], 'a module plays: its screens');
        await push();
        assert.deepStrictEqual(chosen, ['air-pick-cluster']);
        chosen.length = 0;
        await tilt('s'); await push(); await tilt('s');
        surf.setAirState(air); await sleep(60);

        // ---- a grid: a tilt goes a row up or down; the way back finds its row
        surf.setScreen('system'); await sleep(80);
        assert.strictEqual(surf.selectedName(), 'sg-display');
        await tilt('s');
        assert.strictEqual(surf.selectedName(), 'sg-general', 'the tile below');
        await tilt('e');
        assert.strictEqual(surf.selectedName(), 'system-back', 'the tile beside');
        await tilt('n');
        assert.strictEqual(surf.selectedName(), 'sg-input', 'the tile above');
        await tilt('n');
        assert.strictEqual(surf.focus().zone, 'head', 'above the first row: the head');
        await turn(-1);
        assert.strictEqual(surf.focus().name, '@back');
        await push();
        assert.deepStrictEqual(chosen, ['system-back'], 'the head\'s way back is the page\'s');
        chosen.length = 0;
        await tilt('s');
        await turn(2);
        assert.strictEqual(surf.selectedName(), 'sg-apps');
        surf.setScreen('set-apps'); await sleep(60);
        surf.setScreen('system'); await sleep(60);
        assert.strictEqual(surf.selectedName(), 'sg-apps', 'back from a page: the knob is on the row that led there');
        surf.setScreen('root'); await sleep(60);

        // ---- a layer over a page of Przeglądarka: the menu is drawn and answers, the page's view comes back as it was
        var web = { on: true, connected: true, engine: 'ready', url: 'https://example.org/', title: 'Example', live: true, zoom: 1, w: 1796, h: 548, back: true };
        surf.setWeb(web); await sleep(80);
        var pageFrame = last();
        await push();
        assert.strictEqual(surf.focus().name, 'web-url', 'the knob on the bar');
        surf.setWeb(Object.assign({}, web, { held: true })); await sleep(80);
        assert.ok(!last().equals(pageFrame), 'the menu is drawn over the page');
        assert.strictEqual(surf.snapshot().items[0].name, 'youtube', 'the menu\'s own items, not the browser\'s');
        var selWas = surf.selected();
        await turn(1);
        assert.strictEqual(surf.selected(), selWas + 1, 'the knob is the menu\'s');
        touch(1, 300, 300); await sleep(30); touch(3, 300, 300); await sleep(60);
        assert.ok(chosen.length === 1 && !/^web-/.test(chosen[0]), 'a touch goes to the menu: ' + chosen.join(','));
        chosen.length = 0;
        surf.setWeb(web); await sleep(80);
        assert.ok(surf.snapshot().items[0].name === 'web-back', 'the layer is off: the page\'s view again');
        assert.strictEqual(surf.focus().name, '', 'and the knob is on the page');
        surf.setWeb(null); await sleep(60);
        console.log('test_interaction: ok (' + frames.length + ' frames)');
        surf.close();
        server.close();
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
});
