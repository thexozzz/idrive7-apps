'use strict';

// Black centre after THEiPlay was minimised and opened again: the iPhone sends a frame only when its
// screen changes, so g21-yuvring shows the last one again (new seq) twice a second.
var assert = require('assert');
var cp = require('child_process');
var fs = require('fs');
var os = require('os');
var path = require('path');

var bin = path.join(__dirname, '..', 'native', 'g21-airplay-open', 'g21-yuvring');
if (process.platform !== 'linux') {
    console.log('test_airplay_repeat: skipped (needs Linux to run the ring binary)');
    process.exit(0);
}
var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g21-rep-'));
var input = path.join(dir, 'latest.yuv');
var out = path.join(dir, 'ring');
var status = path.join(dir, 'status');
var size = path.join(dir, 'size');
fs.writeFileSync(size, '600x400\n');
var ring = cp.spawn(bin, [input, out, status, size, path.join(dir, 'ksize'), path.join(dir, 'kombi.yuv')], { stdio: 'ignore' });
function seqOf() { try { return fs.readFileSync(out).readUInt32LE(16); } catch (e) { return -1; } }
setTimeout(function () {
    var w = 320, h = 240, b = Buffer.alloc(8 + w * h * 3 / 2, 128);
    b.write('G21Y', 0); b.writeUInt16LE(w, 4); b.writeUInt16LE(h, 6);
    fs.writeFileSync(input + '.tmp', b);
    fs.renameSync(input + '.tmp', input);
    setTimeout(function () {
        var first = seqOf();
        setTimeout(function () {
            var later = seqOf();
            ring.kill();
            assert.ok(first >= 1, 'first frame in the ring: ' + first);
            assert.ok(later >= first + 2, 'still phone: the frame is shown again (seq ' + first + ' -> ' + later + ')');
            console.log('test_airplay_repeat OK (seq ' + first + ' -> ' + later + ')');
        }, 1600);
    }, 300);
}, 300);
