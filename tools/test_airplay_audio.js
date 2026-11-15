'use strict';

// AirPlay sound: g21-audio-route.js connects a free SmartX source to the speakers through the audio
// manager (as jap-ridetube-d does), and the tool finds processes through /proc (no pgrep on this BusyBox).
var assert = require('assert');
var cp = require('child_process');
var fs = require('fs');
var os = require('os');
var path = require('path');

var root = path.join(__dirname, '..');
var tooldir = path.join(root, 'native', 'g21-airplay-open');
var tool = fs.readFileSync(path.join(tooldir, 'g21-airplay-open'), 'utf8');
var component = JSON.parse(fs.readFileSync(path.join(tooldir, 'component.json'), 'utf8'));
var js = path.join(tooldir, 'g21-audio-route.js');

assert.ok(!/^\s*[^#\n]*\bpgrep\b/m.test(tool), 'no pgrep call in the tool');
assert.ok(!/^\s*[^#\n]*\bpkill\b/m.test(tool), 'no pkill call in the tool');
assert.ok(/procs_matching\(\)/.test(tool) && /kill_matching\(\)/.test(tool), '/proc helpers');
assert.ok(component.files.some(function (f) { return f.path === 'g21-audio-route.js'; }), 'component ships the route helper');
assert.ok(/audio_dev=\$\(audio_route_connect\)/.test(tool), 'route before UxPlay starts');
assert.ok(/stop_ux\(\) \{\n    had_ux=\$UXPID\n    stop_ring\n    audio_route_disconnect/.test(tool), 'route dropped when UxPlay stops');
assert.ok(/LD_PRELOAD=\/usr\/lib\/libasound\.so\.2/.test(tool), "UxPlay uses the car's libasound");
// node for the route in a clean environment: not UxPlay's bundled libs, not g21-bind-wlan.so (it pinned
// SOME/IP to the iPhone hotspot: no route, no sound in 0.1.132)
var an = tool.slice(tool.indexOf('audio_node() {'), tool.indexOf('audio_route_connect() {'));
['LD_LIBRARY_PATH', 'LD_PRELOAD', 'G21_BIND_IP'].forEach(function (v) { assert.ok(new RegExp('unset[^)]*' + v).test(an), 'audio_node clears ' + v); });
assert.ok(/audio_node "\$js" connect/.test(tool) && /audio_node "\$js" disconnect/.test(tool), 'both calls go through audio_node');
// the clean environment really drops them (run the helper as the tool has it)
// (the two shell parts need a POSIX sh with /proc: on Windows they say SKIP, nothing is reported as passed untested)
var posix = os.platform() !== 'win32';
var skipped = 0;
if (posix) {
    var envRun = cp.spawnSync('sh', ['-c', an.replace('exec /usr/bin/node "$@"', 'exec env') + '\naudio_node'], {
        encoding: 'utf8', env: Object.assign({}, process.env, { LD_PRELOAD: '/x/g21-bind-wlan.so', G21_BIND_IP: '172.20.10.3', LD_LIBRARY_PATH: '/x/lib' })
    });
    assert.ok(!envRun.error, 'sh runs: ' + (envRun.error && envRun.error.message));
    var envOut = envRun.stdout;
    assert.ok(/^PATH=/m.test(envOut), 'env printed something');
    assert.ok(!/^(LD_PRELOAD|G21_BIND_IP|LD_LIBRARY_PATH)=/m.test(envOut), 'clean env: ' + envOut.split('\n').filter(function (l) { return /^(LD_|G21_)/.test(l); }).join(' '));
} else { skipped += 1; console.log('SKIP audio_node clean environment: needs a POSIX sh'); }
assert.ok(/alsasink device=smartx:\$audio_dev/.test(tool), 'sink follows the routed device');
// 0.1.54: G21 Audio first (a FIFO UxPlay writes S16LE 48 kHz stereo into, in step with the clock); the old route only without it
assert.ok(/audio_fifo=\$\(g21_audio_open\)/.test(tool) && /filesink location=\$audio_fifo sync=true/.test(tool) && /format=S16LE,rate=48000,channels=2/.test(tool), 'AirPlay sound goes to G21 Audio');
assert.ok(tool.indexOf('audio_fifo=$(g21_audio_open)') < tool.indexOf('audio_dev=$(audio_route_connect)'), 'G21 Audio is tried before the old route');
assert.ok(/audio_route_disconnect\n    g21_audio_close/.test(tool), 'the stream is closed when UxPlay stops');
assert.ok(/hold airplay 0/.test(tool) && fs.existsSync(path.join(root, 'native', 'g21-audio', 'g21-audio-client.js')), 'the stream is held by g21-audio\'s client');

// Fake audio manager: records calls in calls.json.
var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g21-audio-'));
var smartx = path.join(dir, 'smartx');
fs.mkdirSync(smartx);
['CarPlayMain', 'CarLifeMedia', 'AndroidAutoMedia'].forEach(function (n) {
    fs.writeFileSync(path.join(smartx, 'smartx_' + n + '_CF_48_STEREO_p'), '');
});
fs.writeFileSync(path.join(smartx, 'smartx_CarLifeMedia_CF_48_STEREO_p.lock'), ''); // held: skip it
var calls = path.join(dir, 'calls.json');
fs.writeFileSync(calls, '[]');
var fake = path.join(dir, 'someip.js');
fs.writeFileSync(fake, [
    "var fs=require('fs');var F=" + JSON.stringify(calls) + ";",
    "function rec(c){var a=JSON.parse(fs.readFileSync(F,'utf8'));a.push(c);fs.writeFileSync(F,JSON.stringify(a));}",
    "exports.buildProxy=function(cfg,inst){return Promise.resolve({",
    " init:function(){return Promise.resolve();},isAvailable:function(){return Promise.resolve(true);},",
    " getValue:function(n){return Promise.resolve([{mainConnectionID:5,sourceID:1046},{mainConnectionID:77,sourceID:273}]);},",
    " callMethod:function(m,a){rec([m,a]);return Promise.resolve(m==='connect'?{amError:'E_OK',mainConnectionID:77}:{amError:'E_OK'});}});};"
].join('\n'));
var srcgen = path.join(dir, 'src-gen');
fs.mkdirSync(srcgen);
fs.writeFileSync(path.join(srcgen, 'org_genivi_am_commandinterface_CommandControl.json'), '{}');
var env = Object.assign({}, process.env, {
    G21_AUDIO_SOMEIP: fake, G21_AUDIO_SRCGEN: srcgen, G21_AUDIO_SMARTX: smartx,
    G21_AUDIO_STATE: path.join(dir, 'route'), G21_AUDIO_OVERRIDE: path.join(dir, 'none')
});
var r = cp.spawnSync(process.execPath, [js, 'connect'], { env: env, encoding: 'utf8' });
assert.strictEqual(r.status, 0, r.stderr);
assert.strictEqual(r.stdout.trim(), 'AndroidAutoMedia', 'locked CarLifeMedia skipped');
assert.strictEqual(fs.readFileSync(path.join(dir, 'route'), 'utf8').trim(), '77 273 AndroidAutoMedia');
assert.deepStrictEqual(JSON.parse(fs.readFileSync(calls, 'utf8')), [['connect', { sourceID: 273, sinkID: 1024 }]]);
r = cp.spawnSync(process.execPath, [js, 'disconnect'], { env: env, encoding: 'utf8' });
assert.strictEqual(r.status, 0, r.stderr);
assert.deepStrictEqual(JSON.parse(fs.readFileSync(calls, 'utf8'))[1], ['disconnect', { mainConnectionID: 77 }], 'only our connection');
assert.ok(!fs.existsSync(path.join(dir, 'route')), 'state removed');
r = cp.spawnSync(process.execPath, [js, 'disconnect'], { env: env, encoding: 'utf8' });
assert.strictEqual(JSON.parse(fs.readFileSync(calls, 'utf8')).length, 2, 'no state: nothing touched');

// procs_matching from the tool itself finds a sleeping process by its command line.
if (posix) {
    var helper = tool.slice(tool.indexOf('procs_matching() {'), tool.indexOf('our_uxplay_pids() {'));
    var sl = cp.spawn('sleep', ['30']);
    var out = cp.spawnSync('sh', ['-c', helper + "\nprocs_matching '*sleep*30*'"], { encoding: 'utf8' }).stdout;
    sl.kill();
    assert.ok(out.split('\n').indexOf(String(sl.pid)) >= 0, 'procs_matching finds the pid: ' + out);
} else { skipped += 1; console.log('SKIP procs_matching: needs a POSIX sh and /proc'); }

console.log('test_airplay_audio OK' + (skipped ? ' (' + skipped + ' part(s) skipped, see SKIP above)' : ''));
