'use strict';

var assert = require('assert');
var kb = require('../apps/g21_airplay/src/knob_keyboard.js');
var menu = require('../apps/g21_airplay/src/menu_draw.js');

var edit = kb.createEdit({ mode: 'ip', value: '10.0.0.', field: 'rdp-ip' });
assert.strictEqual(edit.keys[0], '1');
assert.strictEqual(edit.rows[0].length, 10);
kb.applyKey(edit);
assert.strictEqual(edit.value, '10.0.0.1');
edit.keyIndex = edit.keys.indexOf('OK');
var done = kb.applyKey(edit);
assert.strictEqual(done.action, 'done');
assert.strictEqual(done.value, '10.0.0.1');
assert.strictEqual(kb.validate('ip', '10.0.0.1').ok, true);
assert.strictEqual(kb.validate('ip', '10.0.0').ok, false);
assert.strictEqual(kb.validate('port', '3389').ok, true);
assert.strictEqual(kb.validate('port', '0').ok, false);
assert.strictEqual(kb.validate('name', 'G21-Car').ok, true);
assert.strictEqual(kb.validate('name', '!!!').ok, false);

var pass = kb.createEdit({ mode: 'pass', value: 'ab' });
assert.strictEqual(kb.displayValue(pass), '**');
pass.keyIndex = pass.keys.indexOf('DEL');
kb.applyKey(pass);
assert.strictEqual(pass.value, 'a');
assert.strictEqual(kb.displayValue(pass), '*');

var frame = menu.buildKeyboardFrame(
    kb.createEdit({ mode: 'user', value: 'driver', title: 'Konto RDP' }),
    1920,
    720
);
assert.strictEqual(frame.frame.readUInt32LE(0), 7);
assert.ok(frame.rects > 20);

console.log('test_knob_keyboard: ok');
