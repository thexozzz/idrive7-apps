'use strict';
// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * tools/sim/walk.js <repo> <dir> [menu|web|all]: THEiPlay driven on the stand as an owner would drive it (the knob,
 * a finger, the pad's cursor), with a picture of every view and state and a check of what must hold:
 *   menu   every page and panel; the knob reaches the head, the foot and the panel "Ekrany"; the way back finds its
 *          row; hover, pressed and focus are drawn; the keyboard
 *   web    with the real browser tool and a real Chrome: the settings as a layer over a page (the same page, place and
 *          engine afterwards, however long and however often), an app from Sklep beside Przeglądarka (each keeps its
 *          own page), "Zresetuj usługi" against stand-in services
 * Run through tools/sim/run.sh. Pictures: <dir>/shots.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const repo = process.argv[2], dir = process.argv[3], what = process.argv[4] || 'all';
let fails = 0, shotN = 0;
function check(text, ok, got) { if (!ok) fails += 1; console.log((ok ? 'ok   ' : 'FAIL ') + text + (ok ? '' : ': ' + JSON.stringify(got))); }

(async () => {
    const PAGE = (name) => '<!doctype html><meta charset=utf-8><title>' + name + '</title><body style="margin:0;font:22px sans-serif;background:' + (/app/.test(name) ? '#e8f4ec' : '#f6efe4') + '"><h1 style="margin:24px">' + name + '</h1>' +
        Array.from({ length: 60 }, (x, i) => '<p style="margin:10px 24px;padding:10px;background:rgba(0,0,0,.06)">' + name + ', wiersz ' + i + '</p>').join('');
    const srv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(PAGE(decodeURIComponent(q.url.replace(/^\//, '')) || 'start')); });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const url = 'http://127.0.0.1:' + srv.address().port + '/';
    const web = what !== 'menu';
    const fake = path.join(repo, 'tools', 'test_services.js');
    const worldFile = path.join(dir, 'world.json');
    const stand = await require('./stand.js').start({ repo: repo, dir: dir, input: true, browser: web, idleMs: 6000,
        apps: { demo: { name: 'Demo', url: url + 'app-demo' } },
        daemon: { systemctl: [process.execPath, fake, '--fake-systemctl'], systemctlEnv: { FAKE_WORLD: worldFile }, serviceSettleMs: 100, selfRestartMs: 8000 } });
    const app = stand.app, menu = stand.menu;
    const shot = async (name) => { shotN += 1; return stand.shot(String(shotN).padStart(2, '0') + '-' + name); };
    const names = () => menu.snapshot().items.map((i) => i.name);
    // the knob to a row of the list and a press on it
    const pick = async (name) => {
        const at = names().indexOf(name);
        if (at < 0) throw new Error('no row "' + name + '" on ' + menu.screen() + ': ' + names().join(','));
        if (menu.focus().zone !== 'list') await stand.tilt(menu.focus().zone === 'head' ? 's' : 'n');
        await stand.turn(at - menu.selected());
        if (menu.selectedName() !== name) throw new Error('the knob is on ' + menu.selectedName() + ', not on ' + name);
        await stand.push();
        await stand.sleep(150);
    };
    await stand.turn(0); await stand.push; await stand.sleep(300);
    // the pad's cursor over the menu's pages (Ustawienia > Sterowanie: Mysz z gładzika, Kursor w menu)
    app._mouseOn = true; app._desk.setMouse(true); app._desk.setMenuMouse(true); app._syncMouse('the stand');
    await stand.until('the pad', () => !!stand.pad, 5000);
    const cursorTo = async (x, y) => {
        for (let i = 0; i < 80; i++) {
            const dx = x - app._menuX, dy = y - app._menuY;
            if (Math.abs(dx) < 3 && Math.abs(dy) < 3) break;
            stand.padMove(Math.max(-12, Math.min(12, dx / 3)), Math.max(-12, Math.min(12, dy / 3)));
            await stand.sleep(18);
        }
        await stand.sleep(120);
    };
    const cursorAway = () => cursorTo(1500, 640);

    if (what !== 'web') {
        // ============================================================ the home screen
        await cursorAway();
        check('home: five modules', names().join() === 'youtube,airplay,browser,apps,system', names());
        await shot('home');
        await stand.turn(2);
        await shot('home-focus');
        await cursorTo(104 + 500, 400);
        await shot('home-hover');
        stand.touch(1, 104 + 500, 400); await stand.sleep(150);
        await shot('home-pressed');
        stand.touch(2, 104 + 500, 700); stand.touch(3, 104 + 900, 715); await stand.sleep(150);     // (slid off: nothing is chosen)
        check('a finger that slides off chooses nothing', menu.screen() === 'root', menu.screen());
        await cursorAway();
        // the knob: up to the head ("Ekrany"), a press opens the panel; no module plays: its screens cannot be chosen
        await stand.tilt('n');
        check('the knob reaches "Ekrany" in the head', menu.focus().zone === 'head' && menu.focus().name === 'base-where', menu.focus());
        await shot('home-knob-on-ekrany');
        await stand.push();
        check('a press opens the panel; without a module only "Opcje" and the way out', menu.focus().where === 'base' && menu.focus().cursor === 4, menu.focus());
        await shot('ekrany-no-module');
        await stand.turn(1); await stand.turn(1);
        check('the knob stays on the two buttons', menu.focus().cursor === 4, menu.focus());
        await stand.turn(-1);
        await stand.push();
        check('the way out closes the panel; the knob is on "Ekrany" again', menu.focus().where === '' && menu.focus().name === 'base-where', menu.focus());
        await stand.push(); await stand.push();
        check('"Opcje" leads to the screens\' settings', menu.screen() === 'set-display', menu.screen());
        await shot('ekrany-opcje-settings');
        await pick('sgd-back');
        check('their way back leads to where "Ekrany" was used', menu.screen() === 'root', menu.screen());
        await stand.tilt('s');
        check('down from the tiles: the foot', menu.focus().zone === 'foot' && menu.focus().name === '@mouse', menu.focus());
        await shot('home-knob-on-foot');
        await stand.turn(1);
        check('a turn goes along the foot', menu.focus().name === '@exit', menu.focus());
        await stand.tilt('n');
        check('and up again is the list', menu.focus().zone === 'list', menu.focus());

        // ============================================================ Ustawienia and its groups
        await pick('system');
        check('Ustawienia: six groups and the way back', names().join() === 'sg-display,sg-input,sg-browser,sg-apps,sg-advanced,sg-general,system-back', names());
        await shot('settings');
        await stand.tilt('s');
        check('a tilt down in a grid: the tile below', menu.selectedName() === 'sg-general', menu.selectedName());
        await stand.tilt('n'); await stand.tilt('n');
        check('a tilt up from the first row: the head', menu.focus().zone === 'head', menu.focus());
        await stand.turn(-1);
        check('the head has the way back and "Ekrany"', menu.focus().name === '@back', menu.focus());
        await shot('settings-knob-on-back');
        await stand.tilt('s');
        for (const g of [['sg-display', 'set-display', 'sgd-back'], ['sg-input', 'set-input', 'sgi-back'], ['sg-browser', 'apps-settings', 'aset-back'], ['sg-apps', 'set-apps', 'sga-back'], ['sg-advanced', 'set-advanced', 'sgx-back'], ['sg-general', 'set-general', 'sgg-back']]) {
            await pick(g[0]);
            check(g[0] + ' opens ' + g[1], menu.screen() === g[1], menu.screen());
            await stand.sleep(250);
            await shot('settings-' + g[1]);
            if (g[1] === 'set-input') {
                await cursorTo(104 + 200, 88 + 150);
                await shot('settings-hover-tile');
                await cursorAway();
            }
            await pick(g[2]);
            check('back from ' + g[1] + ': the knob is on its tile again', menu.screen() === 'system' && menu.selectedName() === g[0], [menu.screen(), menu.selectedName()]);
        }
        // every option that was in the menu before is in it now
        const every = {};
        ['set-display', 'set-input', 'apps-settings', 'set-apps', 'set-advanced', 'set-general'].forEach((s) => { require(path.join(repo, 'apps/g21_airplay/src/menu_draw.js')).SCREENS[s].forEach((i) => { every[i.name] = s; }); });
        const before = ['position', 'air-quality', 'cluster-place', 'air-delay', 'set-render', 'set-mouse', 'set-mouse-speed', 'set-menu-mouse', 'set-kill', 'aset-home', 'aset-zoom', 'aset-picture', 'aset-fs', 'aset-autoplay', 'aset-video', 'aset-engine', 'aset-frames', 'aset-mobile',
            'aset-sandbox', 'aset-memory', 'aset-pages', 'aset-screens', 'aset-car', 'aset-diag', 'label-toggle', 'lang-toggle', 'sys-info', 'svc-restart'];
        check('no option of 0.2.0 is missing', before.every((n) => every[n]), before.filter((n) => !every[n]));
        // sub-pages
        await pick('sg-display');
        await pick('position'); await stand.sleep(250); await shot('position');
        check('Pozycja', /^pos-/.test(menu.screen()), menu.screen());
        await pick(names().filter((n) => /back$/.test(n))[0]);
        await pick('air-quality'); await stand.sleep(200); await shot('resolution');
        await pick(names().filter((n) => /back$/.test(n))[0]);
        await pick('label-toggle'); await stand.sleep(200); await shot('caption');
        check('Napis is a page of Ekrany i obraz', menu.screen() === 'label', menu.screen());
        await pick('label-back');
        check('and its way back leads there', menu.screen() === 'set-display' && menu.selectedName() === 'label-toggle', [menu.screen(), menu.selectedName()]);
        await pick('sgd-back');
        await pick('sg-general'); await pick('sys-info'); await stand.sleep(200); await shot('about-system');
        await pick('si-back'); await pick('sgg-back'); await pick('system-back');
        check('home again, the knob on Ustawienia', menu.screen() === 'root' && menu.selectedName() === 'system', [menu.screen(), menu.selectedName()]);

        // ============================================================ AirPlay: its page, its panel, the keyboard
        await pick('airplay'); await stand.sleep(300);
        await shot('airplay');
        await stand.tilt('n');
        check('AirPlay: the knob on "Ekrany"', menu.focus().name === 'air-where', menu.focus());
        await stand.push();
        await shot('airplay-ekrany');
        await stand.turn(1);
        await shot('airplay-ekrany-knob-hud');
        await cursorTo(104 + 898, 88 + 316);
        await shot('airplay-ekrany-hover');
        await cursorAway();
        await stand.tilt('s'); await stand.push();
        check('the panel closes; the knob is on "Ekrany"', menu.focus().where === '' && menu.focus().name === 'air-where', menu.focus());
        await stand.tilt('s');
        await pick('air-name'); await stand.sleep(250);
        check('the keyboard', menu.editing() === true, menu.editing());
        await shot('keyboard');
        await stand.turn(3); await shot('keyboard-knob');
        await cursorTo(104 + 900, 88 + 350); await shot('keyboard-hover');
        stand.touch(1, 104 + 900, 88 + 350); await stand.sleep(120); await shot('keyboard-pressed'); stand.touch(3, 104 + 20, 88 + 600); await stand.sleep(120);
        await cursorAway();
        menu.cancelEdit(); await stand.sleep(200);
        await pick('air-back');
        // ============================================================ Aplikacje, Sklep, YouTube without its service
        await pick('apps'); await stand.sleep(300); await shot('apps');
        await pick('apps-store'); await stand.sleep(300); await shot('store');
        await pick('store-back'); await pick('apps-back');
        check('home', menu.screen() === 'root', menu.screen());
    }

    if (web) {
        // ============================================================ Przeglądarka: a real page
        const dm = () => stand.daemon;
        const st = () => app._web.state();
        const page = async (x) => (await dm().engine.cdp.send('Runtime.evaluate', { expression: x, returnByValue: true }, dm().engine.session)).result.value;
        if (menu.screen() !== 'root') throw new Error('not at home');
        await pick('browser');
        await stand.until('the engine', () => st().engine === 'ready' && st().live, 40000);
        app._web.send({ op: 'nav', url: url + 'pierwsza' });
        await stand.until('first page', () => /pierwsza$/.test(st().url) && !st().loading, 10000);
        app._web.send({ op: 'nav', url: url + 'druga' });
        await stand.until('second page', () => /druga$/.test(st().url) && !st().loading && st().back, 10000);
        await page('window.mark = "strona"; scrollTo(0, 640); 1');
        await stand.sleep(600);
        await cursorTo(1200, 500);
        await shot('browser-page');
        const pid = dm().engine.child.pid;
        // the knob: a press goes to the bar, a turn along it
        app._mouseOn = false; app._syncMouse('the stand: the knob alone');
        await stand.sleep(200);
        await stand.push();
        check('browser: a press puts the knob on the address', menu.focus().name === 'web-url', menu.focus());
        await shot('browser-knob-on-address');
        await stand.turn(1);
        check('browser: next to it is "Ekrany"', menu.focus().name === 'web-where', menu.focus());
        await shot('browser-knob-on-ekrany');
        await stand.push();
        check('browser: the panel opens over the page', menu.focus().where === 'web', menu.focus());
        await shot('browser-ekrany');
        // ---- "Opcje": the settings are a layer over the page
        const roundTrip = async (n, change) => {
            if (menu.focus().where !== 'web') { await stand.push(); if (menu.focus().name !== 'web-where') { await stand.turn(1); } if (menu.focus().where !== 'web') await stand.push(); }
            await stand.turn(-1);      // from the first tile back to "Opcje"
            if (menu.focus().cursor !== 4) throw new Error('the knob is not on Opcje: ' + JSON.stringify(menu.focus()));
            await stand.push(); await stand.sleep(200);
            if (menu.screen() !== 'set-display' || !app._webHeld) throw new Error('no settings layer: ' + menu.screen() + ' held ' + app._webHeld);
            if (n === 0) await shot('settings-over-page');
            if (change) await change();
            const t0 = Date.now();
            await pick('sgd-back');
            await stand.until('the page again', () => !app._webHeld && menu.snapshot().note !== '' , 3000);
            return Date.now() - t0;
        };
        let ms = await roundTrip(0, async () => { await pick('cluster-place'); await stand.sleep(150); await pick('cluster-place'); });
        check('settings over the page: the same engine', dm().engine && dm().engine.child.pid === pid, null);
        check('the same page, not loaded again, where it was', (await page('window.mark + "/" + Math.round(scrollY) + location.pathname')) === 'strona/640/druga', await page('window.mark + "/" + Math.round(scrollY) + location.pathname'));
        check('its way back is still there', st().back === true && /druga$/.test(st().url), st());
        check('the page is on the screen again', stand.videoFile !== '' && !!stand.lastVideoRect, [stand.videoFile, stand.lastVideoRect]);
        await shot('browser-after-settings');
        // longer than the engine lives without the app (6 s here), in the settings: nothing stops
        await roundTrip(1, async () => { await stand.sleep(9000); });
        check('9 s in the settings (the engine\'s idle time is 6 s here): still the same engine and page', dm().engine && dm().engine.child.pid === pid && (await page('window.mark + "/" + Math.round(scrollY)')) === 'strona/640', dm().engine ? await page('window.mark + "/" + Math.round(scrollY)') : 'no engine');
        const times = [];
        for (let i = 2; i < 12; i++) times.push(await roundTrip(i));
        check('ten more times in and out: the same engine, the same page', dm().engine.child.pid === pid && (await page('window.mark + "/" + Math.round(scrollY)')) === 'strona/640', null);
        console.log('     back from the settings to the page: ' + Math.min.apply(null, times) + '-' + Math.max.apply(null, times) + ' ms (with the knob\'s own steps)');
        check('one page target in the engine', (await dm().engine.cdp.send('Target.getTargets', {})).targetInfos.filter((t) => t.type === 'page').length === 1, null);
        // ---- leaving the settings to somewhere else is the real end of the page's view
        await stand.push(); await stand.turn(1); await stand.push(); await stand.turn(-1); await stand.push(); await stand.sleep(200);
        check('settings over the page once more', app._webHeld === true && menu.screen() === 'set-display', [app._webHeld, menu.screen()]);
        app._onMenuChoice('sgd-back-other');       // (nothing: not a choice)
        menu.setScreen('root'); app._onMenuChoice('noop');
        check('the menu went home: the page\'s view is closed', app._webHeld === false && app._webOn === false, [app._webHeld, app._webOn]);
        await stand.sleep(8500);
        check('and its engine stops after its idle time, as before', !dm().engine && dm().engineProcs().length === 0, dm().engineProcs());

        // ============================================================ an app from Sklep beside Przeglądarka
        await pick('browser');
        await stand.until('the engine again', () => st().engine === 'ready' && st().live, 40000);
        app._web.send({ op: 'nav', url: url + 'moja-strona' });
        await stand.until('my page', () => /moja-strona$/.test(st().url) && !st().loading, 10000);
        await page('window.mark = "moja"; scrollTo(0, 420); 1'); await stand.sleep(400);
        const pid2 = dm().engine.child.pid;
        app._onMenuChoice('web-exit'); await stand.sleep(300);
        await pick('apps'); await stand.sleep(600);
        check('Aplikacje lists the app of the stand', names().indexOf('app-demo') >= 0, names());
        await shot('apps-with-app');
        await pick('app-demo');
        await stand.until('the app', () => /app-demo$/.test(st().url) && !st().loading && st().live, 15000);
        await stand.sleep(700);
        check('the app: its own first page, nothing behind it', st().back === false && (await page('String(window.mark)')) === 'undefined', [st().back, st().url]);
        await shot('app-running');
        await stand.push();
        await shot('app-knob-on-bar');
        check('the app: the knob reaches its bar', menu.focus().name !== '', menu.focus());
        await stand.tilt('n');
        app._onMenuChoice('web-exit'); await stand.sleep(300);
        check('out of the app: Aplikacje', menu.screen() === 'apps', menu.screen());
        await pick('apps-back'); await pick('browser');
        try { await stand.until('the browser\'s own page', () => /moja-strona$/.test(st().url) && st().live, 10000); } catch (e) { check('Przeglądarka after the app shows its own page', false, st()); }
        await stand.sleep(500);
        check('Przeglądarka after the app: its own page, as it was left', dm().engine.child.pid === pid2 && (await page('window.mark + "/" + Math.round(scrollY)')) === 'moja/420', await page('window.mark + "/" + Math.round(scrollY)'));
        await shot('browser-after-app');
        app._onMenuChoice('web-exit'); await stand.sleep(300);

        // ============================================================ "Zresetuj usługi" against stand-in services
        const world = {};
        ['g21-audio.service', 'g21-input.service', 'g21-airplay-open.service', 'jap-ridetube-d.service', 'g21-browser.service'].forEach((u) => { world[u] = { state: 'active', does: 'ok' }; });
        fs.writeFileSync(worldFile, JSON.stringify(world));
        // (systemd's part of the stand: when this tool's restart is asked, the daemon is ended and started anew)
        const watch = setInterval(async () => {
            let c = '';
            try { c = fs.readFileSync(worldFile + '.calls', 'utf8'); } catch (e) { return; }
            if (/--no-block restart g21-browser\.service/.test(c) && !watch.done) { watch.done = true; const old = stand.daemon; clearTimeout(old.selfTimer); await stand.sleep(400); await old.close(); await stand.sleep(600); await stand.makeDaemon(); }
        }, 100);
        await pick('system'); await pick('sg-general');
        await pick('svc-restart'); await stand.sleep(200);
        const hint = () => (menu.snapshot().items.filter((i) => i.name === 'svc-restart')[0] || {}).hint;
        check('the first choice asks', hint() === 'wybierz jeszcze raz, aby potwierdzić', hint());
        await shot('services-confirm');
        await stand.push(); await stand.sleep(250);
        check('the second starts it and says so', app._svcBusy === true && /uruchamia/.test(hint()), hint());
        await shot('services-running');
        await stand.push(); await stand.sleep(100);
        const calls = () => { try { return fs.readFileSync(worldFile + '.calls', 'utf8').split('\n').filter((l) => /^restart /.test(l)); } catch (e) { return []; } };
        await stand.until('the services', () => app._svcBusy === false, 30000);
        clearInterval(watch);
        check('each service restarted once, a third choice meanwhile did nothing', calls().length === 4, calls());
        check('success is said only after this tool is back and the app connected to it again', hint() === 'usługi działają' && st().connected === true, [hint(), st().connected]);
        await shot('services-done');
        await pick('sgg-back'); await pick('system-back');
    }
    console.log('pictures: ' + stand.shots.length + ' in ' + path.join(dir, 'shots'));
    console.log(fails ? 'walk: ' + fails + ' FAILED' : 'walk: ok');
    if (fails) daemonLog();
    if (stand.daemon) { try { await stand.daemon.close(); } catch (e) { /* closing */ } }
    process.exit(fails ? 1 : 0);
})().catch((e) => {
    console.error('walk failed: ' + e.stack);
    daemonLog();
    process.exit(1);
});
// what the browser tool's daemon wrote about its engine and tabs
function daemonLog() {
    const NL = String.fromCharCode(10);
    try {
        console.log(fs.readFileSync(path.join(dir, 'browser', 'log', 'browserd.log'), 'utf8').split(NL).filter((l) => /tabs|history|engine up|engine exited|engine stopped|fault|services/.test(l)).map((l) => l.slice(11, 230)).join(NL));
    } catch (x) { /* no log */ }
}
