'use strict';

var assert = require('assert');
var fs = require('fs');
var http = require('http');
var os = require('os');
var path = require('path');
var storeFactory = require('../apps/g21_airplay/src/config_store.js');
var deskFactory = require('../apps/g21_airplay/src/desktop_settings.js');
var panelFactory = require('../apps/g21_airplay/src/config_panel.js');

var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g21-config-'));
var store = storeFactory.createConfigStore({ dir: dir });
var desk = deskFactory.createDesktopSettings(store.readSettings());
assert.strictEqual(deskFactory.parseIpv4('10.1.2.3').join('.'), '10.1.2.3');
assert.strictEqual(deskFactory.parseIpv4('10.1.2'), null);

var setHost = desk.setRdpHost('192.168.1.50');
assert.strictEqual(setHost.ok, true);
desk.setRdpUser('driver');
desk.setRdpPort(3390);
desk.setAirplayName('G21-RDP');
store.writeSettings(desk.snapshot());
store.writeSecret('rdp', 's3cret');
assert.strictEqual(store.hasSecret('rdp'), true);
assert.strictEqual(store.readSecret('rdp'), 's3cret');
assert.strictEqual(JSON.stringify(desk.snapshot()).indexOf('s3cret'), -1);
assert.strictEqual(JSON.stringify(desk.snapshot()).indexOf('password'), -1);

var panel = panelFactory.createConfigPanel({
    desk: desk,
    store: store,
    port: 0,
});
var applied = panel.applyRdp({
    host: '10.0.0.8',
    port: '3389',
    user: 'karol',
    password: 'new-pass',
    airplayName: 'G21',
});
assert.strictEqual(applied.ok, true);
assert.strictEqual(desk.host('rdp').octets.join('.'), '10.0.0.8');
assert.strictEqual(desk.host('rdp').user, 'karol');
assert.strictEqual(store.readSecret('rdp'), 'new-pass');
assert.strictEqual(panel.publicConfig().rdp.passwordSet, true);
assert.strictEqual(JSON.stringify(panel.publicConfig()).indexOf('new-pass'), -1);

var keep = panel.applyRdp({
    host: '10.0.0.9',
    port: '3389',
    user: 'karol',
    password: '',
    airplayName: 'G21',
});
assert.strictEqual(keep.ok, true);
assert.strictEqual(store.readSecret('rdp'), 'new-pass');

var server = http.createServer(function () {});
server.listen(0, '127.0.0.1', function () {
    var port = server.address().port;
    server.close(function () {
        var live = panelFactory.createConfigPanel({
            desk: desk,
            store: store,
            port: port,
        });
        live.start();
        http.get({ host: '127.0.0.1', port: port, path: '/api/config' }, function (res) {
            var raw = '';
            res.on('data', function (chunk) { raw += chunk; });
            res.on('end', function () {
                var body = JSON.parse(raw);
                assert.strictEqual(body.rdp.host, '10.0.0.9');
                assert.strictEqual(body.rdp.passwordSet, true);
                assert.strictEqual(Object.prototype.hasOwnProperty.call(body.rdp, 'password'), false);
                live.stop(function () {
                    console.log('test_config_panel: ok');
                });
            });
        }).on('error', function (err) {
            throw err;
        });
    });
});
