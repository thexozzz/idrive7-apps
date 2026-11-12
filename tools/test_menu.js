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
assert.strictEqual(menu.ROOT_ITEMS.length, 5);
assert.strictEqual(menu.ROOT_ITEMS[0].name, 'airplay');
assert.strictEqual(menu.ROOT_ITEMS[0].hint, 'odbiornik iPhone');
assert.strictEqual(menu.ROOT_ITEMS[1].name, 'windows');
assert.strictEqual(menu.ROOT_ITEMS[1].title, 'Miracast');
assert.strictEqual(menu.ROOT_ITEMS[1].hint, 'odbiornik Win+K');
assert.strictEqual(menu.ROOT_ITEMS[2].name, 'rdp');
assert.strictEqual(menu.ROOT_ITEMS[2].hint, 'odbiornik pulpitu');
assert.strictEqual(menu.ROOT_ITEMS[3].name, 'vnc');
assert.strictEqual(menu.ROOT_ITEMS[3].hint, 'odbiornik VNC');
assert.strictEqual(menu.ROOT_ITEMS[4].name, 'label-toggle');
assert.strictEqual(menu.ROOT_ITEMS[0].icon, 'airplay');
assert.strictEqual(menu.ROOT_ITEMS[1].icon, 'desktop');
assert.strictEqual(menu.ROOT_ITEMS[2].icon, 'host');
assert.strictEqual(menu.ROOT_ITEMS[3].icon, 'grid');
assert.strictEqual(menu.ROOT_ITEMS[4].icon, 'tag');
assert.notStrictEqual(menu.ROOT_ITEMS[0].title, menu.ROOT_ITEMS[1].title);
assert.notStrictEqual(menu.ROOT_ITEMS[1].title, menu.ROOT_ITEMS[2].title);
assert.ok(menu.ICONS.airplay);
assert.ok(menu.ICONS.play);
assert.ok(!menu.ROOT_ITEMS.some(function (item) { return item.name === 'host'; }));
assert.ok(built.layout.bubbles[0].iconPx >= 2);
assert.ok(built.layout.bubbles[0].iconPx <= 4);

var blank = menu.buildFrame([
    { title: ' ', hint: ' ' },
    { title: ' ', hint: ' ' },
    { title: ' ', hint: ' ' },
    { title: ' ', hint: ' ' }
], 0, 1920, 720);
assert.ok(built.rects > blank.rects);

var withStatus = menu.buildFrame(menu.ROOT_ITEMS, 0, 1920, 720, 'UxPlay start');
assert.ok(withStatus.rects > 40);
assert.ok(withStatus.layout.bubbles.length === 5);

var selected = menu.buildFrame(menu.ROOT_ITEMS, 2, 1920, 720, '', 'Menu');
assert.ok(selected.layout.bubbles[2].w > selected.layout.bubbles[1].w);

var air = menu.buildFrame(menu.AIRPLAY_ITEMS, 0, 1920, 720, 'AirPlay start', 'AirPlay');
assert.ok(air.rects > 40);
assert.strictEqual(menu.AIRPLAY_ITEMS.length, 4);
assert.strictEqual(menu.AIRPLAY_ITEMS[0].name, 'air-toggle');
assert.strictEqual(menu.AIRPLAY_ITEMS[0].title, 'WYL');
assert.strictEqual(menu.AIRPLAY_ITEMS[0].icon, 'airplay');
assert.strictEqual(menu.AIRPLAY_ITEMS[0].hint, 'wylaczony');
assert.strictEqual(menu.AIRPLAY_ITEMS[3].name, 'air-back');
assert.ok(menu.AIRPLAY_ITEMS.every(function (item) {
    return item.name !== 'air-start' && item.name !== 'air-stop';
}));
assert.ok(menu.SCREENS.airplay);
assert.ok(menu.WINDOWS_ITEMS);
assert.strictEqual(menu.WINDOWS_ITEMS.length, 4);
assert.strictEqual(menu.WINDOWS_ITEMS[0].name, 'win-toggle');
assert.strictEqual(menu.WINDOWS_ITEMS[0].title, 'WYL');
assert.strictEqual(menu.WINDOWS_ITEMS[0].hint, 'wylaczony');
assert.strictEqual(menu.WINDOWS_ITEMS[1].name, 'win-devices');
assert.ok(menu.WINDOWS_ITEMS.every(function (item) {
    return item.name !== 'win-start' && item.name !== 'win-stop';
}));
assert.ok(menu.SCREENS.windows);
assert.ok(menu.SCREENS['win-devices']);
assert.ok(menu.STREAM_ITEMS);
assert.strictEqual(menu.STREAM_ITEMS[0].name, 'stream-end');
assert.strictEqual(menu.STREAM_ITEMS[0].title, 'Zakoncz');
assert.ok(menu.SCREENS.stream);
var stream = menu.buildFrame(menu.STREAM_ITEMS, 0, 1920, 720, 'stream', 'Stream');
assert.ok(stream.layout.stream);
assert.strictEqual(stream.layout.bubbles.length, 1);
assert.ok(stream.rects < air.rects);
var rdp = menu.buildFrame(menu.RDP_ITEMS, 0, 1920, 720, 'RDP lacze', 'RDP');
assert.strictEqual(rdp.layout.bubbles.length, menu.RDP_ITEMS.length);
assert.strictEqual(menu.RDP_ITEMS[0].name, 'rdp-toggle');
assert.strictEqual(menu.RDP_ITEMS[0].title, 'WYL');
assert.ok(menu.RDP_ITEMS.some(function (item) { return item.name === 'rdp-add'; }));
assert.ok(menu.RDP_ITEMS.some(function (item) { return item.name === 'rdp-edit'; }));
assert.ok(menu.RDP_EDIT_ITEMS.some(function (item) { return item.name === 'rdp-e-ip'; }));
assert.ok(menu.SCREENS['rdp-edit']);
assert.notStrictEqual(menu.RDP_ITEMS[0].name, menu.AIRPLAY_ITEMS[0].name);
assert.ok(menu.SCREENS.rdp);
assert.ok(menu.RDP_ITEMS.every(function (item) { return !!item.icon; }));
var vnc = menu.buildFrame(menu.VNC_ITEMS, 0, 1920, 720, 'VNC lacze', 'VNC');
assert.strictEqual(vnc.layout.bubbles.length, menu.VNC_ITEMS.length);
assert.strictEqual(menu.VNC_ITEMS[0].name, 'vnc-toggle');
assert.strictEqual(menu.VNC_ITEMS[0].title, 'WYL');
assert.strictEqual(menu.VNC_ITEMS[1].name, 'vnc-connect');
assert.ok(menu.VNC_ITEMS.some(function (item) { return item.name === 'vnc-add'; }));
assert.ok(menu.VNC_EDIT_ITEMS);
assert.ok(menu.SCREENS.vnc);
assert.ok(menu.AIRPLAY_ITEMS.every(function (item) { return item.name.indexOf('air-') === 0; }));
assert.ok(menu.RDP_ITEMS.every(function (item) { return item.name.indexOf('rdp-') === 0; }));
assert.ok(menu.VNC_ITEMS.every(function (item) { return item.name.indexOf('vnc-') === 0; }));

assert.strictEqual(menu.encoderStep(null, 4), 0);
assert.strictEqual(menu.encoderStep(1, 2), 1);
assert.strictEqual(menu.encoderStep(65535, 0), 1);
assert.strictEqual(menu.encoderStep(3, 1), -2);
assert.strictEqual(typeof menu.buildKeyboardFrame, 'function');

console.log('test_menu: ok');
