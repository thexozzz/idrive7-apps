'use strict';
// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * tools/sim/native.js <repo> <dir>: Przeglądarka with the engine driven without its DevTools interface (g21-native.js:
 * input through the engine's window, the page's state through the engine's extension), on the stand: the real app,
 * the real daemon, a real Chrome, pages of a server here. What an owner does and what must come of it:
 *   a tap on a link, back and forward, a tap into a field and text from the app's keyboard, Enter, scrolling, a
 *   player's full screen and Escape, a link that wants a new window, the settings over the page, another zoom, an app
 *   from Sklep beside the browser.
 * The pages write what happened to them into their titles, which is how this script sees it: nothing is asked of the
 * page through DevTools, there is none. Run through tools/sim/run.sh. Pictures in <dir>/shots.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const repo = process.argv[2], dir = process.argv[3];
let fails = 0, shotN = 0;
function check(text, ok, got) { if (!ok) fails += 1; console.log((ok ? 'ok   ' : 'FAIL ') + text + (ok ? '' : ': ' + JSON.stringify(got))); }

const PAGE = (name) => '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width"><title>' + name + '</title>'
    + '<body style="margin:0;font:22px sans-serif;background:' + (/app/.test(name) ? '#e8f4ec' : '#f6efe4') + ';height:2600px">'
    + '<a id=l href="/druga" style="position:absolute;left:40px;top:40px;width:300px;height:80px;background:#cde;display:block">do drugiej</a>'
    + '<a id=n href="/trzecia" target="_blank" style="position:absolute;left:400px;top:40px;width:300px;height:80px;background:#dce;display:block">nowe okno</a>'
    + '<form id=f style="position:absolute;left:40px;top:160px"><input id=i name=q style="font:22px sans-serif;width:600px;height:60px"></form>'
    + '<div id=fs style="position:absolute;left:760px;top:40px;width:300px;height:80px;background:#fc9">pełny ekran</div>'
    + '<script>var S={n:' + JSON.stringify(name) + ',m:Math.floor(Math.random()*9000+1000),wd:String(navigator.webdriver),w:innerWidth,tap:0,key:"",val:"",sub:0,sc:0,fs:0,tr:1};'
    + 'function T(){document.title=Object.keys(S).map(function(k){return k+"="+S[k]}).join("|")}T();'
    + 'addEventListener("click",function(e){S.tap++;if(!e.isTrusted)S.tr=0;T()});'
    + 'addEventListener("keydown",function(e){S.key=e.key;if(!e.isTrusted)S.tr=0;T()});'
    + 'document.getElementById("i").addEventListener("input",function(){S.val=this.value;T()});'
    + 'document.getElementById("f").addEventListener("submit",function(e){e.preventDefault();S.sub++;T()});'
    + 'addEventListener("scroll",function(){S.sc=Math.round(scrollY);T()});addEventListener("resize",function(){S.w=innerWidth;T()});setInterval(function(){if(S.w!==innerWidth){S.w=innerWidth;T()}},300);'
    + 'document.getElementById("fs").addEventListener("click",function(){document.documentElement.requestFullscreen()});'
    + 'document.addEventListener("fullscreenchange",function(){S.fs=document.fullscreenElement?1:0;S.w=innerWidth;T()});</script>';

(async () => {
    const srv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(PAGE(decodeURIComponent(q.url.replace(/^\//, '').replace(/\?.*$/, '')) || 'start')); });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const url = 'http://127.0.0.1:' + srv.address().port + '/';
    const stand = await require('./stand.js').start({ repo: repo, dir: dir, input: true, browser: true, idleMs: 90000, apps: { demo: { name: 'Demo', url: url + 'app-demo' } } });
    const app = stand.app, menu = stand.menu;
    const dm = () => stand.daemon;
    const st = () => app._web.state();
    const shot = async (name) => { shotN += 1; return stand.shot('n' + String(shotN).padStart(2, '0') + '-' + name); };
    const names = () => menu.snapshot().items.map((i) => i.name);
    const pick = async (name) => {
        const at = names().indexOf(name);
        if (at < 0) throw new Error('no row "' + name + '" on ' + menu.screen() + ': ' + names().join(','));
        if (menu.focus().zone !== 'list') await stand.tilt(menu.focus().zone === 'head' ? 's' : 'n');
        await stand.turn(at - menu.selected()); await stand.push(); await stand.sleep(150);
    };
    // what the page wrote into its title
    const T = () => { const o = {}; String(st().title || '').split('|').forEach((kv) => { const i = kv.indexOf('='); if (i > 0) o[kv.slice(0, i)] = kv.slice(i + 1); }); return o; };
    const until = async (what, fn, ms) => { try { await stand.until(what, fn, ms || 8000); return true; } catch (e) { check(what, false, { url: st().url, title: st().title, back: st().back, fs: st().fs }); return false; } };
    const tap = async (x, y) => { app._web.send({ op: 'touch', p: 1, x: x, y: y }); await stand.sleep(60); app._web.send({ op: 'touch', p: 3, x: x, y: y }); await stand.sleep(500); };

    await stand.turn(0); await stand.sleep(300);
    await pick('browser');
    await stand.until('the engine', () => st().engine === 'ready' && st().live, 40000);
    const e0 = dm().engine;
    check('the engine runs without DevTools', !!e0.native && dm().lastArgs.indexOf('--remote-debugging-pipe') < 0 && dm().lastArgs.some((a) => /^--load-extension=/.test(a)), dm().lastArgs.filter((a) => /debug|extens/.test(a)));
    const pid = e0.child.pid;
    app._web.send({ op: 'nav', url: url + 'pierwsza' });
    await until('the first page', () => /pierwsza$/.test(st().url) && !st().loading && T().n === 'pierwsza');
    check('the page is not told it is driven by a program (navigator.webdriver)', T().wd === 'false', T());
    check('the page has the width of the page area', Number(T().w) >= 1700 && Number(T().w) <= 1796, T());
    await shot('page');

    // ---- a tap on a link, back, forward
    await tap(120, 80);
    await until('a tap on a link: the second page', () => /druga$/.test(st().url) && !st().loading && T().n === 'druga');
    check('there is a way back', st().back === true && st().fwd === false, [st().back, st().fwd]);
    app._web.send({ op: 'back' });
    await until('back: the first page', () => /pierwsza$/.test(st().url) && T().n === 'pierwsza');
    await stand.sleep(600);
    check('and a way forward', st().fwd === true, [st().back, st().fwd]);
    app._web.send({ op: 'fwd' });
    await until('forward: the second page', () => /druga$/.test(st().url) && T().n === 'druga');
    const mark = T().m;

    // ---- a field: the app's keyboard is asked for, text goes in, Enter sends the form
    let edit = null;
    const onEdit = app._onWebEdit;
    app._onWebEdit = function (ev) { edit = ev; return onEdit.apply(this, arguments); };
    await tap(200, 190);
    await until('a tap into a field: the app is asked for its keyboard', () => !!edit && st().editable === true);
    app._web.send({ op: 'text', s: 'zażółć gęślą', replace: true });
    await until('text from the keyboard is in the field', () => T().val === 'zażółć gęślą');
    app._web.send({ op: 'text', s: 'jaźń', replace: true, enter: true });
    await until('new text replaces it and Enter sends the form', () => T().val === 'jaźń' && T().sub === '1' && T().key === 'Enter');
    check('the page saw real input (no made-up events)', T().tr === '1', T());
    await shot('field');
    // (the app's keyboard came up for the field: put away, as its own key does)
    if (menu.editing && menu.editing()) { menu.cancelEdit(); await stand.sleep(300); }
    app._onWebEdit = onEdit;

    // ---- scrolling (the knob) and a finger's drag
    app._web.send({ op: 'scroll', dx: 0, dy: 360 });
    await until('the knob scrolls the page', () => Number(T().sc) > 100);
    const sc1 = Number(T().sc);
    app._web.send({ op: 'touch', p: 1, x: 900, y: 450 });
    for (let y = 430; y >= 150; y -= 40) { await stand.sleep(30); app._web.send({ op: 'touch', p: 2, x: 900, y: y }); }
    await stand.sleep(40); app._web.send({ op: 'touch', p: 3, x: 900, y: 150 });
    await until('a finger drags the page', () => Number(T().sc) > sc1 + 100);
    for (let i = 0; i < 12 && Number(T().sc) > 0; i++) { app._web.send({ op: 'scroll', dx: 0, dy: -360 }); await stand.sleep(250); }
    await until('and back to the top', () => Number(T().sc) === 0);

    // ---- full screen and Escape
    await tap(900, 80);
    await until('a player\'s full screen: the whole screen', () => !!st().fs && T().fs === '1', 10000);
    await stand.sleep(800);
    await shot('full-screen');
    app._web.send({ op: 'key', k: 'Escape' });
    await until('Escape leaves full screen', () => !st().fs && T().fs === '0', 10000);
    await stand.sleep(500);
    check('the same page all along (not loaded again), the same engine', T().m === mark && dm().engine.child.pid === pid, [T().m, mark]);

    // ---- a link that wants a new window opens in the page
    await tap(520, 80);
    await until('a link for a new window opens in the same page', () => /trzecia$/.test(st().url) && T().n === 'trzecia', 10000);
    await stand.sleep(4500);
    check('one page in the engine', Object.keys(dm().engine.cdp.tabs).length === 1, Object.keys(dm().engine.cdp.tabs));
    app._web.send({ op: 'back' });
    await until('back from it', () => /druga$/.test(st().url) && T().n === 'druga');

    // ---- the settings over the page
    const mark2 = T().m;
    app._web.send({ op: 'scroll', dx: 0, dy: 500 });
    await until('scrolled', () => Number(T().sc) > 300);
    const sc2 = T().sc;
    app._mouseOn = false; app._syncMouse('the stand: the knob alone'); await stand.sleep(200);
    await stand.push();
    if (menu.focus().name !== 'web-url') console.log('     the knob after a press: ' + JSON.stringify(menu.focus()) + ' editing ' + (menu.editing && menu.editing()) + ' screen ' + menu.screen());
    await stand.turn(1); await stand.push(); await stand.turn(-1); await stand.push(); await stand.sleep(400);
    check('the settings are over the page', app._webHeld === true, [app._webHeld, menu.screen()]);
    await shot('settings-over-page');
    await pick('sgd-back');
    await until('the page again', () => !app._webHeld && st().live);
    await stand.sleep(500);
    check('the same page at the same place after the settings', T().m === mark2 && T().sc === sc2 && dm().engine.child.pid === pid, [T().m, mark2, T().sc, sc2]);

    // ---- another zoom: the engine starts again on the same page, still without DevTools
    app._web.send({ op: 'zoom', z: 1.5 });
    await stand.sleep(1500);
    await stand.until('the engine again', () => st().engine === 'ready' && st().live, 40000);
    await until('zoom 150 %: the same address, a narrower page', () => /druga$/.test(st().url) && Number(T().w) > 1100 && Number(T().w) < 1250, 15000);
    check('still without DevTools', !!dm().engine.native, dm().lastArgs.filter((a) => /debug/.test(a)));
    await tap(120 * 1.5, 80 * 1.5);
    await until('a tap lands where it should at 150 %', () => T().n === 'druga' && Number(T().tap) >= 1 || /druga$/.test(st().url));
    await shot('zoom-150');
    app._web.send({ op: 'zoom', z: 1 });
    await stand.sleep(1500);
    await stand.until('the engine again', () => st().engine === 'ready' && st().live, 40000);
    await until('zoom 100 % again', () => Number(T().w) >= 1700);

    // ---- an app from Sklep beside the browser
    await stand.sleep(2500);
    const mark3 = T().m, pid3 = dm().engine.child.pid;
    console.log('     the page before the app: ' + st().title);
    app._onMenuChoice('web-exit'); await stand.sleep(300);
    await pick('apps'); await stand.sleep(600);
    await pick('app-demo');
    await until('the app', () => /app-demo$/.test(st().url) && !st().loading && st().live && T().n === 'app-demo', 15000);
    check('the app: its own first page, nothing behind it', st().back === false, [st().back, st().url]);
    await shot('app');
    app._onMenuChoice('web-exit'); await stand.sleep(300);
    await pick('apps-back'); await pick('browser');
    await until('Przeglądarka after the app: its own page', () => /druga$/.test(st().url) && st().live && T().n === 'druga', 12000);
    console.log('     the page after the app:  ' + st().title);
    check('as it was left (not loaded again), in the same engine', T().m === mark3 && dm().engine.child.pid === pid3, [T().m, mark3]);

    console.log('pictures: ' + stand.shots.length + ' in ' + path.join(dir, 'shots'));
    const NL = String.fromCharCode(10);
    if (fails) { try { console.log(fs.readFileSync(path.join(dir, 'browser', 'log', 'browserd.log'), 'utf8').split(NL).filter((l) => !/perf:|policy|cookies/.test(l)).map((l) => '   ' + l.slice(11, 260)).slice(-40).join(NL)); } catch (x) { /* no log */ } }
    console.log(fails ? 'native: ' + fails + ' FAILED' : 'native: ok');
    if (stand.daemon) { try { await stand.daemon.close(); } catch (e) { /* closing */ } }
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
