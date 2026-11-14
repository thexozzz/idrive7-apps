'use strict';

var net = require('net');

function createFrameSink(sockPath) {
    var socket = null;
    var opening = false;

    function open() {
        if (socket || opening) {
            return;
        }
        opening = true;
        var next = net.connect(sockPath);
        next.on('connect', function () {
            socket = next;
            opening = false;
        });
        next.on('error', function () {
            opening = false;
            socket = null;
        });
        next.on('close', function () {
            socket = null;
            opening = false;
        });
    }

    return {
        write: function (frame) {
            if (!frame || !frame.bgra) {
                return { ok: false, reason: 'no-frame' };
            }
            open();
            if (!socket) {
                return { ok: false, reason: 'no-presenter' };
            }
            var header = Buffer.alloc(8);
            header.writeUInt16LE(frame.w, 0);
            header.writeUInt16LE(frame.h, 2);
            header.writeUInt32LE(frame.bgra.length, 4);
            socket.write(header);
            socket.write(frame.bgra);
            return { ok: true };
        },
    };
}

module.exports = {
    createFrameSink: createFrameSink,
};
