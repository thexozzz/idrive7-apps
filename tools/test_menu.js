'use strict';

var assert = require('assert');
var menu = require('../apps/g21_airplay/src/menu_draw.js');

var built = menu.buildFrame(menu.ROOT_ITEMS, 0, 1920, 720);
assert.strictEqual(built.frame.readUInt32LE(0), 7);
assert.strictEqual(built.frame.length, 8 + built.frame.readUInt32LE(4));
assert.strictEqual(built.frame.readUInt32LE(8), 1);
assert.ok(built.rects > 40);
assert.ok(built.layout);
assert.ok(built.layout.bubbles.length <= menu.ROOT_ITEMS.length);
assert.strictEqual(built.layout.count, menu.ROOT_ITEMS.length);
// The home screen (0.1.214): the modules themselves, one card each, then Ustawienia.
assert.deepStrictEqual(menu.ROOT_ITEMS.map(function (i) { return i.name; }), ['youtube', 'airplay', 'browser', 'apps', 'system']);
assert.deepStrictEqual(menu.ROOT_ITEMS.map(function (i) { return i.title; }), ['YouTube', 'AirPlay', 'Przeglądarka', 'Aplikacje', 'Ustawienia']);
(function () {
    var lay = menu.buildFrame(menu.ROOT_ITEMS, 0, 1920, 720).layout;
    assert.ok(lay.bubbles.length === 5 && lay.bubbles.every(function (b) { return b.module && b.y === lay.bubbles[0].y && b.w >= 300 && b.h >= 300; }), 'five module cards in one row');
    assert.ok(lay.bubbles[4].x + lay.bubbles[4].w <= 104 + 1796, 'inside the part of the screen the app has');
}());
assert.deepStrictEqual(menu.MEDIA_ITEMS.map(function (i) { return i.name; }), ['youtube', 'airplay', 'media-back']);
assert.deepStrictEqual(menu.APPS_ITEMS.map(function (i) { return i.name; }), ['apps-store', 'apps-back']);
assert.deepStrictEqual(menu.SYSTEM_ITEMS.map(function (i) { return i.name; }), ['sg-display', 'sg-input', 'sg-browser', 'sg-apps', 'sg-general', 'system-back']);
// the picture's settings are in one place
assert.deepStrictEqual(menu.SET_DISPLAY_ITEMS.map(function (i) { return i.name; }), ['position', 'air-quality', 'cluster-place', 'air-delay', 'settings', 'sgd-back']);
assert.deepStrictEqual(menu.SET_INPUT_ITEMS.map(function (i) { return i.name; }), ['set-mouse', 'set-mouse-speed', 'set-menu-mouse', 'set-kill', 'sgi-back']);
assert.deepStrictEqual(menu.SET_APPS_ITEMS.map(function (i) { return i.name; }), ['aset-screens', 'aset-car', 'aset-diag', 'sga-back']);
assert.deepStrictEqual(menu.SET_GENERAL_ITEMS.map(function (i) { return i.name; }), ['label-toggle', 'lang-toggle', 'sys-info', 'svc-restart', 'sgg-back']);
assert.deepStrictEqual(menu.STORE_ITEMS.map(function (i) { return i.name; }), ['store-import', 'store-demo', 'store-back']);
assert.deepStrictEqual(menu.APPS_SET_ITEMS.map(function (i) { return i.name; }), ['aset-home', 'aset-zoom', 'aset-picture', 'aset-fs', 'aset-autoplay', 'aset-video', 'aset-engine', 'aset-frames', 'aset-mobile', 'aset-sandbox', 'aset-memory', 'aset-pages', 'aset-back']);
assert.ok(menu.SCREENS.multimedia === menu.MEDIA_ITEMS && menu.SCREENS.system === menu.SYSTEM_ITEMS && menu.SCREENS.apps === menu.APPS_ITEMS && menu.SCREENS['apps-store'] === menu.STORE_ITEMS && menu.SCREENS['apps-settings'] === menu.APPS_SET_ITEMS);
// tiles: a gallery of small tiles, row by row, in up to three rows; a page with sliders stays a list
[menu.MEDIA_ITEMS, menu.APPS_ITEMS].forEach(function (list) {
    var lay = menu.buildFrame(list, 0, 1920, 720).layout;
    assert.ok(lay.bubbles.length === list.length && lay.bubbles.every(function (b) { return b.home && b.grid && b.h < 160 && b.w < 350; }), 'small tiles');
    assert.ok(lay.bubbles.every(function (b) { return b.y === lay.bubbles[0].y; }), 'up to five of them: one row');
    assert.ok(lay.bubbles[1].x >= lay.bubbles[0].x + lay.bubbles[0].w && lay.bubbles[lay.bubbles.length - 1].x + lay.bubbles[lay.bubbles.length - 1].w <= 1900, 'side by side, inside the page');
});
assert.ok(menu.buildFrame(menu.SCREENS['pos-box'], 0, 1920, 720).layout.bubbles.every(function (b) { return !b.home; }), 'a page with sliders stays a list');
(function () {
    var many = [];
    var k;
    var rows = {};
    for (k = 0; k < 30; k += 1) {
        many.push({ name: 'tile-' + k, title: 'Kafel ' + k, hint: '', icon: 'play' });
    }
    var at0 = menu.buildFrame(many, 0, 1920, 720).layout;
    var at29 = menu.buildFrame(many, 29, 1920, 720).layout;
    at0.bubbles.forEach(function (b) { rows[b.y] = (rows[b.y] || 0) + 1; });
    assert.strictEqual(Object.keys(rows).length, 3, 'three rows');
    assert.ok(at0.bubbles.length === 15 && at0.bubbles[0].index === 0, 'five in a row, three rows: ' + at0.bubbles.length);
    assert.ok(at0.bubbles[4].y === at0.bubbles[0].y && at0.bubbles[5].y > at0.bubbles[4].y && at0.bubbles[5].x === at0.bubbles[0].x, 'filled row by row');
    assert.ok(menu.buildFrame(menu.SYSTEM_ITEMS, 0, 1920, 720).layout.bubbles.every(function (b) { return b.grid; }), 'Ustawienia is a gallery too');
    assert.ok(at29.bubbles.some(function (b) { return b.index === 29 && b.selected; }), 'the rows slid to the last tile');
    assert.ok(at29.bubbles.every(function (b) { return b.y + b.h <= 720 - 96 && b.y >= 88 + 68; }), 'between the header and the foot');
    assert.strictEqual(at0.count, 30);
}());
assert.strictEqual(menu.SCREENS.youtube[0].name, 'yt-where');
assert.strictEqual(menu.SCREENS.youtube[1].name, 'yt-login');
assert.strictEqual(menu.SCREENS.youtube[2].name, 'yt-browse');
assert.strictEqual(menu.SCREENS.settings[0].name, 'set-render');
assert.strictEqual(menu.SCREENS.settings[0].hint, 'GPU');
assert.strictEqual(menu.MEDIA_ITEMS[1].hint, 'lustro iPhone');
assert.strictEqual(menu.MEDIA_ITEMS[1].icon, 'airplay');
assert.strictEqual(menu.SYSTEM_ITEMS[0].icon, 'desktop');
assert.ok(menu.ICONS.airplay);
assert.ok(menu.ICONS.play);
assert.ok(!menu.ROOT_ITEMS.some(function (item) { return item.name === 'host'; }));
assert.ok(built.layout.bubbles[0].iconPx >= 2);
assert.ok(built.layout.bubbles[0].iconPx <= 4);

var blank = menu.buildFrame([
    { title: ' ', hint: ' ' },
    { title: ' ', hint: ' ' },
    { title: ' ', hint: ' ' },
    { title: ' ', hint: ' ' }
], 0, 1920, 720);
assert.ok(built.rects > blank.rects);

var withStatus = menu.buildFrame(menu.ROOT_ITEMS, 0, 1920, 720, 'UxPlay start');
assert.ok(withStatus.rects > 40);
assert.ok(withStatus.layout.bubbles.length <= menu.ROOT_ITEMS.length);
// the version mark is one more drawing (same heading with and without it)
var withVer = menu.buildFrame(menu.ROOT_ITEMS, 0, 1920, 720, 'UxPlay start', 'G21', '0.1.70');
var noVer = menu.buildFrame(menu.ROOT_ITEMS, 0, 1920, 720, 'UxPlay start', 'G21');
assert.ok(withVer.rects > noVer.rects);

var selected = menu.buildFrame(menu.AIRPLAY_ITEMS, 2, 1920, 720, '', 'Menu');
var focusRow = selected.layout.bubbles.filter(function (bubble) { return bubble.index === 2; })[0];
assert.ok(focusRow);
assert.strictEqual(focusRow.selected, true);
assert.ok(selected.layout.bubbles.some(function (bubble) { return bubble.index !== 2 && bubble.selected === false; }));
var many = [];
var n;
for (n = 0; n < 9; n += 1) {
    many.push({ name: 'row-' + n, title: 'Pozycja ' + n, hint: 'opis', icon: 'play', adjust: n === 0 });   // (a slider keeps the page a list of rows)
}
var scrolled = menu.buildFrame(many, 8, 1920, 720, '', 'Lista');
assert.ok(scrolled.layout.bubbles.length < many.length);
assert.strictEqual(scrolled.layout.bubbles[scrolled.layout.bubbles.length - 1].index, 8);
assert.ok(scrolled.layout.first > 0);
assert.ok(scrolled.layout.bubbles[0].y >= scrolled.layout.oy);

var air = menu.buildFrame(menu.AIRPLAY_ITEMS, 0, 1920, 720, 'AirPlay start', 'AirPlay');
assert.ok(air.rects > 40);
assert.strictEqual(menu.AIRPLAY_ITEMS.length, 6);
assert.strictEqual(menu.AIRPLAY_ITEMS[0].name, 'air-toggle');
assert.strictEqual(menu.AIRPLAY_ITEMS[0].title, 'Start');
assert.strictEqual(menu.AIRPLAY_ITEMS[0].icon, 'play');
assert.strictEqual(menu.AIRPLAY_ITEMS[0].hint, 'włącz lustro');
assert.strictEqual(menu.AIRPLAY_ITEMS[1].name, 'air-screen');
assert.ok(!menu.AIRPLAY_ITEMS.some(function (i) { return i.name === 'air-quality'; }), 'the resolution lives in the main Ustawienia only');
assert.strictEqual(menu.AIRPLAY_ITEMS[4].name, 'air-sound');
assert.strictEqual(menu.AIRPLAY_ITEMS[5].name, 'air-back');
assert.strictEqual(menu.AIR_OUT_ITEMS[0].title, 'Środek');
assert.ok(!menu.AIR_OUT_ITEMS.some(function (item) { return item.name === 'air-out-start'; }));
assert.ok(menu.AIRPLAY_ITEMS.every(function (item) {
    return item.name !== 'air-start' && item.name !== 'air-stop';
}));
assert.ok(menu.SCREENS.airplay);
assert.ok(menu.SCREENS['air-out']);
assert.strictEqual(menu.positionOptions().filter(function (item) { return item.adjust; }).map(function (item) { return item.name; }).join(','), 'pos-x,pos-y,pos-size');
assert.strictEqual(menu.positionOptions()[2].title, 'Rozciągnięcie');
assert.ok(!menu.positionOptions().some(function (item) { return item.name.indexOf('res') === 0 || /rozdzielczo/i.test(item.title); }));
assert.strictEqual(menu.positionPage('shared').filter(function (item) { return item.on; }).map(function (item) { return item.name; }).join(','), 'pos-shared');
assert.strictEqual(menu.positionPage('each', 'hud').filter(function (item) { return item.on; }).map(function (item) { return item.name; }).join(','), 'pos-each,pos-out-hud');
assert.ok(menu.positionPage('shared').some(function (item) { return item.name === 'pos-size'; }));
assert.ok(!menu.positionPage('shared').some(function (item) { return item.name === 'pos-out-central'; }));
assert.ok(menu.positionPage('each', 'central').some(function (item) { return item.name === 'pos-out-central' && item.on; }));
assert.strictEqual(menu.SCREENS['pos-out'][0].name, 'pos-shared');
assert.strictEqual(menu.SCREENS['pos-out'][0].on, true);
assert.strictEqual(menu.SCREENS['pos-out'][1].on, false);
var pinned = menu.buildFrame(menu.positionPage('each', 'hud'), menu.positionPage('each', 'hud').length - 1, 1920, 720, '', 'Pozycja');
assert.strictEqual(pinned.layout.bubbles[0].index, 0);
assert.strictEqual(pinned.layout.bubbles[1].index, 1);
assert.ok(pinned.layout.bubbles[pinned.layout.bubbles.length - 1].index > 1);
var sharedPreview = menu.buildFrame(menu.positionOptions(), 2, 1920, 720, '', 'Wspólne', '', null, {
    frames: [
        { label: 'Środek', limitW: 1920, limitH: 720, x: 200, y: 80, w: 600, h: 400, focus: false },
        { label: 'Zegary', limitW: 1088, limitH: 480, x: 80, y: 40, w: 320, h: 200, focus: false },
        { label: 'HUD', limitW: 800, limitH: 480, x: 40, y: 30, w: 240, h: 160, focus: false }
    ]
});
assert.ok(sharedPreview.layout.nav.ok.y < sharedPreview.layout.oy + sharedPreview.layout.headerH + 40);
assert.ok(sharedPreview.layout.nav.ok.y + sharedPreview.layout.nav.ok.h < sharedPreview.layout.oy + sharedPreview.layout.boxH / 2);
assert.ok(sharedPreview.layout.nav.left.x >= sharedPreview.layout.bubbles[0].x + sharedPreview.layout.bubbles[0].w);
var onePreview = menu.buildFrame(menu.positionOptions(), 0, 1920, 720, '', 'HUD', '', null, {
    frames: [
        { label: 'HUD', limitW: 800, limitH: 480, x: 40, y: 30, w: 240, h: 160, focus: true }
    ]
});
assert.strictEqual(onePreview.layout.nav.ok.y, sharedPreview.layout.nav.ok.y);
var plainNav = menu.buildFrame(menu.SCREENS['pos-each'], 0, 1920, 720, '', 'Pozycja');
assert.ok(plainNav.layout.nav.ok.y > plainNav.layout.oy + plainNav.layout.boxH - 120);
assert.strictEqual(menu.SCREENS['air-box'][0].name, 'air-box-power');
assert.ok(!menu.screenOptions('central').some(function (item) { return item.name === 'air-box-x'; }));
assert.strictEqual(menu.SCREENS.label.filter(function (item) { return item.name === 'label-font' || item.name === 'label-size' || item.name === 'label-color'; }).length, 3);
assert.ok(!menu.screenOptions('cluster').some(function (item) { return item.name === 'air-box-place'; }), 'the area on the gauges is a main setting');
assert.ok(!menu.screenOptions('central').some(function (item) { return item.name === 'air-box-place'; }));
assert.ok(!menu.screenOptions('hud').some(function (item) { return item.name === 'air-box-place'; }));
assert.strictEqual(menu.SCREENS['air-box'][menu.SCREENS['air-box'].length - 1].name, 'air-box-back');
assert.ok(!menu.SCREENS['air-box'].some(function (item) { return item.name === 'air-box-up' || item.name === 'air-box-s'; }));
assert.strictEqual(menu.AIR_OUT_ITEMS[0].name, 'air-out-central');
assert.strictEqual(menu.AIR_OUT_ITEMS[1].name, 'air-out-cluster');
assert.strictEqual(menu.AIR_OUT_ITEMS[2].name, 'air-out-hud');
assert.ok(!menu.AIR_OUT_ITEMS.some(function (item) { return item.name === 'air-area' || item.name === 'air-out-box'; }));
assert.ok(menu.SCREENS.label);
assert.ok(menu.STREAM_ITEMS);
assert.strictEqual(menu.STREAM_ITEMS[0].name, 'stream-end');
assert.strictEqual(menu.STREAM_ITEMS[0].title, 'Zakończ');
assert.ok(menu.SCREENS.stream);
var stream = menu.buildFrame(menu.STREAM_ITEMS, 0, 1920, 720, 'stream', 'Stream');
assert.ok(stream.layout.stream);
assert.strictEqual(stream.layout.bubbles.length, 1);
assert.ok(stream.rects < air.rects);
assert.ok(menu.AIRPLAY_ITEMS.every(function (item) { return item.name.indexOf('air-') === 0; }));

assert.strictEqual(menu.encoderStep(null, 4), 0);
assert.strictEqual(menu.encoderStep(1, 2), 1);
assert.strictEqual(menu.encoderStep(65535, 0), 1);
assert.strictEqual(menu.encoderStep(3, 1), -2);
assert.strictEqual(menu.crumbFor('airplay'), 'AirPlay');
assert.strictEqual(menu.crumbFor('air-out'), 'AirPlay > Ekrany');
assert.strictEqual(menu.crumbFor('air-box', 'Zegary'), 'AirPlay > Ekrany > Zegary');
assert.strictEqual(menu.crumbFor('airplay', '', 'Nazwa'), 'AirPlay > Nazwa');
var located = menu.buildFrame(menu.AIRPLAY_ITEMS, 0, 1920, 720, '', 'THEiPlay', '', null, null, null, 'AirPlay');
assert.strictEqual(located.layout.crumb, 'AirPlay');
assert.ok(located.layout.backHit);
assert.ok(located.layout.backHit.w > 40);
assert.ok(located.layout.nav);
assert.ok(located.layout.nav.ok.x > located.layout.nav.right.x);
assert.ok(located.layout.nav.right.x > located.layout.nav.left.x);
function hitNamed(frame, hitName) {
    var i;
    var hits = frame.layout.hits || [];
    for (i = 0; i < hits.length; i += 1) {
        if (hits[i].name === hitName) {
            return hits[i];
        }
    }
    return null;
}
var tuned = menu.buildFrame(menu.STREAM_ITEMS, 0, 1920, 720, '', 'Stream', '0.1.99', {
    screens: [
        { name: 'stream-central', title: 'Środek', on: true },
        { name: 'stream-cluster', title: 'Zegary', on: false },
        { name: 'stream-hud', title: 'HUD', on: false }
    ],
    tune: {
        name: 'central',
        title: 'Środek',
        tool: 'w',
        axis: 'x',
        x: 640,
        y: 180,
        w: 640,
        h: 360,
        limitW: 1920,
        limitH: 720,
        saved: false,
        shown: { x: 640, y: 180, w: 640, h: 360, limitW: 1920, limitH: 720 }
    },
    window: { x: 640, y: 180, w: 640, h: 360 },
    mirrored: true
});
assert.ok(hitNamed(tuned, 'stream-central'));
assert.ok(hitNamed(tuned, 'stream-cluster'));
assert.ok(hitNamed(tuned, 'stream-hud'));
assert.ok(hitNamed(tuned, 'stream-w'));
assert.ok(hitNamed(tuned, 'stream-save'));
assert.ok(hitNamed(tuned, 'stream-cancel'));
assert.ok(hitNamed(tuned, 'stream-win-size'));
assert.ok(hitNamed(tuned, 'stream-win-pos'));
assert.ok(hitNamed(tuned, 'stream-end'));
assert.ok(tuned.rects > stream.rects);
var badged = menu.buildFrame(menu.ROOT_ITEMS, 0, 1920, 720, '', 'THEiPlay', '0.1.100', null, null, null, 'THEiPlay', {
    on: true,
    online: false,
    bad: true,
    status: 'brak odbiornika',
    mirrored: false
});
// the corner: one button, "Ekrany"; on THEiPlay's own pages it leads to the screens' settings, on a module's page
// it opens that module's panel
assert.deepStrictEqual(badged.layout.airHits.map(function (hit) { return hit.name; }), ['where-options'], 'one button in the corner');
assert.ok(badged.layout.airHits[0].w > 150 && badged.layout.airHits[0].h < 56 && badged.layout.airHits[0].x + badged.layout.airHits[0].w <= 104 + 1796);
menu.useTheme('airplay');
assert.deepStrictEqual(menu.buildFrame(menu.SCREENS.airplay, 0, 1920, 720, '', 'THEiPlay', '0.1.100', null, null, null, 'AirPlay', { on: true, online: false, status: 'czeka', screens: [], mirrored: false }).layout.airHits.map(function (hit) { return hit.name; }), ['air-where']);
menu.useTheme('browser');
assert.deepStrictEqual(menu.buildFrame(menu.SCREENS['apps-settings'], 0, 1920, 720, '', 'Przeglądarka', '0.1.100', null, null, null, 'Przeglądarka', { on: false, screens: [] }).layout.airHits.map(function (hit) { return hit.name; }), ['web-where']);
menu.useTheme('base');
assert.ok(!badged.layout.airHits.some(function (hit) { return hit.name === 'air-pick-central'; }));
var picked = menu.buildFrame(menu.ROOT_ITEMS, 0, 1920, 720, '', 'THEiPlay', '0.1.100', null, null, null, 'THEiPlay', {
    on: true,
    whereOpen: true,
    whereCursor: 0,
    screens: [{ key: 'cluster', on: true }]
});
assert.ok(picked.layout.airHits.some(function (hit) { return hit.name === 'air-pick-cluster'; }));
assert.ok(picked.layout.airHits.some(function (hit) { return hit.name === 'air-pick-hud'; }));
assert.ok(picked.layout.airHits.some(function (hit) { return hit.name === 'air-pick-central'; }));
var framed = menu.buildFrame(menu.ROOT_ITEMS, 0, 1920, 720, '', 'THEiPlay', '0.1.100', null, null, null, 'THEiPlay', {
    on: true,
    online: true,
    mirrored: true,
    window: { x: 200, y: 120, w: 640, h: 360 }
});
assert.ok(framed.layout.airHits.some(function (hit) { return hit.name === 'air-full'; }));
assert.ok(!framed.layout.airHits.some(function (hit) { return hit.name === 'air-pos'; }), 'no second button over the picture');
assert.ok(!hitNamed(badged, 'stream-central'));
var clipped = menu.streamWindow({ x: 180, y: 36, w: 1280, h: 640 }, { ox: 104, oy: 88, boxW: 1796, boxH: 632 });
assert.ok(clipped.y + clipped.h <= 88 + 632 - 160);
assert.ok(clipped.y + clipped.h < 596);

console.log('test_menu: ok');
