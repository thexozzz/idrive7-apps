// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * A live sound stream through BMW's own media player, the way jap-ridetube-d (RideTube) plays a film's sound:
 * the audio manager connects the generic media source (1046) to the front speakers (1024) and the media
 * player (instance OapGenericMedia) is told to play. The car's own engine then does the output.
 *
 * Why: the SmartX input G21 Audio wrote into (CarLifeMedia) takes sound only three quarters of the time
 * (car, 2026-11-15: 36 000 of 48 000 frames a second whichever way it is written to), so everything that
 * went through it was cut, or slow. RideTube never had that: it does not write to a device at all.
 *
 * The media player wants something to open. Tried on the car (2026-11-15, a quiet tone):
 *   a WAV file            plays, 0.8 s after playFile, its time runs evenly
 *   a pipe                is not read at all
 *   a WAV being appended  stops where the file ended when it was opened
 * So two ways are here, chosen by the caller; which one the player takes, and how late the sound then is, is
 * NOT known yet (to be tried on the car):
 *   "http"  the player is given http://127.0.0.1:<port>/live.wav, a WAV without an end sent as it comes. The
 *           engine's configuration names live streams with a prebuffer of 350 ms.
 *   "file"  a WAV file as long as four hours from the start (sparse: only what is written takes room), the
 *           sound written a little ahead of where the player is (leadMs).
 *
 * Root, Node 8, the unit's /usr/lib/someip.node and the interface descriptions in /usr/lib/oap-mainapp/src-gen
 * (the files jap-ridetube-d reads): nothing of BMW's is shipped.
 */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');

const SOURCE = 1046;                // OAPGenericMedia
const SINK = 1024;                  // MediaSink_Front
const RATE = 48000, FRAME = 4, BYTES_MS = RATE * FRAME / 1000;
const FILE_MS = 4 * 3600 * 1000;

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function wavHeader(dataBytes) {
    const h = Buffer.alloc(44);
    h.write('RIFF', 0); h.writeUInt32LE(Math.min(0xffffffff, 36 + dataBytes) >>> 0, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16);
    h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * FRAME, 28); h.writeUInt16LE(FRAME, 32); h.writeUInt16LE(16, 34);
    h.write('data', 36); h.writeUInt32LE(Math.min(0xffffffff, dataBytes) >>> 0, 40);
    return h;
}

function MediaOut(opts) {
    const o = opts || {};
    this.log = o.log || function () {};
    this.mode = o.mode === 'file' ? 'file' : 'http';
    this.leadMs = o.leadMs > 50 && o.leadMs < 5000 ? o.leadMs : 600;
    this.dir = o.dir || '/var/opt/g21-audio/media';
    this.someip = o.someip || '/usr/lib/someip.node';
    this.srcGen = o.srcGen || '/usr/lib/oap-mainapp/src-gen';
    this.cc = null; this.mp = null;
    this.conn = null; this.previous = null;
    this.server = null; this.clients = []; this.port = 0;
    this.fd = -1; this.file = ''; this.at = 0;             // file mode: where the next sound goes (ms of sound)
    this.playMs = -1; this.playAt = 0; this.playing = false;
    this.started = false; this.bytes = 0; this.jumps = 0; this.sentTo = 0;
    this.state = ''; this.err = '';
}
MediaOut.prototype._proxies = async function () {
    if (this.cc && this.mp) return;
    const someip = typeof this.someip === 'string' ? require(this.someip) : this.someip;
    const self = this;
    const cfg = function (f) { return JSON.parse(fs.readFileSync(path.join(self.srcGen, f), 'utf8')); };
    const cc = await someip.buildProxy(cfg('org_genivi_am_commandinterface_CommandControl.json'), '1');
    await cc.init();
    const mp = await someip.buildProxy(cfg('de_bmw_infotainment_entertainment_mediaplayer_MediaPlayer.json'), 'OapGenericMedia');
    await mp.init();
    const safe = function (fn) { return function (v) { try { fn(v); } catch (e) { self.log('media: handler ' + (e && e.message || e)); } }; };
    mp.subscribe({ name: 'playerState', onReceive: safe(function (v) { const s = String(v); if (s !== self.state) { self.state = s; self.playing = s === 'PLAYER_STATE_PLAY'; self.log('media: ' + s); } }) });
    mp.subscribe({ name: 'currentItemTime', onReceive: safe(function (v) { if (v && typeof v.elapsed === 'number') { self.playMs = v.elapsed; self.playAt = Date.now(); } }) });
    mp.subscribe({ name: 'playbackErrorEvent', onReceive: safe(function (v) { self.err = JSON.stringify(v).slice(0, 160); self.log('media: playback error ' + self.err); }) });
    const until = Date.now() + 8000;
    while (!(await cc.isAvailable()) || !(await mp.isAvailable())) { if (Date.now() > until) throw new Error('the audio manager or the media player is not available'); await sleep(100); }
    this.cc = cc; this.mp = mp;
};
// where the player is now, in ms of the item (its last report, carried on by the clock)
MediaOut.prototype.now = function () { return this.playMs < 0 ? -1 : this.playMs + (this.playing ? Date.now() - this.playAt : 0); };
MediaOut.prototype.start = async function () {
    if (this.started) return;
    this.started = true;
    await this._proxies();
    const list = await this.cc.getValue('listOfMainConnections');
    const other = (Array.isArray(list) ? list : []).filter(function (c) { return c && c.sinkID === SINK && c.sourceID !== SOURCE; })[0];
    this.previous = other ? other.sourceID : null;
    const r = await this.cc.callMethod('connect', { sourceID: SOURCE, sinkID: SINK }, 5000);
    if (!r || (r.amError !== 'E_OK' && r.amError !== 'E_ALREADY_EXISTS')) throw new Error('audio connect: ' + (r && r.amError));
    this.conn = r.mainConnectionID === undefined || r.mainConnectionID === null ? -1 : r.mainConnectionID;
    let what;
    if (this.mode === 'http') {
        what = await this._serve();
    } else {
        try { fs.mkdirSync(this.dir); } catch (e) { /* there */ }
        fs.chmodSync(this.dir, 0o755);
        fs.readdirSync(this.dir).filter(function (n) { return /^live-\d+\.wav$/.test(n); }).forEach((n) => { try { fs.unlinkSync(path.join(this.dir, n)); } catch (e) { /* in use */ } });
        this.file = path.join(this.dir, 'live-' + Date.now() + '.wav');
        this.fd = fs.openSync(this.file, 'w', 0o644);
        fs.writeSync(this.fd, wavHeader(FILE_MS * BYTES_MS), 0, 44, 0);
        fs.ftruncateSync(this.fd, 44 + FILE_MS * BYTES_MS);
        fs.chmodSync(this.file, 0o644);
        this.at = this.leadMs;
        what = this.file;
    }
    this.playMs = -1; this.state = '';
    const p = await this.mp.callMethod('playFile', { path: what, languageCode: 7695972 }, 5000);
    if (!p || p.EntError !== 'OK') throw new Error('playFile: ' + (p && p.EntError));
    this.log('media: playing ' + (this.mode === 'http' ? 'a live stream (' + what + ')' : 'a file written ' + this.leadMs + ' ms ahead') + ', speakers from source ' + this.previous);
};
MediaOut.prototype._serve = function () {
    const self = this;
    return new Promise(function (resolve, reject) {
        const srv = http.createServer(function (req, res) {
            self.log('media: the player asks ' + req.method + ' ' + String(req.url).slice(0, 60) + (req.headers.range ? ' range ' + req.headers.range : ''));
            if (!/^\/live\.wav/.test(req.url || '')) { res.writeHead(404); res.end(); return; }
            // no length, no ranges: a stream that has no end
            res.writeHead(200, { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store', Connection: 'close', 'Accept-Ranges': 'none', 'icy-name': 'THEiPlay' });
            if (req.method === 'HEAD') { res.end(); return; }
            res.write(wavHeader(0xffffffff - 36));
            self.clients.push(res);
            const gone = function () { const i = self.clients.indexOf(res); if (i >= 0) self.clients.splice(i, 1); };
            res.on('close', gone); res.on('error', gone);
        });
        srv.on('error', reject);
        srv.listen(0, '127.0.0.1', function () { self.server = srv; self.port = srv.address().port; resolve('http://127.0.0.1:' + self.port + '/live.wav'); });
    });
};
/** sound: S16LE, 48 kHz, stereo, whole frames */
MediaOut.prototype.write = function (buf) {
    if (!this.started || !buf.length) return;
    this.bytes += buf.length;
    if (this.mode === 'http') {
        for (let i = 0; i < this.clients.length; i++) {
            const c = this.clients[i];
            // (a player that does not take it: left out rather than kept, it is live)
            if (c.connection && c.connection.bufferSize > 400 * BYTES_MS) continue;
            try { c.write(buf); this.sentTo = this.bytes; } catch (e) { /* its close follows */ }
        }
        return;
    }
    if (this.fd < 0) return;
    const play = this.now();
    if (play >= 0) {
        // kept a little ahead of the player: behind it nothing would be heard, far ahead it would be late
        const want = play + this.leadMs;
        if (this.at < play + 80 || this.at > want + 400) { this.at = want; this.jumps += 1; }
    }
    const pos = 44 + Math.floor(this.at * BYTES_MS / FRAME) * FRAME;
    if (pos + buf.length > 44 + FILE_MS * BYTES_MS) return;
    try { fs.writeSync(this.fd, buf, 0, buf.length, pos); } catch (e) { this.err = e.message; }
    this.at += buf.length / BYTES_MS;
};
/** the item ended, or was stopped by something else: played again from its beginning */
MediaOut.prototype.again = function () {
    if (!this.started || !this.mp || !this.file) return Promise.resolve();
    this.playMs = -1;
    return this.mp.callMethod('playFile', { path: this.file, languageCode: 7695972 }, 5000).then(function () {}, function () {});
};
MediaOut.prototype.stats = function () {
    return 'media ' + this.mode + ': ' + Math.round(this.bytes / BYTES_MS) + ' ms of sound in, player ' + (this.state || '?') + ' at ' + Math.round(this.now()) + ' ms'
        + (this.mode === 'file' ? ', written to ' + Math.round(this.at) + ' ms, moved ' + this.jumps + ' times' : ', ' + this.clients.length + ' listening')
        + (this.err ? ', error ' + this.err : '');
};
MediaOut.prototype.stop = async function () {
    if (!this.started) return;
    this.started = false;
    const self = this;
    const tryIt = function (p) { return p.then(function (r) { return r; }, function (e) { self.log('media: ' + (e && e.message || e)); }); };
    if (this.mp) await tryIt(this.mp.callMethod('sendButtonEvent', { button: 'STOP', action: 'PRESS' }, 3000));
    this.clients.forEach(function (c) { try { c.end(); } catch (e) { /* gone */ } });
    this.clients = [];
    if (this.server) { try { this.server.close(); } catch (e) { /* closed */ } this.server = null; }
    if (this.fd >= 0) { try { fs.closeSync(this.fd); } catch (e) { /* closed */ } this.fd = -1; }
    if (this.file) { try { fs.unlinkSync(this.file); } catch (e) { /* gone */ } this.file = ''; }
    if (this.cc && this.conn !== null) {
        if (this.conn !== -1) await tryIt(this.cc.callMethod('disconnect', { mainConnectionID: this.conn }, 5000));
        if (this.previous) await tryIt(this.cc.callMethod('connect', { sourceID: this.previous, sinkID: SINK }, 5000));
    }
    this.conn = null;
    this.log('media: stopped, ' + this.stats());
};

module.exports = { MediaOut: MediaOut, wavHeader: wavHeader, SOURCE: SOURCE, SINK: SINK };
