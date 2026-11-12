'use strict';

var fs = require('fs');
var path = require('path');
var credentials = require('./credentials.js');

var DEFAULT_DIR = '/var/opt/g21_airplay';

function ensureDir(dir) {
    try {
        fs.mkdirSync(dir);
    } catch (err) {
        if (!err || err.code !== 'EEXIST') {
            throw err;
        }
    }
}

function createConfigStore(opts) {
    var base = (opts && opts.dir) || DEFAULT_DIR;
    var settingsFile = path.join(base, 'desktop.json');
    var secrets = {
        rdp: path.join(base, 'rdp.secret'),
        vnc: path.join(base, 'vnc.secret'),
    };

    function readSettings() {
        try {
            var data = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
            if (!data || typeof data !== 'object') {
                return {};
            }
            return data;
        } catch (err) {
            return {};
        }
    }

    function writeSettings(snapshot) {
        ensureDir(base);
        var body = JSON.stringify(snapshot, null, 2);
        if (body.indexOf('password') !== -1 || body.indexOf('secret') !== -1) {
            throw new Error('settings must not contain secrets');
        }
        var fd = fs.openSync(settingsFile, 'w', 384);
        try {
            fs.writeSync(fd, body, null, 'utf8');
        } finally {
            fs.closeSync(fd);
        }
        return { ok: true, file: settingsFile };
    }

    function hasSecret(kind) {
        var text = credentials.readSecret(secrets[kind] || '');
        return !!(text && String(text).replace(/\s+$/, '').length);
    }

    function readSecret(kind) {
        return String(credentials.readSecret(secrets[kind] || '') || '').replace(/\s+$/, '');
    }

    function writeSecret(kind, secret) {
        if (!secrets[kind]) {
            return { ok: false, reason: 'unknown-secret' };
        }
        ensureDir(base);
        if (secret === null || typeof secret === 'undefined' || String(secret) === '') {
            credentials.removeSecret(secrets[kind]);
            return { ok: true, cleared: true };
        }
        credentials.writeSecret(secrets[kind], String(secret).replace(/\s+$/, ''));
        return { ok: true };
    }

    return {
        dir: base,
        settingsFile: settingsFile,
        readSettings: readSettings,
        writeSettings: writeSettings,
        hasSecret: hasSecret,
        readSecret: readSecret,
        writeSecret: writeSecret,
        secretPath: function (kind) { return secrets[kind] || ''; },
    };
}

module.exports = {
    DEFAULT_DIR: DEFAULT_DIR,
    createConfigStore: createConfigStore,
};
