'use strict';

/*
 * mgu-render draws a VIDEO op from an I420 file in /dev/shm (PROTOCOL.md).
 * UxPlay writes G21Y frames; this republishes the newest one so the menu
 * surface can show the mirror. g21-present's waylandsink stays blank on
 * this head unit.
 */

var fs = require('fs');

var PATH = '/dev/shm/mgu-video-g21airplay';
var NSLOT = 2;

function createMirrorVideo() {
    var fd = -1;
    var w = 0;
    var h = 0;
    var slot = 0;
    var seq = 0;
    var frameBytes = 0;

    function close() {
        if (fd >= 0) {
            try {
                fs.closeSync(fd);
            } catch (err) {
                fd = -1;
            }
            fd = -1;
        }
    }

    function open(nw, nh) {
        var size;
        var blank;
        close();
        frameBytes = (nw * nh * 3) / 2;
        size = 64 + NSLOT * frameBytes;
        fd = fs.openSync(PATH, 'w+');
        blank = Buffer.alloc(size);
        blank.writeUInt32LE(0x4656474d, 0);
        blank.writeUInt32LE(1, 4);
        blank.writeUInt32LE(nw, 8);
        blank.writeUInt32LE(nh, 12);
        blank.writeUInt32LE(0, 16);
        blank.writeUInt32LE(0, 20);
        blank.writeUInt32LE(NSLOT, 24);
        blank.writeUInt32LE(1, 28);
        blank.writeUInt32LE(1, 32);
        fs.writeSync(fd, blank, 0, size, 0);
        w = nw;
        h = nh;
        slot = 0;
        seq = 0;
    }

    return {
        path: PATH,
        push: function (i420, nw, nh) {
            var next;
            var word;
            if (!i420 || nw < 16 || nh < 16 || nw > 2048 || nh > 2048) {
                return false;
            }
            if ((nw % 2) !== 0 || (nh % 2) !== 0) {
                return false;
            }
            if (i420.length < (nw * nh * 3) / 2) {
                return false;
            }
            if (fd < 0 || nw !== w || nh !== h) {
                open(nw, nh);
            }
            next = (slot + 1) % NSLOT;
            fs.writeSync(fd, i420, 0, frameBytes, 64 + next * frameBytes);
            word = Buffer.alloc(4);
            word.writeUInt32LE(next, 0);
            fs.writeSync(fd, word, 0, 4, 20);
            seq += 1;
            word.writeUInt32LE(seq, 0);
            fs.writeSync(fd, word, 0, 4, 16);
            slot = next;
            return true;
        },
        close: close
    };
}

module.exports = {
    PATH: PATH,
    createMirrorVideo: createMirrorVideo
};
