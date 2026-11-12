'use strict';

var settingsFactory = require('./settings_manager.js');
var parked = require('./parked_gate.js');

function movingOutput(name) {
    return name === 'cluster' || name === 'hud';
}

function createDisplayOutputManager(opts) {
    var settings = opts.settings;
    var outputs = opts.outputs;
    var gate = opts.gate || parked.createParkedGate();
    var log = opts.log || function () {};
    var active = settings.active();
    var playing = false;

    function available(name) {
        var output = outputs[name];
        if (!output) {
            return { ok: false, reason: 'unknown-output' };
        }
        var status = output.status();
        if (!status.available) {
            return { ok: false, reason: status.reason || 'unavailable' };
        }
        // Without a Vehicle2 sample this G21 never looks "parked", so Zegary/HUD
        // RDP picks used to no-op (not-parked). Only refuse once we know it moves.
        if (movingOutput(name) && gate.known() && gate.hudAllowed() !== true) {
            return { ok: false, reason: 'not-parked' };
        }
        return { ok: true };
    }

    function stopOutput(name) {
        if (outputs[name]) {
            outputs[name].stop();
        }
    }

    function select(name) {
        var check = available(name);
        if (!check.ok) {
            log('output-refused', name, check.reason);
            return check;
        }
        if (name === active && playing) {
            return { ok: true, active: active };
        }
        var previous = active;
        var prepared = outputs[name].prepare(settings.picture(name));
        if (!prepared.ok) {
            log('output-prepare-failed', name, prepared.reason);
            return prepared;
        }
        if (previous && previous !== name) {
            outputs[previous].stopFrames();
        }
        var started = outputs[name].start();
        if (!started.ok) {
            outputs[name].release();
            var restored = false;
            if (previous && outputs[previous]) {
                var back = outputs[previous].start();
                restored = !!back.ok;
                if (!restored) {
                    outputs[previous].release();
                    playing = false;
                    log('playback-stopped', previous, 'restore-failed');
                }
            }
            log('output-start-failed', name, started.reason);
            return { ok: false, reason: started.reason, restored: restored, stopped: !restored };
        }
        if (previous && previous !== name) {
            outputs[previous].release();
        }
        active = name;
        playing = true;
        settings.setActive(name);
        log('output-changed', name, '');
        return { ok: true, active: name };
    }

    function vehicle(raw) {
        if (raw === null) {
            gate = parked.createParkedGate();
        } else {
            gate.sample(raw);
        }
        if (movingOutput(active) && gate.known() && gate.hudAllowed() !== true) {
            var leaving = active;
            outputs[leaving].stopFrames();
            outputs[leaving].release();
            playing = false;
            active = 'central';
            settings.setActive('central');
            log('moving-image-off', leaving, 'driving');
            if (available('central').ok) {
                return select('central');
            }
            return { ok: false, reason: 'not-parked', stopped: true };
        }
        // Lost sample (null): drop cluster/HUD — no proof the car is still parked.
        if (movingOutput(active) && !gate.known()) {
            var dropped = active;
            outputs[dropped].stopFrames();
            outputs[dropped].release();
            playing = false;
            active = 'central';
            settings.setActive('central');
            log('moving-image-off', dropped, 'speed-unknown');
            if (available('central').ok) {
                return select('central');
            }
            return { ok: false, reason: 'speed-unknown', stopped: true };
        }
        return { ok: true, active: active, parked: gate.hudAllowed() === true };
    }

    function frame(buffer) {
        if (!playing || !outputs[active] || !outputs[active].frame) {
            return { ok: false, reason: 'not-playing' };
        }
        return outputs[active].frame(buffer, settings.picture(active));
    }

    return {
        active: function () { return active; },
        available: available,
        select: select,
        vehicle: vehicle,
        frame: frame,
        gate: function () { return gate; },
    };
}

module.exports = {
    createDisplayOutputManager: createDisplayOutputManager,
    LIMITS: settingsFactory.LIMITS,
};
