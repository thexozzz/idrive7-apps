'use strict';

var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var parked = require('../apps/g21_airplay/src/parked_gate.js');
var sessions = require('../apps/g21_airplay/src/session_manager.js');
var desktop = require('../apps/g21_airplay/src/desktop_sessions.js');
var settingsFactory = require('../apps/g21_airplay/src/desktop_settings.js');
var inputFactory = require('../apps/g21_airplay/src/input_manager.js');

var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g21-session-'));
var files = {
    allow: path.join(dir, 'allow'),
    name: path.join(dir, 'name'),
    target: path.join(dir, 'target'),
    secret: path.join(dir, 'secret'),
    cert: path.join(dir, 'cert'),
    desktopStatus: path.join(dir, 'desktop.status'),
};

var gate = parked.createParkedGate();
var vncCalls = { connect: 0, disconnect: 0 };
var manager = sessions.createSessionManager({
    gate: gate,
    sessions: {
        airplay: {
            connect: function () { return { ok: true, state: 'starting' }; },
            disconnect: function () { return { ok: true }; },
            getStatus: function () { return { state: 'starting' }; },
        },
        vnc: {
            connect: function () {
                vncCalls.connect += 1;
                return { ok: true, state: 'connected' };
            },
            disconnect: function () {
                vncCalls.disconnect += 1;
                return { ok: true };
            },
            getStatus: function () { return { state: 'connected' }; },
            sendMouseScroll: function (delta) { return { ok: true, delta: delta }; },
            sendMouseClick: function () { return { ok: true }; },
            sendMouseMove: function () { return { ok: true }; },
        },
        rdp: {
            connect: function () { return { ok: true, state: 'starting' }; },
            disconnect: function () { return { ok: true }; },
            getStatus: function () { return { state: 'starting' }; },
        },
    },
});

manager.connect('airplay', { name: 'G21' }).then(function (startedAir) {
    assert.strictEqual(startedAir.ok, true);
    assert.strictEqual(manager.active(), 'airplay');
    return manager.onVehicle();
}).then(function (kept) {
    assert.notStrictEqual(kept.stopped, true);
    assert.strictEqual(manager.active(), 'airplay');
    return manager.disconnect();
}).then(function () {
    return manager.connect('vnc', { host: '10.0.0.8' });
}).then(function (blocked) {
    assert.strictEqual(blocked.reason, 'speed-unknown');
    assert.strictEqual(vncCalls.connect, 0);
    gate.sample(10000);
    return manager.connect('vnc', { host: '10.0.0.8' });
}).then(function (moving) {
    assert.strictEqual(moving.reason, 'not-parked');
    gate.sample(0);
    return manager.connect('vnc', { host: '10.0.0.8' });
}).then(function (started) {
    assert.strictEqual(started.ok, true);
    assert.strictEqual(manager.active(), 'vnc');
    return manager.connect('rdp', { host: '10.0.0.9' });
}).then(function (switched) {
    assert.strictEqual(switched.ok, true);
    assert.strictEqual(vncCalls.disconnect, 1);
    assert.strictEqual(manager.active(), 'rdp');
    gate.sample(10000);
    return manager.onVehicle();
}).then(function (stopped) {
    assert.strictEqual(stopped.stopped, true);
    assert.strictEqual(manager.active(), null);
    var rdp = desktop.createRdpSession({
        paths: files,
        clientExists: function () { return false; },
    });
    var refused = rdp.connect({ host: '10.1.1.1', port: 3389, user: 'driver', password: 'not-in-files' });
    assert.strictEqual(refused.reason, 'rdp-client-missing');
    assert.strictEqual(fs.existsSync(files.secret), false);
    assert.strictEqual(fs.existsSync(files.target), false);
    fs.writeFileSync(files.desktopStatus, 'cert|aa:bb\n');
    var trusted = desktop.createRdpSession({
        paths: files,
        clientExists: function () { return true; },
        sendInput: function () { return { ok: true }; },
    });
    var again = trusted.connect({ host: '10.1.1.1', port: 3389, user: 'driver' });
    assert.strictEqual(again.ok, true);
    assert.strictEqual(fs.readFileSync(files.cert, 'utf8').indexOf('aa:bb'), 0);
    var desk = settingsFactory.createDesktopSettings({
        rdp: { octets: [10, 0, 0, 5], port: 3389, user: 'driver' },
        inspect: true,
    });
    assert.strictEqual(JSON.stringify(desk.snapshot()).indexOf('password'), -1);
    assert.strictEqual(desk.stepOctet('rdp', 1).octets[0], 11);
    assert.strictEqual(desk.formatRdpIp(), '11.0.0.5');
    assert.strictEqual(desk.setVncHost('192.168.1.20').ok, true);
    assert.strictEqual(desk.formatHostIp('vnc'), '192.168.1.20');
    desk.setRdpCert('aa:bb:cc');
    assert.strictEqual(desk.host('rdp').cert, 'aa:bb:cc');
    var seen = [];
    var input = inputFactory.createInputManager({
        settings: desk,
        session: {
            sendMouseMove: function (x, y) { seen.push(['move', x, y]); return { ok: true }; },
            sendMouseClick: function (button, down) { seen.push(['click', button, down]); return { ok: true }; },
            sendMouseScroll: function (delta) { seen.push(['scroll', delta]); return { ok: true }; },
        },
        logFile: path.join(dir, 'input.log'),
    });
    assert.strictEqual(input.modes().touchpad, 'unavailable');
    assert.strictEqual(input.feedPad({ statusSystemModeFrontSide: 0, touchCoordinatesX1FrontSide: 10, touchCoordinatesY1FrontSide: 10 }).reason, 'touchpad-unavailable');
    assert.strictEqual(seen.length, 0);
    assert.strictEqual(input.feedPad({ statusSystemModeFrontSide: 3, touchCoordinatesX1FrontSide: 20, touchCoordinatesY1FrontSide: 40 }).phase, 'down');
    input.feedPad({ statusSystemModeFrontSide: 3, touchCoordinatesX1FrontSide: 40, touchCoordinatesY1FrontSide: 40 });
    assert.strictEqual(input.modes().touchpad, 'available');
    assert.ok(seen.length > 0);
    assert.strictEqual(input.feedEncoder({ unrelated: true }).reason, 'encoder-unconfirmed');
    assert.strictEqual(input.feedScreen('down').reason, 'no-coordinates');
    console.log('test_session: ok');
}).catch(function (err) {
    console.error(err);
    process.exit(1);
});
