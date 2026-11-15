#!/usr/bin/node
// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/*
 * g21-audio-client - a G21 Audio stream for a program that cannot hold a socket itself (a shell tool).
 *
 *   node g21-audio-client.js hold NAME UID    opens the stream NAME for a writer with that uid, prints the FIFO's
 *                                             path (one line) and stays: the stream lives as long as this process.
 *                                             SIGTERM closes it. Exit 1 with nothing printed: no stream (G21 Audio
 *                                             is not there, or another player has it).
 *   node g21-audio-client.js status           prints g21-audiod's status
 *   node g21-audio-client.js tone [SECONDS]   the audible test
 *
 * The head unit's Node 8, root (the socket is root's).
 */
var net = require('net');
var SOCK = process.env.G21_AUDIO_SOCK || '/run/g21-audio/ctl.sock';
var op = process.argv[2];

function say(t) { process.stderr.write(new Date().toISOString() + ' [G21-AUDIO] client: ' + t + '\n'); }
function connect(first, onLine) {
    var c = net.connect(SOCK);
    var buf = '';
    c.setEncoding('utf8');
    c.on('connect', function () { c.write(JSON.stringify(first) + '\n'); });
    c.on('data', function (d) {
        var i;
        buf += d;
        while ((i = buf.indexOf('\n')) >= 0) {
            var m = null;
            try { m = JSON.parse(buf.slice(0, i)); } catch (e) { m = null; }
            buf = buf.slice(i + 1);
            if (m) onLine(m, c);
        }
    });
    c.on('error', function (e) { say(SOCK + ': ' + (e.code || e.message)); process.exit(1); });
    return c;
}

if (op === 'hold') {
    var held = false;
    var conn = connect({ op: 'open', name: String(process.argv[3] || ''), uid: Number(process.argv[4]) || 0, take: true }, function (m) {
        if (m.ev !== 'open') return;
        if (!m.ok) { say('no stream: ' + (m.err || 'refused') + (m.holder ? ' (held by ' + m.holder + ')' : '')); process.exit(1); }
        held = true;
        say('stream ' + m.fifo);
        process.stdout.write(m.fifo + '\n');
    });
    conn.on('close', function () { if (held) say('G21 Audio went away'); process.exit(held ? 0 : 1); });
    var end = function () { try { conn.end(JSON.stringify({ op: 'close' }) + '\n'); } catch (e) { /* gone */ } setTimeout(function () { process.exit(0); }, 300); };
    process.on('SIGTERM', end);
    process.on('SIGINT', end);
    setTimeout(function () { if (!held) { say('no answer'); process.exit(1); } }, 4000);
} else if (op === 'status' || op === 'tone' || op === 'probe') {
    connect(op === 'tone' ? { op: 'tone', seconds: Number(process.argv[3]) || 2 } : { op: op }, function (m) {
        process.stdout.write(JSON.stringify(m) + '\n');
        process.exit(m.ok === false ? 1 : 0);
    });
    setTimeout(function () { say('no answer'); process.exit(1); }, op === 'probe' ? 80000 : 20000);
} else {
    process.stderr.write('usage: g21-audio-client.js hold NAME UID | status | tone [SECONDS] | probe\n');
    process.exit(2);
}
