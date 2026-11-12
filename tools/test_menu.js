'use strict';

var assert = require('assert');
var menu = require('../apps/g21_airplay/src/menu_draw.js');

var built = menu.buildFrame(menu.ROOT_ITEMS, 0, 1920, 720);
assert.strictEqual(built.frame.readUInt32LE(0), 7);
assert.strictEqual(built.frame.length, 8 + built.frame.readUInt32LE(4));
assert.strictEqual(built.frame.readUInt32LE(8), 1);
assert.ok(built.rects > 40);
assert.ok(built.layout);
assert.strictEqual(built.layout.bubbles.length, menu.ROOT_ITEMS.length);
assert.strictEqual(menu.ROOT_ITEMS.length, 3);
assert.strictEqual(menu.ROOT_ITEMS[0].name, 'airplay');
assert.strictEqual(menu.ROOT_ITEMS[1].name, 'rdp');
assert.strictEqual(menu.ROOT_ITEMS[2].name, 'vnc');
assert.strictEqual(menu.ROOT_ITEMS[0].icon, 'airplay');
assert.strictEqual(menu.ROOT_ITEMS[1].icon, 'desktop');
assert.strictEqual(menu.ROOT_ITEMS[2].icon, 'grid');
assert.ok(menu.ICONS.airplay);
assert.ok(menu.ICONS.play);
assert.ok(!menu.ROOT_ITEMS.some(function (item) { return item.name === 'host'; }));
assert.ok(built.layout.bubbles[0].iconPx >= 4);

var blank = menu.buildFrame([
    { title: ' ', hint: ' ' },
    { title: ' ', hint: ' ' },
    { title: ' ', hint: ' ' },
    { title: ' ', hint: ' ' }
], 0, 1920, 720);
assert.ok(built.rects > blank.rects);

var withStatus = menu.buildFrame(menu.ROOT_ITEMS, 0, 1920, 720, 'UxPlay start');
assert.ok(withStatus.rects > 40);
assert.ok(withStatus.layout.bubbles.length === 3);

var selected = menu.buildFrame(menu.ROOT_ITEMS, 2, 1920, 720, '', 'Menu');
assert.ok(selected.layout.bubbles[2].w > selected.layout.bubbles[1].w);

var air = menu.buildFrame(menu.AIRPLAY_ITEMS, 0, 1920, 720, 'UxPlay dziala', 'AirPlay');
assert.ok(air.rects > 40);
assert.strictEqual(menu.AIRPLAY_ITEMS.length, 5);
assert.strictEqual(menu.AIRPLAY_ITEMS[0].name, 'air-start');
assert.strictEqual(menu.AIRPLAY_ITEMS[0].title, 'Lustro');
assert.strictEqual(menu.AIRPLAY_ITEMS[0].icon, 'airplay');
assert.strictEqual(menu.AIRPLAY_ITEMS[1].title, 'Stop AP');
assert.strictEqual(menu.AIRPLAY_ITEMS[1].hint, 'Wylacz lustro');
assert.strictEqual(menu.AIRPLAY_ITEMS[4].name, 'air-back');
assert.ok(menu.SCREENS.airplay);
var rdp = menu.buildFrame(menu.RDP_ITEMS, 0, 1920, 720, 'RDP lacze', 'RDP');
assert.strictEqual(rdp.layout.bubbles.length, menu.RDP_ITEMS.length);
assert.strictEqual(menu.RDP_ITEMS.length, 9);
assert.strictEqual(menu.RDP_ITEMS[0].name, 'rdp-connect');
assert.strictEqual(menu.RDP_ITEMS[0].title, 'Polacz');
assert.strictEqual(menu.RDP_ITEMS[0].icon, 'desktop');
assert.strictEqual(menu.RDP_ITEMS[1].title, 'Stop RDP');
assert.strictEqual(menu.RDP_ITEMS[2].name, 'rdp-ip');
assert.strictEqual(menu.RDP_ITEMS[5].name, 'rdp-pass');
assert.strictEqual(menu.RDP_ITEMS[5].hint, 'wpisz pokretlem');
assert.strictEqual(menu.RDP_ITEMS[6].name, 'rdp-cert');
assert.strictEqual(menu.RDP_ITEMS[8].name, 'rdp-back');
assert.strictEqual(typeof menu.buildKeyboardFrame, 'function');
assert.notStrictEqual(menu.RDP_ITEMS[0].title, menu.AIRPLAY_ITEMS[0].title);
assert.ok(menu.SCREENS.rdp);
assert.ok(menu.RDP_ITEMS.every(function (item) { return !!item.icon; }));
var vnc = menu.buildFrame(menu.VNC_ITEMS, 0, 1920, 720, 'VNC lacze', 'VNC');
assert.strictEqual(vnc.layout.bubbles.length, menu.VNC_ITEMS.length);
assert.strictEqual(menu.VNC_ITEMS[0].name, 'vnc-connect');
assert.strictEqual(menu.VNC_ITEMS[1].title, 'Stop VNC');
assert.ok(menu.SCREENS.vnc);
assert.ok(menu.AIRPLAY_ITEMS.every(function (item) { return item.name.indexOf('air-') === 0; }));
assert.ok(menu.RDP_ITEMS.every(function (item) { return item.name.indexOf('rdp-') === 0; }));
assert.ok(menu.VNC_ITEMS.every(function (item) { return item.name.indexOf('vnc-') === 0; }));

assert.strictEqual(menu.encoderStep(null, 4), 0);
assert.strictEqual(menu.encoderStep(1, 2), 1);
assert.strictEqual(menu.encoderStep(65535, 0), 1);
assert.strictEqual(menu.encoderStep(3, 1), -2);

console.log('test_menu: ok');
