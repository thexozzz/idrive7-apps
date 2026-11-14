'use strict';
// SPDX-License-Identifier: GPL-3.0-or-later
// g21-audio-route: routes the AirPlay sound to the cabin speakers through BMW's audio manager.
//
// Why: UxPlay plays into a SmartX ALSA device (smartx:NAME = /run/smartx/smartx_NAME_CF_48_STEREO_p).
// A SmartX device only reaches the speakers while the audio manager has a main connection from its
// source to a sink. RideTube gets its sound the same way (jap-ridetube-d: CommandControl.connect,
// then disconnect on stop). Car findings 2026-11-14 (UxPlay log, /run/smartx):
//   - smartx:CarPlayMain is held by BMW's own carplay daemon (its .lock), so UxPlay got
//     "GStreamer error (audio): alsasink0 Could not open audio device for playback" and no sound;
//   - /usr/share/audiomanager/DOMAIN_MGU.bin names the sources: CarLifeMedia 287,
//     AndroidAutoMedia 273 (CarPlayMedia 266), each a 48 kHz stereo SmartX device that nothing
//     holds while no CarLife / Android Auto phone plays.
// Sink 1024 is the one RideTube connects to (its sound comes from the front speakers).
//
// Usage (root, /usr/bin/node, as the tool runs it):
//   node g21-audio-route.js connect     -> prints the SmartX device name to use (last line of stdout)
//   node g21-audio-route.js disconnect  -> drops the connection this helper made
//   node g21-audio-route.js list        -> logs the audio manager's main connections (read only)
// Override (one line "SOURCE SINK DEVICE", e.g. "287 1024 CarLifeMedia"): /run/g21-session/airplay-audio
// Nothing is ever changed except the one main connection made here; disconnect removes only that one.

const fs = require('fs');
const path = require('path');

const SOMEIP = process.env.G21_AUDIO_SOMEIP || '/usr/lib/someip.node';
const SRCGEN = process.env.G21_AUDIO_SRCGEN || '/usr/lib/oap-mainapp/src-gen';
const STATE = process.env.G21_AUDIO_STATE || '/run/g21-airplay/audio-route';
const OVERRIDE = process.env.G21_AUDIO_OVERRIDE || '/run/g21-session/airplay-audio';
const SMARTX = process.env.G21_AUDIO_SMARTX || '/run/smartx';
const SINK_ID = 1024;
const CANDIDATES = [
    { source: 287, device: 'CarLifeMedia' },
    { source: 273, device: 'AndroidAutoMedia' },
];
const HARD_CAP_MS = 14000;

function log(m) { process.stderr.write(new Date().toISOString() + ' g21-audio-route ' + m + '\n'); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function readOverride() {
    let t;
    try { t = fs.readFileSync(OVERRIDE, 'utf8').trim(); } catch (e) { return null; }
    const m = /^(\d+)\s+(\d+)\s+([A-Za-z0-9_]+)$/.exec(t);
    if (!m) { log('override ignored: ' + JSON.stringify(t)); return null; }
    return { source: +m[1], sink: +m[2], device: m[3] };
}

// The SmartX pipe of a device and whether someone else holds it (its .lock file).
function deviceFree(name) {
    let names;
    try { names = fs.readdirSync(SMARTX); } catch (e) { return { ok: false, why: 'no ' + SMARTX }; }
    const pipe = names.find((n) => n.indexOf('smartx_' + name + '_CF_48_STEREO_p') === 0 && !/\.lock$/.test(n));
    if (!pipe) return { ok: false, why: 'no pipe for ' + name };
    if (names.indexOf(pipe + '.lock') >= 0) return { ok: false, why: name + ' held (' + pipe + '.lock)' };
    return { ok: true };
}

async function proxy() {
    const someip = require(SOMEIP);
    const cfg = JSON.parse(fs.readFileSync(path.join(SRCGEN, 'org_genivi_am_commandinterface_CommandControl.json'), 'utf8'));
    const cc = await someip.buildProxy(cfg, '1');
    await cc.init();
    const end = Date.now() + 8000;
    while (!(await cc.isAvailable())) {
        if (Date.now() > end) throw new Error('CommandControl not available');
        await sleep(100);
    }
    return cc;
}

function readState() {
    try {
        const p = fs.readFileSync(STATE, 'utf8').trim().split(/\s+/);
        if (p.length >= 3) return { conn: +p[0], source: +p[1], device: p[2] };
    } catch (e) { /* none */ }
    return null;
}

async function connect() {
    const cc = await proxy();
    const list = CANDIDATES.slice();
    const o = readOverride();
    if (o) list.unshift(o);
    for (const c of list) {
        const free = deviceFree(c.device);
        if (!free.ok) { log('skip ' + c.device + ': ' + free.why); continue; }
        const sink = c.sink || SINK_ID;
        let r;
        try { r = await cc.callMethod('connect', { sourceID: c.source, sinkID: sink }, 5000); } catch (e) { r = { amError: String(e) }; }
        log('connect ' + c.source + '->' + sink + ' (' + c.device + ') ' + JSON.stringify(r));
        if (r && (r.amError === 'E_OK' || r.amError === 'E_ALREADY_EXISTS')) {
            let id = r.mainConnectionID;
            if (id === undefined || id === null) id = -1;
            fs.writeFileSync(STATE, id + ' ' + c.source + ' ' + c.device + '\n');
            process.stdout.write(c.device + '\n');
            return 0;
        }
    }
    log('no route: AirPlay sound stays off');
    return 1;
}

async function disconnect() {
    const st = readState();
    if (!st) return 0;
    const cc = await proxy();
    let ids = [];
    if (st.conn >= 0) ids.push(st.conn);
    else {
        // id unknown: our source's connections only (never another source's)
        const all = await cc.getValue('listOfMainConnections');
        ids = (Array.isArray(all) ? all : []).filter((c) => c && c.sourceID === st.source).map((c) => c.mainConnectionID);
    }
    for (const id of ids) {
        let r;
        try { r = await cc.callMethod('disconnect', { mainConnectionID: id }, 5000); } catch (e) { r = String(e); }
        log('disconnect ' + id + ' (' + st.device + ') ' + JSON.stringify(r));
    }
    try { fs.unlinkSync(STATE); } catch (e) { /* gone */ }
    return 0;
}

async function list() {
    const cc = await proxy();
    log('listOfMainConnections ' + JSON.stringify(await cc.getValue('listOfMainConnections')));
    return 0;
}

const cmd = process.argv[2];
const run = { connect: connect, disconnect: disconnect, list: list }[cmd];
if (!run) { log('usage: connect | disconnect | list'); process.exit(2); }
setTimeout(() => { log(cmd + ': timed out'); process.exit(3); }, HARD_CAP_MS).unref();
run().then((code) => process.exit(code), (e) => { log(cmd + ' failed: ' + (e && e.message || e)); process.exit(1); });
