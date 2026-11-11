'use strict';

var crypto = require('crypto');
var net = require('net');

function concat(left, right) {
    return Buffer.concat([left, right]);
}

function bitReverse(value) {
    var result = 0;
    var bit;
    for (bit = 0; bit < 8; bit++) {
        result = (result << 1) | (value & 1);
        value >>= 1;
    }
    return result;
}

function vncAuthResponse(challenge, password) {
    var key = Buffer.alloc(8);
    var text = Buffer.from(String(password), 'latin1');
    var i;
    for (i = 0; i < text.length && i < 8; i++) {
        key[i] = bitReverse(text[i]);
    }
    var cipher = crypto.createCipheriv('des-ecb', key, Buffer.alloc(0));
    cipher.setAutoPadding(false);
    return concat(cipher.update(challenge), cipher.final());
}

function createVncClient(opts) {
    var options = opts || {};
    var onFrame = options.onFrame || function () {};
    var socket = null;
    var buffer = Buffer.alloc(0);
    var state = 'idle';
    var status = { state: 'idle', detail: '' };
    var width = 0;
    var height = 0;
    var pixels = null;
    var bytesPerPixel = 4;
    var pendingRects = 0;
    var rect = null;
    var rectOffset = 0;
    var disposed = false;
    var target = null;
    var buttonMask = 0;
    var cursorX = 0;
    var cursorY = 0;

    function setStatus(next, detail) {
        status = { state: next, detail: detail || '', w: width, h: height };
    }

    function fail(reason) {
        setStatus('error', reason);
        if (socket) {
            socket.destroy();
            socket = null;
        }
        state = 'idle';
    }

    function send(chunk) {
        if (socket) {
            socket.write(chunk);
        }
    }

    function request(incremental) {
        var packet = Buffer.alloc(10);
        packet[0] = 3;
        packet[1] = incremental ? 1 : 0;
        packet.writeUInt16BE(0, 2);
        packet.writeUInt16BE(0, 4);
        packet.writeUInt16BE(width, 6);
        packet.writeUInt16BE(height, 8);
        send(packet);
    }

    function sendFormat() {
        var packet = Buffer.alloc(20);
        packet[0] = 0;
        packet[4] = 32;
        packet[5] = 24;
        packet[6] = 0;
        packet[7] = 1;
        packet.writeUInt16BE(255, 8);
        packet.writeUInt16BE(255, 10);
        packet.writeUInt16BE(255, 12);
        packet[14] = 16;
        packet[15] = 8;
        packet[16] = 0;
        send(packet);
        var encodings = Buffer.alloc(12);
        encodings[0] = 2;
        encodings.writeUInt16BE(2, 2);
        encodings.writeInt32BE(0, 4);
        encodings.writeInt32BE(1, 8);
        send(encodings);
        request(0);
        setStatus('connected', width + 'x' + height);
    }

    function paintRect() {
        if (!pixels || !rect) {
            return;
        }
        var y;
        var x;
        var srcRow = rect.w * bytesPerPixel;
        for (y = 0; y < rect.h; y++) {
            var destY = rect.y + y;
            if (destY < 0 || destY >= height) {
                continue;
            }
            for (x = 0; x < rect.w; x++) {
                var destX = rect.x + x;
                if (destX < 0 || destX >= width) {
                    continue;
                }
                var from = y * srcRow + x * bytesPerPixel;
                var to = (destY * width + destX) * bytesPerPixel;
                rect.raw.copy(pixels, to, from, from + bytesPerPixel);
            }
        }
    }

    function copyRect() {
        if (!pixels || !rect) {
            return;
        }
        var y;
        var row = width * bytesPerPixel;
        var top = rect.sy < rect.y;
        var start = top ? 0 : rect.h - 1;
        var end = top ? rect.h : -1;
        var step = top ? 1 : -1;
        for (y = start; y !== end; y += step) {
            var from = ((rect.sy + y) * width + rect.sx) * bytesPerPixel;
            var to = ((rect.y + y) * width + rect.x) * bytesPerPixel;
            if (rect.sy + y < 0 || rect.y + y < 0 || rect.sy + y >= height || rect.y + y >= height) {
                continue;
            }
            pixels.copy(pixels, to, from, from + rect.w * bytesPerPixel);
            if (rect.w * bytesPerPixel > row) {
                break;
            }
        }
    }

    function take(size) {
        if (buffer.length < size) {
            return null;
        }
        var chunk = buffer.slice(0, size);
        buffer = buffer.slice(size);
        return chunk;
    }

    function finishRect() {
        if (rect.encoding === 0) {
            paintRect();
        } else if (rect.encoding === 1) {
            copyRect();
        }
        onFrame({ w: width, h: height, bgra: pixels });
        pendingRects -= 1;
        rect = null;
        if (pendingRects === 0) {
            state = 'message';
            request(1);
        } else {
            state = 'rect';
        }
    }

    function parse() {
        var chunk;
        while (true) {
            if (state === 'banner') {
                chunk = take(12);
                if (!chunk) {
                    return;
                }
                send(Buffer.from('RFB 003.008\n', 'ascii'));
                state = 'security-count';
            } else if (state === 'security-count') {
                chunk = take(1);
                if (!chunk) {
                    return;
                }
                state = chunk[0] === 0 ? 'security-fail' : 'security-list';
                rectOffset = chunk[0];
            } else if (state === 'security-fail') {
                if (!rect || rect.encoding !== -1) {
                    chunk = take(4);
                    if (!chunk) {
                        return;
                    }
                    rect = { encoding: -1, raw: null, w: chunk.readUInt32BE(0), h: 0, x: 0, y: 0, sx: 0, sy: 0 };
                }
                chunk = take(rect.w);
                if (!chunk) {
                    return;
                }
                fail('security-refused');
                return;
            } else if (state === 'security-list') {
                chunk = take(rectOffset);
                if (!chunk) {
                    return;
                }
                var choice = 0;
                var i;
                for (i = 0; i < chunk.length; i++) {
                    if (chunk[i] === 1) {
                        choice = 1;
                    }
                    if (chunk[i] === 2 && options.password) {
                        choice = 2;
                    }
                }
                if (!choice) {
                    fail(options.password ? 'auth-unavailable' : 'auth-required');
                    return;
                }
                send(Buffer.from([choice]));
                state = choice === 2 ? 'challenge' : 'security-result';
            } else if (state === 'challenge') {
                chunk = take(16);
                if (!chunk) {
                    return;
                }
                try {
                    send(vncAuthResponse(chunk, options.password));
                } catch (err) {
                    fail('auth-unavailable');
                    return;
                }
                state = 'security-result';
            } else if (state === 'security-result') {
                chunk = take(4);
                if (!chunk) {
                    return;
                }
                if (chunk.readUInt32BE(0) !== 0) {
                    fail('auth-failed');
                    return;
                }
                send(Buffer.from([1]));
                state = 'server-init';
            } else if (state === 'server-init') {
                chunk = take(24);
                if (!chunk) {
                    return;
                }
                width = chunk.readUInt16BE(0);
                height = chunk.readUInt16BE(2);
                if (width < 1 || height < 1 || width > 8192 || height > 8192) {
                    fail('bad-size');
                    return;
                }
                bytesPerPixel = 4;
                pixels = Buffer.alloc(width * height * bytesPerPixel);
                var nameLength = chunk.readUInt32BE(20);
                state = 'server-name';
                rectOffset = nameLength;
            } else if (state === 'server-name') {
                chunk = take(rectOffset);
                if (!chunk) {
                    return;
                }
                sendFormat();
                state = 'message';
            } else if (state === 'message') {
                chunk = take(1);
                if (!chunk) {
                    return;
                }
                if (chunk[0] !== 0) {
                    fail('unsupported-message');
                    return;
                }
                state = 'update-header';
            } else if (state === 'update-header') {
                chunk = take(3);
                if (!chunk) {
                    return;
                }
                pendingRects = chunk.readUInt16BE(1);
                state = pendingRects ? 'rect' : 'message';
                if (!pendingRects) {
                    request(1);
                }
            } else if (state === 'rect') {
                chunk = take(12);
                if (!chunk) {
                    return;
                }
                rect = {
                    x: chunk.readUInt16BE(0),
                    y: chunk.readUInt16BE(2),
                    w: chunk.readUInt16BE(4),
                    h: chunk.readUInt16BE(6),
                    encoding: chunk.readInt32BE(8),
                    raw: null,
                    sx: 0,
                    sy: 0,
                };
                if (rect.encoding === 0) {
                    state = 'raw';
                    rectOffset = rect.w * rect.h * bytesPerPixel;
                } else if (rect.encoding === 1) {
                    state = 'copy';
                } else {
                    fail('unsupported-encoding');
                    return;
                }
            } else if (state === 'raw') {
                chunk = take(rectOffset);
                if (!chunk) {
                    return;
                }
                rect.raw = chunk;
                finishRect();
            } else if (state === 'copy') {
                chunk = take(4);
                if (!chunk) {
                    return;
                }
                rect.sx = chunk.readUInt16BE(0);
                rect.sy = chunk.readUInt16BE(2);
                finishRect();
            } else {
                return;
            }
        }
    }

    function pointer(x, y) {
        cursorX = x;
        cursorY = y;
        var packet = Buffer.alloc(6);
        packet[0] = 5;
        packet[1] = buttonMask;
        packet.writeUInt16BE(Math.max(0, Math.min(65535, x)), 2);
        packet.writeUInt16BE(Math.max(0, Math.min(65535, y)), 4);
        send(packet);
    }

    return {
        connect: function (host, port, extra) {
            if (disposed) {
                return Promise.resolve({ ok: false, reason: 'disposed' });
            }
            options.password = extra && extra.password ? extra.password : options.password;
            target = { host: host, port: port };
            setStatus('connecting', host);
            buffer = Buffer.alloc(0);
            state = 'banner';
            return new Promise(function (resolve) {
                var settled = false;
                function done(result) {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    resolve(result);
                }
                socket = net.connect({ host: host, port: port }, function () {
                    done({ ok: true, state: 'banner', target: target });
                });
                socket.on('data', function (chunk) {
                    buffer = concat(buffer, chunk);
                    try {
                        parse();
                    } catch (err) {
                        fail('parse-error');
                    }
                });
                socket.on('error', function () {
                    fail('network');
                    done({ ok: false, reason: 'network', target: target });
                });
                socket.on('close', function () {
                    if (status.state === 'connected') {
                        setStatus('closed', 'network');
                    }
                });
            });
        },
        disconnect: function () {
            if (socket) {
                socket.destroy();
                socket = null;
            }
            state = 'idle';
            setStatus('idle', 'disconnected');
            return { ok: true, state: 'idle' };
        },
        reconnect: function () {
            var again = target;
            this.disconnect();
            if (!again) {
                return Promise.resolve({ ok: false, reason: 'idle' });
            }
            return this.connect(again.host, again.port, { password: options.password });
        },
        getStatus: function () {
            return {
                state: status.state,
                detail: status.detail,
                w: width,
                h: height,
            };
        },
        sendMouseMove: function (x, y) {
            if (status.state !== 'connected') {
                return { ok: false, reason: 'not-connected' };
            }
            pointer(x, y);
            return { ok: true };
        },
        sendMouseClick: function (button, down) {
            if (status.state !== 'connected') {
                return { ok: false, reason: 'not-connected' };
            }
            var bit = button === 3 ? 4 : (button === 2 ? 2 : 1);
            if (down) {
                buttonMask |= bit;
            } else {
                buttonMask &= ~bit;
            }
            pointer(cursorX, cursorY);
            return { ok: true };
        },
        sendMouseScroll: function (delta) {
            if (status.state !== 'connected') {
                return { ok: false, reason: 'not-connected' };
            }
            var bit = delta > 0 ? 8 : 16;
            buttonMask |= bit;
            pointer(cursorX, cursorY);
            buttonMask &= ~bit;
            pointer(cursorX, cursorY);
            return { ok: true };
        },
        sendKey: function (keysym, down) {
            if (status.state !== 'connected') {
                return { ok: false, reason: 'not-connected' };
            }
            var packet = Buffer.alloc(8);
            packet[0] = 4;
            packet[1] = down ? 1 : 0;
            packet.writeUInt32BE(keysym, 4);
            send(packet);
            return { ok: true };
        },
        dispose: function () {
            disposed = true;
            options.password = '';
            return this.disconnect();
        },
    };
}

module.exports = {
    createVncClient: createVncClient,
    vncAuthResponse: vncAuthResponse,
};
