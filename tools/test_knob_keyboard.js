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

// letters start on q; the knob's tilt moves in the grid (up / down: the key under the same spot)
var nav = kb.createEdit({ mode: 'name', value: '' });
var at = function () { return nav.keys[nav.keyIndex]; };
assert.strictEqual(at(), 'q', 'starts on the first letter');
kb.moveKeyDir(nav, 'n'); assert.strictEqual(at(), '1', 'up from q: 1');
kb.moveKeyDir(nav, 's'); kb.moveKeyDir(nav, 's'); assert.strictEqual(at(), 'a', 'down from q: a');
kb.moveKeyDir(nav, 'w'); assert.strictEqual(at(), 'l', 'left from a wraps to l');
kb.moveKeyDir(nav, 'e'); assert.strictEqual(at(), 'a', 'right from l wraps to a');
nav.keyIndex = nav.keys.indexOf('m'); kb.moveKeyDir(nav, 's'); assert.strictEqual(at(), 'ó', 'down from m: ó');
kb.moveKeyDir(nav, 's'); assert.strictEqual(at(), 'DEL', 'down from ó: usuń');
kb.moveKeyDir(nav, 's'); assert.strictEqual(at(), '6', 'down from the last row wraps to the digits');
nav.keyIndex = nav.keys.indexOf('OK'); kb.moveKeyDir(nav, 'n'); assert.strictEqual(at(), 'ż', 'up from OK: ż');
var ipEdit = kb.createEdit({ mode: 'ip' });
kb.moveKeyDir(ipEdit, 's'); assert.ok(['DEL', 'OK', 'ANU', '.'].indexOf(ipEdit.keys[ipEdit.keyIndex]) >= 0, 'ip: down to the action row');

// the drawn keys: on the screen, none over another, as many as the keyboard has
var big = kb.createEdit({ mode: 'pass', value: '', title: 'Haslo' });
var lay = menu.buildKeyboardFrame(big, 1920, 720, 'Haslo').layout;
assert.strictEqual(lay.keys.length, big.keys.length);
lay.keys.forEach(function (k, i) {
    assert.ok(k.x >= 104 && k.x + k.w <= 1920 && k.y >= 88 && k.y + k.h <= 720, 'key ' + i + ' on screen');
    lay.keys.forEach(function (o, j) {
        if (j <= i) return;
        assert.ok(k.x + k.w <= o.x || o.x + o.w <= k.x || k.y + k.h <= o.y || o.y + o.h <= k.y, 'keys ' + i + ' and ' + j + ' apart');
    });
});
assert.ok(!lay.nav, 'no arrow bar under the keyboard (the keys are tapped, the knob tilts)');

// the menu hands the knob's tilt to the keyboard while it is up
var src = require('fs').readFileSync(require('path').join(__dirname, '..', 'apps', 'g21_airplay', 'src', 'menu_draw.js'), 'utf8');
assert.ok(/if \(tilted && edit\) \{[\s\S]{0,200}knobKeyboard\.moveKeyDir\(edit, tilt\)/.test(src), 'tilt moves on the keyboard');

console.log('test_knob_keyboard: ok');
