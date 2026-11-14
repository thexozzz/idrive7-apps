'use strict';

// YouTube load: the decoder picture and download follow THEiPlay's "Jakość obrazu", <= 24 fps to the
// gauges, and a head-only look at the film file when no gauge shows it.
var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');

var appDir = path.join(__dirname, '..', 'apps', 'g21_airplay', 'src');
var main = fs.readFileSync(path.join(appDir, 'main.js'), 'utf8');
var youtubeFile = require(path.join(appDir, 'youtube_file.js'));

assert.ok(/var YT_GAUGE_MS = 42;/.test(main), 'gauge frames every 42 ms (24 fps)');
assert.ok(main.indexOf('this._ytModel.play(row.id, film.rect, false, row, { quality: film.quality });') !== -1);
assert.ok(main.indexOf("'1280x720', false, row") === -1, 'no 1280x720 film any more');
assert.ok(main.indexOf('this._ytFile.pull(!gauges)') !== -1, 'head only without gauges');

// _ytFilm: THEiPlay's "Jakość obrazu" decides. Centre on -> the centre profile, only the
// cluster/HUD -> the KOMBI profile; the film 16:9 inside it, downloaded at the lowest height covering it.
var frameFit = require(path.join(appDir, 'frame_fit.js'));
var desk = require(path.join(appDir, 'desktop_settings.js'));
var hb = /\nfunction ytHeight\(h\) \{[\s\S]*?\n\}/.exec(main);
assert.ok(hb, 'ytHeight found');
var ytHeight = new Function(hb[0] + '\nreturn ytHeight;')();
assert.deepStrictEqual([132, 336, 360, 400, 480, 600].map(ytHeight), ['360', '360', '360', '480', '480', '720']);
var fb = /AirPlayApp\.prototype\._ytFilm = (function \(\) \{[\s\S]*?\n\});/.exec(main);
assert.ok(fb, '_ytFilm found');
var ytFilm = new Function('frameFit', 'ytHeight', 'return ' + fb[1])(frameFit, ytHeight);
function film(central, cluster, hud, kombi, centre) {
    return ytFilm.call({ _ytCentral: central, _ytCluster: cluster, _ytHud: hud, _quality: function (kind) { return desk.qualitySize(kind === 'kombi' ? kombi : (centre || '600x400')); } });
}
assert.deepStrictEqual(film(true, true, true, '400x240'), { rect: '600x336', quality: '360', profile: '600x400', kind: 'central' }, 'centre: the centre profile');
assert.deepStrictEqual(film(false, false, false, '400x240'), { rect: '600x336', quality: '360', profile: '600x400', kind: 'central' }, 'no screen chosen: the centre');
assert.deepStrictEqual(film(false, true, false, '240x180'), { rect: '240x132', quality: '360', profile: '240x180', kind: 'kombi' });
assert.deepStrictEqual(film(false, false, true, '400x240'), { rect: '400x224', quality: '360', profile: '400x240', kind: 'kombi' });
assert.deepStrictEqual(film(true, false, false, '400x240', '1280x720').quality, '720', 'a bigger centre profile: a bigger download');
desk.QUALITY_KOMBI.concat(desk.QUALITY_CENTRAL).forEach(function (q) {
    var r = film(false, true, true, q).rect.split('x').map(Number);
    var c = film(true, false, false, '400x240', q).rect.split('x').map(Number);
    [r, c].forEach(function (x) {
        assert.ok(x[0] % 4 === 0 && x[1] % 2 === 0 && x[0] >= 16 && x[1] >= 16, q + ' rect legal for ytdec/cluster-render: ' + x.join('x'));
    });
});

// A film file: 64-byte head + 3 slots of I420.
var W = 848, H = 480, FSZ = W * H * 3 / 2;
var file = path.join(os.tmpdir(), 'yt-perf-' + process.pid);
var head = Buffer.alloc(64);
head.writeUInt32LE(0x4656474d, 0);
head.writeUInt32LE(W, 8);
head.writeUInt32LE(H, 12);
head.writeUInt32LE(7, 16);
head.writeUInt32LE(1, 20);
head.writeUInt32LE(3, 24);
var body = Buffer.alloc(FSZ * 3);
body[FSZ] = 42;
fs.writeFileSync(file, Buffer.concat([head, body]));
try {
    var yf = youtubeFile.createYoutubeFile(file);
    var peek = yf.pull(true);
    assert.deepStrictEqual(peek, { peek: true, i420: null, w: W, h: H });
    // the peek did not use up the frame: the full read still gets it
    var full = yf.pull();
    assert.strictEqual(full.w, W);
    assert.strictEqual(full.i420.length, FSZ);
    assert.strictEqual(full.i420[0], 42, 'slot 1 read');
    assert.strictEqual(yf.pull(), false, 'same frame again: nothing new');
    assert.strictEqual(yf.pull(true).peek, true, 'a peek still says a film is on');
} finally {
    fs.unlinkSync(file);
}
assert.strictEqual(youtubeFile.createYoutubeFile().path, '/dev/shm/mgu-video-ridetube');
console.log('test_youtube_perf: ok');
