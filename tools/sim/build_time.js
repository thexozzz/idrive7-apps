'use strict';
// node tools/sim/build_time.js [repo]: how long the app's own code takes to build one frame of a page (this machine)
const path = require('path');
const repo = process.argv[2] || path.join(__dirname, '..', '..');
const menu = require(path.join(repo, 'apps', 'g21_airplay', 'src', 'menu_draw.js'));
const air = { on: false, online: false, status: 'wyłączony', screens: [{ key: 'central', on: true }], mirrored: false, window: null };
function time(name, fn) {
    let i; for (i = 0; i < 200; i++) fn();
    const t0 = process.hrtime.bigint(); let bytes = 0;
    for (i = 0; i < 2000; i++) bytes = fn().frame.length;
    return name + ' ' + (Number(process.hrtime.bigint() - t0) / 2e9).toFixed(3) + ' ms, ' + bytes + ' B';
}
const out = [];
['root', 'system', 'airplay', 'apps-settings'].forEach((s) => { if (menu.SCREENS[s]) out.push(time(s, () => menu.buildFrame(menu.SCREENS[s], 1, 1920, 720, '', 'THEiPlay', '0.2.1', null, null, null, menu.crumbFor(s, 'THEiPlay', ''), air, null))); });
out.push(time('browser bar', () => menu.buildWebFrame(1920, 720, { on: true, connected: true, engine: 'ready', url: 'https://example.org/', title: 'Example', live: true, video: true, zoom: 1, w: 1796, h: 548 })));
console.log(require(path.join(repo, 'apps/g21_airplay/package/package.json')).version + ': ' + out.join('; '));
