'use strict';

/*
 * Picture quality: two profiles. The centre screen (mgu-render) and the
 * cluster + HUD (cluster-render) keep their own size, saved apart; older
 * settings keep the centre at 600x400 and give the KOMBI 400x240. KOMBI
 * frames are cut from the one decoded frame to the KOMBI size with the
 * aspect kept, whatever the window size, and are legal cluster-render video
 * (PROTOCOL.md: width a multiple of 4, height even, up to 1920x720).
 */

var assert = require('assert');
var path = require('path');
var src = path.join(__dirname, '..', 'apps', 'g21_airplay', 'src');
var desk = require(path.join(src, 'desktop_settings.js'));
var fit = require(path.join(src, 'frame_fit.js'));
var menu = require(path.join(src, 'menu_draw.js'));

// Defaults and lists.
assert.deepStrictEqual(desk.QUALITY_KOMBI, ['240x144', '240x180', '320x192', '400x240', '480x288', '600x360']);
assert.strictEqual(desk.QUALITY_DEFAULT.central, '600x400');
assert.strictEqual(desk.QUALITY_DEFAULT.kombi, '400x240');
assert.ok(desk.QUALITY_CENTRAL.indexOf('600x400') !== -1);

var fresh = desk.createDesktopSettings({});
assert.strictEqual(fresh.qualityCentral(), '600x400');
assert.strictEqual(fresh.qualityKombi(), '400x240');

// Migration: settings from 0.1.121 and older (airQuality was not read any more).
['720', '1080', undefined].forEach(function (old) {
    var migrated = desk.createDesktopSettings({ airQuality: old, airplayName: 'THEiPlay' });
    assert.strictEqual(migrated.qualityCentral(), '600x400', 'centre keeps 600x400 from airQuality ' + old);
    assert.strictEqual(migrated.qualityKombi(), '400x240', 'KOMBI gets its default');
    assert.strictEqual(migrated.snapshot().airQuality, old === '1080' ? '1080' : '720', 'old field kept');
});

// Save, read back, profiles independent.
var s = desk.createDesktopSettings({});
assert.ok(s.setQuality('kombi', '240x144').ok);
assert.strictEqual(s.qualityCentral(), '600x400', 'KOMBI change leaves the centre');
var saved = JSON.parse(JSON.stringify(s.snapshot()));
assert.strictEqual(saved.qualityKombi, '240x144');
assert.strictEqual(saved.qualityCentral, '600x400');
var reloaded = desk.createDesktopSettings(saved);
assert.strictEqual(reloaded.qualityKombi(), '240x144');
assert.strictEqual(reloaded.qualityCentral(), '600x400');
assert.ok(reloaded.setQuality('central', '600x400').ok);
assert.strictEqual(reloaded.qualityKombi(), '240x144', 'centre change leaves the KOMBI');

// Bad values are refused and never stored.
assert.strictEqual(s.setQuality('kombi', '1920x720').ok, false);
assert.strictEqual(s.setQuality('central', '400x240').ok, false);
assert.strictEqual(s.setQuality('hud', '400x240').ok, false);
assert.strictEqual(desk.createDesktopSettings({ qualityKombi: '9999x9', qualityCentral: 'x' }).qualityKombi(), '400x240');
assert.strictEqual(desk.createDesktopSettings({ qualityKombi: '9999x9', qualityCentral: 'x' }).qualityCentral(), '600x400');
assert.deepStrictEqual(desk.qualitySize('400x240'), { w: 400, h: 240 });

// YouTube screens are a setting: saved, read back, default centre only.
assert.deepStrictEqual(desk.createDesktopSettings({}).ytScreens(), { central: true, cluster: false, hud: false });
var yt = desk.createDesktopSettings({});
yt.setYtScreens({ central: false, cluster: true, hud: true });
var ytBack = desk.createDesktopSettings(JSON.parse(JSON.stringify(yt.snapshot())));
assert.deepStrictEqual(ytBack.ytScreens(), { central: false, cluster: true, hud: true }, 'YouTube screens survive a restart');

// KOMBI frame sizes: aspect kept, legal, never the centre size, never enlarged.
function legal(d, label) {
    assert.ok(d.w % 4 === 0 && d.h % 2 === 0, label + ' legal ' + d.w + 'x' + d.h);
    assert.ok(d.w <= 1920 && d.h <= 720, label + ' within 1920x720');
}
var cases = [
    [600, 400], [600, 276], [400, 600], [276, 600], [1280, 720], [1920, 1080], [640, 360], [184, 400], [1920, 720]
];
desk.QUALITY_KOMBI.forEach(function (q) {
    var p = desk.qualitySize(q);
    cases.forEach(function (c) {
        var d = fit.profileDims(c[0], c[1], p.w, p.h);
        var portrait = c[1] > c[0];
        legal(d, q + ' ' + c.join('x'));
        assert.ok(d.w <= Math.max(64, portrait ? p.h : p.w) && d.h <= Math.max(32, portrait ? p.w : p.h), q + ' inside profile ' + c.join('x') + ' -> ' + d.w + 'x' + d.h);
        assert.ok(d.w <= Math.max(64, c[0]) && d.h <= Math.max(32, c[1] + 3), 'never enlarged ' + c.join('x'));
        // Aspect within the rounding of a 4-pixel grid.
        assert.ok(Math.abs(d.w / d.h - c[0] / c[1]) < 0.06 * (c[0] / c[1]) + 0.02, q + ' aspect ' + c.join('x') + ' -> ' + d.w + 'x' + d.h);
        // A quarter turn stays legal too.
        legal({ w: d.h, h: d.w }, q + ' turned ' + c.join('x'));
    });
});
assert.deepStrictEqual(fit.profileDims(600, 400, 400, 240), { w: 360, h: 240 });
assert.deepStrictEqual(fit.profileDims(400, 600, 400, 240), { w: 240, h: 360 });
assert.deepStrictEqual(fit.profileDims(1280, 720, 400, 240), { w: 400, h: 224 });
// 240x180 (4:3): a 4:3 picture fills it, a 16:9 film is as wide as 240x144 gives.
assert.deepStrictEqual(fit.profileDims(640, 480, 240, 180), { w: 240, h: 180 });
assert.deepStrictEqual(fit.profileDims(1920, 1080, 240, 180), { w: 240, h: 132 });
assert.ok(desk.createDesktopSettings({}).setQuality('kombi', '240x180').ok);

// The scaled frame really has the profile size and I420 length.
var big = Buffer.alloc(1280 * 720 * 3 / 2, 90);
var small = fit.scaleToProfile(big, 1280, 720, 400, 240);
assert.strictEqual(small.w, 400);
assert.strictEqual(small.h, 224);
assert.strictEqual(small.i420.length, 400 * 224 * 3 / 2);
var same = fit.scaleToProfile(Buffer.alloc(360 * 240 * 3 / 2), 360, 240, 400, 240);
assert.strictEqual(same.w, 360, 'already the profile size: passed as it is');

// Centre profile: a frame the iPhone sent at the asked size is not touched.
assert.strictEqual(fit.fitsProfile(600, 400, 600, 400), true);
assert.strictEqual(fit.fitsProfile(600, 276, 600, 400), true);
assert.strictEqual(fit.fitsProfile(400, 600, 600, 400), true);
assert.strictEqual(fit.fitsProfile(1280, 720, 600, 400), false);

// Menu: quality button, submenu with current sizes, option lists.
var air = menu.AIRPLAY_ITEMS.filter(function (i) { return i.name === 'air-quality'; })[0];
assert.strictEqual(air.title, 'Jakość obrazu');
var page = menu.qualityItems('600x400', '320x192');
assert.deepStrictEqual(page.map(function (i) { return i.name; }), ['q-central', 'q-kombi', 'q-back']);
assert.strictEqual(page[0].title, 'Ekran centralny');
assert.strictEqual(page[0].hint, '600x400');
assert.strictEqual(page[1].title, 'Zegary i HUD');
assert.strictEqual(page[1].hint, '320x192');
var kombi = menu.qualityOptions('kombi', desk.QUALITY_KOMBI, '400x240', desk.QUALITY_NAMES);
assert.deepStrictEqual(kombi.map(function (i) { return i.title; }), ['240x144', '240x180', '320x192', '400x240', '480x288', '600x360', 'Wstecz']);
assert.deepStrictEqual(kombi.filter(function (i) { return i.on; }).map(function (i) { return i.title; }), ['400x240']);
assert.strictEqual(kombi[0].hint, 'niska');
assert.strictEqual(kombi[1].hint, 'niska, 4:3');
assert.strictEqual(kombi[3].hint, 'wysoka, wybrana');
assert.strictEqual(kombi[kombi.length - 1].name, 'qk-back');
var central = menu.qualityOptions('central', desk.QUALITY_CENTRAL, '600x400', desk.QUALITY_NAMES);
assert.strictEqual(central[0].name, 'qc-600x400');
assert.ok(central[0].on);
assert.ok(menu.SCREENS.quality && menu.SCREENS['quality-kombi'] && menu.SCREENS['quality-central']);
assert.strictEqual(menu.crumbFor('quality-kombi', 'Jakość obrazu'), 'Jakość obrazu > Zegary i HUD');

// Bottom-right button on a menu page is "Wyłącz aplikację" (exit flag).
var built = menu.buildFrame(menu.SCREENS.quality, 0, 1920, 720, '', 'Jakość obrazu', 'v', null, null, null, 'AirPlay > Jakość obrazu', null, null);
assert.ok(built.layout.nav && built.layout.nav.ok && built.layout.nav.ok.exit === true, 'exit button on menu pages');
assert.ok(built.layout.nav.ok.x + built.layout.nav.ok.w <= built.layout.ox + built.layout.boxW, 'exit button inside the page');
assert.ok(built.layout.nav.left.x > built.layout.ox, 'arrows still on the page');

console.log('quality: centre and KOMBI profiles saved apart, migrated, legal KOMBI frames, exit button');
