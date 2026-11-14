'use strict';

// YouTube load: small decoder picture, 480p, <= 24 fps to the gauges, and a
// head-only look at the film file when no gauge shows it.
var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');

var appDir = path.join(__dirname, '..', 'apps', 'g21_airplay', 'src');
var main = fs.readFileSync(path.join(appDir, 'main.js'), 'utf8');
var youtubeFile = require(path.join(appDir, 'youtube_file.js'));

assert.ok(/var YT_RECT = '848x480';/.test(main), 'decoder rect 848x480');
assert.ok(/var YT_QUALITY = '480';/.test(main), 'download 480p');
assert.ok(/var YT_GAUGE_MS = 42;/.test(main), 'gauge frames every 42 ms (24 fps)');
assert.ok(/var YT_GAUGE_QUALITY = '360';/.test(main), 'gauges only: 360p');
assert.ok(main.indexOf('this._ytModel.play(row.id, film.rect, false, row, { quality: film.quality });') !== -1);

// _ytFilm: centre on -> 848x480/480p; only the cluster/HUD -> the KOMBI profile, 16:9, 360p.
var frameFit = require(path.join(appDir, 'frame_fit.js'));
var desk = require(path.join(appDir, 'desktop_settings.js'));
var body = /AirPlayApp\.prototype\._ytFilm = (function \(\) \{[\s\S]*?\n\});/.exec(main);
assert.ok(body, '_ytFilm found');
var ytFilm = new Function('YT_RECT', 'YT_QUALITY', 'YT_GAUGE_QUALITY', 'frameFit', 'return ' + body[1])('848x480', '480', '360', frameFit);
function film(central, cluster, hud, kombi) {
    return ytFilm.call({ _ytCentral: central, _ytCluster: cluster, _ytHud: hud, _quality: function () { return desk.qualitySize(kombi); } });
}
assert.deepStrictEqual(film(true, true, true, '400x240'), { rect: '848x480', quality: '480' });
assert.deepStrictEqual(film(false, false, false, '400x240'), { rect: '848x480', quality: '480' }, 'no screen chosen: the centre');
assert.deepStrictEqual(film(false, true, false, '240x180'), { rect: '240x132', quality: '360' });
assert.deepStrictEqual(film(false, false, true, '400x240'), { rect: '400x224', quality: '360' });
desk.QUALITY_KOMBI.forEach(function (q) {
    var r = film(false, true, true, q).rect.split('x').map(Number);
    assert.ok(r[0] % 4 === 0 && r[1] % 2 === 0 && r[0] >= 16 && r[1] >= 16, q + ' rect legal for ytdec/cluster-render: ' + r.join('x'));
});
assert.ok(main.indexOf("'1280x720', false, row") === -1, 'no 1280x720 film any more');
assert.ok(main.indexOf('this._ytFile.pull(!gauges)') !== -1, 'head only without gauges');
var rect = /var YT_RECT = '(\d+)x(\d+)'/.exec(main);
assert.strictEqual(Number(rect[1]) % 4, 0, 'cluster-render wants width % 4');
assert.strictEqual(Number(rect[2]) % 2, 0);

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
