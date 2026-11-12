'use strict';

/*
 * Draws the AirPlay menu as rectangles on the head unit's GPU renderer.
 * The RHMI list on this unit opens and stays blank. Working screens paint
 * with the renderd command stream: HELLO, PLACE, SHOW, then a FRAME of
 * CLEAR and RECT. This file speaks that stream. It does not use the kit.
 */

var net = require('net');
var fs = require('fs');
var knobKeyboard = require('./knob_keyboard.js');

var HELLO = 1;
var PLACE = 2;
var SHOW = 3;
var FRAME = 7;
var VIDEO = 13;
var DROP_VIDEO = 14;
var MIRROR_FILE = '/dev/shm/mgu-video-g21airplay';
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

var INK = 0xF7F2EAFF;
var HINT = 0xC4B5A4FF;
var MUTED = 0x8C7D6CFF;
var BAR = 0x2A2118FF;
var CARD = 0x16120EFF;
var CARD_HI = 0x2C241CFF;
var PAGE = 0x090807FF;
var PAGE_TOP = 0x120E0BFF;
var PAGE_BAND = 0x1A1410FF;
var ACCENT = 0xE6A15CFF;
var ACCENT_DIM = 0x7A4A22FF;
var ACCENT_GLOW = 0x3A2414FF;
var LINE = 0x3A3026FF;
var CHIP = 0x100D0AFF;
var ICON_FG = 0xE7D7C4FF;
var ICON_ACCENT = 0xF0C48AFF;
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
    ],
    lock: [
        '0000000000000000',
        '0000011111100000',
        '0000110000110000',
        '0000100000010000',
        '0000100000010000',
        '0011111111111100',
        '0011111111111100',
        '0011110011111100',
        '0011110011111100',
        '0011110011111100',
        '0011111111111100',
        '0011111111111100',
        '0000000000000000',
        '0000000000000000',
        '0000000000000000',
        '0000000000000000'
    ],
    unlock: [
        '0000000000000000',
        '0000011111100000',
        '0000110000110000',
        '0000000000010000',
        '0000000000010000',
        '0011111111111100',
        '0011111111111100',
        '0011110011111100',
        '0011110011111100',
        '0011110011111100',
        '0011111111111100',
        '0011111111111100',
        '0000000000000000',
        '0000000000000000',
        '0000000000000000',
        '0000000000000000'
    ]
};

var FONT = {
    ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
    '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
    '>': ['00001', '00010', '00100', '01000', '00100', '00010', '00001'],
    '<': ['10000', '01000', '00100', '00010', '00100', '01000', '10000'],
    '_': ['00000', '00000', '00000', '00000', '00000', '00000', '11111'],
    '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
    '*': ['00000', '10101', '01110', '00100', '01110', '10101', '00000'],
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
    'F': ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
    'G': ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
    'H': ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
    'I': ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
    'J': ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
    'K': ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
    'L': ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
    'M': ['10001', '11011', '10101', '10001', '10001', '10001', '10001'],
    'N': ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
    'O': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
    'P': ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
    'Q': ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
    'R': ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
    'S': ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
    'T': ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
    'U': ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
    'V': ['10001', '10001', '10001', '10001', '01010', '01010', '00100'],
    'W': ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
    'X': ['10001', '01010', '00100', '00100', '00100', '01010', '10001'],
    'Y': ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
    'Z': ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
    'a': ['00000', '00000', '01110', '00001', '01111', '10001', '01111'],
    'b': ['10000', '10000', '11110', '10001', '10001', '10001', '11110'],
    'c': ['00000', '00000', '01110', '10000', '10000', '10000', '01110'],
    'd': ['00001', '00001', '01111', '10001', '10001', '10001', '01111'],
    'e': ['00000', '00000', '01110', '10001', '11111', '10000', '01110'],
    'f': ['00111', '00100', '01110', '00100', '00100', '00100', '00100'],
    'g': ['00000', '00000', '01111', '10001', '01111', '00001', '01110'],
    'h': ['10000', '10000', '11110', '10001', '10001', '10001', '10001'],
    'i': ['00100', '00000', '01100', '00100', '00100', '00100', '01110'],
    'j': ['00010', '00000', '00110', '00010', '00010', '10010', '01100'],
    'k': ['10000', '10010', '10100', '11000', '10100', '10010', '10001'],
    'l': ['01100', '00100', '00100', '00100', '00100', '00100', '01110'],
    'm': ['00000', '00000', '11010', '10101', '10101', '10001', '10001'],
    'n': ['00000', '00000', '11001', '10101', '10011', '10001', '10001'],
    'o': ['00000', '00000', '01110', '10001', '10001', '10001', '01110'],
    'p': ['00000', '00000', '11110', '10001', '11110', '10000', '10000'],
    'q': ['00000', '00000', '01111', '10001', '01111', '00001', '00001'],
    'r': ['00000', '00000', '10110', '11000', '10000', '10000', '10000'],
    's': ['00000', '00000', '01111', '10000', '01110', '00001', '11110'],
    't': ['00100', '00100', '11111', '00100', '00100', '00100', '00011'],
    'u': ['00000', '00000', '10001', '10001', '10001', '10011', '01101'],
    'v': ['00000', '00000', '10001', '10001', '10001', '01010', '00100'],
    'w': ['00000', '00000', '10001', '10001', '10101', '10101', '01010'],
    'x': ['00000', '00000', '10001', '01010', '00100', '01010', '10001'],
    'y': ['00000', '00000', '10001', '10001', '01111', '00001', '01110'],
    'z': ['00000', '00000', '11111', '00010', '00100', '01000', '11111'],
    'ą': ['00000', '01110', '00001', '01111', '10001', '01110', '00110'],
    'ć': ['00010', '00100', '01110', '10000', '10000', '10000', '01110'],
    'ę': ['00000', '01110', '10001', '11111', '10000', '01110', '00110'],
    'ł': ['00100', '00100', '11111', '00100', '00100', '00100', '01110'],
    'ń': ['00010', '00100', '11001', '10101', '10011', '10001', '10001'],
    'ó': ['00010', '00100', '01110', '10001', '10001', '10001', '01110'],
    'ś': ['00010', '00100', '01111', '10000', '01110', '00001', '11110'],
    'ź': ['00010', '00100', '11111', '00010', '00100', '01000', '11111'],
    'ż': ['00100', '00000', '11111', '00010', '00100', '01000', '11111'],
    'Ą': ['01110', '10001', '11111', '10001', '10001', '10001', '00110'],
    'Ć': ['00010', '00100', '01111', '10000', '10000', '10000', '01111'],
    'Ę': ['11111', '10000', '11110', '10000', '10000', '11111', '00110'],
    'Ł': ['10000', '10000', '11111', '10000', '10000', '10000', '11111'],
    'Ń': ['00010', '00100', '11001', '10101', '10011', '10001', '10001'],
    'Ó': ['00010', '00100', '01110', '10001', '10001', '10001', '01110'],
    'Ś': ['00010', '00100', '01111', '10000', '01110', '00001', '11110'],
    'Ź': ['00010', '00100', '11111', '00010', '00100', '01000', '11111'],
    'Ż': ['00100', '00000', '11111', '00010', '00100', '01000', '11111']
};

var ROOT_ITEMS = [
    { name: 'airplay', title: 'AirPlay', hint: 'lustro iPhone', icon: 'airplay' },
    { name: 'label-toggle', title: 'Napis', hint: 'tekst na ekranach', icon: 'tag' }
];

var AIRPLAY_ITEMS = [
    { name: 'air-toggle', title: 'Start', hint: 'włącz lustro', icon: 'play' },
    { name: 'air-screen', title: 'Ekrany', hint: 'środek', icon: 'desktop' },
    { name: 'air-quality', title: '720p', hint: '4 Mb/s', icon: 'desktop' },
    { name: 'air-name', title: 'Nazwa', hint: 'THEiPlay', icon: 'tag' },
    { name: 'air-pin', title: 'Kod', hint: 'bez kodu', icon: 'unlock' },
    { name: 'air-back', title: 'Wstecz', hint: 'strona główna', icon: 'back' }
];

var AIR_OUT_ITEMS = [
    { name: 'air-out-central', title: 'Środek', hint: 'wyłączony', icon: 'desktop' },
    { name: 'air-out-hud', title: 'HUD', hint: 'wyłączony', icon: 'tag' },
    { name: 'air-out-cluster', title: 'Zegary', hint: 'wyłączony', icon: 'grid' },
    { name: 'air-area', title: 'Mapa', hint: 'miejsce na zegarach', icon: 'grid' },
    { name: 'air-out-box', title: 'Pozycja', hint: 'srodek ekranu', icon: 'desktop' },
    { name: 'air-out-back', title: 'Wstecz', hint: 'AirPlay', icon: 'back' }
];

var AIR_BOX_ITEMS = [
    { name: 'air-box-target', title: 'Ekran', hint: 'klik: nastepny', icon: 'desktop' },
    { name: 'air-box-center', title: 'Srodek', hint: 'klik: wyrodkuj', icon: 'grid' },
    { name: 'air-box-bigger', title: 'Wiekszy', hint: 'klik', icon: 'desktop' },
    { name: 'air-box-smaller', title: 'Mniejszy', hint: 'klik', icon: 'desktop' },
    { name: 'air-box-up', title: 'Gora', hint: 'klik', icon: 'grid' },
    { name: 'air-box-down', title: 'Dol', hint: 'klik', icon: 'grid' },
    { name: 'air-box-left', title: 'Lewo', hint: 'klik', icon: 'grid' },
    { name: 'air-box-right', title: 'Prawo', hint: 'klik', icon: 'grid' },
    { name: 'air-box-rot', title: 'Obrot 0', hint: 'klik: +90', icon: 'play' },
    { name: 'air-box-back', title: 'Wstecz', hint: 'ekrany', icon: 'back' }
];

var LABEL_ITEMS = [
    { name: 'label-on', title: 'Napis', hint: 'ukryty', icon: 'tag' },
    { name: 'label-text', title: 'Tekst', hint: 'własny napis', icon: 'tag' },
    { name: 'label-where', title: 'Środek', hint: 'OK: następny ekran', icon: 'desktop' },
    { name: 'label-pos', title: 'Pozycja', hint: 'OK: przesuwaj', icon: 'grid' },
    { name: 'label-back', title: 'Wstecz', hint: 'THEiPlay', icon: 'back' }
];

var STREAM_ITEMS = [
    { name: 'stream-end', title: 'Zakończ', hint: 'Koniec streamu', icon: 'stop' }
];

var ITEMS = ROOT_ITEMS;
var SCREENS = {
    root: ROOT_ITEMS,
    airplay: AIRPLAY_ITEMS,
    'air-out': AIR_OUT_ITEMS,
    'air-box': AIR_BOX_ITEMS,
    label: LABEL_ITEMS,
    stream: STREAM_ITEMS
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

FrameBuilder.prototype.video = function (x, y, w, h, id) {
    if (!(w > 0) || !(h > 0)) {
        return;
    }
    this.op(19);
    this.f32(x);
    this.f32(y);
    this.f32(w);
    this.f32(h);
    this.f32(0);
    this.op(id || 1);
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
    var headerH = 68;
    var footerH = 96;
    var home = count <= 2 && page.boxW > 900;
    var gap = home ? 28 : 12;
    var bubbles = [];
    var i;
    var x;
    var y;
    var rowW;
    var rowH;
    var first = 0;
    if (home) {
        rowW = Math.min(560, Math.floor((page.boxW - 180 - gap) / count));
        rowH = 300;
        x = page.ox + Math.floor((page.boxW - (count * rowW + (count - 1) * gap)) / 2);
        y = page.oy + Math.floor((page.boxH - rowH) / 2) + 10;
        for (i = 0; i < items.length; i += 1) {
            bubbles.push({
                x: x,
                y: y,
                w: rowW,
                h: rowH,
                hitX: x,
                hitY: y,
                hitW: rowW,
                hitH: rowH,
                scale: 5,
                iconPx: 4,
                home: true,
                index: i,
                selected: i === selected
            });
            x += rowW + gap;
        }
    } else {
        rowH = 84;
        rowW = Math.min(920, page.boxW - 180);
        if (heading === 'Okno') {
            rowW = Math.min(rowW, page.boxW - 680);
            if (rowW < 560) {
                rowW = 560;
            }
        }
        x = page.ox + 48;
        y = page.oy + headerH + 12;
        var listTop = y;
        var listBottom = page.oy + page.boxH - footerH - 12;
        var pitch = rowH + gap;
        var visible = Math.floor((listBottom - listTop) / pitch);
        var first = 0;
        var shown;
        if (visible < 1) {
            visible = 1;
        }
        if (items.length > visible) {
            first = selected - Math.floor((visible - 1) / 2);
            if (first < 0) {
                first = 0;
            }
            if (first > items.length - visible) {
                first = items.length - visible;
            }
        } else {
            visible = items.length;
        }
        shown = 0;
        for (i = first; i < items.length && shown < visible; i += 1) {
            bubbles.push({
                x: x,
                y: y,
                w: rowW,
                h: rowH,
                hitX: x,
                hitY: y,
                hitW: rowW,
                hitH: rowH,
                scale: 4,
                iconPx: 3,
                home: false,
                index: i,
                selected: i === selected
            });
            y += pitch;
            shown += 1;
        }
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
        hintY: page.oy + page.boxH - 46,
        statusY: page.oy + page.boxH - 22,
        headerH: headerH,
        first: first,
        count: items.length
    };
}

function findBack(list) {
    var i;
    var name;
    var end = '';
    for (i = 0; i < list.length; i += 1) {
        name = list[i] && list[i].name ? list[i].name : '';
        if (/back$/.test(name)) {
            return name;
        }
        if (name === 'stream-end') {
            end = name;
        }
    }
    return end;
}

function crumbFor(name, head, where) {
    var base;
    if (name === 'airplay') {
        base = 'AirPlay';
    } else if (name === 'air-out') {
        base = 'AirPlay > Ekrany';
    } else if (name === 'air-box') {
        base = 'AirPlay > Ekrany > Okno';
    } else if (name === 'label') {
        base = 'Napis';
    } else if (name === 'stream') {
        base = 'AirPlay > Lustro';
    } else if (head && head !== 'THEiPlay' && head !== 'Stream') {
        base = 'THEiPlay > ' + head;
    } else {
        base = 'THEiPlay';
    }
    if (where) {
        return base + ' > ' + where;
    }
    return base;
}

function placeName(field, title) {
    if (field === 'air-name') {
        return 'Nazwa';
    }
    if (field === 'label-text') {
        return 'Tekst';
    }
    if (field === 'rdp-label' || field === 'vnc-label') {
        return 'Nazwa';
    }
    if (field === 'rdp-ip' || field === 'vnc-ip') {
        return 'IP';
    }
    if (field === 'rdp-port' || field === 'vnc-port') {
        return 'Port';
    }
    if (field === 'rdp-user') {
        return 'Konto';
    }
    if (field === 'rdp-pass') {
        return 'Haslo';
    }
    return title ? String(title) : 'Wpisz';
}

function fitCrumb(draw, text, scale, maxW) {
    var s = String(text || '');
    while (s.length > 4 && draw.textWidth(s, scale) > maxW) {
        s = s.slice(0, -2);
    }
    return s;
}

function drawMenuHeader(draw, lay, crumb, showBack) {
    var textX = lay.ox + 36;
    var scale = 4;
    var label;
    lay.crumb = crumb || 'THEiPlay';
    lay.backHit = null;
    if (showBack) {
        draw.pill(lay.ox + 20, lay.oy + 14, 150, 40, CARD);
        draw.text('wstecz', lay.ox + 40, lay.oy + 24, 3, ACCENT);
        lay.backHit = { x: lay.ox + 20, y: lay.oy + 14, w: 150, h: 40 };
        textX = lay.ox + 188;
        scale = 4;
    }
    label = fitCrumb(draw, lay.crumb, scale, lay.ox + lay.boxW - textX - 200);
    draw.text(label, textX, lay.oy + 22, scale, showBack ? INK : ACCENT);
}

function drawSpinner(draw, cx, cy) {
    var phase = Math.floor(Date.now() / 140) % 8;
    var i;
    var ang;
    var x;
    var y;
    var on;
    for (i = 0; i < 8; i += 1) {
        ang = i * Math.PI / 4 - Math.PI / 2;
        x = cx + Math.round(Math.cos(ang) * 42) - 7;
        y = cy + Math.round(Math.sin(ang) * 42) - 7;
        on = i === phase;
        draw.rect(x, y, on ? 18 : 10, on ? 18 : 10, on ? ACCENT : MUTED);
    }
}

function drawNav(draw, lay) {
    var y = lay.oy + lay.boxH - 78;
    var h = 56;
    var arrow = 76;
    var okW = 230;
    var gap = 14;
    var okX = lay.ox + lay.boxW - okW - 24;
    var rightX = okX - gap - arrow;
    var leftX = rightX - gap - arrow;
    var label = 'wybierz';
    var tw;
    draw.pill(leftX, y, arrow, h, CARD_HI);
    draw.text('<', leftX + 28, y + 16, 4, INK);
    draw.pill(rightX, y, arrow, h, CARD_HI);
    draw.text('>', rightX + 28, y + 16, 4, INK);
    draw.pill(okX, y, okW, h, ACCENT);
    tw = draw.textWidth(label, 4);
    draw.text(label, okX + Math.floor((okW - tw) / 2), y + 16, 4, PAGE);
    lay.nav = {
        left: { x: leftX, y: y, w: arrow, h: h },
        right: { x: rightX, y: y, w: arrow, h: h },
        ok: { x: okX, y: y, w: okW, h: h }
    };
}

function keyLabel(key) {
    if (key === 'SPC') {
        return 'spacja';
    }
    if (key === 'ANU') {
        return 'anuluj';
    }
    if (key === 'DEL') {
        return 'usun';
    }
    if (key === 'SH') {
        return 'Aa';
    }
    return key;
}

function buildKeyboardFrame(edit, width, height, crumb) {
    var draw = new FrameBuilder();
    var page = pageBox(width, height);
    var rows = edit.rows || [];
    var gap = 10;
    var keyH = 52;
    var maxCols = 10;
    var unit = Math.floor((page.boxW - 80 - (maxCols - 1) * gap) / maxCols);
    var startY = page.oy + 156;
    var hits = [];
    var popupHits = [];
    var index = 0;
    var r;
    var c;
    var row;
    var rowW;
    var keyW;
    var x;
    var y;
    var label;
    var labelW;
    var focus;
    var held;
    var alts;
    var altW;
    var altX;
    var altY;
    var shown = knobKeyboard.displayValue(edit) + '_';
    var head = {
        ox: page.ox,
        oy: page.oy,
        boxW: page.boxW,
        boxH: page.boxH
    };
    draw.clear(0);
    draw.rect(page.ox, page.oy, page.boxW, page.boxH, PAGE);
    draw.rect(page.ox, page.oy, page.boxW, 56, PAGE_TOP);
    drawMenuHeader(draw, head, crumb || edit.title || 'Wpisz', true);
    draw.text('tap: litera   przytrzymaj: polskie', page.ox + 72, page.oy + 72, 3, MUTED);
    draw.pill(page.ox + 48, page.oy + 100, page.boxW - 96, 44, CARD_HI);
    draw.text(shown.slice(0, 40), page.ox + 68, page.oy + 112, 4, INK);
    for (r = 0; r < rows.length; r += 1) {
        row = rows[r];
        keyW = unit;
        if (row.length <= 5) {
            keyW = Math.floor(unit * 1.7);
        }
        rowW = row.length * keyW + (row.length - 1) * gap;
        x = page.ox + Math.floor((page.boxW - rowW) / 2);
        y = startY + r * (keyH + gap);
        for (c = 0; c < row.length; c += 1) {
            focus = index === edit.keyIndex;
            held = edit.popup && edit.popup.keyIndex === index;
            label = keyLabel(row[c]);
            draw.pill(x, y, keyW, keyH, (focus || held) ? ACCENT : CARD);
            labelW = draw.textWidth(label, 3);
            draw.text(
                label,
                x + Math.floor((keyW - labelW) / 2),
                y + Math.floor((keyH - 21) / 2),
                3,
                (focus || held) ? INK : HINT
            );
            hits.push({ x: x, y: y, w: keyW, h: keyH, index: index });
            index += 1;
            x += keyW + gap;
        }
    }
    if (edit.popup && edit.popup.alts && edit.popup.alts.length) {
        held = hits[edit.popup.keyIndex];
        alts = edit.popup.alts;
        altW = 72;
        altY = held ? Math.max(page.oy + 8, held.y - keyH - 16) : page.oy + 8;
        altX = held
            ? held.x + Math.floor(held.w / 2) - Math.floor((alts.length * altW + (alts.length - 1) * 8) / 2)
            : page.ox + 80;
        for (c = 0; c < alts.length; c += 1) {
            focus = c === edit.popup.pick;
            draw.pill(altX - 4, altY - 4, altW + 8, keyH + 8, ACCENT_GLOW);
            draw.pill(altX, altY, altW, keyH, focus ? ACCENT : CARD_HI);
            labelW = draw.textWidth(alts[c], 4);
            draw.text(
                alts[c],
                altX + Math.floor((altW - labelW) / 2),
                altY + 12,
                4,
                INK
            );
            popupHits.push({ x: altX - 8, y: altY - 8, w: altW + 16, h: keyH + 16, pick: c });
            altX += altW + 8;
        }
    }
    var board = { ox: page.ox, oy: page.oy, boxW: page.boxW, boxH: page.boxH };
    drawNav(draw, board);
    return {
        frame: message(FRAME, draw.bytes()),
        rects: draw.rects,
        layout: {
            ox: page.ox,
            oy: page.oy,
            boxW: page.boxW,
            boxH: page.boxH,
            bubbles: [],
            keys: hits,
            popup: popupHits,
            crumb: head.crumb,
            backHit: head.backHit,
            nav: board.nav
        }
    };
}

function isStreamItems(items) {
    return !!(items && items.length === 1 && items[0] && items[0].name === 'stream-end');
}

function streamLayout(items, selected, width, height, detail, heading) {
    var page = pageBox(width, height);
    var btnW = 280;
    var btnH = 88;
    var x = page.ox + Math.floor((page.boxW - btnW) / 2);
    var y = page.oy + page.boxH - btnH - 36;
    return {
        ox: page.ox,
        oy: page.oy,
        boxW: page.boxW,
        boxH: page.boxH,
        gap: 0,
        bubbles: [{
            x: x,
            y: y,
            w: btnW,
            h: btnH,
            hitX: x - 40,
            hitY: y - 40,
            hitW: btnW + 80,
            hitH: btnH + 80,
            scale: 4,
            iconPx: 3,
            selected: true
        }],
        heading: heading || 'Stream',
        detail: detail || '',
        hintY: y - 36,
        statusY: y - 8,
        headerH: 0,
        stream: true
    };
}

function drawVersionMark(draw, box, version) {
    var label;
    var scale;
    var tw;
    var text = String(version || '').replace(/^v/i, '');
    if (!text || !box) {
        return;
    }
    label = 'v' + text;
    scale = 3;
    tw = draw.textWidth(label, scale);
    draw.text(
        label,
        box.ox + box.boxW - tw - 40,
        box.oy + 26,
        scale,
        MUTED
    );
}

function parsePinDetail(detail) {
    var match = String(detail || '').match(/\bPIN\s+(\d{4,6})\b/i);
    return match ? match[1] : '';
}

function streamWindow(win, page) {
    var x = win.x | 0;
    var y = win.y | 0;
    var w = win.w | 0;
    var h = win.h | 0;
    var bottom = page.oy + page.boxH - 160;
    if (y < page.oy) {
        y = page.oy;
    }
    if (x < 0) {
        x = 0;
    }
    if (y >= bottom - 80) {
        y = bottom - 80;
    }
    if (y + h > bottom) {
        h = bottom - y;
    }
    if (h < 80) {
        h = 80;
    }
    if (w < 80) {
        w = 80;
    }
    return { x: x, y: y, w: w, h: h };
}

function buildStreamFrame(items, selected, width, height, detail, heading, version, streamInfo, caption, crumb) {
    var draw = new FrameBuilder();
    var lay = streamLayout(items, selected, width, height, detail, heading);
    var bubble = lay.bubbles[0];
    var title = String((items[0] && items[0].title) || 'Zakończ');
    var titleW;
    var hint;
    var page = pageBox(width, height);
    var info = streamInfo || null;
    var pin = (info && info.pin) || parsePinDetail(detail);
    var mirrored = !!(info && info.mirrored);
    var pinScale;
    var pinW;
    var pinX;
    var pinY;
    var label;
    var labelW;
    var lines;
    var i;
    var lineY;
    var panelX;
    var panelY;
    var panelW;
    var panelH;
    // The window is drawn here. waylandsink under the HMI stays blank on this unit.
    draw.clear(0);
    var head = { ox: page.ox, oy: page.oy, boxW: page.boxW, boxH: page.boxH };
    if (crumb) {
        draw.rect(page.ox, page.oy, page.boxW, 64, PAGE_TOP);
        drawMenuHeader(draw, head, crumb, true);
        lay.crumb = head.crumb;
        lay.backHit = head.backHit;
    }
    drawVersionMark(draw, { ox: page.ox, oy: page.oy, boxW: page.boxW }, version);

    panelX = page.ox + 80;
    panelW = page.boxW - 160;
        if (info && info.window && info.window.w > 80 && info.window.h > 80) {
            var win = {
                x: info.window.x | 0,
                y: info.window.y | 0,
                w: info.window.w | 0,
                h: info.window.h | 0
            };
            draw.rect(win.x, win.y, win.w, win.h, PAGE);
        if (info.video) {
            draw.video(win.x, win.y, win.w, win.h, 1);
        }
        draw.rect(win.x, win.y, win.w, 44, ACCENT);
        draw.rect(win.x, win.y + 44, win.w, 3, ACCENT_DIM);
        draw.rect(win.x, win.y, 3, win.h, ACCENT);
        draw.rect(win.x + win.w - 3, win.y, 3, win.h, ACCENT);
        draw.rect(win.x, win.y + win.h - 3, win.w, 3, ACCENT);
        draw.text('THEiPlay', win.x + 16, win.y + 12, 3, PAGE);
        label = 'przesun';
        labelW = draw.textWidth(label, 3);
        draw.text(label, win.x + win.w - labelW - 16, win.y + 12, 3, PAGE);
        if (!mirrored && pin) {
            pinScale = 8;
            pinW = draw.textWidth(pin, pinScale);
            draw.text(pin, win.x + Math.floor((win.w - pinW) / 2), win.y + 80, pinScale, INK);
        } else if (!mirrored) {
            if (info && info.spin) {
                drawSpinner(draw, win.x + Math.floor(win.w / 2), win.y + Math.floor(win.h / 2));
            }
            label = String((info && info.hint) || detail || 'czekam na klatke');
            labelW = draw.textWidth(label, 4);
            draw.text(label, win.x + Math.floor((win.w - labelW) / 2), win.y + 90, 4, INK);
            lines = (info && info.lines) || [];
            lineY = win.y + 150;
            for (i = 0; i < lines.length && i < 4; i += 1) {
                draw.text(String(lines[i]).slice(0, 36), win.x + 24, lineY, 3, HINT);
                lineY += 32;
            }
        }
        if (mirrored) {
            label = String((info && (info.hint || info.headline)) || detail || 'lustro');
            draw.text(String(label).slice(0, 42), win.x, win.y + win.h + 10, 3, HINT);
        }
    } else if (!mirrored) {
        panelY = page.oy + 48;
        panelH = page.boxH - 200;
        draw.pill(panelX - 8, panelY - 8, panelW + 16, panelH + 16, ACCENT_DIM);
        draw.pill(panelX, panelY, panelW, panelH, CARD);
        label = String((info && info.headline) || heading || 'THEiPlay');
        labelW = draw.textWidth(label, 4);
        draw.text(label, panelX + Math.floor((panelW - labelW) / 2), panelY + 36, 4, INK);
        if (pin) {
            pinScale = 12;
            pinW = draw.textWidth(pin, pinScale);
            pinX = panelX + Math.floor((panelW - pinW) / 2);
            pinY = panelY + 110;
            label = 'kod — wpisz na iPhonie';
            labelW = draw.textWidth(label, 3);
            draw.text(label, panelX + Math.floor((panelW - labelW) / 2), pinY - 40, 3, MUTED);
            draw.text(pin, pinX, pinY, pinScale, INK);
            lineY = pinY + pinScale * 8 + 36;
        } else {
            lineY = panelY + 120;
            label = String((info && info.hint) || detail || 'czekam na iPhone');
            labelW = draw.textWidth(label, 3);
            draw.text(label, panelX + Math.floor((panelW - labelW) / 2), lineY, 3, HINT);
            lineY += 48;
        }
        lines = (info && info.lines) || [];
        for (i = 0; i < lines.length; i += 1) {
            draw.text(String(lines[i]).slice(0, 42), panelX + 48, lineY, 3, MUTED);
            lineY += 36;
            if (lineY > panelY + panelH - 40) {
                break;
            }
        }
    } else {
        if (detail) {
            draw.text(String(detail).slice(0, 48), lay.ox + 72, page.oy + 28, 3, MUTED);
        }
        lines = (info && info.lines) || [];
        lineY = page.oy + 64;
        for (i = 0; i < lines.length && i < 3; i += 1) {
            draw.text(String(lines[i]).slice(0, 48), lay.ox + 72, lineY, 3, HINT);
            lineY += 32;
        }
    }

    draw.pill(bubble.x - 4, bubble.y - 4, bubble.w + 8, bubble.h + 8, ACCENT_DIM);
    draw.pill(bubble.x, bubble.y, bubble.w, bubble.h, CARD_HI);
    draw.rect(bubble.x + 24, bubble.y + bubble.h - 12, bubble.w - 48, 4, ACCENT);
    draw.icon('stop', bubble.x + 28, bubble.y + 22, 3, ICON_ACCENT);
    titleW = draw.textWidth(title, 4);
    draw.text(title, bubble.x + Math.floor((bubble.w - titleW) / 2) + 20, bubble.y + 30, 4, INK);
    hint = items[0] && items[0].hint ? String(items[0].hint) : '';
    if (hint) {
        draw.text(hint, lay.ox + 36, lay.oy + lay.boxH - 58, 3, HINT);
    }
    drawNav(draw, lay);
    if (caption && caption.on && caption.text) {
        draw.text(String(caption.text).slice(0, 24), caption.x | 0, caption.y | 0, 4, ACCENT);
    }
    return {
        frame: message(FRAME, draw.bytes()),
        rects: draw.rects,
        layout: lay
    };
}

function buildFrame(items, selected, width, height, detail, heading, version, streamInfo, boxPreview, caption, crumb) {
    var draw = new FrameBuilder();
    var lay;
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
    if (isStreamItems(items) || heading === 'Stream') {
        return buildStreamFrame(items, selected, width, height, detail, heading, version, streamInfo, caption, crumb);
    }
    lay = menuLayout(items, selected, width, height, detail, heading);
    draw.clear(0);
    draw.rect(lay.ox, lay.oy, lay.boxW, lay.boxH, PAGE);
    draw.rect(lay.ox, lay.oy, 8, lay.boxH, ACCENT);
    draw.rect(lay.ox, lay.oy, lay.boxW, lay.headerH, PAGE_TOP);
    draw.rect(lay.ox + 28, lay.oy + lay.headerH - 3, 96, 3, ACCENT);
    if (crumb) {
        drawMenuHeader(draw, lay, crumb, crumb !== 'THEiPlay');
    } else if (lay.heading) {
        draw.text(lay.heading, lay.ox + 36, lay.oy + 22, 5, INK);
    } else {
        draw.text('THEiPlay', lay.ox + 36, lay.oy + 22, 5, ACCENT);
    }
    drawVersionMark(draw, lay, version);
    for (i = 0; i < lay.bubbles.length; i += 1) {
        bubble = lay.bubbles[i];
        var itemIndex = bubble.index != null ? bubble.index : i;
        var item = items[itemIndex];
        title = String(item.title || '');
        hint = item.hint ? String(item.hint) : '';
        iconName = item.icon || 'play';
        iconPx = bubble.iconPx;
        iconSide = draw.iconSize(iconPx);
        focus = itemIndex === selected;
        draw.rect(bubble.x, bubble.y, bubble.w, bubble.h, focus ? CARD_HI : CARD);
        if (focus) {
            draw.rect(bubble.x, bubble.y, bubble.w, 4, ACCENT);
            draw.rect(bubble.x, bubble.y + bubble.h - 4, bubble.w, 4, ACCENT);
            draw.rect(bubble.x, bubble.y, 4, bubble.h, ACCENT);
            draw.rect(bubble.x + bubble.w - 4, bubble.y, 4, bubble.h, ACCENT);
        }
        if (bubble.home) {
            iconX = bubble.x + Math.floor((bubble.w - iconSide) / 2);
            iconY = bubble.y + 64;
            draw.icon(iconName, iconX, iconY, iconPx, focus ? ICON_ACCENT : ICON_FG);
            titleW = draw.textWidth(title, bubble.scale);
            draw.text(
                title,
                bubble.x + Math.floor((bubble.w - titleW) / 2),
                bubble.y + 160,
                bubble.scale,
                focus ? INK : HINT
            );
            if (hint) {
                titleW = draw.textWidth(hint.slice(0, 22), 3);
                draw.text(
                    hint.slice(0, 22),
                    bubble.x + Math.floor((bubble.w - titleW) / 2),
                    bubble.y + 210,
                    3,
                    focus ? ACCENT : MUTED
                );
            }
        } else {
            iconX = bubble.x + 28;
            iconY = bubble.y + Math.floor((bubble.h - iconSide) / 2);
            draw.icon(iconName, iconX, iconY, iconPx, focus ? ICON_ACCENT : ICON_FG);
            labelY = hint ? bubble.y + 22 : bubble.y + Math.floor((bubble.h - 28) / 2);
            draw.text(title, bubble.x + 28 + iconSide + 22, labelY, bubble.scale, focus ? INK : HINT);
            if (hint) {
                draw.text(hint.slice(0, 36), bubble.x + 28 + iconSide + 22, labelY + 34, 3, focus ? ACCENT : MUTED);
            }
        }
    }
    if (lay.bubbles.length && !lay.bubbles[0].home) {
        if (lay.first > 0) {
            draw.text('w gore', lay.ox + lay.boxW - 280, lay.oy + 28, 3, MUTED);
        }
        if (lay.first + lay.bubbles.length < lay.count) {
            draw.text('dalej', lay.ox + lay.boxW - 160, lay.hintY, 3, MUTED);
        }
    }
    if (detail) {
        draw.text(detail.slice(0, 28), lay.ox + 36, lay.oy + lay.boxH - 58, 3, INK);
    } else {
        draw.text('strzalki, potem wybierz', lay.ox + 36, lay.oy + lay.boxH - 58, 3, MUTED);
    }
    drawNav(draw, lay);
    if (boxPreview && heading === 'Okno') {
        drawBoxPreview(draw, lay, boxPreview, items[selected]);
    }
    if (caption && caption.on && caption.text) {
        draw.text(String(caption.text).slice(0, 24), caption.x | 0, caption.y | 0, 4, ACCENT);
    }
    return {
        frame: message(FRAME, draw.bytes()),
        rects: draw.rects,
        layout: lay
    };
}

function drawBoxPreview(draw, lay, preview, selectedItem) {
    var limitW = preview.limitW || 1920;
    var limitH = preview.limitH || 720;
    var maxW = 600;
    var maxH = 420;
    var scale = Math.min(maxW / limitW, maxH / limitH);
    var stageW = Math.max(80, Math.round(limitW * scale));
    var stageH = Math.max(48, Math.round(limitH * scale));
    var x = lay.ox + lay.boxW - stageW - 36;
    var y = lay.oy + lay.headerH + 24;
    var wx = x + Math.round((preview.x || 0) * scale);
    var wy = y + Math.round((preview.y || 0) * scale);
    var ww = Math.max(12, Math.round((preview.w || limitW) * scale));
    var wh = Math.max(12, Math.round((preview.h || limitH) * scale));
    var mode = preview.mode || '';
    var caption;
    if (mode !== 'move' && selectedItem && (selectedItem.name === 'air-box-bigger' || selectedItem.name === 'air-box-smaller')) {
        mode = 'size';
    }
    if (selectedItem && (selectedItem.name === 'air-box-up' || selectedItem.name === 'air-box-down' || selectedItem.name === 'air-box-left' || selectedItem.name === 'air-box-right')) {
        mode = 'move';
    }
    if (ww > stageW) {
        ww = stageW;
    }
    if (wh > stageH) {
        wh = stageH;
    }
    if (wx + ww > x + stageW) {
        wx = x + stageW - ww;
    }
    if (wy + wh > y + stageH) {
        wy = y + stageH - wh;
    }
    draw.rect(x - 4, y - 4, stageW + 8, stageH + 8, LINE);
    draw.rect(x, y, stageW, stageH, PAGE_TOP);
    draw.rect(wx, wy, ww, wh, ACCENT_DIM);
    draw.rect(wx, wy, ww, Math.min(14, wh), ACCENT);
    caption = mode === 'move' ? 'pozycja' : (mode === 'size' ? 'wielkosc' : 'podglad');
    if (preview.label) {
        caption = String(preview.label) + '  ' + caption;
    }
    draw.text(caption, x, y + stageH + 18, 3, HINT);
    draw.text(String(preview.w || 0) + 'x' + String(preview.h || 0) + '  obrot ' + String(preview.rotate || 0), x, y + stageH + 48, 3, MUTED);
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
        return {
            name: item.name,
            title: item.title,
            hint: item.hint,
            icon: item.icon || 'play'
        };
    });
    var heading = '';
    var version = String((opts && opts.version) || '');
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
    var lastTilt = '';
    var boxPreview = null;
    var caption = null;
    var lastFrame = null;
    var noted = false;
    var surfaced = false;
    var claimNoted = false;
    var detail = '';
    var streamInfo = null;
    var edit = null;
    var touchDown = null;
    var keyHits = [];
    var popupHits = [];
    var holdTimer = null;
    var dragWin = null;
    var mirrorSent = false;
    var pulseBeat = 0;
    var backBox = null;
    var backAction = '';
    var navBoxes = null;

    function isSocket(file) {
        // Windows named pipes (emu.js) are not fs sockets; still connectable via net.
        if (typeof file === 'string' && file.indexOf('\\\\.\\pipe\\') === 0) {
            return true;
        }
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

    function sendMirror(on) {
        var body;
        if (!native) {
            return;
        }
        if (on) {
            if (mirrorSent) {
                return;
            }
            body = Buffer.alloc(4 + MIRROR_FILE.length + 1);
            body.writeUInt32LE(1, 0);
            body.write(MIRROR_FILE, 4);
            write(message(VIDEO, body));
            mirrorSent = true;
            return;
        }
        if (mirrorSent) {
            write(message(DROP_VIDEO, u32(1)));
            mirrorSent = false;
        }
    }

    function rebindVideo() {
        if (mirrorSent) {
            write(message(DROP_VIDEO, u32(1)));
            mirrorSent = false;
        }
        sendMirror(!!(streamInfo && streamInfo.video));
    }

    function paint() {
        if (!ready || !shown) {
            return;
        }
        if (!surfaced) {
            sendPlace();
            sendShow(true);
            sendGrab(true);
            sendClaim();
            surfaced = true;
        }
        if (streamInfo) {
            streamInfo.video = !!(streamInfo.mirrored && native && streamInfo.window);
        }
        sendMirror(!!(streamInfo && streamInfo.video));
        var place = edit ? placeName(edit.field, edit.title) : '';
        var crumb = crumbFor(screenName, heading, place);
        var built = edit
            ? buildKeyboardFrame(edit, screen.w || 1920, screen.h || 720, crumb)
            : buildFrame(items, selected, screen.w || 1920, screen.h || 720, detail, heading, version, streamInfo, boxPreview, caption, crumb);
        keyHits = (built.layout && built.layout.keys) || [];
        popupHits = (built.layout && built.layout.popup) || [];
        backBox = built.layout && built.layout.backHit ? built.layout.backHit : null;
        navBoxes = built.layout && built.layout.nav ? built.layout.nav : null;
        backAction = edit ? '' : findBack(items);
        write(built.frame);
        lastFrame = built.frame;
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
        surfaced = false;
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
        // mgu-render: CLAIM = u32 n + n*(f32 x,y,w,h). Without a claim, TOUCH
        // never reaches the app. Do not gate on X_STATE "front" — on this G21
        // it goes false right after READY and used to block claims forever.
        if (!ready || !shown) {
            return;
        }
        var w = screen.w || 1920;
        var h = screen.h || 720;
        var b = Buffer.alloc(36);
        b.writeUInt32LE(2, 0);
        b.writeFloatLE(0, 4);
        b.writeFloatLE(0, 8);
        b.writeFloatLE(w, 12);
        b.writeFloatLE(h, 16);
        b.writeFloatLE(CONTENT.x, 20);
        b.writeFloatLE(CONTENT.y, 24);
        b.writeFloatLE(CONTENT.w, 28);
        b.writeFloatLE(CONTENT.h, 32);
        write(message(CLAIM, b));
        if (!claimNoted) {
            claimNoted = true;
            note('menu-claim ' + w + 'x' + h);
        }
    }

    function pointIn(box, x, y) {
        var pts;
        var pi;
        var p;
        if (!box) {
            return false;
        }
        pts = [
            { x: x, y: y }
        ];
        for (pi = 0; pi < pts.length; pi += 1) {
            p = pts[pi];
            if (p.x >= box.x && p.x < box.x + box.w && p.y >= box.y && p.y < box.y + box.h) {
                return true;
            }
        }
        return false;
    }

    function hitsBack(x, y) {
        return pointIn(backBox, x, y);
    }

    function hitsNav(x, y) {
        if (!navBoxes) {
            return '';
        }
        if (pointIn(navBoxes.ok, x, y)) {
            return 'ok';
        }
        if (pointIn(navBoxes.left, x, y)) {
            return 'left';
        }
        if (pointIn(navBoxes.right, x, y)) {
            return 'right';
        }
        return '';
    }

    function useNav(which) {
        if (which === 'left') {
            if (edit) {
                knobKeyboard.moveKey(edit, -1);
                paint();
            } else {
                move(-1);
            }
            return;
        }
        if (which === 'right') {
            if (edit) {
                knobKeyboard.moveKey(edit, 1);
                paint();
            } else {
                move(1);
            }
            return;
        }
        if (edit) {
            applyEditResult(knobKeyboard.applyKey(edit));
            return;
        }
        press();
    }

    function hitRow(x, y) {
        var lay = menuLayout(items, selected, screen.w || 1920, screen.h || 720, detail, heading);
        var i;
        var bubble;
        var pts = [
            { x: x, y: y }
        ];
        var p;
        var pi;
        var best = -1;
        var bestDist = 1e9;
        var cx;
        var cy;
        var dx;
        var dy;
        var dist;
        var bestBox = -1;
        var bestHit = 1e9;
        for (pi = 0; pi < pts.length; pi += 1) {
            p = pts[pi];
            for (i = 0; i < lay.bubbles.length; i += 1) {
                bubble = lay.bubbles[i];
                var hx = bubble.hitX != null ? bubble.hitX : bubble.x;
                var hy = bubble.hitY != null ? bubble.hitY : bubble.y;
                var hw = bubble.hitW != null ? bubble.hitW : bubble.w;
                var hh = bubble.hitH != null ? bubble.hitH : bubble.h;
                cx = hx + hw / 2;
                cy = hy + hh / 2;
                dx = p.x - cx;
                dy = p.y - cy;
                dist = dx * dx + dy * dy;
                if (p.x >= hx && p.x < hx + hw && p.y >= hy && p.y < hy + hh && dist < bestHit) {
                    bestHit = dist;
                    bestBox = i;
                }
                if (dist < bestDist) {
                    bestDist = dist;
                    best = i;
                }
            }
        }
        if (bestBox >= 0) {
            return lay.bubbles[bestBox].index != null ? lay.bubbles[bestBox].index : bestBox;
        }
        // Finger often lands in the gap; accept the nearest tile within ~120 px.
        if (best >= 0 && bestDist <= 120 * 120) {
            return lay.bubbles[best].index != null ? lay.bubbles[best].index : best;
        }
        return -1;
    }

    function activateHit(hit, why) {
        if (hit < 0 || hit >= items.length) {
            return false;
        }
        selected = hit;
        note('menu-hit ' + why + ' ' + items[hit].name);
        paint();
        press();
        return true;
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
        clearHold();
        edit = null;
        if (next === 'airplay') {
            heading = 'THEiPlay';
        } else if (next === 'air-out') {
            heading = 'Gdzie pokazać';
        } else if (next === 'air-box') {
            heading = 'Okno';
        } else if (next === 'label') {
            heading = 'Napis';
        } else if (next === 'stream') {
            heading = 'Stream';
            streamInfo = null;
        } else {
            heading = 'THEiPlay';
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
                if (!edit) {
                    paint();
                }
                return true;
            }
        }
        return false;
    }

    function setItemTitle(name, text) {
        var i;
        for (i = 0; i < items.length; i += 1) {
            if (items[i].name === name) {
                items[i].title = String(text || '');
                if (!edit) {
                    paint();
                }
                return true;
            }
        }
        return false;
    }

    function setItemIcon(name, icon) {
        var i;
        for (i = 0; i < items.length; i += 1) {
            if (items[i].name === name) {
                items[i].icon = String(icon || 'play');
                if (!edit) {
                    paint();
                }
                return true;
            }
        }
        return false;
    }

    function move(delta) {
        if (!delta) {
            return;
        }
        if (edit) {
            knobKeyboard.moveKey(edit, delta > 0 ? 1 : -1);
            paint();
            return;
        }
        selected = (selected + delta) % items.length;
        if (selected < 0) {
            selected += items.length;
        }
        paint();
    }

    function finishEdit(result) {
        var done = edit && edit.onDone;
        var cancel = edit && edit.onCancel;
        var field = edit && edit.field;
        var value = result && result.value;
        clearHold();
        edit = null;
        paint();
        if (result && result.action === 'done' && typeof done === 'function') {
            done(value, field);
            return;
        }
        if (typeof cancel === 'function') {
            cancel(field);
        }
    }

    function press() {
        var item;
        var result;
        if (edit) {
            result = knobKeyboard.applyKey(edit);
            if (result.action === 'done' || result.action === 'cancel') {
                finishEdit(result);
                return;
            }
            paint();
            return;
        }
        item = items[selected];
        if (item) {
            choose(item.name);
        }
    }

    function tiltName(df) {
        if (df === 1) {
            return 'n';
        }
        if (df === 4) {
            return 'e';
        }
        if (df === 7) {
            return 's';
        }
        if (df === 10) {
            return 'w';
        }
        return '';
    }

    function onControl(operation, push, df) {
        var step = encoderStep(lastOp, operation);
        var item = items[selected];
        var adjusted = false;
        var tilt = tiltName(df | 0);
        var tilted = tilt && tilt !== lastTilt;
        lastOp = operation;
        lastTilt = tilt;
        if (tilted && !edit) {
            adjusted = typeof opts.onTilt === 'function' && !!opts.onTilt(tilt);
            if (!adjusted && (tilt === 'n' || tilt === 's')) {
                move(tilt === 's' ? 1 : -1);
            }
        }
        if (step && !edit && item && typeof opts.adjust === 'function') {
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

    function startEdit(opts) {
        edit = knobKeyboard.createEdit(opts || {});
        noted = false;
        paint();
        return true;
    }

    function cancelEdit() {
        if (!edit) {
            return false;
        }
        finishEdit({ action: 'cancel' });
        return true;
    }

    function clearHold() {
        if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
        }
    }

    function hitList(x, y, boxes) {
        var pts = [
            { x: x, y: y },
            { x: x + CONTENT.x, y: y + CONTENT.y },
            { x: x - CONTENT.x, y: y - CONTENT.y }
        ];
        var pi;
        var i;
        var box;
        var p;
        if (!boxes) {
            return null;
        }
        for (pi = 0; pi < pts.length; pi += 1) {
            p = pts[pi];
            for (i = 0; i < boxes.length; i += 1) {
                box = boxes[i];
                if (p.x >= box.x && p.x < box.x + box.w && p.y >= box.y && p.y < box.y + box.h) {
                    return box;
                }
            }
        }
        return null;
    }

    function applyEditResult(result) {
        if (!result) {
            return;
        }
        if (result.action === 'done' || result.action === 'cancel') {
            finishEdit(result);
            return;
        }
        paint();
    }

    function onEditTouch(phase, tx, ty) {
        var box;
        var pop;
        var pick;
        var ch;
        var idx;
        if (!edit) {
            return;
        }
        if (phase === 1) {
            box = hitList(tx, ty, keyHits);
            clearHold();
            edit.popup = null;
            if (!box) {
                touchDown = null;
                paint();
                return;
            }
            edit.keyIndex = box.index;
            touchDown = { x: tx, y: ty, key: box.index, t: Date.now(), held: false };
            paint();
            holdTimer = setTimeout(function () {
                var alts;
                holdTimer = null;
                if (!edit || !touchDown || touchDown.key !== box.index) {
                    return;
                }
                alts = knobKeyboard.altsFor(edit.keys[box.index]);
                if (!alts.length) {
                    return;
                }
                touchDown.held = true;
                touchDown.alt = alts[0];
                edit.popup = { keyIndex: box.index, alts: alts, pick: 0 };
                paint();
            }, 260);
            return;
        }
        if (phase === 2 && edit.popup && touchDown) {
            pop = hitList(tx, ty, popupHits);
            if (pop && pop.pick !== edit.popup.pick) {
                edit.popup.pick = pop.pick;
                touchDown.alt = edit.popup.alts[pop.pick];
                paint();
            }
            return;
        }
        if (phase === 3) {
            var held = !!(touchDown && (touchDown.held || (Date.now() - touchDown.t) >= 260));
            clearHold();
            if (held && touchDown) {
                pop = edit.popup ? hitList(tx, ty, popupHits) : null;
                if (pop && edit.popup) {
                    ch = edit.popup.alts[pop.pick];
                } else if (touchDown.alt) {
                    ch = touchDown.alt;
                } else if (edit.popup && edit.popup.alts && edit.popup.alts.length) {
                    ch = edit.popup.alts[edit.popup.pick] || edit.popup.alts[0];
                }
                idx = touchDown.key;
                edit.popup = null;
                touchDown = null;
                if (ch) {
                    edit.keyIndex = idx;
                    applyEditResult(knobKeyboard.applyKey(edit, ch));
                    return;
                }
            }
            if (touchDown && touchDown.key >= 0) {
                idx = touchDown.key;
                box = hitList(tx, ty, keyHits);
                if (box) {
                    idx = box.index;
                }
                touchDown = null;
                edit.keyIndex = idx;
                applyEditResult(knobKeyboard.applyKey(edit));
                return;
            }
            touchDown = null;
        }
    }

    function onWindowDrag(phase, tx, ty) {
        var win;
        var moved;
        var maxX;
        var maxY;
        if (screenName !== 'stream' || !streamInfo || !streamInfo.window) {
            return false;
        }
        win = streamInfo.window;
        if (phase === 1) {
            if (tx >= win.x && tx < win.x + win.w && ty >= win.y && ty < win.y + 48) {
                dragWin = { x: tx, y: ty, ox: win.x, oy: win.y };
                return true;
            }
            return false;
        }
        if (!dragWin) {
            return false;
        }
        moved = {
            x: dragWin.ox + (tx - dragWin.x),
            y: dragWin.oy + (ty - dragWin.y)
        };
        maxX = (screen.w || 1920) - win.w;
        maxY = (screen.h || 720) - win.h;
        if (moved.x < 0) {
            moved.x = 0;
        }
        if (moved.y < 0) {
            moved.y = 0;
        }
        if (maxX < 0) {
            maxX = 0;
        }
        if (maxY < 0) {
            maxY = 0;
        }
        if (moved.x > maxX) {
            moved.x = maxX;
        }
        if (moved.y > maxY) {
            moved.y = maxY;
        }
        win.x = moved.x | 0;
        win.y = moved.y | 0;
        if (typeof opts.onWindowMove === 'function') {
            opts.onWindowMove(win.x, win.y, phase === 3);
        }
        if (phase === 3) {
            dragWin = null;
        }
        paint();
        return true;
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
                // Byte 4 is on-screen. Logging every repeat looked like a leak;
                // the renderer also hides the layer when this flips.
                var onScreen = body.readUInt32LE(4) !== 0;
                if (onScreen !== front) {
                    front = onScreen;
                    note(front ? 'menu-front' : 'menu-away');
                }
            } else if (type === CLOSED) {
                note('menu-closed');
            } else if (type === TOUCH && body.length >= 12 && shown) {
                var phase = body.readUInt32LE(0);
                var tx = body.readFloatLE(4);
                var ty = body.readFloatLE(8);
                var hit;
                if (hitsNav(tx, ty)) {
                    if (phase === 1) {
                        touchDown = { nav: hitsNav(tx, ty), x: tx, y: ty, hit: -1, origin: selected, t: Date.now(), dragged: false };
                    } else if (phase === 3 && touchDown && touchDown.nav && hitsNav(tx, ty) === touchDown.nav) {
                        useNav(touchDown.nav);
                        touchDown = null;
                    } else if (phase === 3) {
                        touchDown = null;
                    }
                    return;
                }
                if (hitsBack(tx, ty)) {
                    if (phase === 3) {
                        if (edit) {
                            cancelEdit();
                        } else if (backAction) {
                            choose(backAction);
                        }
                    }
                    touchDown = null;
                    return;
                }
                note('menu-touch ' + phase + ' ' + Math.round(tx) + ',' + Math.round(ty));
                if (!edit && onWindowDrag(phase, tx, ty)) {
                    return;
                }
                if (edit) {
                    onEditTouch(phase, tx, ty);
                } else if (phase === 1) {
                    touchDown = { x: tx, y: ty, hit: hitRow(tx, ty), origin: selected, t: Date.now(), dragged: false };
                    if (touchDown.hit >= 0) {
                        selected = touchDown.hit;
                        touchDown.origin = touchDown.hit;
                        paint();
                    }
                } else if (phase === 2 && touchDown) {
                    var dragY = ty - touchDown.y;
                    var steps;
                    var origin;
                    var next;
                    if (Math.abs(dragY) >= 96) {
                        steps = Math.round(dragY / 72);
                        origin = touchDown.origin;
                        if (origin < 0) {
                            origin = selected;
                        }
                        next = origin - steps;
                        if (next < 0) {
                            next = 0;
                        }
                        if (next >= items.length) {
                            next = items.length - 1;
                        }
                        touchDown.dragged = true;
                        if (next !== selected) {
                            selected = next;
                            paint();
                        }
                    } else {
                        hit = hitRow(tx, ty);
                        if (hit >= 0 && hit !== selected) {
                            selected = hit;
                            touchDown.hit = hit;
                            paint();
                        }
                    }
                } else if (phase === 3) {
                    if (touchDown && touchDown.dragged) {
                        touchDown = null;
                    } else {
                    hit = touchDown && touchDown.hit >= 0 ? touchDown.hit : hitRow(tx, ty);
                    if (touchDown && hit >= 0) {
                        var ddx = tx - touchDown.x;
                        var ddy = ty - touchDown.y;
                        if ((ddx * ddx + ddy * ddy) <= 120 * 120) {
                            activateHit(hit, 'up');
                        }
                    } else if (hit >= 0) {
                        activateHit(hit, 'up');
                    }
                    touchDown = null;
                    }
                }
            } else if (type === CCU && body.length >= 5 && body.length < 12 && shown) {
                onControl(body.readUInt16BE(1), body[3], body[4]);
            } else if (type === X_CCU && body.length >= 5 && shown) {
                onControl(body.readUInt16BE(1), body[3], body[4]);
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
            mirrorSent = false;
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
            if (!shown || !ready) {
                return;
            }
            // GRAB lasts 1.5 s in mgu-renderd. One grab at open lets the knob die.
            sendGrab(true);
            pulseBeat += 1;
            if (lastFrame && (pulseBeat % 2) === 0) {
                write(lastFrame);
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
        repaint: function () {
            paint();
        },
        setScreen: setScreen,
        setItems: function (nextItems, nextHeading) {
            items = (nextItems || []).map(function (item) {
                return {
                    name: item.name,
                    title: item.title,
                    hint: item.hint || '',
                    icon: item.icon || 'play'
                };
            });
            if (typeof nextHeading === 'string') {
                heading = nextHeading;
            }
            if (selected >= items.length) {
                selected = 0;
            }
            noted = false;
            paint();
        },
        setItemHint: setItemHint,
        setItemTitle: setItemTitle,
        setItemIcon: setItemIcon,
        screen: function () { return screenName; },
        setStatus: function (text) {
            var next = String(text || '');
            if (next === detail) {
                return;
            }
            detail = next;
            if (!edit) {
                paint();
            }
        },
        setCaption: function (info) {
            caption = info && info.on ? {
                on: true,
                text: String(info.text || ''),
                x: info.x | 0,
                y: info.y | 0
            } : null;
            if (!edit) {
                paint();
            }
        },
        setBoxPreview: function (info) {
            boxPreview = info && typeof info === 'object' ? {
                x: info.x | 0,
                y: info.y | 0,
                w: info.w | 0,
                h: info.h | 0,
                limitW: info.limitW | 0,
                limitH: info.limitH | 0,
                mode: info.mode ? String(info.mode) : '',
                rotate: info.rotate | 0,
                label: info.label ? String(info.label) : ''
            } : null;
            if (!edit) {
                paint();
            }
        },
        setStreamInfo: function (info) {
            var next = info && typeof info === 'object' ? {
                pin: info.pin ? String(info.pin) : '',
                headline: info.headline ? String(info.headline) : '',
                hint: info.hint ? String(info.hint) : '',
                mirrored: !!info.mirrored,
                spin: !!info.spin,
                lines: Array.isArray(info.lines) ? info.lines.map(function (line) {
                    return String(line || '');
                }) : [],
                window: info.window && typeof info.window === 'object' ? {
                    x: info.window.x | 0,
                    y: info.window.y | 0,
                    w: info.window.w | 0,
                    h: info.window.h | 0
                } : null
            } : null;
            streamInfo = next;
            if (!edit) {
                paint();
            }
        },
        rebindVideo: rebindVideo,
        selected: function () { return selected; },
        selectedName: function () {
            return items[selected] ? items[selected].name : '';
        },
        startEdit: startEdit,
        cancelEdit: cancelEdit,
        editing: function () { return !!edit; }
    };
}

module.exports = {
    ITEMS: ITEMS,
    ROOT_ITEMS: ROOT_ITEMS,
    AIRPLAY_ITEMS: AIRPLAY_ITEMS,
    AIR_OUT_ITEMS: AIR_OUT_ITEMS,
    STREAM_ITEMS: STREAM_ITEMS,
    SCREENS: SCREENS,
    ICONS: ICONS,
    message: message,
    buildFrame: buildFrame,
    buildStreamFrame: buildStreamFrame,
    streamWindow: streamWindow,
    buildKeyboardFrame: buildKeyboardFrame,
    encoderStep: encoderStep,
    crumbFor: crumbFor,
    createMenuSurface: createMenuSurface,
    FONT: FONT
};
