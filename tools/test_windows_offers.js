'use strict';

var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var offers = require('../apps/g21_airplay/src/windows_offers.js');
var script = fs.readFileSync(path.join(__dirname, '..', 'native', 'g21-airplay-open', 'g21-airplay-open'), 'utf8');

assert.ok(script.indexOf('container_id=') !== -1);
assert.ok(script.indexOf('VerMgmt=0x0202') === -1);
assert.ok(script.indexOf('mice_container_id') !== -1);

var parsed = offers.parseOffers('d1|10.0.0.8|Laptop|7236\nd2|10.0.0.9|PC|\n\nbad\n');
assert.strictEqual(parsed.length, 2);
assert.strictEqual(parsed[0].id, 'd1');
assert.strictEqual(parsed[0].name, 'Laptop');
assert.strictEqual(parsed[1].ip, '10.0.0.9');

var items = offers.menuItems(parsed);
assert.strictEqual(items[0].name, 'win-d-d1');
assert.strictEqual(items[items.length - 1].name, 'win-d-back');
assert.strictEqual(items[0].icon, 'desktop');

var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g21-offers-'));
var file = path.join(dir, 'accept');
assert.strictEqual(offers.writeAccept(file, 'd1').ok, true);
assert.strictEqual(fs.readFileSync(file, 'utf8').indexOf('d1'), 0);

console.log('test_windows_offers: ok');
