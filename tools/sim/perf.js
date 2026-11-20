'use strict';
// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * tools/sim/perf.js <repo> <dir>: what THEiPlay's interface costs on the stand, for one version of the repository
 * (run it for two checkouts to compare them: SIM_REPO=<other checkout>). Numbers of this machine, not of the head
 * unit: they compare versions, they do not predict the car.
 *   idle        the home screen, nothing touched: is a still menu drawn again and again?
 *   knob        a step of the knob every 120 ms
 *   cursor      the pad's cursor moved 60 times a second
 *   open        from a choice to the frame of the page it opens
 *   long        300 rounds through Ustawienia with the cursor moving: memory and open handles before and after
 *   video       a page that animates, alone / with the cursor moving over the bar: pictures a second in the video file
 * One JSON line at the end.
 */
const fs = require('fs');
const http = require('http');
const repo = process.argv[2], dir = process.argv[3];
(async () => {
    const ANIM = '<!doctype html><body style="margin:0;background:#123"><div id=b style="position:absolute;width:300px;height:300px;background:#fc3"></div><script>var t=0;function f(){t+=4;b.style.transform="translate("+(t%1400)+"px,"+(120+100*Math.sin(t/60))+"px)";requestAnimationFrame(f);}f();</script>';
    const srv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(ANIM); });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const withWeb = process.argv[4] !== 'menu';
    const stand = await require('./stand.js').start({ repo: repo, dir: dir, input: true, browser: withWeb });
    const app = stand.app, menu = stand.menu, out = { version: (JSON.parse(fs.readFileSync(repo + '/apps/g21_airplay/package/package.json', 'utf8')).version) };
    const span = async (name, secs, each, gap) => {
        if (global.gc) global.gc();
        const a = stand.usage(); const t0 = Date.now();
        while (Date.now() - t0 < secs * 1000) { if (each) await each(); await stand.sleep(gap || 50); }
        out[name] = stand.diff(a, stand.usage());
    };
    await stand.sleep(1500);
    await span('idle', 8, null, 200);
    let dir1 = 1, n = 0;
    await span('knob', 8, async () => { n += 1; if (n % 4 === 0) dir1 = -dir1; await stand.turn(dir1); }, 20);
    app._mouseOn = true; app._desk.setMouse(true); app._desk.setMenuMouse(true); app._syncMouse('the stand');
    await stand.until('the pad', () => !!stand.pad, 5000);
    let a = 0;
    await span('cursor', 8, async () => { a += 0.12; stand.padMove(Math.cos(a) * 6, Math.sin(a) * 4); }, 16);
    // from a choice to its page's frame
    const times = [];
    for (let i = 0; i < 30; i++) {
        for (const name of ['system', 'system-back']) {
            const f0 = stand.frames, t0 = process.hrtime.bigint();
            app._onMenuChoice(name);
            while (stand.frames === f0 && Number(process.hrtime.bigint() - t0) < 5e8) await new Promise((r) => setImmediate(r));
            times.push(Number(process.hrtime.bigint() - t0) / 1e6);
            await stand.sleep(40);
        }
    }
    times.sort((x, y) => x - y);
    out.open = { n: times.length, medianMs: +times[times.length >> 1].toFixed(2), p95Ms: +times[Math.floor(times.length * 0.95)].toFixed(2), maxMs: +times[times.length - 1].toFixed(2) };
    // a long run
    if (global.gc) global.gc();
    const m0 = stand.usage();
    const groups = ['sg-display', 'sg-input', 'sg-general'];
    for (let i = 0; i < 300; i++) {
        app._onMenuChoice('system'); await stand.sleep(8);
        app._onMenuChoice(groups[i % 3]); stand.padMove(5, 3); await stand.sleep(8);
        app._onMenuChoice({ 'sg-display': 'sgd-back', 'sg-input': 'sgi-back', 'sg-general': 'sgg-back' }[groups[i % 3]]); stand.padMove(-5, -3); await stand.sleep(8);
        app._onMenuChoice('system-back'); await stand.sleep(8);
    }
    await stand.sleep(500);
    if (global.gc) global.gc();
    const m1 = stand.usage();
    out.long = { rounds: 300, rssBeforeMb: +m0.rssMb.toFixed(1), rssAfterMb: +m1.rssMb.toFixed(1), heapBeforeMb: +(process.memoryUsage().heapUsed / 1048576).toFixed(1), handlesBefore: m0.handles, handlesAfter: m1.handles, frames: m1.frames - m0.frames };
    if (withWeb) {
        const ring = () => { try { const fd = fs.openSync(stand.videoFile || '/dev/shm/mgu-video-g21browser', 'r'); const b = Buffer.alloc(24); fs.readSync(fd, b, 0, 24, 0); fs.closeSync(fd); return b.readUInt32LE(16); } catch (e) { return 0; } };
        const rate = async (secs, each) => { const s0 = ring(), t0 = Date.now(); const u0 = stand.usage(); while (Date.now() - t0 < secs * 1000) { if (each) each(); await stand.sleep(16); } return { picturesPerS: +((ring() - s0) / secs).toFixed(1), app: stand.diff(u0, stand.usage()) }; };
        app._mouseOn = false; app._syncMouse('the stand');
        app._onMenuChoice('browser');
        await stand.until('the engine', () => app._web.state().live, 40000);
        app._web.send({ op: 'nav', url: 'http://127.0.0.1:' + srv.address().port + '/' });
        await stand.sleep(3000);
        out.videoAlone = await rate(6, null);
        app._mouseOn = true; app._syncMouse('the stand');
        await stand.sleep(600);
        let k = 0;
        out.videoCursor = await rate(6, () => { k += 0.2; stand.padMove(Math.cos(k) * 8, -2 + Math.sin(k) * 2); });
        app._onMenuChoice('web-exit');
    }
    console.log('PERF ' + JSON.stringify(out));
    if (stand.daemon) { try { await stand.daemon.close(); } catch (e) { /* closing */ } }
    process.exit(0);
})().catch((e) => { console.error('perf failed: ' + e.stack); process.exit(1); });
