'use strict';
// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * tools/sim/pages.js <repo> <dir> <url> [url ...] [desktop]: pages opened in Przeglądarka on the stand (the real app,
 * the real browser tool, a real Chrome), one after another: where each ends up, its title, the first of its text,
 * what the engine says about its requests that fail, and a picture (<dir>/shots). For "this page does not open in
 * the car's browser". Needs the internet. Run through tools/sim/run.sh. Nothing is typed into any page.
 */
const fs = require('fs');
const path = require('path');
const repo = process.argv[2], dir = process.argv[3];
const rest = process.argv.slice(4);
const urls = rest.filter((a) => /^https?:|^chrome:/.test(a)), how = rest.filter((a) => !/^https?:|^chrome:/.test(a)).join(' ');

(async () => {
    const stand = await require('./stand.js').start({ repo: repo, dir: dir, input: true, browser: true, idleMs: 90000, daemon: { control: /devtools/.test(how) ? 'devtools' : 'native' } });
    const app = stand.app, menu = stand.menu;
    const dm = () => stand.daemon;
    const st = () => app._web.state();
    const page = async (x) => { try { const r = await dm().engine.cdp.send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }, dm().engine.session); return r.result ? r.result.value : undefined; } catch (e) { return 'eval: ' + e.message; } };
    const names = () => menu.snapshot().items.map((i) => i.name);
    const pick = async (name) => { const at = names().indexOf(name); if (at < 0) throw new Error('no row ' + name); await stand.turn(at - menu.selected()); await stand.push(); await stand.sleep(150); };
    await stand.turn(0); await stand.sleep(300);
    await pick('browser');
    await stand.until('the engine', () => st().engine === 'ready' && st().live, 40000);
    if (/desktop/.test(how)) { app._web.send({ op: 'policy', key: 'mobile', value: 'off' }); await stand.sleep(1500); await stand.until('the engine again', () => st().engine === 'ready' && st().live, 40000); }
    console.log('engine: ' + JSON.stringify(await page('JSON.stringify({ua:navigator.userAgent,webdriver:navigator.webdriver,langs:navigator.languages,plat:navigator.platform,touch:navigator.maxTouchPoints,cookies:navigator.cookieEnabled,win:[innerWidth,innerHeight],scr:[screen.width,screen.height],sw:!!navigator.serviceWorker,idb:!!window.indexedDB,ls:(function(){try{localStorage.setItem("a","1");return true}catch(e){return String(e)}})()})')));
    let n = 0;
    for (const url of urls) {
        n += 1;
        const trace = [], urlsOf = {}, t0 = Date.now();
        const e0 = dm().engine;
        const real = dm().onEvent;
        dm().onEvent = function (e, m) {
            const p = m.params || {}, at = ((Date.now() - t0) / 1000).toFixed(1) + ' ';
            if (m.method === 'Network.requestWillBeSent') urlsOf[p.requestId] = String(p.request.url).slice(0, 110);
            else if (m.method === 'Network.loadingFailed' && !p.canceled) trace.push(at + 'failed ' + p.errorText + (p.blockedReason ? ' (' + p.blockedReason + ')' : '') + ' ' + (urlsOf[p.requestId] || ''));
            else if (m.method === 'Network.responseReceived' && p.response.status >= 400) trace.push(at + p.response.status + ' ' + String(p.response.url).slice(0, 120));
            else if (m.method === 'Target.targetCreated' || m.method === 'Page.windowOpen' || m.method === 'Page.javascriptDialogOpening') trace.push(at + m.method + ' ' + JSON.stringify(p).slice(0, 220));
            else if (m.method === 'Log.entryAdded' && p.entry && p.entry.level === 'error') trace.push(at + 'page: ' + String(p.entry.text).slice(0, 200) + ' ' + String(p.entry.url || '').slice(0, 90));
            return real.apply(this, arguments);
        };
        try { await e0.cdp.send('Network.enable', {}, e0.session); } catch (x) { /* another engine */ }
        app._web.send({ op: 'nav', url: url });
        await stand.sleep(1500);
        try { await stand.until('the page', () => !st().loading, 30000); } catch (x) { console.log('   (still loading after 30 s)'); }
        await stand.sleep(5000);
        const text = await page('(document.body?document.body.innerText:"").replace(/\\s+/g," ").slice(0,500)');
        console.log('== ' + url);
        console.log('   ends at: ' + st().url + '   title: ' + st().title + (st().err ? '   daemon says: ' + st().err : ''));
        console.log('   text: ' + text);
        console.log('   links/buttons: ' + await page('[].slice.call(document.querySelectorAll("a,button,input[type=submit]")).filter(function(x){return x.offsetParent!==null}).slice(0,14).map(function(x){return (x.innerText||x.value||x.getAttribute("aria-label")||"").trim().slice(0,28)}).filter(Boolean).join(" | ")'));
        trace.slice(0, 25).forEach((l) => console.log('   ' + l));
        await stand.shot('p' + String(n).padStart(2, '0'));
        dm().onEvent = real;
    }
    const NL = String.fromCharCode(10);
    try { console.log(fs.readFileSync(path.join(dir, 'browser', 'log', 'browserd.log'), 'utf8').split(NL).filter((l) => /proxy|refused|blocked|popup|window|engine stopped|fault|crash/.test(l)).map((l) => '   ' + l.slice(11, 260)).slice(-30).join(NL)); } catch (x) { /* no log */ }
    if (stand.daemon) { try { await stand.daemon.close(); } catch (e) { /* closing */ } }
    process.exit(0);
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
