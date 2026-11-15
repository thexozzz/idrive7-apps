'use strict';
// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * native/g21-browser: the daemon's own logic, the frame decoder, the engine pack and, where the
 * machine allows it (root, the real engine in native/g21-browser/engine), the whole chain with the
 * real chrome-headless-shell: app socket -> daemon -> engine -> g21-webframe -> video file.
 * A part that cannot run here says SKIP with the reason; nothing is reported as passed untested.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const http = require('http');
const cp = require('child_process');

const tool = path.join(__dirname, '..', 'native', 'g21-browser');
const root0 = path.join(__dirname, '..');
const d = require(path.join(tool, 'g21-browserd.js'));
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAQACADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD8qqKKKAP6qKKKKAP/2Q==', 'base64'); // 32x16: left half black, right half white (4:2:0, quality 90)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let skipped = 0;
function skip(what, why) { skipped += 1; console.log('SKIP ' + what + ': ' + why); }

function testUrls() {
    assert.strictEqual(d.toUrl('wp.pl'), 'https://wp.pl/');
    // Ustawienia > O systemie: every line is a short text, whatever the system lets be read
    (function () {
        const si = d.sysInfo();
        ['cpu', 'mem', 'gpu', 'apps', 'disk', 'tmp', 'os', 'usb'].forEach(function (k) { assert.ok(typeof si[k] === 'string' && si[k].length > 0 && si[k].length <= 120, 'sysinfo ' + k); });
    }());
    // chrome:// addresses: read from the address bar, never taken for a search or a web address
    assert.deepStrictEqual(d.chromeAddr('chrome://version'), { name: 'version', url: 'chrome://version/' });
    assert.deepStrictEqual(d.chromeAddr(' CHROME://GPU/ '), { name: 'gpu', url: 'chrome://gpu/' });
    assert.deepStrictEqual(d.chromeAddr('about:flags'), { name: 'flags', url: 'chrome://flags/' });
    assert.strictEqual(d.chromeAddr('about:blank'), null);
    assert.strictEqual(d.chromeAddr('chrome://x y'), null);
    assert.strictEqual(d.chromeAddr('https://chrome.com'), null);
    (function () {
        const dm = new d.Daemon({ noSetuid: true, testUid: null });
        dm.log = function () {};
        const page = (u) => Buffer.from(String(dm.resolve(u)).split(',')[1], 'base64').toString('utf8');
        ['about', 'version', 'settings', 'flags', 'policy', 'history', 'downloads', 'extensions', 'bookmarks', 'password-manager'].forEach(function (n) {
            const html = page('chrome://' + n);
            assert.ok(html.indexOf('<title>chrome://' + n + '</title>') > 0 && /<body>.{80,}<\/body>/.test(html), 'chrome://' + n + ' has a page');
        });
        assert.ok(page('chrome://about').indexOf('href="#chrome://gpu"') > 0, 'the engine\'s pages are linked');
        assert.strictEqual(dm.resolve('chrome://gpu'), 'chrome://gpu/', 'a page the daemon does not make goes to the engine');
        assert.ok(/chrome:\/\/nosuch/.test(Buffer.from(dm.chromePage('nosuch', true).split(',')[1], 'base64').toString('utf8')));
        assert.strictEqual(dm.resolve('wp.pl'), 'https://wp.pl/');
        assert.strictEqual(dm.resolve('javascript:alert(1)'), null);
    }());
    // "Ostatnio otwierane": the link opens the same page again, a login's secrets are not kept
    assert.strictEqual(d.recentUrl('https://www.youtube.com/watch?v=abc123&t=42s'), 'https://www.youtube.com/watch?v=abc123&t=42s');
    assert.strictEqual(d.recentUrl('https://www.google.com/search?q=bmw+g21#ip=1'), 'https://www.google.com/search?q=bmw+g21#ip=1');
    assert.strictEqual(d.recentUrl('https://user:pw@example.com/cb?code=1&state=2&page=3&access_token=x#access_token=y'), 'https://example.com/cb?page=3');
    assert.strictEqual(d.recentUrl('data:text/html,x'), null);
    assert.ok(Buffer.from(d.startPage([{ url: 'https://www.youtube.com/watch?v=abc123', title: 'Film' }, { url: 'javascript:alert(1)', title: 'x' }]).split(',')[1], 'base64').toString('utf8').indexOf('href="https://www.youtube.com/watch?v=abc123"') > 0);
    assert.strictEqual(d.toUrl(' https://example.com/a?b=1 '), 'https://example.com/a?b=1');
    assert.strictEqual(d.toUrl('example.com:8443/p'), 'https://example.com:8443/p');
    assert.strictEqual(d.toUrl('127.0.0.1:8080/x'), 'http://127.0.0.1:8080/x');
    assert.ok(/^https:\/\/www\.google\.com\/search\?q=pogoda%20krak/.test(d.toUrl('pogoda kraków')));
    assert.ok(/search\?q=/.test(d.toUrl('jak zrobić: pierogi')));
    ['file:///etc/passwd', 'javascript:alert(1)', 'chrome://gpu', 'about:blank', 'data:text/html,x', '', '   '].forEach((u) => assert.strictEqual(d.toUrl(u), null, u));
    [[10, 0, 0, 1], [127, 0, 0, 1], [100, 125, 63, 29], [172, 16, 0, 1], [172, 31, 255, 1], [192, 168, 1, 1], [169, 254, 1, 1], [0, 0, 0, 0], [224, 0, 0, 251], [255, 255, 255, 255]]
        .forEach((p) => assert.strictEqual(d.blockedV4(p), true, p.join('.')));
    [[8, 8, 8, 8], [142, 250, 1, 1], [172, 15, 0, 1], [172, 32, 0, 1], [100, 63, 0, 1], [100, 128, 0, 1], [192, 167, 1, 1]].forEach((p) => assert.strictEqual(d.blockedV4(p), false, p.join('.')));
    const page = Buffer.from(d.startPage([{ url: 'https://pl.wikipedia.org/wiki/BMW', title: 'BMW <b>' }]).split(',')[1], 'base64').toString('utf8');
    assert.ok(page.indexOf('BMW &lt;b&gt;') > 0 && page.indexOf('pl.wikipedia.org/wiki/BMW') > 0 && page.indexOf('Przeglądarka') > 0);
    console.log('ok addresses, local-address filter, start page');
}

// the engine's uid: picked as jap-ridetube-d picks its own, and never one something else holds
function testUid() {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'g21uid-'));
    const mk = (p, text) => { fs.mkdirSync(path.dirname(path.join(base, p)), { recursive: true }); fs.writeFileSync(path.join(base, p), text); };
    mk('mainapp/config/base.json', JSON.stringify({ usableUidsAndGids: { min: 12203, max: 12290 }, usableUidsAndGidsRse: { a: { min: 12291, max: 12299 } }, mainAppUids: [12201] }));
    mk('etc/passwd', 'root:x:0:0::/:/bin/sh\nfoo:x:12300:12300::/:/bin/false\n');
    mk('etc/group', 'tm_oap_app:x:12202:\n');
    mk('opt/mgu-uplink/uids.d/jap-ridetube-d', '12301\n');
    mk('opt/mgu-uplink/uids.d/other', '12302 # a comment\n');
    mk('opt/mgu-updater/state/uids.json', JSON.stringify({ fetch: 12303 }));
    mk('opt/some-tool/state/uids.json', JSON.stringify({ x: 12304 }));
    mk('proc/77/status', 'Name:\tx\nUid:\t12305\t12305\t12305\t12305\nGid:\t12305\t12305\t12305\t12305\n');
    mk('proc/77/comm', 'x\n');
    fs.mkdirSync(path.join(base, 'oap', 'oap_12250'), { recursive: true });
    const logs = [];
    const o = { stateDir: path.join(base, 'opt', 'g21-browser', 'state'), etcDir: path.join(base, 'etc'), oapRoot: path.join(base, 'oap'), toolRoot: path.join(base, 'opt'), procDir: path.join(base, 'proc'),
        mainapps: [{ root: path.join(base, 'mainapp'), hmi: 'HmiMain3D' }], testUid: null, log: (m) => logs.push(m) };
    assert.strictEqual(d.pickEngineUid(o), 12306, 'the lowest uid above MainApp\'s ranges that nothing holds');
    assert.strictEqual(fs.readFileSync(path.join(o.stateDir, 'internet-uids'), 'utf8'), '12306\n', 'for the deploy tool');
    assert.strictEqual(fs.readFileSync(path.join(base, 'opt', 'mgu-uplink', 'uids.d', 'g21-browser'), 'utf8'), '12306\n', 'for mgu-uplink');
    assert.strictEqual(d.pickEngineUid(o), 12306, 'kept on the next start');
    fs.writeFileSync(path.join(base, 'etc', 'passwd'), fs.readFileSync(path.join(base, 'etc', 'passwd'), 'utf8') + 'new:x:12306:12306::/:/bin/false\n');
    assert.strictEqual(d.pickEngineUid(o), 12307, 'taken by someone else meanwhile: another one');
    fs.unlinkSync(path.join(base, 'mainapp', 'config', 'base.json'));
    fs.unlinkSync(path.join(o.stateDir, 'uids.json'));
    assert.strictEqual(d.pickEngineUid(o), null, 'MainApp\'s ranges unknown: no guess');
    fs.rmSync(base, { recursive: true, force: true });
    console.log('ok engine uid: above MainApp\'s ranges, never one in use, written for the uplink, no guess without the ranges');
}

function runFrame(colour, frames) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g21wf-'));
    const ring = path.join(dir, 'ring');
    const input = Buffer.concat(frames.map((f) => { const l = Buffer.alloc(4); l.writeUInt32LE(f.length, 0); return Buffer.concat([l, f]); }));
    const r = cp.spawnSync(path.join(tool, 'g21-webframe'), [ring, colour], { input: input });
    const out = String(r.stdout).trim().split('\n');
    const file = fs.existsSync(ring) ? fs.readFileSync(ring) : null;
    fs.rmSync(dir, { recursive: true, force: true });
    return { out: out, file: file, status: r.status };
}
function testWebframe() {
    const bin = path.join(tool, 'g21-webframe');
    if (!fs.existsSync(bin) || os.platform() !== 'linux' || os.arch() !== 'x64') return skip('g21-webframe', 'needs the Linux x86-64 binary');
    const mean = (b, w, x0, x1, y0, y1, off) => { let s = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += b[off + y * w + x]; n++; } return s / n; };
    ['601', 'full', '709'].forEach((colour) => {
        const r = runFrame(colour, [JPEG, Buffer.from('not a jpeg'), JPEG]);
        assert.strictEqual(r.status, 0);
        assert.ok(/^ring 32 16 \d+$/.test(r.out[0]), r.out[0]);
        assert.ok(/^f 1 \d+$/.test(r.out[1]) && /^e /.test(r.out[2]) && /^f 2 \d+$/.test(r.out[3]), r.out.join(' / '));
        const f = r.file;
        assert.strictEqual(f.readUInt32LE(0), 0x4656474d);
        assert.deepStrictEqual([f.readUInt32LE(4), f.readUInt32LE(8), f.readUInt32LE(12), f.readUInt32LE(16), f.readUInt32LE(20), f.readUInt32LE(24)], [1, 32, 16, 2, 2, 4]);
        assert.strictEqual(f.length, 64 + 4 * 32 * 16 * 3 / 2);
        const off = 64 + 2 * (32 * 16 * 3 / 2);
        const black = mean(f, 32, 0, 12, 0, 16, off), white = mean(f, 32, 20, 32, 0, 16, off);
        if (colour === 'full') assert.ok(black < 3 && white > 252, 'full ' + black + ' ' + white);
        else assert.ok(Math.abs(black - 16) < 3 && Math.abs(white - 235) < 3, colour + ' ' + black + ' ' + white);
        const u = mean(f, 16, 0, 16, 0, 8, off + 32 * 16), v = mean(f, 16, 0, 16, 0, 8, off + 32 * 16 + 16 * 8);
        assert.ok(Math.abs(u - 128) < 3 && Math.abs(v - 128) < 3, 'grey chroma ' + u + ' ' + v);
    });
    console.log('ok g21-webframe: video file layout, three colour forms, a broken frame is skipped');
    return undefined;
}

function localPack() {
    try { const m = d.loadManifest({ engineSrc: path.join(tool, 'engine') }); return d.havePack({ engineSrc: path.join(tool, 'engine') }, m) ? m : null; } catch (e) { return null; }
}
// a zip as Google's: prefix + name, deflated; plus one file the manifest does not name
function writeZip(file, prefix, entries) {
    const zlib = require('zlib');
    const fd = fs.openSync(file, 'w');
    const cds = [];
    let off = 0;
    entries.forEach((e) => {
        const name = Buffer.from(prefix + e.name), comp = zlib.deflateRawSync(e.data, { level: 1 }), crc = zlib.crc32 ? zlib.crc32(e.data) >>> 0 : 0;
        const lh = Buffer.alloc(30);
        lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(e.data.length, 22); lh.writeUInt16LE(name.length, 26);
        fs.writeSync(fd, lh); fs.writeSync(fd, name); fs.writeSync(fd, comp);
        const cd = Buffer.alloc(46);
        cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(8, 10); cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(e.data.length, 24); cd.writeUInt16LE(name.length, 28); cd.writeUInt32LE(off, 42);
        cds.push(cd, name);
        off += 30 + name.length + comp.length;
    });
    const cdb = Buffer.concat(cds), eo = Buffer.alloc(22);
    fs.writeSync(fd, cdb);
    eo.writeUInt32LE(0x06054b50, 0); eo.writeUInt16LE(entries.length, 8); eo.writeUInt16LE(entries.length, 10); eo.writeUInt32LE(cdb.length, 12); eo.writeUInt32LE(off, 16);
    fs.writeSync(fd, eo);
    fs.closeSync(fd);
}
/*
 * The engine for the tests: G21_TEST_ENGINE_ZIP (Google's chrome-headless-shell-linux64.zip, downloaded by hand)
 * or the packed parts build-engine.js left in native/g21-browser/engine. Returns { m, zip } or null.
 */
async function testEngineFiles(base) {
    const repoManifest = d.loadManifest({ engineSrc: path.join(tool, 'engine') });
    assert.ok(d.SOURCE_RE.test(repoManifest.source.url), 'the manifest names Google\'s Chrome for Testing storage');
    assert.ok(repoManifest.source.url.indexOf((/(\d+\.\d+\.\d+\.\d+)/.exec(repoManifest.product) || [])[1]) > 0, 'the address is of the same build as the hashes');
    if (process.env.G21_TEST_ENGINE_ZIP) return { m: repoManifest, zip: process.env.G21_TEST_ENGINE_ZIP };
    const m = localPack();
    if (!m) { skip('engine files', 'no engine here: set G21_TEST_ENGINE_ZIP to Google\'s zip (' + repoManifest.source.url + ') or run native/g21-browser/build-engine.js'); return null; }
    const st = fs.statfsSync(os.tmpdir());
    if (Number(st.bavail) * Number(st.bsize) < 900e6) { skip('engine files', 'under 900 MB free in ' + os.tmpdir()); return null; }
    const o = { engineSrc: path.join(tool, 'engine'), cacheDir: path.join(base, 'pack-cache'), log: () => {} };
    assert.strictEqual(d.engineReady(o, m), false);
    const t0 = Date.now();
    let pct = 0;
    const phases = {};
    const dest = await d.installEngine(o, m, {}, (phase, p) => { phases[phase] = true; if (phase === 'unpacking') { assert.ok(p >= pct); pct = p; } });
    assert.strictEqual(pct, 100);
    assert.deepStrictEqual(Object.keys(phases), ['unpacking'], 'a local pack means no download');
    assert.strictEqual(d.engineReady(o, m), true);
    const bin = fs.readFileSync(path.join(dest, 'chrome-headless-shell'));
    assert.strictEqual(bin.toString('latin1', m.interp.offset, m.interp.offset + m.interp.to.length + 1), m.interp.to + '\0');
    // only the loader path differs from the binary the manifest names
    Buffer.alloc(m.interp.size).copy(bin, m.interp.offset);
    bin.write(m.interp.from, m.interp.offset, 'latin1');
    assert.strictEqual(require('crypto').createHash('sha256').update(bin).digest('hex'), m.binarySha256);
    console.log('ok engine pack: ' + m.product + ', ' + m.files.length + ' files, every SHA-256 matched, unpacked in ' + (Date.now() - t0) + ' ms');
    // the same files as a zip like Google's (the binary as Google ships it), for the download path
    const zip = path.join(base, 'engine.zip');
    writeZip(zip, m.source.prefix, m.files.map((f) => ({ name: f.path, data: f.path === 'chrome-headless-shell' ? bin : fs.readFileSync(path.join(dest, f.path)) })).concat([{ name: 'ABOUT', data: Buffer.from('not in the manifest') }]));
    fs.rmSync(o.cacheDir, { recursive: true, force: true });
    return { m: m, zip: zip };
}
async function testZip(base, eng) {
    // a manifest that names another hash for one file: refused, and nothing is kept
    const mm = JSON.parse(JSON.stringify(eng.m));
    mm.files[mm.files.length - 1].sha256 = '0'.repeat(64);
    const dir = path.join(base, 'zip-bad');
    fs.mkdirSync(dir);
    await assert.rejects(d.fillFromZip(mm, eng.zip, dir, null), /SHA-256/);
    fs.rmSync(dir, { recursive: true, force: true });
    // a link instead of the zip (the download directory belongs to the engine uid): not followed
    const link = path.join(base, 'link.zip');
    let linked = true;
    try { fs.symlinkSync(eng.zip, link); } catch (e) {
        if (e.code !== 'EPERM' || os.platform() !== 'win32') throw e; // Windows without Developer Mode: no symlinks for a plain user
        linked = false; skip('engine zip: link in place of the file', 'this Windows account cannot create symlinks');
    }
    if (linked) {
        fs.mkdirSync(dir);
        await assert.rejects(d.fillFromZip(eng.m, link, dir, null));
        fs.rmSync(dir, { recursive: true, force: true });
    }
    // a cut file
    const cut = path.join(base, 'cut.zip');
    const whole = fs.statSync(eng.zip).size;
    const fd = fs.openSync(eng.zip, 'r'), part = Buffer.alloc(1 << 20);
    fs.readSync(fd, part, 0, part.length, 0);
    fs.closeSync(fd);
    fs.writeFileSync(cut, part);
    fs.mkdirSync(dir);
    await assert.rejects(d.fillFromZip(eng.m, cut, dir, null), /zip/);
    fs.rmSync(dir, { recursive: true, force: true });
    assert.ok(whole > part.length);
    console.log('ok engine zip: another SHA-256, ' + (linked ? 'a link in place of the file ' : '') + 'and a cut download are ' + (linked ? 'all ' : '') + 'refused');
}

function client(sock) {
    const c = net.connect(sock);
    const events = [];
    let buf = '';
    c.setEncoding('utf8');
    c.on('data', (x) => { buf += x; let i; while ((i = buf.indexOf('\n')) >= 0) { events.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); } });
    c.on('error', () => {});
    return {
        send: (o) => c.write(JSON.stringify(o) + '\n'),
        state: () => { for (let i = events.length - 1; i >= 0; i--) if (events[i].ev === 'state') return events[i]; return {}; },
        events: events,
        async until(what, pred, ms) { const end = Date.now() + (ms || 15000); while (Date.now() < end) { if (pred(this.state(), events)) return this.state(); await sleep(40); } throw new Error('timeout: ' + what + ' (state ' + JSON.stringify(this.state()) + ')'); },
        close: () => c.destroy()
    };
}
function socks(port, host, dport) {
    return new Promise((resolve) => {
        const c = net.connect(port, '127.0.0.1');
        let got = Buffer.alloc(0), sent = false;
        c.on('connect', () => c.write(Buffer.from([5, 1, 0])));
        c.on('data', (x) => {
            got = Buffer.concat([got, x]);
            if (!sent && got.length >= 2) { sent = true; got = got.subarray(2); const h = Buffer.from(host, 'latin1'); const p = Buffer.alloc(2); p.writeUInt16BE(dport, 0); c.write(Buffer.concat([Buffer.from([5, 1, 0, 3, h.length]), h, p])); }
            if (sent && got.length >= 2) { resolve(got[1]); c.destroy(); }
        });
        c.on('error', () => resolve(-1));
        setTimeout(() => { resolve(-2); c.destroy(); }, 4000);
    });
}
// state/policy.json: the owner's rules; anything not allowed keeps its default and is named
function testPolicy(base) {
    const file = path.join(base, 'policy-test.json');
    let r = d.readPolicy(file);
    assert.deepStrictEqual(r.policy, { version: 1, sandbox: 'ask', gpu: 'off', picture: 0.75, audio: 'on', homepage: '', autoplay: 'allow', fullscreen: 'screen', carData: 'apps', memoryLimitMb: 900, network: { blockPrivate: true, allow: [] } }, 'no file: the defaults');
    assert.deepStrictEqual([r.problems, r.file], [[], false]);
    fs.writeFileSync(file, JSON.stringify({ sandbox: 'required', gpu: 'off', picture: 0.5, audio: 'off', memoryLimitMb: 1200, network: { blockPrivate: true, allow: ['127.0.0.1:1235', '192.168.0.10:*'] } }));
    r = d.readPolicy(file);
    assert.deepStrictEqual(r.policy, { version: 1, sandbox: 'required', gpu: 'off', picture: 0.5, audio: 'off', homepage: '', autoplay: 'allow', fullscreen: 'screen', carData: 'apps', memoryLimitMb: 1200, network: { blockPrivate: true, allow: ['127.0.0.1:1235', '192.168.0.10:*'] } });
    assert.deepStrictEqual(r.problems, []);
    fs.writeFileSync(file, JSON.stringify({ sandbox: 'never', gpu: 'car', picture: 0.9, audio: 'loud', memoryLimitMb: 5, root: true, network: { blockPrivate: 'no', allow: ['example.com:80', '1.2.3.4', '300.1.1.1:5', '10.0.0.1:0', '10.0.0.2:443'] } }));
    r = d.readPolicy(file);
    assert.deepStrictEqual(r.policy, { version: 1, sandbox: 'ask', gpu: 'off', picture: 0.75, audio: 'on', homepage: '', autoplay: 'allow', fullscreen: 'screen', carData: 'apps', memoryLimitMb: 900, network: { blockPrivate: true, allow: ['10.0.0.2:443'] } }, 'values that are not allowed keep the defaults');
    assert.strictEqual(r.problems.length, 11, r.problems.join(' | '));
    fs.writeFileSync(file, '{ sandbox: off }');
    r = d.readPolicy(file);
    assert.deepStrictEqual([r.policy.sandbox, r.problems.length], ['ask', 1], 'a file that is not JSON changes nothing');
    fs.unlinkSync(file);
    // the engine never opens a sound device of the head unit (its "default" is the hands-free telephone's)
    const flags = d.Daemon.prototype.engineArgs.call({ zoom: 1.5, want: { w: 1796, h: 548 }, proxyPort: 1, opts: { stateDir: path.join(base, 'none') }, picture: () => 0.75 }, { profile: '/p', major: '153' }, 'about:blank', true);
    assert.ok(flags.indexOf('--disable-audio-output') >= 0 && flags.indexOf('--mute-audio') >= 0 && flags.indexOf('--no-sandbox') < 0 && flags.indexOf('--alsa-output-device=g21out') < 0, 'without G21 Audio: no sound device');
    const flagsSound = d.Daemon.prototype.engineArgs.call({ zoom: 1.5, want: { w: 1796, h: 548 }, proxyPort: 1, opts: { stateDir: path.join(base, 'none') }, picture: () => 0.75, audio: { fifo: '/x' } }, { profile: '/p', major: '153' }, 'about:blank', true);
    assert.ok(flagsSound.indexOf('--alsa-output-device=g21out') >= 0 && flagsSound.indexOf('--disable-audio-output') < 0 && flagsSound.indexOf('--mute-audio') < 0, 'with G21 Audio: the engine plays into its own ALSA device');
    console.log('ok policy: defaults without a file, the owner\'s values taken, values not allowed keep their default and are named');
}
async function testProxy(port) {
    const child = cp.spawn(process.execPath, [path.join(tool, 'g21-browserd.js'), '--proxy', '/nonexistent/lease.json'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (x) => { out += x; });
    for (let i = 0; i < 100 && !/port \d+/.test(out); i++) await sleep(30);
    const pp = Number((/port (\d+)/.exec(out) || [0, 0])[1]);
    assert.ok(pp > 0, 'proxy port');
    assert.strictEqual(await socks(pp, '127.0.0.1', port), 2, 'loopback literal must be refused');
    assert.strictEqual(await socks(pp, 'localhost', port), 2, 'a name that resolves to loopback must be refused');
    assert.strictEqual(await socks(pp, '192.168.1.1', 80), 2);
    assert.strictEqual(await socks(pp, '100.125.63.29', 22), 2);
    child.stdin.end();
    for (let i = 0; i < 50 && child.exitCode === null; i++) await sleep(30);
    assert.strictEqual(child.exitCode, 0, 'the proxy ends when the daemon goes away');
    // the policy's exceptions: this address and port only
    const c2 = cp.spawn(process.execPath, [path.join(tool, 'g21-browserd.js'), '--proxy', '/nonexistent/lease.json', '--allow=127.0.0.1:' + port + ',10.9.8.7:*'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out2 = '';
    c2.stdout.on('data', (x) => { out2 += x; });
    for (let i = 0; i < 100 && !/port \d+/.test(out2); i++) await sleep(30);
    const p2 = Number((/port (\d+)/.exec(out2) || [0, 0])[1]);
    assert.strictEqual(await socks(p2, '127.0.0.1', port), 0, 'the excepted address and port connect');
    assert.strictEqual(await socks(p2, '127.0.0.1', port + 1 > 65535 ? port - 1 : port + 1), 2, 'another port of it is refused');
    assert.strictEqual(await socks(p2, '192.168.1.1', 80), 2, 'other private addresses stay refused');
    c2.stdin.end();
    console.log('ok proxy: loopback, private and Tailscale addresses are refused; a policy exception lets one address and port through; it ends with the daemon');
}

const PAGE = '<!doctype html><html><head><meta charset="utf-8"><title>Strona testowa</title><style>body{margin:0;font:20px sans-serif;background:#fff}#b{position:absolute;left:40px;top:40px;width:200px;height:80px}#i{position:absolute;left:300px;top:40px;width:300px;height:60px;font-size:24px}#a{position:absolute;left:40px;top:160px;font-size:30px}#n{position:absolute;left:300px;top:160px;font-size:30px}.sp{height:3000px}</style></head>'
    + '<body><button id="b" onclick="document.title=\'klik \'+(++n)">przycisk</button><form onsubmit="document.title=\'wyslano \'+document.getElementById(\'i\').value;return false"><input id="i" type="search" oninput="document.title=\'pole \'+this.value"></form>'
    + '<a id="a" href="/two">druga</a><a id="n" href="/three" target="_blank">nowe okno</a><script>var n=0;addEventListener("scroll",function(){document.title="scroll "+(scrollY>0)})</script><div class="sp"></div></body></html>';

async function testChain(base, eng) {
    if (os.platform() !== 'linux' || os.arch() !== 'x64') return skip('real engine', 'needs Linux x86-64');
    if (!eng) return skip('real engine', 'no engine files');
    const m = eng.m;
    const root = typeof process.getuid === 'function' && process.getuid() === 0;
    try { fs.mkdirSync(path.dirname(m.interp.to), { recursive: true }); fs.accessSync(path.dirname(m.interp.to), fs.constants.W_OK); } catch (e) { return skip('real engine', 'cannot write ' + path.dirname(m.interp.to) + ' (the loader link); run as root'); }
    // the tool as the head unit has it: the manifest, no packed parts
    const src = path.join(base, 'engine-src');
    fs.mkdirSync(src);
    fs.copyFileSync(path.join(tool, 'engine', 'manifest.json'), path.join(src, 'manifest.json'));
    fs.chmodSync(eng.zip, 0o644);
    process.env.G21_BROWSER_ENGINE = src;
    process.env.G21_BROWSER_ROOT = base;
    process.env.G21_BROWSER_RUN = path.join(base, 'run');
    fs.mkdirSync(path.join(base, 'shm'));
    fs.chmodSync(path.join(base, 'shm'), 0o1777); // as /dev/shm: the frame decoder is not root
    process.env.G21_BROWSER_RING = path.join(base, 'shm', 'mgu-video-g21browser');
    process.env.G21_BROWSER_ALLOW_LOCAL = '1';
    process.env.G21_BROWSER_PICTURE = '1'; // this chain: picture pixels = screen pixels (the 75% picture is the sandbox part below)
    if (root) process.env.G21_BROWSER_UID = '65534'; else process.env.G21_BROWSER_NOSETUID = '1';
    const srv = http.createServer((q, s) => {
        s.setHeader('content-type', 'text/html; charset=utf-8');
        if (q.url === '/two') s.end('<!doctype html><title>Druga</title><h1>druga strona</h1>');
        else if (q.url === '/three') s.end('<!doctype html><title>Trzecia</title><h1>z nowego okna</h1>');
        else if (q.url === '/snd') s.end('<!doctype html><title>Dzwiek</title><body style="margin:0"><div id="b" style="width:300px;height:150px;background:#c60"></div><script>document.getElementById("b").addEventListener("click",function(){'
            + 'var c=new AudioContext();var o=c.createOscillator();var g=c.createGain();g.gain.value=0.05;o.connect(g);g.connect(c.destination);o.start();setTimeout(function(){document.title="snd "+c.sampleRate+" "+c.state},400)})</script>');
        else if (q.url === '/fs') s.end('<!doctype html><title>Pelny</title><body style="margin:0"><div id="v" style="width:300px;height:150px;background:#06c"></div><script>var v=document.getElementById("v");'
            + 'v.addEventListener("click",function(){v.requestFullscreen().then(function(){setTimeout(function(){document.title="fs "+innerWidth+"x"+innerHeight+" "+screen.width+"x"+screen.height+" "+v.clientWidth+"x"+v.clientHeight},300)},function(e){document.title="fs failed "+e})})</script>');
        else if (q.url === '/engine.zip') { s.setHeader('content-type', 'application/zip'); s.setHeader('content-length', fs.statSync(eng.zip).size); fs.createReadStream(eng.zip).pipe(s); }
        else s.end(PAGE);
    });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const port = srv.address().port, site = 'http://127.0.0.1:' + port;
    process.env.G21_BROWSER_SOURCE = site + '/engine.zip';
    await testProxy(port);
    const daemon = new d.Daemon({ idleMs: 400, pollMs: 120 });
    const logFile = path.join(base, 'log', 'browserd.log');
    let c = null;
    try {
        await daemon.start();
        for (let i = 0; i < 100 && !fs.existsSync(daemon.opts.sock); i++) await sleep(20);
        c = client(daemon.opts.sock);
        const t0 = Date.now();
        c.send({ op: 'open', w: 1920, h: 636, zoom: 1.5 });
        let s = await c.until('engine ready with a picture', (x) => x.engine === 'ready' && x.live && x.w === 1920 && x.h === 636, 120000);
        const seenPhases = c.events.filter((e) => e.ev === 'state').map((e) => e.engine).filter((e, i, a) => a.indexOf(e) === i);
        ['downloading', 'unpacking', 'starting', 'ready'].forEach((p) => assert.ok(seenPhases.indexOf(p) >= 0, 'phase ' + p + ' in ' + seenPhases.join(',')));
        assert.strictEqual(fs.existsSync(path.join(base, 'cache', 'download')), false, 'the downloaded zip is removed');
        assert.strictEqual(s.title, 'Strona startowa');
        assert.strictEqual(s.url, '');
        assert.strictEqual(s.zoom, 1.5);
        const ring = () => { const f = fs.readFileSync(daemon.opts.ring); return { w: f.readUInt32LE(8), h: f.readUInt32LE(12), seq: f.readUInt32LE(16), ino: fs.statSync(daemon.opts.ring).ino, size: f.length }; };
        let r = ring();
        assert.deepStrictEqual([r.w, r.h, r.size], [1920, 636, 64 + 4 * 1920 * 636 * 3 / 2]);
        assert.strictEqual(r.ino, s.ino);
        console.log('ok engine: downloaded as the engine uid, checked, unpacked; start page shown ' + (Date.now() - t0) + ' ms after "open", video file 1920x636');
        // the engine and its helpers are not root
        if (root) {
            const pids = daemon.engineProcs();
            assert.ok(pids.length >= 3, 'engine processes');
            pids.forEach((pid) => assert.ok(/Uid:\s+65534\s/.test(fs.readFileSync('/proc/' + pid + '/status', 'utf8')), 'engine pid ' + pid + ' uid'));
            // mgu-renderd draws a video file only when it is the app's or root's: the decoder (engine uid) made it, root took it over
            const ringSt = fs.statSync(daemon.opts.ring);
            assert.strictEqual(ringSt.uid, 0, 'the video file belongs to root');
            assert.strictEqual(ringSt.mode & 0o777, 0o644);
            // (that the decoder still writes it through its descriptor: the scroll part below waits for new frames in this file)
            [daemon.proxy.pid, daemon.frame.pid].forEach((pid) => assert.ok(/Uid:\s+65534\s/.test(fs.readFileSync('/proc/' + pid + '/status', 'utf8')), 'helper uid'));
            // no library of this machine: only the tool's own
            const foreign = {};
            pids.forEach((pid) => fs.readFileSync('/proc/' + pid + '/maps', 'utf8').split('\n').forEach((l) => { const f = l.split(/\s+/)[5]; if (f && /\.so(\.|$)/.test(f) && f.indexOf(tool) !== 0 && f.indexOf(base) !== 0) foreign[f] = 1; }));
            // (libX11-xcb is not libX11: the engine opens it by name when the machine has it, the tool does not carry it)
            const must = Object.keys(foreign).filter((f) => /\/(libc|libm|libglib|libnss3|libnspr4|libX11|libdbus|ld-linux)[.-]/.test(f) && !/\/libX11-xcb\./.test(f));
            assert.deepStrictEqual(must, [], 'engine loaded system libraries');
            console.log('ok engine: runs as uid 65534 with the tool\'s own loader and libraries' + (Object.keys(foreign).length ? ' (optional, opened by name: ' + Object.keys(foreign).map((f) => path.basename(f)).join(', ') + ')' : ''));
        }
        c.send({ op: 'nav', url: '127.0.0.1:' + port + '/' });
        s = await c.until('test page', (x) => x.title === 'Strona testowa' && !x.loading);
        assert.strictEqual(s.url, site + '/');
        assert.strictEqual(s.back, true);
        // rules set from THEiPlay's menu: three of them, never "sandbox": "off"; written to the rules file
        const polFile = path.join(base, 'state', 'policy.json');
        assert.deepStrictEqual(s.pol, { sandbox: 'ask', picture: 0.75, memoryLimitMb: 900, audio: 'on', sound: 'none', homepage: '', autoplay: 'allow', fullscreen: 'screen', carData: 'apps' }, 'the state carries the rules (no G21 Audio here: no sound)');
        c.send({ op: 'policy', key: 'memoryLimitMb', value: 1200 });
        await c.until('memory limit set', (x) => x.pol && x.pol.memoryLimitMb === 1200);
        assert.strictEqual(JSON.parse(fs.readFileSync(polFile, 'utf8')).memoryLimitMb, 1200);
        assert.strictEqual(fs.statSync(polFile).mode & 0o777, 0o600);
        c.send({ op: 'policy', key: 'sandbox', value: 'off' });
        c.send({ op: 'policy', key: 'network', value: { blockPrivate: false } });
        c.send({ op: 'policy', key: 'picture', value: 0.9 });
        c.send({ op: 'policy', key: 'sandbox', value: 'required' });
        await c.until('sandbox required', (x) => x.pol && x.pol.sandbox === 'required');
        const pf = JSON.parse(fs.readFileSync(polFile, 'utf8'));
        assert.deepStrictEqual([pf.sandbox, pf.picture, pf.network], ['required', 0.75, { blockPrivate: true, allow: [] }], 'what the app may not set stayed');
        c.send({ op: 'policy', key: 'sandbox', value: 'ask' });
        c.send({ op: 'policy', key: 'memoryLimitMb', value: 900 });
        await c.until('rules back', (x) => x.pol && x.pol.sandbox === 'ask' && x.pol.memoryLimitMb === 900);
        assert.ok(/policy: "sandbox" from the app refused/.test(fs.readFileSync(logFile, 'utf8')) && /policy: "network" from the app refused/.test(fs.readFileSync(logFile, 'utf8')));
        console.log('ok policy from the menu: picture, memory limit and sandbox ask/required are set and written; "off" and network rules are refused');
        const tap = (x, y) => { c.send({ op: 'touch', p: 1, x: x * 1.5, y: y * 1.5 }); c.send({ op: 'touch', p: 3, x: x * 1.5, y: y * 1.5 }); };
        const seq0 = ring().seq;
        tap(140, 80);
        await c.until('tap on the button', (x) => x.title === 'klik 1');
        tap(140, 80);
        await c.until('second tap', (x) => x.title === 'klik 2');
        console.log('ok touch: a tap in screen pixels lands on the page element (zoom 1.5)');
        const before = c.events.length;
        tap(450, 70);
        await c.until('edit event', (x, ev) => ev.slice(before).some((e) => e.ev === 'edit'));
        const ed = c.events.slice(before).filter((e) => e.ev === 'edit')[0];
        assert.strictEqual(ed.kind, 'search');
        assert.strictEqual(ed.submit, true);
        assert.strictEqual(c.state().editable, true);
        c.send({ op: 'text', s: 'zażółć', replace: true });
        await c.until('typed text', (x) => x.title === 'pole zażółć');
        c.send({ op: 'text', s: 'gęślą', replace: true, enter: true });
        await c.until('replace + Enter', (x) => x.title === 'wyslano gęślą');
        console.log('ok keyboard: a tap in a text field asks the app for its keyboard; text replaces the field, Enter submits');
        c.send({ op: 'scroll', dx: 0, dy: 300 });
        await c.until('wheel scroll', (x) => x.title === 'scroll true');
        c.send({ op: 'touch', p: 1, x: 900, y: 500 });
        for (let i = 1; i <= 8; i++) { c.send({ op: 'touch', p: 2, x: 900, y: 500 - i * 30 }); await sleep(16); }
        c.send({ op: 'touch', p: 3, x: 900, y: 260 });
        await sleep(1500); // (the page glides on after the finger lifts)
        assert.ok(ring().seq > seq0 + 3, 'frames while the page moved');
        console.log('ok scroll: knob (wheel) and finger drag move the page, new frames reach the video file');
        c.send({ op: 'scroll', dx: 0, dy: -9000 });
        await c.until('back at the top', (x) => x.title === 'scroll false');
        tap(80, 178);
        s = await c.until('link', (x) => x.title === 'Druga' && !x.loading);
        assert.strictEqual(s.url, site + '/two');
        c.send({ op: 'back' });
        s = await c.until('back', (x) => x.url === site + '/' && !x.loading && x.fwd === true);
        c.send({ op: 'fwd' });
        await c.until('forward', (x) => x.url === site + '/two' && !x.loading);
        c.send({ op: 'back' });
        await c.until('back again', (x) => x.url === site + '/' && !x.loading);
        tap(380, 178);
        await c.until('new window opens in the page', (x) => x.url === site + '/three' && x.title === 'Trzecia');
        console.log('ok navigation: link, back, forward, target=_blank opens in the same page');
        c.send({ op: 'nav', url: 'file:///etc/passwd' });
        await c.until('refused address', (x) => x.err === 'zły adres');
        assert.strictEqual(c.state().url, site + '/three');
        c.send({ op: 'zoom', z: 2 });
        s = await c.until('zoom 2', (x) => x.zoom === 2 && x.engine === 'ready' && x.live && x.url === site + '/three', 30000);
        assert.deepStrictEqual([s.w, s.h], [1920, 636]);
        assert.strictEqual(JSON.parse(fs.readFileSync(path.join(base, 'state', 'settings.json'), 'utf8')).zoom, 2);
        console.log('ok zoom: the engine restarts on the same page, the picture stays 1920x636');
        const rec = JSON.parse(fs.readFileSync(path.join(base, 'state', 'recent.json'), 'utf8'));
        assert.ok(rec.some((x) => x.url === site + '/two'));
        // the app goes away: the engine follows after idleMs, the video file goes
        c.close();
        for (let i = 0; i < 100 && (daemon.engine || fs.existsSync(daemon.opts.ring)); i++) await sleep(50);
        assert.strictEqual(daemon.engine, null);
        assert.strictEqual(fs.existsSync(daemon.opts.ring), false);
        assert.deepStrictEqual(daemon.engineProcs(), []);
        console.log('ok idle: without the app the engine stops and its processes and video file are gone');
        // memory guard
        fs.writeFileSync(path.join(base, 'state', 'mem-limit-mb'), '1\n');
        c = client(daemon.opts.sock);
        c.send({ op: 'open', w: 1920, h: 636 });
        await c.until('engine up again', (x) => x.engine === 'ready', 30000);
        daemon.checkMemory();
        s = await c.until('memory guard', (x) => x.engine === 'failed');
        assert.strictEqual(s.err, 'strona zużyła za dużo pamięci');
        fs.unlinkSync(path.join(base, 'state', 'mem-limit-mb'));
        c.send({ op: 'reload' });
        await c.until('reload starts the engine again', (x) => x.engine === 'ready' && x.live, 30000);
        console.log('ok memory guard: an engine over the limit is stopped, "odśwież" starts it again');
        const log = fs.readFileSync(logFile, 'utf8');
        assert.ok(!/\/two|\/three|zażółć|gęślą/.test(log), 'the log must not hold paths or typed text');
    } catch (e) {
        try { console.log('--- daemon log ---\n' + fs.readFileSync(logFile, 'utf8').split('\n').slice(-25).join('\n')); } catch (x) { /* none */ }
        throw e;
    } finally {
        if (c) c.close();
        await daemon.close();
        if (!root) srv.close(); // (as root the sandbox part below still needs the test site)
    }
    assert.deepStrictEqual(daemon.engineProcs(), []);
    if (root) {
        // an engine that will not start with its sandbox (here: as root) does not start without it on the tool's
        // own decision: the state asks, and only the owner's answer ("sandbox-off") starts it and is remembered
        const d2 = new d.Daemon({ testUid: null, noSetuid: true, forceSandbox: true, picture: 0.75 });
        const sandboxFile = path.join(base, 'state', 'sandbox');
        let c2 = null;
        try {
            fs.mkdirSync(path.dirname(sandboxFile), { recursive: true }); fs.writeFileSync(sandboxFile, 'off\n'); // what 0.1.2 left on the car
            await d2.start();
            assert.strictEqual(fs.existsSync(sandboxFile), false, 'an answer kept by 0.1.2 is dropped');
            for (let i = 0; i < 100 && !fs.existsSync(d2.opts.sock); i++) await sleep(20);
            c2 = client(d2.opts.sock);
            c2.send({ op: 'open', w: 1796, h: 548, zoom: 1.5 });
            await c2.until('the daemon asks about the sandbox', (x) => x.engine === 'failed' && x.ask === 'sandbox', 60000);
            assert.strictEqual(fs.existsSync(sandboxFile), false, 'nothing is switched off before the answer');
            assert.deepStrictEqual(d2.engineProcs(), []);
            // "odśwież" tries with the sandbox again and asks again (counted in the log: the states can pass faster than a wait is set up)
            const asked = () => (fs.readFileSync(logFile, 'utf8').match(/did not start with its sandbox/g) || []).length;
            const before = asked();
            assert.ok(before >= 1);
            c2.send({ op: 'reload' });
            for (let i = 0; i < 600 && asked() === before; i++) await sleep(100);
            assert.strictEqual(asked(), before + 1, 'one more start with the sandbox');
            await c2.until('and asks again', (x) => x.engine === 'failed' && x.ask === 'sandbox', 60000);
            assert.strictEqual(fs.existsSync(sandboxFile), false);
            c2.send({ op: 'sandbox-off' });
            const s2 = await c2.until('engine up without its sandbox', (x) => x.engine === 'ready' && x.live, 60000);
            // the car's page area 1796x548 at zoom 1.5, rendered at 75%: on the screen 1776x528, the video file 1332x396
            assert.deepStrictEqual([s2.w, s2.h], [1776, 528]);
            const head2 = fs.readFileSync(d2.opts.ring).subarray(0, 16);
            assert.deepStrictEqual([head2.readUInt32LE(8), head2.readUInt32LE(12)], [1332, 396], 'the picture: width % 4, even height, 56% of the pixels');
            assert.deepStrictEqual([1, 1.25, 1.5, 1.75, 2].map((z) => { const p = d.pageCss(1796, 548, z); return [1, 0.75, 0.5].every((q) => { const r = d.pageCss(1796, 548, z, q); return Number.isInteger(r.pw) && r.pw % 4 === 0 && Number.isInteger(r.ph) && r.ph % 2 === 0 && r.dw <= 1796 && r.dh <= 548 && r.dw > 1700 && r.dh > 500; }) && p.w > 0; }), [true, true, true, true, true]);
            assert.strictEqual(s2.ask, '');
            // a player that goes full screen fills the page area and the picture keeps its size (the car's page area, zoom 1.5)
            c2.send({ op: 'nav', url: site + '/fs' });
            await c2.until('the full screen page', (x) => x.title === 'Pelny' && !x.loading && x.live, 30000);
            const ino2 = c2.state().ino;
            c2.send({ op: 'touch', p: 1, x: 150, y: 100 }); c2.send({ op: 'touch', p: 3, x: 150, y: 100 });
            const fsState = await c2.until('full screen', (x) => /^fs /.test(x.title), 20000);
            assert.strictEqual(fsState.title, 'fs 1184x352 1184x352 1184x352', 'the element fills the window, the screen is the window');
            await sleep(1500);
            // (while it changes over, the engine may send a picture of another size: the daemon removes root's file and the decoder
            // makes a new one, so the file may be another; what counts is that the picture goes on, at its size)
            const fsNow = await c2.until('the picture goes on in full screen', (x) => x.live && x.ino > 0, 20000);
            assert.deepStrictEqual([fsNow.w, fsNow.h], [1776, 528]);
            const head3 = () => { const b = fs.readFileSync(d2.opts.ring).subarray(0, 24); return { w: b.readUInt32LE(8), h: b.readUInt32LE(12), seq: b.readUInt32LE(16) }; };
            // in full screen the engine renders one picture pixel per CSS pixel (1184x352 here, not 1332x396): the renderer
            // scales it to the same place on the screen, and a film costs the car's CPU less
            assert.deepStrictEqual([head3().w, head3().h], [1184, 352], 'the video file has the full screen picture\'s size: width % 4, even height');
            assert.strictEqual(fs.statSync(d2.opts.ring).ino, fsNow.ino, 'the app is told the file that is there');
            const seq3 = head3().seq;
            c2.send({ op: 'touch', p: 1, x: 900, y: 300 }); c2.send({ op: 'touch', p: 3, x: 900, y: 300 });
            c2.send({ op: 'scroll', dx: 0, dy: 120 });
            await sleep(1500);
            assert.ok((fs.readFileSync(logFile, 'utf8').match(/video file: /g) || []).length <= 3, 'no stream of video file errors');
            void ino2; void seq3;
            console.log('ok full screen: an element that goes full screen fills the page area; the picture goes on at the same place on the screen');
            assert.strictEqual(fs.existsSync(sandboxFile), false, 'the answer is not kept on disk');
            assert.ok(/sandbox off: allowed by the owner/.test(fs.readFileSync(logFile, 'utf8')));
            // the answer holds for this opening only: closed and opened again, the daemon asks again
            c2.send({ op: 'close' });
            await c2.until('engine off', (x) => x.engine === 'off', 20000);
            c2.send({ op: 'open', w: 1796, h: 548, zoom: 1.5 });
            await c2.until('the next opening asks again', (x) => x.engine === 'failed' && x.ask === 'sandbox', 60000);
            assert.deepStrictEqual(d2.engineProcs(), []);
            console.log('ok sandbox: an engine that cannot start with it asks the owner; "sandbox-off" starts it without for this opening only, nothing kept on disk');
        } finally {
            if (c2) c2.close();
            await d2.close();
        }
        // The head unit's kernel has no user namespaces. Without them the engine has its sandbox through Chromium's setuid
        // helper, which the daemon puts beside the engine (root, 4755); nobody is asked.
        const nsFile = '/proc/sys/user/max_user_namespaces';
        let nsWas = null;
        try { nsWas = fs.readFileSync(nsFile, 'utf8').trim(); fs.writeFileSync(nsFile, '0'); } catch (e) { nsWas = null; }
        if (nsWas === null) skip('setuid sandbox', 'user namespaces cannot be switched off here');
        else {
            const d3 = new d.Daemon({ idleMs: 400, pollMs: 120 });
            let c3 = null;
            try {
                const mark = fs.readFileSync(logFile, 'utf8').length;
                await d3.start();
                for (let i = 0; i < 100 && !fs.existsSync(d3.opts.sock); i++) await sleep(20);
                c3 = client(d3.opts.sock);
                c3.send({ op: 'open', w: 1796, h: 548, zoom: 1.5 });
                const s3 = await c3.until('engine up in the setuid sandbox', (x) => (x.engine === 'ready' && x.live) || x.engine === 'failed', 60000);
                const log3 = fs.readFileSync(logFile, 'utf8').slice(mark);
                assert.strictEqual(s3.engine, 'ready', 'without user namespaces the engine still starts: ' + s3.err + '\n' + log3.split('\n').slice(-6).join('\n'));
                assert.strictEqual(s3.ask, '', 'nobody is asked');
                assert.ok(/engine up: .*sandbox \(setuid helper/.test(log3) && !/no sandbox|sandbox off/.test(log3), log3.split('\n').slice(-4).join('\n'));
                const helper = path.join(d.engineDir(d3.opts, d.loadManifest(d3.opts)), 'chrome-sandbox');
                const hs = fs.statSync(helper);
                assert.deepStrictEqual([hs.uid, hs.gid, hs.mode & 0o7777], [0, 0, 0o4755], 'the helper is root\'s, setuid');
                const pids3 = d3.engineProcs();
                assert.ok(pids3.length >= 3);
                pids3.forEach((pid) => assert.ok(fs.readFileSync('/proc/' + pid + '/cmdline', 'utf8').indexOf('--no-sandbox') < 0, 'no --no-sandbox'));
                // a page process is in its own PID namespace (two numbers in NSpid) and under a seccomp filter
                const st3 = pids3.map((pid) => fs.readFileSync('/proc/' + pid + '/status', 'utf8'));
                assert.ok(st3.some((t) => /NSpid:\s+\d+\s+\d+/.test(t)), 'a process in a PID namespace');
                assert.ok(st3.some((t) => /Seccomp:\s+2/.test(t)), 'a process under seccomp');
                console.log('ok setuid sandbox: without user namespaces the engine runs in Chromium\'s sandbox through the helper (root, 4755): PID namespace, seccomp, nobody asked');
            } finally {
                if (c3) c3.close();
                await d3.close();
                try { fs.writeFileSync(nsFile, nsWas); } catch (e) { /* the VM goes away */ }
            }
        }
        // The engine's sound: through its own ALSA file device into G21 Audio's FIFO, read in real time by g21-audio-out.
        // Here G21 Audio runs with a speakers.js that only writes down what it is asked, and ALSA's null device.
        const audioDir = path.join(root0, 'native', 'g21-audio');
        const outBin = path.join(audioDir, 'g21-audio-out');
        const canRun = fs.existsSync(outBin) && cp.spawnSync(outBin, [], { encoding: 'utf8' }).status === 2;
        if (!canRun) skip('engine sound', 'g21-audio-out does not run here (it is built for the head unit\'s loader, /lib/ld-linux-x86-64.so.2)');
        else {
            const arun = path.join(base, 'audio-run'), flog = path.join(base, 'speakers.log');
            fs.mkdirSync(arun); fs.chmodSync(arun, 0o755); fs.writeFileSync(flog, ''); fs.chmodSync(flog, 0o666);
            const audiod = cp.spawn(process.execPath, [path.join(audioDir, 'g21-audiod.js')], { stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, {
                G21_AUDIO_RUN: arun, G21_AUDIO_ROOT: path.join(base, 'audio'), G21_AUDIO_SPEAKERS: path.join(root0, 'tools', 'fake_speakers.js'), G21_AUDIO_DEVICE: 'null', G21_AUDIO_GID: '65534', G21_FAKE_SPEAKERS_LOG: flog }) });
            let alog = '';
            audiod.stdout.on('data', (x) => { alog += x; });
            audiod.stderr.on('data', (x) => { alog += x; });
            const asock = path.join(arun, 'ctl.sock');
            const ask = (o) => new Promise((resolve, reject) => { const c = net.connect(asock); let b = ''; c.on('data', (x) => { b += x; if (b.indexOf('\n') >= 0) { c.destroy(); resolve(JSON.parse(b.slice(0, b.indexOf('\n')))); } }); c.on('error', reject); c.write(JSON.stringify(o) + '\n'); });
            const d4 = new d.Daemon({ idleMs: 400, pollMs: 120, audioSock: asock });
            let c4 = null;
            try {
                for (let i = 0; i < 100 && !fs.existsSync(asock); i++) await sleep(50);
                assert.ok(fs.existsSync(asock), 'g21-audiod is up: ' + alog.slice(-300));
                const capsNow = await ask({ op: 'caps' });
                assert.deepStrictEqual([capsNow.stream.formats, capsNow.stream.rates, capsNow.stream.channels, capsNow.file.here], [['s16le'], [48000], [2], false]);
                await d4.start();
                for (let i = 0; i < 100 && !fs.existsSync(d4.opts.sock); i++) await sleep(20);
                c4 = client(d4.opts.sock);
                c4.send({ op: 'open', w: 1796, h: 548, zoom: 1.5 });
                const s4 = await c4.until('engine up with sound', (x) => x.engine === 'ready' && x.live, 60000);
                assert.strictEqual(s4.pol.sound, 'g21-audio', 'the engine has G21 Audio: ' + alog.slice(-300));
                assert.strictEqual((await ask({ op: 'status' })).stream, 'chromium');
                assert.strictEqual(fs.readFileSync(flog, 'utf8').indexOf('claim'), -1, 'a silent page does not take the speakers');
                c4.send({ op: 'nav', url: site + '/snd' });
                await c4.until('the sound page', (x) => x.title === 'Dzwiek' && !x.loading && x.live, 30000);
                c4.send({ op: 'touch', p: 1, x: 150, y: 100 }); c4.send({ op: 'touch', p: 3, x: 150, y: 100 });
                const snd = await c4.until('a tone plays in the page', (x) => /^snd /.test(x.title), 20000);
                assert.strictEqual(snd.title, 'snd 48000 running', 'the page\'s audio runs at 48 kHz');
                let stNow = null;
                for (let i = 0; i < 100; i++) { stNow = await ask({ op: 'status' }); if (stNow.active && stNow.claimed) break; await sleep(100); }
                assert.ok(stNow.active && stNow.claimed, 'sound flows: the speakers are claimed: ' + JSON.stringify(stNow) + ' ' + alog.slice(-400));
                assert.ok(fs.readFileSync(flog, 'utf8').indexOf('claim') >= 0);
                // real time: the writer's first report (after 5 s) has about 5 s of 48 kHz frames, hardly any dropped
                for (let i = 0; i < 90 && !stNow.stats; i++) { await sleep(100); stNow = await ask({ op: 'status' }); }
                const fr = /^frames (\d+) dropped (\d+)/.exec(stNow.stats || '');
                assert.ok(fr && Number(fr[1]) > 200000 && Number(fr[1]) < 280000 && Number(fr[2]) < 12000, 'about 240000 frames in the first 5 s: ' + stNow.stats);
                // the browser is closed: the stream ends, the speakers go back
                c4.send({ op: 'close' });
                await c4.until('engine off', (x) => x.engine === 'off', 20000);
                for (let i = 0; i < 60 && fs.readFileSync(flog, 'utf8').indexOf('release') < 0; i++) await sleep(100);
                assert.ok(fs.readFileSync(flog, 'utf8').indexOf('release') >= 0, 'the speakers are released: ' + alog.slice(-300));
                assert.strictEqual((await ask({ op: 'status' })).stream, null);
                console.log('ok engine sound: a page\'s audio reaches G21 Audio as S16LE 48 kHz stereo in real time (' + stNow.stats + '); the speakers are claimed while it plays and released when the browser closes');
            } finally {
                if (c4) c4.close();
                await d4.close();
                audiod.kill('SIGTERM');
            }
        }
        srv.close();
    }
    return undefined;
}

(async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'g21br-'));
    fs.chmodSync(base, 0o755);
    try {
        testUrls();
        testUid();
        testPolicy(base);
        testWebframe();
        const eng = await testEngineFiles(base);
        if (eng) await testZip(base, eng);
        await testChain(base, eng);
    } finally {
        fs.rmSync(base, { recursive: true, force: true });
    }
    console.log('test_browser_tool: ok' + (skipped ? ' (' + skipped + ' part(s) skipped, see SKIP above)' : ''));
    process.exit(0);
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
