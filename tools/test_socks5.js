'use strict';

var assert = require('assert');
var socks5 = require('../apps/g21_airplay/src/socks5');

assert.strictEqual(socks5.isTailscaleHost('100.89.166.19'), true);
assert.strictEqual(socks5.isTailscaleHost('100.64.0.1'), true);
assert.strictEqual(socks5.isTailscaleHost('100.63.0.1'), false);
assert.strictEqual(socks5.isTailscaleHost('172.20.10.1'), false);
assert.strictEqual(socks5.isTailscaleHost('desktop'), false);

process.env.G21_SOCKS5_PORT = '1055';
process.env.G21_SOCKS5_HOST = '127.0.0.2';
assert.deepStrictEqual(socks5.readSocks5(), { host: '127.0.0.2', port: 1055 });
assert.strictEqual(socks5.shouldProxy('100.89.166.19'), true);
assert.strictEqual(socks5.shouldProxy('172.20.10.5'), false);
delete process.env.G21_SOCKS5_PORT;
delete process.env.G21_SOCKS5_HOST;

var script = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'native', 'g21-airplay-open', 'g21-airplay-open'),
    'utf8'
);
assert.ok(script.indexOf('ensure_tailscale_socks5') !== -1);
assert.ok(script.indexOf('iteriodev-tailscale.service') !== -1);
assert.ok(script.indexOf('socks5-port') !== -1);

var rdp = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'native', 'g21-airplay-open', 'g21-rdp.c'),
    'utf8'
);
assert.ok(rdp.indexOf('apply_tailscale_socks5') !== -1);
assert.ok(rdp.indexOf('PROXY_TYPE_SOCKS') !== -1);

console.log('test_socks5: ok');
