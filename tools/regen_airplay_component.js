'use strict';

var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..', 'native', 'g21-airplay-open');
var skip = {
    'avahi-extract': true,
    build: true,
    'component.json': true,
    'LIBS.txt': true,
    'UXPLAY.txt': true,
    'build-uxplay.sh': true,
    'g21-airplay-open.service': true,
    'g21-present.c': true,
    'g21-rdp.c': true
};
var execNames = {
    'g21-airplay-open': true,
    'g21-present': true,
    'g21-rdp': true,
    'gst-plugin-scanner': true,
    'gst-plugin-scanner.bin': true,
    uxplay: true,
    'uxplay.bin': true,
    'avahi-daemon': true,
    'run-elf': true
};

function walk(dir, out) {
    fs.readdirSync(dir).forEach(function (name) {
        if (skip[name]) {
            return;
        }
        var full = path.join(dir, name);
        var st = fs.statSync(full);
        var rel = path.relative(root, full).split(path.sep).join('/');
        if (st.isDirectory()) {
            walk(full, out);
            return;
        }
        if (/\.c$|\.deb$/.test(name)) {
            return;
        }
        out.push({
            path: rel,
            mode: execNames[name] ? '0755' : '0644'
        });
    });
}

var files = [];
walk(root, files);
files.sort(function (a, b) { return a.path.localeCompare(b.path); });
var meta = JSON.parse(fs.readFileSync(path.join(root, 'component.json'), 'utf8'));
meta.version = '0.1.8';
meta.description = 'UxPlay + avahi overlay; conf bez niedozwolonego group=.';
meta.files = files;
fs.writeFileSync(path.join(root, 'component.json'), JSON.stringify(meta, null, 2) + '\n');
console.log('files', files.length);
console.log(files.filter(function (f) {
    return /run-elf|gst-plugin-scanner|uxplay$/.test(f.path);
}).map(function (f) { return f.path + ':' + f.mode; }).join('\n'));
