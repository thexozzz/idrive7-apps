'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var dec = require('../apps/g21_airplay/src/video_decoder');

var i420 = Buffer.alloc(6);
i420[0] = 10;
i420[1] = 20;
i420[2] = 30;
i420[3] = 40;
i420[4] = 50;
i420[5] = 60;
var same = dec.scaleI420(i420, 2, 2, 2, 2);
assert.strictEqual(same.y[0], 10);
assert.strictEqual(same.y[3], 40);
assert.strictEqual(same.u[0], 50);
assert.strictEqual(same.v[0], 60);
var atlas = dec.toAtlas(same);
assert.strictEqual(atlas.length, 6);
assert.strictEqual(atlas[0], 10);
assert.strictEqual(atlas[4], 50);
assert.strictEqual(atlas[5], 60);
var plane = Buffer.alloc(2 * 2 * 3 / 2);
plane.fill(16, 0, 4);
plane.fill(200, 4, 5);
plane.fill(40, 5, 6);
var rows = dec.i420ToAtlas(plane, 2, 2);
assert.strictEqual(rows[4], 200);
assert.strictEqual(rows[5], 40);

var packed = Buffer.alloc(8 + 6);
packed[0] = 0x47;
packed[1] = 0x32;
packed[2] = 0x31;
packed[3] = 0x59;
packed.writeUInt16LE(2, 4);
packed.writeUInt16LE(2, 6);
i420.copy(packed, 8);
var parsed = dec.parseI420(packed);
assert.strictEqual(parsed.w, 2);
assert.strictEqual(parsed.h, 2);
assert.strictEqual(parsed.i420[4], 50);
assert.strictEqual(dec.parseI420(Buffer.from('nope')), null);

var wide = dec.atlasFromI420(i420, 2, 2, 4, 2);
assert.strictEqual(wide.length, 4 * 3);

var bgra = dec.bgraFromI420(i420, 2, 2, 2, 2);
assert.strictEqual(bgra.w, 2);
assert.strictEqual(bgra.h, 2);
assert.strictEqual(bgra.bgra.length, 2 * 2 * 4);
assert.strictEqual(bgra.bgra[3], 255);

var renderer = fs.readFileSync(path.join(__dirname, '..', 'third_party', 'UxPlay', 'renderers', 'video_renderer.c'), 'utf8');
assert.ok(renderer.indexOf('avdec_h264') === -1 || renderer.indexOf('decoder') !== -1);
assert.ok(renderer.indexOf('tee name=g21tee') !== -1);
assert.ok(renderer.indexOf('format=I420') !== -1);
assert.ok(renderer.indexOf('g21_new_sample') !== -1);

console.log('decoder: one UxPlay decode, I420 to atlas/BGRA for present/cluster');
