'use strict';
// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * "Zresetuj usługi" (THEiPlay, Ustawienia > Ogólne): g21-browserd's restartServices() against stand-in services.
 * A stand-in "systemctl" (this file, run with --fake-systemctl) keeps the units' states in a JSON file and writes
 * every call it gets to a log, so the test sees exactly which units were touched, in which order, and what happens
 * when one fails, hangs, is not installed, or when the request comes twice. No real service is touched.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

if (process.argv[2] === '--fake-systemctl') {
    const worldFile = process.env.FAKE_WORLD;
    const world = JSON.parse(fs.readFileSync(worldFile, 'utf8'));
    const args = process.argv.slice(3);
    fs.appendFileSync(worldFile + '.calls', args.join(' ') + '\n');
    const unit = args[args.length - 1];
    const u = world[unit];
    if (args[0] === 'show') { process.stdout.write('LoadState=' + (u ? 'loaded' : 'not-found') + '\n'); process.exit(0); }
    if (args[0] === 'is-active') { process.stdout.write((u ? u.state : 'unknown') + '\n'); process.exit(u && u.state === 'active' ? 0 : 3); }
    if (args[0] === '--no-block' && args[1] === 'restart') { process.exit(u && u.refuse ? 1 : 0); }
    if (args[0] === 'restart') {
        if (!u) { process.stderr.write('Unit ' + unit + ' not found.\n'); process.exit(5); }
        if (u.does === 'hang') { setTimeout(() => process.exit(0), 20000); return; }
        u.state = u.does === 'fail' ? 'failed' : 'active';
        u.restarts = (u.restarts || 0) + 1;
        fs.writeFileSync(worldFile, JSON.stringify(world));
        process.exit(u.does === 'fail' ? 1 : 0);
    }
    process.exit(2);
}

const assert = require('assert');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'g21svc-'));
process.env.G21_BROWSER_ROOT = base;
process.env.G21_BROWSER_RUN = path.join(base, 'run');
process.env.G21_BROWSER_NOSETUID = '1';
const d = require(path.join(__dirname, '..', 'native', 'g21-browser', 'g21-browserd.js'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UNITS = ['g21-audio.service', 'g21-input.service', 'g21-airplay-open.service', 'jap-ridetube-d.service'];
const SELF = 'g21-browser.service';
const worldFile = path.join(base, 'world.json');

function world(over) {
    const w = {};
    UNITS.concat([SELF]).forEach((u) => { w[u] = { state: 'active', does: 'ok' }; });
    Object.keys(over || {}).forEach((k) => { if (over[k] === null) delete w[k]; else Object.assign(w[k], over[k]); });
    fs.writeFileSync(worldFile, JSON.stringify(w));
    try { fs.unlinkSync(worldFile + '.calls'); } catch (e) { /* none */ }
}
const calls = () => { try { return fs.readFileSync(worldFile + '.calls', 'utf8').trim().split('\n').filter(Boolean); } catch (e) { return []; } };
function daemon(opts) {
    const dm = new d.Daemon(Object.assign({ systemctl: [process.execPath, __filename, '--fake-systemctl'], systemctlEnv: { FAKE_WORLD: worldFile, SystemRoot: process.env.SystemRoot || '' },
        serviceSettleMs: 20, serviceRestartMs: 1500, selfRestartMs: 400 }, opts || {}));
    dm.events = [];
    dm.order = [];
    dm.log = function () {};
    dm.emit = function (m) { if (m && m.ev === 'services') { dm.events.push(m); if (m.phase === 'unit') dm.order.push('unit ' + m.unit); } };
    dm.stopEngine = async function (why) { dm.order.push('engine stopped'); dm.stopWhy = why; };
    return dm;
}

(async () => {
    const state = path.join(base, 'state');
    fs.mkdirSync(state, { recursive: true });
    // what must be there afterwards, untouched: the rules, the logins, the settings, the imported apps
    const keep = { 'policy.json': '{"homepage":"https://example.org/"}', 'cookies.json': '{"cookies":[{"name":"sid"}]}', 'settings.json': '{"zoom":1.25}', 'apps.json': '[{"id":"hello"}]' };
    Object.keys(keep).forEach((f) => fs.writeFileSync(path.join(state, f), keep[f]));

    // ---- 1. everything comes up: the order, one at a time, this tool last; asked twice: the second is refused
    world();
    let dm = daemon();
    const run = dm.restartServices();
    await sleep(5);
    await dm.restartServices();
    assert.deepStrictEqual(dm.events.filter((e) => e.phase === 'busy').length, 1, 'a second request while one runs is refused');
    await run;
    let c = calls();
    assert.deepStrictEqual(c.filter((l) => /(^| )restart /.test(l)), UNITS.map((u) => 'restart ' + u).concat(['--no-block restart ' + SELF]), 'each unit once, sound first, this tool last: ' + c.join(' | '));
    assert.deepStrictEqual(dm.order, ['engine stopped'].concat(UNITS.map((u) => 'unit ' + u)), 'this tool\'s engine is stopped before the sound is');
    UNITS.forEach((u) => {
        const r = c.indexOf('restart ' + u), a = c.indexOf('is-active ' + u), next = UNITS[UNITS.indexOf(u) + 1];
        assert.ok(r >= 0 && a > r && (!next || c.indexOf('restart ' + next) > a), u + ' is asked "is-active" before the next unit is touched');
    });
    assert.ok(c.every((l) => UNITS.concat([SELF]).indexOf(l.split(' ').pop()) >= 0), 'only THEiPlay\'s five units are ever named: ' + c.join(' | '));
    assert.ok(c.every((l) => /^(show -p LoadState|restart|is-active|--no-block restart) \S+$/.test(l)), 'only show / restart / is-active: ' + c.join(' | '));
    assert.deepStrictEqual(dm.events.map((e) => e.phase).filter((p) => p !== 'busy'), ['restarting', 'unit', 'unit', 'unit', 'unit', 'self'], 'what the app is told, in order');
    assert.ok(dm.events.every((e) => e.phase !== 'done'), 'no "done" from the process that is about to be restarted');
    const saved = JSON.parse(fs.readFileSync(path.join(state, 'services.json'), 'utf8'));
    assert.deepStrictEqual(saved.results, UNITS.map((u) => ({ unit: u, state: 'active' })));
    clearTimeout(dm.selfTimer);
    // the process systemd starts next tells the app, once it is connected again
    let dm2 = daemon();
    dm2.servicesAfterRestart();
    assert.ok(dm2.servicesDone && dm2.servicesDone.ok === true, 'the new process knows all came up');
    assert.deepStrictEqual(dm2.servicesDone.results.map((r) => r.unit + ' ' + r.state), UNITS.concat([SELF]).map((u) => u + ' active'));
    assert.ok(!fs.existsSync(path.join(state, 'services.json')), 'the note is read once');
    let dm3 = daemon();
    dm3.servicesAfterRestart();
    assert.ok(!dm3.servicesDone, 'an ordinary start says nothing');
    console.log('ok services: the order, one at a time, each checked, this tool last; a second request is refused');

    // ---- 2. one fails, one is not installed, one does not answer
    world({ 'g21-input.service': { does: 'fail' }, 'g21-airplay-open.service': null, 'jap-ridetube-d.service': { does: 'hang' } });
    dm = daemon({ serviceRestartMs: 300 });
    await dm.restartServices();
    clearTimeout(dm.selfTimer);
    c = calls();
    assert.ok(c.indexOf('restart g21-airplay-open.service') < 0, 'a unit that is not installed is not restarted');
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(state, 'services.json'), 'utf8')).results.map((r) => r.unit.replace('.service', '') + ' ' + r.state),
        ['g21-audio active', 'g21-input failed', 'g21-airplay-open absent', 'jap-ridetube-d timeout'], 'each unit\'s own outcome; a failure does not stop the others');
    assert.ok(c.indexOf('--no-block restart ' + SELF) > 0, 'this tool is restarted all the same');
    dm2 = daemon();
    dm2.servicesAfterRestart();
    assert.strictEqual(dm2.servicesDone.ok, false, 'not reported as a success');
    console.log('ok services: a failed unit, a missing one and one that hangs are told apart; never reported as up');

    // ---- 3. systemd does not restart this tool: said, and the option works again
    world({ 'g21-browser.service': { refuse: true } });
    dm = daemon();
    await dm.restartServices();
    let last = dm.events[dm.events.length - 1];
    assert.ok(last.phase === 'done' && last.ok === false && last.results[last.results.length - 1].unit === SELF && dm.restarting === false, 'refused: ' + JSON.stringify(last));
    assert.ok(!fs.existsSync(path.join(state, 'services.json')), 'no note of a restart that did not happen');
    world();
    dm = daemon({ selfRestartMs: 150 });
    await dm.restartServices();
    assert.strictEqual(dm.restarting, true);
    await sleep(350);
    last = dm.events[dm.events.length - 1];
    assert.ok(last.phase === 'done' && last.ok === false && last.results[last.results.length - 1].state === 'timeout' && dm.restarting === false, 'this tool still runs after its restart was asked: ' + JSON.stringify(last));
    world();
    await dm.restartServices();
    clearTimeout(dm.selfTimer);
    assert.strictEqual(calls().filter((l) => /^restart /.test(l)).length, 4, 'and the next request runs');
    console.log('ok services: this tool not restarted is an error, not a hang; the option can be used again');

    // ---- 4. nothing of the owner's is gone
    Object.keys(keep).forEach((f) => assert.strictEqual(fs.readFileSync(path.join(state, f), 'utf8'), keep[f], f + ' is untouched'));
    console.log('ok services: rules, logins, settings and the imported apps are untouched');
    fs.rmSync(base, { recursive: true, force: true });
    console.log('test_services: ok');
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
