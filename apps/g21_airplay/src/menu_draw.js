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
var X_MODE = 0x4d520001;
var X_MODE_LAYER = 1;
var CLAIM = 9;
var TOUCH = 105;
var CLOSED = 106;

var INK = 0xF5F7FAFF;
var HINT = 0x8B95A8FF;
var MUTED = 0x5C677AFF;
var BAR = 0x243044FF;
var CARD = 0x171E2BFF;
var CARD_HI = 0x1E2A3DFF;
var PAGE = 0x0B0E14FF;
var PAGE_TOP = 0x121826FF;
var ACCENT = 0x2F7BFFFF;
var ACCENT_DIM = 0x1A4A99FF;
var ICON_FG = 0xE8EEF8FF;
var ICON_ACCENT = 0x6AA4FFFF;
// Margins left clear inside a full-screen surface. On this car a PLACE of only
// this box drew nothing. The back column and title strip stay unpainted so iDrive
// can take them.
var CONTENT = { x: 104, y: 88, w: 1796, h: 632 };

// 16x16 1-bit icons for option tiles (RECT-only renderer).
var ICONS = {
    airplay: [
        '0000000000000000',
        '0001111111111000',
        '0010000000000100',
        '0100000000000010',
        '0100000000000010',
        '0100000000000010',
        '0100000000000010',
        '0100001110000010',
        '0100011111000010',
        '0010011111000100',
        '0001001110010000',
        '0000100100100000',
        '0000010001000000',
        '0000001010000000',
        '0000000100000000',
        '0000000000000000'
    ],
    desktop: [
        '0000000000000000',
        '0011111111111100',
        '0100000000000010',
        '0100111111110010',
        '0100100000010010',
        '0100100000010010',
        '0100100000010010',
        '0100100000010010',
        '0100111111110010',
        '0100000000000010',
        '0011111111111100',
        '0000011111100000',
        '0000011111100000',
        '0001111111111000',
        '0000000000000000',
        '0000000000000000'
    ],
    grid: [
        '0000000000000000',
        '0011101110111000',
        '0011101110111000',
        '0011101110111000',
        '0000000000000000',
        '0011101110111000',
        '0011101110111000',
        '0011101110111000',
        '0000000000000000',
        '0011101110111000',
        '0011101110111000',
        '0011101110111000',
        '0000000000000000',
        '0000000000000000',
        '0000000000000000',
        '0000000000000000'
    ],
    play: [
        '0000000000000000',
        '0000110000000000',
        '0000111100000000',
        '0000111111000000',
        '0000111111110000',
        '0000111111111000',
        '0000111111111100',
        '0000111111111000',
        '0000111111110000',
        '0000111111000000',
        '0000111100000000',
        '0000110000000000',
        '0000000000000000',
        '0000000000000000',
        '0000000000000000',
        '0000000000000000'
    ],
    stop: [
        '0000000000000000',
        '0000000000000000',
        '0011111111111100',
        '0011111111111100',
        '0011111111111100',
        '0011111111111100',
        '0011111111111100',
        '0011111111111100',
        '0011111111111100',
        '0011111111111100',
        '0011111111111100',
        '0011111111111100',
        '0000000000000000',
        '0000000000000000',
        '0000000000000000',
        '0000000000000000'
    ],
    tag: [
        '0000000000000000',
        '0000011111100000',
        '0000110000110000',
        '0001100000011000',
        '0011000000001100',
        '0110000000000110',
        '0110000001100110',
        '0110000001100110',
        '0110000000000110',
        '0011000000001100',
        '0001100000011000',
        '0000110000110000',
        '0000011111100000',
        '0000000000000000',
        '0000000000000000',
        '0000000000000000'
    ],
    wifi: [
        '0000000000000000',
        '0000011111100000',
        '0001111111111000',
        '0011000000001100',
        '0110001111000110',
        '0000111111110000',
        '0001100000110000',
        '0000011111100000',
        '0000110000110000',
        '0000001111000000',
        '0000000100000000',
        '0000001110000000',
        '0000000100000000',
        '0000000000000000',
        '0000000000000000',
        '0000000000000000'
    ],
    back: [
        '0000000000000000',
        '0000001000000000',
        '0000011000000000',
        '0000111000000000',
        '0001111111111000',
        '0011111111111000',
        '0111111111111000',
        '0011111111111000',
        '0001111111111000',
        '0000111000000000',
        '0000011000000000',
        '0000001000000000',
        '0000000000000000',
        '0000000000000000',
        '0000000000000000',
        '0000000000000000'
    ],
    host: [
        '0000000000000000',
        '0011111111111100',
        '0100000000000010',
        '0101110111011100',
        '0100000000000010',
        '0011111111111100',
        '0011111111111100',
        '0100000000000010',
        '0101110111011100',
        '0100000000000010',
        '0011111111111100',
        '0000010000100000',
        '0000011111100000',
        '0000000000000000',
        '0000000000000000',
        '0000000000000000'
    ],
    user: [
        '0000000000000000',
        '0000011111100000',
        '0000111111110000',
        '0000111111110000',
        '0000011111100000',
        '0000001111000000',
        '0000011111100000',
        '0001111111111000',
        '0011111111111100',
        '0011111111111100',
        '0011111111111100',
        '0001111111111000',
        '0000000000000000',
        '0000000000000000',
        '0000000000000000',
        '0000000000000000'
    ],
    gear: [
        '0000000000000000',
        '0000001111000000',
        '0010011111100100',
        '0111111001111110',
        '0011110000111100',
        '0111001111001110',
        '0110011111100110',
        '0110011111100110',
        '0111001111001110',
        '0011110000111100',
        '0111111001111110',
        '0010011111100100',
        '0000001111000000',
        '0000000000000000',
        '0000000000000000',
        '0000000000000000'
    ]
};

var FONT = {
    ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
    '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
    '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
    ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
    '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
    '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
    '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
    '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
    '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
    '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
    '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
    '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
    '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
    '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
    'A': ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
    'B': ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
    'C': ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
    'D': ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
    'E': ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
    'G': ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
    'H': ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
    'I': ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
    'K': ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
    'L': ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
    'M': ['10001', '11011', '10101', '10001', '10001', '10001', '10001'],
    'N': ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
    'O': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
    'P': ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
    'R': ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
    'S': ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
    'T': ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
    'U': ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
    'V': ['10001', '10001', '10001', '10001', '01010', '01010', '00100'],
    'W': ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
    'a': ['00000', '00000', '01110', '00001', '01111', '10001', '01111'],
    'b': ['10000', '10000', '11110', '10001', '10001', '10001', '11110'],
    'c': ['00000', '00000', '01110', '10000', '10000', '10000', '01110'],
    'd': ['00001', '00001', '01111', '10001', '10001', '10001', '01111'],
    'e': ['00000', '00000', '01110', '10001', '11111', '10000', '01110'],
    'f': ['00111', '00100', '01110', '00100', '00100', '00100', '00100'],
    'g': ['00000', '00000', '01111', '10001', '01111', '00001', '01110'],
    'i': ['00100', '00000', '01100', '00100', '00100', '00100', '01110'],
    'k': ['10000', '10010', '10100', '11000', '10100', '10010', '10001'],
    'l': ['01100', '00100', '00100', '00100', '00100', '00100', '01110'],
    'm': ['00000', '00000', '11010', '10101', '10101', '10001', '10001'],
    'n': ['00000', '00000', '11001', '10101', '10011', '10001', '10001'],
    'o': ['00000', '00000', '01110', '10001', '10001', '10001', '01110'],
    'p': ['00000', '00000', '11110', '10001', '11110', '10000', '10000'],
    'r': ['00000', '00000', '10110', '11000', '10000', '10000', '10000'],
    's': ['00000', '00000', '01111', '10000', '01110', '00001', '11110'],
    't': ['00100', '00100', '11111', '00100', '00100', '00100', '00011'],
    'u': ['00000', '00000', '10001', '10001', '10001', '10011', '01101'],
    'w': ['00000', '00000', '10001', '10001', '10101', '10101', '01010'],
    'x': ['00000', '00000', '10001', '01010', '00100', '01010', '10001'],
    'y': ['00000', '00000', '10001', '10001', '01111', '00001', '01110'],
    'z': ['00000', '00000', '11111', '00010', '00100', '01000', '11111']
};

var ROOT_ITEMS = [
    { name: 'airplay', title: 'AirPlay', hint: 'Lustro iPhone', icon: 'airplay' },
    { name: 'rdp', title: 'RDP', hint: 'Pulpit Windows', icon: 'desktop' },
    { name: 'vnc', title: 'VNC', hint: 'Pulpit zdalny', icon: 'grid' }
];

var AIRPLAY_ITEMS = [
    { name: 'air-start', title: 'Lustro', hint: 'Wlacz AirPlay', icon: 'airplay' },
    { name: 'air-stop', title: 'Stop AP', hint: 'Wylacz lustro', icon: 'stop' },
    { name: 'air-name', title: 'Nazwa', hint: 'G21', icon: 'tag' },
    { name: 'air-info', title: 'Siec', hint: 'Wi-Fi Store', icon: 'wifi' },
    { name: 'air-back', title: 'Wstecz', hint: 'Menu glowne', icon: 'back' }
];

var RDP_ITEMS = [
    { name: 'rdp-connect', title: 'Polacz', hint: 'Sesja Windows', icon: 'desktop' },
    { name: 'rdp-cut', title: 'Stop RDP', hint: 'Koniec sesji', icon: 'stop' },
    { name: 'rdp-ip', title: 'IP', hint: '0.0.0.0', icon: 'host' },
    { name: 'rdp-port', title: 'Port', hint: '3389', icon: 'gear' },
    { name: 'rdp-user', title: 'Konto', hint: 'user', icon: 'user' },
    { name: 'rdp-pass', title: 'Haslo', hint: 'panel WWW', icon: 'tag' },
    { name: 'rdp-cert', title: 'Cert', hint: 'zaufaj odcisk', icon: 'wifi' },
    { name: 'rdp-panel', title: 'WWW', hint: ':1235', icon: 'grid' },
    { name: 'rdp-back', title: 'Wstecz', hint: 'Menu glowne', icon: 'back' }
];

var VNC_ITEMS = [
    { name: 'vnc-connect', title: 'Polacz', hint: 'Sesja VNC', icon: 'grid' },
    { name: 'vnc-cut', title: 'Stop VNC', hint: 'Koniec sesji', icon: 'stop' },
    { name: 'vnc-ip', title: 'IP', hint: '0.0.0.0', icon: 'host' },
    { name: 'vnc-port', title: 'Port', hint: '5900', icon: 'gear' },
    { name: 'vnc-back', title: 'Wstecz', hint: 'Menu glowne', icon: 'back' }
];

var ITEMS = ROOT_ITEMS;
var SCREENS = {
    root: ROOT_ITEMS,
    airplay: AIRPLAY_ITEMS,
    rdp: RDP_ITEMS,
    vnc: VNC_ITEMS
};

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

FrameBuilder.prototype.textWidth = function (str, scale) {
    return String(str || '').length * 6 * scale;
};

FrameBuilder.prototype.pill = function (x, y, w, h, color) {
    var radius = Math.floor(Math.min(h / 2, w / 2, 28));
    var i;
    var inset;
    var span;
    if (radius < 6) {
        this.rect(x, y, w, h, color);
        return;
    }
    for (i = 0; i < radius; i += 1) {
        inset = radius - 1 - Math.floor(Math.sqrt((radius * radius) - ((radius - 1 - i) * (radius - 1 - i))));
        if (inset < 0) {
            inset = 0;
        }
        span = w - (inset * 2);
        if (span > 0) {
            this.rect(x + inset, y + i, span, 1, color);
            this.rect(x + inset, y + h - 1 - i, span, 1, color);
        }
    }
    if (h > radius * 2) {
        this.rect(x, y + radius, w, h - (radius * 2), color);
    }
};

FrameBuilder.prototype.icon = function (name, x, y, px, color) {
    var rows = ICONS[name] || ICONS.play;
    var row;
    var col;
    var line;
    var size = px || 3;
    for (row = 0; row < rows.length; row += 1) {
        line = rows[row];
        for (col = 0; col < line.length; col += 1) {
            if (line.charAt(col) === '1') {
                this.rect(x + col * size, y + row * size, size, size, color);
            }
        }
    }
};

FrameBuilder.prototype.iconSize = function (px) {
    return 16 * (px || 3);
};

FrameBuilder.prototype.bytes = function () {
    return Buffer.concat(this.parts);
};

function pageBox(width, height) {
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
    return { ox: ox, oy: oy, boxW: boxW, boxH: boxH };
}

function menuLayout(items, selected, width, height, detail, heading) {
    var page = pageBox(width, height);
    var count = items.length || 1;
    var gap = count > 4 ? 24 : 32;
    var cardW = count <= 3 ? 260 : (count <= 5 ? 210 : 176);
    var cardH = count <= 3 ? 280 : 248;
    var iconPx = count <= 3 ? 5 : 4;
    var titleScale = 4;
    var bubbles = [];
    var i;
    var before = 0;
    var startX;
    var y;
    var w;
    var h;
    for (i = 0; i < items.length; i += 1) {
        w = i === selected ? cardW + 28 : cardW;
        h = i === selected ? cardH + 20 : cardH;
        bubbles.push({
            w: w,
            h: h,
            scale: titleScale,
            iconPx: i === selected ? iconPx + 1 : iconPx,
            selected: i === selected
        });
        if (i < selected) {
            before += w + gap;
        }
    }
    startX = page.ox + Math.floor(page.boxW / 2) - Math.floor(bubbles[selected].w / 2) - before;
    y = page.oy + Math.floor((page.boxH - cardH) / 2) - 8;
    for (i = 0; i < bubbles.length; i += 1) {
        bubbles[i].x = startX;
        bubbles[i].y = y - (i === selected ? 10 : 0);
        startX += bubbles[i].w + gap;
    }
    return {
        ox: page.ox,
        oy: page.oy,
        boxW: page.boxW,
        boxH: page.boxH,
        gap: gap,
        bubbles: bubbles,
        heading: heading || '',
        detail: detail || '',
        hintY: y + cardH + 44,
        statusY: y + cardH + 88,
        headerH: 56
    };
}

function buildFrame(items, selected, width, height, detail, heading) {
    var draw = new FrameBuilder();
    var lay = menuLayout(items, selected, width, height, detail, heading);
    var i;
    var bubble;
    var title;
    var titleW;
    var ink;
    var hint;
    var iconName;
    var iconPx;
    var iconSide;
    var iconX;
    var iconY;
    var labelY;
    var focus;
    draw.clear(0);
    draw.rect(lay.ox, lay.oy, lay.boxW, lay.boxH, PAGE);
    draw.rect(lay.ox, lay.oy, lay.boxW, lay.headerH, PAGE_TOP);
    draw.rect(lay.ox, lay.oy + lay.headerH - 2, lay.boxW, 2, BAR);
    if (lay.heading) {
        draw.text(lay.heading, lay.ox + 72, lay.oy + 16, 5, INK);
    } else {
        draw.text('G21', lay.ox + 72, lay.oy + 16, 5, ACCENT);
    }
    for (i = 0; i < items.length; i += 1) {
        bubble = lay.bubbles[i];
        title = String(items[i].title || '');
        iconName = items[i].icon || 'play';
        iconPx = bubble.iconPx;
        iconSide = draw.iconSize(iconPx);
        focus = i === selected;
        if (focus) {
            draw.pill(bubble.x - 6, bubble.y - 6, bubble.w + 12, bubble.h + 12, ACCENT_DIM);
        }
        draw.pill(bubble.x, bubble.y, bubble.w, bubble.h, focus ? CARD_HI : CARD);
        if (focus) {
            draw.rect(bubble.x + 24, bubble.y + bubble.h - 14, bubble.w - 48, 4, ACCENT);
        }
        iconX = bubble.x + Math.floor((bubble.w - iconSide) / 2);
        iconY = bubble.y + Math.floor(bubble.h * 0.22) - Math.floor(iconSide / 4);
        draw.pill(
            iconX - 18,
            iconY - 18,
            iconSide + 36,
            iconSide + 36,
            focus ? ACCENT_DIM : BAR
        );
        draw.icon(iconName, iconX, iconY, iconPx, focus ? ICON_ACCENT : ICON_FG);
        titleW = draw.textWidth(title, bubble.scale);
        labelY = bubble.y + bubble.h - 52;
        draw.text(
            title,
            bubble.x + Math.floor((bubble.w - titleW) / 2),
            labelY,
            bubble.scale,
            focus ? INK : HINT
        );
    }
    hint = items[selected] && items[selected].hint ? String(items[selected].hint) : '';
    if (hint) {
        draw.text(hint, lay.ox + 72, lay.hintY, 4, HINT);
    }
    if (detail) {
        draw.text(detail, lay.ox + 72, lay.statusY, 4, INK);
    } else {
        draw.text('pokretlo: wybor   OK: start', lay.ox + 72, lay.statusY, 3, MUTED);
    }
    return {
        frame: message(FRAME, draw.bytes()),
        rects: draw.rects,
        layout: lay
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
    var screenName = 'root';
    var items = (opts.items || SCREENS.root).map(function (item) {
        return { name: item.name, title: item.title, hint: item.hint };
    });
    var heading = '';
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
        if (!ready || !shown) {
            return;
        }
        sendPlace();
        sendShow(true);
        sendGrab(true);
        sendClaim();
        var built = buildFrame(items, selected, screen.w || 1920, screen.h || 720, detail, heading);
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

    function dropSurface(reason) {
        front = false;
        shown = false;
        note('menu-drop ' + (reason || 'leave'));
        if (pulse) {
            clearInterval(pulse);
            pulse = null;
        }
        if (retry) {
            clearTimeout(retry);
            retry = null;
        }
        hideSurface();
        ready = false;
        if (sock) {
            sock.destroy();
            sock = null;
        }
    }

    function showSurface(reason) {
        shown = true;
        front = true;
        note('menu-show ' + (reason || 'open'));
        armPulse();
        if (sock && ready) {
            paint();
            return;
        }
        if (!sock) {
            connect();
        }
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
        var lay = menuLayout(items, selected, screen.w || 1920, screen.h || 720, detail, heading);
        var i;
        var bubble;
        for (i = 0; i < lay.bubbles.length; i += 1) {
            bubble = lay.bubbles[i];
            if (x >= bubble.x && x < bubble.x + bubble.w && y >= bubble.y && y < bubble.y + bubble.h) {
                return i;
            }
        }
        return -1;
    }

    function cloneScreen(name) {
        var source = SCREENS[name] || SCREENS.root;
        return source.map(function (item) {
            return {
                name: item.name,
                title: item.title,
                hint: item.hint,
                icon: item.icon || 'play'
            };
        });
    }

    function setScreen(name) {
        var next = String(name || 'root');
        if (!SCREENS[next]) {
            next = 'root';
        }
        screenName = next;
        items = cloneScreen(next);
        selected = 0;
        if (next === 'airplay') {
            heading = 'AirPlay';
        } else if (next === 'rdp') {
            heading = 'RDP';
        } else if (next === 'vnc') {
            heading = 'VNC';
        } else {
            heading = 'G21';
        }
        detail = '';
        noted = false;
        paint();
        return screenName;
    }

    function setItemHint(name, text) {
        var i;
        for (i = 0; i < items.length; i += 1) {
            if (items[i].name === name) {
                items[i].hint = String(text || '');
                paint();
                return true;
            }
        }
        return false;
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
        var item = items[selected];
        var adjusted = false;
        lastOp = operation;
        if (step && item && typeof opts.adjust === 'function') {
            adjusted = !!opts.adjust(item.name, step > 0 ? 1 : -1);
        }
        if (step && !adjusted) {
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
                if (body.length >= 12) {
                    touchOn = !!(body.readUInt32LE(8) & 1);
                }
                write(message(X_MODE, u32(X_MODE_LAYER)));
            } else if (type === READY) {
                ready = true;
                if (body.length >= 12) {
                    screen = { w: body.readUInt32LE(4), h: body.readUInt32LE(8) };
                }
                if (!native && body.length >= 16) {
                    touchOn = body.readUInt32LE(12) !== 0;
                }
                note('menu-ready ' + screen.w + 'x' + screen.h + (native ? ' native' : ''));
                paint();
            } else if (type === X_STATE && body.length >= 8) {
                // On this unit X_STATE goes false right after READY and killed the
                // first frame. Leave detection stays on changeVisibility.
                front = body.readUInt32LE(4) !== 0;
                note(front ? 'menu-front' : 'menu-away');
            } else if (type === CLOSED) {
                note('menu-closed');
            } else if (type === TOUCH && body.length >= 12 && shown) {
                if (body.readUInt32LE(0) === 1) {
                    var hit = hitRow(body.readFloatLE(4), body.readFloatLE(8));
                    if (hit >= 0) {
                        selected = hit;
                        paint();
                        press();
                    }
                }
            } else if (type === CCU && body.length >= 5 && shown) {
                onControl(body.readUInt16BE(1), body[3]);
            } else if (type === X_CCU && body.length >= 5 && shown) {
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
            write(message(HELLO, Buffer.concat([
                Buffer.from('g21_airplay'),
                Buffer.from([0]),
                Buffer.from('proto=mgu-render/1')
            ])));
        });
        next.on('data', take);
        next.on('error', function (err) {
            note('menu-error ' + (err && err.message));
            which += 1;
        });
        next.on('close', function () {
            ready = false;
            sock = null;
            // Do not reconnect while the app is away. A quiet reconnect kept the
            // last menu over iDrive after the owner left with the back arrow.
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
            if (shown && ready) {
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
            showSurface('open');
        },
        setFront: function (on) {
            if (on) {
                showSurface('front');
            } else {
                dropSurface('leave');
            }
        },
        close: function () {
            dropSurface('close');
        },
        move: move,
        press: press,
        setScreen: setScreen,
        setItemHint: setItemHint,
        screen: function () { return screenName; },
        setStatus: function (text) {
            var next = String(text || '');
            if (next === detail) {
                return;
            }
            detail = next;
            paint();
        },
        selected: function () { return selected; },
        selectedName: function () {
            return items[selected] ? items[selected].name : '';
        }
    };
}

module.exports = {
    ITEMS: ITEMS,
    ROOT_ITEMS: ROOT_ITEMS,
    AIRPLAY_ITEMS: AIRPLAY_ITEMS,
    RDP_ITEMS: RDP_ITEMS,
    VNC_ITEMS: VNC_ITEMS,
    SCREENS: SCREENS,
    ICONS: ICONS,
    message: message,
    buildFrame: buildFrame,
    encoderStep: encoderStep,
    createMenuSurface: createMenuSurface
};
