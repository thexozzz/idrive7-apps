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
assert.ok(/stop_ux\(\) \{\n    stop_ring\n    audio_route_disconnect/.test(tool), 'route dropped when UxPlay stops');
assert.ok(/LD_PRELOAD=\/usr\/lib\/libasound\.so\.2/.test(tool), "UxPlay uses the car's libasound");
assert.ok(/alsasink device=smartx:\$audio_dev/.test(tool), 'sink follows the routed device');

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
var helper = tool.slice(tool.indexOf('procs_matching() {'), tool.indexOf('our_uxplay_pids() {'));
var sl = cp.spawn('sleep', ['30']);
var out = cp.spawnSync('sh', ['-c', helper + "\nprocs_matching '*sleep 30*'"], { encoding: 'utf8' }).stdout;
sl.kill();
assert.ok(out.split('\n').indexOf(String(sl.pid)) >= 0, 'procs_matching finds the pid: ' + out);

console.log('test_airplay_audio OK');
