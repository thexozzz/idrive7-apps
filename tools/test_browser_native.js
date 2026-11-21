'use strict';
// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * The engine without its DevTools interface (native/g21-browser/g21-native.js): the line the engine's extension
 * connects to, and send() and the events made from it as g21-browserd knows them from DevTools. A stand-in here
 * plays the extension (a WebSocket client written out by hand, as the server is). No engine: what the real one
 * does with it is tools/sim/native.js, on the stand.
 */
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const path = require('path');
const root = path.join(__dirname, '..');
const N = require(path.join(root, 'native', 'g21-browser', 'g21-native.js'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// the extension's side: connects, answers what it is asked, can say things by itself
function ext(port, word, origin, onAsk) {
    return new Promise((resolve) => {
        const s = net.connect(port, '127.0.0.1');
        let up = false, buf = Buffer.alloc(0);
        const me = { sock: s, asked: [], closed: false };
        me.say = (o) => {
            const body = Buffer.from(JSON.stringify(o), 'utf8'), mask = crypto.randomBytes(4);
            const head = body.length < 126 ? Buffer.from([0x81, 0x80 | body.length]) : Buffer.from([0x81, 0x80 | 126, body.length >> 8, body.length & 255]);
            const out = Buffer.from(body);
            for (let i = 0; i < out.length; i++) out[i] ^= mask[i & 3];
            s.write(Buffer.concat([head, mask, out]));
        };
        s.on('connect', () => s.write('GET /g21?w=' + word + ' HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ' + crypto.randomBytes(16).toString('base64') + '\r\nOrigin: ' + origin + '\r\n\r\n'));
        s.on('data', (d) => {
            buf = Buffer.concat([buf, d]);
            if (!up) { const i = buf.indexOf('\r\n\r\n'); if (i < 0) return; up = /^HTTP\/1\.1 101/.test(buf.toString('latin1', 0, i)); buf = buf.slice(i + 4); if (up) resolve(me); }
            while (buf.length >= 2) {
                let len = buf[1] & 127, at = 2;
                if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); at = 4; }
                if (buf.length < at + len) return;
                const m = JSON.parse(buf.slice(at, at + len).toString('utf8'));
                buf = buf.slice(at + len);
                me.asked.push(m);
                const r = onAsk ? onAsk(m) : null;
                if (r && r.err) me.say({ id: m.id, ok: false, err: r.err }); else me.say({ id: m.id, ok: true, r: r === undefined ? null : r });
            }
        });
        s.on('error', () => {});
        s.on('close', () => { me.closed = true; if (!up) resolve(me); });
    });
}

(async () => {
    // ---- the line: only the engine's own extension gets in
    const link = new N.Link({});
    const port = await link.listen();
    assert.ok(port > 0 && /^[0-9a-f]{36}$/.test(link.word), 'a port on this machine and a word of its own');
    let x = await ext(port, 'wrong', 'chrome-extension://abc');
    await sleep(60);
    assert.ok(x.closed && !link.sock, 'another word: turned away');
    x = await ext(port, link.word, 'https://example.org');
    await sleep(60);
    assert.ok(x.closed && !link.sock, 'a web page that knew the word: turned away (not an extension\'s origin)');
    console.log('ok native: the line takes the engine\'s extension only (the word of this start, an extension\'s origin)');

    // ---- send() and events
    const state = { ready: 'complete', fs: false, back: true, fwd: false, url: 'https://example.org/b', title: 'B' };
    const input = [], events = [];
    const cdp = new N.NativeCdp({ link: link, input: (l) => input.push(l), product: 'Chrome/153 (without DevTools)', exprs: { edit: 'EDIT', quiet: 'QUIET', why: 'WHY' } });
    cdp.onEvent = (m) => events.push(m);
    let fsSeen = null;
    cdp.onFullScreen = (session, on) => { fsSeen = [session, on]; };
    const version = cdp.send('Browser.getVersion', {}, null, 3000);
    const e = await ext(port, link.word, 'chrome-extension://abcdefghijklmnop', (m) => {
        if (m.op === 'state') return state;
        if (m.op === 'edit') return JSON.stringify({ kind: 'text', inside: true, x: m.x, y: m.y });
        if (m.op === 'new') return 9;
        if (m.op === 'back' && !state.back) return { err: 'no way back' };
        return null;
    });
    e.say({ ev: 'hello', version: '1.0', tabs: [{ tab: 7, url: 'https://example.org/a', title: 'A', status: 'complete', active: true }] });
    assert.deepStrictEqual(await version, { product: 'Chrome/153 (without DevTools)' }, 'the engine is "up" when its extension has said hello');
    const tg = await cdp.send('Target.getTargets', {});
    assert.deepStrictEqual(tg.targetInfos.map((t) => [t.targetId, t.type, t.url]), [['tab:7', 'page', 'https://example.org/a']]);
    const S = (await cdp.send('Target.attachToTarget', { targetId: 'tab:7', flatten: true })).sessionId;
    assert.strictEqual((await cdp.send('Page.getFrameTree', {}, S)).frameTree.frame.id, 'main:7');
    // the page's events
    e.say({ ev: 'tab', tab: 7, status: 'loading', url: 'https://example.org/b', title: 'A' });
    e.say({ ev: 'nav', tab: 7, url: 'https://example.org/b', same: false });
    e.say({ ev: 'tab', tab: 7, status: 'complete', url: 'https://example.org/b', title: 'B' });
    e.say({ ev: 'nav', tab: 7, url: 'https://example.org/b#x', same: true });
    // a window the page opens: over the page, as the page's own; gone: the page again
    e.say({ ev: 'new', tab: 8, opener: 7, url: 'https://example.org/sign-in' });
    e.say({ ev: 'tab', tab: 8, status: 'complete', url: 'https://example.org/sign-in', title: 'Sign in' });
    await sleep(150);
    assert.deepStrictEqual([(await cdp.send('Target.getTargets', {})).targetInfos.map((x) => x.targetId + ' ' + x.url).join(), cdp.top(7), cdp.root(8)], ['tab:7 https://example.org/sign-in', 8, 7], 'one page for the daemon, the window on top of it');
    e.say({ ev: 'gone', tab: 8 });
    // (a tab nobody's page opened and the daemon did not ask for, one the engine brings back by itself: closed, not told)
    e.say({ ev: 'new', tab: 9, opener: 0, url: 'https://example.org/other' });
    await sleep(150);
    assert.ok(e.asked.some((m) => m.op === 'close' && m.tab === 9), 'closed');
    e.say({ ev: 'gone', tab: 9 });
    e.say({ ev: 'fs', tab: 7, on: true, top: true });
    await sleep(250);
    assert.deepStrictEqual(events.map((m) => m.method + (m.sessionId ? ' ' + m.sessionId : '')), ['Page.frameStartedLoading tab:7', 'Target.targetInfoChanged', 'Page.frameNavigated tab:7',
        'Target.targetInfoChanged', 'Page.frameStoppedLoading tab:7', 'Page.navigatedWithinDocument tab:7',
        'Page.frameStartedLoading tab:7', 'Target.targetInfoChanged', 'Page.frameStoppedLoading tab:7',
        'Page.frameNavigated tab:7', 'Target.targetInfoChanged', 'Page.frameStoppedLoading tab:7', 'Target.targetDestroyed'], 'the events g21-browserd waits for');
    assert.deepStrictEqual(events[2].params, { frame: { id: 'main:7', url: 'https://example.org/b' } });
    assert.deepStrictEqual(events[9].params, { frame: { id: 'main:7', url: 'https://example.org/b#x' } }, 'the window is gone: the page under it, where it was');
    assert.deepStrictEqual(fsSeen, ['tab:7', true], 'full screen is told at once');
    console.log('ok native: hello, the targets, and a page\'s loading, arriving, new window and full screen as DevTools events');

    // orders
    e.asked.length = 0;
    await cdp.send('Page.navigate', { url: 'https://example.org/c' }, S);
    await cdp.send('Page.reload', {}, S);
    const hist = await cdp.send('Page.getNavigationHistory', {}, S);
    assert.deepStrictEqual([hist.currentIndex, hist.entries.length, hist.entries[hist.currentIndex].url], [1, 2, 'https://example.org/b'], 'a way back, none forward');
    await cdp.send('Page.navigateToHistoryEntry', { entryId: hist.entries[0].id }, S);
    state.back = false; state.fwd = true;
    const h2 = await cdp.send('Page.getNavigationHistory', {}, S);
    assert.deepStrictEqual([h2.currentIndex, h2.entries.length], [0, 2], 'a way forward, none back');
    await cdp.send('Page.navigateToHistoryEntry', { entryId: h2.entries[1].id }, S);
    await assert.rejects(cdp.send('Page.navigateToHistoryEntry', { entryId: 1 }, S), /no way back/, 'what the extension refuses is an error here');
    assert.deepStrictEqual((await cdp.send('Runtime.evaluate', { expression: '!!document.fullscreenElement', returnByValue: true }, S)).result, { value: false });
    assert.deepStrictEqual((await cdp.send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true }, S)).result, { value: 'complete' });
    assert.deepStrictEqual(JSON.parse((await cdp.send('Runtime.evaluate', { expression: 'EDIT(120,48)', returnByValue: true }, S)).result.value), { kind: 'text', inside: true, x: 120, y: 48 });
    await cdp.send('Runtime.evaluate', { expression: 'QUIET' }, S);
    await cdp.send('Runtime.evaluate', { expression: 'document.fullscreenElement && document.exitFullscreen && document.exitFullscreen().catch(function () {}); 0' }, S);
    await cdp.send('Input.insertText', { text: 'zażółć' }, S);
    const made = await cdp.send('Target.createTarget', { url: 'about:blank' });
    await cdp.send('Target.activateTarget', { targetId: made.targetId });
    await cdp.send('Target.closeTarget', { targetId: made.targetId });
    assert.deepStrictEqual(e.asked.map((m) => m.op + (m.tab ? ' ' + m.tab : '') + (m.url ? ' ' + m.url : '') + (m.s ? ' ' + m.s : '')),
        ['nav 7 https://example.org/c', 'reload 7', 'state 7', 'back 7', 'state 7', 'fwd 7', 'back 7', 'state 7', 'state 7', 'edit 7', 'quiet 7', 'exitfs 7', 'text 7 zażółć', 'new about:blank', 'show 9', 'close 9'], 'what the extension is asked, in order');
    console.log('ok native: go to, reload, back and forward, the questions about the page, text, tabs');

    // input goes to the engine's window, in the window's pixels
    e.asked.length = 0;
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1192, height: 364, deviceScaleFactor: 1.5 }, S);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1192, height: 364, deviceScaleFactor: 1.5 }, S);
    assert.deepStrictEqual(e.asked.map((m) => [m.op, m.z]), [['zoom', 1.5]], 'the page\'s scale is the tab\'s zoom, asked once');
    input.length = 0;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 100, y: 40 }] }, S);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 100, y: 20 }] }, S);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, S);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 10, y: 10 }, S);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 10, y: 10, button: 'left' }, S);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 10, y: 10, button: 'left' }, S);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 200, y: 100, deltaY: 240 }, S);
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter' }, S);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter' }, S);
    assert.deepStrictEqual(input, ['td 1 150 60', 'tm 1 150 30', 'tu 1', 'pm 15 15', 'pm 15 15', 'pb 0 1', 'pm 15 15', 'pb 0 0', 'pm 300 150', 'pa 30', 'k 28 1 0', 'k 28 0 0'], 'a finger, the cursor, the wheel and a key as lines for g21-wlframe');
    input.length = 0;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 0, y: 0, deltaY: -4000 }, S);
    assert.ok(input.length > 10 && input.slice(1).every((l) => /^pa -(30|[12]?\d)$/.test(l)) && input.slice(1).reduce((a, l) => a + Number(l.slice(3)), 0) === -500, 'a long way of the wheel in steps: ' + input.slice(0, 4).join(' | '));
    // what has no counterpart: done as far as the daemon is concerned, or refused
    await cdp.send('Page.enable', {}, S);
    await cdp.send('Storage.setCookies', { cookies: [] });
    assert.deepStrictEqual(await cdp.send('Storage.getCookies', {}), { cookies: [] });
    await assert.rejects(cdp.send('SystemInfo.getInfo', {}), /not without DevTools/);
    console.log('ok native: input as lines for the engine\'s window in its pixels; the scale as the tab\'s zoom; the rest answered or refused');

    // the extension that ships: what it may do, and that it does not touch a page's world unless the light-video rule asks
    const man = JSON.parse(fs.readFileSync(path.join(root, 'native', 'g21-browser', 'ext', 'manifest.json'), 'utf8'));
    assert.strictEqual(man.manifest_version, 3);
    assert.deepStrictEqual(man.permissions.slice().sort(), ['alarms', 'downloads', 'tabs', 'webNavigation'], 'tabs and their addresses, navigation events, cancelling downloads, the alarm that wakes it: nothing more');
    assert.ok(!man.host_permissions && !man.optional_permissions && !man.web_accessible_resources && !man.externally_connectable, 'no host permissions beyond its own page part; nothing of it can be read or called by a page');
    assert.ok(man.content_scripts.every((c) => c.world !== 'MAIN'), 'as shipped, nothing runs in a page\'s own world');
    ['sw.js', 'page.js'].forEach((f) => { const src = fs.readFileSync(path.join(root, 'native', 'g21-browser', 'ext', f), 'utf8'); assert.ok(!/\beval\(|new Function\(|chrome\.debugger/.test(src), f + ': no eval, no debugger API'); });
    // and the daemon: the engine's arguments without DevTools
    const d = require(path.join(root, 'native', 'g21-browser', 'g21-browserd.js'));
    const self = { zoom: 1, want: { w: 1796, h: 548 }, proxyPort: 1, opts: { stateDir: path.join(root, 'none') }, picture: () => 1, direct: true, policy: () => d.POLICY_DEFAULT, native: true, extDir: '/x/ext' };
    const args = d.Daemon.prototype.engineArgs.call(self, { profile: '/p', kind: 'chrome', major: '153' }, 'https://example.org/', true);
    assert.ok(args.indexOf('--remote-debugging-pipe') < 0 && args.indexOf('--disable-extensions') < 0 && args.indexOf('--load-extension=/x/ext') > 0 && args.indexOf('--disable-extensions-except=/x/ext') > 0, 'no debugging pipe, the one extension: ' + args.filter((a) => /debug|extens/.test(a)).join(' '));
    self.native = false;
    const old = d.Daemon.prototype.engineArgs.call(self, { profile: '/p', kind: 'chrome', major: '153' }, 'https://example.org/', true);
    assert.ok(old.indexOf('--remote-debugging-pipe') >= 0 && old.indexOf('--disable-extensions') >= 0 && !old.some((a) => /^--load-extension/.test(a)), 'rule "control": "devtools": as before');
    assert.strictEqual(d.POLICY_DEFAULT.control, 'native');
    // the GPU mode: by hand, never kept, nothing tried when something is missing, its marker
    {
        const os = require('os');
        const base = fs.mkdtempSync(path.join(os.tmpdir(), 'g21gpu-'));
        const unit = path.join(base, 'unit'), state = path.join(base, 'state'), run = path.join(base, 'run');
        [unit, path.join(unit, 'dri'), state, run].forEach((x) => fs.mkdirSync(x));
        const need = ['libEGL.so.1', 'libGLESv2.so.2', 'libgbm.so.1', 'libglapi.so.0', 'libwayland-client.so.0', 'libwayland-server.so.0', 'libffi.so.6', 'dri/i965_dri.so'];
        const node = path.join(base, 'renderD128'), shim = path.join(base, 'shim.so'), wl = path.join(base, 'wl-gpu');
        const g = Object.create(d.Daemon.prototype);
        const said = [];
        Object.assign(g, { opts: { unitLib: unit, renderNode: node, gpuShim: shim, wlframeGpu: wl, stateDir: state, runDir: run, noSetuid: true }, policy: () => d.POLICY_DEFAULT, log: (x) => said.push(x), push: () => {}, s: { url: '' }, want: null });
        assert.ok(g.gpuNeeds().length >= 10, 'on a machine without the car\'s graphics everything is missing');
        await g.gpuSet(true);
        assert.ok(!g.gpuWant && /^brak: /.test(g.gpuWhy) && said.some((x) => /gpu: not tried, missing/.test(x)), 'nothing is tried, and it is said why: ' + g.gpuWhy);
        need.forEach((n) => fs.writeFileSync(path.join(unit, n), ''));
        [node, shim, wl].forEach((x) => fs.writeFileSync(x, ''));
        assert.deepStrictEqual(g.gpuNeeds(), [], 'with the unit\'s libraries, the render node and our two files it can be tried');
        await g.gpuSet(true);
        assert.ok(g.gpuWant === true && !g.gpuWhy, 'switched on (no engine runs: nothing is started)');
        if (process.platform !== 'win32') {
            const libs = g.gpuLibs();
            assert.strictEqual(fs.readlinkSync(path.join(libs, 'libEGL.so.1')), shim, 'our shim is the engine\'s libEGL.so.1');
            assert.strictEqual(fs.readlinkSync(path.join(libs, 'libgbm.so.1')), path.join(unit, 'libgbm.so.1'), 'the unit\'s own libgbm, not ours');
            assert.ok(!fs.existsSync(path.join(libs, 'libc.so.6')) && fs.readdirSync(libs).length === 7, 'and nothing else of the unit\'s: ' + fs.readdirSync(libs).join(' '));
        }
        g.gpuMark(true);
        assert.ok(fs.existsSync(path.join(state, 'gpu-trial')), 'the marker is written before the chip is touched');
        g.gpuMark(false);
        assert.ok(!fs.existsSync(path.join(state, 'gpu-trial')), 'and removed when the try ended in order');
        const ga = d.Daemon.prototype.engineArgs.call(Object.assign({}, self, { native: true, gpu: true }), { profile: '/p', kind: 'chrome', major: '153' }, 'https://example.org/', true);
        assert.ok(ga.indexOf('--disable-gpu') < 0 && ga.indexOf('--use-angle=gles-egl') > 0 && ga.indexOf('--use-gl=angle') > 0 && ga.indexOf('--disable-gpu-sandbox') > 0 && ga.indexOf('--no-sandbox') < 0, 'the engine on the unit\'s EGL; only the graphics process without its sandbox: ' + ga.filter((x) => /gpu|angle|sandbox|use-gl/.test(x)).join(' '));
        assert.ok(args.indexOf('--disable-gpu') >= 0 && !args.some((x) => /use-angle/.test(x)), 'without the mode: on the processor, as always');
        // the switch is kept (settings.json), and the performance line names the mode
        assert.strictEqual(JSON.parse(fs.readFileSync(path.join(state, 'settings.json'), 'utf8')).gpu, 'on', 'the owner\'s switch is written down');
        await g.gpuSet(false);
        assert.strictEqual(g.gpuWant, false);
        assert.strictEqual(JSON.parse(fs.readFileSync(path.join(state, 'settings.json'), 'utf8')).gpu, 'off');
        {
            const pl = d.Daemon.prototype.perfLine.call({ perf: { sumN: 0, sumMs: 0, unit: 'the unit: 80% of 4 cores busy, most: engine 110%, hmi 60%' }, direct: true, gpu: true, gpuFrames: 'gpu', frameFps: () => 60, opts: {} });
            assert.ok(/^GPU mode \(frames from gpu\), frames direct/.test(pl) && /; the unit: 80% of 4 cores busy, most: engine 110%, hmi 60%$/.test(pl), pl);
            assert.ok(!/GPU mode/.test(d.Daemon.prototype.perfLine.call({ perf: { sumN: 0, sumMs: 0 }, direct: true, gpu: false, frameFps: () => 60, opts: {} })));
        }
        // who has the processor: from a /proc made here, two looks apart
        {
            const proc = path.join(base, 'proc');
            const put = (cpuLine, list) => { fs.rmSync(proc, { recursive: true, force: true }); fs.mkdirSync(proc); fs.writeFileSync(path.join(proc, 'stat'), cpuLine + '\ncpu0 1 2 3\n');
                list.forEach((p) => { fs.mkdirSync(path.join(proc, String(p[0]))); fs.writeFileSync(path.join(proc, String(p[0]), 'stat'), p[0] + ' (' + p[1] + ') S 1 1 1 0 -1 0 0 0 0 0 ' + p[2] + ' ' + p[3] + ' 0 0 20 0 1 0 0 0 0\n'); }); };
            const u = Object.create(d.Daemon.prototype);
            Object.assign(u, { opts: { procDir: proc }, engineProcs: () => [20, 21] });
            put('cpu  1000 0 500 8000 500 0 0 0 0 0', [[10, 'hmi main (x)', 100, 50], [20, 'chrome', 10, 10], [21, 'chrome', 5, 5], [30, 'quiet', 7, 0]]);
            assert.strictEqual(u.perfUnit(), '', 'nothing to say at the first look');
            const cores = require('os').cpus().length;
            // 4000 ticks later: 1000 of them idle; hmi used 600, the engine's two processes 300 and 100, another 1
            put('cpu  3500 0 1000 8800 700 0 0 0 0 0', [[10, 'hmi main (x)', 500, 250], [20, 'chrome', 210, 110], [21, 'chrome', 85, 25], [30, 'quiet', 8, 0], [40, 'new', 900, 0]]);
            const line = u.perfUnit();
            const share = (ticks) => Math.round(ticks * 100 * cores / 4000);
            assert.strictEqual(line, 'the unit: 75% of ' + cores + ' cores busy, most: hmi_main__x_ ' + share(600) + '%, engine ' + share(400) + '%', line);
        }
        console.log('ok native: the GPU switch is kept; the performance line names the mode and who has the processor');
        fs.rmSync(base, { recursive: true, force: true });
    }
    console.log('ok native: the GPU mode is tried only when all it needs is there, by hand; its library folder, marker and arguments');
    console.log('ok native: the extension as shipped; the engine\'s arguments with and without DevTools');

    cdp.close();
    try { e.sock.destroy(); } catch (x2) { /* gone */ }
    console.log('test_browser_native: ok');
    process.exit(0);
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
