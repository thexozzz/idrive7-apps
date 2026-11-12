'use strict';

var assert = require('assert');
var fit = require('../apps/g21_airplay/src/frame_fit.js');
var videoRouter = require('../apps/g21_airplay/src/video_router.js');

function white(w, h) {
    var y = w * h;
    var buf = Buffer.alloc(y + (w * h) / 2);
    buf.fill(235, 0, y);
    buf.fill(128, y);
    return buf;
}

var box = fit.fitRect(1920, 1080, 1088, 480, 'contain');
assert.strictEqual(box.w % 4, 0);
assert.strictEqual(box.h % 2, 0);
assert.ok(box.w <= 1088);
assert.ok(box.h <= 480);
assert.ok(box.x >= 0 && box.y >= 0);
assert.ok(box.w < 1088);

var fitted = fit.fitI420(white(1920, 1080), 1920, 1080, 1088, 480, 'contain');
assert.strictEqual(fitted.i420.length, 1088 * 480 * 3 / 2);
assert.strictEqual(fitted.i420[0], 16);
assert.strictEqual(fitted.i420[(fitted.rect.y + 2) * 1088 + fitted.rect.x + 2], 235);

var turned = fit.rotateI420(white(8, 4), 8, 4, 1);
assert.strictEqual(turned.w, 4);
assert.strictEqual(turned.h, 8);
assert.strictEqual(turned.i420.length, 4 * 8 * 3 / 2);
var cover = fit.fitRect(1280, 720, 1088, 480, 'cover');
assert.ok(cover.w >= 1088 || cover.h >= 480);
assert.strictEqual(cover.w % 4, 0);

var wide = Buffer.alloc(16 * 8 * 3 / 2);
var coln;
wide.fill(16, 0, 16 * 8);
wide.fill(128, 16 * 8);
for (coln = 4; coln < 12; coln += 1) {
    var rown;
    for (rown = 0; rown < 8; rown += 1) {
        wide[rown * 16 + coln] = 235;
    }
}
var cropped = fit.fitI420(wide, 16, 8, 8, 8, 'cover');
assert.strictEqual(cropped.i420[0], 235);
assert.ok(cropped.rect.sx >= 4);

function run(mode, parkedFlag, clusterFps) {
    var central = [];
    var cluster = [];
    var stopped = [];
    var router = videoRouter.createVideoRouter({
        centralFps: 30,
        clusterFps: clusterFps || 4,
        onCentral: function (frame) { central.push(frame.seq); },
        onCluster: function (frame) { cluster.push(frame.seq); },
        onClusterStop: function (reason) { stopped.push(reason); },
        clock: function () { return 0; },
    });
    router.setMode(mode);
    router.setParked(parkedFlag);
    return { router: router, central: central, cluster: cluster, stopped: stopped };
}

var both = run('both', true, 4);
var i;
for (i = 0; i < 30; i += 1) {
    both.router.push({ i420: white(1280, 720), w: 1280, h: 720, ts: i * 33 });
    both.router.tick(i * 33);
}
assert.ok(both.central.length > both.cluster.length);
assert.ok(both.cluster.length >= 2);
assert.ok(both.cluster.length <= 6);
assert.strictEqual(both.router.stats(30 * 33).depth, 3);
assert.ok(both.router.stats(30 * 33).dropped > 0);
assert.strictEqual(both.central[both.central.length - 1], 29);

var blocked = run('cluster', false, 4);
blocked.router.push({ i420: white(16, 16), w: 16, h: 16, ts: 0 });
blocked.router.tick(0);
blocked.router.tick(1000);
assert.strictEqual(blocked.cluster.length, 0);

var unknown = run('both', null, 4);
unknown.router.push({ i420: white(16, 16), w: 16, h: 16, ts: 0 });
unknown.router.tick(0);
assert.strictEqual(unknown.cluster.length, 0);
assert.ok(unknown.central.length === 1);

var moving = run('cluster', true, 4);
moving.router.setParked(false);
assert.ok(moving.stopped.indexOf('moving') !== -1);

var off = run('off', true, 4);
off.router.push({ i420: white(16, 16), w: 16, h: 16, ts: 0 });
off.router.tick(0);
assert.strictEqual(off.central.length, 0);
assert.strictEqual(off.cluster.length, 0);

var slow = videoRouter.createVideoRouter({
    clusterFps: 6,
    onCluster: function () {},
    clock: function () { return 500; },
});
slow.setMode('cluster');
slow.setParked(true);
slow.push({ i420: white(16, 16), w: 16, h: 16, ts: 0 });
slow.tick(0);
assert.ok(slow.stats(0).clusterFpsLimit < 6);

console.log('test_video_router: ok');
