'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var uplink = require('../apps/g21_airplay/src/uplink');
var mdns = require('../apps/g21_airplay/src/mdns');
var airplay = require('../apps/g21_airplay/src/airplay');

var wifi = {
    device: { kind: 'wifi', name: 'iPhone' },
    wifi: { link: 'online', ssid: 'iPhone', ip: '172.20.10.2' },
};
var lease = { interface: 'wlan1', ip: '172.20.10.2', prefix: 28, router: '172.20.10.1' };
var choice = uplink.selectStoreWifi(wifi, lease);
assert.strictEqual(choice.ok, true);
assert.strictEqual(choice.iface, 'wlan1');
assert.strictEqual(choice.ssid, 'iPhone');

assert.strictEqual(uplink.selectStoreWifi({ device: { kind: 'usb' }, wifi: { link: 'online' } }, lease).reason, 'uplink-not-wifi');
assert.strictEqual(uplink.selectStoreWifi({ device: { kind: 'wifi' }, wifi: { link: 'scanning' } }, lease).reason, 'wifi-down');
assert.strictEqual(uplink.selectStoreWifi(wifi, { interface: 'socnet0', ip: '10.0.0.2', prefix: 24 }).iface, 'socnet0');
assert.strictEqual(uplink.selectStoreWifi(wifi, { interface: 'wlan1;rm', ip: '172.20.10.2', prefix: 28 }).ok, false);

var packet = mdns.buildPacket({ name: 'G21', ip: '172.20.10.2', mac: '02:00:00:00:00:01', port: 7000 });
var text = packet.toString('latin1');
assert.ok(text.indexOf('_airplay') !== -1);
assert.ok(text.indexOf('_tcp') !== -1);
assert.ok(packet.indexOf(Buffer.from([172, 20, 10, 2])) !== -1);

var info = airplay.replyFor('GET /info HTTP/1.1\r\nHost: 172.20.10.2\r\n\r\n', '02:00:00:00:00:01');
assert.ok(info.raw.indexOf('text/x-apple-plist+xml') !== -1);
assert.ok(info.raw.indexOf('02:00:00:00:00:01') !== -1);
var setup = airplay.replyFor('SETUP rtsp://172.20.10.2/stream RTSP/1.0\r\nCSeq: 3\r\n\r\n', '02:00:00:00:00:01');
assert.strictEqual(setup.state, 'streaming');
assert.ok(setup.raw.indexOf('CSeq: 3') !== -1);

var receiver = uplink.readReceiverStatus('running|iPhone|172.20.10.2');
assert.strictEqual(receiver.mode, 'running');
assert.strictEqual(receiver.ssid, 'iPhone');
assert.strictEqual(receiver.ip, '172.20.10.2');

var script = fs.readFileSync(path.join(__dirname, '..', 'native', 'g21-airplay-open', 'g21-airplay-open'), 'utf8');
assert.ok(script.indexOf('-n G21') !== -1);
assert.ok(script.indexOf('-nh') !== -1);
assert.ok(script.indexOf('-vs waylandsink') !== -1);
assert.ok(script.indexOf('udp dport 5353 accept') !== -1);
assert.ok(script.indexOf('tcp dport 7100 accept') !== -1);
assert.ok(script.indexOf('tcp dport 7000 accept') !== -1);
assert.ok(script.indexOf('tcp dport 7001 accept') !== -1);
assert.ok(script.indexOf('udp dport 7011 accept') !== -1);
assert.ok(script.indexOf('socnet') === -1);

console.log('airplay: receiver binds only when MGU Store uplink is Wi-Fi');
