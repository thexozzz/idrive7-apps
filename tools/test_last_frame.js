'use strict';

// The last frame must not stay: the iPhone left while AirPlay is still on, a YouTube film was stopped,
// has finished or failed, a YouTube screen was switched off. And the tool's look through /proc costs
// no process per look (0.1.51/0.1.52 forked `tr` for every process, several looks a second).
var assert = require('assert');
var cp = require('child_process');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var main = fs.readFileSync(path.join(root, 'apps', 'g21_airplay', 'src', 'main.js'), 'utf8');
var tool = fs.readFileSync(path.join(root, 'native', 'g21-airplay-open', 'g21-airplay-open'), 'utf8');

function method(name, args) {
    var m = new RegExp('AirPlayApp\\.prototype\\.' + name + ' = (function \\([^)]*\\) \\{[\\s\\S]*?\\r?\\n\\});').exec(main);
    assert.ok(m, name + ' found');
    return new Function('noteStart', 'fs', 'KOMBI_YUV', 'KOMBI_GAP_MS', 'return ' + m[1])(function () {}, (args && args.fs) || fs, '/nonexistent/kombi.yuv', 41);
}

// ---- YouTube on the cluster / HUD follows the player, not ytdec's file alone
var takeYoutube = method('_takeYoutube');
function ytApp(state) {
    return {
        _ytCluster: true, _ytHud: false, _ytLive: false, _ytFrame: null, _ytGaugeFrame: null, _ytGaugeOuts: '',
        _sessions: { active: function () { return null; } },
        _ytModel: { state: state },
        pulls: 0, placed: 0, drops: 0, next: { i420: Buffer.alloc(6), w: 2, h: 2 },
        _ytFile: null,
        _placeMirrorFaces: function () { this.placed += 1; return true; },
        _dropYoutubeFaces: function () { this.drops += 1; this._ytGaugeFrame = null; },
        _paintYoutube: function () {}
    };
}
var yt = ytApp('playing');
yt._ytFile = { pull: function () { yt.pulls += 1; var f = yt.next; yt.next = false; return f; } };
takeYoutube.call(yt);
assert.strictEqual(yt.placed, 1, 'playing: the frame goes to the cluster');
assert.strictEqual(yt._ytLive, true);
yt._ytModel.state = 'paused';
takeYoutube.call(yt);
assert.strictEqual(yt.drops, 0, 'paused: the picture stays');
['ended', 'idle', 'error', 'preparing'].forEach(function (state) {
    var a = ytApp('playing');
    a._ytFile = { pull: function () { a.pulls += 1; var f = a.next; a.next = false; return f; } };
    takeYoutube.call(a);
    a._ytModel.state = state;
    var before = a.pulls;
    takeYoutube.call(a);
    assert.strictEqual(a.drops, 1, state + ': the film\'s last frame leaves the cluster and the HUD');
    assert.strictEqual(a._ytLive, false);
    assert.strictEqual(a.pulls, before, state + ': the stale file is not read');
    takeYoutube.call(a);
    assert.strictEqual(a.drops, 1, state + ': dropped once');
});

// a YouTube screen switched off leaves even when AirPlay's saved screens name it (no AirPlay running)
var setYt = method('_setYtScreen');
function scrApp(airplayOn) {
    return {
        _ytCentral: true, _ytCluster: true, _ytHud: true, dropped: [],
        _desk: {}, _saveDesk: function () {}, _useYoutube: function () {}, _paintYoutube: function () {},
        _sessions: { active: function () { return airplayOn ? 'airplay' : null; } },
        _settings: { outputs: function () { return ['central', 'cluster', 'hud']; } },
        _dropMirrorFace: function (n) { this.dropped.push(n); }
    };
}
var sc = scrApp(false);
setYt.call(sc, 'cluster', false);
assert.deepStrictEqual(sc.dropped, ['cluster'], 'cluster off: its layer goes (saved AirPlay screens do not keep it)');
sc = scrApp(true);
setYt.call(sc, 'cluster', false);
assert.deepStrictEqual(sc.dropped, [], 'a running AirPlay keeps its own cluster picture');

// ---- AirPlay: the iPhone left
var gone = method('_airPictureGone');
var air = {
    _decoded: { w: 600, h: 276 }, _ringActive: true, _ringIno: '7', _lastFrame: {}, dropped: 0, rebound: 0, refreshed: 0, full: null,
    _setAirFull: function (on) { this.full = on; },
    _dropMirror: function () { this._decoded = null; this.dropped += 1; },
    _menu: { rebindVideo: function () { air.rebound += 1; } },
    _refreshAirBadge: function () { this.refreshed += 1; }
};
gone.call(air, 'client idle');
assert.strictEqual(air.dropped, 1, 'the mirror (centre file, cluster and HUD layers) is dropped');
assert.strictEqual(air._decoded, null);
assert.strictEqual(air._ringActive, false);
assert.strictEqual(air.full, false, 'full screen ends');
assert.ok(air.rebound === 1 && air.refreshed === 1 && air._airGoneAt > 0);
gone.call(air, 'ring off');
assert.strictEqual(air.dropped, 1, 'nothing shown: nothing to drop twice');
assert.ok(/this\._airSawMirror = true;[\s\S]{0,400}client\.state === 'idle'[\s\S]{0,200}this\._airPictureGone\('client '/.test(main), 'the client file: mirroring, then idle / error / none = gone');
assert.ok(/else if \(this\._ringActive\) \{[\s\S]{0,200}this\._airPictureGone\('ring off'\)/.test(main), 'the ring\'s status gone = the picture gone');
assert.ok(/this\._airGoneAt = 0;\r?\n\s*this\._airSawMirror = false;/.test(main), 'a new AirPlay start forgets it');

// ---- the tool: the picture is dropped when the iPhone leaves and before a new UxPlay
assert.ok(/client_state "idle\|disconnected"[\s\S]{0,200}drop_picture/.test(tool), 'watcher: disconnected -> drop_picture');
assert.ok(/: > "\$UXLOG"\n[^\n]*\n    drop_picture\n/.test(tool), 'a new UxPlay starts with no old picture');
var dp = tool.slice(tool.indexOf('drop_picture() {'), tool.indexOf('}', tool.indexOf('drop_picture() {')) + 1);
assert.ok(/ring_pids/.test(dp) && /latest\.yuv/.test(dp) && /\$RINGSTATUS/.test(dp) && /kombi\.yuv/.test(dp), 'drop_picture: ring, status, frames');

// ---- the tool: /proc looks cost no process each, and idle rounds do not look at all
var pm = tool.slice(tool.indexOf('procs_matching() {'), tool.indexOf('\n}\n', tool.indexOf('procs_matching() {')) + 3);
assert.ok(!/\$\(/.test(pm) && /IFS= read -r c < "\$f"/.test(pm), 'procs_matching: the shell reads the line itself (no fork per process)');
assert.ok(/SWEEP_N=\$\(\( \(SWEEP_N \+ 1\) % 20 \)\)/.test(tool), 'orphan sweep every 20th round');
['stop_ux', 'stop_present', 'stop_rdp', 'stop_mice', 'stop_bundled_avahi', 'stop_ring'].forEach(function (fn) {
    var at = tool.indexOf('\n' + fn + '() {');
    var body = tool.slice(at, tool.indexOf('\n}\n', at));
    assert.ok(/sweep_due/.test(body), fn + ': looks through /proc only with a PID to stop or on a sweep round');
});
if (process.platform === 'linux') {
    // the helpers as the tool has them: find a process by its joined command line, stop it
    var helpers = 'set -u\nSWEEP_N=0\n' + pm + tool.slice(tool.indexOf('kill_matching() {'), tool.indexOf('\n}\n', tool.indexOf('kill_matching() {')) + 3);
    var sl = cp.spawn('sleep', ['37']);
    var found = cp.spawnSync('sh', ['-c', helpers + "\nprocs_matching '*sleep*37*'"], { encoding: 'utf8' }).stdout.split('\n');
    assert.ok(found.indexOf(String(sl.pid)) >= 0, 'procs_matching finds sleep 37: ' + found.join(','));
    cp.spawnSync('sh', ['-c', helpers + "\nkill_matching '*sleep*37*'"]);
    var left = cp.spawnSync('sh', ['-c', helpers + "\nsleep 0.2; procs_matching '*sleep*37*'"], { encoding: 'utf8' }).stdout.trim();
    assert.strictEqual(left, '', 'kill_matching stopped it');
    sl.kill();
}

console.log('test_last_frame OK');
