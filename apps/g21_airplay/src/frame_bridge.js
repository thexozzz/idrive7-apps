'use strict';

var net = require('net');
var fs = require('fs');

/*
 * Listen for g21-rdp / VNC BGRA frames on frame.sock (same framing as g21-present).
 * Used when RDP output is cluster/HUD so present is not the listener.
 */

function bgraToI420(bgra, w, h) {
    var yPlane = Buffer.alloc(w * h);
    var uPlane = Buffer.alloc((w * h) / 4);
    var vPlane = Buffer.alloc((w * h) / 4);
    var row;
    var col;
    var i;
    var b;
    var g;
    var r;
    var y;
    var u;
    var v;
    var ui;
    for (row = 0; row < h; row += 1) {
        for (col = 0; col < w; col += 1) {
            i = (row * w + col) * 4;
            b = bgra[i];
            g = bgra[i + 1];
            r = bgra[i + 2];
            y = ((66 * r + 129 * g + 25 * b + 128) >> 8) + 16;
            yPlane[row * w + col] = y < 0 ? 0 : (y > 255 ? 255 : y);
            if ((row % 2) === 0 && (col % 2) === 0) {
                u = ((-38 * r - 74 * g + 112 * b + 128) >> 8) + 128;
                v = ((112 * r - 94 * g - 18 * b + 128) >> 8) + 128;
                ui = (row / 2) * (w / 2) + (col / 2);
                uPlane[ui] = u < 0 ? 0 : (u > 255 ? 255 : u);
                vPlane[ui] = v < 0 ? 0 : (v > 255 ? 255 : v);
            }
        }
    }
    return { w: w, h: h, y: yPlane, u: uPlane, v: vPlane };
}

function toAtlas(frame) {
    var w = frame.w;
    var h = frame.h;
    var atlas = Buffer.alloc(w * (h + (h >> 1)));
    var offset;
    var row;
    var half = w >> 1;
    frame.y.copy(atlas, 0);
    offset = w * h;
    for (row = 0; row < (h >> 1); row += 1) {
        frame.u.copy(atlas, offset, row * half, row * half + half);
        offset += half;
        frame.v.copy(atlas, offset, row * half, row * half + half);
        offset += half;
    }
    return atlas;
}

function scaleEven(n) {
    n = Math.max(2, Math.floor(n));
    return n % 2 ? n - 1 : n;
}

function createFrameBridge(opts) {
    var sockPath = opts.sockPath;
    var onFrame = opts.onFrame || function () {};
    var log = opts.log || function () {};
    var server = null;
    var buf = Buffer.alloc(0);
    var need = 0;
    var header = null;
    var targetW = opts.targetW || 1920;
    var targetH = opts.targetH || 720;

    function resetParse() {
        buf = Buffer.alloc(0);
        need = 0;
        header = null;
    }

    function emitSized(bgra, w, h) {
        var dw = scaleEven(targetW);
        var dh = scaleEven(targetH);
        var i420;
        var atlas;
        var scaled;
        var row;
        var col;
        var sx;
        var sy;
        var si;
        var o;
        if (w === dw && h === dh && (w % 2) === 0 && (h % 2) === 0) {
            i420 = bgraToI420(bgra, w, h);
            atlas = toAtlas(i420);
        } else {
            scaled = Buffer.alloc(dw * dh * 4);
            for (row = 0; row < dh; row += 1) {
                sy = Math.min(h - 1, Math.floor(row * h / dh));
                for (col = 0; col < dw; col += 1) {
                    sx = Math.min(w - 1, Math.floor(col * w / dw));
                    si = (sy * w + sx) * 4;
                    o = (row * dw + col) * 4;
                    scaled[o] = bgra[si];
                    scaled[o + 1] = bgra[si + 1];
                    scaled[o + 2] = bgra[si + 2];
                    scaled[o + 3] = 255;
                }
            }
            i420 = bgraToI420(scaled, dw, dh);
            atlas = toAtlas(i420);
        }
        onFrame({ w: dw, h: dh, atlas: atlas });
    }

    function onData(chunk) {
        buf = Buffer.concat([buf, chunk]);
        while (true) {
            if (!header) {
                if (buf.length < 8) {
                    return;
                }
                var w = buf.readUInt16LE(0);
                var h = buf.readUInt16LE(2);
                var len = buf.readUInt32LE(4);
                if (!w || !h || w > 4096 || h > 2160 || len !== w * h * 4) {
                    resetParse();
                    return;
                }
                header = { w: w, h: h, len: len };
                buf = buf.slice(8);
            }
            if (buf.length < header.len) {
                return;
            }
            var payload = buf.slice(0, header.len);
            var fw = header.w;
            var fh = header.h;
            buf = buf.slice(header.len);
            header = null;
            try {
                emitSized(payload, fw, fh);
            } catch (err) {
                log('frame-bridge ' + (err && err.message));
            }
        }
    }

    return {
        setTargetSize: function (w, h) {
            targetW = scaleEven(w || 1920);
            targetH = scaleEven(h || 720);
        },
        start: function () {
            if (server) {
                return { ok: true };
            }
            try {
                try {
                    fs.unlinkSync(sockPath);
                } catch (errUn) {
                    // ignore stale path; live present bind still causes EADDRINUSE
                }
                server = net.createServer(function (sock) {
                    resetParse();
                    sock.on('data', onData);
                    sock.on('error', function () {});
                    sock.on('close', function () {
                        resetParse();
                    });
                });
                server.on('error', function (err) {
                    log('frame-bridge-listen ' + (err && err.message));
                    try {
                        server.close();
                    } catch (errClose) {
                        // ignore
                    }
                    server = null;
                });
                server.listen(sockPath, function () {
                    try {
                        fs.chmodSync(sockPath, 438);
                    } catch (errCh) {
                        // ignore
                    }
                    log('frame-bridge-listen ok');
                });
                return { ok: true };
            } catch (err) {
                server = null;
                return { ok: false, reason: err && err.message };
            }
        },
        isListening: function () {
            return !!(server && server.listening);
        },
        stop: function () {
            if (!server) {
                return { ok: true };
            }
            try {
                server.close();
            } catch (err) {
                // ignore
            }
            server = null;
            try {
                fs.unlinkSync(sockPath);
            } catch (err2) {
                // ignore
            }
            resetParse();
            return { ok: true };
        }
    };
}

module.exports = {
    createFrameBridge: createFrameBridge,
    bgraToI420: bgraToI420,
    toAtlas: toAtlas
};
