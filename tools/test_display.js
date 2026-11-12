'use strict';

var assert = require('assert');
var adapterFactory = require('../apps/g21_airplay/src/cluster_render_adapter');
var settingsFactory = require('../apps/g21_airplay/src/settings_manager');
var display = require('../apps/g21_airplay/src/display_output');
var client = require('../apps/g21_airplay/src/cluster_render_client');

assert.strictEqual(typeof client.ClusterRender, 'function');
assert.strictEqual(adapterFactory.yuvBytes(1088, 480), 1088 * 720);
assert.strictEqual(adapterFactory.yuvBytes(800, 480), 800 * 720);
var centered = settingsFactory.createSettings({
    picture: { central: { x: 180, y: 36, w: 1280, h: 640 } }
}).picture('central');
assert.strictEqual(centered.x, 320);
assert.strictEqual(centered.y, 40);

function fakeClient(targets) {
    var calls = [];
    return {
        targets: targets || '',
        calls: calls,
        connect: function () { calls.push('connect'); },
        close: function () { calls.push('close'); },
        video: function (opts) { calls.push(opts); return 7; },
        set: function (ref, opts) { calls.push(['set', ref, opts]); },
        drop: function (ref) { calls.push(['drop', ref]); },
        frame: function (ref, atlas) {
            calls.push(['frame', ref, atlas.length]);
            return true;
        },
    };
}

var clientOk = fakeClient('map:1088x480,hud:800x480,panel:1920x720');
var adapter = adapterFactory.createClusterRenderAdapter(clientOk);
assert.strictEqual(adapter.knownTarget('cluster').protocol, 'panel');
assert.strictEqual(adapter.knownTarget('hud').w, 800);
var made = adapter.createLayer('hud', { x: 10, y: 20, w: 400, h: 200, fps: 15 });
assert.strictEqual(made.ok, true);
var pixels = Buffer.alloc(adapterFactory.yuvBytes(made.w, made.h), 16);
assert.strictEqual(adapter.updateFrame(Buffer.alloc(10)).reason, 'bad-frame');
assert.strictEqual(adapter.updateFrame(pixels).ok, true);
assert.strictEqual(clientOk.calls[clientOk.calls.length - 1][0], 'frame');
assert.strictEqual(adapter.knownTarget('map').protocol, 'map');
assert.strictEqual(adapter.knownTarget('map').w, 1088);
assert.strictEqual(adapter.knownTarget('map').h, 480);
assert.strictEqual(adapter.knownTarget('nope').reason, 'unknown-target');

var closed = fakeClient('hud:800x480');
var denied = adapterFactory.createClusterRenderAdapter(closed);
assert.strictEqual(denied.createLayer('cluster').reason, 'target-not-offered');

function memoryOutput(flags) {
    var state = { starts: 0, stops: 0, releases: 0, frames: 0, failStart: !!flags.failStart };
    return {
        state: state,
        status: function () {
            return { available: flags.available !== false, reason: flags.reason || '' };
        },
        prepare: function () { return { ok: true }; },
        start: function () {
            if (state.failStart) {
                return { ok: false, reason: 'start-failed' };
            }
            state.starts += 1;
            return { ok: true };
        },
        stopFrames: function () { state.stops += 1; },
        frame: function () { state.frames += 1; return { ok: true }; },
        stop: function () {},
        release: function () { state.releases += 1; },
    };
}

function manager(extra) {
    var outputs = {
        central: memoryOutput({}),
        cluster: memoryOutput(extra && extra.cluster || {}),
        hud: memoryOutput(extra && extra.hud || {}),
    };
    var log = [];
    var settings = settingsFactory.createSettings({ active: 'central' });
    var box = display.createDisplayOutputManager({
        settings: settings,
        outputs: outputs,
        log: function (event, name, reason) { log.push(event + ':' + name + ':' + reason); },
    });
    return { box: box, outputs: outputs, log: log, settings: settings };
}

var cold = manager();
// No Vehicle2 sample yet: Zegary/HUD must still be selectable (RDP picker).
assert.strictEqual(cold.box.select('cluster').ok, true);
assert.strictEqual(cold.outputs.cluster.state.starts, 1);
cold.box.select('central');

var parked = manager();
parked.box.vehicle(0);
assert.strictEqual(parked.box.select('cluster').ok, true);
assert.strictEqual(parked.outputs.cluster.state.starts, 1);
var moved = parked.box.vehicle(1000);
assert.strictEqual(moved.active, 'central');
assert.strictEqual(parked.outputs.cluster.state.releases, 1);
assert.ok(parked.log.join(' ').indexOf('moving-image-off') !== -1);
var driving = manager();
driving.box.vehicle(1000);
assert.strictEqual(driving.box.select('cluster').reason, 'not-parked');

var lost = manager();
lost.box.vehicle(0);
lost.box.select('hud');
var cleared = lost.box.vehicle(null);
assert.strictEqual(cleared.active, 'central');

var missing = manager({ cluster: { available: false, reason: 'no-yuv-source' } });
missing.box.vehicle(0);
assert.strictEqual(missing.box.select('cluster').reason, 'no-yuv-source');

var rollback = manager({ hud: { failStart: true } });
rollback.box.vehicle(0);
rollback.box.select('central');
var failed = rollback.box.select('hud');
assert.strictEqual(failed.ok, false);
assert.strictEqual(failed.restored, true);
assert.strictEqual(rollback.box.active(), 'central');

var picture = settingsFactory.createSettings({});
picture.setPicture('hud', { scale: 'cover', x: -5, y: 10, w: 9000, h: 100, fps: 60, rotate: 90 });
var hud = picture.picture('hud');
assert.strictEqual(hud.w, 800);
assert.strictEqual(hud.h, 100);
assert.strictEqual(hud.fps, 30);
assert.strictEqual(hud.scale, 'cover');
var placed = settingsFactory.fit(1920, 1080, hud);
assert.ok(placed.w >= hud.w);

console.log('display: one output, cluster and HUD only while parked, frames must be YUV');
