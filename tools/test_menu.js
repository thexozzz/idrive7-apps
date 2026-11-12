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
assert.strictEqual(menu.ROOT_ITEMS.length, 2);
assert.strictEqual(menu.ROOT_ITEMS[0].name, 'airplay');
assert.strictEqual(menu.ROOT_ITEMS[0].hint, 'lustro iPhone');
assert.strictEqual(menu.ROOT_ITEMS[1].name, 'label-toggle');
assert.strictEqual(menu.ROOT_ITEMS[0].icon, 'airplay');
assert.strictEqual(menu.ROOT_ITEMS[1].icon, 'tag');
assert.notStrictEqual(menu.ROOT_ITEMS[0].title, menu.ROOT_ITEMS[1].title);
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
assert.ok(withStatus.layout.bubbles.length === menu.ROOT_ITEMS.length);
var withVer = menu.buildFrame(menu.ROOT_ITEMS, 0, 1920, 720, 'UxPlay start', 'G21', '0.1.70');
assert.ok(withVer.rects > withStatus.rects);

var selected = menu.buildFrame(menu.AIRPLAY_ITEMS, 2, 1920, 720, '', 'Menu');
assert.strictEqual(selected.layout.bubbles[2].selected, true);
assert.strictEqual(selected.layout.bubbles[1].selected, false);
var many = [];
var n;
for (n = 0; n < 9; n += 1) {
    many.push({ name: 'row-' + n, title: 'Pozycja ' + n, hint: 'opis', icon: 'play' });
}
var scrolled = menu.buildFrame(many, 8, 1920, 720, '', 'Lista');
assert.ok(scrolled.layout.bubbles.length < many.length);
assert.strictEqual(scrolled.layout.bubbles[scrolled.layout.bubbles.length - 1].index, 8);
assert.ok(scrolled.layout.first > 0);
assert.ok(scrolled.layout.bubbles[0].y >= scrolled.layout.oy);

var air = menu.buildFrame(menu.AIRPLAY_ITEMS, 0, 1920, 720, 'AirPlay start', 'AirPlay');
assert.ok(air.rects > 40);
assert.strictEqual(menu.AIRPLAY_ITEMS.length, 6);
assert.strictEqual(menu.AIRPLAY_ITEMS[0].name, 'air-toggle');
assert.strictEqual(menu.AIRPLAY_ITEMS[0].title, 'Start');
assert.strictEqual(menu.AIRPLAY_ITEMS[0].icon, 'play');
assert.strictEqual(menu.AIRPLAY_ITEMS[0].hint, 'włącz lustro');
assert.strictEqual(menu.AIRPLAY_ITEMS[1].name, 'air-screen');
assert.strictEqual(menu.AIRPLAY_ITEMS[2].name, 'air-quality');
assert.strictEqual(menu.AIRPLAY_ITEMS[5].name, 'air-back');
assert.strictEqual(menu.AIR_OUT_ITEMS[0].title, 'Środek');
assert.ok(!menu.AIR_OUT_ITEMS.some(function (item) { return item.name === 'air-out-start'; }));
assert.ok(menu.AIRPLAY_ITEMS.every(function (item) {
    return item.name !== 'air-start' && item.name !== 'air-stop';
}));
assert.ok(menu.SCREENS.airplay);
assert.ok(menu.SCREENS['air-out']);
assert.strictEqual(menu.AIR_OUT_ITEMS[0].name, 'air-out-central');
assert.strictEqual(menu.AIR_OUT_ITEMS[1].name, 'air-out-hud');
assert.strictEqual(menu.AIR_OUT_ITEMS[2].name, 'air-out-cluster');
assert.strictEqual(menu.AIR_OUT_ITEMS[3].name, 'air-area');
assert.ok(menu.SCREENS.label);
assert.ok(menu.STREAM_ITEMS);
assert.strictEqual(menu.STREAM_ITEMS[0].name, 'stream-end');
assert.strictEqual(menu.STREAM_ITEMS[0].title, 'Zakończ');
assert.ok(menu.SCREENS.stream);
var stream = menu.buildFrame(menu.STREAM_ITEMS, 0, 1920, 720, 'stream', 'Stream');
assert.ok(stream.layout.stream);
assert.strictEqual(stream.layout.bubbles.length, 1);
assert.ok(stream.rects < air.rects);
assert.ok(menu.AIRPLAY_ITEMS.every(function (item) { return item.name.indexOf('air-') === 0; }));

assert.strictEqual(menu.encoderStep(null, 4), 0);
assert.strictEqual(menu.encoderStep(1, 2), 1);
assert.strictEqual(menu.encoderStep(65535, 0), 1);
assert.strictEqual(menu.encoderStep(3, 1), -2);
assert.strictEqual(menu.crumbFor('airplay'), 'AirPlay');
assert.strictEqual(menu.crumbFor('air-out'), 'AirPlay > Ekrany');
assert.strictEqual(menu.crumbFor('air-box'), 'AirPlay > Ekrany > Okno');
assert.strictEqual(menu.crumbFor('airplay', '', 'Nazwa'), 'AirPlay > Nazwa');
var located = menu.buildFrame(menu.AIRPLAY_ITEMS, 0, 1920, 720, '', 'THEiPlay', '', null, null, null, 'AirPlay');
assert.strictEqual(located.layout.crumb, 'AirPlay');
assert.ok(located.layout.backHit);
assert.ok(located.layout.backHit.w > 40);
var clipped = menu.streamWindow({ x: 180, y: 36, w: 1280, h: 640 }, { ox: 104, oy: 88, boxW: 1796, boxH: 632 });
assert.ok(clipped.y + clipped.h <= 88 + 632 - 160);
assert.ok(clipped.y + clipped.h < 596);

console.log('test_menu: ok');
