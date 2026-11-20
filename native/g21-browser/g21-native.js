// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/*
 * g21-native - the engine driven without its DevTools interface.
 *
 * g21-browserd was written against DevTools (CDP): e.cdp.send(method, params, session) and the events that come
 * back. An engine started with that interface tells every page so (navigator.webdriver is true), and pages that
 * sort browsers by it turn it away: Google's sign-in ("Ta przeglądarka lub aplikacja może nie być bezpieczna"),
 * Crunchyroll ("Coś poszło nie tak", its servers answer 403), most likely YouTube's refusal of a film's stream
 * (owner and stand, 2026-11-20). The same engine without the interface opens Crunchyroll (stand, the same day).
 *
 * So the engine runs as a browser a person uses, and this file stands where Cdp stood: the same send() and the same
 * events, made from two other things:
 *   - input goes to the engine's window: g21-wlframe is the display server and gives the engine a pointer, a touch
 *     screen and a keyboard (lines on its stdin);
 *   - the page's state and the daemon's orders go through an extension the engine loads (ext/): a WebSocket from
 *     its background part to the Link below, JSON both ways.
 * Only what g21-browserd uses is here. What has no counterpart without DevTools answers as if done (the screencast,
 * device emulation other than the size and scale, cookies: the engine keeps its own profile) or is refused.
 *
 * Node 8 (the head unit's): no WebSocket library, the few frames needed are made by hand.
 */
const crypto = require('crypto');
const http = require('http');

// ---------------------------------------------------------------- the line to the extension
function Link(opts) {
    this.log = (opts && opts.log) || function () {};
    this.word = crypto.randomBytes(18).toString('hex');
    this.port = 0;
    this.sock = null;
    this.server = null;
    this.next = 1;
    this.waiting = {};
    this.onEvent = function () {};
    this.onUp = function () {};
    this.onDown = function () {};
}
Link.prototype.listen = function () {
    const self = this;
    return new Promise(function (resolve, reject) {
        const srv = http.createServer(function (q, r) { r.writeHead(404); r.end(); });
        srv.on('upgrade', function (q, sock) {
            const key = q.headers['sec-websocket-key'];
            // only the engine's own extension: the word of this start, and an extension's origin
            if (!key || String(q.url) !== '/g21?w=' + self.word || !/^chrome-extension:\/\//.test(String(q.headers.origin || ''))) { try { sock.destroy(); } catch (e) { /* gone */ } return; }
            const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
            sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
            if (self.sock) { try { self.sock.destroy(); } catch (e) { /* gone */ } }
            self.sock = sock;
            sock.setNoDelay(true);
            let buf = Buffer.alloc(0), part = [];
            sock.on('data', function (d) {
                buf = buf.length ? Buffer.concat([buf, d]) : d;
                for (;;) {
                    if (buf.length < 2) return;
                    const fin = !!(buf[0] & 0x80), op = buf[0] & 15, masked = !!(buf[1] & 0x80);
                    let len = buf[1] & 127, at = 2;
                    if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); at = 4; }
                    else if (len === 127) { if (buf.length < 10) return; len = buf.readUInt32BE(2) * 4294967296 + buf.readUInt32BE(6); at = 10; }
                    if (len > 8 * 1024 * 1024) { sock.destroy(); return; }
                    if (buf.length < at + (masked ? 4 : 0) + len) return;
                    let body = buf.slice(at + (masked ? 4 : 0), at + (masked ? 4 : 0) + len);
                    if (masked) { const m = buf.slice(at, at + 4); body = Buffer.from(body); for (let i = 0; i < body.length; i++) body[i] ^= m[i & 3]; }
                    buf = buf.slice(at + (masked ? 4 : 0) + len);
                    if (op === 8) { sock.end(); return; }
                    if (op === 9) { self.frame(10, body); continue; }
                    if (op === 1 || op === 0) {
                        part.push(body);
                        if (!fin) continue;
                        const text = Buffer.concat(part).toString('utf8');
                        part = [];
                        let m = null;
                        try { m = JSON.parse(text); } catch (e) { m = null; }
                        if (m) self.got(m);
                    }
                }
            });
            sock.on('error', function () { /* close follows */ });
            sock.on('close', function () { if (self.sock === sock) { self.sock = null; self.failAll('the extension went away'); self.onDown(); } });
            self.onUp();
        });
        srv.on('error', reject);
        srv.listen(0, '127.0.0.1', function () { self.server = srv; self.port = srv.address().port; resolve(self.port); });
    });
};
Link.prototype.frame = function (op, body) {
    const s = this.sock;
    if (!s) return false;
    const n = body.length;
    let head;
    if (n < 126) { head = Buffer.alloc(2); head[1] = n; }
    else if (n < 65536) { head = Buffer.alloc(4); head[1] = 126; head.writeUInt16BE(n, 2); }
    else { head = Buffer.alloc(10); head[1] = 127; head.writeUInt32BE(0, 2); head.writeUInt32BE(n, 6); }
    head[0] = 0x80 | op;
    try { s.write(Buffer.concat([head, body])); } catch (e) { return false; }
    return true;
};
Link.prototype.got = function (m) {
    if (m.id && this.waiting[m.id]) {
        const w = this.waiting[m.id];
        delete this.waiting[m.id];
        clearTimeout(w.timer);
        if (m.ok) w.resolve(m.r); else w.reject(new Error(String(m.err || 'refused')));
        return;
    }
    if (m.ev && m.ev !== 'ping') this.onEvent(m);
};
Link.prototype.failAll = function (why) {
    const w = this.waiting;
    this.waiting = {};
    Object.keys(w).forEach(function (k) { clearTimeout(w[k].timer); w[k].reject(new Error(why)); });
};
Link.prototype.ask = function (op, params, timeoutMs) {
    const self = this;
    return new Promise(function (resolve, reject) {
        const id = self.next++;
        const msg = Object.assign({}, params || {}, { id: id, op: op });
        if (!self.frame(1, Buffer.from(JSON.stringify(msg), 'utf8'))) { reject(new Error('the extension is not connected')); return; }
        self.waiting[id] = { resolve: resolve, reject: reject, timer: setTimeout(function () { if (self.waiting[id]) { delete self.waiting[id]; reject(new Error(op + ': no answer from the extension')); } }, timeoutMs || 8000) };
    });
};
Link.prototype.close = function () {
    this.failAll('closed');
    if (this.sock) { try { this.sock.destroy(); } catch (e) { /* gone */ } this.sock = null; }
    if (this.server) { try { this.server.close(); } catch (e) { /* closed */ } this.server = null; }
};

// ---------------------------------------------------------------- send() and events, as Cdp has them
const KEYS = { Enter: 28, Backspace: 14, Tab: 15, Escape: 1, ArrowUp: 103, ArrowDown: 108, ArrowLeft: 105, ArrowRight: 106, Delete: 111, Home: 102, End: 107, PageUp: 104, PageDown: 109, F5: 63 };
const tabOf = function (session) { const m = /^tab:(\d+)$/.exec(String(session || '')); return m ? Number(m[1]) : 0; };
/*
 * opts: link (a Link that listens), input(line) (a line to g21-wlframe), product, log, exprs: the page scripts
 * g21-browserd runs by Runtime.evaluate, by name, so that each can be told from the others here:
 *   { edit: EDIT_PROBE, quiet: QUIET_PAGE, why: PLAYER_WHY }
 */
function NativeCdp(opts) {
    this.link = opts.link;
    this.input = opts.input || function () {};
    this.product = opts.product || 'Chrome';
    this.log = opts.log || function () {};
    this.exprs = opts.exprs || {};
    this.base = Number(opts.base) || 1;      // the scale the engine was started with (its zoom is on top of it)
    this.onEvent = null;
    this.onFault = null;
    this.onFullScreen = null;       // the page went into or out of full screen (the daemon looks again)
    this.tabs = {};                 // tab id -> { url, title, status }
    this.scale = {};                // tab id -> CSS pixels to window pixels (the page's zoom)
    this.up = false;
    this.upWait = [];
    this.native = true;
    /*
     * A window a page opens (window.open, a link with a target: sign-in windows of "log in with ...", which answer
     * the page that opened them and close themselves) is a tab of its own over the page's tab. The daemon knows one
     * page per view, so here such a tab stands in for its opener's: what is asked of the opener's session is asked of
     * the tab on top, what the tab on top reports is reported as the opener's, and "back" on a window that has no
     * way back closes it. When it is gone the opener's page is there again, as it was. Until 0.1.53 (and with
     * DevTools) the window's address was loaded in the page itself, and its opener was lost.
     */
    this.over = {};                 // a page's tab -> the windows open over it, the last on top
    this.owner = {};                // such a window's tab -> the page's tab
    this.rel = {};
    this.onLink = null;             // the extension's line went down (false) or is there again (true)
    const self = this;
    this.link.onEvent = function (m) { try { self.got(m); } catch (e) { if (self.onFault) self.onFault(e); } };
    this.link.onDown = function () { self.up = false; if (self.onLink) self.onLink(false); };
}
NativeCdp.prototype.root = function (tab) { return this.owner[tab] || tab; };
NativeCdp.prototype.top = function (tab) { const o = this.over[tab]; return o && o.length ? o[o.length - 1] : tab; };
// a window over a page is gone (or its page is): the page under it is on the screen again
NativeCdp.prototype.uncover = function (tab) {
    const root = this.owner[tab];
    delete this.owner[tab];
    if (!root || !this.over[root]) return;
    const wasTop = this.top(root) === tab;
    this.over[root] = this.over[root].filter(function (x) { return x !== tab; });
    if (!wasTop || !this.tabs[root]) return;
    const now = this.top(root), nt = this.tabs[now] || {};
    this.link.ask('show', { tab: now }, 4000).catch(function () {});
    this.emit('Page.frameNavigated', { frame: { id: 'main:' + root, url: nt.url || '' } }, root);
    this.emit('Target.targetInfoChanged', { targetInfo: this.info(root) });
    this.emit('Page.frameStoppedLoading', { frameId: 'main:' + root }, root);
};
NativeCdp.prototype.emit = function (method, params, tab) { if (this.onEvent) this.onEvent({ method: method, params: params, sessionId: tab ? 'tab:' + tab : undefined }); };
NativeCdp.prototype.info = function (tab) { const t = this.tabs[this.top(tab)] || {}; return { targetId: 'tab:' + tab, type: 'page', url: t.url || '', title: t.title || '', openerId: t.opener ? 'tab:' + t.opener : undefined }; };
NativeCdp.prototype.got = function (m) {
    const tab = Number(m.tab) || 0;
    if (m.ev === 'hello') {
        const before = this.tabs;
        this.tabs = {};
        (m.tabs || []).forEach((t) => { this.tabs[t.tab] = { url: t.url, title: t.title, status: t.status, active: !!t.active, opener: (before[t.tab] || {}).opener }; });
        // (the extension came again while the engine ran: the windows over pages that are still there stay so)
        Object.keys(this.owner).forEach((k) => { if (!this.tabs[k] || !this.tabs[this.owner[k]]) { const r = this.owner[k]; delete this.owner[k]; if (this.over[r]) this.over[r] = this.over[r].filter((x) => String(x) !== String(k)); } });
        const again = !this.up && Object.keys(before).length > 0;
        this.up = true;
        if (this.onLink) this.onLink(true, again);
        const w = this.upWait;
        this.upWait = [];
        w.forEach(function (f) { f(); });
        return;
    }
    if (!tab) return;
    if (m.ev === 'new') {
        const known = !!this.tabs[tab];
        const t = this.tabs[tab] || (this.tabs[tab] = { url: '', title: '', status: 'loading' });
        if (m.opener) t.opener = Number(m.opener);
        if (m.url) t.url = m.url;
        if (this.owner[tab]) return;
        const root = m.opener ? this.root(Number(m.opener)) : 0;
        if (!known && root && this.tabs[root] && (this.over[root] || []).length < 3) {
            // a window over the page that opened it, at the page's zoom
            this.owner[tab] = root;
            (this.over[root] = this.over[root] || []).push(tab);
            if (this.rel[root] && this.rel[root] !== 1) this.link.ask('zoom', { tab: tab, z: this.rel[root] }, 4000).catch(function () {});
            this.emit('Page.frameStartedLoading', { frameId: 'main:' + root }, root);
            return;
        }
        this.emit(known ? 'Target.targetInfoChanged' : 'Target.targetCreated', { targetInfo: { targetId: 'tab:' + tab, type: 'page', url: t.url || '', title: t.title || '', openerId: t.opener ? 'tab:' + t.opener : undefined } });
        return;
    }
    if (m.ev === 'gone') {
        const mine = this.over[tab] || [];
        delete this.tabs[tab]; delete this.scale[tab]; delete this.rel[tab];
        if (this.owner[tab]) { this.uncover(tab); return; }
        // a page's tab: its windows go with it
        delete this.over[tab];
        mine.forEach((w) => { delete this.owner[w]; this.link.ask('close', { tab: w }, 4000).catch(function () {}); });
        this.emit('Target.targetDestroyed', { targetId: 'tab:' + tab });
        return;
    }
    const t = this.tabs[tab] || (this.tabs[tab] = { url: '', title: '', status: '' });
    const as = this.root(tab), shown = this.top(as) === tab;
    if (m.ev === 'tab') {
        const was = t.status, title = t.title, url = t.url;
        t.status = m.status || t.status; t.url = m.url || t.url; t.title = m.title === undefined ? t.title : m.title;
        if (!shown) return;
        if (t.status === 'loading' && was !== 'loading') this.emit('Page.frameStartedLoading', { frameId: 'main:' + as }, as);
        if (t.title !== title || t.url !== url) this.emit('Target.targetInfoChanged', { targetInfo: this.info(as) });
        if (t.status === 'complete' && was !== 'complete') this.emit('Page.frameStoppedLoading', { frameId: 'main:' + as }, as);
        return;
    }
    if (m.ev === 'nav') {
        t.url = m.url || t.url;
        if (!shown) return;
        if (m.same) this.emit('Page.navigatedWithinDocument', { frameId: 'main:' + as, url: t.url }, as);
        else this.emit('Page.frameNavigated', { frame: { id: 'main:' + as, url: t.url } }, as);
        return;
    }
    if (m.ev === 'fs' && m.top !== false) { if (shown && this.onFullScreen) this.onFullScreen('tab:' + as, !!m.on); return; }
};
// the extension's first word after the engine's start
NativeCdp.prototype.ready = function (ms) {
    const self = this;
    if (this.up) return Promise.resolve();
    return new Promise(function (resolve, reject) {
        const t = setTimeout(function () { reject(new Error('the engine\'s extension did not connect in ' + ms + ' ms')); }, ms);
        self.upWait.push(function () { clearTimeout(t); resolve(); });
    });
};
NativeCdp.prototype.px = function (tab, v) { return Math.round((Number(v) || 0) * (this.scale[tab] || 1)); };
NativeCdp.prototype.evaluate = async function (tab, expr) {
    const x = this.exprs, val = function (v) { return { result: { value: v } }; };
    const ask = (op, p) => this.link.ask(op, Object.assign({ tab: tab }, p || {}), 4000);
    if (expr === '!!document.fullscreenElement') { const s = await ask('state'); return val(!!(s && s.fs)); }
    if (expr === 'document.readyState') { const s = await ask('state'); return val(s ? s.ready : 'loading'); }
    if (x.edit && expr.indexOf(x.edit) === 0) { const m = /\((-?\d+),(-?\d+)\)$/.exec(expr) || [0, 0, 0]; return val(await ask('edit', { x: Number(m[1]), y: Number(m[2]) }) || ''); }
    if (x.quiet && expr === x.quiet) { await ask('quiet'); return val(null); }
    if (x.why && expr === x.why) return val(await ask('why') || '');
    if (/exitFullscreen/.test(expr)) { await ask('exitfs'); return val(0); }
    if (/selectAll|\.select\(\)/.test(expr)) { await ask('selectall'); return val(null); }
    return val(undefined);     // (a script for a page that this engine is not asked to run: THEiPlay Player's words)
};
NativeCdp.prototype.send = async function (method, params, session, timeoutMs) {
    const p = params || {}, page = tabOf(session), tab = this.top(page), link = this.link;
    const ask = (op, q) => link.ask(op, Object.assign({ tab: tab }, q || {}), timeoutMs);
    switch (method) {
    case 'Browser.getVersion': await this.ready(timeoutMs || 20000); return { product: this.product };
    case 'Target.getTargets': return { targetInfos: Object.keys(this.tabs).filter((k) => !this.owner[k]).map((k) => this.info(Number(k))) };
    case 'Target.attachToTarget': return { sessionId: String(p.targetId) };
    case 'Target.createTarget': { const id = await link.ask('new', { url: p.url || 'about:blank' }, timeoutMs); if (!this.tabs[id]) this.tabs[id] = { url: p.url || 'about:blank', title: '', status: 'loading' }; return { targetId: 'tab:' + id }; }
    case 'Target.activateTarget': await link.ask('show', { tab: tabOf(p.targetId) }, timeoutMs); return {};
    case 'Target.closeTarget': await link.ask('close', { tab: tabOf(p.targetId) }, timeoutMs); return { success: true };
    case 'Page.getFrameTree': return { frameTree: { frame: { id: 'main:' + page, url: (this.tabs[tab] || {}).url || '' } } };
    case 'Page.navigate': await ask('nav', { url: String(p.url) }); return { frameId: 'main:' + page };
    case 'Page.reload': await ask('reload'); return {};
    case 'Page.stopLoading': await ask('stop'); return {};
    case 'Page.getNavigationHistory': {
        // (the engine does not show its list of pages to an extension: only whether there is a way back and forward)
        const s = (await ask('state')) || {}, t = this.tabs[tab] || {};
        const cur = { id: 2, url: s.url || t.url || '', title: s.title === undefined ? (t.title || '') : s.title };
        // (a window over the page always has a way back: out of it)
        const back = !!s.back || tab !== page;
        const entries = (back ? [{ id: 1, url: 'g21:back', title: '' }] : []).concat([cur], s.fwd ? [{ id: 3, url: 'g21:forward', title: '' }] : []);
        return { currentIndex: back ? 1 : 0, entries: entries };
    }
    case 'Page.navigateToHistoryEntry': {
        if (Number(p.entryId) >= 2) { await ask('fwd'); return {}; }
        if (tab !== page) { const s = (await ask('state')) || {}; if (!s.back) { await ask('close'); return {}; } }
        await ask('back');
        return {};
    }
    case 'Runtime.evaluate': return this.evaluate(tab, String(p.expression || ''));
    case 'Input.insertText': await ask('text', { s: String(p.text || '') }); return {};
    case 'Input.dispatchKeyEvent': {
        const code = KEYS[p.key] || KEYS[p.code];
        if (code) this.input('k ' + code + ' ' + (p.type === 'keyUp' ? 0 : 1) + ' 0');
        return {};
    }
    case 'Input.dispatchMouseEvent': {
        const x = this.px(page, p.x), y = this.px(page, p.y);
        if (p.type === 'mouseWheel') {
            // (one wheel event of thousands of pixels is not taken by the engine: steps of a knob's size)
            let d = Math.round((Number(p.deltaY) || 0) * (this.scale[page] || 1) / 12);
            this.input('pm ' + x + ' ' + y);
            for (let i = 0; d && i < 40; i++) { const s = Math.max(-30, Math.min(30, d)); this.input('pa ' + s); d -= s; }
            return {};
        }
        this.input('pm ' + x + ' ' + y);
        if (p.type === 'mousePressed') this.input('pb 0 1');
        else if (p.type === 'mouseReleased') this.input('pb 0 0');
        return {};
    }
    case 'Input.dispatchTouchEvent': {
        const pts = p.touchPoints || [];
        if (p.type === 'touchEnd' || p.type === 'touchCancel') { this.input('tu 1'); return {}; }
        if (pts[0]) this.input((p.type === 'touchStart' ? 'td' : 'tm') + ' 1 ' + this.px(page, pts[0].x) + ' ' + this.px(page, pts[0].y));
        return {};
    }
    case 'Emulation.setDeviceMetricsOverride': {
        // the window's size is g21-wlframe's (the daemon tells it). The page's scale is the one the engine was started
        // with; another one (a player's full screen at a zoom other than 100 %) is the tab's zoom on top of it.
        const z = Number(p.deviceScaleFactor) || 1, rel = Math.round(z / this.base * 1000) / 1000;
        this.scale[page] = z;
        if (rel !== this.rel[page]) {
            this.rel[page] = rel;
            try { await link.ask('zoom', { tab: page, z: rel }, timeoutMs); if (tab !== page) await ask('zoom', { z: rel }); } catch (e) { this.log('zoom: ' + e.message); }
        }
        return {};
    }
    case 'Storage.getCookies': return { cookies: [] };
    case 'Browser.close': try { await link.ask('quit', {}, timeoutMs || 1500); } catch (e) { /* its line ends with it */ } return {};
    case 'Target.setDiscoverTargets': case 'Page.enable': case 'Log.enable': case 'Media.enable': case 'Browser.setDownloadBehavior':
    case 'Emulation.setTouchEmulationEnabled': case 'Emulation.setFocusEmulationEnabled': case 'Emulation.setUserAgentOverride':
    case 'Emulation.setTimezoneOverride': case 'Page.addScriptToEvaluateOnNewDocument': case 'Page.setWebLifecycleState': case 'Page.bringToFront':
    case 'Page.stopScreencast': case 'Page.startScreencast': case 'Page.screencastFrameAck': case 'Storage.setCookies': case 'Page.resetNavigationHistory':
    case 'Page.handleJavaScriptDialog':
        return {};
    default: throw new Error(method + ': not without DevTools');
    }
};
NativeCdp.prototype.close = function () { this.link.close(); };

module.exports = { Link: Link, NativeCdp: NativeCdp, KEYS: KEYS };
