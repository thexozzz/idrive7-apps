'use strict';

var fs = require('fs');
var path = require('path');
var credentials = require('./credentials.js');

// OAP apps on this MGU run as uid oap_NNNN and cannot mkdir under /var/opt.
// Persist next to the app data tree (writable) or fall back to /tmp.
var DEFAULT_DIR = '/tmp/g21_airplay';

function ensureDir(dir) {
    try {
        fs.mkdirSync(dir);
    } catch (err) {
        if (!err || err.code !== 'EEXIST') {
            throw err;
        }
    }
}

function canUseDir(dir) {
    if (!dir) {
        return false;
    }
    try {
        ensureDir(dir);
        var probe = path.join(dir, '.g21-write-probe');
        fs.writeFileSync(probe, 'ok');
        fs.unlinkSync(probe);
        return true;
    } catch (err) {
        return false;
    }
}

function resolveDataDir(preferred) {
    var i;
    var candidates = [
        preferred,
        process.env.G21_AIRPLAY_DATA,
        path.join(process.cwd(), 'data', 'g21_airplay'),
        path.join(process.cwd(), '..', 'data', 'g21_airplay'),
        path.join(process.cwd(), 'data'),
        path.join(process.cwd(), '..', 'data'),
        DEFAULT_DIR
    ];
    for (i = 0; i < candidates.length; i += 1) {
        if (canUseDir(candidates[i])) {
            return candidates[i];
        }
    }
    return DEFAULT_DIR;
}

function createConfigStore(opts) {
    var base = resolveDataDir(opts && opts.dir);
    var settingsFile = path.join(base, 'desktop.json');
    var secrets = {
        rdp: path.join(base, 'rdp.secret'),
        vnc: path.join(base, 'vnc.secret'),
    };

    function secretFile(kind) {
        var name = String(kind || '');
        if (secrets[name]) {
            return secrets[name];
        }
        if (/^(rdp|vnc)-p[0-9]+$/.test(name)) {
            return path.join(base, name + '.secret');
        }
        return '';
    }

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
        var file = secretFile(kind);
        var text = credentials.readSecret(file);
        return !!(text && String(text).replace(/\s+$/, '').length);
    }

    function readSecret(kind) {
        return String(credentials.readSecret(secretFile(kind)) || '').replace(/\s+$/, '');
    }

    function writeSecret(kind, secret) {
        var file = secretFile(kind);
        if (!file) {
            return { ok: false, reason: 'unknown-secret' };
        }
        ensureDir(base);
        if (secret === null || typeof secret === 'undefined' || String(secret) === '') {
            credentials.removeSecret(file);
            return { ok: true, cleared: true };
        }
        credentials.writeSecret(file, String(secret).replace(/\s+$/, ''));
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
        secretPath: function (kind) { return secretFile(kind); },
    };
}

module.exports = {
    DEFAULT_DIR: DEFAULT_DIR,
    createConfigStore: createConfigStore,
};
