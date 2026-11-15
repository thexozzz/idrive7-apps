'use strict';
// SPDX-License-Identifier: GPL-3.0-or-later

/*
 * G21 Input's client: the iDrive controller's touchpad as a mouse, from the tool g21-input
 * (/run/g21-input/ctl.sock). The daemon reads the pad and holds the controller in touch mode only while
 * a client asks; it sends how far the finger moved and taps. When this client goes away (the app is
 * closed, it crashes) the daemon puts the controller back by itself.
 *
 *   var input = createInputClient({ note: fn, onMove: fn(dx, dy), onTap: fn(), onState: fn(state) });
 *   input.on('chromium');   // ask for the mouse (connects, asks again after the daemon restarts)
 *   input.off();            // give it back
 */

var net = require('net');

var SOCKET = '/run/g21-input/ctl.sock';

function createInputClient(options) {
    var file = (options && options.socket) || SOCKET;
    var note = (options && options.note) || function () {};
    var sock = null;
    var up = false;
    var want = '';
    var retry = null;
    var buf = '';
    var failNoted = false;
    var state = { connected: false, on: false, pad: -1, speed: null, moving: false };

    function tell() {
        if (options && typeof options.onState === 'function') {
            options.onState(state);
        }
    }

    function onLine(line) {
        var m;
        try {
            m = JSON.parse(line);
        } catch (err) {
            return;
        }
        if (!m || typeof m.ev !== 'string') {
            return;
        }
        if (m.ev === 'm' && want && options && typeof options.onMove === 'function') {
            options.onMove(Number(m.dx) || 0, Number(m.dy) || 0);
        } else if (m.ev === 'tap' && want && options && typeof options.onTap === 'function') {
            options.onTap();
        } else if (m.ev === 's' && want && options && typeof options.onScroll === 'function') {
            // two fingers moved together
            options.onScroll(Number(m.dx) || 0, Number(m.dy) || 0);
        } else if (m.ev === 'state') {
            state = { connected: true, on: !!m.on, pad: Number(m.pad), speed: typeof m.speed === 'number' ? m.speed : null, moving: !!m.moving };
            tell();
        }
    }

    function connect() {
        var s;
        clearTimeout(retry);
        retry = null;
        if (!want || sock) {
            return;
        }
        s = net.createConnection(file);
        sock = s;
        s.setEncoding('utf8');
        s.on('connect', function () {
            if (sock !== s) {
                return;
            }
            up = true;
            buf = '';
            failNoted = false;
            note('[G21-INPUT] daemon connected, mouse asked for ' + want);
            s.write(JSON.stringify({ op: 'on', app: want }) + '\n');
        });
        s.on('data', function (d) {
            var i;
            if (sock !== s) {
                return;
            }
            buf += d;
            if (buf.length > 8192 && buf.indexOf('\n') < 0) {
                buf = '';
                return;
            }
            while ((i = buf.indexOf('\n')) >= 0) {
                onLine(buf.slice(0, i));
                buf = buf.slice(i + 1);
            }
        });
        s.on('error', function (err) {
            if (!failNoted) {
                failNoted = true;
                note('[G21-INPUT] no daemon: ' + ((err && err.code) || err));
            }
        });
        s.on('close', function () {
            if (sock !== s) {
                return;
            }
            sock = null;
            up = false;
            state = { connected: false, on: false, pad: -1, speed: null, moving: false };
            tell();
            if (want) {
                retry = setTimeout(connect, 2000);
            }
        });
    }

    return {
        /** ask for the mouse for the app named (a word for the daemon's log) */
        on: function (app) {
            want = String(app || 'app');
            if (up && sock) {
                sock.write(JSON.stringify({ op: 'on', app: want }) + '\n');
            } else {
                connect();
            }
        },
        /** give the controller back: the daemon leaves touch mode */
        off: function () {
            var s = sock;
            want = '';
            clearTimeout(retry);
            retry = null;
            sock = null;
            up = false;
            if (s) {
                try {
                    s.end(JSON.stringify({ op: 'off' }) + '\n');
                } catch (err) {
                    s.destroy();
                }
            }
            state = { connected: false, on: false, pad: -1, speed: null, moving: false };
        },
        state: function () {
            return state;
        },
        wanted: function () {
            return !!want;
        }
    };
}

module.exports = {
    createInputClient: createInputClient,
    SOCKET: SOCKET
};
