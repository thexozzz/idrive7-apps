'use strict';

/*
 * Parked gate for anything that may appear on the HUD.
 *
 * The speed scale and the 3 km/h threshold are the values published in
 * cauliflowermossgrape/idrive7-apps kit/runtime/parked.js (commit 8681f50c8843):
 * statusCarSpeed2.speedVehicleCentreOfGravity, raw 65535 means invalid,
 * km/h = raw * 0.015625, moving when km/h > 3.
 *
 * This module is stricter than that file on one point, by policy of this
 * repository: until a real parked sample arrives, the HUD stays off. The
 * upstream helper treats a bench with no speed as parked so a game can run.
 * A missing sample is not evidence that this car is stationary.
 *
 * Node 8. Callers pass the raw number, not the SOME/IP object.
 */

var MAX_KMH = 3;
var SPEED_SCALE = 0.015625;
var INVALID_RAW = 65535;

function createParkedGate() {
    var speed = null;
    var seen = false;

    function sample(raw) {
        if (typeof raw !== 'number' || raw !== raw || raw === INVALID_RAW) {
            return;
        }
        seen = true;
        speed = raw * SPEED_SCALE;
    }

    function moving() {
        if (!seen || speed === null) {
            return null;
        }
        return speed > MAX_KMH;
    }

    return {
        MAX_KMH: MAX_KMH,
        SPEED_SCALE: SPEED_SCALE,
        INVALID_RAW: INVALID_RAW,
        sample: sample,
        speedKmh: function () { return speed; },
        known: function () { return seen; },
        moving: moving,
        hudAllowed: function () {
            return moving() === false;
        },
    };
}

module.exports = {
    MAX_KMH: MAX_KMH,
    SPEED_SCALE: SPEED_SCALE,
    INVALID_RAW: INVALID_RAW,
    createParkedGate: createParkedGate,
};
