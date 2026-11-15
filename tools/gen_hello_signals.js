'use strict';
// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * Makes examples/theiplay-hello/signals.json from the Live Data app of cauliflowermossgrape/idrive7-apps (MIT):
 * its catalog of what the car sends the head unit over SOME/IP, with the scalings (BMW's own where known).
 *   node tools/gen_hello_signals.js [path to idrive7-apps]      default: ../idrive7-apps
 * Only the entries that are data are taken (interface, field, member, factor, offset, unit, "no data" values,
 * enum texts); the ones Live Data computes with code (several fields into one value) are left out and counted.
 * Nothing of that repository is needed afterwards: the file is in this one.
 */
const fs = require('fs');
const path = require('path');

const src = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'idrive7-apps'));
const live = require(path.join(src, 'apps', 'live_data', 'signals.js'));
const GROUP_PL = { Engine: 'Silnik', Temperatures: 'Temperatury', Driving: 'Jazda', Chassis: 'Podwozie', Gearbox: 'Skrzynia biegów', Fuel: 'Paliwo', Tyres: 'Opony', Trip: 'Podróż',
    'Fuel and trip': 'Paliwo i podróż', 'Chassis (raw numbers)': 'Podwozie (surowe liczby)', Brakes: 'Hamulce', Steering: 'Układ kierowniczy', Environment: 'Otoczenie', Electrics: 'Elektryka', Body: 'Nadwozie', Consumption: 'Zużycie', Drivetrain: 'Napęd', Vehicle: 'Pojazd', Hybrid: 'Hybryda' };
let taken = 0, skipped = 0;
const groups = live.GROUPS.map((g) => {
    const items = [];
    g.items.forEach((it) => {
        if (!it.i || !it.f || typeof it.fn === 'function' || typeof it.calc === 'function') { skipped += 1; return; }
        const o = { id: String(it.id), name: String(it.name), i: it.i, f: it.f };
        if (it.m !== undefined) o.m = String(it.m);
        ['k', 'o', 'd'].forEach((k) => { if (typeof it[k] === 'number') o[k] = it[k]; });
        if (typeof it.u === 'string') o.u = it.u;
        if (Array.isArray(it.bad)) o.bad = it.bad.filter((x) => typeof x === 'number');
        if (typeof it.max === 'number') o.max = it.max;
        if (Array.isArray(it.lim) && it.lim.length === 2) o.lim = it.lim;
        if (it.s16) o.s16 = true;
        if (it.raw) o.raw = true;
        if (it.x) o.x = true;
        if (it.q) o.q = true;
        if (it.e && typeof it.e === 'object') { o.e = {}; Object.keys(it.e).forEach((k) => { o.e[k] = it.e[k] === null ? null : String(it.e[k]); }); }
        items.push(o);
        taken += 1;
    });
    return { group: GROUP_PL[g.group] || g.group, items: items };
}).filter((g) => g.items.length);
const out = {
    source: 'cauliflowermossgrape/idrive7-apps, apps/live_data/signals.js (MIT License, Copyright (c) 2026 cauliflowermossgrape)',
    note: 'value = raw * k + o, shown in u with d decimals; bad / max / lim: raw values that mean "no data"; e: enum texts; raw: scaling not known; q: scaling is a best guess',
    groups: groups
};
const dest = path.join(__dirname, '..', 'examples', 'theiplay-hello', 'signals.json');
fs.writeFileSync(dest, JSON.stringify(out, null, 1) + '\n');
console.log('signals.json: ' + groups.length + ' groups, ' + taken + ' values taken, ' + skipped + ' computed ones left out');
console.log(groups.map((g) => g.group + ' (' + g.items.length + ')').join(', '));
