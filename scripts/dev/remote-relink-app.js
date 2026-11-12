'use strict';

/*
 * Rebuild oap_12249 javascript/app.js from HotPatched flat source/*.js.
 * Run on MGU: node remote-relink-app.js
 */
var fs = require('fs');
var path = require('path');
var link = require('/var/opt/mgu-deploy/current/oap_link.js');

var OAP = '/var/opt/public/oap/oap_12249';
var SRC = path.join(OAP, 'source');
var stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
var work = '/var/opt/g21-airplay-open/dev-staging/relink-' + stamp;
var backup = '/var/opt/g21-airplay-open/dev-backup/relink-' + stamp;

function cp(a, b) {
    fs.writeFileSync(b, fs.readFileSync(a));
}

function mkdirp(p) {
    var parts = p.split('/');
    var cur = '';
    parts.forEach(function (part) {
        if (!part) {
            cur = cur || '/';
            return;
        }
        cur = path.join(cur, part);
        try {
            fs.mkdirSync(cur);
        } catch (err) {
            if (!err || err.code !== 'EEXIST') {
                throw err;
            }
        }
    });
}

mkdirp(path.join(work, 'src'));
mkdirp(path.join(work, 'package'));
mkdirp(path.join(work, 'out'));
mkdirp(backup);

fs.readdirSync(SRC).forEach(function (name) {
    if (!/\.js$/.test(name)) {
        return;
    }
    cp(path.join(SRC, name), path.join(work, 'src', name));
});

function cpDir(a, b) {
    mkdirp(b);
    fs.readdirSync(a).forEach(function (name) {
        var from = path.join(a, name);
        var to = path.join(b, name);
        if (fs.statSync(from).isDirectory()) {
            cpDir(from, to);
        } else {
            cp(from, to);
        }
    });
}

// Full staged package tree so oap_link pack() finds files[] entries.
cp(path.join(SRC, 'package.json'), path.join(work, 'package', 'package.json'));
cp(path.join(SRC, 'npm-shrinkwrap.json'), path.join(work, 'package', 'npm-shrinkwrap.json'));
cp(path.join(SRC, 'permissions.json'), path.join(work, 'package', 'permissions.json'));
cp(path.join(SRC, 'manifest.json'), path.join(work, 'package', 'manifest.json'));
cp(path.join(SRC, 'CHANGELOG.md'), path.join(work, 'package', 'CHANGELOG.md'));
cpDir(path.join(SRC, 'config'), path.join(work, 'package', 'config'));
cpDir(path.join(SRC, 'javascript'), path.join(work, 'package', 'javascript'));
cpDir(path.join(OAP, 'rhmiData'), path.join(work, 'package', 'rhmiData'));

cp(path.join(SRC, 'javascript', 'app.js'), path.join(backup, 'app.js'));
try {
    cp(path.join(SRC, 'javascript', 'build.json'), path.join(backup, 'build.json'));
} catch (err) { /* optional */ }
try {
    cp(path.join(OAP, 'data', 'app.js.bytecode'), path.join(backup, 'app.js.bytecode'));
} catch (err) { /* optional */ }

var mods = [
    'main.js',
    'uplink.js',
    'settings_manager.js',
    'display_output.js',
    'parked_gate.js',
    'video_decoder.js',
    'cluster_render_adapter.js',
    'cluster_render_client.js',
    'cluster_label.js',
    'frame_bridge.js',
    'paths.js',
    'credentials.js',
    'desktop_settings.js',
    'session_manager.js',
    'desktop_sessions.js',
    'socks5.js',
    'vnc_client.js',
    'input_manager.js',
    'frame_sink.js',
    'menu_draw.js',
    'knob_keyboard.js',
    'config_store.js',
    'config_panel.js',
    'windows_offers.js'
];
mods.forEach(function (name) {
    if (!fs.existsSync(path.join(work, 'src', name))) {
        throw new Error('missing module ' + name);
    }
});

var manifest = {
    schema: 1,
    id: 'g21_airplay',
    version: '0.1.68',
    tree: 'package',
    internet: true,
    modules: mods.map(function (f) { return 'src/' + f; }),
    sdk: [
        'oap-sdk/src/core/OnlineApp.js',
        'oap-sdk/src/logging/logging'
    ]
};
fs.writeFileSync(path.join(work, 'mgu-app.json'), JSON.stringify(manifest, null, 2));

var donors = link.unitDonors('/var/opt/public/mainapp', '/var/opt/public/oap', {});
var tgz = path.join(work, 'out', 'app.tgz');
var result = link.build(work, tgz, { donors: donors });
// build() writes an OAP .tgz; install javascript/app.js + build.json from it.
var extract = path.join(work, 'extract');
mkdirp(extract);
var cpProc = require('child_process').spawnSync('tar', ['-xzf', tgz, '-C', extract], { encoding: 'utf8' });
if (cpProc.status !== 0) {
    throw new Error('tar extract failed: ' + (cpProc.stderr || cpProc.error));
}
cp(path.join(extract, 'javascript', 'app.js'), path.join(SRC, 'javascript', 'app.js'));
cp(path.join(extract, 'javascript', 'build.json'), path.join(SRC, 'javascript', 'build.json'));
try {
    fs.unlinkSync(path.join(OAP, 'data', 'app.js.bytecode'));
} catch (err) { /* may already be gone */ }

var bundled = fs.readFileSync(path.join(SRC, 'javascript', 'app.js'), 'utf8');
console.log(JSON.stringify({
    stamp: stamp,
    donor: result.donor,
    moduleCount: result.moduleCount,
    bytes: result.bytes,
    airOut: (bundled.match(/air-out/g) || []).length,
    startAirplayToOutput: (bundled.match(/startAirplayToOutput/g) || []).length,
    bgraFromI420: (bundled.match(/bgraFromI420/g) || []).length,
    bytecodeGone: !fs.existsSync(path.join(OAP, 'data', 'app.js.bytecode'))
}));
