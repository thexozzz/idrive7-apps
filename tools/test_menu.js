'use strict';

var assert = require('assert');
var menu = require('../apps/g21_airplay/src/menu_draw.js');

var built = menu.buildFrame(menu.ITEMS, 0, 1920, 720);
assert.strictEqual(built.frame.readUInt32LE(0), 7);
assert.strictEqual(built.frame.length, 8 + built.frame.readUInt32LE(4));
assert.strictEqual(built.frame.readUInt32LE(8), 1);
assert.ok(built.rects > 40);

var blank = menu.buildFrame([
    { title: ' ', hint: ' ' },
    { title: ' ', hint: ' ' },
    { title: ' ', hint: ' ' },
    { title: ' ', hint: ' ' }
], 0, 1920, 720);
assert.ok(built.rects > blank.rects);

assert.strictEqual(menu.encoderStep(null, 4), 0);
assert.strictEqual(menu.encoderStep(1, 2), 1);
assert.strictEqual(menu.encoderStep(65535, 0), 1);
assert.strictEqual(menu.encoderStep(3, 1), -2);

console.log('test_menu: ok');
