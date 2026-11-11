'use strict';

var PROTOCOLS = ['airplay', 'rdp', 'vnc'];
var INPUT_MODES = ['auto', 'touchpad', 'knob', 'screen'];

function clamp(value, min, max, fallback) {
    var number = Number(value);
    if (number !== number) {
        return fallback;
    }
    if (number < min) {
        return min;
    }
    if (number > max) {
        return max;
    }
    return Math.round(number);
}

function hostOf(stored, port) {
    var data = stored || {};
    var octets = [0, 0, 0, 0];
    var given = data.octets || [];
    var i;
    for (i = 0; i < 4; i++) {
        octets[i] = clamp(given[i], 0, 255, 0);
    }
    return {
        octets: octets,
        port: clamp(data.port, 1, 65535, port),
        user: typeof data.user === 'string' ? data.user.slice(0, 64) : '',
        cert: typeof data.cert === 'string' ? data.cert.slice(0, 128) : '',
    };
}

function hostText(host) {
    return host.octets.join('.') + ':' + host.port;
}

function createDesktopSettings(stored) {
    var data = stored || {};
    var mode = INPUT_MODES.indexOf(data.inputMode) === -1 ? 'auto' : data.inputMode;
    var hosts = {
        rdp: hostOf(data.rdp, 3389),
        vnc: hostOf(data.vnc, 5900),
    };
    var airplayName = typeof data.airplayName === 'string' && data.airplayName.length
        ? data.airplayName.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 16)
        : 'G21';
    if (!airplayName.length) {
        airplayName = 'G21';
    }
    var octet = 0;

    return {
        protocols: PROTOCOLS,
        inputMode: function () { return mode; },
        setInputMode: function (next) {
            if (INPUT_MODES.indexOf(next) === -1) {
                return { ok: false, reason: 'unknown-input-mode' };
            }
            mode = next;
            return { ok: true, mode: mode };
        },
        sensitivity: function () { return clamp(data.sensitivity, 1, 20, 3); },
        scrollStep: function () { return clamp(data.scrollStep, 1, 10, 1); },
        invertX: function () { return data.invertX === true; },
        invertY: function () { return data.invertY === true; },
        swapButtons: function () { return data.swapButtons === true; },
        inspect: function () { return data.inspect === true; },
        airplayName: function () { return airplayName; },
        host: function (protocol) { return hosts[protocol]; },
        hostText: function (protocol) { return hostText(hosts[protocol]); },
        selectOctet: function (index) {
            octet = clamp(index, 0, 3, 0);
            return octet;
        },
        octet: function () { return octet; },
        stepOctet: function (protocol, delta) {
            var host = hosts[protocol];
            if (!host) {
                return { ok: false, reason: 'unknown-protocol' };
            }
            host.octets[octet] = clamp(host.octets[octet] + delta, 0, 255, 0);
            return { ok: true, octets: host.octets.slice() };
        },
        nextOctet: function () {
            octet = (octet + 1) % 4;
            return octet;
        },
        snapshot: function () {
            return {
                inputMode: mode,
                sensitivity: clamp(data.sensitivity, 1, 20, 3),
                scrollStep: clamp(data.scrollStep, 1, 10, 1),
                invertX: data.invertX === true,
                invertY: data.invertY === true,
                swapButtons: data.swapButtons === true,
                inspect: data.inspect === true,
                airplayName: airplayName,
                rdp: { octets: hosts.rdp.octets.slice(), port: hosts.rdp.port, user: hosts.rdp.user, cert: hosts.rdp.cert },
                vnc: { octets: hosts.vnc.octets.slice(), port: hosts.vnc.port, user: hosts.vnc.user },
            };
        },
    };
}

module.exports = {
    PROTOCOLS: PROTOCOLS,
    INPUT_MODES: INPUT_MODES,
    createDesktopSettings: createDesktopSettings,
};
