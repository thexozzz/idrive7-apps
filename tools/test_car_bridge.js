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
        'com.harman.infotainment.systemfunctions.tasu.tasu.InternalTasu': { name: 'InternalTasu', serviceId: 9, version: 1,
            methods: { sendTasuRequest: { methodId: 1, inputs: [], outputs: [] } }, events: { sendTasuResponse: { eventId: 2, outputs: [] } } },
        'de.bmw.test.Navigation': { name: 'Navigation', serviceId: 3, version: 1, fields: { currentPosition: { dataRef: 'UInt8', getter: { id: 1 } } } }
    }
}));
// the stand-in for someip.node: fields answer; the diagnostic transport answers a read of unit 0x12 and refuses
// one of unit 0x18 ("not supported"); anything that is not a read service throws
fs.writeFileSync(fake, String.raw`'use strict';
module.exports = { buildProxy: function (cfg) {
    var onFrame = null;
    return Promise.resolve({
        init: function () { return Promise.resolve(); },
        subscribeToAvailability: function () {},
        isAvailable: function () { return true; },
        subscribe: function (o) { if (o.name === 'sendTasuResponse') { onFrame = o.onReceive; } return Promise.resolve(); },
        getValue: function (name) { return Promise.resolve(name === 'statusCarSpeed2' ? { speedVehicleCentreOfGravity: 3200 } : { of: cfg.name, field: name }); },
        setValue: function () { throw new Error('a write reached the car'); },
        callMethod: function (name, a) {
            if (name !== 'sendTasuRequest' || (a.serviceID !== 0x22 && a.serviceID !== 0x01) || a.targetAddress === 0xDF) { throw new Error('something other than a read reached the car'); }
            var id = Array.prototype.slice.call(a.udsData);
            var uds = a.targetAddress === 0x12 ? [a.serviceID + 0x40].concat(id, [0x5A, 0x01]) : [0x7F, a.serviceID, 0x31];
            setTimeout(function () { if (onFrame) { onFrame({ udsResponse: [0, 0, 0, 0, 0, 0, a.targetAddress, 0, 0].concat(uds) }); } }, 20);
            return Promise.resolve({ TasuErrorEnum: 'NO_ERROR' });
        }
    });
} };
`);
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
        daemon.saveApps([{ id: 'all', name: 'All', repo: 'x/all', start: '', mouse: 'no', car: ['*'], uds: ['12'] }, { id: 'speed', name: 'Speed', repo: 'x/speed', start: '', mouse: 'no', car: ['de.bmw.test.Vehicle2.statusCarSpeed2'] },
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

        // diagnostic reads of a control unit: only read services, only a unit the app declares
        r = await get(port, '/_car/all/uds?e=12&s=01&d=05', from('all'));
        assert.deepStrictEqual(r.json, { ok: true, data: '5A01' }, 'OBD current data of the engine unit');
        r = await get(port, '/_car/all/uds?e=12&s=22&d=4300', from('all'));
        assert.deepStrictEqual(r.json, { ok: true, data: '5A01' }, 'ReadDataByIdentifier');
        r = await get(port, '/_car/all/uds?e=18&s=22&d=4300', from('all'));
        assert.ok(r.code === 403 && r.json.ok === false, 'a unit the app did not declare');
        r = await get(port, '/_car/all/uds?e=12&s=2E&d=4300', from('all'));
        assert.ok(r.code === 400 && r.json.ok === false, 'a write service is not even passed on');
        r = await get(port, '/_car/all/uds?e=12&s=22&d=F190', from('all'));
        assert.ok(r.json.ok === false && /VIN/.test(r.json.err), 'the VIN is not read');
        r = await get(port, '/_car/speed/uds?e=12&s=01&d=05', from('speed'));
        assert.strictEqual(r.code, 403, 'an app that declares no unit asks none');
        assert.strictEqual(carMod.udsCheck(0xDF, 0x22, 0x4300), 'bad control unit address', 'never all units at once');
        [0x10, 0x11, 0x14, 0x19, 0x27, 0x2E, 0x2F, 0x31, 0x3E].forEach(function (sid) { assert.strictEqual(typeof carMod.udsCheck(0x12, sid, 1), 'string', 'service ' + sid.toString(16) + ' is refused'); });
        fs.mkdirSync(path.join(base, 'state'), { recursive: true });
        fs.writeFileSync(path.join(base, 'state', 'policy.json'), JSON.stringify({ carDiag: 'off' }));
        daemon.loadPolicy();
        r = await get(port, '/_car/all/uds?e=12&s=01&d=05', from('all'));
        assert.strictEqual(r.code, 403, 'carDiag off: no unit is asked');
        r = await get(port, '/_car/all/get?i=de.bmw.test.Vehicle2&n=statusCarSpeed2', from('all'));
        assert.strictEqual(r.json.ok, true, 'and the signals the car sends are still read');
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
