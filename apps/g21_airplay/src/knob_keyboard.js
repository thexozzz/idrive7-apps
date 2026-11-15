'use strict';

/*
 * iDrive-style character entry for the renderer menu.
 * RHMI LT_Speller stays blank on this G21, so the knob picks keys on a drawn
 * keyboard: rotate = move, press = type / OK / DEL / ANULUJ.
 */

// A phone-like layout: digits on top, the letters, Polish letters, then the action row.
var QWERTY_ROWS = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', '_', '-', '.'],
    ['ą', 'ć', 'ę', 'ł', 'ń', 'ó', 'ś', 'ź', 'ż'],
    ['SH', 'SPC', 'DEL', 'ANU', 'OK']
];

// Przeglądarka: what an address and a web form need. Polish letters are the long press on a, c, e, l, n, o, s, z.
var WEB_ROWS = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '@'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', '.', '-', '/'],
    [':', '?', '=', '&', '%', '#', '_', '+', '!', ','],
    ['SH', 'SPC', 'DEL', 'ANU', 'OK']
];

// Key widths in key units (a letter is 1): the renderer draws them and the knob's
// up / down finds the key under the same spot of the next row.
var KEY_WEIGHT = { SH: 1.6, SPC: 3.6, DEL: 1.8, ANU: 1.8, OK: 2.2 };
var KEY_GAP = 0.14;

var ALTS = {
    a: ['ą'], A: ['Ą'],
    c: ['ć'], C: ['Ć'],
    e: ['ę'], E: ['Ę'],
    l: ['ł'], L: ['Ł'],
    n: ['ń'], N: ['Ń'],
    o: ['ó'], O: ['Ó'],
    s: ['ś'], S: ['Ś'],
    z: ['ź', 'ż'], Z: ['Ź', 'Ż']
};

var MODES = {
    ip: {
        title: 'IP',
        rows: [
            ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
            ['.', 'DEL', 'OK', 'ANU']
        ],
        max: 15,
        mask: false
    },
    port: {
        title: 'Port',
        rows: [
            ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
            ['DEL', 'OK', 'ANU']
        ],
        max: 5,
        mask: false
    },
    user: {
        title: 'Konto',
        rows: QWERTY_ROWS,
        max: 32,
        mask: false,
        shift: true
    },
    pass: {
        title: 'Hasło',
        rows: QWERTY_ROWS,
        max: 64,
        mask: true,
        shift: true
    },
    name: {
        title: 'Nazwa',
        rows: QWERTY_ROWS,
        max: 16,
        mask: false,
        shift: true
    },
    caption: {
        title: 'Napis',
        rows: QWERTY_ROWS,
        max: 24,
        mask: false,
        shift: true
    },
    // Przeglądarka: an address, a text field of a page, a password field of a page
    url: {
        title: 'Adres',
        rows: WEB_ROWS,
        max: 512,
        mask: false,
        shift: true
    },
    text: {
        title: 'Tekst',
        rows: WEB_ROWS,
        max: 256,
        mask: false,
        shift: true
    },
    webpass: {
        title: 'Hasło',
        rows: WEB_ROWS,
        max: 128,
        mask: true,
        shift: true
    }
};

function isLetter(key) {
    return key && key.length === 1 && /[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]/.test(key);
}

function applyShiftRows(rows, shift) {
    return rows.map(function (row) {
        return row.map(function (key) {
            if (!isLetter(key)) {
                return key;
            }
            return shift ? key.toLocaleUpperCase('pl') : key.toLocaleLowerCase('pl');
        });
    });
}

function flatten(rows) {
    var keys = [];
    var r;
    var c;
    for (r = 0; r < rows.length; r += 1) {
        for (c = 0; c < rows[r].length; c += 1) {
            keys.push(rows[r][c]);
        }
    }
    return keys;
}

function keyWeight(key) {
    return KEY_WEIGHT[key] || 1;
}

// Each row's keys as spans in key units, every row centred on 0: [[{x0, x1, index}]].
function rowSpans(rows) {
    var out = [];
    var index = 0;
    var r;
    var c;
    var width;
    var x;
    var row;
    for (r = 0; r < rows.length; r += 1) {
        row = [];
        width = 0;
        for (c = 0; c < rows[r].length; c += 1) {
            width += keyWeight(rows[r][c]) + (c ? KEY_GAP : 0);
        }
        x = -width / 2;
        for (c = 0; c < rows[r].length; c += 1) {
            row.push({ x0: x, x1: x + keyWeight(rows[r][c]), index: index });
            x += keyWeight(rows[r][c]) + KEY_GAP;
            index += 1;
        }
        out.push(row);
    }
    return out;
}

// The knob tilted: 'n' / 's' the key above / below (the one under the same spot, rows wrap),
// 'e' / 'w' the next / previous key in the row (wraps in the row).
function moveKeyDir(edit, dir) {
    var spans;
    var r;
    var c;
    var row;
    var cur = null;
    var mid;
    var best;
    var bestD;
    var d;
    var k;
    if (!edit || !edit.rows || !edit.rows.length) {
        return edit;
    }
    spans = rowSpans(edit.rows);
    for (r = 0; r < spans.length && !cur; r += 1) {
        for (c = 0; c < spans[r].length; c += 1) {
            if (spans[r][c].index === edit.keyIndex) {
                cur = { r: r, c: c };
                break;
            }
        }
    }
    if (!cur) {
        edit.keyIndex = 0;
        return edit;
    }
    row = spans[cur.r];
    if (dir === 'e' || dir === 'w') {
        c = (cur.c + (dir === 'e' ? 1 : -1) + row.length) % row.length;
        edit.keyIndex = row[c].index;
        return edit;
    }
    if (dir !== 'n' && dir !== 's') {
        return edit;
    }
    mid = (row[cur.c].x0 + row[cur.c].x1) / 2;
    r = (cur.r + (dir === 's' ? 1 : -1) + spans.length) % spans.length;
    best = spans[r][0];
    bestD = Infinity;
    for (k = 0; k < spans[r].length; k += 1) {
        if (mid >= spans[r][k].x0 && mid <= spans[r][k].x1) {
            best = spans[r][k];
            break;
        }
        d = Math.min(Math.abs(mid - spans[r][k].x0), Math.abs(mid - spans[r][k].x1));
        if (d < bestD) {
            bestD = d;
            best = spans[r][k];
        }
    }
    edit.keyIndex = best.index;
    return edit;
}

function rebuildKeys(edit) {
    var mode = MODES[edit.mode] || MODES.user;
    edit.rows = applyShiftRows(mode.rows, !!edit.shift);
    edit.keys = flatten(edit.rows);
    if (edit.keyIndex >= edit.keys.length) {
        edit.keyIndex = 0;
    }
}

function createEdit(opts) {
    var mode = MODES[opts.mode] || MODES.user;
    var value = String(opts.value == null ? '' : opts.value);
    var edit;
    if (value.length > mode.max) {
        value = value.slice(0, mode.max);
    }
    edit = {
        mode: opts.mode || 'user',
        title: opts.title || mode.title,
        value: value,
        keyIndex: 0,
        shift: false,
        rows: [],
        keys: [],
        max: mode.max,
        mask: mode.mask === true,
        field: opts.field || '',
        popup: null,
        onDone: opts.onDone,
        onCancel: opts.onCancel
    };
    rebuildKeys(edit);
    // letters: start on the first letter (q), not on a digit
    if (mode.shift) {
        edit.keyIndex = Math.max(0, edit.keys.indexOf('q'));
    }
    return edit;
}

function altsFor(key) {
    var list = ALTS[key];
    return list ? list.slice() : [];
}

function displayValue(edit) {
    if (!edit) {
        return '';
    }
    if (edit.mask) {
        return edit.value.length ? Array(edit.value.length + 1).join('*') : '';
    }
    return edit.value;
}

function moveKey(edit, delta) {
    if (!edit || !delta) {
        return edit;
    }
    var next = (edit.keyIndex + delta) % edit.keys.length;
    if (next < 0) {
        next += edit.keys.length;
    }
    edit.keyIndex = next;
    return edit;
}

function applyKey(edit, forced) {
    var key;
    if (!edit) {
        return { action: 'none' };
    }
    key = forced != null ? String(forced) : edit.keys[edit.keyIndex];
    edit.popup = null;
    if (key === 'ANU') {
        return { action: 'cancel' };
    }
    if (key === 'OK') {
        return { action: 'done', value: edit.value };
    }
    if (key === 'DEL') {
        edit.value = edit.value.slice(0, -1);
        return { action: 'edit', value: edit.value };
    }
    if (key === 'SH') {
        edit.shift = !edit.shift;
        rebuildKeys(edit);
        return { action: 'edit', value: edit.value };
    }
    if (key === 'SPC') {
        key = ' ';
    }
    if (edit.value.length >= edit.max) {
        return { action: 'edit', value: edit.value };
    }
    edit.value += key;
    return { action: 'edit', value: edit.value };
}

function validate(modeName, value) {
    var text = String(value == null ? '' : value);
    if (modeName === 'ip') {
        var parts = text.split('.');
        var i;
        var n;
        if (parts.length !== 4) {
            return { ok: false, reason: 'bad-host' };
        }
        for (i = 0; i < 4; i += 1) {
            if (!/^\d+$/.test(parts[i])) {
                return { ok: false, reason: 'bad-host' };
            }
            n = Number(parts[i]);
            if (n < 0 || n > 255) {
                return { ok: false, reason: 'bad-host' };
            }
        }
        return { ok: true, value: text };
    }
    if (modeName === 'port') {
        if (!/^\d+$/.test(text)) {
            return { ok: false, reason: 'bad-port' };
        }
        n = Number(text);
        if (n < 1 || n > 65535) {
            return { ok: false, reason: 'bad-port' };
        }
        return { ok: true, value: n };
    }
    if (modeName === 'caption') {
        text = text.replace(/[^A-Za-z0-9 _\-ĄĆĘŁŃÓŚŹŻąćęłńóśźż]/g, '').slice(0, 24);
        if (!text.length) {
            return { ok: false, reason: 'bad-name' };
        }
        return { ok: true, value: text };
    }
    if (modeName === 'name') {
        text = text.replace(/[^A-Za-z0-9_\-ĄĆĘŁŃÓŚŹŻąćęłńóśźż]/g, '').slice(0, 16);
        if (!text.length) {
            return { ok: false, reason: 'bad-name' };
        }
        return { ok: true, value: text };
    }
    if (modeName === 'user') {
        return { ok: true, value: text.slice(0, 64) };
    }
    if (modeName === 'pass') {
        return { ok: true, value: text.slice(0, 64) };
    }
    return { ok: true, value: text };
}

module.exports = {
    MODES: MODES,
    createEdit: createEdit,
    displayValue: displayValue,
    moveKey: moveKey,
    moveKeyDir: moveKeyDir,
    rowSpans: rowSpans,
    keyWeight: keyWeight,
    applyKey: applyKey,
    altsFor: altsFor,
    validate: validate
};
