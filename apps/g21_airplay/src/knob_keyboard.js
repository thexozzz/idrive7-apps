'use strict';

/*
 * iDrive-style character entry for the renderer menu.
 * RHMI LT_Speller stays blank on this G21, so the knob picks keys on a drawn
 * keyboard: rotate = move, press = type / OK / DEL / ANULUJ.
 */

var MODES = {
    ip: {
        title: 'IP',
        keys: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.', 'DEL', 'OK', 'ANU'],
        cols: 7,
        max: 15,
        mask: false
    },
    port: {
        title: 'Port',
        keys: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'DEL', 'OK', 'ANU'],
        cols: 7,
        max: 5,
        mask: false
    },
    user: {
        title: 'Konto',
        keys: [
            'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j',
            'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't',
            'u', 'v', 'w', 'x', 'y', 'z', '0', '1', '2', '3',
            '4', '5', '6', '7', '8', '9', '.', '_', '-',
            'SPC', 'DEL', 'OK', 'ANU'
        ],
        cols: 10,
        max: 32,
        mask: false
    },
    pass: {
        title: 'Haslo',
        keys: [
            'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j',
            'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't',
            'u', 'v', 'w', 'x', 'y', 'z', '0', '1', '2', '3',
            '4', '5', '6', '7', '8', '9', '.', '_', '-',
            'SPC', 'DEL', 'OK', 'ANU'
        ],
        cols: 10,
        max: 64,
        mask: true
    },
    name: {
        title: 'Nazwa',
        keys: [
            'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J',
            'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T',
            'U', 'V', 'W', 'X', 'Y', 'Z', '0', '1', '2', '3',
            '4', '5', '6', '7', '8', '9', '_', '-',
            'DEL', 'OK', 'ANU'
        ],
        cols: 10,
        max: 16,
        mask: false
    }
};

function createEdit(opts) {
    var mode = MODES[opts.mode] || MODES.user;
    var value = String(opts.value == null ? '' : opts.value);
    if (value.length > mode.max) {
        value = value.slice(0, mode.max);
    }
    return {
        mode: opts.mode || 'user',
        title: opts.title || mode.title,
        value: value,
        keyIndex: 0,
        keys: mode.keys.slice(),
        cols: mode.cols,
        max: mode.max,
        mask: mode.mask === true,
        field: opts.field || '',
        onDone: opts.onDone,
        onCancel: opts.onCancel
    };
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

function applyKey(edit) {
    if (!edit) {
        return { action: 'none' };
    }
    var key = edit.keys[edit.keyIndex];
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
    if (modeName === 'name') {
        text = text.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 16);
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
    validate: validate
};
