'use strict';
// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * The car's signals for an app from Sklep, end to end without a car: an app folder, the daemon's apps server, the
 * daemon's relay and g21-car.js, with a small catalog and a stand-in for /usr/lib/someip.node. What is checked is
 * the road and its gates (only the app itself, only what it declares, nothing that names a person or a place, the
 * owner's switch), not SOME/IP itself.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'g21car-'));
const catalog = path.join(base, 'catalog.json');
const fake = path.join(base, 'fake-someip.js');
fs.writeFileSync(catalog, JSON.stringify({
    datatypes: {},
    interfaces: {
        'de.bmw.test.Vehicle2': { name: 'Vehicle2', serviceId: 1, version: 1, fields: {
            statusCarSpeed2: { dataRef: 'UInt16', getter: { id: 8 } },
            vehicleIdentificationNumber: { dataRef: 'Utf8', getter: { id: 9 } },
            writeOnly: { dataRef: 'UInt8', setter: { id: 10 } } } },
        'de.bmw.test.Climate': { name: 'Climate', serviceId: 2, version: 1, fields: { temperature: { dataRef: 'UInt8', getter: { id: 1 } } } },
        'de.bmw.test.Navigation': { name: 'Navigation', serviceId: 3, version: 1, fields: { currentPosition: { dataRef: 'UInt8', getter: { id: 1 } } } }
    }
}));
fs.writeFileSync(fake, "'use strict';\nmodule.exports = { buildProxy: function (cfg) { return Promise.resolve({ init: function () { return Promise.resolve(); }, subscribeToAvailability: function () {},\n"
    + "    getValue: function (name) { return Promise.resolve(name === 'statusCarSpeed2' ? { speedVehicleCentreOfGravity: 3200 } : { of: cfg.name, field: name }); },\n"
    + "    setValue: function () { throw new Error('a write reached the car'); } }); } };\n");
process.env.G21_CAR_CATALOG = catalog;
process.env.G21_CAR_SOMEIP = fake;
process.env.G21_BROWSER_CAR_NODE = process.execPath;

const d = require('../native/g21-browser/g21-browserd.js');
const carMod = require('../native/g21-browser/g21-car.js');

function get(port, p, headers) {
    return new Promise((resolve, reject) => {
        http.get({ host: '127.0.0.1', port: port, path: p, headers: headers || {} }, (r) => { let b = ''; r.setEncoding('utf8'); r.on('data', (c) => { b += c; }); r.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) { j = null; } resolve({ code: r.statusCode, json: j, body: b }); }); }).on('error', reject);
    });
}

(async function () {
    assert.ok(carMod.denied('de.bmw.x.Vehicle2', 'vehicleIdentificationNumber') && carMod.denied('a.Navigation', 'currentPosition') && !carMod.denied('a.Vehicle2', 'statusCarSpeed2'));
    const daemon = new d.Daemon({ noSetuid: true, testUid: null, cacheDir: path.join(base, 'cache'), stateDir: path.join(base, 'state'), logDir: path.join(base, 'log'),
        runDir: path.join(base, 'run'), appsDir: path.join(base, 'apps'), policyFile: path.join(base, 'state', 'policy.json') });
    const logs = [];
    daemon.log = (m) => logs.push(m);
    try {
        // two apps on the disk: one declares signals, one declares none
        [['all', ['*']], ['speed', ['de.bmw.test.Vehicle2.statusCarSpeed2']], ['none', []]].forEach((a) => {
            fs.mkdirSync(path.join(base, 'apps', a[0]), { recursive: true });
            fs.writeFileSync(path.join(base, 'apps', a[0], 'index.html'), '<!doctype html><title>' + a[0] + '</title>');
        });
        daemon.saveApps([{ id: 'all', name: 'All', repo: 'x/all', start: '', mouse: 'no', car: ['*'] }, { id: 'speed', name: 'Speed', repo: 'x/speed', start: '', mouse: 'no', car: ['de.bmw.test.Vehicle2.statusCarSpeed2'] },
            { id: 'none', name: 'None', repo: 'x/none', start: '', mouse: 'no', car: [] }]);
        const url = await daemon.appUrl('all');
        const port = Number(/:(\d+)\//.exec(url)[1]);
        const from = (app) => ({ Referer: 'http://127.0.0.1:' + port + '/' + app + '/index.html' });

        let r = await get(port, '/_car/all/list', from('all'));
        assert.strictEqual(r.code, 200);
        assert.deepStrictEqual(r.json, { ok: true, ifaces: { 'de.bmw.test.Climate': ['temperature'], 'de.bmw.test.Vehicle2': ['statusCarSpeed2'] } }, 'readable fields only: no VIN, no position, no write-only field');
        r = await get(port, '/_car/all/get?i=de.bmw.test.Vehicle2&n=statusCarSpeed2', from('all'));
        assert.deepStrictEqual(r.json, { ok: true, value: { speedVehicleCentreOfGravity: 3200 } });
        r = await get(port, '/_car/all/get?i=de.bmw.test.Vehicle2&n=vehicleIdentificationNumber', from('all'));
        assert.ok(r.code !== 200 && r.json && r.json.ok === false, 'the VIN is not given out, even to an app that declares "*"');
        r = await get(port, '/_car/all/get?i=de.bmw.test.Vehicle2&n=writeOnly', from('all'));
        assert.ok(r.json && r.json.ok === false, 'a field without a getter is not read');

        r = await get(port, '/_car/speed/get?i=de.bmw.test.Vehicle2&n=statusCarSpeed2', from('speed'));
        assert.strictEqual(r.json.ok, true, 'a declared signal');
        r = await get(port, '/_car/speed/get?i=de.bmw.test.Climate&n=temperature', from('speed'));
        assert.ok(r.code === 403 && r.json.ok === false, 'a signal the app did not declare');
        r = await get(port, '/_car/speed/list', from('speed'));
        assert.deepStrictEqual(r.json.ifaces, { 'de.bmw.test.Vehicle2': ['statusCarSpeed2'] }, 'the list is what the app declared');
        r = await get(port, '/_car/none/list', from('none'));
        assert.strictEqual(r.code, 403, 'an app that declares nothing reads nothing');

        r = await get(port, '/_car/all/list', from('speed'));
        assert.strictEqual(r.code, 403, 'an app cannot ask as another app');
        r = await get(port, '/_car/all/list', {});
        assert.strictEqual(r.code, 403, 'no page of the app: refused');
        r = await get(port, '/_car/all/list', Object.assign({ Host: 'evil.example:' + port }, from('all')));
        assert.strictEqual(r.code, 403, 'another name that points at this server: refused');

        // the owner's switch
        fs.mkdirSync(path.join(base, 'state'), { recursive: true });
        fs.writeFileSync(path.join(base, 'state', 'policy.json'), JSON.stringify({ carData: 'off' }));
        daemon.loadPolicy();
        r = await get(port, '/_car/all/get?i=de.bmw.test.Vehicle2&n=statusCarSpeed2', from('all'));
        assert.strictEqual(r.code, 403, 'carData off: nothing is read');
        // the files of the apps are still served
        r = await get(port, '/all/index.html', {});
        assert.ok(r.code === 200 && /<title>all<\/title>/.test(r.body));
        console.log('test_car_bridge: ok');
    } catch (e) {
        console.log(logs.join('\n'));
        throw e;
    } finally {
        if (daemon.appsProc) { try { daemon.appsProc.kill(); } catch (e) { /* gone */ } }
        if (daemon.carProc) { try { daemon.carProc.kill(); } catch (e) { /* gone */ } }
        try { fs.rmSync(base, { recursive: true, force: true }); } catch (e) { /* a busy file on Windows */ }
    }
}()).then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
