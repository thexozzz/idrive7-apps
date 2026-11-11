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
    var parts = String(text || '').split('|');
    return {
        mode: parts[0] || 'unknown',
        ssid: parts[1] || '',
        ip: parts[2] || '',
    };
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
    };
}

module.exports = {
    STATUS_PATH: STATUS_PATH,
    LEASE_PATH: LEASE_PATH,
    readUplink: readUplink,
    selectStoreWifi: selectStoreWifi,
    readReceiverStatus: readReceiverStatus,
};
