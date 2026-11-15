'use strict';
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes native/g21-browser/component.json from the files that are there (after build-engine.js or a
// library change). Sources and notes stay out of the deployed list. Usage: node tools/regen_browser_component.js [version]
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..', 'native', 'g21-browser');
var file = path.join(root, 'component.json');
var skip = { 'component.json': true, 'g21-browser.service': true, 'g21-webframe.c': true, 'build-webframe.sh': true, 'build-engine.js': true, 'build-sandbox.sh': true };
var exec = { 'g21-webframe': true, 'check.sh': true, 'g21-chrome-sandbox': true };
var old = {};
try { old = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) { old = {}; }

function walk(dir, out) {
    fs.readdirSync(dir).sort().forEach(function (name) {
        var full = path.join(dir, name);
        var rel = path.relative(root, full).split(path.sep).join('/');
        if (fs.statSync(full).isDirectory()) { walk(full, out); return; }
        // the packed engine and its notices stay on the development machine: the head unit downloads the engine from Google
        if (skip[rel] || /^\./.test(name) || /^sandbox-src\/sandbox\//.test(rel) || /^engine\/(engine\.pack\.br\.\d+|LICENSE\.headless_shell)$/.test(rel)) { return; }
        out.push({ path: rel, mode: exec[rel] || /^lib\//.test(rel) ? '0755' : '0644' });
    });
}

var files = [];
walk(root, files);
var component = {
    id: 'g21-browser',
    kind: 'tool',
    version: process.argv[2] || old.version || '0.1.0',
    license: 'GPL-3.0-or-later',
    title: 'Przeglądarka',
    description: 'Silnik przeglądarki dla THEiPlay: Google chrome-headless-shell z własnymi bibliotekami, obraz strony prosto do warstwy wideo. Sterowanie przez /run/g21-browser/ctl.sock.',
    requires: { 'mgu-deploy': '0.7.0', 'jap-node22': '22.23.4', 'mgu-render': '0.6.11' },
    uninstallable: true,
    internet: true,
    uids: 'state/internet-uids',
    mguHmi: ['ID7'],
    files: files,
    check: ['check.sh'],
    units: [{ name: 'g21-browser.service', from: 'g21-browser.service' }],
    enable: [{ unit: 'g21-browser.service', target: 'multi-user.target' }],
    crashNames: ['chrome-headless-shell', 'chrome-headless', 'g21-webframe'],
    recmgr: ['g21-browser'],
    restart: ['g21-browser.service']
};
var text = JSON.stringify(component, null, 2).replace(/\{\n\s+"path": ("[^"]+"),\n\s+"mode": ("[^"]+")\n\s+\}/g, '{ "path": $1, "mode": $2 }') + '\n';
fs.writeFileSync(file, text);
console.log('component.json: ' + files.length + ' files, version ' + component.version);
