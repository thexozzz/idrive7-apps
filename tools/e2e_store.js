'use strict';
// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * Sklep end to end against the real GitHub (needs the internet; not part of test_all.js):
 *   node tools/e2e_store.js [owner/repo[@branch]]
 * The daemon's own code imports the repository (download, unpack, list), serves it from its file server, the
 * first page is fetched, a path out of the folder is refused, the app is removed.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const d = require('../native/g21-browser/g21-browserd.js');
const menu = require('../apps/g21_airplay/src/menu_draw.js');

const text = process.argv[2] || menu.DEMO_APP;

function get(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (r) => { let b = ''; r.setEncoding('utf8'); r.on('data', (c) => { b += c; }); r.on('end', () => resolve({ code: r.statusCode, type: r.headers['content-type'], body: b })); }).on('error', reject);
    });
}

(async function () {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'g21store-'));
    const logs = [];
    const daemon = new d.Daemon({ noSetuid: true, testUid: null, cacheDir: path.join(base, 'cache'), stateDir: path.join(base, 'state'), logDir: path.join(base, 'log'),
        runDir: path.join(base, 'run'), appsDir: path.join(base, 'apps'), leaseFile: path.join(base, 'no-lease.json') });
    const events = [];
    daemon.client = { write: (l) => events.push(JSON.parse(l)) };
    daemon.log = (m) => logs.push(m);
    try {
        const r = d.parseRepo(text);
        assert.ok(r, 'the address reads: ' + text);
        console.log('import ' + text + ' -> ' + r.url + ' (id ' + r.id + ')');
        const done = await daemon.installApp(text);
        console.log('installed: ' + JSON.stringify(done));
        assert.ok(events.some((e) => e.ev === 'app' && e.phase === 'downloading') && events.some((e) => e.ev === 'app' && e.phase === 'unpacking'), 'progress was told');
        const list = daemon.appsList();
        assert.strictEqual(list.length, 1);
        assert.strictEqual(list[0].id, r.id);
        console.log('listed: ' + JSON.stringify(list[0]));
        assert.ok(fs.existsSync(path.join(base, 'apps', r.id, list[0].start || 'index.html')), 'the first page is on the disk');
        assert.ok(!fs.existsSync(path.join(base, 'cache', 'download-app')), 'the download is cleaned up');
        const url = await daemon.appUrl(r.id);
        assert.ok(/^http:\/\/127\.0\.0\.1:\d+\//.test(String(url)), 'the app has an address: ' + url);
        const page = await get(url);
        assert.strictEqual(page.code, 200);
        assert.ok(/text\/html/.test(page.type) && /<html/i.test(page.body), 'the first page is served as HTML');
        console.log('served: ' + url + ' (' + page.body.length + ' chars, ' + page.type + ')');
        const root = url.replace(/\/[^\/]*\/[^\/]*$/, '');
        const out = await get(root + '/' + r.id + '/..%2f..%2fstate/apps.json');
        assert.strictEqual(out.code, 404, 'nothing outside the apps folder is served');
        const none = await get(root + '/' + r.id + '/no-such-file.js');
        assert.strictEqual(none.code, 404);
        daemon.removeApp(r.id);
        assert.strictEqual(daemon.appsList().length, 0, 'removed from the list');
        assert.ok(!fs.existsSync(path.join(base, 'apps', r.id)), 'removed from the disk');
        console.log('removed');
        console.log('e2e_store: ok');
    } catch (e) {
        console.log(logs.join('\n'));
        throw e;
    } finally {
        if (daemon.appsProc) { try { daemon.appsProc.kill(); } catch (e) { /* gone */ } }
        try { fs.rmSync(base, { recursive: true, force: true }); } catch (e) { /* a busy file on Windows */ }
    }
}()).then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
