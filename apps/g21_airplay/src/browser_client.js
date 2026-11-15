'use strict';

/*
 * browser_client.js - THEiPlay's link to g21-browserd (native/g21-browser), the daemon behind
 * "Przeglądarka". JSON lines on /run/g21-browser/ctl.sock; reconnects every 2 s while the browser
 * is open.
 *
 *   App -> daemon: open{w,h} (the page area in screen pixels) nav{url} home back fwd reload stop
 *                  touch{p:1|2|3,x,y} scroll{dx,dy} text{s,replace,enter} key{k} zoom{z} close
 *   Daemon -> app: state{engine:off|unpacking|starting|ready|failed, err, url, title, loading, back,
 *                  fwd, live, w, h, ino, zoom, editable, pct, ring}
 *                  edit{kind,value,submit}: a tap landed in a text field, open the keyboard
 *
 * The page picture does not come here: the daemon's decoder writes the video file state.ring names
 * and the renderer draws it (menu_draw.js names the file to it; a new ino means name it again).
 * The daemon stops the engine a little after this socket closes, so leaving the screen frees its
 * memory and a quick return still finds the page.
 *
 * Node 8.
 */
var net = require('net');

var SOCKET = '/run/g21-browser/ctl.sock';
var MAX_LINE = 65536;

function blank() {
    return {
        connected: false, engine: 'off', err: '', url: '', title: '', loading: false, back: false, fwd: false,
        live: false, w: 0, h: 0, ino: 0, zoom: 1.5, editable: false, pct: 0, ring: '', ask: '', pol: null, fs: false, film: null
    };
}

function createBrowserClient(opts) {
    var options = opts || {};
    var file = options.socket || SOCKET;
    var note = options.note || function () {};
    var sock = null;
    var up = false;
    var buf = '';
    var want = null;        // { w, h }: the page area; null: the browser is closed
    var retry = null;
    var state = blank();
    var failNoted = false;

    function tell() {
        if (typeof options.onState === 'function') {
            options.onState(state);
        }
    }

    function send(obj) {
        if (!up || !sock) {
            return false;
        }
        try {
            sock.write(JSON.stringify(obj) + '\n');
        } catch (err) {
            return false;
        }
        return true;
    }

    function onLine(line) {
        var m;
        try {
            m = JSON.parse(line);
        } catch (err) {
            return;
        }
        if (!m || typeof m.ev !== 'string') {
            return;
        }
        if (m.ev === 'state') {
            state = {
                connected: true,
                engine: String(m.engine || 'off'),
                err: String(m.err || ''),
                url: String(m.url || ''),
                title: String(m.title || ''),
                loading: !!m.loading,
                back: !!m.back,
                fwd: !!m.fwd,
                live: !!m.live,
                w: m.w | 0,
                h: m.h | 0,
                ino: Number(m.ino) || 0,
                zoom: Number(m.zoom) || 1.5,
                editable: !!m.editable,
                pct: m.pct | 0,
                ring: String(m.ring || ''),
                // what the daemon needs the owner to decide ("sandbox"), or ''
                ask: String(m.ask || ''),
                // the daemon's rules that the menu shows and sets (g21-browser's policy)
                pol: m.pol && typeof m.pol === 'object' ? { sandbox: String(m.pol.sandbox || ''), picture: Number(m.pol.picture) || 0, memoryLimitMb: Number(m.pol.memoryLimitMb) || 0,
                    homepage: String(m.pol.homepage || ''), autoplay: String(m.pol.autoplay || ''), fullscreen: String(m.pol.fullscreen || ''), carData: String(m.pol.carData || ''), carDiag: String(m.pol.carDiag || ''), video: String(m.pol.video || ''), engine: String(m.pol.engine || ''), audio: String(m.pol.audio || ''), sound: String(m.pol.sound || '') } : null,
                // a player of the page is in full screen and the picture is the whole centre screen
                fs: !!m.fs,
                // THEiPlay Player has the screen: what its buttons show
                film: m.film && typeof m.film === 'object' ? { loading: !!m.film.loading, paused: !!m.film.paused, pos: Number(m.film.pos) || 0, dur: Number(m.film.dur) || 0,
                    q: String(m.film.q || 'auto'), fill: !!m.film.fill, seek: !!m.film.seek } : null
            };
            tell();
        } else if (m.ev === 'tube' && typeof options.onTube === 'function') {
            // a YouTube film of a page: for the app's YouTube player
            options.onTube(String(m.id || ''));
        } else if (m.ev === 'sysinfo' && typeof options.onSys === 'function') {
            // the head unit, for Ustawienia > O systemie: short texts
            var sys = {};
            ['cpu', 'mem', 'gpu', 'apps', 'disk', 'tmp', 'os', 'usb'].forEach(function (k) {
                sys[k] = String((m.info && m.info[k]) || '').slice(0, 120);
            });
            options.onSys(sys);
        } else if (m.ev === 'apps' && typeof options.onApps === 'function') {
            // the apps imported from git (Sklep): [{ id, name, repo, mouse }]
            options.onApps((Array.isArray(m.list) ? m.list : []).filter(function (a) { return a && /^[a-z0-9-]{1,60}$/.test(String(a.id)); }).map(function (a) {
                return { id: String(a.id), name: String(a.name || a.id).slice(0, 40), repo: String(a.repo || ''), mouse: a.mouse === 'yes' ? 'yes' : 'no' };
            }));
        } else if (m.ev === 'app' && typeof options.onApp === 'function') {
            options.onApp({ phase: String(m.phase || ''), pct: m.pct | 0, err: String(m.err || ''), id: String(m.id || ''), name: String(m.name || '') });
        } else if (m.ev === 'edit' && typeof options.onEdit === 'function') {
            options.onEdit({ kind: String(m.kind || 'text'), value: String(m.value || ''), submit: !!m.submit, multi: !!m.multi });
        }
    }

    // the page area, the whole screen (for full screen) and, for an app from Sklep, which
    function openMsg() {
        var o = { op: 'open', w: want.w, h: want.h };
        if (want.fw && want.fh) {
            o.fw = want.fw;
            o.fh = want.fh;
        }
        if (want.app) {
            o.app = want.app;
        }
        // a first page asked for: once, not again when the daemon is connected anew
        if (want.url) {
            o.url = want.url;
            want.url = '';
        }
        return o;
    }

    function connect() {
        var s;
        clearTimeout(retry);
        retry = null;
        if (!want || sock) {
            return;
        }
        s = net.createConnection(file);
        sock = s;
        s.setEncoding('utf8');
        s.on('connect', function () {
            if (sock !== s) {
                return;
            }
            up = true;
            buf = '';
            failNoted = false;
            note('web-up');
            if (want.w) {
                send(openMsg());
            }
            send({ op: 'apps' });
        });
        s.on('data', function (d) {
            var i;
            if (sock !== s) {
                return;
            }
            buf += d;
            if (buf.length > MAX_LINE && buf.indexOf('\n') < 0) {
                buf = '';
                return;
            }
            while ((i = buf.indexOf('\n')) >= 0) {
                onLine(buf.slice(0, i));
                buf = buf.slice(i + 1);
            }
        });
        s.on('error', function (err) {
            if (!failNoted) {
                failNoted = true;
                note('web-sock ' + ((err && err.code) || err));
            }
        });
        s.on('close', function () {
            var was;
            if (sock !== s) {
                return;
            }
            was = up;
            sock = null;
            up = false;
            state = blank();
            if (was) {
                note('web-down');
            }
            tell();
            if (want) {
                retry = setTimeout(connect, 2000);
            }
        });
    }

    function drop(last) {
        var s = sock;
        want = null;
        clearTimeout(retry);
        retry = null;
        sock = null;
        if (s) {
            try {
                if (last && up) {
                    s.end(JSON.stringify(last) + '\n');
                } else {
                    s.destroy();
                }
            } catch (err) {
                s.destroy();
            }
        }
        up = false;
        state = blank();
    }

    return {
        /** show the browser in a page area of w x h screen pixels */
        open: function (w, h, app, fw, fh, url) {
            want = { w: w | 0, h: h | 0, app: app ? String(app) : '', fw: fw | 0, fh: fh | 0, url: url ? String(url) : '' };
            if (up) {
                send(openMsg());
            } else {
                connect();
            }
        },
        /** only the daemon's state (its rules), no page: for Aplikacje > Ustawienia */
        look: function () {
            if (want && want.w) {
                return;
            }
            want = { w: 0, h: 0 };
            if (!up) {
                connect();
            }
        },
        /** leave the screen: the socket closes, the daemon stops the engine a little later */
        leave: function () {
            drop(null);
        },
        /** the app is switched off: the engine stops now */
        shutdown: function () {
            drop({ op: 'close' });
        },
        send: send,
        state: function () {
            return state;
        },
        isOpen: function () {
            return !!(want && want.w);
        }
    };
}

module.exports = {
    createBrowserClient: createBrowserClient,
    blank: blank,
    SOCKET: SOCKET
};
