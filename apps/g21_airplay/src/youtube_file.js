'use strict';

/*
 * RideTube's decoder writes I420 frames to /dev/shm/mgu-video-ridetube.
 * This reads the newest slot. It does not open the player socket, so the
 * YouTube app keeps playing.
 */

var fs = require('fs');

var PATH = '/dev/shm/mgu-video-ridetube';
var MAGIC = 0x4656474d;

function createYoutubeFile() {
    var seq = -1;

    function pull() {
        var fd = -1;
        var head;
        var w;
        var h;
        var slot;
        var nslot;
        var now;
        var fsz;
        var buf;
        try {
            fd = fs.openSync(PATH, 'r');
        } catch (err) {
            seq = -1;
            return null;
        }
        try {
            head = Buffer.alloc(64);
            if (fs.readSync(fd, head, 0, 64, 0) !== 64 || head.readUInt32LE(0) !== MAGIC) {
                return null;
            }
            w = head.readUInt32LE(8);
            h = head.readUInt32LE(12);
            now = head.readUInt32LE(16);
            slot = head.readUInt32LE(20);
            nslot = head.readUInt32LE(24);
            if (w < 16 || h < 16 || w > 2048 || h > 2048 || (w % 2) !== 0 || (h % 2) !== 0) {
                return null;
            }
            if (nslot < 1 || nslot > 4 || slot >= nslot) {
                return null;
            }
            if (now === seq) {
                return false;
            }
            fsz = (w * h * 3) / 2;
            buf = Buffer.alloc(fsz);
            if (fs.readSync(fd, buf, 0, fsz, 64 + slot * fsz) !== fsz) {
                return null;
            }
            seq = now;
            return { i420: buf, w: w, h: h };
        } catch (err) {
            return null;
        } finally {
            if (fd >= 0) {
                try {
                    fs.closeSync(fd);
                } catch (errClose) {
                    fd = -1;
                }
            }
        }
    }

    return { pull: pull, path: PATH };
}

module.exports = {
    PATH: PATH,
    createYoutubeFile: createYoutubeFile
};
