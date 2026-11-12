'use strict';

var fs = require('fs');
var path = require('path');
var version = require('./version');

var ROOT = path.join(__dirname, '..');

var FORBIDDEN_INTERFACE = /dsc|dme|dde|vtg|chassis|drivetrain|brakecontrol|stability/i;
var NODE8_BANNED = [
    '?.',
    '??',
    'replaceAll(',
    'fromEntries(',
    'allSettled(',
    'globalThis',
    'fs.rm(',
    'fs.rmSync(',
];

function privateKeyMarkers() {
    return [
        ['-----BEGIN', 'OPENSSH', 'PRIVATE', 'KEY-----'].join(' '),
        ['-----BEGIN', 'RSA', 'PRIVATE', 'KEY-----'].join(' '),
        ['-----BEGIN', 'EC', 'PRIVATE', 'KEY-----'].join(' '),
    ];
}

function tokenMarkers() {
    return [
        ['github', 'pat_'].join('_'),
        ['gh', 'p_'].join(''),
    ];
}

function walk(dir, out) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
        if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist') {
            return;
        }
        var full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(full, out);
            return;
        }
        out.push(full);
    });
}

function rel(file) {
    return path.relative(ROOT, file).split(path.sep).join('/');
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function fail(errors, message) {
    errors.push(message);
}

function checkTree(errors) {
    var repo = readJson(path.join(ROOT, 'mgu-repo.json'));
    if (repo.schema !== 1 || !Array.isArray(repo.components) || repo.components.length === 0) {
        fail(errors, 'mgu-repo.json must be schema 1 with at least one component');
        return;
    }
    var localTools = {};
    (repo.tools || []).forEach(function (tool) {
        localTools[tool.id] = true;
        var toolDir = path.join(ROOT, tool.path || '');
        var componentFile = path.join(toolDir, 'component.json');
        if (fs.existsSync(componentFile)) {
            var toolMeta = readJson(componentFile);
            if (toolMeta.id !== tool.id || toolMeta.kind !== 'tool' || toolMeta.version !== tool.version) {
                fail(errors, tool.id + ' component.json must name the same id, kind tool and version as mgu-repo.json');
            }
            if (!Array.isArray(toolMeta.files) || !toolMeta.files.length) {
                fail(errors, tool.id + ' component.json must list the files the unit installs');
            }
            toolMeta.files.forEach(function (item) {
                var relPath = (item.from || item.path || '').split('/').join(path.sep);
                if (!relPath || !fs.existsSync(path.join(toolDir, relPath))) {
                    fail(errors, tool.id + ' missing file ' + (item.from || item.path));
                }
            });
            return;
        }
        if (!tool.service || tool.service.exec !== tool.id) {
            fail(errors, tool.id + ' must have component.json or run its own program as a service');
        }
    });
    repo.components.forEach(function (component) {
        if (component.kind !== 'app' || component.build !== 'unit') {
            fail(errors, component.id + ' must be an app built on the head unit ("build": "unit")');
        }
        if (!component.mguHmi || component.mguHmi.indexOf('ID7') === -1) {
            fail(errors, component.id + ' must declare mguHmi ID7');
        }
        if (component.uninstallable !== true) {
            fail(errors, component.id + ' must be uninstallable');
        }
        Object.keys(component.requires || {}).forEach(function (need) {
            if (need.indexOf('g21-') === 0 && !localTools[need]) {
                fail(errors, component.id + ' requires missing tool ' + need);
            }
        });
        var appDir = path.join(ROOT, component.path);
        var meta = readJson(path.join(appDir, 'mgu-app.json'));
        var pkg = readJson(path.join(appDir, 'package', 'package.json'));
        var release = readJson(path.join(appDir, 'release.json'));
        if (meta.id !== component.id || pkg.name !== component.id) {
            fail(errors, component.id + ' id disagrees between mgu-repo.json, mgu-app.json and package.json');
        }
        if (!/^\d+\.\d+\.\d+$/.test(meta.version)) {
            fail(errors, component.id + ' version must be x.y.z');
        }
        try {
            var consistent = version.assertConsistent(appDir);
            if (consistent !== meta.version) {
                fail(errors, component.id + ' version files disagree with mgu-app.json');
            }
        } catch (err) {
            fail(errors, component.id + ' ' + err.message);
        }
        if (release.uninstallable !== true || !release.mguHmi || release.mguHmi.indexOf('ID7') === -1) {
            fail(errors, component.id + ' release.json must be uninstallable and for ID7');
        }
        if (pkg.mguHmi && pkg.mguHmi.indexOf('ID7') === -1) {
            fail(errors, component.id + ' package.json mguHmi must include ID7');
        }
        if (pkg.main !== 'javascript/runner.js') {
            fail(errors, component.id + ' must leave javascript/runner.js to the donor entry point');
        }
        if (fs.existsSync(path.join(appDir, 'package', 'javascript'))) {
            fail(errors, component.id + ' must not commit javascript/ (it would contain linked SDK code)');
        }
        meta.modules.forEach(function (mod) {
            if (!fs.existsSync(path.join(appDir, mod))) {
                fail(errors, component.id + ' missing module ' + mod);
            }
        });
        meta.modules.forEach(function (mod) {
            if (!mod.endsWith('.js')) {
                return;
            }
            var text = fs.readFileSync(path.join(appDir, mod), 'utf8');
            var re = /require\('\.\/([^']+)'\)/g;
            var match;
            while ((match = re.exec(text))) {
                var target = match[1];
                if (target.slice(-3) !== '.js') {
                    target += '.js';
                }
                var listed = 'src/' + target;
                if (meta.modules.indexOf(listed) === -1) {
                    fail(errors, component.id + ' ' + mod + ' requires ./' + match[1] + ' but mgu-app.json does not list ' + listed);
                }
            }
        });
        meta.sdk.forEach(function (mod) {
            if (mod.indexOf('oap-sdk/') !== 0) {
                fail(errors, component.id + ' sdk entry must be an oap-sdk path: ' + mod);
            }
        });
        var manifest = readJson(path.join(appDir, 'package', 'manifest.json'));
        var manifestText = JSON.stringify(manifest);
        if (FORBIDDEN_INTERFACE.test(manifestText)) {
            fail(errors, component.id + ' manifest.json names a forbidden vehicle interface');
        }
        var rhmi = readJson(path.join(appDir, 'package', 'rhmiData', 'application.json'));
        var hmis = [];
        rhmi.application.uiDescriptions.forEach(function (item) {
            item.hmi.forEach(function (hmi) { hmis.push(hmi); });
        });
        if (hmis.indexOf('ID7') === -1) {
            fail(errors, component.id + ' rhmiData has no ID7 description');
        }
    });
}

function checkSources(errors) {
    var files = [];
    walk(ROOT, files);
    var markers = privateKeyMarkers().concat(tokenMarkers());
    var textExt = {
        '.js': true, '.json': true, '.md': true, '.yml': true, '.yaml': true,
        '.xml': true, '.ps1': true, '.txt': true, '.gitignore': true,
    };
    files.forEach(function (file) {
        var name = path.basename(file).toLowerCase();
        var relative = rel(file);
        if (relative.indexOf('oap-sdk/') === 0 || name === 'id_rsa' || name === 'id_ed25519' || name.indexOf('.pem') === name.length - 4 || name.indexOf('.mgu') === name.length - 4) {
            fail(errors, 'forbidden file ' + relative);
        }
        if (!textExt[path.extname(name)] && name !== '.gitignore') {
            return;
        }
        var text = fs.readFileSync(file, 'utf8');
        markers.forEach(function (marker) {
            if (text.indexOf(marker) !== -1) {
                fail(errors, 'secret marker in ' + relative);
            }
        });
        if (/\.js$/.test(name) && (relative.indexOf('apps/') === 0 || relative.indexOf('lib/') === 0)) {
            NODE8_BANNED.forEach(function (token) {
                if (text.indexOf(token) !== -1) {
                    fail(errors, relative + ' uses ' + token + ', which Node 8 on the head unit does not provide');
                }
            });
        }
    });
}

function main() {
    var errors = [];
    try {
        checkTree(errors);
        checkSources(errors);
    } catch (err) {
        fail(errors, err.message);
    }
    if (errors.length) {
        errors.forEach(function (error) { console.error('validate: ' + error); });
        process.exit(1);
    }
    console.log('validate: repository matches the MGU Store source-package contract');
}

main();
