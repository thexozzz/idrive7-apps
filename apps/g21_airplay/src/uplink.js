'use strict';

var fs = require('fs');

var STATUS_PATH = '/run/mgu-uplink/status.json';
var LEASE_PATH = '/run/mgu-uplink/lease.json';

function isIpv4(value) {
    var parts = String(value || '').split('.');
    if (parts.length !== 4) {
        return false;
    }
    return parts.every(function (part) {
        if (!/^\d+$/.test(part)) {
            return false;
        }
        var n = Number(part);
        return n >= 0 && n <= 255 && String(n) === String(Number(part));
    });
}

function readJson(file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
        return null;
    }
}

function readUplink(paths) {
    var files = paths || {};
    return {
        status: readJson(files.status || STATUS_PATH),
        lease: readJson(files.lease || LEASE_PATH),
    };
}

function readReceiverStatus(text) {
    var parts = String(text || '').replace(/\s+$/, '').split('|');
    return {
        mode: parts[0] || 'unknown',
        ssid: parts[1] || '',
        ip: parts[2] || '',
    };
}

// Apple Personal Hotspot Wi-Fi clients get 172.20.10.0/28.
function isPhoneHotspotIp(ip) {
    var parts = String(ip || '').split('.');
    if (parts.length !== 4) {
        return false;
    }
    if (parts[0] !== '172' || parts[1] !== '20' || parts[2] !== '10') {
        return false;
    }
    if (!/^\d+$/.test(parts[3])) {
        return false;
    }
    var host = Number(parts[3]);
    return host >= 0 && host <= 15;
}

function selectStoreWifi(status, lease) {
    if (!status || !status.device || status.device.kind !== 'wifi') {
        return { ok: false, reason: 'uplink-not-wifi' };
    }
    var link = status.wifi && status.wifi.link;
    if (link !== 'online' && link !== 'connected') {
        return { ok: false, reason: 'wifi-down', link: link || '' };
    }
    if (!lease || !lease.ip || !lease.interface) {
        return { ok: false, reason: 'no-lease' };
    }
    if (!/^[A-Za-z0-9._-]{1,15}$/.test(lease.interface)) {
        return { ok: false, reason: 'bad-interface' };
    }
    if (!isIpv4(lease.ip)) {
        return { ok: false, reason: 'bad-ip' };
    }
    var prefix = Number(lease.prefix);
    if (!prefix || prefix < 1 || prefix > 32) {
        return { ok: false, reason: 'bad-prefix' };
    }
    var ssid = '';
    if (status.wifi && status.wifi.ssid) {
        ssid = status.wifi.ssid;
    } else if (status.device.name) {
        ssid = status.device.name;
    }
    return {
        ok: true,
        iface: lease.interface,
        ip: lease.ip,
        prefix: prefix,
        ssid: ssid,
        phoneHotspot: isPhoneHotspotIp(lease.ip),
    };
}

function selectAirplayAnnounce(receiver, storeWifi) {
    var mode = receiver && receiver.mode ? receiver.mode : 'unknown';
    if (mode === 'running' && receiver.ip) {
        return {
            ok: true,
            ip: receiver.ip,
            ssid: receiver.ssid || 'BMW',
            reason: '',
        };
    }
    if (mode === 'phone-is-ap' || mode === 'join-car-wifi' || mode === 'mdns-brak' || mode === 'uxplay-exit' || mode === 'missing') {
        return {
            ok: false,
            reason: mode,
            ip: receiver.ip || '',
            ssid: receiver.ssid || '',
        };
    }
    if (storeWifi && storeWifi.ok && storeWifi.phoneHotspot) {
        return {
            ok: false,
            reason: 'phone-is-ap',
            ip: storeWifi.ip,
            ssid: storeWifi.ssid || '',
        };
    }
    if (storeWifi && storeWifi.ok) {
        return {
            ok: true,
            ip: storeWifi.ip,
            ssid: storeWifi.ssid,
            reason: '',
        };
    }
    return {
        ok: false,
        reason: (storeWifi && storeWifi.reason) || 'join-car-wifi',
        ip: '',
        ssid: '',
    };
}

module.exports = {
    STATUS_PATH: STATUS_PATH,
    LEASE_PATH: LEASE_PATH,
    readUplink: readUplink,
    selectStoreWifi: selectStoreWifi,
    selectAirplayAnnounce: selectAirplayAnnounce,
    isPhoneHotspotIp: isPhoneHotspotIp,
    readReceiverStatus: readReceiverStatus,
};
