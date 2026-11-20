'use strict';
// Development machine: the real daemon with the full engine of the stand. Przeglądarka and an app from Sklep each
// have a tab of their own: the way back, the page and its scroll place of the one are not the other's.
//   node tabs.js [cast]     cast: the photographs instead of the engine's window
const fs = require('fs'), net = require('net'), http = require('http'), cp = require('child_process');
const B = '/opt/scr/bench', base = '/tmp/g21tabs-' + process.pid;
fs.mkdirSync(base + '/run', { recursive: true });
process.env.G21_BROWSER_ROOT = base; process.env.G21_BROWSER_RUN = base + '/run'; process.env.G21_BROWSER_RING = base + '/ring';
process.env.G21_BROWSER_NOSETUID = '1'; process.env.G21_BROWSER_ALLOW_LOCAL = '1';
const d = require((process.env.REPO || '.') + '/native/g21-browser/g21-browserd.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const page = (name) => '<!doctype html><meta charset=utf-8><title>' + name + '</title><body style="margin:0;font:20px sans-serif;background:' + (/app/.test(name) ? '#dfe' : '#fed') + '"><h1>' + name + '</h1><div style="height:4000px">' + name + '</div><audio id=a loop></audio>';
let fails = 0;
function check(what, ok, got) { if (!ok) fails += 1; console.log((ok ? 'ok   ' : 'FAIL ') + what + (ok ? '' : ': ' + JSON.stringify(got))); }
function ring() {
    try { const b = fs.readFileSync(base + '/ring'); return { w: b.readUInt32LE(8), h: b.readUInt32LE(12), seq: b.readUInt32LE(16) }; } catch (e) { return { err: e.code, seq: 0 }; }
}
(async () => {
    const srv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(page(q.url.replace(/^\//, '') || 'root')); });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const url = 'http://127.0.0.1:' + srv.address().port + '/';
    const dm = new d.Daemon({ control: 'devtools', idleMs: 60000, pollMs: 300, wlframe: B + '/g21-wlframe', webframe: B + '/g21-webframe', libDir: B + '/lib' });
    dm.prepare = async function () {
        const profile = base + '/profile', tmp = base + '/tmp';
        [profile, tmp].forEach((x) => { fs.rmSync(x, { recursive: true, force: true }); fs.mkdirSync(x, { recursive: true, mode: 0o700 }); });
        fs.writeFileSync(base + '/fonts.conf', '<?xml version="1.0"?><fontconfig><dir>/usr/share/fonts</dir><cachedir>' + base + '/fc</cachedir></fontconfig>');
        this.fullEngine = true;
        return { engine: B + '/engine', binary: 'chrome', kind: 'chrome', profile: profile, tmp: tmp, conf: base + '/fonts.conf', major: '153' };
    };
    dm.engineProcs = function () {
        return fs.readdirSync('/proc').filter((p) => /^\d+$/.test(p)).filter((p) => { try { return fs.readFileSync('/proc/' + p + '/cmdline', 'latin1').indexOf(B + '/engine/chrome') === 0; } catch (e) { return false; } }).map(Number);
    };
    // the apps of the stand: two pages of the test server (no import from git here)
    dm.appUrl = async function (id) { return /^app[12]$/.test(id) ? url + id : null; };
    dm.appsPort = 1;
    const startProxy = dm.startProxy;
    dm.startProxy = async function () { const r = await startProxy.apply(this, arguments); this.proxyKey = String(this.proxyKey || '') + ' 127.0.0.1:1'; return r; };
    if (process.argv[2] === 'cast') { fs.mkdirSync(base + '/state', { recursive: true }); fs.writeFileSync(base + '/state/policy.json', JSON.stringify({ frames: 'cast' })); }
    await dm.start();
    await sleep(300);
    let state = {};
    const c = await new Promise((resolve) => { const k = net.connect(base + '/run/ctl.sock', () => resolve(k)); });
    let buf = '';
    c.on('data', (x) => { buf += x; let i; while ((i = buf.indexOf('\n')) >= 0) { try { const m = JSON.parse(buf.slice(0, i)); if (m.ev === 'state') state = m; } catch (e) { /* skip */ } buf = buf.slice(i + 1); } });
    const tell = (o) => c.write(JSON.stringify(o) + '\n');
    const until = async (what, fn, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(100); } console.log('TIMEOUT: ' + what + ' ' + JSON.stringify({ url: state.url, back: state.back, loading: state.loading, engine: state.engine })); fails += 1; return false; };
    const run = async (x) => (await dm.engine.cdp.send('Runtime.evaluate', { expression: x, returnByValue: true }, dm.engine.session)).result.value;
    const pages = async () => (await dm.engine.cdp.send('Target.getTargets', {})).targetInfos.filter((t) => t.type === 'page').length;
    const moving = async () => { const a = ring().seq; await run('scrollBy(0,40)'); await sleep(700); await run('scrollBy(0,-40)'); await sleep(500); return ring().seq - a; };
    // (an app's page area is taller than the browser's: it has no address bar)
    const open = (o) => tell(Object.assign({ op: 'open', w: 1796, h: o && o.app ? 580 : 548, fw: 1920, fh: 720 }, o || {}));

    // 1. Przeglądarka: two pages, a place on the second
    open({ url: url + 'one' });
    await until('browser live', () => state.live && state.engine === 'ready' && !state.loading && /one$/.test(state.url), 40000);
    console.log('engine: ' + (dm.direct ? 'direct' : 'cast') + ', ' + state.w + 'x' + state.h);
    tell({ op: 'nav', url: url + 'two' });
    await until('second page', () => /two$/.test(state.url) && !state.loading && state.back, 10000);
    await run('window.mark = "browser"; scrollTo(0, 700); 1'); await sleep(400);
    const pid = dm.engine.child.pid;
    check('browser: two pages, one tab', (await pages()) === 1 && state.back === true, state);

    // 2. an app: its own tab, its first page, no way back into the browser's pages
    open({ app: 'app1' });
    await until('app page', () => /app1$/.test(state.url) && !state.loading, 10000);
    await sleep(800);
    check('app: its own page, nothing behind it', /app1$/.test(state.url) && state.back === false && state.fwd === false, { url: state.url, back: state.back });
    check('app: the engine is the same process', dm.engine && dm.engine.child.pid === pid, null);
    check('app: a second tab', (await pages()) === 2, await pages());
    check('app: the page knows nothing of the browser\'s', (await run('String(window.mark) + "/" + history.length')) === 'undefined/1', await run('String(window.mark) + "/" + history.length'));
    check('app: its picture is on the screen', (await moving()) > 0, ring());
    check('app: at its own size', state.h === 580 && (await run('innerHeight')) === 580, [state.h, await run('innerHeight'), ring()]);
    tell({ op: 'nav', url: url + 'app1?second' });
    await until('app second page', () => /second$/.test(state.url) && !state.loading && state.back, 10000);
    tell({ op: 'back' });
    await until('app back', () => /app1$/.test(state.url) && !state.back, 10000);
    check('app: "wstecz" stays inside the app', /app1$/.test(state.url) && state.back === false, { url: state.url, back: state.back });

    // 3. a layer was over the app (THEiPlay's settings): the same page, nothing loaded again
    await run('window.mark = "app"; scrollTo(0, 300); 1');
    open({ app: 'app1', keep: true });
    await sleep(900);
    check('app kept: the same page, the same place', (await run('window.mark + "/" + Math.round(scrollY)')) === 'app/300', await run('window.mark + "/" + Math.round(scrollY)'));

    // 4. Przeglądarka again: the page it had, where it was, with its way back
    open({});
    await until('browser again', () => /two$/.test(state.url) && state.back === true, 10000);
    await sleep(600);
    check('browser again: its page was not loaded anew', (await run('window.mark + "/" + Math.round(scrollY)')) === 'browser/700', await run('window.mark + "/" + Math.round(scrollY)'));
    check('browser again: the app\'s tab is closed', (await pages()) === 1, await pages());
    check('browser again: its picture is on the screen', (await moving()) > 0, ring());
    check('browser again: at its own size', state.h === 548 && (await run('innerHeight')) === 548, [state.h, await run('innerHeight'), ring()]);
    tell({ op: 'back' });
    await until('browser back', () => /one$/.test(state.url), 10000);
    check('browser: "wstecz" is its own page', /one$/.test(state.url), state.url);

    // 5. another app, and the first one again: each starts on its first page
    open({ app: 'app2' });
    await until('app2', () => /app2$/.test(state.url) && !state.loading, 10000);
    await sleep(500);
    open({ app: 'app1' });
    await until('app1 again', () => /app1$/.test(state.url) && !state.loading, 10000);
    await sleep(800);
    check('apps: one after the other, each alone', state.back === false && (await pages()) === 2 && (await run('String(window.mark)')) === 'undefined', { back: state.back, pages: await pages() });

    // 6. the engine is started again while an app is on the screen (a rule changed): the browser's page is not lost
    tell({ op: 'zoom', z: 1.25 });
    await sleep(1500);
    await until('engine again', () => state.live && state.engine === 'ready' && !state.loading, 40000);
    open({});
    await until('browser after restart', () => /one$/.test(state.url) && !state.loading, 15000);
    check('engine started again in an app: the browser opens on its page', /one$/.test(state.url), state.url);

    // 7. closed: no engine process is left
    tell({ op: 'close' });
    await sleep(3500);
    check('closed: no engine process', dm.engineProcs().length === 0, dm.engineProcs());
    console.log('--- log');
    console.log(fs.readFileSync(base + '/log/browserd.log', 'utf8').split('\n').filter((l) => /tabs|history|engine up|engine exited|engine stopped|fault|direct frames/.test(l)).map((l) => l.slice(25, 240)).join('\n'));
    await dm.close();
    srv.close();
    try { cp.execSync('pkill -9 -u kkds -f ' + B + '/engine/chrome'); } catch (e) { /* none */ }
    console.log(fails ? 'tabs: ' + fails + ' FAILED' : 'tabs: ok');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('tabs failed: ' + e.stack); process.exit(1); });
