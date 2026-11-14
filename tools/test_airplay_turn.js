'use strict';

// AirPlay: the phone turned. The mirror file for mgu-render gets the new size as a new file
// (rename, new inode), so the renderer never reads a file cut down under it; a frame bigger than
// the centre profile is slowed down and scaled, not dropped (the picture froze).
var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');

var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'air-turn-'));
process.env.G21_MIRROR_VIDEO = path.join(dir, 'mirror');
var src = path.join(__dirname, '..', 'apps', 'g21_airplay', 'src');
var mirrorVideo = require(path.join(src, 'mirror_video.js'));
var frameFit = require(path.join(src, 'frame_fit.js'));

function i420(w, h, v) { return Buffer.alloc(w * h * 3 / 2, v); }
function head(file) {
    var b = fs.readFileSync(file);
    return { magic: b.readUInt32LE(0), w: b.readUInt32LE(8), h: b.readUInt32LE(12), seq: b.readUInt32LE(16), slot: b.readUInt32LE(20), n: b.readUInt32LE(24), size: b.length };
}

var mv = mirrorVideo.createMirrorVideo();
assert.strictEqual(mv.path, process.env.G21_MIRROR_VIDEO);
// landscape, as the phone starts
assert.strictEqual(mv.push(i420(600, 276, 10), 600, 276), 'new');
var ino1 = fs.statSync(mv.path).ino;
// what the renderer holds: the file it opened
// (Windows cannot rename over a file another handle holds open: there only the file itself is checked)
var hold = process.platform !== 'win32';
var held = hold ? fs.openSync(mv.path, 'r') : -1;
var heldSize = hold ? fs.fstatSync(held).size : 0;
assert.strictEqual(mv.push(i420(600, 276, 11), 600, 276), true, 'same size: same file');
assert.strictEqual(fs.statSync(mv.path).ino, ino1);
// the phone turns: a smaller portrait frame
assert.strictEqual(mv.push(i420(184, 400, 12), 184, 400), 'new', 'new size: the menu names the file again');
var h = head(mv.path);
assert.strictEqual(h.magic, 0x4656474d);
assert.deepStrictEqual([h.w, h.h, h.n], [184, 400, 4]);
assert.strictEqual(h.size, 64 + 4 * 184 * 400 * 3 / 2);
if (process.platform !== 'win32') assert.notStrictEqual(fs.statSync(mv.path).ino, ino1, 'a new file (rename), not the old one cut down');
if (hold) {
    assert.strictEqual(fs.fstatSync(held).size, heldSize, 'the file the renderer still holds keeps its size');
    var probe = Buffer.alloc(16);
    assert.strictEqual(fs.readSync(held, probe, 0, 16, heldSize - 16), 16, 'and can be read to its end');
    fs.closeSync(held);
}
assert.ok(!fs.existsSync(mv.path + '.new'), 'no temp file left');
// and back to landscape
assert.strictEqual(mv.push(i420(600, 276, 13), 600, 276), 'new');
assert.deepStrictEqual([head(mv.path).w, head(mv.path).h], [600, 276]);
mv.close();

// main.js: no fixed 640x400 cut-off; big frames slowed down, size changes logged; gauges keep their picture
var main = fs.readFileSync(path.join(src, 'main.js'), 'utf8');
assert.ok(main.indexOf('st.size > 8 + (640 * 400 * 3) / 2') === -1, 'the fixed 600x400 limit is gone');
assert.ok(main.indexOf('_bigAt') === -1, 'big frames (an iPhone sends 1080x498) are not slowed down');
assert.ok(main.indexOf('st.size > 8 + (1920 * 1080 * 3) / 2') !== -1, 'only past 1920x1080 a frame is left');
var t0 = Date.now(); for (var k = 0; k < 20; k += 1) { frameFit.scaleToProfile(i420(1080, 498, 3), 1080, 498, 600, 400); }
assert.ok((Date.now() - t0) / 20 < 20, 'scaling 1080x498 to the profile is quick');
assert.ok(main.indexOf("noteStart('air-frame '") !== -1, 'size changes logged');
assert.ok(main.indexOf('} else if (!this._showGauges() || heavy) {') === -1, 'a big frame does not drop the cluster/HUD picture');
assert.ok(main.indexOf('heavy') === -1, 'a big frame still updates the cluster/HUD');
// a portrait frame fits the turned centre profile as it is; a big one is scaled into it
assert.ok(frameFit.fitsProfile(184, 400, 600, 400), 'portrait 184x400 fits 600x400 turned');
var s = frameFit.scaleToProfile(i420(828, 1792, 1), 828, 1792, 600, 400);
assert.ok(s.w <= 400 && s.h <= 600 && s.w % 4 === 0, 'a big portrait frame scaled into the profile: ' + s.w + 'x' + s.h);

fs.rmSync(dir, { recursive: true, force: true });
console.log('airplay-turn: new size = new mirror file (rename), big frames scaled not dropped, sizes logged');

// AirPlay Sound: a menu switch, saved, written for g21-airplay-open, which then starts the receiver
// with -vs 0 (streamed audio only) and restarts it when the switch changes.
(function () {
    var desk = require(path.join(src, 'desktop_settings.js'));
    var menuDraw = require(path.join(src, 'menu_draw.js'));
    var paths = require(path.join(src, 'paths.js'));
    var d = desk.createDesktopSettings({});
    assert.strictEqual(d.airplaySound(), false, 'off by default: picture and sound');
    assert.ok(d.setAirplaySound(true).ok);
    assert.strictEqual(desk.createDesktopSettings(JSON.parse(JSON.stringify(d.snapshot()))).airplaySound(), true, 'saved');
    assert.ok(menuDraw.AIRPLAY_ITEMS.some(function (i) { return i.name === 'air-sound' && i.title === 'AirPlay Sound'; }), 'in the AirPlay menu');
    assert.strictEqual(paths.sessionPaths().airplayMode, '/run/g21-session/airplay-mode');
    assert.ok(main.indexOf("if (name === 'air-sound') {") !== -1 && main.indexOf("? 'audio' : 'video'") !== -1);
    var tool = fs.readFileSync(path.join(__dirname, '..', 'native', 'g21-airplay-open', 'g21-airplay-open'), 'utf8');
    assert.ok(/airplay_mode_of\(\) \{/.test(tool), 'the tool reads airplay-mode');
    assert.ok(tool.indexOf('set -- -n "$shown" -nh -p 7400 $mac_args -vs 0 -as "$audio_sink" $pin_args -d 1') !== -1, 'audio only: -vs 0');
    assert.ok(tool.indexOf("grep -q -- ' -vs 0 ' /run/g21-airplay/ux.cmd") !== -1, 'a change restarts the receiver');
})();
console.log('airplay-sound: menu switch, saved, -vs 0 in the tool');
