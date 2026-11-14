'use strict';

// AirPlay as smooth as RideTube: g21-yuvring puts each UxPlay frame, scaled to the centre profile, into
// mgu-render's video file itself (no frame through the app's Node for the centre screen). Full screen:
// a state of the visit (black over the menu, a tap shows the way out), never a saved 1920x720 window.
var assert = require('assert');
var cp = require('child_process');
var fs = require('fs');
var os = require('os');
var path = require('path');

var root = path.join(__dirname, '..');
var src = path.join(root, 'apps', 'g21_airplay', 'src');
var tooldir = path.join(root, 'native', 'g21-airplay-open');
var main = fs.readFileSync(path.join(src, 'main.js'), 'utf8');
var tool = fs.readFileSync(path.join(tooldir, 'g21-airplay-open'), 'utf8');
var component = JSON.parse(fs.readFileSync(path.join(tooldir, 'component.json'), 'utf8'));

// the tool ships and runs the ring with UxPlay (not for AirPlay Sound)
assert.ok(component.files.some(function (f) { return f.path === 'g21-yuvring' && f.mode === '0755'; }), 'component ships g21-yuvring');
assert.ok(fs.existsSync(path.join(tooldir, 'g21-yuvring.c')) && fs.existsSync(path.join(tooldir, 'g21-yuvring')), 'source and binary');
assert.ok(/stop_ux\(\) \{\n    stop_ring\n/.test(tool.replace(/\r\n/g, '\n')), 'ring stops with UxPlay');
assert.strictEqual((tool.match(/start_ring\n\s*report "running\|\$label\|\$ip"/g) || []).length, 2, 'ring starts with UxPlay');
assert.ok(tool.indexOf('if [ "$(airplay_mode_of)" = "audio" ]; then\n        stop_ring') !== -1, 'no ring for AirPlay Sound');
assert.ok(!/pgrep[^\n]*g21-yuvring/.test(tool), 'no pgrep for the ring (this BusyBox has none: hundreds of rings)');
assert.ok(tool.indexOf('RINGPID=$!') !== -1 && tool.indexOf('for f in /proc/[0-9]*/cmdline; do') !== -1, 'the ring is found by its PID and /proc');
// the app leaves the centre screen to the ring
assert.ok(main.indexOf("var RING_STATUS = process.env.G21_AIRPLAY_RING || '/run/g21-airplay/ring';") !== -1);
assert.ok(/if \(selfRouter\._ringActive\) \{\s*return;\s*\}/.test(main), 'no Node copy of the frame while the ring runs');
assert.ok(main.indexOf('src = KOMBI_YUV;') !== -1 && /var KOMBI_GAP_MS = 41;/.test(main), 'with the ring the app reads the small cluster/HUD frame, <= 24 a second');
assert.ok(tool.indexOf('"$SESSION_DIR/kombi-size" /run/g21-airplay/kombi.yuv') !== -1, 'the tool hands the ring the KOMBI size');

// the ring itself (Linux x86-64: the built binary; with gcc: built from the source again)
function ringBinary() {
    if (process.platform !== 'linux' || process.arch !== 'x64') return null;
    var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ring-bin-'));
    var out = path.join(dir, 'g21-yuvring');
    var gcc = cp.spawnSync('gcc', ['-O2', '-Wall', '-o', out, path.join(tooldir, 'g21-yuvring.c')]);
    return gcc.status === 0 ? out : path.join(tooldir, 'g21-yuvring');
}
function frame(w, h, y) {
    var head = Buffer.alloc(8);
    head.write('G21Y', 0, 'latin1'); head.writeUInt16LE(w, 4); head.writeUInt16LE(h, 6);
    return Buffer.concat([head, Buffer.alloc(w * h, y), Buffer.alloc(w * h / 2, 128)]);
}
function sleep(ms) { var end = Date.now() + ms; while (Date.now() < end) { /* wait */ } }
var bin = ringBinary();
if (bin) {
    var d = fs.mkdtempSync(path.join(os.tmpdir(), 'ring-'));
    var inp = path.join(d, 'latest.yuv'), out = path.join(d, 'video'), st = path.join(d, 'ring'), size = path.join(d, 'size');
    fs.writeFileSync(size, '600x400\n');
    var ksize = path.join(d, 'kombi-size'), kout = path.join(d, 'kombi.yuv');
    fs.writeFileSync(ksize, 'off\n');
    var child = cp.spawn(bin, [inp, out, st, size, ksize, kout], { stdio: 'ignore' });
    sleep(300);
    // a second one (the tool could not see the first) ends at once: one writer only
    var second = cp.spawnSync(bin, [inp, out, st, size, ksize, kout], { timeout: 3000 });
    assert.strictEqual(second.status, 0, 'a second ring ends at once (lock)');
    assert.ok(String(second.stderr).indexOf('already running') !== -1);
    var put = function (w, h, y) { fs.writeFileSync(inp + '.tmp', frame(w, h, y)); fs.renameSync(inp + '.tmp', inp); sleep(40); };
    for (var i = 0; i < 20; i += 1) put(1080, 498, i);
    sleep(200);
    var head = fs.readFileSync(out).slice(0, 28);
    assert.strictEqual(head.readUInt32LE(0), 0x4656474d, 'mgu-render video file');
    assert.deepStrictEqual([head.readUInt32LE(8), head.readUInt32LE(12), head.readUInt32LE(24)], [600, 276, 4], 'iPhone 1080x498 -> 600x276 (centre profile)');
    assert.strictEqual(head.readUInt32LE(16), 20, 'every frame');
    var all = fs.readFileSync(out), slot = head.readUInt32LE(20), fb = 600 * 276 * 3 / 2;
    assert.strictEqual(all[64 + slot * fb], 19, 'the newest frame in the slot named');
    var ino = fs.statSync(out).ino;
    for (i = 0; i < 5; i += 1) put(332, 720, 50);
    sleep(200);
    head = fs.readFileSync(out).slice(0, 28);
    assert.deepStrictEqual([head.readUInt32LE(8), head.readUInt32LE(12)], [276, 600], 'portrait 332x720 -> 276x600');
    assert.notStrictEqual(fs.statSync(out).ino, ino, 'a new size is a new file');
    var status = fs.readFileSync(st, 'utf8').trim().split(' ');
    assert.deepStrictEqual(status.slice(0, 2), ['276', '600']);
    assert.strictEqual(status[3], String(fs.statSync(out).ino), 'status names the file');
    assert.ok(!fs.existsSync(kout), 'no cluster/HUD frame while kombi-size is off');
    // the cluster/HUD frame: KOMBI profile size, at most 24 a second
    fs.writeFileSync(ksize, '240x180\n');
    var t0 = Date.now(), seen = {}, n = 0;
    while (Date.now() - t0 < 1000) {
        fs.writeFileSync(inp + '.tmp', frame(1080, 498, n & 255)); fs.renameSync(inp + '.tmp', inp); n += 1;
        sleep(10);
        try { seen[fs.statSync(kout).mtimeMs] = true; } catch (e) { /* not yet */ }
    }
    var kh = fs.readFileSync(kout);
    assert.strictEqual(kh.toString('latin1', 0, 4), 'G21Y');
    assert.deepStrictEqual([kh.readUInt16LE(4), kh.readUInt16LE(6)], [240, 108], 'KOMBI profile 240x180 -> 240x108');
    assert.strictEqual(kh.length, 8 + 240 * 108 * 3 / 2);
    var kfps = Object.keys(seen).length;
    assert.ok(n > 40 && kfps <= 25 && kfps >= 10, 'cluster/HUD frames per second: ' + kfps + ' of ' + n + ' in');
    fs.writeFileSync(ksize, 'off\n');
    fs.writeFileSync(size, '240x144\n');
    put(1080, 498, 1);
    sleep(150);
    head = fs.readFileSync(out).slice(0, 28);
    assert.deepStrictEqual([head.readUInt32LE(8), head.readUInt32LE(12)], [240, 108], 'follows the profile (as frame_fit.profileDims)');
    child.kill('SIGTERM');
    sleep(200);
    assert.ok(!fs.existsSync(st), 'status gone when it ends');
    assert.ok(!fs.existsSync(kout), 'cluster/HUD frame gone when it ends');
    fs.rmSync(d, { recursive: true, force: true });
}

// full screen: black over the menu, the picture over the whole screen, a tap shows the way out
var menu = require(path.join(src, 'menu_draw.js'));
var win = { x: 640, y: 180, w: 640, h: 360 };
var full = menu.buildFrame(menu.AIRPLAY_ITEMS, 0, 1920, 720, '', 'AirPlay', 'v', null, null, null, 'AirPlay',
    { on: true, online: true, mirrored: true, full: true, fullUi: false, window: win, screens: [] });
assert.deepStrictEqual(full.layout.airWindow, { x: 0, y: 0, w: 1920, h: 720 }, 'the picture over the whole screen');
assert.strictEqual((full.layout.airHits || []).length, 0, 'no buttons over it until a tap');
var shownUi = menu.buildFrame(menu.AIRPLAY_ITEMS, 0, 1920, 720, '', 'AirPlay', 'v', null, null, null, 'AirPlay',
    { on: true, online: true, mirrored: true, full: true, fullUi: true, window: win, screens: [] });
assert.ok(shownUi.rects > full.rects, 'a tap shows "Wyjdź z trybu pełnoekranowego"');
var windowed = menu.buildFrame(menu.AIRPLAY_ITEMS, 0, 1920, 720, '', 'AirPlay', 'v', null, null, null, 'AirPlay',
    { on: true, online: true, mirrored: true, full: false, window: win, screens: [] });
var chips = (windowed.layout.airHits || []).filter(function (h) { return h.name === 'air-full' || h.name === 'air-pos'; });
assert.strictEqual(chips.length, 2, 'Pełny ekran and Pozycja over the window');
assert.strictEqual(chips[0].y, chips[1].y, 'in one row');
assert.strictEqual(chips[0].w, chips[1].w, 'of one size');
assert.ok(chips[1].x + chips[1].w <= win.x + win.w && chips[0].x >= win.x, 'inside the window, right-aligned');
// the app: full screen is not saved, ends when the app is left or the stream ends
assert.ok(main.indexOf("this._setAirFull(!this._airFull);") !== -1);
assert.ok(main.indexOf("this._settings.setPicture('central', {\n                x: 0,") === -1 && main.indexOf('w: 1920,\r\n                h: 720,') === -1, 'no saved 1920x720 window');
assert.ok(main.indexOf('full-migrate centre window 640x360') !== -1, 'an old saved full screen goes back to a window');
console.log('airplay-ring: frames to mgu-render without Node' + (bin ? '' : ' (binary run skipped on this platform)') + '; full screen black + exit on tap; chips aligned');
