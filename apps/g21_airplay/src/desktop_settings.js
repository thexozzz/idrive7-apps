'use strict';

var PROTOCOLS = ['airplay', 'windows', 'rdp', 'vnc'];
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

function parseIpv4(text) {
    var parts = String(text || '').trim().split('.');
    var octets = [];
    var i;
    var n;
    if (parts.length !== 4) {
        return null;
    }
    for (i = 0; i < 4; i += 1) {
        if (!/^\d+$/.test(parts[i])) {
            return null;
        }
        n = Number(parts[i]);
        if (n < 0 || n > 255 || String(n) !== String(Number(parts[i]))) {
            return null;
        }
        octets.push(n);
    }
    return octets;
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
        setAirplayName: function (next) {
            var cleaned = String(next || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 16);
            if (!cleaned.length) {
                return { ok: false, reason: 'bad-name' };
            }
            airplayName = cleaned;
            return { ok: true, name: airplayName };
        },
        host: function (protocol) { return hosts[protocol]; },
        hostText: function (protocol) { return hostText(hosts[protocol]); },
        setRdpHost: function (value) {
            var octets = Array.isArray(value) ? value : parseIpv4(value);
            if (!octets) {
                return { ok: false, reason: 'bad-host' };
            }
            hosts.rdp.octets = octets.slice(0, 4);
            return { ok: true, octets: hosts.rdp.octets.slice() };
        },
        setRdpPort: function (value) {
            hosts.rdp.port = clamp(value, 1, 65535, hosts.rdp.port || 3389);
            return { ok: true, port: hosts.rdp.port };
        },
        setRdpUser: function (value) {
            hosts.rdp.user = String(value || '').slice(0, 64);
            return { ok: true, user: hosts.rdp.user };
        },
        setRdpCert: function (value) {
            hosts.rdp.cert = String(value || '').replace(/\s+/g, '').slice(0, 128);
            return { ok: true, cert: hosts.rdp.cert };
        },
        clearRdpCert: function () {
            hosts.rdp.cert = '';
            return { ok: true, cert: '' };
        },
        setVncHost: function (value) {
            var octets = Array.isArray(value) ? value : parseIpv4(value);
            if (!octets) {
                return { ok: false, reason: 'bad-host' };
            }
            hosts.vnc.octets = octets.slice(0, 4);
            return { ok: true, octets: hosts.vnc.octets.slice() };
        },
        setVncPort: function (value) {
            hosts.vnc.port = clamp(value, 1, 65535, hosts.vnc.port || 5900);
            return { ok: true, port: hosts.vnc.port };
        },
        formatHostIp: function (protocol) {
            var host = hosts[protocol];
            if (!host) {
                return '';
            }
            return host.octets.join('.');
        },
        formatRdpIp: function () {
            return this.formatHostIp('rdp');
        },
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
    parseIpv4: parseIpv4,
    createDesktopSettings: createDesktopSettings,
};
