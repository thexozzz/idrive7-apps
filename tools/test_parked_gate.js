'use strict';

var assert = require('assert');
var gate = require('../lib/parked-gate');

function fresh() {
    return gate.createParkedGate();
}

var unknown = fresh();
assert.strictEqual(unknown.known(), false);
assert.strictEqual(unknown.moving(), null);
assert.strictEqual(unknown.hudAllowed(), false);

var invalid = fresh();
invalid.sample(gate.INVALID_RAW);
assert.strictEqual(invalid.hudAllowed(), false);

var parked = fresh();
parked.sample(192);
assert.strictEqual(parked.speedKmh(), 3);
assert.strictEqual(parked.moving(), false);
assert.strictEqual(parked.hudAllowed(), true);

var moving = fresh();
moving.sample(193);
assert.ok(moving.speedKmh() > gate.MAX_KMH);
assert.strictEqual(moving.moving(), true);
assert.strictEqual(moving.hudAllowed(), false);

var back = fresh();
back.sample(193);
back.sample(0);
assert.strictEqual(back.hudAllowed(), true);

var quietAfterMove = fresh();
quietAfterMove.sample(1000);
quietAfterMove.sample(gate.INVALID_RAW);
assert.strictEqual(quietAfterMove.hudAllowed(), false);

var nan = fresh();
nan.sample(NaN);
assert.strictEqual(nan.hudAllowed(), false);

console.log('parked-gate: HUD stays off until a real sample at or below 3 km/h');
