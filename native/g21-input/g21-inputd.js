#!/usr/bin/node
// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/*
 * g21-inputd - G21 Input: the iDrive controller's physical touchpad as a mouse for THEiPlay's apps.
 *
 * Runs as root on the head unit's own Node 8 (/usr/lib/someip.node is built for it). Root, because the
 * controller's interfaces are not in the list BMW's main app gives an app, and their schemas are made here from
 * the head unit's own catalog (someip_iface.js).
 *
 *   touchpad --SOME/IP ControllerElements.ZBETouchFrontSide--> this daemon --/run/g21-input/ctl.sock--> the app
 *
 * VERIFIED on the car 2026-11-15 (G21, 4.14.198-apl), as root:
 *   - without touch mode the field is quiet: statusSystemModeFrontSide 0, X1 = Y1 = 0;
 *   - FrontCCU.ccsControlTouchCCU = { controlTouchActiveFrontSide: TOUCH_AKTIV, controlIcon: 15, alive counter }
 *     is accepted; the pad then reports mode 3 at 60 samples a second, one finger at
 *     touchCoordinatesX1FrontSide / Y1FrontSide (X seen 1..497), touchCoordinatesZ1FrontSide 0 with a finger
 *     and 1 without; TOUCH_NICHT_AKTIV is accepted and the mode is 0 again.
 * The way (touch mode as the HMI's speller sets it, the pad's fields) is Moonride's
 * (apps/jap_moonride/main.js, input.js; Copyright (C) 2026 JustAnotherPU, GPL-3.0-or-later).
 *
 * Only while a client asks: {"op":"on"} sets touch mode and the samples flow; {"op":"off"}, the client going
 * away, a car that moves, SIGTERM and this daemon's own start all end with TOUCH_NICHT_AKTIV, so the
 * controller is never left in touch mode by a crash of the app.
 *
 * To the client, one JSON object per line:
 *   {"ev":"state","on":true,"pad":3,"speed":0,"moving":false}
 *   {"ev":"m","dx":12,"dy":-4}     the finger moved (pad units; +x right, +y down on the screen)
 *   {"ev":"tap"}                   a short still touch
 * Nothing else of the controller is read or changed here: the knob stays the HMI's and the renderer's.
 *
 * Lines in the log start with [G21-INPUT].
 */
const fs = require('fs');
const net = require('net');
const path = require('path');

const env = process.env;
const RUN = env.G21_INPUT_RUN || '/run/g21-input';
const ROOT = env.G21_INPUT_ROOT || '/var/opt/g21-input';
const SOCK = path.join(RUN, 'ctl.sock');
const CATALOG = env.G21_INPUT_CATALOG || '/etc/oap/someip/someip-interfaces.json';
const SOMEIP = env.G21_INPUT_SOMEIP || '/usr/lib/someip.node';
const SOCK_GID = 12202;   // tm_oap_app: the apps
const PAD_MODE = 3;
const TAP_MS = 220, TAP_MOVE = 14;   // a tap: this short, the finger this still (pad units)
const JUMP = 160;                    // a step larger than this between two samples is no movement (a new contact, a glitch)
const MAX_KMH = 3;
// The standstill lock. Owner, 2026-11-15: off. The mouse works while the car moves unless
// /var/opt/g21-input/config.json says { "parkedOnly": true } (read when the daemon starts).
const PARKED_ONLY = (function () { try { return JSON.parse(fs.readFileSync(path.join(env.G21_INPUT_ROOT || '/var/opt/g21-input', 'config.json'), 'utf8')).parkedOnly === true; } catch (e) { return false; } }());
const VERSION = (function () { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'component.json'), 'utf8')).version; } catch (e) { return ''; } }());

function log(text) {
    const line = new Date().toISOString() + ' [G21-INPUT] ' + text;
    try { fs.mkdirSync(path.join(ROOT, 'log')); } catch (e) { /* there */ }
    try {
        const f = path.join(ROOT, 'log', 'inputd.log');
        try { if (fs.statSync(f).size > 512 * 1024) fs.renameSync(f, f + '.1'); } catch (e) { /* none yet */ }
        fs.appendFileSync(f, line + '\n');
    } catch (e) { /* stdout has it */ }
    console.log(line);
}
// someip.node wants its calls one at a time, each from a fresh tick (Moonride's signals.js)
let chain = Promise.resolve();
function tick(fn) {
    const run = function () { return new Promise(function (resolve, reject) { setImmediate(function () { try { Promise.resolve(fn()).then(resolve, reject); } catch (e) { reject(e); } }); }); };
    const p = chain.then(run, run);
    chain = p.catch(function () {});
    return p;
}

/*
 * The pad's samples -> movement and taps. Relative, as a laptop's pad: the cursor moves by what the finger
 * moved, a lifted finger leaves it where it is, a finger put down again does not make it jump.
 */
function Pad(emit) {
    this.emit = emit;
    this.last = null;   // the last finger position
    this.down = null;   // { t, moved } of the contact that is on
}
Pad.prototype.feed = function (v, now) {
    now = now || Date.now();
    let x = v ? v.touchCoordinatesX1FrontSide : 0, y = v ? v.touchCoordinatesY1FrontSide : 0;
    const finger = !!v && v.statusSystemModeFrontSide === PAD_MODE && v.touchCoordinatesZ1FrontSide === 0 && (x > 0 || y > 0);
    // a second finger (the same three fields with a 2): the two move the page, not the cursor, and make no tap.
    // A pad that does not report it leaves these fields away or at rest: then nothing changes.
    const x2 = v ? v.touchCoordinatesX2FrontSide : 0, y2 = v ? v.touchCoordinatesY2FrontSide : 0;
    const second = finger && v.touchCoordinatesZ2FrontSide === 0 && (x2 > 0 || y2 > 0);
    if (!finger) {
        const d = this.down;
        if (d && !d.multi && now - d.t <= TAP_MS && d.moved <= TAP_MOVE) this.emit({ ev: 'tap' });
        this.two = false;
        this.last = null;
        this.down = null;
        return;
    }
    if (!this.down) this.down = { t: now, moved: 0 };
    if (second !== !!this.two) {
        // a finger more or less: the position jumps, the movement starts anew
        this.two = second;
        this.last = null;
        if (second) { this.down.multi = true; if (!this.twoSeen) { this.twoSeen = true; this.emit({ ev: 'two' }); } }
    }
    if (second) { x = (x + x2) / 2; y = (y + y2) / 2; }
    if (this.last) {
        const dx = x - this.last.x, dy = y - this.last.y;
        if (Math.abs(dx) > JUMP || Math.abs(dy) > JUMP) { this.last = { x: x, y: y }; return; }
        this.down.moved += Math.abs(dx) + Math.abs(dy);
        // within a tap's wobble the cursor stays put
        if (second) { if (dx || dy) this.emit({ ev: 's', dx: dx, dy: -dy }); }
        else if (this.down.moved > TAP_MOVE && (dx || dy)) this.emit({ ev: 'm', dx: dx, dy: -dy });   // the pad's Y grows upwards
    }
    this.last = { x: x, y: y };
};

const st = { client: null, on: false, pad: -1, padAt: 0, asks: 0, askAt: 0, alive: 0, speed: null, speedAt: 0, take: null, ce: null, ccu: null, veh: null, ready: null };
function send(o) { if (st.client) { try { st.client.write(JSON.stringify(o) + '\n'); } catch (e) { /* gone */ } } }
// A speed counts only while it is fresh. Car, 2026-11-15: the daemon kept a speed from a drive, got no newer one,
// and refused the mouse in a standing car ("the car moves") although Vehicle2 said 0.
const SPEED_FRESH_MS = 6000;
function speedNow() { return st.speed !== null && Date.now() - st.speedAt < SPEED_FRESH_MS ? st.speed : null; }
function moving() { const s = speedNow(); return PARKED_ONLY && s !== null && s > MAX_KMH; }
// ask Vehicle2 for the speed now (resolves either way)
function readSpeed() {
    if (!st.veh || !st.take) return Promise.resolve();
    return tick(function () { return st.veh.getValue('statusCarSpeed2', 3000); }).then(st.take, function (e) { log('speed not read: ' + e); });
}
function state() { send({ ev: 'state', on: st.on, pad: st.pad, speed: speedNow(), moving: moving() }); }
const pad = new Pad(function (o) { if (o.ev === 'two') { log('two fingers on the pad: scrolling'); return; } if (st.on) send(o); });

function touchMode(on) {
    if (!st.ccu) return Promise.resolve(false);
    st.alive = (st.alive + 1) % 15;
    const v = { aliveControlTouchZBEFrontSide: st.alive, controlTouchActiveFrontSide: on ? 'TOUCH_AKTIV' : 'TOUCH_NICHT_AKTIV', controlIcon: 15 };
    st.askAt = Date.now();
    return tick(function () { return st.ccu.setValue('ccsControlTouchCCU', v, 5000); })
        .then(function () { log('touch mode ' + v.controlTouchActiveFrontSide); return true; },
            function (e) { log('touch mode ' + v.controlTouchActiveFrontSide + ' refused: ' + e); return false; });
}
function proxies() {
    if (st.ready) return st.ready;
    st.ready = (function () {
        const someip = require(SOMEIP);
        const iface = require('./someip_iface.js').generator(JSON.parse(fs.readFileSync(CATALOG, 'utf8')));
        const open = function (name) {
            return tick(function () { return someip.buildProxy(iface(name), '1').then(function (p) { return p.init().then(function () { return p; }); }); })
                .then(function (p) { return tick(function () { try { return p.subscribeToAvailability(function () {}); } catch (e) { return null; } }).then(function () { return p; }); });
        };
        return open('de.bmw.infotainment.ControllerElements').then(function (ce) {
            st.ce = ce;
            return tick(function () {
                return ce.subscribe({ name: 'ZBETouchFrontSide', onReceive: function (v) {
                    try {
                        const mode = v ? v.statusSystemModeFrontSide : -1;
                        if (mode !== st.pad) { st.pad = mode; state(); }
                        st.padAt = Date.now();
                        // the pad says another mode after we asked for touch mode: ask again, 5 times an "on" at most
                        if (st.on && mode !== PAD_MODE && Date.now() - st.askAt > 1000 && st.asks < 5) { st.asks += 1; touchMode(true); }
                        pad.feed(v);
                    } catch (e) { log('pad: ' + e); }
                } });
            });
        }).then(function () { return open('de.bmw.infotainment.controlelements.FrontCCU'); }).then(function (ccu) {
            st.ccu = ccu;
            return open('de.bmw.infotainment.vehicle.Vehicle2').then(function (veh) {
                st.veh = veh;
                const take = st.take = function (v) {
                    const k = v && v.speedVehicleCentreOfGravity;
                    if (typeof k === 'number' && k !== 65535) {
                        const was = moving();
                        st.speed = k * 0.015625; st.speedAt = Date.now();
                        if (moving() && st.on) { log('the car moves (' + st.speed.toFixed(1) + ' km/h): off'); off('the car moves'); }
                        else if (was !== moving()) state();
                    }
                };
                return tick(function () { return veh.subscribe({ name: 'statusCarSpeed2', onReceive: take }); }).then(function () {
                    // a standing car may not notify a speed that does not change: read it now and then
                    setInterval(function () { if (st.on) readSpeed(); }, 2000);
                });
            }).catch(function (e) { log('speed not readable: ' + e); });
        }).then(function () { log('controller interfaces ready'); });
    }());
    st.ready.catch(function (e) { log('controller interfaces: ' + (e && e.message || e)); st.ready = null; });
    return st.ready;
}
function on() {
    return proxies().then(readSpeed).then(function () {
        if (moving()) { log('not switched on: the car moves (' + st.speed.toFixed(1) + ' km/h)'); state(); return; }
        if (!PARKED_ONLY) log('standstill lock off (config.json parkedOnly), speed ' + (speedNow() === null ? 'unknown' : st.speed.toFixed(1) + ' km/h'));
        else if (speedNow() === null) log('speed unknown (Vehicle2 gives none to this daemon now): switched on without the standstill check');
        else log('standing (' + st.speed.toFixed(1) + ' km/h)');
        st.on = true;
        st.asks = 0;
        return touchMode(true).then(function (ok) { if (!ok) st.on = false; state(); });
    }, function () { state(); });
}
function off(why) {
    if (!st.on) return Promise.resolve();
    st.on = false;
    pad.feed(null);
    log('off (' + why + ')');
    return touchMode(false).then(function () { state(); });
}

function serve() {
    try { fs.mkdirSync(RUN); } catch (e) { /* there */ }
    try { fs.chmodSync(RUN, 0o755); } catch (e) { /* tests */ }
    try { fs.unlinkSync(SOCK); } catch (e) { /* none */ }
    const server = net.createServer(function (c) {
        let buf = '';
        if (st.client) { try { st.client.destroy(); } catch (e) { /* gone */ } }
        st.client = c;
        c.setEncoding('utf8');
        c.on('data', function (d) {
            buf += d;
            if (buf.length > 4096 && buf.indexOf('\n') < 0) { buf = ''; return; }
            let i;
            while ((i = buf.indexOf('\n')) >= 0) {
                let m = null;
                try { m = JSON.parse(buf.slice(0, i)); } catch (e) { m = null; }
                buf = buf.slice(i + 1);
                if (!m || typeof m.op !== 'string') continue;
                if (m.op === 'on') { log('on asked by ' + String(m.app || 'an app').slice(0, 24)); on(); }
                else if (m.op === 'off') off('asked');
                else if (m.op === 'status') state();
            }
        });
        c.on('error', function () { /* close follows */ });
        c.on('close', function () { if (st.client === c) { st.client = null; off('the app went away'); } });
        state();
    });
    const mask = process.umask(0o117);
    server.listen(SOCK, function () {
        process.umask(mask);
        try { fs.chownSync(SOCK, 0, SOCK_GID); fs.chmodSync(SOCK, 0o660); } catch (e) { log('socket group: ' + e.message); }
        log('g21-inputd ' + VERSION + ' listening on ' + SOCK);
    });
    const stop = function () {
        log('stopping');
        const end = function () { process.exit(0); };
        (st.on ? off('daemon stops') : Promise.resolve()).then(end, end);
        setTimeout(end, 4000);
    };
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
    process.on('uncaughtException', function (e) { log('fault: ' + (e && e.stack || e)); });
    process.on('unhandledRejection', function (e) { log('fault: ' + (e && e.stack || e)); });
    // a crash or a power-off may have left touch mode on: off once at start
    proxies().then(function () { return touchMode(false); }, function () {});
}

if (require.main === module) {
    if (process.argv[2] === '--check') {
        fs.accessSync(path.join(__dirname, 'someip_iface.js'));
        fs.accessSync(CATALOG);
        fs.accessSync(SOMEIP);
        console.log('g21-input ok');
        process.exit(0);
    }
    serve();
}
module.exports = { Pad: Pad, TAP_MS: TAP_MS, TAP_MOVE: TAP_MOVE };
