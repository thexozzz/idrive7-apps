// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/*
 * g21-logship - the logs of THEiPlay's tools, sent to the owner's own log server (tools/logserver/server.js).
 *
 * Why (owner, 2026-11-21): the car is rarely reachable at the moment somebody wants to read its logs. So the car
 * sends them whenever it has a way out, and they are read on the server later.
 *
 * What is sent: only the files listed in FILES, the logs our own tools write. Nothing of BMW's, no page content;
 * the browser's log does name addresses of pages. Where: one server, "host:port", the owner's rule "logServer" in
 * policy.json. An address in Tailscale's range (100.64.0.0/10) is reached through the SOCKS5 port the car's
 * Tailscale offers (userspace networking: the same way the app's RDP/VNC go out), any other address directly.
 *
 * How: every `every` ms each file is looked at; what was not sent yet goes as POST /put/<car>/<name>?off=<offset>,
 * at most `chunk` bytes a request, and only an answer 200 moves the offset on (kept in `stateFile`, so a restart
 * sends nothing twice). A file seen for the first time is sent from its last `first` bytes. The tools rename a full
 * log to "<file>.1": the rest of the old file is sent from there before the new one from its start. A server that
 * cannot be reached costs one connection attempt a round; nothing is queued in memory.
 */
const fs = require('fs');
const net = require('net');
const os = require('os');

const FILES = [
    { name: 'audiod.log', file: '/var/opt/g21-audio/log/audiod.log' },
    { name: 'browserd.log', file: '/var/opt/g21-browser/log/browserd.log' },
    { name: 'inputd.log', file: '/var/opt/g21-input/log/inputd.log' },
    { name: 'app-start.log', file: '/tmp/g21-airplay-start.log' },
    { name: 'session-input.log', file: '/run/g21-session/input.log' }
];
const SOCKS_FILES = ['/run/g21-session/socks5-port', '/var/opt/iteriodev-tailscale/socks5-port'];
const SOCKS_HOST = '127.0.0.2';

// "host:port" (an IPv4 address or a name) or null
function parseServer(text) {
    const m = /^([A-Za-z0-9.-]{1,100}):(\d{1,5})$/.exec(String(text || '').trim());
    if (!m) return null;
    const port = Number(m[2]);
    return port > 0 && port <= 65535 ? { host: m[1], port: port } : null;
}
function isTailscale(host) {
    const p = String(host).split('.');
    return p.length === 4 && Number(p[0]) === 100 && Number(p[1]) >= 64 && Number(p[1]) <= 127;
}
function socksPort(files) {
    for (const f of files) {
        try { const n = parseInt(String(fs.readFileSync(f, 'utf8')).trim(), 10); if (n > 0 && n <= 65535) return n; } catch (e) { /* the next one */ }
    }
    return 0;
}
function safeName(s) { return String(s || '').replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '_').slice(0, 60) || 'car'; }

// a TCP connection to host:port, through a SOCKS5 server (no authentication, the name passed as it is) when given
function connect(host, port, socks, timeoutMs) {
    return new Promise((resolve, reject) => {
        const s = net.connect(socks ? { host: socks.host, port: socks.port } : { host: host, port: port });
        let buf = Buffer.alloc(0), phase = socks ? 'greet' : 'direct', done = false;
        const end = (e, v) => { if (done) return; done = true; clearTimeout(t); s.removeListener('data', onData); if (e) { s.destroy(); reject(e); } else resolve(v); };
        const t = setTimeout(() => end(new Error('connect timeout')), timeoutMs);
        const onData = (d) => {
            buf = Buffer.concat([buf, d]);
            if (phase === 'greet') {
                if (buf.length < 2) return;
                if (buf[0] !== 5 || buf[1] !== 0) return end(new Error('socks5: refused'));
                buf = buf.slice(2);
                const h = Buffer.from(String(host), 'utf8'), req = Buffer.alloc(7 + h.length);
                req[0] = 5; req[1] = 1; req[2] = 0; req[3] = 3; req[4] = h.length; h.copy(req, 5); req.writeUInt16BE(port, 5 + h.length);
                phase = 'reply';
                s.write(req);
            }
            if (phase === 'reply') {
                if (buf.length < 5) return;
                const need = buf[3] === 1 ? 10 : (buf[3] === 4 ? 22 : (buf[3] === 3 ? 7 + buf[4] : -1));
                if (need < 0) return end(new Error('socks5: bad reply'));
                if (buf.length < need) return;
                if (buf[1] !== 0) return end(new Error('socks5: no way to the server (' + buf[1] + ')'));
                end(null, s);
            }
        };
        s.on('error', (e) => end(e));
        s.on('data', onData);
        s.on('connect', () => { if (socks) s.write(Buffer.from([5, 1, 0])); else end(null, s); });
    });
}

// one POST; resolves with the status code
function post(sock, host, port, urlPath, body, timeoutMs) {
    return new Promise((resolve, reject) => {
        let got = Buffer.alloc(0), done = false;
        const end = (e, v) => { if (done) return; done = true; clearTimeout(t); sock.destroy(); if (e) reject(e); else resolve(v); };
        const t = setTimeout(() => end(new Error('no answer')), timeoutMs);
        const look = () => { const m = /^HTTP\/1\.[01] (\d{3})/.exec(got.slice(0, 20).toString('latin1')); if (m) end(null, Number(m[1])); };
        sock.on('data', (d) => { if (got.length < 64) got = Buffer.concat([got, d]); look(); });
        sock.on('error', (e) => end(e));
        sock.on('close', () => end(new Error('closed without an answer')));
        sock.write('POST ' + urlPath + ' HTTP/1.1\r\nHost: ' + host + ':' + port + '\r\nContent-Type: application/octet-stream\r\nContent-Length: ' + body.length + '\r\nConnection: close\r\n\r\n');
        sock.write(body);
    });
}

function LogShip(o) {
    this.o = Object.assign({ files: FILES, socksFiles: SOCKS_FILES, socksHost: SOCKS_HOST, every: 30000, chunk: 256 * 1024, first: 512 * 1024, timeoutMs: 15000, car: os.hostname(), log: () => {} }, o || {});
    this.car = safeName(this.o.car);
    this.server = null;
    this.state = {};
    this.busy = false;
    this.timer = null;
    this.sent = 0;          // bytes since the start
    this.lastOk = 0;        // when something was last taken by the server (ms), or the server was found with nothing new
    this.err = '';
    try { const j = JSON.parse(fs.readFileSync(this.o.stateFile, 'utf8')); if (j && typeof j === 'object') this.state = j; } catch (e) { /* none yet */ }
}
// the server ("host:port"; '' or something else: nothing is sent)
LogShip.prototype.set = function (server) {
    const s = parseServer(server);
    const was = this.server ? this.server.host + ':' + this.server.port : '';
    this.server = s;
    const now = s ? s.host + ':' + s.port : '';
    if (now !== was) { this.err = ''; this.lastOk = 0; this.o.log(now ? 'logs are sent to ' + now + ' as "' + this.car + '"' : 'logs are not sent'); }
    if (s && !this.timer) { this.timer = setInterval(() => this.round(), this.o.every); if (this.timer.unref) this.timer.unref(); setTimeout(() => this.round(), 50); }
    if (!s && this.timer) { clearInterval(this.timer); this.timer = null; }
};
LogShip.prototype.stop = function () { this.set(''); };
// for the app: '' (off), 'sent HH:MM', or why not
LogShip.prototype.status = function () {
    if (!this.server) return 'off';
    if (this.err) return 'error: ' + this.err;
    return this.lastOk ? 'ok ' + new Date(this.lastOk).toISOString() : 'waiting';
};
LogShip.prototype.save = function () {
    try { const tmp = this.o.stateFile + '.new'; fs.writeFileSync(tmp, JSON.stringify(this.state), { mode: 0o600 }); fs.renameSync(tmp, this.o.stateFile); } catch (e) { /* sent again after a restart, no more */ }
};
LogShip.prototype.put = async function (name, off, body) {
    const sv = this.server;
    const port = isTailscale(sv.host) ? socksPort(this.o.socksFiles) : 0;
    const sock = await connect(sv.host, sv.port, port ? { host: this.o.socksHost, port: port } : null, this.o.timeoutMs);
    const code = await post(sock, sv.host, sv.port, '/put/' + this.car + '/' + safeName(name) + '?off=' + off, body, this.o.timeoutMs);
    if (code !== 200) throw new Error('the server answered ' + code);
    this.sent += body.length;
    this.lastOk = Date.now();
};
function readAt(file, off, len) {
    const fd = fs.openSync(file, 'r');
    try { const b = Buffer.alloc(len); const n = fs.readSync(fd, b, 0, len, off); return b.slice(0, n); } finally { fs.closeSync(fd); }
}
function statOf(file) { try { const s = fs.statSync(file); return s.isFile() ? s : null; } catch (e) { return null; } }
// everything of `file` from `off` on, in chunks; returns the new offset
LogShip.prototype.drain = async function (name, file, off, size) {
    while (off < size && this.server) {
        const b = readAt(file, off, Math.min(this.o.chunk, size - off));
        if (!b.length) break;
        await this.put(name, off, b);
        off += b.length;
    }
    return off;
};
LogShip.prototype.one = async function (f) {
    const s = statOf(f.file);
    if (!s) return;
    let st = this.state[f.name];
    if (!st) st = this.state[f.name] = { ino: s.ino, off: Math.max(0, s.size - this.o.first) };
    if (s.ino !== st.ino || s.size < st.off) {
        // the tool began a new file: what the old one still had is in "<file>.1" (when that is the same file)
        const old = statOf(f.file + '.1');
        if (old && old.ino === st.ino && old.size > st.off) { st.off = await this.drain(f.name, f.file + '.1', st.off, old.size); this.save(); }
        st = this.state[f.name] = { ino: s.ino, off: 0 };
        this.save();
    }
    if (s.size > st.off) { st.off = await this.drain(f.name, f.file, st.off, s.size); this.save(); }
};
LogShip.prototype.round = async function () {
    if (this.busy || !this.server) return;
    this.busy = true;
    const before = this.sent;
    try {
        for (const f of this.o.files) { if (!this.server) break; await this.one(f); }
        if (this.err) this.o.log('logs: the server takes them again');
        this.err = '';
        // (nothing is written to the log about a round that went well: that line would be new log to send, every round, for ever: car, 2026-11-21, 45 bytes every 30 s)
    } catch (e) {
        const why = String(e && e.message || e).slice(0, 80);
        if (why !== this.err) this.o.log('logs: not sent: ' + why);
        this.err = why;
    }
    this.busy = false;
};

module.exports = { LogShip: LogShip, FILES: FILES, parseServer: parseServer, isTailscale: isTailscale, safeName: safeName };
