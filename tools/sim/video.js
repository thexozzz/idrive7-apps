'use strict';
// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * tools/sim/video.js <repo> <dir> [url]: a film in Przeglądarka on the stand (the real app, the real browser tool, a
 * real Chrome; needs the internet for the default page, a YouTube film). What an owner does with it:
 *   1. the film plays                         2. the app goes away for a while and comes back ("minimised")
 *   3. the player's full screen, and back     4. away and back again while in full screen
 * After each step: the same engine process, the same page (not loaded again), the film's time goes on, the player
 * shows no error. Pictures in <dir>/shots; the daemon's log lines about sizes, full screen and the engine at the end.
 * Run through tools/sim/run.sh. Not the car: no BMW sound path, no car CPU.
 */
const fs = require('fs');
const path = require('path');
const repo = process.argv[2], dir = process.argv[3], film = process.argv[4] || 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';
let fails = 0, shotN = 0;
function check(text, ok, got) { if (!ok) fails += 1; console.log((ok ? 'ok   ' : 'FAIL ') + text + (ok ? '' : ': ' + JSON.stringify(got))); }

(async () => {
    const stand = await require('./stand.js').start({ repo: repo, dir: dir, input: true, browser: true, idleMs: 90000 });
    const app = stand.app, menu = stand.menu;
    const dm = () => stand.daemon;
    const st = () => app._web.state();
    const shot = async (name) => { shotN += 1; return stand.shot('v' + String(shotN).padStart(2, '0') + '-' + name); };
    const page = async (x, gesture) => { const r = await dm().engine.cdp.send('Runtime.evaluate', { expression: x, returnByValue: true, userGesture: !!gesture, awaitPromise: true }, dm().engine.session); return r.result ? r.result.value : undefined; };
    const names = () => menu.snapshot().items.map((i) => i.name);
    const pick = async (name) => { const at = names().indexOf(name); if (at < 0) throw new Error('no row ' + name); await stand.turn(at - menu.selected()); await stand.push(); await stand.sleep(150); };
    // what the film does: its time, whether it runs, the player's error
    const VID = '(function(){var v=document.querySelector("video");var e=document.querySelector(".ytp-error,.ytp-error-content,.player-error-message-container,ytm-player-error-message-renderer");' +
        'return JSON.stringify({t:v?Math.round(v.currentTime*10)/10:-1,paused:v?v.paused:null,rs:v?v.readyState:-1,err:v&&v.error?v.error.code+" "+v.error.message:"",shown:e&&e.offsetParent!==null?String(e.innerText||"").slice(0,80):"",' +
        'w:innerWidth,h:innerHeight,vw:v?v.videoWidth:0,vh:v?v.videoHeight:0,box:v?[Math.round(v.getBoundingClientRect().width),Math.round(v.getBoundingClientRect().height)]:[],fs:!!document.fullscreenElement,mark:window.__mark||"",dpr:devicePixelRatio,host:location.host})})()';
    const vid = async () => { try { return JSON.parse(await page(VID)); } catch (e) { return { t: -1, fail: e.message }; } };
    const plays = async (what, secs) => {
        const a = await vid();
        await stand.sleep((secs || 4) * 1000);
        const b = await vid();
        check(what + ': the film goes on (' + a.t + ' s -> ' + b.t + ' s), no error', b.t > a.t + 1 && !b.err && !b.shown && b.mark === 'm', { before: a, after: b });
        return b;
    };

    await stand.turn(0); await stand.sleep(300);
    await pick('browser');
    await stand.until('the engine', () => st().engine === 'ready' && st().live, 40000);
    // (the fifth word: "desktop" = Ustawienia > Przeglądarka > Wersja mobilna off; "zoom=0.75")
    const how = process.argv.slice(5).join(' ');
    if (/anyvideo/.test(how)) { app._web.send({ op: 'policy', key: 'video', value: 'any' }); await stand.sleep(1500); await stand.until('the engine again', () => st().engine === 'ready' && st().live, 40000); }
    if (/desktop/.test(how)) { app._web.send({ op: 'policy', key: 'mobile', value: 'off' }); await stand.sleep(1500); await stand.until('the engine again', () => st().engine === 'ready' && st().live, 40000); }
    if (/zoom=([0-9.]+)/.test(how)) { app._web.send({ op: 'zoom', z: Number(/zoom=([0-9.]+)/.exec(how)[1]) }); await stand.sleep(1500); await stand.until('the engine again', () => st().engine === 'ready' && st().live, 40000); }
    const pid = dm().engine.child.pid;
    // ("trace": what the engine says about the network, the player and the page while the film runs)
    const trace = [];
    if (/trace/.test(how)) {
        const real = dm().onEvent, t0 = Date.now(), urls = {};
        dm().onEvent = function (e, m) {
            const p = m.params || {}, at = ((Date.now() - t0) / 1000).toFixed(1) + ' ';
            if (m.method === 'Network.requestWillBeSent') urls[p.requestId] = String(p.request.url).slice(0, 90);
            else if (m.method === 'Network.loadingFailed') trace.push(at + 'net failed ' + p.errorText + (p.canceled ? ' (canceled)' : '') + ' ' + (urls[p.requestId] || ''));
            else if (m.method === 'Network.responseReceived' && p.response.status >= 400) trace.push(at + 'net ' + p.response.status + ' ' + String(p.response.url).slice(0, 110));
            else if (/^Media.player(Errors|Messages|Events)/.test(m.method)) { const s = JSON.stringify(p.errors || p.messages || p.events).slice(0, 300); if (!/kBufferingStateChanged|"info"|"debug"/.test(s) || /rror/.test(s)) trace.push(at + m.method.slice(6) + ' ' + s); }
            else if (m.method === 'Log.entryAdded' || m.method === 'Runtime.consoleAPICalled' || m.method === 'Runtime.exceptionThrown') trace.push(at + m.method + ' ' + JSON.stringify(p.entry || p.args || p.exceptionDetails).slice(0, 260));
            else if (/crash|detached|Inspector/i.test(m.method)) trace.push(at + m.method + ' ' + JSON.stringify(p).slice(0, 200));
            return real.apply(this, arguments);
        };
        await dm().engine.cdp.send('Network.enable', {}, dm().engine.session);
    }
    app._web.send({ op: 'nav', url: film });
    await stand.until('the film\'s page', () => /youtube|127\.0\.0\.1/.test(st().url) && !st().loading, 30000);
    await stand.sleep(3000);
    // (a consent page, when there is one: accepted as an owner would)
    await page('(function(){var b=[].slice.call(document.querySelectorAll("button,a")).filter(function(x){return /accept all|zaakceptuj wszystko|akceptuj wszystko|reject all|odrzuć wszystko/i.test(x.innerText||x.getAttribute("aria-label")||"")})[0];if(b){b.click();return 1}return 0})()', true);
    await stand.sleep(4000);
    await page('window.__mark="m";var v=document.querySelector("video");if(v){v.muted=false;v.play&&v.play().catch(function(){})};1', true);
    await stand.sleep(1500);
    await page('var b=document.querySelector(".ytp-large-play-button,.ytp-play-button,.ytmCuedOverlayPlayButton,.player-controls-play-pause-button,ytm-player-cued-overlay button");var v=document.querySelector("video");if(v&&v.paused&&b)b.click();1', true);
    await stand.sleep(5000);
    // (YouTube's player says why it gives up: kept for the end)
    await page('(function(){var p=document.querySelector("#movie_player");window.__why=[];if(!p||!p.addEventListener)return 0;["onError","onDetailedError"].forEach(function(n){p.addEventListener(n,function(e){try{window.__why.push(n+" "+JSON.stringify(e).slice(0,400))}catch(x){window.__why.push(n+" "+String(e))}})});return 1})()');
    let v = await vid();
    console.log('page: ' + st().url + '  window ' + v.w + 'x' + v.h + ' css, dpr ' + v.dpr + ', the film ' + v.vw + 'x' + v.vh + ' in a box of ' + v.box.join('x') + ', picture ' + st().w + 'x' + st().h + ', zoom ' + st().zoom);
    await shot('film');
    await plays('1. the film');

    // ("long": nothing is done, the film just plays for three minutes; "fslong": the same in full screen)
    if (/long/.test(how)) {
        if (/fslong/.test(how)) { await page('(function(){var b=document.querySelector(".ytp-fullscreen-button,.fullscreen-icon,button[aria-label*=ull]");if(b){b.click();return 1}var v=document.querySelector("video");if(v)(v.parentElement||v).requestFullscreen();return 2})()', true); await stand.sleep(3000); console.log('     full screen: ' + JSON.stringify(st().fs)); }
        let died = '';
        for (let i = 1; i <= 18 && !died; i++) { await stand.sleep(10000); const s = await vid(); if (s.shown || (s.t === 0 && s.rs === 0)) died = 'after ' + (i * 10) + ' s: ' + (s.shown || 'the film is gone').split(String.fromCharCode(10))[0]; else if (i % 6 === 0) console.log('     ' + (i * 10) + ' s: film at ' + s.t + ' s'); }
        check('the film plays for three minutes' + (/fslong/.test(how) ? ' in full screen' : ''), !died, died);
        try { console.log('the player: ' + await page('JSON.stringify(window.__why||[])')); } catch (x) { /* gone */ }
        console.log(fails ? 'video: ' + fails + ' FAILED' : 'video: ok');
        if (stand.daemon) { try { await stand.daemon.close(); } catch (e) { /* closing */ } }
        process.exit(fails ? 1 : 0);
    }
    // ---- 2. minimised and back
    app._setVisible(false);
    await stand.sleep(6000);
    const away = await vid();
    app._setVisible(true);
    await stand.sleep(2500);
    check('2. back from being away: the same engine, the page on the screen', dm().engine && dm().engine.child.pid === pid && st().live && app._webOn, [dm().engine && dm().engine.child.pid, pid, st().live, st().engine, app._webOn, menu.screen()]);
    console.log('     while away the film was at ' + away.t + ' s' + (away.paused ? ' (paused)' : ''));
    await plays('2. after being away');
    await shot('after-away');

    // ---- 3. the player's full screen and back
    await page('(function(){var b=document.querySelector(".ytp-fullscreen-button,.fullscreen-icon,button[aria-label*=ull]");if(b){b.click();return "button"}var v=document.querySelector("video");if(v){(v.parentElement||v).requestFullscreen();return "element"}return "none"})()', true);
    try { await stand.until('full screen', () => !!st().fs, 8000); } catch (e) { /* said below */ }
    await stand.sleep(1500);
    check('3. full screen: the whole screen, the same engine', !!st().fs && dm().engine.child.pid === pid, [st().fs, st().w, st().h]);
    v = await plays('3. in full screen');
    console.log('     window ' + v.w + 'x' + v.h + ' css, the film in a box of ' + v.box.join('x') + ', picture ' + st().w + 'x' + st().h);
    await shot('full-screen');

    // ---- 4. away and back in full screen
    // ("nohide": the same wait without going away, to tell full screen itself from being away in it)
    const hide = !/nohide/.test(how);
    if (hide) app._setVisible(false);
    for (let i = 0; i < 12; i++) { await stand.sleep(1000); const s = await vid(); if (s.shown || s.t === 0 || i === 11) { console.log('     ' + (i + 1) + ' s ' + (hide ? 'away' : 'on') + ' in full screen: film at ' + s.t + ' s' + (s.shown ? ', the player says: ' + s.shown.split(String.fromCharCode(10))[0] : '')); if (s.shown) break; } }
    if (hide) app._setVisible(true);
    await stand.sleep(2500);
    check('4. back from being away in full screen: the same engine, live', dm().engine && dm().engine.child.pid === pid && st().live, [st().live, st().engine, st().fs]);
    await plays('4. after being away in full screen');
    await shot('full-screen-after-away');

    await page('document.exitFullscreen&&document.exitFullscreen();1', true);
    try { await stand.until('the page area again', () => !st().fs, 8000); } catch (e) { /* said below */ }
    await stand.sleep(1500);
    check('5. full screen left: the page area again', !st().fs && dm().engine.child.pid === pid, [st().fs, st().w, st().h]);
    await plays('5. after full screen');
    await shot('after-full-screen');

    const NL = String.fromCharCode(10);
    try { const why = await page('JSON.stringify((window.__why||[]).concat([(function(){var p=document.querySelector("#movie_player");try{return "quality "+JSON.stringify(p.getPlaybackQuality&&p.getPlaybackQuality())+" stats "+JSON.stringify(p.getStatsForNerds&&p.getStatsForNerds()).slice(0,700)}catch(e){return String(e)}})()]))'); console.log('the player: ' + why); } catch (x) { console.log('the player: ' + x.message); }
    if (trace.length) console.log('trace (seconds since the film was opened):' + NL + trace.slice(-70).map((l) => '   ' + l).join(NL));
    try {
        console.log(fs.readFileSync(path.join(dir, 'browser', 'log', 'browserd.log'), 'utf8').split(NL).filter((l) => /full screen|engine up|engine exited|engine stopped|fault|new size|page crashed|player (gave|error|decoder|size)|tabs|direct frames|sound/.test(l)).map((l) => '   ' + l.slice(11, 240)).slice(-60).join(NL));
    } catch (x) { /* no log */ }
    console.log(fails ? 'video: ' + fails + ' FAILED' : 'video: ok');
    if (stand.daemon) { try { await stand.daemon.close(); } catch (e) { /* closing */ } }
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
