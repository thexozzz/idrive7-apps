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
 *   {"id":3,"op":"uds","ecu":"12","sid":"22","did":"4300"} -> {"id":3,"ok":true,"data":"<hex of the answer>"}
 *
 * The fields above are what the car sends on its own. The "uds" op asks a control unit a question (a diagnostic
 * read, as the community's Live Data and ZF 8HP apps do): two reading services only, see below.
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

/*
 * Diagnostic reads of a control unit (UDS over TASU, the head unit's own diagnostic transport, as the community's
 * Live Data and ZF 8HP apps use it; the way of cauliflowermossgrape/idrive7-apps kit/runtime/diag.js, MIT).
 *
 * READ ONLY, and fixed here, not left to the caller:
 *   - only two services: 0x22 ReadDataByIdentifier and 0x01 OBD "current data". No session change, no write
 *     (0x2E), no routine (0x31), no actuator (0x2F), no reset (0x11), no fault clearing (0x14), nothing else;
 *   - only one control unit at a time (never the "all units" address 0xDF);
 *   - never the identifier of the VIN (22 F190);
 *   - one request at a time, at least 120 ms apart.
 *
 *   request : method sendTasuRequest { sourceAddress 0xF2, targetAddress, serviceID, subroutineID 0, udsData }
 *   reply   : event sendTasuResponse { udsResponse }; 9 bytes of header ([2] 0x7F = refused by the transport, code
 *             in [4]; [6] = the unit that answered), the UDS reply from byte 9 on.
 */
const TASU = 'com.harman.infotainment.systemfunctions.tasu.tasu.InternalTasu';
const TASU_INSTANCES = ['SystemFunctionsInternalTasuInst1', '1'];
const TESTER = 0xF2;
const UDS_ID_BYTES = { 0x22: 2, 0x01: 1 };
const NRC = { 0x10: 'general reject', 0x11: 'service not supported', 0x12: 'sub-function not supported', 0x13: 'bad length', 0x21: 'busy',
    0x22: 'conditions not correct', 0x31: 'not supported by this unit', 0x33: 'security access denied', 0x7E: 'not in this session', 0x7F: 'not in this session' };
let tasu = null;
let udsWait = null;      // the one request in flight: { ecu, sid, id, done }
let udsChain = Promise.resolve();
let udsLast = 0;

function bytesOf(b) {
    if (!b) return [];
    if (Buffer.isBuffer(b) || b instanceof Uint8Array) return Array.prototype.slice.call(b);
    if (Array.isArray(b)) return b.slice();
    if (b.data) return bytesOf(b.data);
    if (typeof b === 'object' && typeof b.length === 'number') return Array.prototype.slice.call(b);
    return [];
}
function hex2(n) { return (n < 16 ? '0' : '') + n.toString(16).toUpperCase(); }
function onTasu(v) {
    const w = udsWait;
    if (!w) return;
    const b = bytesOf(v && (v.udsResponse !== undefined ? v.udsResponse : v));
    if (b.length >= 5 && b[2] === 0x7F) { w.done({ ok: false, err: 'refused by the transport (' + hex2(b[4]) + ')' }); return; }
    if (b.length < 10 || b[6] !== w.ecu) return;
    const u = b.slice(9);
    if (u[0] === 0x7F && u[1] === w.sid) {
        if (u[2] === 0x78) { w.pending(); return; }           // "response pending": wait longer
        w.done({ ok: false, nrc: u[2], err: NRC[u[2]] || ('refused, code ' + hex2(u[2])) });
        return;
    }
    // this request's answer: service + 0x40, then the identifier echoed
    if (u[0] !== w.sid + 0x40) return;
    for (let i = 0; i < w.id.length; i += 1) { if (u[1 + i] !== w.id[i]) return; }
    w.done({ ok: true, data: u.slice(1 + w.id.length).map(hex2).join('') });
}
function tasuProxy() {
    if (tasu) return tasu;
    load();
    const cfg = gen(TASU);
    const tryInstance = function (at) {
        return tick(function () { return someip.buildProxy(cfg, TASU_INSTANCES[at]).then(function (p) { return p.init().then(function () { return p; }); }); })
            .catch(function (e) { if (at + 1 < TASU_INSTANCES.length) return tryInstance(at + 1); throw e; });
    };
    tasu = tryInstance(0).then(function (p) {
        return tick(function () { return p.subscribe({ name: 'sendTasuResponse', onReceive: function (v) { try { onTasu(v); } catch (e) { /* a frame that is not ours */ } } }); })
            .then(function () { return tick(function () { try { return p.subscribeToAvailability(function () {}); } catch (e) { return null; } }); })
            .then(function () {
                const end = Date.now() + 3000;
                const wait = function () {
                    return tick(function () { return typeof p.isAvailable === 'function' ? p.isAvailable() : true; }).then(function (a) {
                        if (a || Date.now() > end) return p;
                        return new Promise(function (r) { setTimeout(r, 120); }).then(wait);
                    }, function () { return p; });
                };
                return wait();
            });
    });
    tasu.catch(function () { tasu = null; });
    return tasu;
}
// what may be asked: { ecu, sid, id: [bytes] } or an Error's text
function udsCheck(ecu, sid, id) {
    if (!(Number.isInteger(ecu) && ecu >= 0x01 && ecu <= 0xFE) || ecu === 0xDF || ecu === TESTER) return 'bad control unit address';
    if (!Object.prototype.hasOwnProperty.call(UDS_ID_BYTES, sid)) return 'only reading is allowed (services 22 and 01)';
    const n = UDS_ID_BYTES[sid];
    if (!(Number.isInteger(id) && id >= 0 && id < Math.pow(256, n))) return 'bad identifier';
    if (sid === 0x22 && id === 0xF190) return 'the VIN is not given out';
    return { ecu: ecu, sid: sid, id: n === 2 ? [id >> 8, id & 255] : [id] };
}
function udsOne(q) {
    return tasuProxy().then(function (p) {
        const gap = 120 - (Date.now() - udsLast);
        return (gap > 0 ? new Promise(function (r) { setTimeout(r, gap); }) : Promise.resolve()).then(function () {
            return new Promise(function (resolve) {
                let timer = null;
                const finish = function (r) { if (udsWait !== w) return; udsWait = null; clearTimeout(timer); udsLast = Date.now(); resolve(r); };
                const w = { ecu: q.ecu, sid: q.sid, id: q.id, done: finish, pending: function () { clearTimeout(timer); timer = setTimeout(function () { finish({ ok: false, err: 'no answer' }); }, 8000); } };
                udsWait = w;
                tick(function () {
                    return p.callMethod('sendTasuRequest', { sourceAddress: TESTER, targetAddress: q.ecu, serviceID: q.sid, subroutineID: 0,
                        udsDataLength: q.id.length, udsData: Buffer.from(q.id), deadlockTime: 0 }, 6000);
                }).then(function (r) {
                    const v = r && typeof r === 'object' ? (r.TasuErrorEnum || Object.keys(r).map(function (k) { return r[k]; }).filter(function (x) { return typeof x === 'string'; })[0]) : r;
                    const verdict = v === undefined ? 'NO_ERROR' : String(v);
                    if (verdict !== 'NO_ERROR' && verdict !== 'REQUEST_PENDING' && verdict !== '0' && verdict !== '1') { finish({ ok: false, err: /NOT_ACCEPTED|BUSY/i.test(verdict) ? 'the diagnostic transport is busy' : 'transport: ' + verdict }); return; }
                    if (udsWait === w && !timer) timer = setTimeout(function () { finish({ ok: false, err: 'no answer' }); }, 3000);
                }, function (e) { finish({ ok: false, err: String((e && e.message) || e).slice(0, 120) }); });
            });
        });
    });
}
function uds(ecu, sid, id) {
    const q = udsCheck(ecu, sid, id);
    if (typeof q === 'string') return Promise.resolve({ ok: false, err: q });
    const run = function () { return udsOne(q).catch(function (e) { return { ok: false, err: String((e && e.message) || e).slice(0, 160) }; }); };
    const p = udsChain.then(run, run);
    udsChain = p;
    return p;
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
        if (m.op === 'uds') {
            uds(parseInt(String(m.ecu), 16), parseInt(String(m.sid), 16), parseInt(String(m.did), 16)).then(function (r) { answer(Object.assign({ id: id }, r)); });
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

module.exports = { DENY: DENY, denied: denied, udsCheck: udsCheck };
