'use strict';
// the daemon's side, without a daemon running: settings decide, the state says it
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const d = require(path.join(__dirname, '..', 'native', 'g21-browser', 'g21-browserd.js'));
const server = require(path.join(__dirname, 'logserver', 'server.js'));
(async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'g21logd-'));
    const state = path.join(base, 'state'), store = path.join(base, 'store'), f = path.join(base, 'x.log');
    fs.mkdirSync(state);
    fs.writeFileSync(f, 'hello from the car\n');
    const srv = server.create({ dir: store });
    const port = await new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));
    const g = Object.create(d.Daemon.prototype);
    const said = [];
    Object.assign(g, { opts: { stateDir: state, logShip: false }, log: (x) => said.push(x), push: () => {} });
    g.logsStart();
    assert.ok(!g.logs, 'in a test folder nothing is sent');
    g.opts.logShipTest = { files: [{ name: 'x.log', file: f }], every: 40, car: 'unit', socksFiles: [] };
    fs.writeFileSync(path.join(state, 'settings.json'), JSON.stringify({ logServer: '127.0.0.1:' + port }));
    g.logsStart();
    assert.strictEqual(g.logsOn, true, 'on unless switched off');
    const end = Date.now() + 5000;
    while (!fs.existsSync(path.join(store, 'unit', 'x.log'))) { if (Date.now() > end) throw new Error('nothing arrived'); await new Promise((r) => setTimeout(r, 30)); }
    assert.strictEqual(fs.readFileSync(path.join(store, 'unit', 'x.log'), 'utf8'), 'hello from the car\n');
    assert.ok(/^ok /.test(g.logs.status()));
    g.logsSet(false);
    assert.ok(g.logsOn === false && g.logs.status() === 'off' && JSON.parse(fs.readFileSync(path.join(state, 'settings.json'), 'utf8')).logs === 'off', 'off is kept');
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(state, 'settings.json'), 'utf8')).logServer, '127.0.0.1:' + port, 'the server\'s address stays');
    g.logsSet(true);
    assert.ok(g.logsOn === true && g.logs.status() !== 'off');
    g.logs.stop();
    await new Promise((r) => srv.close(r));
    fs.rmSync(base, { recursive: true, force: true });
    console.log('ok daemon: logs are sent unless switched off; the switch is kept; nothing from a test folder');
    process.exit(0);
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
