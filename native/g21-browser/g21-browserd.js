#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/*
 * g21-browserd - the web browser behind THEiPlay's "Przeglądarka".
 *
 * The engine is Google's chrome-headless-shell (engine/manifest.json names the build). It is not
 * shipped with this tool: on first use it is downloaded from Google's Chrome for Testing storage
 * into cache/ and checked file by file against the manifest's SHA-256. It runs as an
 * unprivileged uid of its own, with its own loader, C library and fonts (lib/, fonts/), so it uses
 * no library of the head unit and changes no file of it.
 *
 *   app  <-- /run/g21-browser/ctl.sock (JSON lines) -->  this daemon (root)
 *   daemon --DevTools pipe--> engine (uid "engine")  --SOCKS5--> g21-browserd.js --proxy (same uid)
 *   engine --Page.screencastFrame (JPEG)--> daemon --pipe--> g21-webframe --> /dev/shm/mgu-video-g21browser
 *
 * The page picture never passes through the app: mgu-render draws the video file (op 19), as it
 * does for YouTube and AirPlay.
 *
 * Network: mgu-uplink lets out only the uids it lists and the system resolver answers no internet
 * names (as jap-ridetube-d found), so every request of the engine goes through the proxy child,
 * which resolves with the uplink's DNS servers and refuses loopback, private and link-local
 * addresses: a web page cannot reach services inside the car.
 *
 * Commands (app -> daemon), one JSON object per line:
 *   {op:"open", w, h, zoom?}   start (w x h: the page area in screen pixels), then state events
 *   {op:"nav", url} {op:"home"} {op:"back"} {op:"fwd"} {op:"reload"} {op:"stop"}
 *   {op:"touch", p:1|2|3, x, y}  {op:"scroll", dx, dy}   (screen pixels inside the page area)
 *   {op:"text", s, replace?, enter?}  {op:"key", k:"Enter"|"Backspace"|"Tab"|"Escape"}
 *   {op:"zoom", z}  {op:"close"}
 * Events (daemon -> app):
 *   {ev:"state", engine:"off|downloading|unpacking|starting|ready|failed", err, url, title, loading, back, fwd,
 *    live, w, h, ino, zoom, editable, pct}
 *   {ev:"edit", kind, value, submit}   a tap landed in a text field: the app opens its keyboard
 *
 * Node 22 (jap-node22): brotli and fs.statfsSync.
 */
const fs = require('fs');
const path = require('path');
const net = require('net');
const cp = require('child_process');
const crypto = require('crypto');
const zlib = require('zlib');

const SELF = 'g21-browser';
const MAX_UID = 60000; // login.defs UID_MAX
const MAINAPPS = [{ root: '/usr/lib/oap-mainapp', hmi: 'HmiMain3D' }, { root: '/usr/lib/oap-mainapp21', hmi: 'Hmi8' }];
const ZOOMS = [1, 1.25, 1.5, 1.75, 2];
const SEARCH = 'https://www.google.com/search?q=';

function defaults() {
    const env = process.env;
    const here = __dirname;
    const root = env.G21_BROWSER_ROOT || '/var/opt/g21-browser';
    const run = env.G21_BROWSER_RUN || '/run/g21-browser';
    return {
        here: here,
        engineSrc: env.G21_BROWSER_ENGINE || path.join(here, 'engine'),
        libDir: env.G21_BROWSER_LIB || path.join(here, 'lib'),
        fontsDir: path.join(here, 'fonts'),
        webframe: path.join(here, 'g21-webframe'),
        cacheDir: path.join(root, 'cache'),
        stateDir: path.join(root, 'state'),
        logDir: path.join(root, 'log'),
        runDir: run,
        sock: path.join(run, 'ctl.sock'),
        sockGid: 12202, // tm_oap_app
        sourceUrl: env.G21_BROWSER_SOURCE || '',   // tests: the engine zip from a local server
        ring: env.G21_BROWSER_RING || '/dev/shm/mgu-video-g21browser',
        leaseFile: '/run/mgu-uplink/lease.json',
        etcDir: '/etc',
        oapRoot: '/var/opt/public/oap',
        toolRoot: '/var/opt',
        procDir: '/proc',
        mainapps: MAINAPPS,
        noSetuid: env.G21_BROWSER_NOSETUID === '1',   // tests not run as root
        testUid: env.G21_BROWSER_UID ? Number(env.G21_BROWSER_UID) : null, // tests run as root
        allowLocal: env.G21_BROWSER_ALLOW_LOCAL === '1', // tests: pages on 127.0.0.1
        picture: [1, 0.75, 0.5].indexOf(Number(env.G21_BROWSER_PICTURE)) >= 0 ? Number(env.G21_BROWSER_PICTURE) : null, // tests: instead of the policy's "picture"
        sandboxHelper: path.join(here, 'g21-chrome-sandbox'), // Chromium's setuid sandbox helper, built from sandbox-src/
        policyFile: path.join(root, 'state', 'policy.json'),   // the owner's rules; see POLICY_DEFAULT
        policyOut: path.join(run, 'policy.json'),              // the rules in force, for reading (0644)
        audioSock: env.G21_BROWSER_AUDIO_SOCK || '/run/g21-audio/ctl.sock', // G21 Audio (the tool g21-audio), when it is installed
        appsDir: path.join(root, 'apps'),                                  // apps imported from git (Sklep): one folder each
        idleMs: 90000,        // the engine stays this long after the app went away
        frameGapMs: 50,       // at most 20 page frames a second
        memLimitMb: 900,      // the engine's processes together; above it the engine is stopped
        startMs: 15000,
        pollMs: 1500          // title and back / forward are read again this often (a script that sets document.title sends no event)
    };
}

const lines = (f) => { try { return fs.readFileSync(f, 'utf8').split('\n'); } catch (e) { return []; } };
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const list = (d) => { try { return fs.readdirSync(d); } catch (e) { return []; } };
const isId = (n) => n > 0 && n === Math.floor(n);
const mkdirp = (p, mode) => fs.mkdirSync(p, { recursive: true, mode: mode || 0o755 });
const rmrf = (p) => fs.rmSync(p, { recursive: true, force: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// an error whose text is for the screen (Polish, no paths); every other failure shows as "silnik nie wystartował"
class UserError extends Error { constructor(msg) { super(msg); this.user = true; } }

function writeIfChanged(file, text, mode) {
    try { if (fs.readFileSync(file, 'utf8') === text) return; } catch (e) { /* not there yet */ }
    fs.writeFileSync(file + '.tmp', text, { mode: mode });
    fs.renameSync(file + '.tmp', file);
}

// ---------------------------------------------------------------- the engine uid
// As jap-ridetube-d picks its fetch uid (and mgu-updater its own): the lowest free number above
// MainApp's app uid ranges, kept in state/uids.json while nothing else holds it. mgu-uplink learns it
// from uids.d/g21-browser (written here, and by the deploy tool from state/internet-uids).
function mainappRanges(o) {
    const have = o.mainapps.filter((m) => fs.existsSync(path.join(m.root, 'config', 'base.json')));
    let m = have.length === 1 ? have[0] : null;
    if (have.length > 1) {
        const running = list(o.procDir).filter((n) => /^\d+$/.test(n)).map((n) => (lines(path.join(o.procDir, n, 'comm'))[0] || '').trim());
        const which = have.filter((x) => running.indexOf(x.hmi) >= 0);
        m = which.length === 1 ? which[0] : null;
    }
    const c = m && readJson(path.join(m.root, 'config', 'base.json'));
    if (!c) return null;
    const rse = c.usableUidsAndGidsRse || {};
    const ranges = [c.usableUidsAndGids].concat(Object.keys(rse).map((k) => rse[k]))
        .filter((r) => r && isId(Number(r.min)) && Number(r.max) >= Number(r.min)).map((r) => ({ min: Number(r.min), max: Number(r.max) }));
    return ranges.length ? { ranges: ranges, own: (Array.isArray(c.mainAppUids) ? c.mainAppUids : []).map(Number).filter(isId) } : null;
}
function takenIds(o, cfg, procs) {
    const ids = {};
    const add = (v) => { const n = Number(v); if (String(v).trim() !== '' && isId(n)) ids[n] = true; };
    lines(path.join(o.etcDir, 'passwd')).forEach((l) => { const f = l.split(':'); add(f[2] || ''); add(f[3] || ''); });
    lines(path.join(o.etcDir, 'group')).forEach((l) => add(l.split(':')[2] || ''));
    list(o.oapRoot).forEach((n) => { const m = /^oap_(\d+)$/.exec(n); if (m) add(m[1]); });
    const mgr = path.join(o.oapRoot, 'oap_12201');
    list(path.join(mgr, 'data', 'apps')).forEach((n) => { const e = readJson(path.join(mgr, 'data', 'apps', n)); add(e && e.userId !== undefined ? e.userId : ''); });
    lines(path.join(mgr, 'security', 'uids.txt')).forEach((l) => add(l.split('=')[0]));
    const dropins = path.join(o.toolRoot, 'mgu-uplink', 'uids.d');
    list(dropins).filter((n) => n !== SELF && !/^\./.test(n))
        .forEach((n) => lines(path.join(dropins, n)).forEach((l) => l.split('#')[0].split(/[\s,]+/).forEach(add)));
    const upd = readJson(path.join(o.toolRoot, 'mgu-updater', 'state', 'uids.json')) || {};
    Object.keys(upd).forEach((k) => add(upd[k]));
    // other tools of this repository that keep a uid the same way
    list(o.toolRoot).filter((n) => n !== SELF).forEach((n) => {
        const u = readJson(path.join(o.toolRoot, n, 'state', 'uids.json')) || {};
        Object.keys(u).forEach((k) => add(u[k]));
    });
    (cfg ? cfg.own : []).forEach(add);
    if (procs) {
        list(o.procDir).filter((n) => /^\d+$/.test(n)).forEach((pid) => lines(path.join(o.procDir, pid, 'status')).forEach((l) => {
            const m = /^[UG]id:\s+(.*)$/.exec(l);
            if (m) m[1].split(/\s+/).forEach(add);
        }));
    }
    return ids;
}
function pickEngineUid(o) {
    if (o.testUid !== null) return o.testUid;
    const kept = Number((readJson(path.join(o.stateDir, 'uids.json')) || {}).engine);
    const cfg = mainappRanges(o);
    const inRange = (u) => !!cfg && cfg.ranges.some((r) => u >= r.min && u <= r.max);
    let uid = null;
    if (isId(kept) && !takenIds(o, cfg, false)[kept] && !inRange(kept)) uid = kept;
    else if (cfg) {
        const all = takenIds(o, cfg, true);
        let u = Math.max.apply(null, cfg.ranges.map((r) => r.max)) + 1;
        while (u <= MAX_UID && (all[u] || inRange(u))) u++;
        if (u <= MAX_UID) { uid = u; o.log('engine uid: ' + u + (isId(kept) ? ' (' + kept + ' is taken)' : '')); }
    }
    if (uid === null) {
        o.log('engine uid: none: ' + (cfg ? 'no free uid below ' + MAX_UID : "MainApp's config/base.json (its app uid ranges) cannot be read"));
        return null;
    }
    mkdirp(o.stateDir, 0o700);
    writeIfChanged(path.join(o.stateDir, 'uids.json'), JSON.stringify({ engine: uid }) + '\n', 0o644);
    writeIfChanged(path.join(o.stateDir, 'internet-uids'), uid + '\n', 0o644);
    const uplink = path.join(o.toolRoot, 'mgu-uplink');
    if (fs.existsSync(path.join(uplink, 'current')) || fs.existsSync(path.join(uplink, 'uids.d'))) {
        try { mkdirp(path.join(uplink, 'uids.d')); writeIfChanged(path.join(uplink, 'uids.d', SELF), uid + '\n', 0o644); } catch (e) { o.log('engine uid: uplink drop-in: ' + e.message); }
    }
    return uid;
}

// ---------------------------------------------------------------- the engine's files
/*
 * The engine is not part of this tool's files: Google's binary is Google's to hand out. On first
 * use it is fetched from Google's own Chrome for Testing storage (manifest.source.url, as the
 * engine uid: root has no internet here), and every file taken from the zip must have the SHA-256
 * the manifest names; one difference and nothing is kept.
 * A development machine may hold the same files packed (engine/engine.pack.br.NN, build-engine.js):
 * when all parts are there they are used instead and nothing is downloaded.
 * Only after the hashes matched comes the one change this tool makes to the binary: its ELF
 * interpreter path (/lib64/ld-linux-x86-64.so.2) becomes /run/g21-browser/ld.so, the loader in lib/,
 * so the engine runs on its own C library and not on the head unit's.
 */
const SOURCE_RE = /^https:\/\/storage\.googleapis\.com\/chrome-for-testing-public\/[0-9.]+\/linux64\/chrome-headless-shell-linux64\.zip$/;

// ---------------------------------------------------------------- apps from git (Sklep)
/*
 * An app is a public GitHub repository with a web page in it: index.html at its top (or the page a manifest
 * names). It is fetched as GitHub's tarball of a branch (the head unit has no git), unpacked into
 * apps/<owner>-<repo>/ as plain files owned by root, and shown by the engine from a file server on 127.0.0.1
 * that only reads that folder. For the engine it is a web page like any other: inside the sandbox, and with no
 * way to the car's services (the proxy lets it reach its own server and nothing else that is local).
 *
 * Optional theiplay.json at the repository's top: { "name": "...", "start": "page.html", "mouse": "yes" }.
 * Without it: the name and start_url of manifest.json / manifest.webmanifest, then the repository's name.
 */
const APPS_RE = /^https:\/\/codeload\.github\.com\/[A-Za-z0-9-]{1,39}\/[A-Za-z0-9_.-]{1,100}\/tar\.gz\/[A-Za-z0-9_.\/-]{1,120}$/;
const APP_LIMITS = { files: 4000, bytes: 150 << 20, archive: 60 << 20 };
// "owner/repo", "github.com/owner/repo", "https://github.com/owner/repo.git", with "@branch" or "/tree/branch"
function parseRepo(text) {
    let t = String(text || '').trim().replace(/^https?:\/\//i, '').replace(/^(www\.)?github\.com\//i, '').replace(/\/+$/, '').replace(/\.git$/i, '');
    let ref = 'HEAD';
    let m = /^([^@\s]+)@([A-Za-z0-9_.\/-]{1,100})$/.exec(t);
    if (m) { t = m[1]; ref = m[2]; }
    m = /^([^\/]+\/[^\/]+)\/tree\/([A-Za-z0-9_.\/-]{1,100})$/.exec(t);
    if (m) { t = m[1]; ref = m[2]; }
    m = /^([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9_.-]{1,100})$/.exec(t);
    if (!m || /\.\./.test(ref) || /^\.+$/.test(m[2])) return null;
    return { owner: m[1], repo: m[2], ref: ref, id: (m[1] + '-' + m[2]).toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 60),
        url: 'https://codeload.github.com/' + m[1] + '/' + m[2] + '/tar.gz/' + ref };
}
// GitHub's tar.gz -> dir, without its top folder. Only plain files and folders; links, devices and anything
// that would leave dir are not taken. Limits on the number of files and their bytes.
function untarGz(file, dir, limits) {
    const raw = zlib.gunzipSync(fs.readFileSync(file), { maxOutputLength: limits.bytes + (16 << 20) });
    const str = (o, n) => { const b = raw.subarray(o, o + n); const z = b.indexOf(0); return b.toString('utf8', 0, z < 0 ? n : z); };
    let at = 0, files = 0, bytes = 0, longName = null;
    while (at + 512 <= raw.length) {
        const name0 = str(at, 100);
        if (!name0 && raw[at] === 0) break;
        const size = parseInt(str(at + 124, 12).trim() || '0', 8);
        const type = raw[at + 156] ? String.fromCharCode(raw[at + 156]) : '0';
        const prefix = str(at + 345, 155);
        if (!(size >= 0) || at + 512 + size > raw.length) throw new UserError('archiwum repozytorium jest uszkodzone');
        const data = raw.subarray(at + 512, at + 512 + size);
        at += 512 + Math.ceil(size / 512) * 512;
        if (type === 'L') { longName = data.toString('utf8').replace(/\0+$/, ''); continue; }
        if (type === 'x') { const p = /\d+ path=([^\n]+)\n/.exec(data.toString('utf8')); if (p) longName = p[1]; continue; }
        if (type === 'g') continue;
        const name = longName || (prefix ? prefix + '/' + name0 : name0);
        longName = null;
        const parts = name.split('/').filter((p) => p !== '' && p !== '.');
        parts.shift(); // the archive's own top folder (repo-branch)
        if (!parts.length || parts[0] === '.git' || parts.some((p) => p === '..' || /[\\\0]/.test(p))) continue;
        const out = path.join.apply(path, [dir].concat(parts));
        if (type === '5') { mkdirp(out, 0o755); continue; }
        if (type !== '0') continue;
        files += 1;
        bytes += size;
        if (files > limits.files || bytes > limits.bytes) throw new UserError('aplikacja jest za duża (najwyżej ' + limits.files + ' plików, ' + Math.round(limits.bytes / 1e6) + ' MB)');
        mkdirp(path.dirname(out), 0o755);
        fs.writeFileSync(out, data, { mode: 0o644 });
    }
    return { files: files, bytes: bytes };
}
// --apps DIR: the file server for the apps (a child, as the engine's uid). GET and HEAD of files under DIR only.
function runApps(dir) {
    const http = require('http');
    const TYPES = { html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
        css: 'text/css; charset=utf-8', json: 'application/json', webmanifest: 'application/manifest+json', map: 'application/json', txt: 'text/plain; charset=utf-8', xml: 'application/xml',
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', ico: 'image/x-icon', avif: 'image/avif',
        woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', wasm: 'application/wasm',
        mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', mp4: 'video/mp4', webm: 'video/webm' };
    let root;
    try { root = fs.realpathSync(dir); } catch (e) { process.stderr.write('no apps folder\n'); process.exit(1); }
    const srv = http.createServer((q, r) => {
        const no = (code) => { r.statusCode = code; r.setHeader('content-type', 'text/plain; charset=utf-8'); r.end(code === 404 ? 'nie ma takiego pliku' : ''); };
        if (q.method !== 'GET' && q.method !== 'HEAD') return no(405);
        let p;
        try { p = decodeURIComponent(String(q.url).split('?')[0].split('#')[0]); } catch (e) { return no(400); }
        try {
            let file = path.join(root, path.normalize('/' + p));
            let st = fs.statSync(file);
            if (st.isDirectory()) {
                if (!/\/$/.test(p)) { r.statusCode = 301; r.setHeader('location', p + '/'); return r.end(); }
                file = path.join(file, 'index.html');
                st = fs.statSync(file);
            }
            const real = fs.realpathSync(file);
            if (real.indexOf(root + path.sep) !== 0 || !st.isFile()) return no(404);
            r.setHeader('content-type', TYPES[path.extname(real).slice(1).toLowerCase()] || 'application/octet-stream');
            r.setHeader('content-length', st.size);
            r.setHeader('cache-control', 'no-cache');
            r.setHeader('x-content-type-options', 'nosniff');
            if (q.method === 'HEAD') return r.end();
            fs.createReadStream(real).on('error', () => r.destroy()).pipe(r);
            return undefined;
        } catch (e) { return no(404); }
    });
    srv.listen(0, '127.0.0.1', () => process.stdout.write('port ' + srv.address().port + '\n'));
    process.stdin.on('end', () => process.exit(0));
    process.stdin.on('close', () => process.exit(0));
    process.stdin.resume();
}

function loadManifest(o) {
    const file = path.join(o.engineSrc, 'manifest.json');
    const m = readJson(file);
    if (!m || m.schema !== 1 || !Array.isArray(m.files) || !m.files.length || !Array.isArray(m.parts) || !/^[0-9a-f]{64}$/.test(String(m.binarySha256))) throw new UserError('brak opisu silnika w narzędziu (engine/manifest.json)');
    m.files.forEach((f) => { if (!f || !/^[A-Za-z0-9._-]+$/.test(String(f.path)) || !isId(f.size) || !/^[0-9a-f]{64}$/.test(String(f.sha256))) throw new UserError('manifest silnika: zły wpis pliku'); });
    const ip = m.interp;
    if (!ip || !isId(ip.offset) || !isId(ip.size) || typeof ip.from !== 'string' || typeof ip.to !== 'string' || ip.to.length + 1 > ip.size) throw new UserError('manifest silnika: brak opisu loadera');
    m.id = String(m.binarySha256).slice(0, 16);
    m.sha = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    return m;
}
function engineDir(o, m) { return path.join(o.cacheDir, 'engine-' + m.id); }
// unpacked, complete and from this manifest (a stamp written after every SHA-256 matched; sizes again each start)
function engineReady(o, m) {
    const dir = engineDir(o, m);
    try {
        if (fs.readFileSync(path.join(dir, '.ok'), 'utf8').trim() !== m.sha) return false;
        return m.files.every((f) => fs.statSync(path.join(dir, f.path)).size === f.size);
    } catch (e) { return false; }
}
function havePack(o, m) {
    try { return m.parts.length > 0 && m.parts.every((p) => /^engine\.pack\.br\.\d+$/.test(p.name) && fs.statSync(path.join(o.engineSrc, p.name)).size === p.size); } catch (e) { return false; }
}
function sourceUrl(o, m) {
    const url = o.sourceUrl || (m.source && m.source.url) || '';
    if (o.sourceUrl ? !/^https?:\/\//.test(url) : !SOURCE_RE.test(url)) throw new UserError('manifest silnika: brak adresu Google do pobrania');
    return url;
}
// one file of the engine, written while hashed; refuses more bytes than the manifest names
function fileSink(dir, f) {
    const fd = fs.openSync(path.join(dir, f.path), 'wx', 0o600);
    const h = crypto.createHash('sha256');
    let left = f.size;
    return {
        left: () => left,
        write(d) {
            if (d.length > left) throw new UserError('silnik: plik ' + f.path + ' jest dłuższy niż w manifeście');
            fs.writeSync(fd, d); h.update(d); left -= d.length;
        },
        close(check) {
            fs.closeSync(fd);
            if (check && (left !== 0 || h.digest('hex') !== f.sha256)) throw new UserError('silnik: zła suma SHA-256 pliku ' + f.path);
        }
    };
}
// engine/engine.pack.br.NN (entry = u16 name length, name, u32 mode, u64 size, data; brotli) -> dir
async function fillFromPack(o, m, dir, progress) {
    const total = m.files.reduce((a, f) => a + f.size, 0);
    const byName = {};
    m.files.forEach((f) => { byName[f.path] = f; });
    const seen = {};
    let head = Buffer.alloc(0), cur = null, done = 0;
    const eat = (d) => {
        while (d.length) {
            if (!cur) {
                head = head.length ? Buffer.concat([head, d]) : d;
                if (head.length < 2) return;
                const nl = head.readUInt16LE(0);
                if (nl < 1 || nl > 200) throw new UserError('paczka silnika uszkodzona');
                if (head.length < 2 + nl + 12) return;
                const name = head.toString('utf8', 2, 2 + nl);
                const size = Number(head.readBigUInt64LE(6 + nl));
                const f = byName[name];
                if (!f || seen[name] || f.size !== size) throw new UserError('paczka silnika: nieznany plik');
                seen[name] = true;
                cur = fileSink(dir, f);
                d = head.subarray(2 + nl + 12);
                head = Buffer.alloc(0);
            }
            const take = d.subarray(0, Math.min(d.length, cur.left()));
            if (take.length) { cur.write(take); done += take.length; }
            d = d.subarray(take.length);
            if (cur.left() === 0) { const c = cur; cur = null; c.close(true); }
        }
        if (progress) progress(Math.floor(done * 100 / total));
    };
    try {
        await new Promise((resolve, reject) => {
            const br = zlib.createBrotliDecompress();
            let failed = false;
            const fail = (e) => { if (!failed) { failed = true; br.destroy(); reject(e); } };
            br.on('data', (d) => { try { eat(d); } catch (e) { fail(e); } });
            br.on('error', (e) => fail(new UserError('paczka silnika uszkodzona (' + e.message + ')')));
            br.on('end', () => { if (!failed) resolve(); });
            (async () => {
                for (const p of m.parts) {
                    const h = crypto.createHash('sha256');
                    const rs = fs.createReadStream(path.join(o.engineSrc, p.name), { highWaterMark: 1 << 20 });
                    for await (const chunk of rs) {
                        if (failed) return;
                        h.update(chunk);
                        if (!br.write(chunk)) await new Promise((r) => br.once('drain', r));
                    }
                    if (h.digest('hex') !== p.sha256) throw new UserError('silnik: zła suma SHA-256 części ' + p.name);
                }
                br.end();
            })().catch(fail);
        });
    } finally { if (cur) cur.close(false); }
    if (m.files.some((f) => !seen[f.path])) throw new UserError('paczka silnika niepełna');
}
/*
 * Google's zip -> dir: only the files the manifest names, each inflated while hashed. The zip was
 * written by the engine uid, so it is opened without following a link and every offset is checked.
 */
async function fillFromZip(m, zip, dir, progress) {
    const total = m.files.reduce((a, f) => a + f.size, 0);
    const prefix = (m.source && typeof m.source.prefix === 'string') ? m.source.prefix : 'chrome-headless-shell-linux64/';
    const fd = fs.openSync(zip, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    let done = 0;
    try {
        const st = fs.fstatSync(fd);
        if (!st.isFile() || st.size < 22 || st.size > 0xffffffff) throw new UserError('pobrany silnik: to nie jest plik zip');
        const read = (len, pos) => { const b = Buffer.alloc(len); if (pos < 0 || pos + len > st.size || fs.readSync(fd, b, 0, len, pos) !== len) throw new UserError('pobrany silnik: zip uszkodzony'); return b; };
        const tailLen = Math.min(st.size, 65557), tail = read(tailLen, st.size - tailLen);
        let eo = -1;
        for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { eo = i; break; }
        if (eo < 0) throw new UserError('pobrany silnik: zip uszkodzony');
        const count = tail.readUInt16LE(eo + 10), cdSize = tail.readUInt32LE(eo + 12), cdOff = tail.readUInt32LE(eo + 16);
        if (count === 0xffff || cdSize > (8 << 20)) throw new UserError('pobrany silnik: zip w nieobsługiwanej postaci');
        const cd = read(cdSize, cdOff);
        const entries = {};
        for (let p = 0, i = 0; i < count; i++) {
            if (p + 46 > cd.length || cd.readUInt32LE(p) !== 0x02014b50) throw new UserError('pobrany silnik: zip uszkodzony');
            const nl = cd.readUInt16LE(p + 28), xl = cd.readUInt16LE(p + 30), cl = cd.readUInt16LE(p + 32);
            if (p + 46 + nl > cd.length) throw new UserError('pobrany silnik: zip uszkodzony');
            entries[cd.toString('utf8', p + 46, p + 46 + nl)] = { flags: cd.readUInt16LE(p + 8), method: cd.readUInt16LE(p + 10), csize: cd.readUInt32LE(p + 20), size: cd.readUInt32LE(p + 24), off: cd.readUInt32LE(p + 42) };
            p += 46 + nl + xl + cl;
        }
        for (const f of m.files) {
            const e = entries[prefix + f.path];
            if (!e) throw new UserError('pobrany silnik: brak pliku ' + f.path);
            if (e.size !== f.size || (e.method !== 8 && e.method !== 0) || (e.flags & 1)) throw new UserError('pobrany silnik: plik ' + f.path + ' inny niż w manifeście');
            const lh = read(30, e.off);
            if (lh.readUInt32LE(0) !== 0x04034b50) throw new UserError('pobrany silnik: zip uszkodzony');
            const start = e.off + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
            if (start + e.csize > st.size) throw new UserError('pobrany silnik: zip uszkodzony');
            const sink = fileSink(dir, f);
            let ok = false;
            try {
                await new Promise((resolve, reject) => {
                    const out = (d) => { sink.write(d); done += d.length; if (progress) progress(Math.floor(done * 100 / total)); };
                    if (e.csize === 0) return resolve();
                    const rs = fs.createReadStream(null, { fd: fd, autoClose: false, start: start, end: start + e.csize - 1, highWaterMark: 1 << 20 });
                    const src = e.method === 8 ? rs.pipe(zlib.createInflateRaw()) : rs;
                    rs.on('error', reject);
                    src.on('error', (x) => reject(x.user ? x : new UserError('pobrany silnik: zip uszkodzony (' + f.path + ')')));
                    src.on('data', (d) => { try { out(d); } catch (x) { rs.destroy(); if (src !== rs) src.destroy(); reject(x); } });
                    src.on('end', resolve);
                    return undefined;
                });
                ok = true;
            } finally { sink.close(ok); }
        }
    } finally { fs.closeSync(fd); }
}
// manifest.source.url -> file, in a child as the engine uid (root has no internet here); pct to progress
function fetchEngine(o, url, dest, ids, progress) {
    return new Promise((resolve, reject) => {
        const args = [__filename, '--fetch', url, dest, o.leaseFile].concat(o.sourceUrl ? ['--any-host'] : []);
        const child = cp.spawn(process.execPath, args, Object.assign({}, ids, { cwd: '/', env: {}, stdio: ['ignore', 'pipe', 'pipe'] }));
        let out = '', err = '';
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (d) => {
            out += d;
            let i;
            while ((i = out.indexOf('\n')) >= 0) { const l = out.slice(0, i).split(' '); out = out.slice(i + 1); if (l[0] === 'p' && progress) progress(Number(l[1]) | 0); }
        });
        child.stderr.on('data', (d) => { err = (err + d).slice(-400); });
        child.on('error', reject);
        child.on('exit', (code) => {
            if (code === 0) return resolve();
            o.log('engine download failed (' + code + '): ' + err.trim().split('\n').pop());
            return reject(new UserError(code === 4 ? 'za mało miejsca na pobranie silnika' : 'nie udało się pobrać silnika: sprawdź internet w aucie'));
        });
    });
}
// the uplink's DNS servers for http(s).get (the system resolver answers no internet names); Node 22 asks for "all"
function uplinkLookup(leaseFile) {
    const dns = require('dns');
    const resolve = uplinkResolve(leaseFile);
    return function (host, opts, cb) {
        if (typeof opts === 'function') { cb = opts; opts = {}; }
        if (ipv4(host)) return cb(null, opts && opts.all ? [{ address: host, family: 4 }] : host, 4);
        if (!((readJson(leaseFile) || {}).dns || []).length) return dns.lookup(host, Object.assign({}, opts, { family: 4 }), cb);
        return resolve(host, (e, ip) => (e ? cb(e) : cb(null, opts && opts.all ? [{ address: ip, family: 4 }] : ip, 4)));
    };
}
function runFetch(url, dest, leaseFile, anyHost) {
    const fail = (code, msg) => { process.stderr.write(msg + '\n'); try { fs.unlinkSync(dest); } catch (e) { /* none */ } process.exit(code); };
    if (!anyHost && !SOURCE_RE.test(url) && !APPS_RE.test(url)) fail(2, 'not a Chrome for Testing or GitHub archive address');
    const mod = /^https:/.test(url) ? require('https') : require('http');
    let got = 0, last = -1, idle = null;
    const watchdog = () => { clearTimeout(idle); idle = setTimeout(() => fail(3, 'no data for 60 s'), 60000); };
    watchdog();
    const req = mod.get(url, { lookup: uplinkLookup(leaseFile), headers: { 'user-agent': 'g21-browser', accept: '*/*' } }, (res) => {
        if (res.statusCode !== 200) fail(3, 'http ' + res.statusCode);
        const total = Number(res.headers['content-length']) || 0;
        if (total > (400 << 20)) fail(3, 'too large');
        try {
            const st = fs.statfsSync(path.dirname(dest));
            if (total && Number(st.bavail) * Number(st.bsize) < total + (16 << 20)) fail(4, 'disk full');
        } catch (e) { /* the write will tell */ }
        const out = fs.createWriteStream(dest, { mode: 0o644, flags: 'w' });
        out.on('error', (e) => fail(e.code === 'ENOSPC' ? 4 : 3, 'write: ' + e.message));
        res.on('data', (d) => {
            got += d.length;
            watchdog();
            if (got > (400 << 20)) fail(3, 'too large');
            const pct = total ? Math.floor(got * 100 / total) : 0;
            if (pct !== last) { last = pct; process.stdout.write('p ' + pct + '\n'); }
        });
        res.on('error', (e) => fail(3, 'read: ' + e.message));
        res.pipe(out);
        out.on('finish', () => { clearTimeout(idle); if (total && got !== total) fail(3, 'short read'); process.exit(0); });
    });
    req.on('error', (e) => fail(3, 'request: ' + e.message));
}
/*
 * The engine into cache/engine-<id>/: from the local pack when a development machine has it,
 * otherwise from Google. set(phase, pct): "downloading" | "unpacking".
 */
async function installEngine(o, m, ids, set) {
    const dest = engineDir(o, m), tmp = dest + '.tmp', dl = path.join(o.cacheDir, 'download');
    const total = m.files.reduce((a, f) => a + f.size, 0);
    const pack = havePack(o, m);
    mkdirp(o.cacheDir, 0o711);
    list(o.cacheDir).filter((n) => /^engine-/.test(n) && n !== path.basename(dest)).forEach((n) => { try { rmrf(path.join(o.cacheDir, n)); } catch (e) { o.log('old engine: ' + e.message); } });
    rmrf(tmp); rmrf(dest); rmrf(dl);
    const st = fs.statfsSync(o.cacheDir);
    const free = Number(st.bavail) * Number(st.bsize), need = total + (pack ? 32 << 20 : 200 << 20);
    if (free < need) throw new UserError('za mało miejsca: potrzeba ' + Math.ceil(need / 1e6) + ' MB, jest ' + Math.floor(free / 1e6) + ' MB');
    try {
        let zip = null;
        if (!pack) {
            const url = sourceUrl(o, m);
            fs.mkdirSync(dl, { mode: 0o700 });
            if (ids.uid !== undefined) fs.chownSync(dl, ids.uid, ids.gid);
            zip = path.join(dl, 'engine.zip');
            o.log('downloading the engine from ' + url.split('/').slice(0, 3).join('/'));
            set('downloading', 0);
            await fetchEngine(o, url, zip, ids, (pct) => set('downloading', pct));
        }
        fs.mkdirSync(tmp, { mode: 0o755 });
        set('unpacking', 0);
        if (pack) await fillFromPack(o, m, tmp, (pct) => set('unpacking', pct));
        else await fillFromZip(m, zip, tmp, (pct) => set('unpacking', pct));
        const ip = m.interp;
        const fd = fs.openSync(path.join(tmp, 'chrome-headless-shell'), 'r+');
        try {
            const was = Buffer.alloc(ip.size);
            fs.readSync(fd, was, 0, ip.size, ip.offset);
            if (was.toString('latin1').replace(/\0+$/, '') !== ip.from) throw new UserError('silnik: inny loader niż w manifeście');
            const now = Buffer.alloc(ip.size);
            now.write(ip.to, 'latin1');
            fs.writeSync(fd, now, 0, ip.size, ip.offset);
        } finally { fs.closeSync(fd); }
        m.files.forEach((f) => fs.chmodSync(path.join(tmp, f.path), f.mode & 0o755));
        fs.writeFileSync(path.join(tmp, '.ok'), m.sha + '\n', { mode: 0o644 });
        fs.renameSync(tmp, dest);
    } catch (e) {
        rmrf(tmp);
        throw e;
    } finally { rmrf(dl); }
    return dest;
}

// ---------------------------------------------------------------- the proxy child (--proxy)
function ipv4(s) {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
    if (!m) return null;
    const p = m.slice(1).map(Number);
    return p.every((x) => x <= 255) ? p : null;
}
// loopback, private, link-local, CGNAT (Tailscale), multicast, reserved: nothing inside the car or its networks
function blockedV4(p) {
    const a = p[0], b = p[1];
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
        || (a === 192 && b === 168) || (a === 192 && b === 0 && p[2] === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}
function uplinkResolve(leaseFile) {
    const dns = require('dns');
    return function (host, cb) {
        const servers = ((readJson(leaseFile) || {}).dns || []).filter((x) => typeof x === 'string');
        if (!servers.length) return dns.lookup(host, { family: 4 }, (e, a) => cb(e, a));
        const r = new dns.Resolver({ timeout: 4000, tries: 2 });
        try { r.setServers(servers); } catch (e) { return cb(e); }
        return r.resolve4(host, (e, a) => (e ? cb(e) : cb(null, a[0])));
    };
}
function runProxy(opts) {
    const resolve = uplinkResolve(opts.leaseFile);
    const allowLocal = !!opts.allowLocal;
    const allow = {};
    (opts.allow || []).forEach((a) => { allow[a] = true; });
    const excepted = (ip, port) => allow[ip + ':' + port] === true || allow[ip + ':*'] === true;
    let refused = 0;
    const server = net.createServer((c) => {
        let buf = Buffer.alloc(0), stage = 0, up = null;
        const reply = (code) => { try { c.end(Buffer.from([5, code, 0, 1, 0, 0, 0, 0, 0, 0])); } catch (e) { /* gone */ } };
        c.setTimeout(120000, () => c.destroy());
        c.on('error', () => { if (up) up.destroy(); });
        c.on('close', () => { if (up) up.destroy(); });
        const onData = (d) => {
            buf = Buffer.concat([buf, d]);
            if (stage === 0) {
                if (buf.length < 2) return;
                if (buf[0] !== 5) return c.destroy();
                if (buf.length < 2 + buf[1]) return;
                buf = buf.subarray(2 + buf[1]);
                c.write(Buffer.from([5, 0]));
                stage = 1;
            }
            if (stage === 1) {
                if (buf.length < 5) return;
                if (buf[0] !== 5) return c.destroy();
                const cmd = buf[1], at = buf[3];
                let host, end;
                if (at === 1) { if (buf.length < 10) return; host = buf[4] + '.' + buf[5] + '.' + buf[6] + '.' + buf[7]; end = 8; }
                else if (at === 3) { if (buf.length < 7 + buf[4]) return; host = buf.toString('latin1', 5, 5 + buf[4]); end = 5 + buf[4]; }
                else return reply(8);
                const port = buf.readUInt16BE(end);
                const rest = buf.subarray(end + 2);
                stage = 2;
                c.removeListener('data', onData);
                c.pause();
                if (cmd !== 1) return reply(7);
                if (!/^[A-Za-z0-9._-]{1,253}$/.test(host) || port < 1) return reply(4);
                const go = (ip) => {
                    const p = ipv4(ip);
                    if (!p || (blockedV4(p) && !allowLocal && !excepted(p.join('.'), port))) {
                        if (++refused <= 20) process.stderr.write('refused ' + (p ? 'local address' : 'address') + ' for port ' + port + '\n');
                        return reply(2);
                    }
                    let connected = false;
                    up = net.connect({ host: ip, port: port });
                    up.setTimeout(120000, () => up.destroy());
                    up.once('connect', () => {
                        connected = true;
                        c.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]));
                        if (rest.length) up.write(rest);
                        c.pipe(up); up.pipe(c);
                        c.resume();
                    });
                    up.on('error', (e) => { if (connected) c.destroy(); else reply(e.code === 'ECONNREFUSED' ? 5 : 4); });
                    up.on('close', () => c.destroy());
                };
                if (ipv4(host)) return go(host);
                return resolve(host, (e, ip) => (e || !ip ? reply(4) : go(ip)));
            }
            return undefined;
        };
        c.on('data', onData);
    });
    server.on('error', (e) => { process.stderr.write('proxy: ' + e.message + '\n'); process.exit(1); });
    server.listen(0, '127.0.0.1', () => process.stdout.write('port ' + server.address().port + '\n'));
    process.stdin.on('end', () => process.exit(0)); // the daemon went away
    process.stdin.resume();
}

// ---------------------------------------------------------------- DevTools over the engine's pipe
function Cdp(child) {
    this.tx = child.stdio[3];
    this.rx = child.stdio[4];
    this.id = 0;
    this.wait = new Map();
    this.onEvent = null;
    this.closed = false;
    let buf = [], size = 0;
    this.rx.on('data', (d) => {
        let from = 0, i;
        while ((i = d.indexOf(0, from)) >= 0) {
            buf.push(d.subarray(from, i));
            const text = (buf.length === 1 ? buf[0] : Buffer.concat(buf)).toString('utf8');
            buf = []; size = 0; from = i + 1;
            let m = null;
            try { m = JSON.parse(text); } catch (e) { continue; }
            if (m.id && this.wait.has(m.id)) {
                const w = this.wait.get(m.id);
                this.wait.delete(m.id);
                clearTimeout(w.timer);
                if (m.error) w.rej(new Error(m.error.message || 'devtools error')); else w.res(m.result || {});
            } else if (m.method && this.onEvent) {
                try { this.onEvent(m); } catch (e) { /* the daemon's guard logs through fault() */ if (this.onFault) this.onFault(e); }
            }
        }
        if (from < d.length) { buf.push(d.subarray(from)); size += d.length - from; }
        if (size > (64 << 20)) { buf = []; size = 0; } // never a message this large
    });
    const end = () => {
        this.closed = true;
        this.wait.forEach((w) => { clearTimeout(w.timer); w.rej(new Error('engine gone')); });
        this.wait.clear();
    };
    this.rx.on('close', end);
    this.rx.on('error', end);
    this.tx.on('error', end);
}
Cdp.prototype.send = function (method, params, sessionId, timeoutMs) {
    return new Promise((res, rej) => {
        if (this.closed) return rej(new Error('engine gone'));
        const id = ++this.id;
        const timer = setTimeout(() => { this.wait.delete(id); rej(new Error(method + ': timeout')); }, timeoutMs || 10000);
        this.wait.set(id, { res: res, rej: rej, timer: timer });
        const msg = { id: id, method: method, params: params || {} };
        if (sessionId) msg.sessionId = sessionId;
        try { this.tx.write(JSON.stringify(msg) + '\0'); } catch (e) { clearTimeout(timer); this.wait.delete(id); rej(e); }
        return undefined;
    });
};

// ---------------------------------------------------------------- pages
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function startPage(recent) {
    const tiles = [['Google', 'https://www.google.com/'], ['Wikipedia', 'https://pl.wikipedia.org/'], ['DuckDuckGo', 'https://duckduckgo.com/']]
        .map((t) => '<a class="t" href="' + t[1] + '">' + t[0] + '</a>').join('');
    const rec = (recent || []).slice(0, 10).map((r) => '<a class="r" href="' + esc(r.url) + '"><b>' + esc(r.title || r.url) + '</b><span>' + esc(r.url.replace(/^https?:\/\//, '')) + '</span></a>').join('');
    const html = '<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Strona startowa</title><style>'
        + 'html{background:#090807;color:#f7f2ea;font-family:"Liberation Sans",Arial,sans-serif}body{margin:0;padding:22px 34px}'
        + 'h1{font-size:26px;font-weight:400;margin:0 0 16px}h1 b{color:#e6a15c;font-weight:700}h2{font-size:15px;font-weight:400;color:#c4b5a4;margin:22px 0 10px;letter-spacing:.08em;text-transform:uppercase}'
        + '.g{display:flex;gap:14px;flex-wrap:wrap}a{color:inherit;text-decoration:none}'
        + '.t{background:linear-gradient(#1c1713,#14100d);border:1px solid #3a3026;border-radius:14px;padding:22px 0;width:220px;text-align:center;font-size:22px}'
        + '.t:active,.r:active{border-color:#e6a15c}.r{display:block;background:#14100d;border:1px solid #2b231b;border-radius:12px;padding:10px 16px;margin:0 0 8px;max-width:900px}'
        + '.r b{display:block;font-weight:400;font-size:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.r span{display:block;color:#8c7d6c;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
        + 'p{color:#8c7d6c;font-size:14px;margin:18px 0 0}</style></head><body><h1><b>THE</b>iPlay · Przeglądarka</h1><div class="g">' + tiles + '</div>'
        + (rec ? '<h2>Ostatnio otwierane</h2>' + rec : '')
        + '<p>Adres albo szukane słowa: pole adresu na górze.</p></body></html>';
    return 'data:text/html;charset=utf-8;base64,' + Buffer.from(html, 'utf8').toString('base64');
}
// what the user typed -> an http(s) URL (a search for anything that is not an address); null: refused
const HOST_RE = /^((\d{1,3}\.){3}\d{1,3}|([a-z0-9\u00a1-\uffff-]+\.)+[a-z\u00a1-\uffff]{2,})(:\d{1,5})?([/?#].*)?$/i;
function toUrl(text) {
    const t = String(text == null ? '' : text).trim();
    if (!t || t.length > 2000) return null;
    if (/^https?:\/\//i.test(t)) { try { return new URL(t).href; } catch (e) { return null; } }
    if (!/\s/.test(t) && HOST_RE.test(t)) { try { return new URL((/^\d/.test(t) && ipv4(t.split(/[:/?#]/)[0]) ? 'http://' : 'https://') + t).href; } catch (e) { /* a search then */ } }
    if (!/\s/.test(t) && /^[a-z][a-z0-9+.-]*:/i.test(t)) return null; // file:, chrome:, javascript:, data:, about: ...
    return SEARCH + encodeURIComponent(t);
}
function originOf(url) { try { const u = new URL(url); return u.protocol === 'data:' ? 'start page' : u.protocol + '//' + u.host; } catch (e) { return '?'; } }

const EDIT_PROBE = '(function(x,y){var e=document.activeElement;if(!e||e===document.body)return "";var t=e.tagName,k="";'
    + 'if(t==="TEXTAREA"||e.isContentEditable)k="text";else if(t==="INPUT"){var y2=(e.type||"text").toLowerCase();if(["text","search","url","email","tel","password","number"].indexOf(y2)>=0)k=y2;}'
    + 'if(!k)return "";var r=e.getBoundingClientRect();var inside=x>=r.left-8&&x<=r.right+8&&y>=r.top-8&&y<=r.bottom+8;'
    + 'var v=k==="password"?"":String(e.isContentEditable?(e.innerText||""):(e.value||"")).slice(0,256);var sub=false;'
    + 'if(t==="INPUT"){var f=e.form;if(k==="search")sub=true;else if(f){var n=0,els=f.elements;for(var i=0;i<els.length;i++){var q=els[i];if(q.tagName==="INPUT"&&["text","search","url","email","tel","password","number"].indexOf((q.type||"text").toLowerCase())>=0&&q.offsetParent!==null)n++;}sub=n===1;}}'
    + 'return JSON.stringify({kind:k,value:v,inside:inside,submit:sub,multi:t==="TEXTAREA"||!!e.isContentEditable});})';

// ---------------------------------------------------------------- the daemon
/*
 * The rules of the browser, in one file the owner can read and change: state/policy.json (root, 0600).
 * Only the keys below; a key that is missing or has a value that is not allowed keeps its default, and the
 * log says so. The file is read again before every start of the engine; the rules in force are written to
 * /run/g21-browser/policy.json (anyone may read it) with the problems found.
 *
 *   sandbox   "ask"       the engine runs in Chromium's sandbox; when it cannot, the screen asks the owner,
 *                         for that opening only (default)
 *             "required"  never without the sandbox: when it cannot, the browser shows an error
 *             "off"       always without the sandbox, no question
 *   gpu       "off"       the page is drawn on the CPU. The only value for now: the engine binary needs
 *                         gbm_bo_get_fd_for_plane, which the car's libgbm (Mesa 19.0.6) does not have, so it cannot
 *                         load the car's graphics libraries as they are (docs/ai/BROWSER_PLAN.md).
 *   picture   1 | 0.75 | 0.5   share of the screen's pixels the page is rendered at (default 0.75)
 *   homepage  ""          the built-in start page (default); or an address: what "home" and a new opening show
 *   autoplay  "allow"     films and sound may start by themselves (default)
 *             "gesture"   only after a touch or a click on the page
 *   fullscreen "screen"   a player that goes full screen gets the whole centre screen, the toolbar hidden (default)
 *             "page"      it fills the page area under the toolbar
 *   audio     "on"        pages are heard: the engine's sound goes to G21 Audio (the tool g21-audio), which takes
 *                         the car's speakers while a page plays and gives them back after (default)
 *             "off"       pages are silent
 *   memoryLimitMb  300..3000   the engine's processes together; above it the engine is stopped (default 900)
 *   network.blockPrivate  true: pages cannot reach loopback, private, link-local and Tailscale addresses (default)
 *   network.allow  ["127.0.0.1:1235", "192.168.0.10:*"]  exceptions to blockPrivate: exact IPv4 address and port
 *                  (or * for any port). This is how a page is let to a tool inside the car.
 */
const POLICY_DEFAULT = { version: 1, sandbox: 'ask', gpu: 'off', picture: 0.75, audio: 'on', homepage: '', autoplay: 'allow', fullscreen: 'screen', memoryLimitMb: 900, network: { blockPrivate: true, allow: [] } };
function readPolicy(file) {
    const p = JSON.parse(JSON.stringify(POLICY_DEFAULT)), problems = [];
    let raw = null, text = null;
    try { text = fs.readFileSync(file, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') problems.push('cannot read the file: ' + e.code); }
    if (text !== null) { try { raw = JSON.parse(text.replace(/^\uFEFF/, '')); } catch (e) { problems.push('not JSON, every rule is at its default'); } }
    if (raw && (typeof raw !== 'object' || Array.isArray(raw))) { problems.push('not an object, every rule is at its default'); raw = null; }
    if (raw) {
        const known = { version: 1, sandbox: 1, gpu: 1, picture: 1, audio: 1, homepage: 1, autoplay: 1, fullscreen: 1, memoryLimitMb: 1, network: 1 };
        Object.keys(raw).forEach((k) => { if (!known[k]) problems.push('unknown rule "' + String(k).slice(0, 40) + '" ignored'); });
        const pick = (k, ok) => { if (raw[k] === undefined) return; if (ok(raw[k])) p[k] = raw[k]; else problems.push('"' + k + '": value not allowed, default kept'); };
        pick('sandbox', (v) => ['ask', 'required', 'off'].indexOf(v) >= 0);
        pick('gpu', (v) => v === 'off');
        pick('picture', (v) => [1, 0.75, 0.5].indexOf(v) >= 0);
        pick('audio', (v) => v === 'on' || v === 'off');
        pick('homepage', (v) => typeof v === 'string' && v.length <= 300 && (v === '' || /^https?:\/\/[^\s]+$/.test(v)));
        pick('autoplay', (v) => v === 'allow' || v === 'gesture');
        pick('fullscreen', (v) => v === 'screen' || v === 'page');
        pick('memoryLimitMb', (v) => Number.isInteger(v) && v >= 300 && v <= 3000);
        const n = raw.network;
        if (n !== undefined) {
            if (!n || typeof n !== 'object' || Array.isArray(n)) problems.push('"network": not an object, default kept');
            else {
                if (n.blockPrivate !== undefined) { if (typeof n.blockPrivate === 'boolean') p.network.blockPrivate = n.blockPrivate; else problems.push('"network.blockPrivate": true or false, default kept'); }
                if (n.allow !== undefined) {
                    if (!Array.isArray(n.allow) || n.allow.length > 64) problems.push('"network.allow": a list of at most 64 entries, default kept');
                    else n.allow.forEach((a) => {
                        const m = typeof a === 'string' ? /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\*|\d{1,5})$/.exec(a) : null;
                        if (m && ipv4(m[1]) && (m[2] === '*' || (Number(m[2]) >= 1 && Number(m[2]) <= 65535))) p.network.allow.push(m[1].split('.').map(Number).join('.') + ':' + (m[2] === '*' ? '*' : Number(m[2])));
                        else problems.push('"network.allow": entry ' + JSON.stringify(a).slice(0, 40) + ' is not "a.b.c.d:port", ignored');
                    });
                }
            }
        }
    }
    return { policy: p, problems: problems, file: text !== null };
}
function Daemon(opts) {
    this.opts = Object.assign(defaults(), opts || {});
    this.opts.log = (m) => this.log(m);
    this.client = null;
    this.server = null;
    this.uid = null;
    this.proxy = null;
    this.proxyPort = 0;
    this.frame = null;      // g21-webframe child
    this.engine = null;     // { child, cdp, session, target, mainFrame }
    this.starting = null;   // promise of the running start
    this.want = null;       // { w, h } from the app's open
    this.zoom = 1.5;
    this.idleTimer = null;
    this.memTimer = null;
    this.pollTimer = null;
    this.lastSent = '';
    this.lastFrameAt = 0;
    this.frameBusy = false;
    this.pendingAck = null;
    this.popups = {};
    this.s = { engine: 'off', err: '', url: '', title: '', loading: false, back: false, fwd: false, live: false, w: 0, h: 0, ino: 0, editable: false, pct: 0 };
}
Daemon.prototype.log = function (msg) {
    const line = new Date().toISOString() + ' ' + msg + '\n';
    try {
        const f = path.join(this.opts.logDir, 'browserd.log');
        try { if (fs.statSync(f).size > 512 * 1024) fs.renameSync(f, f + '.1'); } catch (e) { /* no log yet */ }
        fs.appendFileSync(f, line);
    } catch (e) { process.stderr.write(line); }
};
Daemon.prototype.fault = function (e) { this.log('fault: ' + (e && e.stack || e)); };
Daemon.prototype.guard = function (fn) { try { const r = fn(); if (r && typeof r.catch === 'function') r.catch((e) => this.fault(e)); } catch (e) { this.fault(e); } };

Daemon.prototype.emit = function (o) {
    if (!this.client) return;
    try { this.client.write(JSON.stringify(o) + '\n'); } catch (e) { /* gone */ }
};
Daemon.prototype.push = function (force) {
    const s = this.s;
    const start = /^data:/.test(s.url);
    const o = { ev: 'state', engine: s.engine, err: s.err, url: start ? '' : s.url, title: start ? 'Strona startowa' : s.title, loading: s.loading, back: s.back, fwd: s.fwd,
        live: s.live, w: s.w, h: s.h, ino: s.ino, zoom: this.zoom, editable: s.editable, pct: s.pct, ring: this.opts.ring, ask: s.ask || '',
        pol: { sandbox: this.policy().sandbox, picture: this.policy().picture, memoryLimitMb: this.policy().memoryLimitMb, audio: this.policy().audio, sound: this.audio ? 'g21-audio' : 'none',
            homepage: this.policy().homepage, autoplay: this.policy().autoplay, fullscreen: this.policy().fullscreen }, fs: !!this.fs };
    const text = JSON.stringify(o);
    if (!force && text === this.lastSent) return;
    this.lastSent = text;
    this.emit(o);
};
Daemon.prototype.set = function (patch) { Object.assign(this.s, patch); this.push(); };

Daemon.prototype.settings = function () { return readJson(path.join(this.opts.stateDir, 'settings.json')) || {}; };
Daemon.prototype.saveSettings = function (patch) {
    try { mkdirp(this.opts.stateDir, 0o700); writeIfChanged(path.join(this.opts.stateDir, 'settings.json'), JSON.stringify(Object.assign(this.settings(), patch)) + '\n', 0o600); } catch (e) { this.log('settings: ' + e.message); }
};
// last pages for the start page: address without query and fragment (those can carry tokens)
Daemon.prototype.remember = function (url, title) {
    let u;
    try { u = new URL(url); } catch (e) { return; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return;
    const clean = u.origin + u.pathname;
    const file = path.join(this.opts.stateDir, 'recent.json');
    let rec = readJson(file);
    if (!Array.isArray(rec)) rec = [];
    rec = rec.filter((r) => r && r.url !== clean);
    rec.unshift({ url: clean, title: String(title || '').slice(0, 80) });
    try { mkdirp(this.opts.stateDir, 0o700); writeIfChanged(file, JSON.stringify(rec.slice(0, 12)) + '\n', 0o600); } catch (e) { this.log('recent: ' + e.message); }
};
Daemon.prototype.home = function () { return this.policy().homepage || startPage(readJson(path.join(this.opts.stateDir, 'recent.json'))); };

// ---- control socket
Daemon.prototype.listen = function () {
    const sock = this.opts.sock;
    try { mkdirp(path.dirname(sock)); } catch (e) { this.log('socket dir: ' + e.message); }
    try { fs.unlinkSync(sock); } catch (e) { /* none */ }
    this.server = net.createServer((c) => this.guard(() => this.onClient(c)));
    this.server.on('error', (e) => this.log('ctl server: ' + e.message));
    this.server.listen(sock, () => {
        try { fs.chmodSync(sock, 0o660); } catch (e) { this.log('chmod ctl.sock: ' + e.message); }
        try { fs.chownSync(sock, 0, this.opts.sockGid); } catch (e) { /* not root (tests) */ }
        this.log('listening on ' + sock);
    });
};
Daemon.prototype.onClient = function (c) {
    if (this.client) {
        const old = this.client;
        this.client = null;
        old.destroy();
    }
    this.client = c;
    clearTimeout(this.idleTimer);
    c.setEncoding('utf8');
    let buf = '';
    c.on('data', (d) => {
        buf += d;
        if (buf.length > 65536) { this.log('client line too long'); c.destroy(); return; }
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, i);
            buf = buf.slice(i + 1);
            let m = null;
            try { m = JSON.parse(line); } catch (e) { continue; }
            if (m && typeof m.op === 'string') this.guard(() => this.onCommand(m));
        }
    });
    c.on('error', () => { /* close follows */ });
    c.on('close', () => {
        if (this.client !== c) return;
        this.client = null;
        this.lastSent = '';
        this.guard(() => this.away());
    });
    this.push(true);
};
// the app went away: no more frames now, the engine a little later
Daemon.prototype.away = async function () {
    const e = this.engine;
    if (e) { try { await e.cdp.send('Page.stopScreencast', {}, e.session); } catch (x) { /* gone */ } }
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.guard(() => { this.sandboxOff = false; return this.stopEngine('idle'); }), this.opts.idleMs);
};

Daemon.prototype.onCommand = async function (m) {
    const e = this.engine;
    switch (m.op) {
    case 'open': {
        const w = Math.max(320, Math.min(1920, Number(m.w) | 0)) & ~3, h = Math.max(200, Math.min(1080, Number(m.h) | 0)) & ~1;
        const z = ZOOMS.indexOf(Number(m.zoom)) >= 0 ? Number(m.zoom) : (ZOOMS.indexOf(Number(this.settings().zoom)) >= 0 ? Number(this.settings().zoom) : 1.5);
        clearTimeout(this.idleTimer);
        if (this.engine && this.want && (this.want.w !== w || this.want.h !== h || this.zoom !== z)) await this.stopEngine('new size');
        // fw x fh: the whole centre screen, for a player that goes full screen
        const fw = Math.max(0, Math.min(3840, Number(m.fw) | 0)) & ~3, fh = Math.max(0, Math.min(2160, Number(m.fh) | 0)) & ~1;
        this.want = { w: w, h: h, fw: fw >= w && fh >= h ? fw : 0, fh: fw >= w && fh >= h ? fh : 0 };
        this.zoom = z;
        // an app from Sklep: its first page instead of the start page
        const appUrl = m.app ? await this.appUrl(String(m.app)) : null;
        if (m.app && !appUrl) { this.set({ engine: 'failed', err: 'nie ma takiej aplikacji', loading: false, live: false }); return; }
        // (the proxy that runs was started before the apps' server: it does not let the engine reach it)
        if (this.engine && appUrl && String(this.proxyKey || '').indexOf('127.0.0.1:' + this.appsPort) < 0) await this.stopEngine('an app is opened');
        if (this.engine) {
            await this.cast(true);
            if (appUrl) { this.set({ err: '', loading: true }); await this.engine.cdp.send('Page.navigate', { url: appUrl }, this.engine.session); }
            this.push(true);
            return;
        }
        await this.startEngine(appUrl);
        return;
    }
    case 'close': this.want = null; this.sandboxOff = false; await this.stopEngine('closed by the app'); return;
    case 'zoom': {
        const z = Number(m.z);
        if (ZOOMS.indexOf(z) < 0 || z === this.zoom) return;
        this.zoom = z;
        this.saveSettings({ zoom: z });
        if (this.want) { const url = /^https?:/.test(this.s.url) ? this.s.url : null; await this.stopEngine('zoom'); await this.startEngine(url); } else this.push(true);
        return;
    }
    default: break;
    }
    if (m.op === 'policy') {
        // A rule set from THEiPlay's menu (Aplikacje > Ustawienia). Only these three, and never "sandbox": "off" or a
        // network rule: those are the owner's to write in state/policy.json. The file is written whole, as it is in force.
        // (an address for the start page: what the owner typed, made an address as the address bar does)
        if (String(m.key) === 'homepage' && typeof m.value === 'string') m.value = m.value.trim() === '' ? '' : (toUrl(m.value) || '\u0000');
        const ok = { homepage: (v) => typeof v === 'string' && v.length <= 300 && (v === '' || /^https?:\/\/[^\s]+$/.test(v)), autoplay: (v) => v === 'allow' || v === 'gesture', fullscreen: (v) => v === 'screen' || v === 'page',
            audio: (v) => v === 'on' || v === 'off', picture: (v) => [1, 0.75, 0.5].indexOf(v) >= 0, memoryLimitMb: (v) => Number.isInteger(v) && v >= 300 && v <= 3000, sandbox: (v) => v === 'ask' || v === 'required' };
        const key = String(m.key);
        if (!Object.prototype.hasOwnProperty.call(ok, key) || !ok[key](m.value)) { this.log('policy: "' + key.slice(0, 20) + '" from the app refused'); return; }
        const next = readPolicy(this.opts.policyFile).policy;
        if (key === 'sandbox' && next.sandbox === 'off') { this.log('policy: "sandbox": "off" is in the file; the app cannot change it'); this.push(true); return; }
        const pictureWas = this.picture(), audioWas = this.policy().audio, autoplayWas = this.policy().autoplay;
        next[key] = m.value;
        mkdirp(this.opts.stateDir, 0o700);
        const tmp = this.opts.policyFile + '.new';
        fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
        fs.renameSync(tmp, this.opts.policyFile);
        this.log('policy: "' + key + '" set to ' + JSON.stringify(m.value) + ' from the app');
        this.loadPolicy();
        this.push(true);
        // a new picture size needs the engine started again, on the page it shows
        if (e && this.want && (this.picture() !== pictureWas || this.policy().audio !== audioWas || this.policy().autoplay !== autoplayWas)) { const url = /^https?:/.test(this.s.url) ? this.s.url : null; await this.stopEngine('picture'); await this.startEngine(url); }
        return;
    }
    if (m.op === 'apps') { this.tellApps(); return; }
    if (m.op === 'app-install') {
        if (this.appBusy) { this.emit({ ev: 'app', phase: 'failed', err: 'trwa inny import' }); return; }
        this.appBusy = true;
        try {
            const done = await this.installApp(m.repo);
            this.emit({ ev: 'app', phase: 'done', id: done.id, name: done.name });
        } catch (x) {
            this.log('app: import failed: ' + x.message);
            this.emit({ ev: 'app', phase: 'failed', err: x.user ? x.message : 'import się nie udał' });
        } finally { this.appBusy = false; }
        this.tellApps();
        return;
    }
    if (m.op === 'app-remove') { this.removeApp(m.id); this.tellApps(); return; }
    if (m.op === 'sandbox-off') {
        // the owner's answer on the screen; only to the question this daemon asked
        if (this.s.ask !== 'sandbox' || !this.want || this.starting || this.policy().sandbox !== 'ask') return;
        this.sandboxOff = true;
        this.log('sandbox off: allowed by the owner on the screen, for this opening');
        await this.startEngine(null);
        return;
    }
    if (!e) {
        if ((m.op === 'reload' || m.op === 'home' || m.op === 'nav') && this.want && !this.starting) await this.startEngine(m.op === 'nav' ? toUrl(m.url) : null);
        return;
    }
    const send = (method, params) => e.cdp.send(method, params, e.session);
    // (in full screen the picture is the whole screen at its own scale, not the zoom's)
    const z = this.fs ? this.fs.scale : this.zoom;
    switch (m.op) {
    case 'nav': {
        const url = toUrl(m.url);
        if (!url) { this.set({ err: 'zły adres' }); return; }
        this.log('nav ' + originOf(url));
        this.set({ err: '', loading: true });
        await send('Page.navigate', { url: url });
        return;
    }
    case 'home': this.set({ err: '', loading: true }); await send('Page.navigate', { url: this.home() }); return;
    case 'reload': this.set({ err: '' }); await send('Page.reload', {}); return;
    case 'stop': await send('Page.stopLoading', {}); this.set({ loading: false }); return;
    case 'back':
    case 'fwd': {
        const hst = await send('Page.getNavigationHistory', {});
        const i = hst.currentIndex + (m.op === 'back' ? -1 : 1);
        if (hst.entries[i]) await send('Page.navigateToHistoryEntry', { entryId: hst.entries[i].id });
        return;
    }
    case 'touch': {
        const x = Math.max(0, Number(m.x) || 0) / z, y = Math.max(0, Number(m.y) || 0) / z;
        const p = Number(m.p);
        if (p === 1) { e.down = { x: x, y: y, moved: false }; await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x, y: y }] }); }
        else if (p === 2 && e.down) { if (Math.abs(x - e.down.x) + Math.abs(y - e.down.y) > 12) e.down.moved = true; await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x, y: y }] }); }
        else if (p === 3 && e.down) {
            const d = e.down;
            e.down = null;
            await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            if (!d.moved) setTimeout(() => this.guard(() => this.probeEdit(e, d.x, d.y)), 180);
            setTimeout(() => this.guard(() => this.refresh(e)), 350);
        }
        return;
    }
    case 'mouse': {
        // G21 Input: a real mouse for the page (the cursor is the app's; here are the events). x, y in the page area's
        // screen pixels, as touch. Hover, links, buttons, text selection and dragging are the engine's own.
        const x = Math.max(0, Number(m.x) || 0) / z, y = Math.max(0, Number(m.y) || 0) / z;
        if (m.t === 'move') await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x, y: y, button: m.down ? 'left' : 'none', buttons: m.down ? 1 : 0 });
        else if (m.t === 'down') { e.mouseDown = { x: x, y: y }; await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x, y: y, button: 'left', buttons: 1, clickCount: 1 }); }
        else if (m.t === 'up') {
            const d = e.mouseDown;
            e.mouseDown = null;
            await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x, y: y, button: 'left', buttons: 0, clickCount: 1 });
            // a click (not a drag) on a text field: the app's keyboard, as after a tap
            if (d && Math.abs(x - d.x) + Math.abs(y - d.y) <= 12) setTimeout(() => this.guard(() => this.probeEdit(e, x, y)), 180);
            setTimeout(() => this.guard(() => this.refresh(e)), 350);
        }
        return;
    }
    case 'scroll':
        await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: Math.round(this.want.w / z / 2), y: Math.round(this.want.h / z / 2), deltaX: (Number(m.dx) || 0) / z, deltaY: (Number(m.dy) || 0) / z });
        return;
    case 'text': {
        const s = String(m.s == null ? '' : m.s).slice(0, 2000);
        if (m.replace) await send('Runtime.evaluate', { expression: '(function(){var e=document.activeElement;if(e&&e.select)e.select();else document.execCommand("selectAll");})()' });
        if (s) await send('Input.insertText', { text: s });
        else if (m.replace) await this.key(e, 'Backspace');
        if (m.enter) await this.key(e, 'Enter');
        return;
    }
    case 'key': await this.key(e, String(m.k)); return;
    default: return;
    }
};
Daemon.prototype.key = async function (e, k) {
    const K = { Enter: [13, '\r'], Backspace: [8, ''], Tab: [9, ''], Escape: [27, ''] }[k];
    if (!K) return;
    const base = { key: k, code: k, windowsVirtualKeyCode: K[0], nativeVirtualKeyCode: K[0] };
    await e.cdp.send('Input.dispatchKeyEvent', Object.assign({ type: K[1] ? 'keyDown' : 'rawKeyDown' }, base, K[1] ? { text: K[1] } : {}), e.session);
    await e.cdp.send('Input.dispatchKeyEvent', Object.assign({ type: 'keyUp' }, base), e.session);
};
// after a tap: is the focus in a text field under the finger? Then the app opens its keyboard.
Daemon.prototype.probeEdit = async function (e, x, y) {
    if (this.engine !== e) return;
    let r;
    try { r = await e.cdp.send('Runtime.evaluate', { expression: EDIT_PROBE + '(' + Math.round(x) + ',' + Math.round(y) + ')', returnByValue: true }, e.session); } catch (x2) { return; }
    let info = null;
    try { info = r.result && r.result.value ? JSON.parse(r.result.value) : null; } catch (x3) { info = null; }
    this.set({ editable: !!info });
    if (info && info.inside) this.emit({ ev: 'edit', kind: info.kind, value: info.value, submit: !!info.submit, multi: !!info.multi });
};

// ---- children
Daemon.prototype.ids = function () { return this.opts.noSetuid ? {} : { uid: this.uid, gid: this.uid }; };
// the rules in force: read before every engine start, written out for reading, changes logged
Daemon.prototype.loadPolicy = function () {
    const r = readPolicy(this.opts.policyFile);
    const text = JSON.stringify({ policy: r.policy, fromFile: r.file ? this.opts.policyFile : null, problems: r.problems }, null, 2) + '\n';
    if (text !== this.policyText) {
        this.policyText = text;
        this.log('policy' + (r.file ? '' : ' (no state/policy.json: defaults)') + ': ' + JSON.stringify(r.policy) + (r.problems.length ? '; problems: ' + r.problems.join('; ') : ''));
        try { mkdirp(path.dirname(this.opts.policyOut)); writeIfChanged(this.opts.policyOut, text, 0o644); } catch (e) { this.log('policy: cannot write ' + this.opts.policyOut + ': ' + e.message); }
    }
    this.pol = r.policy;
    return r.policy;
};
Daemon.prototype.policy = function () { return this.pol || this.loadPolicy(); };
Daemon.prototype.picture = function () { return this.opts.picture || this.policy().picture; };
Daemon.prototype.startProxy = function () {
    // (the network rules changed: the proxy that runs has the old ones)
    const net1 = this.policy().network;
    const allow1 = net1.allow.concat(this.appsPort ? ['127.0.0.1:' + this.appsPort] : []);
    const want = [__filename, '--proxy', this.opts.leaseFile].concat(this.opts.allowLocal || !net1.blockPrivate ? ['--allow-local'] : []).concat(allow1.length ? ['--allow=' + allow1.join(',')] : []).join(' ');
    if (this.proxy && this.proxyKey !== want) { const old = this.proxy; this.proxy = null; this.proxyPort = 0; this.log('proxy: network rules changed, starting it again'); try { old.kill('SIGKILL'); } catch (e) { /* gone */ } }
    if (this.proxy) return Promise.resolve(this.proxyPort);
    return new Promise((resolve, reject) => {
        const net0 = this.policy().network;
        const allow0 = net0.allow.concat(this.appsPort ? ['127.0.0.1:' + this.appsPort] : []);
        const args = [__filename, '--proxy', this.opts.leaseFile].concat(this.opts.allowLocal || !net0.blockPrivate ? ['--allow-local'] : []).concat(allow0.length ? ['--allow=' + allow0.join(',')] : []);
        this.proxyKey = args.join(' ');
        const child = cp.spawn(process.execPath, args, Object.assign(this.ids(), { cwd: '/', env: {}, stdio: ['pipe', 'pipe', 'pipe'] }));
        let out = '', settled = false;
        const timer = setTimeout(() => { if (!settled) { settled = true; child.kill('SIGKILL'); reject(new UserError('proxy nie wystartowało')); } }, 5000);
        child.stdout.on('data', (d) => {
            out += d;
            const m = /port (\d+)/.exec(out);
            if (m && !settled) { settled = true; clearTimeout(timer); this.proxy = child; this.proxyPort = Number(m[1]); resolve(this.proxyPort); }
        });
        child.stderr.on('data', (d) => this.log('proxy: ' + String(d).trim().slice(0, 300)));
        child.on('error', (e) => { if (!settled) { settled = true; clearTimeout(timer); reject(e); } });
        child.on('exit', (code) => {
            if (this.proxy === child) { this.proxy = null; this.proxyPort = 0; this.log('proxy exited ' + code); }
            if (!settled) { settled = true; clearTimeout(timer); reject(new Error('proxy exited ' + code)); }
        });
    });
};
/*
 * mgu-renderd shows /dev/shm/mgu-video-* only when the file is the app's or root's ("is not the app's (owner uid 12710)"
 * on the car, 0.1.2: the page area stayed empty). The decoder runs as the engine uid, so root takes the file over once
 * the decoder has made it; the decoder keeps writing through the descriptor it holds. In /dev/shm (sticky) the engine uid
 * can then neither replace nor remove it. Opened without following a link, and only the file the decoder named.
 */
Daemon.prototype.adoptRing = function (ino) {
    if (this.opts.noSetuid || !process.getuid || process.getuid() !== 0) return;
    let fd = -1;
    try {
        fd = fs.openSync(this.opts.ring, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        const st = fs.fstatSync(fd);
        if (!st.isFile() || st.nlink !== 1 || Number(st.ino) !== ino || (st.uid !== this.uid && st.uid !== 0)) throw new Error('not the decoder\'s file');
        if (st.uid !== 0) fs.fchownSync(fd, 0, st.gid);
        fs.fchmodSync(fd, 0o644);
    } catch (e) { this.log('video file not taken over (the renderer will not draw it): ' + e.message); }
    if (fd >= 0) { try { fs.closeSync(fd); } catch (e) { /* closed */ } }
};
/*
 * The engine's sound. G21 Audio (g21-audiod, the tool g21-audio) gives a FIFO for this engine's uid; the engine's own
 * ALSA library (lib/libasound.so.2, not the car's) gets a configuration with one device, "g21out": a file device that
 * writes what the engine plays, raw, into that FIFO. G21 Audio's writer reads it in real time and plays it into the
 * car's SmartX device with the car's ALSA. The two C libraries never meet in one process. The connection to G21
 * Audio stays open while the engine runs; closing it closes the stream. No G21 Audio, or policy "audio": "off":
 * the engine has no sound device (this.audio = null).
 */
// ---- apps from git
Daemon.prototype.appsList = function () {
    const j = readJson(path.join(this.opts.stateDir, 'apps.json'));
    return (j && Array.isArray(j.apps) ? j.apps : []).filter((a) => a && /^[a-z0-9-]{1,60}$/.test(a.id) && fs.existsSync(path.join(this.opts.appsDir, a.id)));
};
Daemon.prototype.saveApps = function (apps) {
    mkdirp(this.opts.stateDir, 0o700);
    writeIfChanged(path.join(this.opts.stateDir, 'apps.json'), JSON.stringify({ apps: apps }, null, 2) + '\n', 0o600);
};
Daemon.prototype.tellApps = function () {
    this.emit({ ev: 'apps', list: this.appsList().map((a) => ({ id: a.id, name: String(a.name || a.id), repo: String(a.repo || ''), mouse: a.mouse === 'yes' ? 'yes' : 'no' })) });
};
Daemon.prototype.installApp = async function (text) {
    const o = this.opts, r = parseRepo(text);
    if (!r) throw new UserError('podaj repozytorium GitHub: właściciel/nazwa');
    if (this.uid === null && !o.noSetuid) {
        this.uid = pickEngineUid(o);
        if (this.uid === null) throw new UserError('brak wolnego uid dla silnika (zobacz log)');
    }
    const dl = path.join(o.cacheDir, 'download-app'), tgz = path.join(dl, 'app.tgz'), tmp = path.join(o.appsDir, r.id + '.new'), dest = path.join(o.appsDir, r.id);
    const ids = this.ids();
    mkdirp(o.cacheDir, 0o711);
    rmrf(dl); rmrf(tmp);
    fs.mkdirSync(dl, { mode: 0o700 });
    if (ids.uid !== undefined) fs.chownSync(dl, ids.uid, ids.gid);
    try {
        this.log('app: downloading ' + r.owner + '/' + r.repo + ' (' + r.ref + ')');
        this.emit({ ev: 'app', phase: 'downloading', pct: 0 });
        try { await fetchEngine(o, r.url, tgz, ids, (pct) => this.emit({ ev: 'app', phase: 'downloading', pct: pct })); }
        catch (e) { throw new UserError('nie udało się pobrać repozytorium: czy jest publiczne i czy auto ma internet?'); }
        const st = fs.lstatSync(tgz);
        if (!st.isFile() || st.size > APP_LIMITS.archive) throw new UserError('repozytorium jest za duże');
        mkdirp(o.appsDir, 0o755);
        fs.mkdirSync(tmp, { mode: 0o755 });
        this.emit({ ev: 'app', phase: 'unpacking', pct: 0 });
        const got = untarGz(tgz, tmp, APP_LIMITS);
        const meta = readJson(path.join(tmp, 'theiplay.json')) || {};
        const man = readJson(path.join(tmp, 'manifest.json')) || readJson(path.join(tmp, 'manifest.webmanifest')) || {};
        let start = typeof meta.start === 'string' ? meta.start : (typeof man.start_url === 'string' ? man.start_url : '');
        start = start.split('?')[0].split('#')[0].replace(/^[.\/]+/, '');
        if (/\.\.|\\|^[a-z]+:/i.test(start) || (start && !fs.existsSync(path.join(tmp, start)))) start = '';
        if (!start && !fs.existsSync(path.join(tmp, 'index.html'))) throw new UserError('w repozytorium nie ma strony index.html');
        const name = String(meta.name || man.short_name || man.name || r.repo).replace(/[\u0000-\u001f]/g, '').slice(0, 40) || r.repo;
        rmrf(dest);
        fs.renameSync(tmp, dest);
        const apps = this.appsList().filter((a) => a.id !== r.id);
        apps.push({ id: r.id, name: name, repo: r.owner + '/' + r.repo, ref: r.ref, start: start, mouse: meta.mouse === 'yes' ? 'yes' : 'no', files: got.files, bytes: got.bytes, at: new Date().toISOString() });
        this.saveApps(apps);
        this.log('app: installed ' + r.id + ' (' + got.files + ' files, ' + Math.round(got.bytes / 1024) + ' KiB, mouse ' + (meta.mouse === 'yes' ? 'yes' : 'no') + ')');
        return { id: r.id, name: name };
    } catch (e) {
        rmrf(tmp);
        throw e;
    } finally { rmrf(dl); }
};
Daemon.prototype.removeApp = function (id) {
    if (!/^[a-z0-9-]{1,60}$/.test(String(id))) return;
    rmrf(path.join(this.opts.appsDir, String(id)));
    this.saveApps(this.appsList().filter((a) => a.id !== id));
    this.log('app: removed ' + id);
};
// the apps' file server (a child, as the engine's uid); resolves to its port, 0 when there is none
Daemon.prototype.startApps = function () {
    if (this.appsProc) return Promise.resolve(this.appsPort);
    if (!this.appsList().length) return Promise.resolve(0);
    return new Promise((resolve) => {
        const child = cp.spawn(process.execPath, [__filename, '--apps', this.opts.appsDir], Object.assign(this.ids(), { cwd: '/', env: {}, stdio: ['pipe', 'pipe', 'pipe'] }));
        let out = '', done = false;
        const end = (port) => { if (done) return; done = true; clearTimeout(t); resolve(port); };
        const t = setTimeout(() => { this.log('apps server: no port'); try { child.kill('SIGKILL'); } catch (e) { /* gone */ } end(0); }, 4000);
        child.stdout.on('data', (d) => { out += d; const m = /port (\d+)/.exec(out); if (m) { this.appsProc = child; this.appsPort = Number(m[1]); this.log('apps server on 127.0.0.1:' + this.appsPort); end(this.appsPort); } });
        child.stderr.on('data', (d) => this.log('apps server: ' + String(d).trim().slice(0, 200)));
        child.on('error', (e) => { this.log('apps server: ' + e.message); end(0); });
        child.on('exit', () => { if (this.appsProc === child) { this.appsProc = null; this.appsPort = 0; } end(0); });
    });
};
// the address of an app's first page, or null (unknown app, no server)
Daemon.prototype.appUrl = async function (id) {
    const a = this.appsList().filter((x) => x.id === id)[0];
    if (!a) return null;
    const port = await this.startApps();
    return port ? 'http://127.0.0.1:' + port + '/' + a.id + '/' + (a.start || '') : null;
};
Daemon.prototype.openAudio = function () {
    this.closeAudio();
    if (this.policy().audio !== 'on') return Promise.resolve();
    const uid = this.opts.noSetuid ? (process.getuid ? process.getuid() : 0) : this.uid;
    return new Promise((resolve) => {
        let done = false, buf = '';
        const c = net.connect(this.opts.audioSock);
        const end = (why) => { if (done) return; done = true; clearTimeout(t); if (why) { this.log('sound: no G21 Audio (' + why + '): pages are silent'); try { c.destroy(); } catch (e) { /* gone */ } } resolve(); };
        const t = setTimeout(() => end('no answer'), 3000);
        c.setEncoding('utf8');
        c.on('connect', () => c.write(JSON.stringify({ op: 'open', name: 'chromium', uid: uid }) + '\n'));
        c.on('error', (e) => end(e.code || e.message));
        c.on('close', () => { if (this.audio && this.audio.conn === c) { this.audio = null; this.log('sound: G21 Audio went away'); } end('closed'); });
        c.on('data', (d) => {
            buf += d;
            const i = buf.indexOf('\n');
            if (i < 0 || done) return;
            let m = null;
            try { m = JSON.parse(buf.slice(0, i)); } catch (e) { m = null; }
            if (!m || m.ev !== 'open' || !m.ok || typeof m.fifo !== 'string' || !/^\/[A-Za-z0-9._\/-]+$/.test(m.fifo)) return end(m && m.err ? String(m.err) : 'refused');
            const conf = path.join(this.opts.runDir, 'asound.conf');
            try {
                mkdirp(this.opts.runDir);
                writeIfChanged(conf, 'pcm.g21null {\n    type null\n}\npcm.g21out {\n    type file\n    slave.pcm "g21null"\n    file "' + m.fifo + '"\n    format "raw"\n}\npcm.!default {\n    type plug\n    slave.pcm "g21out"\n}\n', 0o644);
            } catch (e) { return end('asound.conf: ' + e.message); }
            this.audio = { conn: c, fifo: m.fifo, conf: conf };
            this.log('sound: G21 Audio stream ' + m.fifo);
            end('');
        });
    });
};
Daemon.prototype.closeAudio = function () {
    const a = this.audio;
    this.audio = null;
    if (a) { try { a.conn.end(JSON.stringify({ op: 'close' }) + '\n'); } catch (e) { /* gone */ } }
};
/*
 * Full screen. A player that goes full screen fills the engine's window; with policy "fullscreen": "screen" the
 * window then becomes the whole centre screen in its own shape (fw x fh, rendered at two thirds: 1280 x 480 for
 * 1920 x 720), so a film keeps its proportions, and the app draws it over the whole screen with the toolbar
 * hidden. Back out of full screen the window is the page area again.
 */
Daemon.prototype.applyFs = async function (e, on) {
    const w = this.want;
    const whole = on && w && w.fw > 0 && this.policy().fullscreen === 'screen';
    if (whole === !!this.fs || this.fsBusy) return;
    this.fsBusy = true;
    try {
    const send = (params) => e.cdp.send('Emulation.setDeviceMetricsOverride', params, e.session);
    if (whole) {
        const cw = Math.round(w.fw * 2 / 3) & ~3, ch = Math.round(w.fh * 2 / 3) & ~1;
        await send({ width: cw, height: ch, deviceScaleFactor: 1, mobile: false, screenWidth: cw, screenHeight: ch });
        this.fs = { w: w.fw, h: w.fh, scale: w.fw / cw };
        this.log('full screen: the whole centre screen ' + w.fw + 'x' + w.fh + ' (picture ' + cw + 'x' + ch + ')');
        this.set({ w: w.fw, h: w.fh });
    } else {
        const css = pageCss(w.w, w.h, this.zoom, this.picture());
        this.fs = null;
        await send({ width: css.w, height: css.h, deviceScaleFactor: css.scale, mobile: false, screenWidth: css.w, screenHeight: css.h });
        this.log('full screen left: the page area again');
        this.set({ w: css.dw, h: css.dh });
    }
    } finally { this.fsBusy = false; }
    this.push(true);
};
Daemon.prototype.startFrame = function () {
    if (this.frame) return;
    let colour = (lines(path.join(this.opts.stateDir, 'color'))[0] || '').trim();
    if (['601', '709', 'full'].indexOf(colour) < 0) colour = '601';
    try { fs.unlinkSync(this.opts.ring); } catch (e) { /* none */ }
    try { fs.unlinkSync(this.opts.ring + '.ring'); } catch (e) { /* none */ }
    const child = cp.spawn(this.opts.webframe, [this.opts.ring, colour], Object.assign(this.ids(), { cwd: '/', env: {}, stdio: ['pipe', 'pipe', 'ignore'] }));
    this.frame = child;
    let buf = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (d) => {
        buf += d;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
            const l = buf.slice(0, i).split(' ');
            buf = buf.slice(i + 1);
            if (l[0] === 'ring') { this.adoptRing(Number(l[3])); const on = this.fs ? { dw: this.fs.w, dh: this.fs.h } : (this.want ? pageCss(this.want.w, this.want.h, this.zoom, this.picture()) : null); this.set({ w: on ? on.dw : Number(l[1]), h: on ? on.dh : Number(l[2]), ino: Number(l[3]), live: false }); }
            else if (l[0] === 'f') { if (!this.s.live) this.set({ live: true }); this.frameDone(); }
            else if (l[0] === 'e') {
                const what = l.slice(1).join(' ');
                // The engine sent a picture of another size and the decoder could not put a new video file in place of the
                // one root took over (on the car, 0.1.3: a player went full screen, 253 x "Operation not permitted", the
                // picture stood still). Root removes the old file; the decoder makes the new one with the next frame.
                if (/^video file/.test(what)) { try { fs.unlinkSync(this.opts.ring); } catch (x) { /* none */ } if (this.s.live) this.set({ live: false, ino: 0 }); }
                const now = Date.now();
                if (what !== this.frameErr || now - (this.frameErrAt || 0) > 5000) { this.frameErr = what; this.frameErrAt = now; this.log('webframe: ' + what); }
                this.frameDone();
            }
        }
    });
    child.stdin.on('error', () => { /* exit follows */ });
    child.on('error', (e) => { this.log('webframe: ' + e.message); if (this.frame === child) this.frame = null; });
    child.on('exit', (code, sig) => {
        if (this.frame !== child) return;
        this.frame = null;
        this.frameBusy = false;
        this.set({ live: false, ino: 0 });
        if (this.engine) { this.log('webframe exited ' + (sig || code) + ', starting it again'); this.startFrame(); this.frameDone(); }
    });
};
Daemon.prototype.onFrame = function (e, p) {
    const ack = () => { if (this.engine === e) e.cdp.send('Page.screencastFrameAck', { sessionId: p.sessionId }, e.session).catch(() => {}); };
    if (!this.client || !this.frame || this.frameBusy) { ack(); return; } // (one frame in flight; nobody watching: dropped)
    const jpg = Buffer.from(p.data, 'base64');
    const len = Buffer.alloc(4);
    len.writeUInt32LE(jpg.length, 0);
    this.frameBusy = true;
    this.pendingAck = ack;
    try { this.frame.stdin.write(len); this.frame.stdin.write(jpg); } catch (x) { this.frameDone(); }
};
// g21-webframe has the frame in the video file: the engine may send the next one (not faster than frameGapMs)
Daemon.prototype.frameDone = function () {
    const ack = this.pendingAck;
    this.pendingAck = null;
    this.frameBusy = false;
    if (!ack) return;
    const wait = Math.max(0, this.opts.frameGapMs - (Date.now() - this.lastFrameAt));
    this.lastFrameAt = Date.now() + wait;
    if (wait) setTimeout(ack, wait); else ack();
};

/*
 * The engine's sandbox is never switched off on the tool's own decision. An engine that cannot have its
 * sandbox does not start and the state says ask: "sandbox"; the owner's answer (op "sandbox-off") holds
 * until the browser is closed or left, so every opening asks again (owner, 2026-11-15: ask every time until
 * the sandbox works on the car). Nothing is kept on disk; state/sandbox of 0.1.2 is removed.
 */
function askSandbox() { const e = new UserError('system auta nie pozwala na piaskownicę silnika'); e.ask = 'sandbox'; return e; }
Daemon.prototype.sandboxAllowedOff = function () { return this.sandboxOff === true; };
Daemon.prototype.sandboxPossible = function () {
    if (this.opts.forceSandbox) return true; // tests: try it and see
    if (this.opts.noSetuid && process.getuid && process.getuid() === 0) return false; // the engine refuses root with its sandbox
    if (this.helper) return true; // the setuid helper is in place: no user namespaces needed
    const n = Number((lines('/proc/sys/user/max_user_namespaces')[0] || '').trim());
    const clone = (lines('/proc/sys/kernel/unprivileged_userns_clone')[0] || '1').trim();
    return n > 0 && clone !== '0';
};
/*
 * Chromium's setuid sandbox helper beside the engine, as Chromium wants it: owned by root, mode 4755, in a directory only
 * root can write. The head unit's kernel has no user namespaces (/proc/self/ns has no "user"), so without the helper
 * the engine has "No usable sandbox". Returns its path, or '' when it cannot be there (not root, a nosuid file system).
 */
function installHelper(o, dir, log) {
    if (o.noSetuid || !process.getuid || process.getuid() !== 0) return '';
    const dest = path.join(dir, 'chrome-sandbox');
    try {
        const src = fs.readFileSync(o.sandboxHelper);
        const ds = fs.statSync(dir);
        if (ds.uid !== 0 || (ds.mode & 0o022)) throw new Error('the engine directory is not root\'s alone');
        let same = false;
        try { const st = fs.lstatSync(dest); same = st.isFile() && st.uid === 0 && st.gid === 0 && (st.mode & 0o7777) === 0o4755 && st.size === src.length && fs.readFileSync(dest).equals(src); } catch (e) { /* none */ }
        if (!same) {
            const tmp = dest + '.new';
            try { fs.unlinkSync(tmp); } catch (e) { /* none */ }
            const fd = fs.openSync(tmp, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o700);
            try { fs.writeSync(fd, src); fs.fchownSync(fd, 0, 0); fs.fchmodSync(fd, 0o4755); } finally { fs.closeSync(fd); }
            fs.renameSync(tmp, dest);
            log('sandbox helper installed: ' + dest + ' (root, 4755)');
        }
        return dest;
    } catch (e) { log('sandbox helper not in place: ' + e.message); return ''; }
}
function gcd(a, b) { return b ? gcd(b, a % b) : a; }
/*
 * The page's window in CSS pixels for a page area of w x h screen pixels at zoom z, rendered at q of the screen's
 * pixels (q = 0.75: 56% of the pixels to rasterize, encode and decode on the car's CPU; the renderer scales the
 * picture up to the page area on the GPU). scale = z * q is what the engine renders at; the picture (css x scale) is
 * whole pixels, its width a multiple of 4 and its height even; dw x dh is its size on the screen (css x z).
 */
function pageCss(w, h, z, q) {
    const k = Math.max(4, Math.round(z * (q || 1) * 16)), sw = 64 / gcd(k, 64), sh = 32 / gcd(k, 32);
    const cw = Math.max(sw, Math.floor(w / z / sw) * sw), ch = Math.max(sh, Math.floor(h / z / sh) * sh);
    return { w: cw, h: ch, scale: k / 16, pw: cw * k / 16, ph: ch * k / 16, dw: Math.round(cw * z), dh: Math.round(ch * z) };
}
Daemon.prototype.engineArgs = function (dirs, url, sandbox) {
    // The window in CSS pixels, so that the picture (window x zoom) is whole pixels, its width a multiple of 4 and its
    // height even (what the renderer's video layer takes): never larger than the page area the app has.
    const z = this.zoom, cssSize = pageCss(this.want.w, this.want.h, z, this.picture()), w = cssSize.w, h = cssSize.h;
    const args = [
        '--remote-debugging-pipe', '--user-data-dir=' + dirs.profile, '--disk-cache-dir=' + path.join(dirs.profile, 'cache'), '--disk-cache-size=52428800', '--media-cache-size=1048576',
        '--window-size=' + w + ',' + h, '--force-device-scale-factor=' + cssSize.scale,
        '--disable-gpu', '--disable-software-rasterizer', '--disable-accelerated-video-decode', '--disable-accelerated-video-encode',
        // No sound device for the engine: on the head unit ALSA's "default" is hw:0,0, the hands-free telephone's PCM
        // (/dev/snd/pcmC0D0p, root:audio 0660), which the engine's uid cannot open. --mute-audio alone still opens the
        // device; with --disable-audio-output the engine keeps a film's clock on a sink of its own.
        '--password-store=basic', '--use-mock-keychain', '--disable-smooth-scrolling', '--no-first-run', '--no-pings', '--disable-breakpad', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-default-apps',
        '--disable-features=Translate,MediaRouter,OptimizationHints,VaapiVideoDecoder,VaapiVideoEncoder',
        '--autoplay-policy=' + (this.policy && this.policy().autoplay === 'gesture' ? 'user-gesture-required' : 'no-user-gesture-required'), '--lang=pl', '--accept-lang=pl-PL,pl,en-US,en',
        '--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + dirs.major + '.0.0.0 Safari/537.36',
        '--proxy-server=socks5://127.0.0.1:' + this.proxyPort, '--proxy-bypass-list=<-loopback>', '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1', '--disable-quic',
        '--force-webrtc-ip-handling-policy=disable_non_proxied_udp', '--js-flags=--max-old-space-size=512'
    ];
    // Sound: with G21 Audio the engine plays into its own ALSA device "g21out" (asound.conf made by openAudio: a file
    // device that writes S16LE 48 kHz stereo into G21 Audio's FIFO). Without it: no device at all (see above).
    if (this.audio) args.push('--alsa-output-device=g21out');
    else args.push('--mute-audio', '--disable-audio-output');
    if (!sandbox) args.push('--no-sandbox');
    try { const st = fs.statfsSync('/dev/shm'); if (Number(st.bavail) * Number(st.bsize) < (256 << 20)) args.push('--disable-dev-shm-usage'); } catch (e) { args.push('--disable-dev-shm-usage'); }
    // state/engine-flags: extra switches, one per line (e.g. to try the GPU on the car without a new build)
    lines(path.join(this.opts.stateDir, 'engine-flags')).map((l) => l.trim()).filter((l) => /^--[a-z]/.test(l)).slice(0, 20).forEach((l) => {
        const name = l.split('=')[0];
        for (let i = args.length - 1; i >= 0; i--) if (args[i] === name || args[i].indexOf(name + '=') === 0) args.splice(i, 1);
        if (l === '--enable-gpu') { ['--disable-gpu', '--disable-software-rasterizer'].forEach((x) => { const i = args.indexOf(x); if (i >= 0) args.splice(i, 1); }); return; }
        args.push(l);
    });
    args.push(url);
    return args;
};
Daemon.prototype.prepare = async function () {
    const o = this.opts;
    const m = loadManifest(o);
    if (this.uid === null && !o.noSetuid) {
        this.uid = pickEngineUid(o);
        if (this.uid === null) throw new UserError('brak wolnego uid dla silnika (zobacz log)');
    }
    if (!engineReady(o, m)) {
        this.log('installing the engine (' + m.product + ')' + (havePack(o, m) ? ' from the local pack' : ''));
        const t0 = Date.now();
        let last = '';
        await installEngine(o, m, this.ids(), (phase, pct) => { const k = phase + (pct - pct % 2); if (k !== last) { last = k; this.set({ engine: phase, pct: pct, err: '' }); } });
        this.log('engine installed in ' + (Date.now() - t0) + ' ms');
    }
    this.helper = this.policy().sandbox === 'off' ? '' : installHelper(o, engineDir(o, m), (t) => this.log(t));
    const own = (p) => { if (!o.noSetuid) fs.chownSync(p, this.uid, this.uid); };
    const profile = path.join(o.cacheDir, 'profile'), tmp = path.join(o.cacheDir, 'tmp'), fc = path.join(o.cacheDir, 'fontconfig');
    fs.chmodSync(o.cacheDir, 0o711);
    [profile, tmp, fc].forEach((d) => { mkdirp(d, 0o700); fs.chmodSync(d, 0o700); own(d); });
    list(tmp).forEach((n) => { try { rmrf(path.join(tmp, n)); } catch (e) { /* busy */ } });
    mkdirp(o.runDir);
    const loader = path.join(o.libDir, 'ld-linux-x86-64.so.2');
    if (!fs.existsSync(loader)) throw new UserError('brak bibliotek silnika (lib/)');
    // the path written into the engine binary (installEngine): /run/g21-browser/ld.so
    const link = m.interp.to;
    mkdirp(path.dirname(link));
    let cur = '';
    try { cur = fs.readlinkSync(link); } catch (e) { /* none */ }
    if (cur !== loader) { try { fs.unlinkSync(link); } catch (e) { /* none */ } fs.symlinkSync(loader, link); }
    const conf = path.join(o.runDir, 'fonts.conf');
    writeIfChanged(conf, '<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n  <dir>' + o.fontsDir + '</dir>\n  <cachedir>' + fc + '</cachedir>\n'
        + [['sans-serif', 'Liberation Sans'], ['serif', 'Liberation Serif'], ['monospace', 'Liberation Mono'], ['system-ui', 'Liberation Sans']].map((a) => '  <alias><family>' + a[0] + '</family><prefer><family>' + a[1] + '</family><family>DejaVu Sans</family></prefer></alias>\n').join('')
        + [['Arial', 'Liberation Sans'], ['Helvetica', 'Liberation Sans'], ['Times New Roman', 'Liberation Serif'], ['Times', 'Liberation Serif'], ['Courier New', 'Liberation Mono'], ['Courier', 'Liberation Mono']].map((a) => '  <alias binding="same"><family>' + a[0] + '</family><accept><family>' + a[1] + '</family></accept></alias>\n').join('')
        + '</fontconfig>\n', 0o644);
    return { engine: engineDir(o, m), profile: profile, tmp: tmp, conf: conf, major: ((/(\d+)\.\d+\.\d+\.\d+/.exec(m.product) || [0, '0'])[1]) };
};
Daemon.prototype.startEngine = function (url) {
    if (this.starting) return this.starting;
    this.starting = this.startEngine2(url).then(() => { this.starting = null; }, (e) => {
        this.starting = null;
        this.log('engine start failed: ' + e.message);
        this.killEngine();
        this.set({ engine: 'failed', err: e.user ? e.message : 'silnik nie wystartował', ask: e.ask || '', loading: false, live: false });
    });
    return this.starting;
};
Daemon.prototype.startEngine2 = async function (url) {
    const o = this.opts;
    if (!this.want) return;
    this.loadPolicy();
    const dirs = await this.prepare();
    if (!this.want) return;
    this.set({ engine: 'starting', err: '', ask: '', pct: 100, url: '', title: '', loading: true, back: false, fwd: false, editable: false });
    await this.startApps();
    await this.startProxy();
    this.startFrame();
    await this.openAudio();
    const mode = this.policy().sandbox;
    const refuse = (why) => {
        if (mode === 'required') { this.log(why + ': policy "sandbox": "required", the engine is not started'); return new UserError('reguły wymagają piaskownicy, a silnik nie może jej użyć'); }
        this.log(why + ': the owner is asked'); return askSandbox();
    };
    const sandbox = mode !== 'off' && !this.sandboxAllowedOff();
    if (mode === 'off') this.log('policy "sandbox": "off": the engine starts without its sandbox');
    if (sandbox && !this.sandboxPossible()) throw refuse('no sandbox on this system (no user namespaces, no setuid helper)');
    let e = null;
    {
        try { e = await this.launch(dirs, url || this.home(), sandbox); } catch (x) {
            // what the engine itself said (a missing library, a kernel it cannot run on): the only trace of a start that failed
            const said = this.engine ? String(this.engine.err).split('\n').filter((l) => l.trim() && !/dbus|Floss|bluez/i.test(l)).slice(-3).join(' | ').slice(0, 600) : '';
            if (said) this.log('engine said: ' + said);
            this.killEngine();
            if (!sandbox) throw x;
            // it may be the sandbox, it may be something else: only a start without it tells, and that is the owner's to allow
            throw refuse('engine did not start with its sandbox (' + x.message + ')');
        }
    }
    this.log('engine up: ' + e.product + (sandbox ? (this.helper ? ', sandbox (setuid helper beside the engine)' : ', sandbox') : ', no sandbox') + ', ' + this.want.w + 'x' + this.want.h + ' zoom ' + this.zoom);
    this.set({ engine: 'ready' });
    clearInterval(this.memTimer);
    this.memTimer = setInterval(() => this.guard(() => this.checkMemory()), 5000);
    clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => { if (this.client && this.engine === e) this.guard(() => this.refresh(e)); }, o.pollMs);
    if (!this.client) this.away();
};
Daemon.prototype.launch = async function (dirs, url, sandbox) {
    const o = this.opts;
    const env = { LD_LIBRARY_PATH: o.libDir + ':' + dirs.engine, HOME: dirs.profile, TMPDIR: dirs.tmp, XDG_CONFIG_HOME: path.join(dirs.profile, 'xdg'), XDG_CACHE_HOME: path.join(dirs.profile, 'xdg-cache'),
        FONTCONFIG_FILE: dirs.conf, DBUS_SESSION_BUS_ADDRESS: 'disabled:', DBUS_SYSTEM_BUS_ADDRESS: 'unix:path=' + path.join(o.runDir, 'no-dbus') };
    if (process.env.TZ) env.TZ = process.env.TZ;
    if (sandbox && this.helper) env.CHROME_DEVEL_SANDBOX = this.helper;
    if (this.audio) env.ALSA_CONFIG_PATH = this.audio.conf;
    const child = cp.spawn(path.join(dirs.engine, 'chrome-headless-shell'), this.engineArgs(dirs, url, sandbox), Object.assign(this.ids(), { cwd: '/', env: env, stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] }));
    const e = { child: child, cdp: null, session: '', target: '', mainFrame: '', down: null, err: '', product: '' };
    this.engine = e;
    child.stderr.on('data', (d) => { e.err = (e.err + d).slice(-2000); });
    child.on('error', (x) => { e.err += ' spawn: ' + x.message; });
    child.on('exit', (code, sig) => this.guard(() => this.onEngineExit(e, code, sig)));
    try { fs.writeFileSync('/proc/' + child.pid + '/oom_score_adj', '900'); } catch (x) { /* not Linux or gone */ }
    e.cdp = new Cdp(child);
    e.cdp.onFault = (x) => this.fault(x);
    const ver = await e.cdp.send('Browser.getVersion', {}, null, o.startMs);
    e.product = ver.product || '';
    e.cdp.onEvent = (m) => this.onEvent(e, m);
    const tg = await e.cdp.send('Target.getTargets', {});
    const page = (tg.targetInfos || []).filter((t) => t.type === 'page')[0];
    if (!page) throw new Error('engine has no page');
    e.target = page.targetId;
    e.session = (await e.cdp.send('Target.attachToTarget', { targetId: page.targetId, flatten: true })).sessionId;
    await e.cdp.send('Target.setDiscoverTargets', { discover: true });
    const send = (method, params) => e.cdp.send(method, params, e.session);
    await send('Page.enable', {});
    // what the page and its players complain about goes to the log ("coś poszło nie tak" of a player says no more
    // on the screen): errors only, 60 lines an engine run at most
    e.notes = 0;
    try { await send('Log.enable', {}); } catch (x) { /* not in this engine */ }
    try { await send('Media.enable', {}); } catch (x) { /* not in this engine */ }
    try { await e.cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' }); } catch (x) { this.log('downloads: ' + x.message); }
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    // The screen the page sees is its own window. Without this the headless engine's screen is 800x600: a player that
    // goes full screen changed the picture's size (the car, 0.1.3). Now full screen fills the page area.
    try {
        const css = pageCss(this.want.w, this.want.h, this.zoom, this.picture());
        await send('Emulation.setDeviceMetricsOverride', { width: css.w, height: css.h, deviceScaleFactor: css.scale, mobile: false, screenWidth: css.w, screenHeight: css.h });
    } catch (x) { this.log('screen size: ' + x.message); }
    const major = dirs.major;
    try {
        await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + major + '.0.0.0 Safari/537.36', acceptLanguage: 'pl-PL,pl,en-US,en', platform: 'Linux x86_64',
            userAgentMetadata: { brands: [{ brand: 'Chromium', version: major }, { brand: 'Google Chrome', version: major }, { brand: 'Not?A_Brand', version: '99' }], platform: 'Linux', platformVersion: '', architecture: 'x86', model: '', mobile: false } });
    } catch (x) { this.log('user agent: ' + x.message); }
    const tree = await send('Page.getFrameTree', {});
    e.mainFrame = tree.frameTree.frame.id;
    this.s.url = tree.frameTree.frame.url || '';
    await this.cast(true);
    // the first page began to load before Page.enable: its "stopped loading" may be past already
    try {
        const rs = await send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
        if (rs.result && rs.result.value === 'complete') this.s.loading = false;
    } catch (x) { /* the events decide */ }
    this.guard(() => this.refresh(e));
    return e;
};
Daemon.prototype.cast = async function (on) {
    const e = this.engine;
    if (!e || !e.session) return;
    try { await e.cdp.send('Page.stopScreencast', {}, e.session); } catch (x) { /* was off */ }
    if (on) await e.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 82, everyNthFrame: 1 }, e.session);
};
// title, address, back / forward
Daemon.prototype.refresh = async function (e) {
    if (this.engine !== e || !e.session) return;
    let hst;
    try { hst = await e.cdp.send('Page.getNavigationHistory', {}, e.session); } catch (x) { return; }
    if (this.engine !== e) return;
    const cur = hst.entries[hst.currentIndex] || {};
    this.set({ url: cur.url || this.s.url, title: String(cur.title || '').slice(0, 120), back: hst.currentIndex > 0, fwd: hst.currentIndex < hst.entries.length - 1 });
    // is something of the page in full screen? (a player's own button, or the page's script)
    try {
        const r = await e.cdp.send('Runtime.evaluate', { expression: '!!document.fullscreenElement', returnByValue: true }, e.session);
        if (this.engine === e) await this.applyFs(e, !!(r && r.result && r.result.value === true));
    } catch (x) { /* the page is on its way somewhere else */ }
    if (!this.s.loading) this.remember(cur.url || '', cur.title || '');
};
Daemon.prototype.pageNote = function (e, text) {
    e.notes = (e.notes || 0) + 1;
    if (e.notes <= 60) this.log(String(text).replace(/\s+/g, ' ').slice(0, 600));
    else if (e.notes === 61) this.log('(more page errors are not logged in this engine run)');
};
Daemon.prototype.onEvent = function (e, m) {
    if (this.engine !== e) return;
    const p = m.params || {};
    switch (m.method) {
    case 'Page.screencastFrame': this.onFrame(e, p); return;
    case 'Page.frameStartedLoading': if (p.frameId === e.mainFrame) this.set({ loading: true, err: '', editable: false }); return;
    case 'Page.frameStoppedLoading': if (p.frameId === e.mainFrame) { this.set({ loading: false }); this.guard(() => this.refresh(e)); } return;
    case 'Page.frameNavigated': if (p.frame && !p.frame.parentId) { e.mainFrame = p.frame.id; this.set({ url: p.frame.url + (p.frame.urlFragment || '') }); this.guard(() => this.refresh(e)); } return;
    case 'Page.navigatedWithinDocument': if (p.frameId === e.mainFrame) { this.set({ url: p.url }); this.guard(() => this.refresh(e)); } return;
    case 'Page.javascriptDialogOpening':
        // nobody can answer a dialog on this screen: alerts are closed, questions answered "no"
        e.cdp.send('Page.handleJavaScriptDialog', { accept: p.type === 'alert' || p.type === 'beforeunload' }, e.session).catch(() => {});
        return;
    case 'Log.entryAdded': { const en = p.entry || {}; if (en.level === 'error') this.pageNote(e, 'page ' + (en.source || '') + ': ' + en.text + (en.url ? ' (' + String(en.url).slice(0, 120) + ')' : '')); return; }
    case 'Media.playerErrorsRaised': (p.errors || []).forEach((er) => this.pageNote(e, 'player error: ' + JSON.stringify(er).slice(0, 500))); return;
    case 'Media.playerMessagesLogged': (p.messages || []).forEach((ms) => { if (ms.level === 'error' || ms.level === 'warning') this.pageNote(e, 'player ' + ms.level + ': ' + ms.message); }); return;
    case 'Inspector.targetCrashed': if (m.sessionId === e.session) { this.log('page crashed'); this.set({ err: 'strona przestała działać: odśwież', loading: false }); } return;
    case 'Target.targetInfoChanged': {
        const t = p.targetInfo || {};
        if (t.targetId === e.target) { if (t.title && t.title !== this.s.title) this.set({ title: String(t.title).slice(0, 120) }); return; }
        if (this.popups[t.targetId]) this.adopt(e, t);
        return;
    }
    case 'Target.targetCreated': {
        // one page only: a new window (target=_blank, window.open) opens in the page instead
        const t = p.targetInfo || {};
        if (t.type !== 'page' || t.targetId === e.target) return;
        this.popups[t.targetId] = setTimeout(() => this.closePopup(e, t.targetId), 4000);
        this.adopt(e, t);
        return;
    }
    case 'Target.targetDestroyed': if (this.popups[p.targetId]) { clearTimeout(this.popups[p.targetId]); delete this.popups[p.targetId]; } return;
    default: return;
    }
};
Daemon.prototype.adopt = function (e, t) {
    if (!/^https?:\/\//i.test(t.url || '')) return;
    const url = t.url;
    this.closePopup(e, t.targetId);
    this.log('new window -> same page: ' + originOf(url));
    e.cdp.send('Page.navigate', { url: url }, e.session).catch(() => {});
};
Daemon.prototype.closePopup = function (e, id) {
    if (!this.popups[id]) return;
    clearTimeout(this.popups[id]);
    delete this.popups[id];
    if (this.engine === e) e.cdp.send('Target.closeTarget', { targetId: id }).catch(() => {});
};
Daemon.prototype.onEngineExit = function (e, code, sig) {
    if (this.engine !== e) return;
    this.engine = null;
    clearInterval(this.memTimer);
    clearInterval(this.pollTimer);
    const tail = e.err.split('\n').filter((l) => /FATAL|ERROR|error while loading|No usable sandbox|cannot|spawn/.test(l) && !/dbus|Floss|bluez/i.test(l)).slice(-3).join(' | ').slice(0, 500);
    this.log('engine exited ' + (sig || code) + (tail ? ': ' + tail : ''));
    if (!this.starting) this.set({ engine: 'failed', err: 'silnik się zatrzymał: odśwież', loading: false, live: false });
};
Daemon.prototype.killEngine = function () {
    const e = this.engine;
    this.engine = null;
    this.fs = null;
    this.closeAudio();
    clearInterval(this.memTimer);
    clearInterval(this.pollTimer);
    Object.keys(this.popups).forEach((k) => clearTimeout(this.popups[k]));
    this.popups = {};
    if (!e) return;
    try { e.child.kill('SIGKILL'); } catch (x) { /* gone */ }
    this.killStrays();
};
// the engine's other processes (renderers, zygotes): every process of the engine uid that runs our engine binary
Daemon.prototype.engineProcs = function () {
    const o = this.opts, out = [];
    const mark = path.join(o.cacheDir, 'engine-');
    list(o.procDir).filter((n) => /^\d+$/.test(n)).forEach((pid) => {
        let exe = '';
        try { exe = fs.readlinkSync(path.join(o.procDir, pid, 'exe')); } catch (e) { return; }
        if (exe.indexOf(mark) === 0) out.push(Number(pid));
    });
    return out;
};
Daemon.prototype.killStrays = function () { this.engineProcs().forEach((pid) => { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } }); };
Daemon.prototype.checkMemory = function () {
    if (!this.engine) return;
    let kb = 0;
    this.engineProcs().forEach((pid) => {
        const roll = lines(path.join(this.opts.procDir, String(pid), 'smaps_rollup')).filter((l) => /^Pss:/.test(l))[0];
        if (roll) kb += Number((/(\d+)/.exec(roll) || [0, 0])[1]);
        else kb += Number(((/VmRSS:\s+(\d+)/.exec(lines(path.join(this.opts.procDir, String(pid), 'status')).join('\n')) || [0, 0])[1])) / 2;
    });
    const limit = Number((lines(path.join(this.opts.stateDir, 'mem-limit-mb'))[0] || '').trim()) || (this.opts.memLimitMb !== 900 ? this.opts.memLimitMb : this.policy().memoryLimitMb);
    if (kb / 1024 > limit) {
        this.log('engine uses ' + Math.round(kb / 1024) + ' MB (limit ' + limit + '): stopped');
        this.killEngine();
        this.set({ engine: 'failed', err: 'strona zużyła za dużo pamięci', loading: false, live: false });
    }
};
Daemon.prototype.stopEngine = async function (why) {
    clearTimeout(this.idleTimer);
    if (this.starting) { try { await this.starting; } catch (e) { /* logged */ } }
    const had = !!this.engine;
    const e = this.engine;
    this.fs = null;
    this.closeAudio();
    if (e) {
        this.engine = null;
        clearInterval(this.memTimer);
        clearInterval(this.pollTimer);
        try { await Promise.race([e.cdp.send('Browser.close', {}), sleep(1500)]); } catch (x) { /* killed below */ }
        await sleep(100);
        try { e.child.kill('SIGKILL'); } catch (x) { /* gone */ }
        this.killStrays();
    }
    if (this.frame) { const f = this.frame; this.frame = null; try { f.stdin.end(); f.kill('SIGTERM'); } catch (x) { /* gone */ } }
    if (this.appsProc) { const a = this.appsProc; this.appsProc = null; this.appsPort = 0; try { a.kill('SIGTERM'); } catch (x) { /* gone */ } }
    if (this.proxy) { const p = this.proxy; this.proxy = null; this.proxyPort = 0; try { p.kill('SIGTERM'); } catch (x) { /* gone */ } }
    this.frameBusy = false;
    this.pendingAck = null;
    try { fs.unlinkSync(this.opts.ring); } catch (x) { /* none */ }
    if (had) this.log('engine stopped (' + why + ')');
    this.set({ engine: 'off', err: '', ask: '', url: '', title: '', loading: false, back: false, fwd: false, live: false, w: 0, h: 0, ino: 0, editable: false, pct: 0 });
};
Daemon.prototype.start = async function () {
    const o = this.opts;
    [o.cacheDir, o.logDir].forEach((d) => { try { mkdirp(d); } catch (e) { /* logged on use */ } });
    try { mkdirp(o.stateDir, 0o700); } catch (e) { /* logged on use */ }
    this.killStrays(); // an engine a killed daemon left behind
    try { fs.unlinkSync(o.ring); } catch (e) { /* none */ }
    this.listen();
    // the uplink learns our uid at start (its 5 s rescan), before the first page
    try { fs.unlinkSync(path.join(o.stateDir, 'sandbox')); this.log('removed state/sandbox (0.1.2 kept the answer; now every opening asks)'); } catch (e) { /* none */ }
    if (!o.noSetuid) { try { this.uid = pickEngineUid(o); } catch (e) { this.log('engine uid: ' + e.message); } }
    let m = null;
    try { m = loadManifest(o); } catch (e) { this.log(e.message); }
    this.loadPolicy();
    this.log('g21-browserd started' + (m ? ', engine ' + m.product + (engineReady(o, m) ? ' (installed)' : ' (not installed yet)') : ''));
};
Daemon.prototype.close = async function () {
    try { if (this.server) this.server.close(); } catch (e) { /* closed */ }
    if (this.client) { try { this.client.destroy(); } catch (e) { /* gone */ } this.client = null; }
    this.want = null;
    await this.stopEngine('daemon stops');
    try { fs.unlinkSync(this.opts.sock); } catch (e) { /* none */ }
};

module.exports = {
    parseRepo: parseRepo, untarGz: untarGz, APPS_RE: APPS_RE, APP_LIMITS: APP_LIMITS,
    pageCss: pageCss, readPolicy: readPolicy, POLICY_DEFAULT: POLICY_DEFAULT, installHelper: installHelper, Daemon: Daemon, toUrl: toUrl, startPage: startPage, blockedV4: blockedV4, ipv4: ipv4, loadManifest: loadManifest, installEngine: installEngine, fillFromZip: fillFromZip, havePack: havePack, engineReady: engineReady, engineDir: engineDir, pickEngineUid: pickEngineUid, defaults: defaults, ZOOMS: ZOOMS, SOURCE_RE: SOURCE_RE };

if (require.main === module && process.argv[2] === '--fetch') {
    runFetch(String(process.argv[3]), String(process.argv[4]), process.argv[5] || '/run/mgu-uplink/lease.json', process.argv[6] === '--any-host');
} else if (require.main === module && process.argv[2] === '--proxy') {
    runProxy({ leaseFile: process.argv[3] || '/run/mgu-uplink/lease.json', allowLocal: process.argv.indexOf('--allow-local') >= 4,
        allow: process.argv.slice(4).filter((a) => a.indexOf('--allow=') === 0).map((a) => a.slice(8).split(',')).reduce((x, y) => x.concat(y), []) });
} else if (require.main === module && process.argv[2] === '--apps') {
    runApps(String(process.argv[3]));
} else if (require.main === module && process.argv[2] === '--check') {
    // mgu-deploy "check" (offline): the manifest reads and names Google's address, this Node can unpack and inflate
    const o = defaults();
    const m = loadManifest(o);
    if (!havePack(o, m)) sourceUrl(o, m);
    if (typeof zlib.createBrotliDecompress !== 'function' || typeof zlib.createInflateRaw !== 'function' || typeof fs.statfsSync !== 'function') throw new Error('this Node is too old');
    ['ld-linux-x86-64.so.2', 'libc.so.6', 'libnss3.so'].forEach((n) => fs.accessSync(path.join(o.libDir, n)));
    fs.accessSync(o.webframe, fs.constants.X_OK);
    process.stdout.write('ok ' + m.product + '\n');
} else if (require.main === module) {
    const d = new Daemon();
    process.on('uncaughtException', (e) => d.fault(e));
    process.on('unhandledRejection', (e) => d.fault(e));
    let exiting = false;
    ['SIGTERM', 'SIGINT', 'SIGHUP'].forEach((s) => process.on(s, () => {
        if (exiting) return;
        exiting = true;
        d.log(s + ': stopping the engine');
        setTimeout(() => process.exit(0), 4000); // TimeoutStopSec=5
        d.close().then(() => process.exit(0), () => process.exit(0));
    }));
    d.start().catch((e) => d.fault(e));
}
