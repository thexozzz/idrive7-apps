'use strict';

/*
 * iDrive-style character entry for the renderer menu.
 * RHMI LT_Speller stays blank on this G21, so the knob picks keys on a drawn
 * keyboard: rotate = move, press = type / OK / DEL / ANULUJ.
 */

var QWERTY_ROWS = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
    ['ą', 'ć', 'ę', 'ł', 'ń', 'ó', 'ś', 'ź', 'ż'],
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['_', '-', '.', 'SH', 'SPC', 'DEL', 'OK', 'ANU']
];

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
        title: 'Haslo',
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
    applyKey: applyKey,
    altsFor: altsFor,
    validate: validate
};
