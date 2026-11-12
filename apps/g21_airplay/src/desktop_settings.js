'use strict';

var PROTOCOLS = ['airplay', 'windows', 'rdp', 'vnc'];
var INPUT_MODES = ['auto', 'touchpad', 'knob', 'screen'];
var MAX_PROFILES = 6;

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
        label: typeof data.label === 'string'
            ? data.label.replace(/[^A-Za-z0-9 _.-]/g, '').slice(0, 16)
            : '',
        id: typeof data.id === 'string' ? data.id.slice(0, 16) : '',
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

function nextId(list, prefix) {
    var n = 1;
    var used = {};
    list.forEach(function (p) { used[p.id] = true; });
    while (used[prefix + n] && n < 99) {
        n += 1;
    }
    return prefix + n;
}

function loadProfiles(rawList, legacy, port, prefix) {
    var list = [];
    var i;
    var item;
    if (Array.isArray(rawList) && rawList.length) {
        for (i = 0; i < rawList.length && list.length < MAX_PROFILES; i += 1) {
            item = hostOf(rawList[i], port);
            if (!item.id) {
                item.id = nextId(list, prefix);
            }
            if (!item.label) {
                item.label = item.id;
            }
            list.push(item);
        }
    }
    if (!list.length) {
        item = hostOf(legacy, port);
        item.id = prefix + '1';
        item.label = item.label || 'Profil 1';
        list.push(item);
    }
    return list;
}

function createDesktopSettings(stored) {
    var data = stored || {};
    var mode = INPUT_MODES.indexOf(data.inputMode) === -1 ? 'auto' : data.inputMode;
    var rdpProfiles = loadProfiles(data.rdpProfiles, data.rdp, 3389, 'p');
    var vncProfiles = loadProfiles(data.vncProfiles, data.vnc, 5900, 'p');
    var rdpActive = data.rdpActive || rdpProfiles[0].id;
    var vncActive = data.vncActive || vncProfiles[0].id;
    var airplayName = typeof data.airplayName === 'string' && data.airplayName.length
        ? data.airplayName.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 16)
        : 'G21';
    if (!airplayName.length) {
        airplayName = 'G21';
    }
    var octet = 0;

    function findProfile(list, id) {
        var i;
        for (i = 0; i < list.length; i += 1) {
            if (list[i].id === id) {
                return list[i];
            }
        }
        return list[0];
    }

    function activeHost(protocol) {
        if (protocol === 'rdp') {
            return findProfile(rdpProfiles, rdpActive);
        }
        if (protocol === 'vnc') {
            return findProfile(vncProfiles, vncActive);
        }
        return null;
    }

    function ensureActive(protocol) {
        var list = protocol === 'rdp' ? rdpProfiles : vncProfiles;
        var id = protocol === 'rdp' ? rdpActive : vncActive;
        if (!findProfile(list, id) || (findProfile(list, id).id !== id && list[0])) {
            if (protocol === 'rdp') {
                rdpActive = list[0].id;
            } else {
                vncActive = list[0].id;
            }
        }
    }

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
        profiles: function (protocol) {
            return (protocol === 'rdp' ? rdpProfiles : vncProfiles).map(function (p) {
                return {
                    id: p.id,
                    label: p.label || p.id,
                    octets: p.octets.slice(),
                    port: p.port,
                    user: p.user,
                    cert: p.cert,
                    ip: p.octets.join('.'),
                };
            });
        },
        activeProfileId: function (protocol) {
            ensureActive(protocol);
            return protocol === 'rdp' ? rdpActive : vncActive;
        },
        setActiveProfile: function (protocol, id) {
            var list = protocol === 'rdp' ? rdpProfiles : vncProfiles;
            var found = findProfile(list, id);
            if (!found || found.id !== id) {
                return { ok: false, reason: 'unknown-profile' };
            }
            if (protocol === 'rdp') {
                rdpActive = id;
            } else {
                vncActive = id;
            }
            return { ok: true, id: id };
        },
        addProfile: function (protocol) {
            var list = protocol === 'rdp' ? rdpProfiles : vncProfiles;
            var port = protocol === 'rdp' ? 3389 : 5900;
            var profile;
            if (list.length >= MAX_PROFILES) {
                return { ok: false, reason: 'max-profiles' };
            }
            profile = hostOf({ port: port }, port);
            profile.id = nextId(list, 'p');
            profile.label = 'Profil ' + profile.id.slice(1);
            list.push(profile);
            if (protocol === 'rdp') {
                rdpActive = profile.id;
            } else {
                vncActive = profile.id;
            }
            return { ok: true, id: profile.id, profile: profile };
        },
        removeProfile: function (protocol, id) {
            var list = protocol === 'rdp' ? rdpProfiles : vncProfiles;
            var i;
            if (list.length <= 1) {
                return { ok: false, reason: 'last-profile' };
            }
            for (i = 0; i < list.length; i += 1) {
                if (list[i].id === id) {
                    list.splice(i, 1);
                    if (protocol === 'rdp' && rdpActive === id) {
                        rdpActive = list[0].id;
                    }
                    if (protocol === 'vnc' && vncActive === id) {
                        vncActive = list[0].id;
                    }
                    return { ok: true, id: id };
                }
            }
            return { ok: false, reason: 'unknown-profile' };
        },
        setProfileLabel: function (protocol, id, label) {
            var host = findProfile(protocol === 'rdp' ? rdpProfiles : vncProfiles, id);
            if (!host || host.id !== id) {
                return { ok: false, reason: 'unknown-profile' };
            }
            host.label = String(label || '').replace(/[^A-Za-z0-9 _.-]/g, '').slice(0, 16) || host.id;
            return { ok: true, label: host.label };
        },
        host: function (protocol) { return activeHost(protocol); },
        hostText: function (protocol) { return hostText(activeHost(protocol)); },
        secretKind: function (protocol) {
            var host = activeHost(protocol);
            if (!host) {
                return protocol;
            }
            return protocol + '-' + host.id;
        },
        setRdpHost: function (value) {
            var octets = Array.isArray(value) ? value : parseIpv4(value);
            var host = activeHost('rdp');
            if (!octets) {
                return { ok: false, reason: 'bad-host' };
            }
            host.octets = octets.slice(0, 4);
            return { ok: true, octets: host.octets.slice() };
        },
        setRdpPort: function (value) {
            var host = activeHost('rdp');
            host.port = clamp(value, 1, 65535, host.port || 3389);
            return { ok: true, port: host.port };
        },
        setRdpUser: function (value) {
            var host = activeHost('rdp');
            host.user = String(value || '').slice(0, 64);
            return { ok: true, user: host.user };
        },
        setRdpCert: function (value) {
            var host = activeHost('rdp');
            host.cert = String(value || '').replace(/\s+/g, '').slice(0, 128);
            return { ok: true, cert: host.cert };
        },
        clearRdpCert: function () {
            var host = activeHost('rdp');
            host.cert = '';
            return { ok: true, cert: '' };
        },
        setVncHost: function (value) {
            var octets = Array.isArray(value) ? value : parseIpv4(value);
            var host = activeHost('vnc');
            if (!octets) {
                return { ok: false, reason: 'bad-host' };
            }
            host.octets = octets.slice(0, 4);
            return { ok: true, octets: host.octets.slice() };
        },
        setVncPort: function (value) {
            var host = activeHost('vnc');
            host.port = clamp(value, 1, 65535, host.port || 5900);
            return { ok: true, port: host.port };
        },
        formatHostIp: function (protocol) {
            var host = activeHost(protocol);
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
            var host = activeHost(protocol);
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
                rdpActive: rdpActive,
                vncActive: vncActive,
                rdpProfiles: rdpProfiles.map(function (p) {
                    return {
                        id: p.id,
                        label: p.label,
                        octets: p.octets.slice(),
                        port: p.port,
                        user: p.user,
                        cert: p.cert,
                    };
                }),
                vncProfiles: vncProfiles.map(function (p) {
                    return {
                        id: p.id,
                        label: p.label,
                        octets: p.octets.slice(),
                        port: p.port,
                        user: p.user,
                    };
                }),
                // Legacy single-host fields keep older tools working.
                rdp: {
                    octets: activeHost('rdp').octets.slice(),
                    port: activeHost('rdp').port,
                    user: activeHost('rdp').user,
                    cert: activeHost('rdp').cert,
                },
                vnc: {
                    octets: activeHost('vnc').octets.slice(),
                    port: activeHost('vnc').port,
                    user: activeHost('vnc').user,
                },
            };
        },
    };
}

module.exports = {
    PROTOCOLS: PROTOCOLS,
    INPUT_MODES: INPUT_MODES,
    MAX_PROFILES: MAX_PROFILES,
    parseIpv4: parseIpv4,
    createDesktopSettings: createDesktopSettings,
};
