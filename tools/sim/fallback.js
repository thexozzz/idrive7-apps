'use strict';
// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * tools/sim/fallback.js <repo> <dir>: the engine's extension cannot reach the daemon (here: it is given a wrong
 * word). What must happen: the engine is started once more the same way, then with DevTools, and the owner is TOLD
 * (the line where the page's title stands: "tryb awaryjny ..."), never silently; the browser works meanwhile.
 * And when the extension can connect again, a later start is without DevTools again and the line is gone.
 * Run through tools/sim/run.sh (the stand: the real app, daemon and Chrome).
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const repo = process.argv[2], dir = process.argv[3];
let fails = 0;
function check(text, ok, got) { if (!ok) fails += 1; console.log((ok ? 'ok   ' : 'FAIL ') + text + (ok ? '' : ': ' + JSON.stringify(got))); }

(async () => {
    const srv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end('<!doctype html><title>strona ' + q.url + '</title><body>strona'); });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const url = 'http://127.0.0.1:' + srv.address().port + '/';
    const stand = await require('./stand.js').start({ repo: repo, dir: dir, input: true, browser: true, idleMs: 90000, daemon: { startMs: 5000 } });
    const app = stand.app, menu = stand.menu, st = () => app._web.state(), dm = () => stand.daemon;
    const names = () => menu.snapshot().items.map((i) => i.name);
    const log = () => fs.readFileSync(path.join(dir, 'browser', 'log', 'browserd.log'), 'utf8');
    // the extension is given a wrong word: it cannot get onto the daemon's line
    const real = dm().writeExt;
    let broken = true;
    dm().writeExt = function (dirs) { const d = real.call(this, dirs); if (broken) fs.writeFileSync(path.join(d, 'config.json'), JSON.stringify({ port: this.link.port, word: 'wrong' })); return d; };
    await stand.turn(0); await stand.sleep(300);
    const t0 = Date.now();
    await stand.turn(names().indexOf('browser') - menu.selected()); await stand.push();
    await stand.until('the engine', () => st().engine === 'ready' && st().live, 60000);
    console.log('     the engine was up ' + (Date.now() - t0) + ' ms after the view was opened');
    check('the engine runs with DevTools after two tries without', !dm().engine.native && dm().lastArgs.indexOf('--remote-debugging-pipe') >= 0 && /started once more without DevTools/.test(log()) && /no extension twice/.test(log()), dm().lastArgs.filter((a) => /debug|extens/.test(a)));
    check('the owner is told (the line over the page)', /^tryb awaryjny/.test(st().note || ''), st().note);
    app._web.send({ op: 'nav', url: url + 'a' });
    await stand.until('a page', () => /strona \/a/.test(st().title) && !st().loading, 15000);
    check('the browser works meanwhile, and the line stays over a new page', /^tryb awaryjny/.test(st().note || ''), st().note);
    await stand.shot('f01-emergency-mode');
    // the cause is gone: after the wait a new start is without DevTools again
    broken = false;
    dm().nativeFailedAt = Date.now() - 301000;
    app._web.send({ op: 'zoom', z: 1.25 });
    await stand.sleep(1500);
    await stand.until('the engine again', () => st().engine === 'ready' && st().live, 40000);
    check('a later start is without DevTools again, and nothing is said any more', !!dm().engine.native && !st().note, [dm().engine.native, st().note]);
    console.log(fails ? 'fallback: ' + fails + ' FAILED' : 'fallback: ok');
    if (stand.daemon) { try { await stand.daemon.close(); } catch (e) { /* closing */ } }
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
