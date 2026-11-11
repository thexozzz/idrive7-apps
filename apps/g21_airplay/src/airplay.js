'use strict';

var net = require('net');

function infoBody(mac) {
    return '<?xml version="1.0" encoding="UTF-8"?>\n'
        + '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
        + '<plist version="1.0"><dict>'
        + '<key>deviceid</key><string>' + mac + '</string>'
        + '<key>features</key><integer>1517813751</integer>'
        + '<key>model</key><string>AppleTV3,2</string>'
        + '<key>protovers</key><string>1.0</string>'
        + '<key>srcvers</key><string>220.68</string>'
        + '<key>vv</key><integer>2</integer>'
        + '</dict></plist>\n';
}

function headerValue(text, name) {
    var match = new RegExp('^' + name + ':\\s*(.*)$', 'im').exec(text);
    return match ? match[1].trim() : '';
}

function replyFor(request, mac) {
    var first = request.split('\r\n')[0] || '';
    var cseq = headerValue(request, 'cseq') || '0';
    if (first.indexOf('GET /info') === 0 || first.indexOf('GET /server-info') === 0) {
        var body = infoBody(mac);
        return {
            state: 'waiting',
            detail: first,
            raw: 'HTTP/1.1 200 OK\r\nContent-Type: text/x-apple-plist+xml\r\nContent-Length: '
                + Buffer.byteLength(body) + '\r\nConnection: close\r\n\r\n' + body,
        };
    }
    if (/^(SETUP|ANNOUNCE|RECORD|GET_PARAMETER|SET_PARAMETER|TEARDOWN|FLUSH|POST|OPTIONS)\b/.test(first)
        || first.indexOf('RTSP/1.0') !== -1) {
        return {
            state: 'streaming',
            detail: first,
            raw: 'RTSP/1.0 200 OK\r\nCSeq: ' + cseq + '\r\nServer: G21\r\n\r\n',
        };
    }
    return {
        state: 'connected',
        detail: first,
        raw: 'HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n',
    };
}

function createReceiver(opts) {
    var mac = opts.mac || '00:00:00:00:00:00';
    var clients = 0;
    var server = net.createServer(function (socket) {
        var buf = '';
        clients += 1;
        if (opts.onState) {
            opts.onState({ state: 'connected', detail: opts.ip, clients: clients });
        }
        socket.on('data', function (chunk) {
            if (buf.length > 16384) {
                return;
            }
            buf += chunk.toString('latin1');
            if (buf.indexOf('\r\n\r\n') === -1) {
                return;
            }
            var answer = replyFor(buf, mac);
            if (opts.onState) {
                opts.onState({ state: answer.state, detail: answer.detail, clients: clients });
            }
            socket.end(answer.raw);
            buf = '';
        });
        socket.on('close', function () {
            clients -= 1;
            if (clients < 1 && opts.onState) {
                opts.onState({ state: 'waiting', detail: opts.ip, clients: 0 });
            }
        });
    });
    server.on('error', function (err) {
        if (opts.onState) {
            opts.onState({ state: 'error', detail: err.message, clients: clients });
        }
    });
    server.listen(opts.port || 7000, opts.ip);
    return {
        close: function (done) { server.close(done); },
    };
}

module.exports = {
    infoBody: infoBody,
    replyFor: replyFor,
    createReceiver: createReceiver,
};
