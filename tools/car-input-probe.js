// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * For the owner to run on the car, parked: the pace of another SmartX sound input (silence only, 6 s).
 * G21 Audio writes into the CarLife input (source 287), which takes 48000 frames a second or only 36000, by
 * chance, at every connection. BMW's configuration (SmartXMGU.bin) gives that input a latency as for 24 kHz
 * (128 ms); the Android Auto and CarPlay inputs have 64 ms. This asks whether the Android Auto media input
 * (source 273, not used with an iPhone) takes the full pace every time: it connects that source to the front
 * speakers, lets g21-audio-out measure five times, and takes the connection away again. Nothing is kept.
 *
 * From the PC (PowerShell), in the repository's folder:
 *   Get-Content tools\car-input-probe.js | ssh -i ssh\id_rsa root@100.125.63.29 /usr/bin/node
 * Stop AirPlay and the browser's film first: while a stream plays the result says nothing.
 */
'use strict';
var fs = require('fs'), path = require('path'), cp = require('child_process');
var SRC = '/usr/lib/oap-mainapp/src-gen';
var SOURCE = Number(process.env.SOURCE) || 273, DEVICE = process.env.DEVICE || 'plug:smartx:AndroidAutoMedia_CF_48_STEREO', ROUNDS = 5;
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
async function main() {
    var someip = require('/usr/lib/someip.node');
    var cc = await someip.buildProxy(JSON.parse(fs.readFileSync(path.join(SRC, 'org_genivi_am_commandinterface_CommandControl.json'), 'utf8')), '1');
    await cc.init();
    var end = Date.now() + 8000;
    while (!(await cc.isAvailable())) { if (Date.now() > end) throw new Error('audio manager not available'); await sleep(100); }
    var list = async function () { var l = await cc.getValue('listOfMainConnections'); return l || []; };
    var show = function (l) { return l.map(function (c) { return c.sourceID + '>' + c.sinkID + ':' + String(c.connectionState).replace('CS_', ''); }).join(' '); };
    var before = await list();
    var was = before.filter(function (c) { return c.sinkID === 1024; })[0];
    console.log('before: ' + show(before));
    for (var i = 1; i <= ROUNDS; i++) {
        var r = await cc.callMethod('connect', { sourceID: SOURCE, sinkID: 1024 }, 5000).catch(function (e) { return { err: String(e) }; });
        if (!r || r.err || (r.amError !== 'E_OK' && r.amError !== 'E_ALREADY_EXISTS')) { console.log('round ' + i + ': connect refused: ' + JSON.stringify(r)); break; }
        await sleep(1200);
        var out = cp.spawnSync('/var/opt/g21-audio/current/g21-audio-out', ['probe', DEVICE, 'block1024'], { encoding: 'utf8', timeout: 15000 });
        console.log('round ' + i + ': ' + (String(out.stderr || '').trim().split('\n').pop() || '').replace('[G21-AUDIO] out: ', '') + (out.error ? ' ' + out.error.message : ''));
        var mine = (await list()).filter(function (c) { return c.sourceID === SOURCE && c.sinkID === 1024; })[0];
        if (mine) await cc.callMethod('disconnect', { mainConnectionID: mine.mainConnectionID }, 5000).catch(function () {});
        await sleep(1500);
    }
    // what played before gets the speakers back
    if (was && was.sourceID !== SOURCE) await cc.callMethod('connect', { sourceID: was.sourceID, sinkID: 1024 }, 5000).catch(function () {});
    await sleep(800);
    console.log('after: ' + show(await list()));
    console.log('48000 a second in every round: this input is the way. 36000 in some: no better than CarLife.');
}
main().then(function () { process.exit(0); }, function (e) { console.log('failed: ' + (e && e.message || e)); process.exit(1); });
