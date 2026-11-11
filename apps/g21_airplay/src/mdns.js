'use strict';

var dgram = require('dgram');

var SERVICE = '_airplay._tcp.local';

function encodeName(name) {
    var out = [];
    String(name).split('.').forEach(function (label) {
        var bytes = Buffer.from(label);
        if (bytes.length < 1 || bytes.length > 63) {
            throw new Error('bad dns label');
        }
        out.push(Buffer.from([bytes.length]), bytes);
    });
    out.push(Buffer.from([0]));
    return Buffer.concat(out);
}

function txtItem(text) {
    var bytes = Buffer.from(text);
    if (bytes.length > 255) {
        throw new Error('txt item too long');
    }
    return Buffer.concat([Buffer.from([bytes.length]), bytes]);
}

function buildPacket(opts) {
    var instance = opts.name + '.' + SERVICE;
    var host = opts.name + '.local';
    var txt = Buffer.concat([
        txtItem('deviceid=' + opts.mac),
        txtItem('features=0x5A7FFFF7,0xE'),
        txtItem('flags=0x4'),
        txtItem('model=AppleTV3,2'),
        txtItem('srcvers=220.68'),
        txtItem('vv=2'),
    ]);
    var records = [
        { name: SERVICE, type: 12, data: encodeName(instance) },
        { name: instance, type: 33, data: Buffer.concat([Buffer.from([0, 0, 0, 0]), portBytes(opts.port), encodeName(host)]) },
        { name: instance, type: 16, data: txt },
        { name: host, type: 1, data: ipBytes(opts.ip) },
    ];
    var header = Buffer.alloc(12);
    header.writeUInt16BE(0, 0);
    header.writeUInt16BE(0x8400, 2);
    header.writeUInt16BE(0, 4);
    header.writeUInt16BE(records.length, 6);
    var parts = [header];
    records.forEach(function (record) {
        var body = Buffer.alloc(10);
        body.writeUInt16BE(record.type, 0);
        body.writeUInt16BE(0x8001, 2);
        body.writeUInt32BE(120, 4);
        body.writeUInt16BE(record.data.length, 8);
        parts.push(encodeName(record.name), body, record.data);
    });
    return Buffer.concat(parts);
}

function portBytes(port) {
    var buf = Buffer.alloc(2);
    buf.writeUInt16BE(port, 0);
    return buf;
}

function ipBytes(ip) {
    return Buffer.from(String(ip).split('.').map(function (part) { return Number(part); }));
}

function startAnnouncer(opts) {
    var sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    var timer = null;
    var closed = false;

    function send() {
        var packet;
        try {
            packet = buildPacket(opts);
        } catch (err) {
            if (opts.onError) {
                opts.onError(err);
            }
            return;
        }
        sock.send(packet, 0, packet.length, 5353, '224.0.0.251');
    }

    sock.on('message', function (msg) {
        if (msg.length < 4 || (msg[2] & 0x80) !== 0) {
            return;
        }
        var text = msg.toString('utf8');
        if (text.indexOf('_airplay') === -1) {
            return;
        }
        send();
    });
    sock.on('listening', function () {
        try {
            sock.addMembership('224.0.0.251', opts.ip);
        } catch (err) { /* another socket already joined */ }
        try {
            if (sock.setMulticastInterface) {
                sock.setMulticastInterface(opts.ip);
            }
        } catch (err2) { /* the route still uses this address */ }
        send();
        timer = setInterval(send, 2000);
        if (timer.unref) {
            timer.unref();
        }
    });
    sock.on('error', function (err) {
        if (opts.onError) {
            opts.onError(err);
        }
    });
    sock.bind(5353, opts.ip);

    return {
        close: function (done) {
            if (closed) {
                if (done) {
                    done();
                }
                return;
            }
            closed = true;
            if (timer) {
                clearInterval(timer);
            }
            sock.close(done);
        },
    };
}

module.exports = {
    SERVICE: SERVICE,
    buildPacket: buildPacket,
    startAnnouncer: startAnnouncer,
};
