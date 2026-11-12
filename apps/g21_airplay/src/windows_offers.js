'use strict';

var fs = require('fs');
var path = require('path');

function parseOffers(text) {
    var lines = String(text || '').split(/\r?\n/);
    var out = [];
    var i;
    for (i = 0; i < lines.length; i += 1) {
        var line = lines[i];
        var parts;
        if (!line) {
            continue;
        }
        parts = line.split('|');
        if (parts.length < 3 || !parts[0]) {
            continue;
        }
        out.push({
            id: String(parts[0]),
            ip: String(parts[1] || ''),
            name: String(parts[2] || 'Windows'),
            rtsp: parts[3] ? String(parts[3]) : ''
        });
    }
    return out;
}

function readOffers(file) {
    try {
        return parseOffers(fs.readFileSync(file, 'utf8'));
    } catch (err) {
        return [];
    }
}

function writeAccept(file, id) {
    var dir = path.dirname(file);
    try {
        fs.mkdirSync(dir);
    } catch (err) {
        if (!err || err.code !== 'EEXIST') {
            return { ok: false, reason: 'accept-dir' };
        }
    }
    try {
        fs.writeFileSync(file, String(id || '') + '\n');
        return { ok: true };
    } catch (err2) {
        return { ok: false, reason: 'accept-write' };
    }
}

function menuItems(offers) {
    var items = [];
    var i;
    for (i = 0; i < offers.length; i += 1) {
        items.push({
            name: 'win-d-' + offers[i].id,
            title: (offers[i].name || 'Windows').slice(0, 16),
            hint: (offers[i].ip || '').slice(0, 28),
            icon: 'desktop'
        });
    }
    items.push({ name: 'win-d-back', title: 'Wstecz', hint: 'Windows', icon: 'back' });
    return items;
}

module.exports = {
    parseOffers: parseOffers,
    readOffers: readOffers,
    writeAccept: writeAccept,
    menuItems: menuItems
};
