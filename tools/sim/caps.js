'use strict';
// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * tools/sim/caps.js <repo> <dir> [devtools]: what the engine in Przeglądarka can play and how fast it answers a
 * finger, on the stand (the real app, daemon and Chrome; a page of a server here that writes its findings into its
 * title, so it works without DevTools too):
 *   - formats: H.264, AAC, VP9, AV1, Opus, HEVC, with the rule "video": "light" (the default) and with "any";
 *   - protected films: is a key system there (Widevine, as Netflix, Disney+, Spotify's web player and Crunchyroll
 *     ask for it), and at which strength. Nothing is unlocked or gone around: the page only asks the engine;
 *   - a tap: the time from the finger to the first new picture of the page (g21-wlframe's own measure), 15 times;
 *   - an address: the time from the order to the loaded page, 6 times.
 * "devtools": the same with the engine driven the old way, for comparison. Run through tools/sim/run.sh.
 * The stand's CPU is not the car's: the times compare the two ways of driving, they are not the car's times.
 */
const http = require('http');
const repo = process.argv[2], dir = process.argv[3], how = process.argv.slice(4).join(' ');
const SCRIPT = [
    'var n=0;addEventListener("pointerdown",function(){n++;document.body.style.background=n%2?"#a42":"#2a4"});',
    'var F={h264:\'video/mp4; codecs="avc1.640028"\',aac:\'audio/mp4; codecs="mp4a.40.2"\',vp9:\'video/webm; codecs="vp09.00.10.08"\',av1:\'video/mp4; codecs="av01.0.05M.08"\',opus:\'audio/webm; codecs="opus"\',hevc:\'video/mp4; codecs="hvc1.1.6.L93.B0"\'};',
    'var R={fmt:{},drm:{}};Object.keys(F).forEach(function(k){try{R.fmt[k]=window.MediaSource&&MediaSource.isTypeSupported(F[k])?1:0}catch(e){R.fmt[k]=0}});',
    'function ks(name,sys,rob){var c=[{initDataTypes:["cenc"],videoCapabilities:[{contentType:\'video/mp4; codecs="avc1.42E01E"\',robustness:rob}],audioCapabilities:[{contentType:\'audio/mp4; codecs="mp4a.40.2"\'}]}];',
    'if(!navigator.requestMediaKeySystemAccess){R.drm[name]="noEME";return Promise.resolve()}',
    'return navigator.requestMediaKeySystemAccess(sys,c).then(function(a){R.drm[name]="yes";return a.createMediaKeys().then(function(){R.drm[name]="keys"},function(e){R.drm[name]="nokeys:"+e.name})},function(e){R.drm[name]="no:"+e.name.replace("Error","")})}',
    'function done(){var o=/drm/.test(location.pathname)?R.drm:R.fmt;document.title="caps "+Object.keys(o).map(function(k){return k+"="+o[k]}).join(" ")}',
    'ks("wv","com.widevine.alpha","").then(function(){return ks("wv_sw","com.widevine.alpha","SW_SECURE_DECODE")}).then(function(){return ks("wv_hw","com.widevine.alpha","HW_SECURE_ALL")})',
    '.then(function(){return ks("clearkey","org.w3.clearkey","")}).then(function(){return ks("playready","com.microsoft.playready","")}).then(done,done);'
].join('');
const PAGE = '<!doctype html><meta charset=utf-8><title>wait</title><body style="margin:0;height:100vh;background:#224"><script>' + SCRIPT + '</script>';

(async () => {
    const srv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(PAGE); });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const url = 'http://127.0.0.1:' + srv.address().port + '/';
    const stand = await require('./stand.js').start({ repo: repo, dir: dir, input: true, browser: true, idleMs: 90000, daemon: { control: /devtools/.test(how) ? 'devtools' : 'native' } });
    const app = stand.app, menu = stand.menu, st = () => app._web.state(), dm = () => stand.daemon;
    const names = () => menu.snapshot().items.map((i) => i.name);
    const caps = async (what) => {
        app._web.send({ op: 'nav', url: url + what });
        await stand.until('the page\'s findings', () => st().url === url + what && /^caps /.test(st().title) && !st().loading, 20000);
        return st().title.slice(5);
    };
    await stand.turn(0); await stand.sleep(300);
    await stand.turn(names().indexOf('browser') - menu.selected()); await stand.push();
    await stand.until('the engine', () => st().engine === 'ready' && st().live, 40000);
    console.log('engine: ' + (dm().engine.native ? 'without DevTools' : 'with DevTools') + ', ' + dm().engine.product);
    console.log('formats, rule "video": "light": ' + await caps('fmt-light'));
    console.log('protected films (wv = Widevine; _sw software decoding, _hw hardware): ' + await caps('drm'));
    const times = [];
    for (let i = 0; i < 15; i++) {
        dm().perf.tapMs = -1;
        app._web.send({ op: 'touch', p: 1, x: 300 + i * 20, y: 200 }); await stand.sleep(50); app._web.send({ op: 'touch', p: 3, x: 300 + i * 20, y: 200 });
        await stand.sleep(450);
        if (dm().perf.tapMs >= 0) times.push(dm().perf.tapMs);
    }
    times.sort((a, b) => a - b);
    console.log('a tap to the first new picture: ' + (times.length ? 'middle ' + times[Math.floor(times.length / 2)] + ' ms, fastest ' + times[0] + ', slowest ' + times[times.length - 1] + ' (' + times.length + ' of 15 measured)' : 'not measured'));
    const nav = [];
    for (let i = 0; i < 6; i++) { const t0 = Date.now(); await caps('n' + i); nav.push(Date.now() - t0); await stand.sleep(200); }
    nav.sort((a, b) => a - b);
    console.log('an address to the loaded page: middle ' + nav[3] + ' ms, fastest ' + nav[0] + ', slowest ' + nav[5]);
    app._web.send({ op: 'policy', key: 'video', value: 'any' });
    await stand.sleep(1500);
    await stand.until('the engine again', () => st().engine === 'ready' && st().live, 40000);
    console.log('formats, rule "video": "any":   ' + await caps('fmt-any'));
    if (stand.daemon) { try { await stand.daemon.close(); } catch (e) { /* closing */ } }
    process.exit(0);
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
