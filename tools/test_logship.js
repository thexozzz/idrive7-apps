'use strict';
// The log sender (native/g21-browser/g21-logship.js) against the real log server (tools/logserver/server.js).
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const ship = require('../native/g21-browser/g21-logship.js');
const server = require('./logserver/server.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(what, fn, ms) { const end = Date.now() + (ms || 5000); for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('timeout: ' + what); await sleep(25); } }
function get(port, p) { return new Promise((resolve, reject) => { http.get({ host: '127.0.0.1', port: port, path: p }, (r) => { let t = ''; r.on('data', (d) => { t += d; }); r.on('end', () => resolve({ code: r.statusCode, text: t })); }).on('error', reject); }); }
function listen(srv) { return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port))); }
// a SOCKS5 server that connects every request to 127.0.0.1:<to> and notes the name it was asked for
function socks(to, asked) {
    return net.createServer((c) => {
        let buf = Buffer.alloc(0), phase = 0, up = null;
        c.on('error', () => {});
        c.on('data', (d) => {
            if (up) { up.write(d); return; }
            buf = Buffer.concat([buf, d]);
            if (phase === 0 && buf.length >= 3) { buf = buf.slice(3); phase = 1; c.write(Buffer.from([5, 0])); }
            if (phase === 1 && buf.length >= 5 && buf.length >= 7 + buf[4]) {
                asked.push(buf.slice(5, 5 + buf[4]).toString() + ':' + buf.readUInt16BE(5 + buf[4]));
                const rest = buf.slice(7 + buf[4]);
                phase = 2;
                up = net.connect(to, '127.0.0.1', () => { c.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0])); if (rest.length) up.write(rest); });
                up.on('data', (x) => c.write(x)); up.on('close', () => c.destroy()); up.on('error', () => c.destroy());
                c.on('close', () => up.destroy());
            }
        });
    });
}

(async () => {
    assert.deepStrictEqual(ship.parseServer('100.89.166.19:12346'), { host: '100.89.166.19', port: 12346 });
    ['', 'x', 'host:0', 'host:70000', 'a b:1', 'http://x:1', 'x:1/y'].forEach((b) => assert.strictEqual(ship.parseServer(b), null, b));
    assert.ok(ship.isTailscale('100.89.166.19') && ship.isTailscale('100.64.0.1') && !ship.isTailscale('100.128.0.1') && !ship.isTailscale('10.0.0.1') && !ship.isTailscale('example.org'));
    assert.strictEqual(ship.safeName('../../etc/passwd'), '__.._etc_passwd');
    assert.ok(!/[\/]/.test(ship.safeName('../a/b')) && !/^\./.test(ship.safeName('..')));
    console.log('ok logship: the server\'s address, Tailscale\'s range, names');

    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'g21logs-'));
    const store = path.join(base, 'store'), a = path.join(base, 'a.log'), b = path.join(base, 'b.log'), stateFile = path.join(base, 'logship.json');
    const said = [];
    let srv = server.create({ dir: store });
    const port = await listen(srv);
    const stored = (n) => { try { return fs.readFileSync(path.join(store, 'car1', n), 'utf8'); } catch (e) { return null; } };
    const make = (extra) => new ship.LogShip(Object.assign({ files: [{ name: 'a.log', file: a }, { name: 'b.log', file: b }, { name: 'none.log', file: path.join(base, 'none.log') }],
        stateFile: stateFile, every: 40, chunk: 1000, first: 3000, car: 'car1', socksFiles: [], log: (t) => said.push(t) }, extra || {}));

    // a file seen for the first time: only its end; then everything new, in chunks
    fs.writeFileSync(a, 'x'.repeat(5000) + 'END-OF-OLD\n');
    fs.writeFileSync(b, 'b1\n');
    let s = make();
    assert.strictEqual(s.status(), 'off');
    s.set('127.0.0.1:' + port);
    await until('the first round', () => stored('b.log') === 'b1\n' && (stored('a.log') || '').endsWith('END-OF-OLD\n'));
    assert.strictEqual(stored('a.log').length, 3000, 'only the last 3000 bytes of a file never sent before');
    assert.ok(/^ok /.test(s.status()), s.status());
    fs.appendFileSync(a, 'line 2\n'); fs.appendFileSync(b, 'y'.repeat(2500) + '\n');
    await until('what was added', () => stored('a.log').endsWith('END-OF-OLD\nline 2\n') && stored('b.log') === 'b1\n' + 'y'.repeat(2500) + '\n');
    assert.strictEqual(stored('none.log'), null, 'a log that is not there is no error');
    console.log('ok logship: a first file from its end, then every added byte once, in chunks');

    // the tool renames its full log to .1 and begins a new one: the rest of the old one first, nothing lost
    s.stop();
    fs.appendFileSync(a, 'last line of the old file\n');
    fs.renameSync(a, a + '.1');
    fs.writeFileSync(a, 'first line of the new file\n');
    s.set('127.0.0.1:' + port);
    await until('after the rename', () => stored('a.log').endsWith('line 2\nlast line of the old file\nfirst line of the new file\n'));
    console.log('ok logship: a log renamed to .1 is sent to its end before the new one');

    // the server away: said once, nothing lost, nothing twice; a new sender (a restart) goes on from the kept place
    await new Promise((r) => srv.close(r));
    fs.appendFileSync(a, 'written while the server was away\n');
    await until('the failure is said', () => /^error: /.test(s.status()));
    await sleep(200);
    assert.strictEqual(said.filter((t) => /^logs: not sent/.test(t)).length, 1, 'said once, not every round: ' + said.join(' | '));
    s.stop();
    srv = server.create({ dir: store });
    await new Promise((r) => srv.listen(port, '127.0.0.1', r));
    s = make();
    s.set('127.0.0.1:' + port);
    await until('after the server came back', () => stored('a.log').endsWith('first line of the new file\nwritten while the server was away\n'));
    await sleep(150);
    assert.strictEqual(stored('a.log').split('written while the server was away').length, 2, 'once');
    assert.strictEqual(stored('b.log'), 'b1\n' + 'y'.repeat(2500) + '\n', 'the other file was not sent again');
    s.stop();
    console.log('ok logship: a server that is away loses nothing; a restart sends nothing twice');

    // a Tailscale address goes through the car's SOCKS5 port, by name; another address directly
    const asked = [];
    const sk = socks(port, asked);
    const skPort = await listen(sk);
    const pf = path.join(base, 'socks5-port');
    fs.writeFileSync(pf, skPort + '\n');
    s = make({ socksFiles: [path.join(base, 'missing'), pf], socksHost: '127.0.0.1' });
    fs.appendFileSync(b, 'through the tunnel\n');
    s.set('100.89.166.19:12346');
    await until('through SOCKS5', () => stored('b.log').endsWith('through the tunnel\n'));
    assert.ok(asked.length >= 1 && asked.every((x) => x === '100.89.166.19:12346'), asked.join(' '));
    s.stop();
    await new Promise((r) => sk.close(r));
    console.log('ok logship: an address in Tailscale\'s range goes out through the SOCKS5 port');

    // the server: the list, a file, its tail; names that are not names; too much in one request
    let r = await get(port, '/');
    assert.ok(r.code === 200 && /\/get\/car1\/a\.log/.test(r.text) && /\/get\/car1\/b\.log/.test(r.text), r.text);
    r = await get(port, '/get/car1/b.log?tail=19');
    assert.strictEqual(r.text, 'through the tunnel\n');
    for (const p of ['/get/car1/..%2f..%2fx', '/get/../x/y', '/get/car1/.hidden', '/get/car1/nothing.log', '/get/car1']) assert.strictEqual((await get(port, p)).code, 404, p);
    const big = await new Promise((resolve) => { const q = http.request({ host: '127.0.0.1', port: port, path: '/put/car1/big.log', method: 'POST' }, (x) => { x.resume(); resolve(x.statusCode); }); q.on('error', () => resolve(0)); q.end(Buffer.alloc(4 * 1024 * 1024 + 1)); });
    assert.ok(big === 413 && stored('big.log') === null, 'too much is refused and not kept: ' + big);
    await new Promise((res) => srv.close(res));
    fs.rmSync(base, { recursive: true, force: true });
    console.log('ok log server: the list, a file and its tail; only plain names; a request over 4 MB refused');
    console.log('test_logship: ok');
    process.exit(0);
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
