'use strict';

var fs = require('fs');
var net = require('net');

var DEFAULT_HOST = '127.0.0.2';
var PORT_FILES = [
    '/run/g21-session/socks5-port',
    '/var/opt/iteriodev-tailscale/socks5-port',
];

function isTailscaleHost(host) {
    var parts = String(host || '').split('.');
    var a;
    var b;
    if (parts.length !== 4) {
        return false;
    }
    a = parseInt(parts[0], 10);
    b = parseInt(parts[1], 10);
    if (a !== a || b !== b) {
        return false;
    }
    // Tailscale CGNAT 100.64.0.0/10
    return a === 100 && b >= 64 && b <= 127;
}

function readSocks5() {
    var envHost = process.env.G21_SOCKS5_HOST;
    var envPort = process.env.G21_SOCKS5_PORT;
    var i;
    var text;
    var port;
    if (envPort) {
        port = parseInt(String(envPort).replace(/\s+/g, ''), 10);
        if (port > 0 && port <= 65535) {
            return { host: envHost || DEFAULT_HOST, port: port };
        }
    }
    for (i = 0; i < PORT_FILES.length; i += 1) {
        try {
            text = fs.readFileSync(PORT_FILES[i], 'utf8');
        } catch (err) {
            continue;
        }
        port = parseInt(String(text || '').replace(/\s+/g, ''), 10);
        if (port > 0 && port <= 65535) {
            return { host: DEFAULT_HOST, port: port };
        }
    }
    return null;
}

function shouldProxy(host) {
    return isTailscaleHost(host) && !!readSocks5();
}

function connect(destHost, destPort, extra) {
    var opts = extra || {};
    var socks = opts.socks || readSocks5();
    var timeoutMs = opts.timeoutMs || 12000;
    if (!socks) {
        return Promise.reject(new Error('no-socks5'));
    }
    return new Promise(function (resolve, reject) {
        var socket = net.connect({ host: socks.host, port: socks.port });
        var buf = Buffer.alloc(0);
        var phase = 'greeting';
        var timer = setTimeout(function () {
            socket.destroy();
            reject(new Error('socks5-timeout'));
        }, timeoutMs);

        function fail(err) {
            clearTimeout(timer);
            socket.destroy();
            reject(err instanceof Error ? err : new Error(String(err || 'socks5')));
        }

        function send(chunk) {
            socket.write(chunk);
        }

        socket.on('error', function (err) {
            fail(err || new Error('socks5-network'));
        });

        socket.on('data', function (chunk) {
            var need;
            var req;
            var hostBuf;
            var atyp;
            var rep;
            buf = Buffer.concat([buf, chunk]);
            if (phase === 'greeting') {
                if (buf.length < 2) {
                    return;
                }
                if (buf[0] !== 0x05 || buf[1] !== 0x00) {
                    fail(new Error('socks5-auth'));
                    return;
                }
                buf = buf.slice(2);
                hostBuf = Buffer.from(String(destHost), 'utf8');
                if (hostBuf.length > 255) {
                    fail(new Error('socks5-host'));
                    return;
                }
                req = Buffer.alloc(7 + hostBuf.length);
                req[0] = 0x05;
                req[1] = 0x01;
                req[2] = 0x00;
                req[3] = 0x03;
                req[4] = hostBuf.length;
                hostBuf.copy(req, 5);
                req.writeUInt16BE(destPort & 0xffff, 5 + hostBuf.length);
                phase = 'reply';
                send(req);
            }
            if (phase === 'reply') {
                if (buf.length < 4) {
                    return;
                }
                atyp = buf[3];
                if (atyp === 0x01) {
                    need = 10;
                } else if (atyp === 0x03) {
                    if (buf.length < 5) {
                        return;
                    }
                    need = 7 + buf[4];
                } else if (atyp === 0x04) {
                    need = 22;
                } else {
                    fail(new Error('socks5-atyp'));
                    return;
                }
                if (buf.length < need) {
                    return;
                }
                rep = buf[1];
                if (rep !== 0x00) {
                    fail(new Error('socks5-refused-' + rep));
                    return;
                }
                clearTimeout(timer);
                socket.removeAllListeners('data');
                socket.removeAllListeners('error');
                resolve(socket);
            }
        });

        socket.on('connect', function () {
            send(Buffer.from([0x05, 0x01, 0x00]));
        });
    });
}

module.exports = {
    DEFAULT_HOST: DEFAULT_HOST,
    isTailscaleHost: isTailscaleHost,
    readSocks5: readSocks5,
    shouldProxy: shouldProxy,
    connect: connect,
};
