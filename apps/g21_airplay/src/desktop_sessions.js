'use strict';

var fs = require('fs');
var net = require('net');
var path = require('path');
var credentials = require('./credentials.js');
var pathsFactory = require('./paths.js');

function writeText(file, text) {
    var dir = path.dirname(file);
    try {
        fs.mkdirSync(dir);
    } catch (err) {
        if (!err || err.code !== 'EEXIST') {
            return { ok: false, reason: 'session-dir' };
        }
    }
    fs.writeFileSync(file, text);
    return { ok: true };
}

function createAirPlaySession(opts) {
    var files = opts.paths || pathsFactory.sessionPaths();
    var readStatus = opts.readStatus || function () { return { state: 'idle', detail: '' }; };
    return {
        connect: function (target) {
            var name = target && target.name ? target.name : 'G21';
            var allow = writeText(files.allow, 'airplay\n');
            if (!allow.ok) {
                return allow;
            }
            writeText(files.name, name + '\n');
            return { ok: true, state: 'starting', target: { name: name } };
        },
        disconnect: function () {
            writeText(files.allow, 'stop\n');
            return { ok: true, state: 'idle' };
        },
        getStatus: function () {
            return readStatus();
        },
    };
}

function lineSender(sockPath) {
    var socket = null;
    var opening = false;
    var pending = '';
    return function (line) {
        if (pending.length > 8192) {
            return { ok: false, reason: 'no-input' };
        }
        pending += line + '\n';
        if (socket) {
            socket.write(pending);
            pending = '';
            return { ok: true };
        }
        if (!opening) {
            opening = true;
            var next = net.connect(sockPath);
            next.on('connect', function () {
                socket = next;
                opening = false;
                if (pending.length) {
                    socket.write(pending);
                    pending = '';
                }
            });
            next.on('error', function () {
                opening = false;
                socket = null;
            });
            next.on('close', function () {
                socket = null;
                opening = false;
            });
        }
        return { ok: true, state: 'queued' };
    };
}

function createRdpSession(opts) {
    var files = opts.paths || pathsFactory.sessionPaths();
    var sendInput = opts.sendInput || lineSender(files.inputSock);
    var clientPath = opts.clientPath || '/var/opt/g21-airplay-open/current/g21-rdp';
    function clientExists() {
        if (typeof opts.clientExists === 'function') {
            return opts.clientExists();
        }
        try {
            return fs.existsSync(clientPath);
        } catch (err) {
            return false;
        }
    }
    function readDesktop() {
        var text = '';
        try {
            text = fs.readFileSync(files.desktopStatus, 'utf8');
        } catch (err) {
            text = '';
        }
        var parts = String(text || '').replace(/\s+$/, '').split('|');
        return {
            state: parts[0] || 'idle',
            detail: parts[1] || '',
            extra: parts[2] || '',
            raw: text,
        };
    }
    return {
        connect: function (target) {
            if (!clientExists()) {
                writeText(files.desktopStatus, 'missing|rdp|\n');
                return { ok: false, reason: 'rdp-client-missing' };
            }
            var host = target && target.host ? target.host : '';
            var port = target && target.port ? target.port : 3389;
            var user = target && target.user ? target.user : '';
            if (!host || host === '0.0.0.0') {
                return { ok: false, reason: 'no-host' };
            }
            if (target && Object.prototype.hasOwnProperty.call(target, 'password')) {
                try {
                    if (target.password) {
                        credentials.writeSecret(files.secret, target.password);
                    } else {
                        credentials.removeSecret(files.secret);
                    }
                } catch (err) {
                    return { ok: false, reason: 'secret-write-failed' };
                }
            }
            var cert = target && target.cert ? target.cert : '';
            if (!cert) {
                var seen = readDesktop();
                if (seen.state === 'cert' && seen.detail) {
                    cert = seen.detail;
                }
            }
            if (cert) {
                writeText(files.cert, cert + '\n');
            }
            var wrote = writeText(files.target, host + ' ' + port + ' ' + user + '\n');
            if (!wrote.ok) {
                return wrote;
            }
            writeText(files.desktopStatus, 'starting|rdp|\n');
            writeText(files.allow, 'rdp\n');
            return { ok: true, state: 'starting', target: { host: host, port: port, user: user } };
        },
        disconnect: function () {
            writeText(files.allow, 'stop\n');
            credentials.removeSecret(files.secret);
            writeText(files.desktopStatus, 'idle|rdp|\n');
            return { ok: true, state: 'idle' };
        },
        getStatus: function () {
            var status = readDesktop();
            if (status.state === 'cert') {
                return { state: 'cert', detail: status.detail || 'rdp', fingerprint: status.detail };
            }
            return { state: status.state || 'starting', detail: status.detail || 'rdp' };
        },
        pendingCert: function () {
            var status = readDesktop();
            if (status.state === 'cert' && status.detail) {
                return status.detail;
            }
            return '';
        },
        sendMouseMove: function (x, y) { return sendInput('M ' + x + ' ' + y); },
        sendMouseClick: function (button, down) { return sendInput('C ' + button + ' ' + (down ? 1 : 0)); },
        sendMouseScroll: function (delta) { return sendInput('W ' + delta); },
        sendKey: function (key, down) { return sendInput('K ' + key + ' ' + (down ? 1 : 0)); },
    };
}

module.exports = {
    createAirPlaySession: createAirPlaySession,
    createRdpSession: createRdpSession,
};
