#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/*
 * THEiPlay's log server: takes the logs the car sends (native/g21-browser/g21-logship.js) and keeps them as files,
 * so they can be read when the car is off. No dependencies; Node 12 or newer.
 *
 *   node server.js [--host ADDRESS] [--port 12346] [--dir ./logs]
 *
 * --host: the address to listen on. Without it: this machine's Tailscale address (100.64.0.0/10) when it has one,
 * otherwise 127.0.0.1. It is never all addresses unless you say --host 0.0.0.0: whoever reaches the port can read
 * and add logs, there is no password. Keep it inside your Tailscale network.
 *
 *   POST /put/<car>/<name>?off=N   the body is added to <dir>/<car>/<name> (at most 4 MB a request)
 *   GET  /                         the files: size, last change
 *   GET  /get/<car>/<name>         a file; ?tail=BYTES for its end only
 *
 * A file that passes 64 MB is renamed to <name>.1 (the one before it is dropped).
 */
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const MAX_BODY = 4 * 1024 * 1024, MAX_FILE = 64 * 1024 * 1024;
const NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,59}$/;

function tailscaleAddress() {
    const all = os.networkInterfaces();
    for (const k of Object.keys(all)) for (const a of all[k]) {
        const p = a.address.split('.');
        if (a.family === 'IPv4' && Number(p[0]) === 100 && Number(p[1]) >= 64 && Number(p[1]) <= 127) return a.address;
    }
    return '';
}
function list(dir) {
    const out = [];
    let cars = [];
    try { cars = fs.readdirSync(dir).filter((c) => NAME.test(c)); } catch (e) { return out; }
    cars.forEach((c) => {
        let names = [];
        try { names = fs.readdirSync(path.join(dir, c)).filter((n) => NAME.test(n)); } catch (e) { return; }
        names.forEach((n) => { try { const s = fs.statSync(path.join(dir, c, n)); if (s.isFile()) out.push({ car: c, name: n, size: s.size, changed: s.mtime.toISOString() }); } catch (e) { /* gone */ } });
    });
    return out.sort((a, b) => (a.changed < b.changed ? 1 : -1));
}
function create(o) {
    const dir = path.resolve(o.dir);
    const say = o.log || (() => {});
    return http.createServer((req, res) => {
        const answer = (code, body, type) => { res.writeHead(code, { 'Content-Type': type || 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(body); };
        let u;
        try { u = new URL(req.url, 'http://x'); } catch (e) { return answer(400, 'bad address\n'); }
        const parts = u.pathname.split('/').filter(Boolean);
        if (req.method === 'GET' && parts.length === 0) {
            const l = list(dir);
            return answer(200, l.length ? l.map((f) => f.changed + '  ' + String(f.size).padStart(10) + '  /get/' + f.car + '/' + f.name).join('\n') + '\n' : 'no logs yet\n');
        }
        if (parts.length !== 3 || !NAME.test(parts[1]) || !NAME.test(parts[2])) return answer(404, 'not found\n');
        const file = path.join(dir, parts[1], parts[2]);
        if (req.method === 'GET' && parts[0] === 'get') {
            let s;
            try { s = fs.statSync(file); } catch (e) { return answer(404, 'no such log\n'); }
            const tail = Number(u.searchParams.get('tail')) || 0;
            const start = tail > 0 && tail < s.size ? s.size - tail : 0;
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
            if (s.size === 0) return res.end();
            return fs.createReadStream(file, { start: start }).on('error', () => res.end()).pipe(res);
        }
        if (req.method === 'POST' && parts[0] === 'put') {
            const chunks = [];
            let n = 0, over = false;
            req.on('data', (d) => { n += d.length; if (n > MAX_BODY) { over = true; chunks.length = 0; } else if (!over) chunks.push(d); });
            req.on('error', () => {});
            req.on('end', () => {
                if (over) return answer(413, 'too much in one request\n');
                try {
                    fs.mkdirSync(path.dirname(file), { recursive: true });
                    try { if (fs.statSync(file).size + n > MAX_FILE) fs.renameSync(file, file + '.1'); } catch (e) { /* new */ }
                    fs.appendFileSync(file, Buffer.concat(chunks));
                    say(new Date().toISOString() + ' ' + parts[1] + '/' + parts[2] + ' +' + n + ' bytes (the car\'s offset ' + (u.searchParams.get('off') || '?') + ')');
                    return answer(200, JSON.stringify({ ok: true, size: fs.statSync(file).size }) + '\n', 'application/json');
                } catch (e) { say('cannot write ' + file + ': ' + e.message); return answer(500, 'cannot write\n'); }
            });
            return undefined;
        }
        return answer(405, 'not allowed\n');
    });
}

if (require.main === module) {
    const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
    const host = arg('host', tailscaleAddress() || '127.0.0.1'), port = Number(arg('port', '12346')), dir = arg('dir', path.join(process.cwd(), 'logs'));
    fs.mkdirSync(dir, { recursive: true });
    const srv = create({ dir: dir, log: (t) => console.log(t) });
    srv.on('error', (e) => { console.error('log server: ' + e.message); process.exit(1); });
    srv.listen(port, host, () => console.log('log server on http://' + host + ':' + port + '/, files in ' + path.resolve(dir)));
}
module.exports = { create: create, list: list, tailscaleAddress: tailscaleAddress };
