'use strict';

var fs = require('fs');

function createInputManager(opts) {
    var settings = opts.settings;
    var session = opts.session;
    var logFile = opts.logFile || '';
    var lines = [];
    var touchpadSeen = false;
    var encoderSeen = false;
    var screenSeen = false;
    var pad = null;
    var cursor = { x: 0, y: 0 };
    var downAt = 0;

    function remember(source, keys) {
        var line = source + ' ' + keys.join(',');
        lines.push(line);
        if (lines.length > 64) {
            lines.shift();
        }
        if (settings.inspect() && logFile) {
            try {
                fs.appendFileSync(logFile, line + '\n');
            } catch (err) {
                return;
            }
        }
    }

    function move(dx, dy) {
        var sense = settings.sensitivity();
        if (settings.invertX()) {
            dx = -dx;
        }
        if (settings.invertY()) {
            dy = -dy;
        }
        cursor.x += dx * sense;
        cursor.y += dy * sense;
        if (cursor.x < 0) {
            cursor.x = 0;
        }
        if (cursor.y < 0) {
            cursor.y = 0;
        }
        return session.sendMouseMove(Math.round(cursor.x), Math.round(cursor.y));
    }

    function leftButton() {
        return settings.swapButtons() ? 3 : 1;
    }

    function liftPad() {
        if (!pad) {
            return { ok: false, reason: 'touchpad-unavailable' };
        }
        var tap = pad.moved <= 12 && Date.now() - pad.at < 220;
        pad = null;
        if (!tap || !touchpadSeen) {
            return { ok: true, phase: 'up' };
        }
        var button = leftButton();
        session.sendMouseClick(button, true);
        session.sendMouseClick(button, false);
        return { ok: true, phase: 'tap' };
    }

    return {
        modes: function () {
            return {
                touchpad: touchpadSeen ? 'available' : 'unavailable',
                knob: 'available',
                encoder: encoderSeen ? 'available' : 'unconfirmed',
                screen: 'available',
                screenCursor: screenSeen ? 'available' : 'unavailable',
                auto: 'available',
            };
        },
        recent: function () { return lines.slice(); },
        feedPad: function (sample) {
            var keys = sample && typeof sample === 'object' ? Object.keys(sample) : [];
            remember('pad', keys);
            var mode = sample && sample.statusSystemModeFrontSide;
            var x = sample && sample.touchCoordinatesX1FrontSide;
            var y = sample && sample.touchCoordinatesY1FrontSide;
            if (mode !== 3 || typeof x !== 'number' || typeof y !== 'number') {
                return { ok: false, reason: 'touchpad-unavailable' };
            }
            if (x === 0 && y === 0) {
                return liftPad();
            }
            touchpadSeen = true;
            if (settings.inputMode() === 'knob' || settings.inputMode() === 'screen') {
                return { ok: false, reason: 'mode-off' };
            }
            if (!pad) {
                pad = { x: x, y: y, moved: 0, at: Date.now() };
                return { ok: true, phase: 'down' };
            }
            var dx = x - pad.x;
            var dy = pad.y - y;
            pad.x = x;
            pad.y = y;
            pad.moved += Math.abs(dx) + Math.abs(dy);
            if (pad.moved <= 12) {
                return { ok: true, phase: 'hold' };
            }
            return move(dx, dy);
        },
        feedPadUp: function () {
            return liftPad();
        },
        feedEncoder: function (sample) {
            if (typeof sample !== 'object' || sample === null) {
                remember('encoder', [typeof sample]);
                return { ok: false, reason: 'encoder-unconfirmed' };
            }
            remember('encoder', Object.keys(sample));
            if (typeof sample.delta !== 'number') {
                return { ok: false, reason: 'encoder-unconfirmed' };
            }
            encoderSeen = true;
            if (settings.inputMode() === 'touchpad' || settings.inputMode() === 'screen') {
                return { ok: false, reason: 'mode-off' };
            }
            return session.sendMouseScroll(sample.delta * settings.scrollStep());
        },
        feedScreen: function (phase, x, y) {
            if (typeof x !== 'number' || typeof y !== 'number') {
                remember('screen', []);
                return { ok: false, reason: 'no-coordinates' };
            }
            remember('screen', ['x', 'y', phase]);
            screenSeen = true;
            if (settings.inputMode() === 'knob' || settings.inputMode() === 'touchpad') {
                return { ok: false, reason: 'mode-off' };
            }
            cursor.x = x;
            cursor.y = y;
            session.sendMouseMove(Math.round(x), Math.round(y));
            if (phase === 'down') {
                downAt = Date.now();
                return { ok: true, phase: 'down' };
            }
            if (phase === 'up') {
                var button = leftButton();
                if (Date.now() - downAt < 400) {
                    session.sendMouseClick(button, true);
                    session.sendMouseClick(button, false);
                }
                return { ok: true, phase: 'up' };
            }
            return { ok: true, phase: phase };
        },
        knobScroll: function (delta) {
            if (settings.inputMode() === 'touchpad') {
                return { ok: false, reason: 'mode-off' };
            }
            return session.sendMouseScroll(delta * settings.scrollStep());
        },
        knobClick: function () {
            var button = leftButton();
            session.sendMouseClick(button, true);
            return session.sendMouseClick(button, false);
        },
    };
}

module.exports = {
    createInputManager: createInputManager,
};
