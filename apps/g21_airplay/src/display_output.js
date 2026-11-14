'use strict';

var settingsFactory = require('./settings_manager.js');
var parked = require('./parked_gate.js');

function createDisplayOutputManager(opts) {
    var settings = opts.settings;
    var outputs = opts.outputs;
    var gate = opts.gate || parked.createParkedGate();
    var log = opts.log || function () {};
    var active = settings.active();
    var playing = {};

    function available(name) {
        var output = outputs[name];
        if (!output) {
            return { ok: false, reason: 'unknown-output' };
        }
        var status = output.status();
        if (!status.available) {
            return { ok: false, reason: status.reason || 'unavailable' };
        }
        return { ok: true };
    }

    function stopOutput(name) {
        if (outputs[name]) {
            outputs[name].stop();
        }
    }

    function dropOutput(name, why) {
        if (!playing[name] || !outputs[name]) {
            return;
        }
        outputs[name].stopFrames();
        outputs[name].release();
        delete playing[name];
        log('output-off', name, why || '');
    }

    function startOne(name) {
        var prepared;
        var started;
        if (playing[name]) {
            return { ok: true, active: name };
        }
        prepared = outputs[name].prepare(settings.picture(name));
        if (!prepared.ok) {
            log('output-prepare-failed', name, prepared.reason);
            return prepared;
        }
        started = outputs[name].start();
        if (!started.ok) {
            outputs[name].release();
            log('output-start-failed', name, started.reason);
            return started;
        }
        playing[name] = true;
        log('output-changed', name, '');
        return { ok: true, active: name };
    }

    function select(name) {
        var check = available(name);
        var previous;
        var result;
        if (!check.ok) {
            log('output-refused', name, check.reason);
            return check;
        }
        previous = Object.keys(playing);
        result = selectMany([name]);
        if (!result.ok && previous.length) {
            selectMany(previous);
            result.restored = true;
        }
        return result;
    }

    function selectMany(names) {
        var want = {};
        var failed = [];
        var list = [];
        var i;
        var name;
        var check;
        for (i = 0; i < names.length; i += 1) {
            name = names[i];
            check = available(name);
            if (!check.ok) {
                failed.push(name);
                log('output-refused', name, check.reason);
                continue;
            }
            want[name] = true;
        }
        Object.keys(playing).forEach(function (live) {
            if (!want[live]) {
                dropOutput(live, 'unselected');
            }
        });
        Object.keys(want).forEach(function (live) {
            var started = startOne(live);
            if (!started.ok) {
                failed.push(live);
            }
        });
        list = Object.keys(playing);
        active = list[0] || 'central';
        settings.setActive(active);
        settings.setOutputs(names);
        return {
            ok: list.length > 0,
            active: active,
            outputs: list,
            failed: failed
        };
    }

    function vehicle(raw) {
        if (raw === null) {
            gate = parked.createParkedGate();
        } else {
            gate.sample(raw);
        }
        return { ok: true, active: active, parked: true };
    }

    function frame(payload) {
        var out = {};
        if (Buffer.isBuffer(payload)) {
            if (!playing[active] || !outputs[active] || !outputs[active].frame) {
                return { ok: false, reason: 'not-playing' };
            }
            return outputs[active].frame(payload, settings.picture(active));
        }
        Object.keys(payload || {}).forEach(function (name) {
            if (playing[name] && outputs[name] && outputs[name].frame) {
                out[name] = outputs[name].frame(payload[name], settings.picture(name));
            }
        });
        return out;
    }

    return {
        active: function () { return active; },
        playing: function () { return Object.keys(playing); },
        available: available,
        select: select,
        selectMany: selectMany,
        vehicle: vehicle,
        frame: frame,
        gate: function () { return gate; },
    };
}

module.exports = {
    createDisplayOutputManager: createDisplayOutputManager,
    LIMITS: settingsFactory.LIMITS,
};
