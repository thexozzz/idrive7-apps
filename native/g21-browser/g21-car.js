#!/usr/bin/node
// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/*
 * g21-car: the car's signals for THEiPlay's apps, READ ONLY.
 *
 * A child of g21-browserd (root, the head unit's own Node 8: /usr/lib/someip.node is built for it). It reads
 * fields of the head unit's SOME/IP interfaces (the catalog /etc/oap/someip/someip-interfaces.json, as G21 Input
 * and G21 Audio do) and does nothing else: it has no code that sets a field or calls a method, so nothing an app
 * sends can change anything in the car. Signals that name a person or a place (VIN, position, destinations,
 * phone, contacts, profiles, keys) are not given out at all.
 *
 * One JSON object a line on stdin, one a line on stdout:
 *   {"id":1,"op":"list"}                          -> {"id":1,"ok":true,"ifaces":{"<interface>":["<field>", ...]}}
 *   {"id":2,"op":"get","iface":"...","name":"..."} -> {"id":2,"ok":true,"value":<the field's value>}
 *                                                    {"id":2,"ok":false,"err":"..."}
 *
 * Diagnostic data of the control units (what Engine Config or the 8HP app read over UDS) is NOT here: that is
 * another road into the car (diagnostic requests to the control units), which this tool does not take.
 */
const fs = require('fs');
const path = require('path');

const CATALOG = process.env.G21_CAR_CATALOG || '/etc/oap/someip/someip-interfaces.json';
const SOMEIP = process.env.G21_CAR_SOMEIP || '/usr/lib/someip.node';
const NAME_RE = /^[A-Za-z][A-Za-z0-9_.]{0,159}$/;
// never given out: who and where
const DENY = /vin(?![a-z])|vehicleidentification|chassis|position|gps|geo|latitude|longitude|location|address|destination|route|phone|contact|person|profile|account|user|key|pin(?![a-z])|password|token|certificate|secret/i;

let cat = null;
let gen = null;
let someip = null;
const proxies = {};

function denied(iface, name) { return DENY.test(String(iface).split('.').pop() + '.' + name); }

function load() {
    if (cat) return;
    cat = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
    gen = require(path.join(__dirname, 'someip_iface.js')).generator(cat);
    someip = require(SOMEIP);
}
// someip.node wants its calls one at a time, each from a fresh tick (as in g21-inputd.js)
let chain = Promise.resolve();
function tick(fn) {
    const run = function () { return new Promise(function (resolve, reject) { setImmediate(function () { try { Promise.resolve(fn()).then(resolve, reject); } catch (e) { reject(e); } }); }); };
    const p = chain.then(run, run);
    chain = p.catch(function () {});
    return p;
}
function readable(iface) {
    const i = cat.interfaces[iface];
    return Object.keys((i && i.fields) || {}).filter(function (n) { return i.fields[n] && i.fields[n].getter && !denied(iface, n); }).sort();
}
function list() {
    load();
    const out = {};
    Object.keys(cat.interfaces).sort().forEach(function (iface) {
        const f = readable(iface);
        if (f.length) out[iface] = f;
    });
    return out;
}
function proxy(iface) {
    if (!proxies[iface]) {
        proxies[iface] = tick(function () {
            return someip.buildProxy(gen(iface), '1').then(function (p) { return p.init().then(function () { return p; }); });
        }).then(function (p) {
            return tick(function () { try { return p.subscribeToAvailability(function () {}); } catch (e) { return null; } }).then(function () { return p; });
        }).then(function (p) {
            // A service is found a moment after its proxy is made; a field asked for before that is "unavailable"
            // although the car has it (car, 2026-11-15: KombiIF, TPMS and Vehicle2 at the first question). So the
            // first question waits until the service is there, 2.5 s at most.
            const end = Date.now() + 2500;
            const wait = function () {
                return tick(function () { return typeof p.isAvailable === 'function' ? p.isAvailable() : true; }).then(function (a) {
                    if (a || Date.now() > end) return p;
                    return new Promise(function (r) { setTimeout(r, 120); }).then(wait);
                }, function () { return p; });
            };
            return wait();
        });
        proxies[iface].catch(function () { delete proxies[iface]; });
    }
    return proxies[iface];
}
function get(iface, name) {
    load();
    if (!NAME_RE.test(String(iface)) || !NAME_RE.test(String(name))) return Promise.reject(new Error('bad name'));
    if (!cat.interfaces[iface]) return Promise.reject(new Error('no such interface'));
    if (readable(iface).indexOf(name) < 0) return Promise.reject(new Error('no such readable field'));
    return proxy(iface).then(function (p) { return tick(function () { return p.getValue(name, 3000); }); });
}

function answer(o) { process.stdout.write(JSON.stringify(o) + '\n'); }
function onLine(line) {
    let m;
    try { m = JSON.parse(line); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    const id = m.id;
    try {
        if (m.op === 'list') { answer({ id: id, ok: true, ifaces: list() }); return; }
        if (m.op === 'get') {
            get(m.iface, m.name).then(function (v) { answer({ id: id, ok: true, value: v === undefined ? null : v }); },
                function (e) { answer({ id: id, ok: false, err: String((e && e.message) || e).slice(0, 200) }); });
            return;
        }
        answer({ id: id, ok: false, err: 'unknown op' });
    } catch (e) { answer({ id: id, ok: false, err: String((e && e.message) || e).slice(0, 200) }); }
}

if (require.main === module) {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', function (d) {
        buf += d;
        if (buf.length > 65536 && buf.indexOf('\n') < 0) { buf = ''; return; }
        let i;
        while ((i = buf.indexOf('\n')) >= 0) { onLine(buf.slice(0, i)); buf = buf.slice(i + 1); }
    });
    process.stdin.on('end', function () { process.exit(0); });   // the daemon went away
    process.stdin.on('close', function () { process.exit(0); });
}

module.exports = { DENY: DENY, denied: denied };
