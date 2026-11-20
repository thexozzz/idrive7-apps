'use strict';
// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * tools/sim/watch.js <repo> <dir> <url> [step ...]: a page opened in Przeglądarka on the stand and looked at over
 * time, for pages that cannot be asked anything (the engine without DevTools). Steps, in order:
 *   <n>        wait n seconds          tap:<x>,<y>   a finger's tap at that place of the page area
 *   shot       a picture (<dir>/shots)  say           the address and title now
 * Needs the internet. Run through tools/sim/run.sh. Nothing is typed into any page.
 */
const repo = process.argv[2], dir = process.argv[3], url = process.argv[4], steps = process.argv.slice(5);
(async () => {
    const stand = await require('./stand.js').start({ repo: repo, dir: dir, input: true, browser: true, idleMs: 90000 });
    const app = stand.app, menu = stand.menu, st = () => app._web.state();
    const names = () => menu.snapshot().items.map((i) => i.name);
    let n = 0;
    await stand.turn(0); await stand.sleep(300);
    await stand.turn(names().indexOf('browser') - menu.selected()); await stand.push();
    await stand.until('the engine', () => st().engine === 'ready' && st().live, 40000);
    console.log('engine: ' + (stand.daemon.engine.native ? 'without DevTools' : 'with DevTools'));
    app._web.send({ op: 'nav', url: url });
    for (const s of steps) {
        const m = /^tap:(\d+),(\d+)$/.exec(s);
        if (m) { app._web.send({ op: 'touch', p: 1, x: Number(m[1]), y: Number(m[2]) }); await stand.sleep(70); app._web.send({ op: 'touch', p: 3, x: Number(m[1]), y: Number(m[2]) }); await stand.sleep(400); }
        else if (s === 'shot') { n += 1; await stand.shot('w' + String(n).padStart(2, '0')); }
        else if (s === 'say') console.log('   ' + st().url + '   "' + st().title + '"' + (st().err ? '   daemon says: ' + st().err : '') + (st().fs ? '   full screen' : ''));
        else if (Number(s) > 0) await stand.sleep(Number(s) * 1000);
    }
    if (stand.daemon) { try { await stand.daemon.close(); } catch (e) { /* closing */ } }
    process.exit(0);
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
