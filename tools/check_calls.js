'use strict';
// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * A cheap static check for the kind of mistake tests with fakes do not see: "this.name(...)" (or self.name(...))
 * where no method "name" is defined on the prototype of that file's class, and client calls on a field
 * ("this._field.method(...)") where the object made by the factory has no such method.
 *   node tools/check_calls.js        exit 1 when something is called that is not defined
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

function read(f) { return fs.readFileSync(path.join(root, f), 'utf8'); }
let bad = 0;
function report(f, line, text) { bad += 1; console.log(f + ':' + line + ' ' + text); }

// 1. prototype methods of one class in one file
[['apps/g21_airplay/src/main.js', 'AirPlayApp'], ['native/g21-browser/g21-browserd.js', 'Daemon']].forEach(function (pair) {
    const f = pair[0], cls = pair[1];
    const src = read(f);
    const defined = {};
    let m;
    const def = new RegExp(cls + '\\.prototype\\.([A-Za-z0-9_$]+)\\s*=', 'g');
    while ((m = def.exec(src))) defined[m[1]] = true;
    // fields assigned somewhere (this.x = ...): a call of those is a call of a stored function
    const field = /(?:this|self|selfSet|selfStore)\.([A-Za-z0-9_$]+)\s*=[^=]/g;
    while ((m = field.exec(src))) defined[m[1]] = true;
    const lines = src.split('\n');
    lines.forEach(function (l, i) {
        const call = /\b(?:this|self)\.([A-Za-z0-9_$]+)\(/g;
        let c;
        while ((c = call.exec(l))) {
            // (the app's base class of the BMW framework, and the daemon's Cdp class in the same file)
            if (!defined[c[1]] && !/^(hasOwnProperty|toString|constructor|on|registerActive|registerInactive|registerHmiVisible|unregisterHmiVisible|getVisibilityData|getAppId|initialized|getLastExecutedEntryPointUuid|getEntryPoints|destroyBundles|onFault)$/.test(c[1])) {
                // inside another class or object of the file? only report inside the class's own methods
                report(f, i + 1, 'this.' + c[1] + '() is not a method of ' + cls);
            }
        }
    });
});

// 2. calls on the clients the app holds
const main = read('apps/g21_airplay/src/main.js');
function methodsOf(file, marker) {
    const src = read(file);
    const at = src.lastIndexOf(marker);
    const body = src.slice(at);
    const names = {};
    let m;
    const re = /^\s{8}([A-Za-z0-9_$]+):\s*(?:function|[A-Za-z0-9_$]+\s*[,}\n])/gm;
    while ((m = re.exec(body))) names[m[1]] = true;
    return names;
}
[['_padInput', 'apps/g21_airplay/src/input_client.js', 'return {'], ['_web', 'apps/g21_airplay/src/browser_client.js', 'return {']].forEach(function (t) {
    const names = methodsOf(t[1], t[2]);
    main.split('\n').forEach(function (l, i) {
        const re = new RegExp('this\\.' + t[0] + '\\.([A-Za-z0-9_$]+)\\(', 'g');
        let c;
        while ((c = re.exec(l))) if (!names[c[1]]) report('apps/g21_airplay/src/main.js', i + 1, 'this.' + t[0] + '.' + c[1] + '() is not in ' + t[1]);
    });
});

// 3. menu items the app answers and menu items that exist
const menu = require(path.join(root, 'apps/g21_airplay/src/menu_draw.js'));
const items = {};
Object.keys(menu.SCREENS).forEach(function (k) { const it = menu.SCREENS[k]; (Array.isArray(it) ? it : []).forEach(function (i) { items[i.name] = k; }); });
Object.keys(items).forEach(function (name) {
    if (/^(qc-|qk-|pos-out-|stream-|si-)/.test(name)) return;   // answered by their prefix
    if (main.indexOf("'" + name + "'") < 0 && read('apps/g21_airplay/src/menu_draw.js').split("'" + name + "'").length < 3) report('menu', 0, 'item "' + name + '" (screen ' + items[name] + ') is not answered in main.js');
});

console.log(bad ? 'check_calls: ' + bad + ' problem(s)' : 'check_calls: ok');
process.exit(bad ? 1 : 0);
