'use strict';

var http = require('http');
var querystring = require('querystring');
var url = require('url');

var DEFAULT_PORT = 1235;

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function parseBody(req, done) {
    var chunks = [];
    var size = 0;
    req.on('data', function (chunk) {
        size += chunk.length;
        if (size > 8192) {
            done(new Error('body-too-large'));
            return;
        }
        chunks.push(chunk);
    });
    req.on('end', function () {
        var raw = Buffer.concat(chunks).toString('utf8');
        var type = String(req.headers['content-type'] || '');
        if (type.indexOf('application/json') !== -1) {
            try {
                done(null, JSON.parse(raw || '{}'));
            } catch (err) {
                done(err);
            }
            return;
        }
        done(null, querystring.parse(raw));
    });
    req.on('error', done);
}

function pageHtml(view) {
    return '<!DOCTYPE html><html><head><meta charset="utf-8">'
        + '<meta name="viewport" content="width=device-width, initial-scale=1">'
        + '<title>G21 AirPlay config</title>'
        + '<style>'
        + 'body{font-family:Segoe UI,Arial,sans-serif;background:#10141c;color:#f2f4f8;margin:0;padding:24px}'
        + 'main{max-width:520px;margin:0 auto}'
        + 'h1{font-size:28px;margin:0 0 8px}'
        + 'p,label{color:#9aa3b2}'
        + 'form{background:#1a2230;padding:20px;border-radius:12px;margin-top:16px}'
        + 'label{display:block;margin:12px 0 6px;font-size:14px}'
        + 'input{width:100%;box-sizing:border-box;padding:12px;border-radius:8px;border:1px solid #314058;background:#0d121a;color:#f2f4f8}'
        + 'button{margin-top:18px;width:100%;padding:14px;border:0;border-radius:8px;background:#3d7eff;color:#fff;font-size:16px}'
        + '.ok{color:#7dffa3;margin-top:12px}.err{color:#ff8f8f;margin-top:12px}'
        + '</style></head><body><main>'
        + '<h1>G21 konfiguracja</h1>'
        + '<p>Panel RDP na porcie 1235. Haslo nie wraca do przegladarki.</p>'
        + '<form method="POST" action="/rdp">'
        + '<label>Host IP</label><input name="host" value="' + escapeHtml(view.host) + '" placeholder="10.0.0.5" required>'
        + '<label>Port</label><input name="port" value="' + escapeHtml(view.port) + '" placeholder="3389">'
        + '<label>Uzytkownik</label><input name="user" value="' + escapeHtml(view.user) + '" placeholder="user">'
        + '<label>Haslo' + (view.passwordSet ? ' (zapisane, zostaw puste aby nie zmieniac)' : '') + '</label>'
        + '<input name="password" type="password" value="" autocomplete="new-password" placeholder="'
        + (view.passwordSet ? '********' : '') + '">'
        + '<label>Nazwa AirPlay</label><input name="airplayName" value="' + escapeHtml(view.airplayName) + '" placeholder="G21">'
        + '<button type="submit">Zapisz</button>'
        + (view.message ? ('<p class="' + (view.ok ? 'ok' : 'err') + '">' + escapeHtml(view.message) + '</p>') : '')
        + '</form></main></body></html>';
}

function createConfigPanel(opts) {
    var desk = opts.desk;
    var store = opts.store;
    var port = Number(opts.port || DEFAULT_PORT);
    var log = opts.log || function () {};
    var server = null;

    function publicConfig() {
        var snap = desk.snapshot();
        var rdp = snap.rdp || {};
        return {
            airplayName: snap.airplayName || 'G21',
            rdp: {
                host: (rdp.octets || [0, 0, 0, 0]).join('.'),
                port: rdp.port || 3389,
                user: rdp.user || '',
                passwordSet: store.hasSecret('rdp'),
            },
        };
    }

    function viewFromDesk(extra) {
        var cfg = publicConfig();
        return {
            host: cfg.rdp.host,
            port: cfg.rdp.port,
            user: cfg.rdp.user,
            passwordSet: cfg.rdp.passwordSet,
            airplayName: cfg.airplayName,
            ok: !!(extra && extra.ok),
            message: (extra && extra.message) || '',
        };
    }

    function applyRdp(body) {
        var host = String(body.host || body.ip || '').trim();
        var user = String(body.user || '').trim().slice(0, 64);
        var portValue = Number(body.port || 3389);
        var airplayName = String(body.airplayName || desk.airplayName()).trim();
        var password = Object.prototype.hasOwnProperty.call(body, 'password')
            ? String(body.password)
            : null;
        var setHost = desk.setRdpHost(host);
        if (!setHost.ok) {
            return setHost;
        }
        desk.setRdpPort(portValue);
        desk.setRdpUser(user);
        desk.setAirplayName(airplayName);
        store.writeSettings(desk.snapshot());
        if (password !== null && password.length) {
            store.writeSecret('rdp', password);
        }
        return { ok: true, message: 'Zapisano RDP ' + host };
    }

    function send(res, code, type, body) {
        res.writeHead(code, {
            'Content-Type': type,
            'Cache-Control': 'no-store',
        });
        res.end(body);
    }

    function onRequest(req, res) {
        var parsed = url.parse(req.url, true);
        var pathname = parsed.pathname || '/';
        if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
            send(res, 200, 'text/html; charset=utf-8', pageHtml(viewFromDesk()));
            return;
        }
        if (req.method === 'GET' && pathname === '/api/config') {
            send(res, 200, 'application/json; charset=utf-8', JSON.stringify(publicConfig()));
            return;
        }
        if (req.method === 'POST' && (pathname === '/rdp' || pathname === '/api/rdp')) {
            parseBody(req, function (err, body) {
                if (err) {
                    send(res, 400, 'text/plain; charset=utf-8', 'bad body');
                    return;
                }
                var result;
                try {
                    result = applyRdp(body || {});
                } catch (writeErr) {
                    log('config-write ' + (writeErr && writeErr.message));
                    result = { ok: false, reason: 'write-failed', message: 'Zapis nie udal sie' };
                }
                if (pathname === '/api/rdp') {
                    send(res, result.ok ? 200 : 400, 'application/json; charset=utf-8', JSON.stringify({
                        ok: !!result.ok,
                        reason: result.reason || '',
                        config: publicConfig(),
                    }));
                    return;
                }
                send(res, 200, 'text/html; charset=utf-8', pageHtml(viewFromDesk({
                    ok: !!result.ok,
                    message: result.message || result.reason || '',
                })));
            });
            return;
        }
        send(res, 404, 'text/plain; charset=utf-8', 'not found');
    }

    return {
        port: port,
        publicConfig: publicConfig,
        applyRdp: applyRdp,
        start: function () {
            if (server) {
                return { ok: true, port: port };
            }
            server = http.createServer(onRequest);
            server.on('error', function (err) {
                log('config-panel ' + (err && err.message));
            });
            server.listen(port, '0.0.0.0');
            log('config-panel :' + port);
            return { ok: true, port: port };
        },
        stop: function (done) {
            if (!server) {
                if (done) {
                    done();
                }
                return;
            }
            var current = server;
            server = null;
            current.close(done);
        },
    };
}

module.exports = {
    DEFAULT_PORT: DEFAULT_PORT,
    createConfigPanel: createConfigPanel,
};
