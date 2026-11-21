'use strict';
// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * tools/sim/smooth.js <repo> <dir> [name=value ...]: how smoothly Przeglądarka scrolls a heavy page on the stand.
 *
 * A page made here (a fixed header with a blur behind it, 300 cards with shadows, gradients, pictures and text, one
 * endless animation) is scrolled with the wheel for 12 s, down and up, and the frames that reach the video file are
 * counted as the daemon counts them on the car (frames a second while the picture moved, the gaps between them),
 * with the engine's processor time for the scroll.
 *
 *   hogs=N        N endless loops beside the engine: a head unit that is busy all the time (the car: load 8 to 37
 *                 on four cores, 2026-11-21). With `taskset -c 0,1 sh tools/sim/run.sh smooth.js hogs=6` the engine
 *                 competes for two cores.
 *   frames=direct30 | picture=0.75 | mobile=on   rules of the browser for this run
 *   flags=--a,--b extra switches for the engine (daemon option engineExtra: the stand only)
 *
 * The numbers compare one set of switches with another on this machine. They do not predict the car.
 */
const cp = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');
const repo = process.argv[2], dir = process.argv[3];
const arg = {};
process.argv.slice(4).forEach((a) => { const i = a.indexOf('='); if (i > 0) arg[a.slice(0, i)] = a.slice(i + 1); });

function page() {
    let cards = '';
    for (let i = 0; i < 300; i++) {
        cards += '<div class="card"><div class="pic" style="background:linear-gradient(' + (i * 37 % 360) + 'deg,hsl(' + (i * 53 % 360) + ',70%,45%),hsl(' + (i * 91 % 360) + ',70%,25%))"><svg viewBox="0 0 160 90" width="100%" height="100%"><circle cx="' + (30 + i % 100) + '" cy="45" r="28" fill="rgba(255,255,255,.35)"/><rect x="' + (i % 90) + '" y="60" width="70" height="14" rx="7" fill="rgba(0,0,0,.4)"/></svg></div>'
            + '<div class="txt"><h3>Karta numer ' + i + ': tytuł, który zajmuje dwie linie na wąskim ekranie</h3><p>Opis pozycji z kilkoma zdaniami tekstu, żeby układ strony i rysowanie liter miały co robić. Zażółć gęślą jaźń ' + i + '.</p><span class="tag">' + (i * 7919 % 1000) + ' tys. wyświetleń</span></div></div>';
    }
    return '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>płynność</title><style>'
        + 'body{margin:0;font:16px/1.4 sans-serif;background:#0f0f12;color:#eee}'
        + 'header{position:fixed;top:0;left:0;right:0;height:64px;background:rgba(20,20,26,.6);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);z-index:5;display:flex;align-items:center;padding:0 24px;box-shadow:0 2px 12px rgba(0,0,0,.6)}'
        + '.spin{width:28px;height:28px;border:4px solid #888;border-top-color:#fff;border-radius:50%;animation:s 1s linear infinite;margin-right:16px}@keyframes s{to{transform:rotate(360deg)}}'
        + 'main{padding:84px 24px 40px;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px}'
        + '.card{background:#1b1b22;border-radius:14px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,.55)}.pic{height:150px}.txt{padding:12px 14px}h3{margin:0 0 6px;font-size:17px}p{margin:0 0 8px;color:#bbb}'
        + '.tag{display:inline-block;padding:3px 10px;border-radius:12px;background:#2c2c38;color:#9cf;font-size:13px}'
        + '</style><header><div class="spin"></div><b>Strona testowa płynności</b></header><main>' + cards + '</main>';
}
// processor time (s) of a process and all below it
function treeSeconds(root) {
    const kids = {};
    let all = [];
    try { all = fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x)); } catch (e) { return 0; }
    const stat = {};
    all.forEach((pid) => { try { const t = fs.readFileSync('/proc/' + pid + '/stat', 'utf8'); const r = t.slice(t.lastIndexOf(')') + 2).split(' '); stat[pid] = { pp: r[1], ticks: Number(r[11]) + Number(r[12]) }; (kids[r[1]] = kids[r[1]] || []).push(pid); } catch (e) { /* gone */ } });
    let sum = 0;
    const walk = (pid) => { if (stat[pid]) sum += stat[pid].ticks; (kids[pid] || []).forEach(walk); };
    walk(String(root));
    return sum / 100;
}

(async () => {
    const html = page();
    const srv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(html); });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const url = 'http://127.0.0.1:' + srv.address().port + '/';
    const extra = arg.flags ? arg.flags.split(',').filter(Boolean) : [];
    const stand = await require('./stand.js').start({ repo: repo, dir: dir, input: true, browser: true, idleMs: 90000, daemon: { engineExtra: extra } });
    const app = stand.app, menu = stand.menu, st = () => app._web.state();
    const names = () => menu.snapshot().items.map((i) => i.name);
    await stand.turn(0); await stand.sleep(300);
    await stand.turn(names().indexOf('browser') - menu.selected()); await stand.push();
    await stand.until('the engine', () => st().engine === 'ready' && st().live, 40000);
    for (const k of ['frames', 'mobile']) if (arg[k]) { app._web.send({ op: 'policy', key: k, value: arg[k] }); await stand.sleep(15000); }
    if (arg.picture) { app._web.send({ op: 'policy', key: 'picture', value: Number(arg.picture) }); await stand.sleep(15000); }
    await stand.until('the engine again', () => st().engine === 'ready' && st().live, 40000);
    app._web.send({ op: 'nav', url: url });
    await stand.until('the page', () => /płynność/.test(st().title || ''), 30000);
    const hogs = [];
    for (let i = 0; i < (Number(arg.hogs) || 0); i++) hogs.push(cp.spawn('sh', ['-c', 'while :; do :; done'], { stdio: 'ignore' }));
    await stand.sleep(4000);
    // count the frames as the daemon does, from here on
    const dm = stand.daemon;
    const got = { n: 0, ms: 0, max: 0, p95: 0, med: [], pct: [] };
    const was = dm.perfFrames.bind(dm);
    dm.perfFrames = (f) => { got.n += f.n; got.ms += f.ms; got.max = Math.max(got.max, f.max); got.p95 = Math.max(got.p95, f.p95); got.med.push(f.med); got.pct.push(f.pct); was(f); };
    const pid = dm.engine.child.pid, cpu0 = treeSeconds(pid), t0 = Date.now();
    for (let i = 0; i < 240; i++) { app._web.send({ op: 'scroll', dx: 0, dy: i < 150 ? 120 : -200 }); await stand.sleep(50); }
    await stand.sleep(2500);    // the frame tool reports every two seconds
    const wall = (Date.now() - t0) / 1000, cpu = treeSeconds(pid) - cpu0;
    hogs.forEach((h) => { try { h.kill('SIGKILL'); } catch (e) { /* gone */ } });
    got.med.sort((a, b) => a - b);
    console.log('RESULT ' + JSON.stringify({ run: process.argv.slice(4).join(' ') || 'as shipped', frames: got.n, fps: got.ms ? Number((got.n * 1000 / got.ms).toFixed(1)) : 0, perSecondOfScroll: Number((got.n / 12).toFixed(1)),
        gapMiddleMs: got.med[Math.floor(got.med.length / 2)] || 0, gap95Ms: got.p95, gapLongestMs: got.max, engineCpuS: Number(cpu.toFixed(2)), wallS: Number(wall.toFixed(1)), size: st().w + 'x' + st().h, native: !!dm.engine.native }));
    try { await dm.close(); } catch (e) { /* closing */ }
    process.exit(0);
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
