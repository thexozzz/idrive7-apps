'use strict';

function createSessionManager(opts) {
    var gate = opts.gate;
    var sessions = opts.sessions;
    var active = null;
    var target = null;

    function gateCheck() {
        if (!gate.known()) {
            return { ok: false, reason: 'speed-unknown' };
        }
        if (gate.hudAllowed() !== true) {
            return { ok: false, reason: 'not-parked' };
        }
        return { ok: true };
    }

    function disconnect() {
        var name = active;
        var session = name && sessions[name];
        active = null;
        if (!session || typeof session.disconnect !== 'function') {
            return Promise.resolve({ ok: true, state: 'idle' });
        }
        return Promise.resolve(session.disconnect()).then(function () {
            return { ok: true, state: 'idle', protocol: name };
        }, function () {
            return { ok: true, state: 'idle', protocol: name };
        });
    }

    function connect(name, nextTarget) {
        if (name !== 'airplay') {
            var check = gateCheck();
            if (!check.ok) {
                return Promise.resolve(check);
            }
        }
        if (!sessions[name] || typeof sessions[name].connect !== 'function') {
            return Promise.resolve({ ok: false, reason: 'unknown-protocol' });
        }
        var chain = active ? disconnect() : Promise.resolve();
        return chain.then(function () {
            target = nextTarget || {};
            return Promise.resolve(sessions[name].connect(target));
        }).then(function (result) {
            if (result && result.ok) {
                active = name;
                result.target = target;
            } else {
                active = null;
            }
            return result || { ok: false, reason: 'connect-failed' };
        }, function () {
            active = null;
            return { ok: false, reason: 'connect-failed' };
        });
    }

    function forward(method, args) {
        if (active !== 'rdp' && active !== 'vnc') {
            return { ok: false, reason: 'no-desktop-session' };
        }
        var session = sessions[active];
        if (!session || typeof session[method] !== 'function') {
            return { ok: false, reason: 'unsupported' };
        }
        return session[method].apply(session, args);
    }

    return {
        connect: connect,
        disconnect: disconnect,
        reconnect: function () {
            var name = active;
            var again = target;
            if (!name) {
                return Promise.resolve({ ok: false, reason: 'idle' });
            }
            return disconnect().then(function () {
                return connect(name, again);
            });
        },
        getStatus: function () {
            if (!active || !sessions[active] || typeof sessions[active].getStatus !== 'function') {
                return { protocol: active, state: 'idle' };
            }
            var status = sessions[active].getStatus();
            status.protocol = active;
            return status;
        },
        sendMouseMove: function (x, y) { return forward('sendMouseMove', [x, y]); },
        sendMouseClick: function (button, down) { return forward('sendMouseClick', [button, down]); },
        sendMouseScroll: function (delta) { return forward('sendMouseScroll', [delta]); },
        sendKey: function (key, down) { return forward('sendKey', [key, down]); },
        onVehicle: function () {
            if (active && active !== 'airplay' && gate.hudAllowed() !== true) {
                return disconnect().then(function () {
                    return { ok: false, reason: gate.known() ? 'not-parked' : 'speed-unknown', stopped: true };
                });
            }
            return Promise.resolve({ ok: true, active: active, parked: gate.hudAllowed() === true });
        },
        dispose: function () {
            return disconnect();
        },
        active: function () { return active; },
    };
}

module.exports = {
    createSessionManager: createSessionManager,
};
