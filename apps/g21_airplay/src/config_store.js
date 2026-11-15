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

    // the settings as last written; when that file cannot be read (cut off in the middle of an older, in-place
    // write), the copy of the write before it
    function readSettings() {
        var files = [settingsFile, settingsFile + '.bak'];
        var i;
        var data;
        for (i = 0; i < files.length; i += 1) {
            try {
                data = JSON.parse(fs.readFileSync(files[i], 'utf8'));
                if (data && typeof data === 'object') {
                    return data;
                }
            } catch (err) {
                // the next one
            }
        }
        return {};
    }

    function writeSettings(snapshot) {
        ensureDir(base);
        var secretKey = false;
        // No secret goes into this file: a field NAMED password or secret is refused. (The check used to look for
        // the two words anywhere in the text, so a label or a name that contained one of them stopped every
        // save from then on.)
        var body = JSON.stringify(snapshot, function (key, value) {
            if (/^(password|secret)$/i.test(key)) {
                secretKey = true;
            }
            return value;
        }, 2);
        if (secretKey) {
            throw new Error('settings must not contain secrets');
        }
        /*
         * Written beside the file, forced to the disk, then put in its place: the file is always a whole one, the
         * old or the new. It used to be written in place and left to the system to flush: a car switched off, or
         * the app ended, right after a change lost the change or left half a file, and the next start read
         * the defaults. The file before stays as .bak.
         */
        var tmp = settingsFile + '.new';
        var fd = fs.openSync(tmp, 'w', 384);
        try {
            fs.writeSync(fd, body, null, 'utf8');
            try {
                fs.fsyncSync(fd);
            } catch (syncErr) {
                // a file system that cannot: the rename still keeps the file whole
            }
        } finally {
            fs.closeSync(fd);
        }
        try {
            if (JSON.parse(fs.readFileSync(settingsFile, 'utf8'))) {
                fs.writeFileSync(settingsFile + '.bak', fs.readFileSync(settingsFile));
            }
        } catch (bakErr) {
            // no good file before this one
        }
        fs.renameSync(tmp, settingsFile);
        try {
            var dirFd = fs.openSync(base, 'r');
            try {
                fs.fsyncSync(dirFd);
            } finally {
                fs.closeSync(dirFd);
            }
        } catch (dirErr) {
            // Windows, or a folder that cannot be opened: the file itself is on the disk
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
        /** where the settings are kept; volatile: a folder that is gone after a restart of the head unit */
        dir: base,
        volatile: base === DEFAULT_DIR || base.indexOf('/tmp/') === 0,
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
