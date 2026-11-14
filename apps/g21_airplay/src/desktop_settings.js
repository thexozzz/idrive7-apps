'use strict';

var PROTOCOLS = ['airplay', 'windows', 'rdp', 'vnc'];
var INPUT_MODES = ['auto', 'touchpad', 'knob', 'screen'];
var MAX_PROFILES = 6;

// Built-in owner RDP profile as Profil 1 / p1 (password in .secret, not here).
var BUILTIN_RDP = {
    id: 'p1',
    label: 'Profil 1',
    octets: [100, 89, 166, 19],
    port: 3389,
    user: 'thexozzz@gmail.com',
    cert: '',
};

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

function isBlankHost(host) {
    return !!(host && host.octets.join('.') === '0.0.0.0' && !host.user);
}

function sameRdpTarget(host, target) {
    return !!(host && target
        && host.octets.join('.') === target.octets.join('.')
        && host.port === target.port
        && host.user === target.user);
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

function builtinProfile() {
    var profile = hostOf(BUILTIN_RDP, 3389);
    profile.id = 'p1';
    profile.label = BUILTIN_RDP.label;
    return profile;
}

function ensureBuiltinRdp(list) {
    var i;
    var profile = builtinProfile();
    var existing;
    // Wymuś p1 = Profil 1 z kontem właściciela (nadpisz stare p1 / pusty slot).
    for (i = 0; i < list.length; i += 1) {
        if (list[i].id === 'p1') {
            existing = list[i];
            if (sameRdpTarget(existing, BUILTIN_RDP) && existing.label === BUILTIN_RDP.label) {
                return { list: list, changed: false, id: 'p1' };
            }
            list[i] = profile;
            return { list: list, changed: true, id: 'p1' };
        }
    }
    if (list.length === 1 && (isBlankHost(list[0]) || list[0].id === 'p1')) {
        list[0] = profile;
        return { list: list, changed: true, id: 'p1' };
    }
    if (list.length >= MAX_PROFILES) {
        list[0] = profile;
        return { list: list, changed: true, id: 'p1' };
    }
    list.unshift(profile);
    return { list: list, changed: true, id: 'p1' };
}

function createDesktopSettings(stored) {
    var data = stored || {};
    var mode = INPUT_MODES.indexOf(data.inputMode) === -1 ? 'auto' : data.inputMode;
    var rdpProfiles = loadProfiles(data.rdpProfiles, data.rdp, 3389, 'p');
    var vncProfiles = loadProfiles(data.vncProfiles, data.vnc, 5900, 'p');
    var builtinRdp = ensureBuiltinRdp(rdpProfiles);
    rdpProfiles = builtinRdp.list;
    var rdpActive = data.rdpActive || rdpProfiles[0].id;
    var vncActive = data.vncActive || vncProfiles[0].id;
    var seededBuiltinRdp = builtinRdp.changed;
    // Profil 1 (p1) jest kontem wlasciciela — ustaw jako aktywny po seedzie.
    if (builtinRdp.changed) {
        rdpActive = 'p1';
    } else if (!data.rdpActive) {
        rdpActive = 'p1';
    }
    var airplayName = typeof data.airplayName === 'string' && data.airplayName.length
        ? data.airplayName.replace(/[^A-Za-z0-9_\-ĄĆĘŁŃÓŚŹŻąćęłńóśźż]/g, '').slice(0, 16)
        : 'THEiPlay';
    if (!airplayName.length) {
        airplayName = 'THEiPlay';
    }
    // false = jak na kkds (bez kodu); true = -pin na iPhonie.
    var airplayPin = data.airplayPin === true;
    var airQuality = data.airQuality === '1080' ? '1080' : '720';
    var airDisplay = data.airDisplay === 'cluster' || data.airDisplay === 'both' || data.airDisplay === 'off'
        ? data.airDisplay
        : 'central';
    var airClusterTarget = data.airClusterTarget === 'panel' ? 'panel' : 'map';
    var uiLang = data.uiLang === 'en' ? 'en' : 'pl';
    var uiRender = data.uiRender === 'software' ? 'software' : 'gpu';
    var airFit = data.airFit === 'cover' ? 'cover' : 'contain';
    var airClusterFps = data.airClusterFps | 0;
    if (airClusterFps < 2 || airClusterFps > 6) {
        airClusterFps = 4;
    }
    var airOutputs = Array.isArray(data.airOutputs) && data.airOutputs.length
        ? data.airOutputs.filter(function (name) {
            return name === 'central' || name === 'cluster' || name === 'hud';
        })
        : ['central'];
    var airWindows = data.airWindows && typeof data.airWindows === 'object' ? data.airWindows : {};
    // Default ON: diagnostic AIRPLAY label on cluster map + HUD until user toggles off.
    var clusterLabel = data.clusterLabel !== false;
    var labelText = typeof data.labelText === 'string' && data.labelText.length
        ? data.labelText.replace(/[^A-Za-z0-9 _\-ĄĆĘŁŃÓŚŹŻąćęłńóśźż]/g, '').slice(0, 24)
        : 'THEiPlay';
    if (!labelText.length) {
        labelText = 'THEiPlay';
    }
    var labelFonts = { pixel: true, bold: true, tall: true };
    var labelColors = { white: true, orange: true, red: true, yellow: true, blue: true };
    var labelScales = { 2: true, 3: true, 4: true, 6: true, 8: true };
    var labelFont = labelFonts[data.labelFont] ? data.labelFont : 'pixel';
    var labelScale = labelScales[data.labelScale | 0] ? (data.labelScale | 0) : 4;
    var labelColor = labelColors[data.labelColor] ? data.labelColor : 'white';
    var labelPos = {
        central: { x: 120, y: 48 },
        cluster: { x: 80, y: 48 },
        hud: { x: 24, y: 16 }
    };
    ['central', 'cluster', 'hud'].forEach(function (name) {
        var saved = data.labelPos && data.labelPos[name];
        if (saved && typeof saved === 'object') {
            labelPos[name] = {
                x: Math.max(0, saved.x | 0),
                y: Math.max(0, saved.y | 0)
            };
        }
    });
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
            var cleaned = String(next || '').replace(/[^A-Za-z0-9_\-ĄĆĘŁŃÓŚŹŻąćęłńóśźż]/g, '').slice(0, 16);
            if (!cleaned.length) {
                return { ok: false, reason: 'bad-name' };
            }
            airplayName = cleaned;
            return { ok: true, name: airplayName };
        },
        airplayPin: function () { return airplayPin; },
        setAirplayPin: function (on) {
            airplayPin = !!on;
            return { ok: true, on: airplayPin };
        },
        airQuality: function () { return airQuality; },
        setAirQuality: function (next) {
            airQuality = next === '1080' ? '1080' : '720';
            return { ok: true, quality: airQuality };
        },
        airDisplay: function () { return airDisplay; },
        setAirDisplay: function (next) {
            if (next === 'cluster' || next === 'both' || next === 'off') {
                airDisplay = next;
            } else {
                airDisplay = 'central';
            }
            return { ok: true, mode: airDisplay };
        },
        uiLang: function () { return uiLang; },
        setUiLang: function (next) {
            uiLang = next === 'en' ? 'en' : 'pl';
            return uiLang;
        },
        uiRender: function () { return uiRender; },
        setUiRender: function (next) {
            uiRender = next === 'software' ? 'software' : 'gpu';
            return uiRender;
        },
        airClusterTarget: function () { return airClusterTarget; },
        setAirClusterTarget: function (next) {
            airClusterTarget = next === 'panel' ? 'panel' : 'map';
            return { ok: true, target: airClusterTarget };
        },
        airFit: function () { return airFit; },
        setAirFit: function (next) {
            airFit = next === 'cover' ? 'cover' : 'contain';
            return { ok: true, fit: airFit };
        },
        airClusterFps: function () { return airClusterFps; },
        setAirClusterFps: function (next) {
            var n = next | 0;
            if (n < 2) {
                n = 2;
            }
            if (n > 6) {
                n = 6;
            }
            airClusterFps = n;
            return { ok: true, fps: airClusterFps };
        },
        airOutputs: function () { return airOutputs.slice(); },
        setAirOutputs: function (list) {
            airOutputs = (list || []).slice();
            return airOutputs.slice();
        },
        airWindows: function () { return airWindows; },
        setAirWindows: function (picture) {
            airWindows = picture || {};
            return airWindows;
        },
        clusterLabel: function () { return clusterLabel; },
        setClusterLabel: function (on) {
            clusterLabel = !!on;
            return { ok: true, on: clusterLabel };
        },
        labelFont: function () { return labelFont; },
        setLabelFont: function (next) {
            labelFont = labelFonts[next] ? next : 'pixel';
            return labelFont;
        },
        labelScale: function () { return labelScale; },
        setLabelScale: function (next) {
            labelScale = labelScales[next | 0] ? (next | 0) : labelScale;
            return labelScale;
        },
        labelColor: function () { return labelColor; },
        setLabelColor: function (next) {
            labelColor = labelColors[next] ? next : 'white';
            return labelColor;
        },
        labelText: function () { return labelText; },
        setLabelText: function (next) {
            var cleaned = String(next || '').replace(/[^A-Za-z0-9 _\-ĄĆĘŁŃÓŚŹŻąćęłńóśźż]/g, '').slice(0, 24);
            if (!cleaned.length) {
                return { ok: false, reason: 'bad-name' };
            }
            labelText = cleaned;
            return { ok: true, text: labelText };
        },
        labelAt: function (name) {
            return labelPos[name] || labelPos.central;
        },
        setLabelAt: function (name, x, y) {
            var limit = name === 'hud' ? { w: 800, h: 480 } : { w: 1920, h: 720 };
            if (!labelPos[name]) {
                return labelPos.central;
            }
            var nx = x | 0;
            var ny = y | 0;
            if (nx < 0) nx = 0;
            if (ny < 0) ny = 0;
            if (nx > limit.w - 40) nx = limit.w - 40;
            if (ny > limit.h - 28) ny = limit.h - 28;
            labelPos[name] = { x: nx, y: ny };
            return labelPos[name];
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
        seededBuiltinRdp: function () { return seededBuiltinRdp; },
        builtinRdpId: function () { return builtinRdp.id; },
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
                airplayPin: airplayPin,
                airQuality: airQuality,
                airDisplay: airDisplay,
                uiLang: uiLang,
                uiRender: uiRender,
                airClusterTarget: airClusterTarget,
                airFit: airFit,
                airClusterFps: airClusterFps,
                airOutputs: airOutputs.slice(),
                airWindows: airWindows,
                clusterLabel: clusterLabel,
                labelText: labelText,
                labelFont: labelFont,
                labelScale: labelScale,
                labelColor: labelColor,
                labelPos: labelPos,
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
    BUILTIN_RDP: BUILTIN_RDP,
    parseIpv4: parseIpv4,
    createDesktopSettings: createDesktopSettings,
};
