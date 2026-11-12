'use strict';

/*
 * Draws the AirPlay menu as rectangles on the head unit's GPU renderer.
 * The RHMI list on this unit opens and stays blank. Working screens paint
 * with the renderd command stream: HELLO, PLACE, SHOW, then a FRAME of
 * CLEAR and RECT. This file speaks that stream. It does not use the kit.
 */

var net = require('net');
var fs = require('fs');

var HELLO = 1;
var PLACE = 2;
var SHOW = 3;
var FRAME = 7;
var GRAB = 10;
var READY = 101;
var CCU = 105;
var X_GRAB = 0x4d520002;
var X_READY = 0x4d520101;
var X_STATE = 0x4d520102;
var X_CCU = 0x4d520103;
var CLAIM = 9;
var TOUCH = 105;
var CLOSED = 106;

var INK = 0xF2F4F8FF;
var HINT = 0x9AA3B2FF;
var BAR = 0x243044FF;
var PAGE = 0x10141CFF;
// Margins left clear inside a full-screen surface. On this car a PLACE of only
// this box drew nothing. The back column and title strip stay unpainted so iDrive
// can take them.
var CONTENT = { x: 104, y: 88, w: 1796, h: 632 };

var FONT = {
    ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
    'A': ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
    'C': ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
    'D': ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
    'H': ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
    'L': ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
    'N': ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
    'P': ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
    'R': ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
    'V': ['10001', '10001', '10001', '10001', '01010', '01010', '00100'],
    'a': ['00000', '00000', '01110', '00001', '01111', '10001', '01111'],
    'd': ['00001', '00001', '01111', '10001', '10001', '10001', '01111'],
    'e': ['00000', '00000', '01110', '10001', '11111', '10000', '01110'],
    'i': ['00100', '00000', '01100', '00100', '00100', '00100', '01110'],
    'l': ['01100', '00100', '00100', '00100', '00100', '00100', '01110'],
    'o': ['00000', '00000', '01110', '10001', '10001', '10001', '01110'],
    'p': ['00000', '00000', '11110', '10001', '11110', '10000', '10000'],
    'r': ['00000', '00000', '10110', '11000', '10000', '10000', '10000'],
    's': ['00000', '00000', '01111', '10000', '01110', '00001', '11110'],
    't': ['00100', '00100', '11111', '00100', '00100', '00100', '00011'],
    'u': ['00000', '00000', '10001', '10001', '10001', '10011', '01101'],
    'y': ['00000', '00000', '10001', '10001', '01111', '00001', '01110'],
    'U': ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
    'b': ['10000', '10000', '11110', '10001', '10001', '10001', '11110'],
    'c': ['00000', '00000', '01110', '10000', '10000', '10000', '01110'],
    'f': ['00111', '00100', '01110', '00100', '00100', '00100', '00100'],
    'k': ['10000', '10010', '10100', '11000', '10100', '10010', '10001'],
    'n': ['00000', '00000', '11001', '10101', '10011', '10001', '10001'],
    'w': ['00000', '00000', '10001', '10001', '10101', '10101', '01010'],
    'x': ['00000', '00000', '10001', '01010', '00100', '01010', '10001'],
    'z': ['00000', '00000', '11111', '00010', '00100', '01000', '11111']
};

var ITEMS = [
    { name: 'airplay', title: 'AirPlay', hint: 'Lustro' },
    { name: 'rdp', title: 'RDP', hint: 'Pulpit' },
    { name: 'vnc', title: 'VNC', hint: 'Pulpit' },
    { name: 'host', title: 'Adres', hint: 'Host' }
];

function message(type, payload) {
    var len = payload ? payload.length : 0;
    var pad = (4 - (len & 3)) & 3;
    var out = Buffer.alloc(8 + len + pad);
    out.writeUInt32LE(type >>> 0, 0);
    out.writeUInt32LE(len + pad, 4);
    if (len) {
        payload.copy(out, 8);
    }
    return out;
}

function u32(value) {
    var b = Buffer.alloc(4);
    b.writeUInt32LE(value >>> 0, 0);
    return b;
}

function FrameBuilder() {
    this.parts = [];
    this.rects = 0;
}

FrameBuilder.prototype.op = function (value) {
    this.parts.push(u32(value));
};

FrameBuilder.prototype.f32 = function (value) {
    var b = Buffer.alloc(4);
    b.writeFloatLE(value, 0);
    this.parts.push(b);
};

FrameBuilder.prototype.clear = function (color) {
    this.op(1);
    this.op(color);
};

FrameBuilder.prototype.rect = function (x, y, w, h, color) {
    if (!(w > 0) || !(h > 0)) {
        return;
    }
    this.op(2);
    this.f32(x);
    this.f32(y);
    this.f32(w);
    this.f32(h);
    this.op(color);
    this.rects += 1;
};

FrameBuilder.prototype.text = function (str, x, y, scale, color) {
    var pen = x;
    var text = String(str);
    var i;
    var row;
    var col;
    var glyph;
    var ch;
    for (i = 0; i < text.length; i += 1) {
        ch = text.charAt(i);
        glyph = FONT[ch] || FONT[' '];
        for (row = 0; row < glyph.length; row += 1) {
            for (col = 0; col < glyph[row].length; col += 1) {
                if (glyph[row].charAt(col) === '1') {
                    this.rect(pen + col * scale, y + row * scale, scale, scale, color);
                }
            }
        }
        pen += 6 * scale;
    }
};

FrameBuilder.prototype.bytes = function () {
    return Buffer.concat(this.parts);
};

function menuLayout(width, height, count, detail) {
    var boxW = width - CONTENT.x - 20;
    var boxH = height - CONTENT.y;
    var ox = 0;
    var oy = 0;
    if (boxW >= 800 && boxH >= 400) {
        ox = CONTENT.x;
        oy = CONTENT.y;
    } else {
        boxW = width;
        boxH = height;
    }
    var gap = 12;
    var top = 24;
    var statusH = detail ? 48 : 0;
    var rowH = Math.floor((boxH - top - statusH - gap * count) / count);
    var rows = [];
    var i;
    if (rowH > 120) {
        rowH = 120;
    }
    if (rowH < 72) {
        rowH = 72;
    }
    for (i = 0; i < count; i += 1) {
        rows.push({
            x: ox + 40,
            y: oy + top + i * (rowH + gap),
            w: boxW - 80,
            h: rowH
        });
    }
    return { ox: ox, oy: oy, boxW: boxW, boxH: boxH, rowH: rowH, gap: gap, top: top, rows: rows };
}

function buildFrame(items, selected, width, height, detail) {
    var draw = new FrameBuilder();
    var lay = menuLayout(width, height, items.length, detail);
    var i;
    var row;
    draw.clear(0);
    draw.rect(lay.ox, lay.oy, lay.boxW, lay.boxH, PAGE);
    for (i = 0; i < items.length; i += 1) {
        row = lay.rows[i];
        if (i === selected) {
            draw.rect(row.x, row.y, row.w, row.h, BAR);
        }
        draw.text(items[i].title, lay.ox + 72, row.y + 28, 6, INK);
        draw.text(items[i].hint, lay.ox + 72, row.y + 78, 4, HINT);
    }
    if (detail) {
        draw.text(detail, lay.ox + 72, lay.oy + lay.top + items.length * (lay.rowH + lay.gap) + 8, 5, INK);
    }
    return {
        frame: message(FRAME, draw.bytes()),
        rects: draw.rects
    };
}

function encoderStep(previous, next) {
    if (previous === null || previous === undefined) {
        return 0;
    }
    var delta = (next - previous) | 0;
    if (delta > 32767) {
        delta -= 65536;
    }
    if (delta < -32767) {
        delta += 65536;
    }
    if (delta > 4) {
        return 4;
    }
    if (delta < -4) {
        return -4;
    }
    return delta;
}

function createMenuSurface(opts) {
    var note = opts.note || function () {};
    var choose = opts.choose || function () {};
    var items = opts.items || ITEMS;
    var paths = opts.sockets || ['/run/mgu-renderd/renderd.sock', '/run/mgu-render/render.sock'];
    var selected = 0;
    var shown = false;
    var front = false;
    var ready = false;
    var native = false;
    var touchOn = false;
    var sock = null;
    var incoming = Buffer.alloc(0);
    var screen = { w: 1920, h: 720 };
    var retry = null;
    var pulse = null;
    var which = 0;
    var lastOp = null;
    var lastPush = 0;
    var noted = false;
    var detail = '';

    function isSocket(file) {
        try {
            return fs.statSync(file).isSocket();
        } catch (err) {
            return false;
        }
    }

    function write(buf) {
        if (!sock) {
            return;
        }
        try {
            sock.write(buf);
        } catch (err) {
            note('menu-write ' + (err && err.message));
        }
    }

    function sendPlace() {
        var w = screen.w || 1920;
        var h = screen.h || 720;
        var b = Buffer.alloc(28);
        b.writeInt32LE(0, 0);
        b.writeInt32LE(0, 4);
        b.writeInt32LE(w, 8);
        b.writeInt32LE(h, 12);
        b.writeFloatLE(1, 16);
        b.writeFloatLE(0, 20);
        b.writeFloatLE(0, 24);
        write(message(PLACE, b));
    }

    function sendShow(on) {
        write(message(SHOW, u32(on ? 1 : 0)));
    }

    function sendGrab(on) {
        write(message(native ? X_GRAB : GRAB, u32(on ? 1 : 0)));
    }

    function paint() {
        if (!ready || !shown || !front) {
            return;
        }
        sendPlace();
        sendShow(true);
        sendGrab(true);
        sendClaim();
        var built = buildFrame(items, selected, screen.w || 1920, screen.h || 720, detail);
        write(built.frame);
        if (!noted) {
            noted = true;
            note('menu-frame ' + built.rects);
        }
    }

    function hideSurface() {
        sendShow(false);
        sendGrab(false);
    }

    function applyFront(on) {
        if (front === on) {
            return;
        }
        front = on;
        note(on ? 'menu-front' : 'menu-back');
        if (!on) {
            hideSurface();
            return;
        }
        paint();
    }

    function sendClaim() {
        if (!native || !touchOn || !front) {
            return;
        }
        var b = Buffer.alloc(20);
        b.writeUInt32LE(1, 0);
        b.writeFloatLE(CONTENT.x, 4);
        b.writeFloatLE(CONTENT.y, 8);
        b.writeFloatLE(CONTENT.w, 12);
        b.writeFloatLE(CONTENT.h, 16);
        write(message(CLAIM, b));
    }

    function hitRow(x, y) {
        var lay = menuLayout(screen.w || 1920, screen.h || 720, items.length, !!detail);
        var i;
        var row;
        for (i = 0; i < lay.rows.length; i += 1) {
            row = lay.rows[i];
            if (x >= row.x && x < row.x + row.w && y >= row.y && y < row.y + row.h) {
                return i;
            }
        }
        return -1;
    }

    function move(delta) {
        if (!delta) {
            return;
        }
        selected = (selected + delta) % items.length;
        if (selected < 0) {
            selected += items.length;
        }
        paint();
    }

    function press() {
        var item = items[selected];
        if (item) {
            choose(item.name);
        }
    }

    function onControl(operation, push) {
        var step = encoderStep(lastOp, operation);
        lastOp = operation;
        if (step) {
            move(step > 0 ? 1 : -1);
        }
        if (push === 1 && lastPush !== 1) {
            press();
        }
        lastPush = push;
    }

    function take(buf) {
        incoming = incoming.length ? Buffer.concat([incoming, buf]) : buf;
        while (incoming.length >= 8) {
            var type = incoming.readUInt32LE(0);
            var len = incoming.readUInt32LE(4);
            if (incoming.length < 8 + len) {
                return;
            }
            var body = incoming.slice(8, 8 + len);
            incoming = incoming.slice(8 + len);
            if (type === X_READY) {
                native = true;
            } else if (type === READY) {
                ready = true;
                if (body.length >= 12) {
                    screen = { w: body.readUInt32LE(4), h: body.readUInt32LE(8) };
                }
                touchOn = body.length >= 16 && body.readUInt32LE(12) !== 0;
                note('menu-ready ' + screen.w + 'x' + screen.h);
                paint();
            } else if (type === X_STATE && body.length >= 8) {
                applyFront(body.readUInt32LE(4) !== 0 && shown);
            } else if (type === CLOSED) {
                applyFront(false);
            } else if (type === TOUCH && body.length >= 12 && front) {
                if (body.readUInt32LE(0) === 1) {
                    var hit = hitRow(body.readFloatLE(4), body.readFloatLE(8));
                    if (hit >= 0) {
                        selected = hit;
                        paint();
                        press();
                    }
                }
            } else if (type === CCU && body.length >= 5 && front) {
                onControl(body.readUInt16BE(1), body[3]);
            } else if (type === X_CCU && body.length >= 5 && front) {
                onControl(body.readUInt16BE(1), body[3]);
            }
        }
    }

    function connect() {
        var file = paths[which % paths.length];
        if (!isSocket(file)) {
            which += 1;
            file = paths[which % paths.length];
        }
        note('menu-socket ' + file);
        var next = net.createConnection(file);
        sock = next;
        next.on('connect', function () {
            ready = false;
            native = false;
            incoming = Buffer.alloc(0);
            write(message(HELLO, Buffer.from('g21_airplay')));
        });
        next.on('data', take);
        next.on('error', function (err) {
            note('menu-error ' + (err && err.message));
            which += 1;
        });
        next.on('close', function () {
            ready = false;
            sock = null;
            if (shown && !retry) {
                retry = setTimeout(function () {
                    retry = null;
                    if (shown) {
                        connect();
                    }
                }, 3000);
                if (retry.unref) {
                    retry.unref();
                }
            }
        });
    }

    function armPulse() {
        if (pulse) {
            return;
        }
        pulse = setInterval(function () {
            if (shown && ready && front) {
                paint();
            }
        }, 500);
        if (pulse.unref) {
            pulse.unref();
        }
    }

    return {
        items: items,
        open: function () {
            shown = true;
            front = true;
            armPulse();
            if (sock) {
                paint();
                return;
            }
            connect();
        },
        setFront: function (on) {
            if (!on) {
                applyFront(false);
                return;
            }
            shown = true;
            applyFront(true);
        },
        close: function () {
            shown = false;
            front = false;
            if (pulse) {
                clearInterval(pulse);
                pulse = null;
            }
            if (retry) {
                clearTimeout(retry);
                retry = null;
            }
            sendShow(false);
            sendGrab(false);
            if (sock) {
                sock.destroy();
                sock = null;
            }
        },
        move: move,
        press: press,
        setStatus: function (text) {
            var next = String(text || '');
            if (next === detail) {
                return;
            }
            detail = next;
            paint();
        },
        selected: function () { return selected; }
    };
}

module.exports = {
    ITEMS: ITEMS,
    message: message,
    buildFrame: buildFrame,
    encoderStep: encoderStep,
    createMenuSurface: createMenuSurface
};
