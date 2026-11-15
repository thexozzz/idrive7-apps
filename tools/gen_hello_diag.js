'use strict';
// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * Makes examples/theiplay-hello/diag.json from cauliflowermossgrape/idrive7-apps (MIT): the catalogs of what a
 * control unit can be ASKED (diagnostic reads), for Hello's "Sterowniki" tab.
 *   node tools/gen_hello_diag.js [path to idrive7-apps]      default: ../idrive7-apps
 *
 *   obd     OBD-II current data of the engine unit (SAE J1979 service 01: a public standard, every engine)
 *   ident   what a unit says about itself (ISO 14229, 22 F1xx), without the VIN
 *   dme8    the petrol engine unit DME8 (B38 / B48 / B58), from the app's built-in catalog
 *   zf8hp   the ZF 8HP gearbox unit (records of up to 12 values; the adaptation maps of 64 cells are left out)
 *
 * entry = { id: hex identifier, name, f: [{ n: name, t: u8|s8|u16|s16|u32|s32|hex|str, at, len, le, k, o, u, m, e }] }
 * value = raw * k + o; le: little endian; m: bit mask; e: { raw: text }.
 */
const fs = require('fs');
const path = require('path');

const src = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'idrive7-apps'));
const std = require(path.join(src, 'apps', 'live_data', 'std.js'));
const dme = JSON.parse(fs.readFileSync(path.join(src, 'apps', 'live_data', 'builtin', 'DME8FF_R.json'), 'utf8'));
const dmeMeta = JSON.parse(fs.readFileSync(path.join(src, 'apps', 'live_data', 'builtin', 'DME8FF_R.meta.json'), 'utf8'));
let en = {};
try { en = JSON.parse(fs.readFileSync(path.join(src, 'apps', 'live_data', 'builtin', 'DME8FF_R.en.json'), 'utf8')); } catch (e) { en = {}; }
const zf = require(path.join(src, 'apps', 'zf8hp', 'catalog.js'));

const hex = (n, w) => n.toString(16).toUpperCase().padStart(w, '0');
function field(f, enums) {
    const o = { t: f.t === 'txt' ? 'str' : f.t, at: f.at || 0 };
    if (f.n) o.n = String(f.n);
    if (f.d) o.n = String(en[f.d] || f.d);
    ['k', 'o', 'len', 'm'].forEach((k) => { if (typeof f[k] === 'number') o[k] = f[k]; });
    if (typeof f.u === 'string' && f.u) o.u = f.u;
    if (f.e && enums && enums[f.e]) o.e = enums[f.e];
    return o;
}
const obd = Object.keys(std.OBD).map((k) => {
    const e = std.OBD[k];
    return { id: hex(e.id, 2), name: e.d, f: e.f.map((f) => field(f, std.ENUMS)) };
});
const ident = Object.keys(std.IDENT).filter((k) => k !== 'F190').map((k) => {
    const e = std.IDENT[k];
    return { id: k, name: e.d, f: e.f.map((f) => field(f, std.ENUMS)) };
});
const dme8 = (dmeMeta.order || Object.keys(dme)).filter((k) => dme[k]).map((k) => {
    const e = dme[k];
    return { id: k, name: String(en[e.d] || e.d || e.a), f: e.f.map((f) => field(f, dmeMeta.enums)) };
});
const zf8 = Object.keys(zf.records).filter((k) => zf.records[k].fields.length && zf.records[k].fields.length <= 12).map((k) => {
    const r = zf.records[k];
    return { id: k, name: String(r.name).replace(/_/g, ' ').toLowerCase(), f: r.fields.map((f, i) => {
        const o = { t: (f.signed ? 's' : 'u') + (f.bytes * 8), at: f.at };
        if (r.fields.length > 1) o.n = '#' + (i + 1);
        if (f.little) o.le = true;
        if (f.factor !== 1) o.k = f.factor;
        if (f.offset) o.o = f.offset;
        if (f.unit) o.u = f.unit;
        return o;
    }) };
});
const out = {
    source: 'cauliflowermossgrape/idrive7-apps (MIT License, Copyright (c) 2026 cauliflowermossgrape): apps/live_data/std.js, apps/live_data/builtin/DME8FF_R*.json (' + (dmeMeta.source || '') + '), apps/zf8hp/catalog.js',
    note: 'diagnostic READS only: service 01 (OBD current data) and 22 (ReadDataByIdentifier)',
    catalogs: [
        { id: 'obd', name: 'OBD-II: dane bieżące silnika', hint: 'standard, każdy silnik', ecu: '12', sid: '01', items: obd },
        { id: 'ident', name: 'Identyfikacja sterownika', hint: 'dowolny sterownik', ecu: '12', sid: '22', items: ident },
        { id: 'dme8', name: 'Silnik benzynowy DME8', hint: 'B38 / B48 / B58', ecu: '12', sid: '22', items: dme8 },
        { id: 'zf8hp', name: 'Skrzynia ZF 8HP', hint: 'sterownik skrzyni', ecu: '18', sid: '22', items: zf8 }
    ]
};
fs.writeFileSync(path.join(__dirname, '..', 'examples', 'theiplay-hello', 'diag.json'), JSON.stringify(out) + '\n');
console.log('diag.json: ' + out.catalogs.map((c) => c.id + ' ' + c.items.length).join(', '));
