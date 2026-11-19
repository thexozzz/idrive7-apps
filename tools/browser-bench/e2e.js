'use strict';
// Development machine: the real daemon with the full engine of the stand, both frame paths, through its socket.
//   node e2e.js [break]     break: the frame tool is one that cannot run (the fall back to the photographs)
const fs = require('fs'), path = require('path'), net = require('net'), http = require('http'), cp = require('child_process');
const B = '/opt/scr/bench', base = '/tmp/g21e2e-' + process.pid;
fs.mkdirSync(base + '/run', { recursive: true });
process.env.G21_BROWSER_ROOT = base; process.env.G21_BROWSER_RUN = base + '/run'; process.env.G21_BROWSER_RING = base + '/ring';
process.env.G21_BROWSER_NOSETUID = '1'; process.env.G21_BROWSER_ALLOW_LOCAL = '1';
const d = require((process.env.REPO || '.') + '/native/g21-browser/g21-browserd.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PAGE = '<!doctype html><meta charset=utf-8><body style="margin:0;font:18px sans-serif"><input id=i style="font:20px sans-serif" value=pole><div id=c></div><script>var s="";for(var i=0;i<400;i++)s+="<p style=\\"margin:8px;padding:8px;background:hsl("+(i*7%360)+",60%,85%)\\">Wiersz "+i+" Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>";c.innerHTML=s;var y=0,go=1;function f(){if(go){y+=6;if(y>document.body.scrollHeight-innerHeight)y=0;scrollTo(0,y);}requestAnimationFrame(f);}f();addEventListener("touchstart",function(){document.body.style.background="#fc0";});</script>';
function ring() {
    try { const b = fs.readFileSync(base + '/ring'); return { w: b.readUInt32LE(8), h: b.readUInt32LE(12), seq: b.readUInt32LE(16) }; } catch (e) { return { err: e.code }; }
}
(async () => {
    const srv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(PAGE); });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const url = 'http://127.0.0.1:' + srv.address().port + '/';
    const dm = new d.Daemon({ idleMs: 60000, pollMs: 300, wlframe: process.argv[2] === 'break' ? '/bin/false' : B + '/g21-wlframe', webframe: B + '/g21-webframe', libDir: B + '/lib' });
    dm.prepare = async function () {
        const profile = base + '/profile', tmp = base + '/tmp';
        [profile, tmp].forEach((x) => { fs.rmSync(x, { recursive: true, force: true }); fs.mkdirSync(x, { recursive: true, mode: 0o700 }); });
        fs.writeFileSync(base + '/fonts.conf', '<?xml version="1.0"?><fontconfig><dir>/usr/share/fonts</dir><cachedir>' + base + '/fc</cachedir></fontconfig>');
        this.fullEngine = true;
        return { engine: B + '/engine', binary: 'chrome', kind: 'chrome', profile: profile, tmp: tmp, conf: base + '/fonts.conf', major: '153' };
    };
    dm.engineProcs = function () {
        return fs.readdirSync('/proc').filter((p) => /^\d+$/.test(p)).filter((p) => { try { return fs.readFileSync('/proc/' + p + '/cmdline', 'latin1').indexOf(B + '/engine/chrome') === 0; } catch (e) { return false; } }).map(Number);
    };
    await dm.start();
    await sleep(300);
    let state = {}, c = null;
    const connect = () => new Promise((resolve) => {
        c = net.connect(base + '/run/ctl.sock', resolve);
        let buf = '';
        c.on('data', (x) => { buf += x; let i; while ((i = buf.indexOf('\n')) >= 0) { try { const m = JSON.parse(buf.slice(0, i)); if (m.ev === 'state') state = m; } catch (e) { /* skip */ } buf = buf.slice(i + 1); } });
        c.on('error', () => {});
    });
    const tell = (o) => c.write(JSON.stringify(o) + '\n');
    const until = async (what, fn, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(100); } console.log('TIMEOUT: ' + what); return false; };
    const measure = async (label, secs) => {
        dm.perf.sumN = 0; dm.perf.sumMs = 0; dm.perf.sumUs = 0; dm.perf.sumMax = 0; dm.perf.sumP95 = 0; dm.perf.logAt = Date.now();
        dm.perfSample(); await sleep(secs * 1000); dm.checkMemory();
        console.log(label + ': ' + dm.perfLine());
    };
    await connect();
    tell({ op: 'open', w: 1796, h: 548, fw: 1920, fh: 720, zoom: 1.25, url: url });
    await until('live', () => state.live && state.engine === 'ready', 30000);
    console.log('state: engine ' + state.engine + ', live ' + state.live + ', ' + state.w + 'x' + state.h + ', frames ' + JSON.stringify(state.pol && [state.pol.frames, state.pol.framesNow]) + ', ring ' + JSON.stringify(ring()) + ', args ' + (dm.lastArgs || []).filter((a) => /ozone|kiosk|headless|window-size|scale|test-type|no-sandbox/.test(a)).join(' '));
    await sleep(1500);
    await measure('1 ' + (dm.direct ? 'direct' : 'cast') + ' scroll', 8);
    if (process.argv[3]) fs.copyFileSync(base + '/ring', process.argv[3] + '-page.bin');
    // a tap
    tell({ op: 'touch', p: 1, x: 600, y: 300 }); await sleep(60); tell({ op: 'touch', p: 3, x: 600, y: 300 });
    await sleep(700);
    console.log('tap: ' + JSON.stringify({ tapMs: dm.perf.tapMs, editable: state.editable }));
    // nobody watching, then somebody again
    const before = ring().seq; c.destroy(); await sleep(2500);
    const idle = ring().seq - before, n0 = dm.perf.sumN;
    await sleep(2500);
    console.log('away: ' + idle + ' pictures in the first 2.5 s, ' + (dm.perf.sumN - n0) + ' measured frames in the next 2.5 s (a still picture is repeated twice a second)');
    await connect(); tell({ op: 'open', w: 1796, h: 548, fw: 1920, fh: 720, zoom: 1.25 });
    await sleep(1500);
    const s1 = ring().seq; await sleep(1000);
    console.log('back: ' + (ring().seq - s1) + ' pictures in 1 s');
    // full screen and back
    if (dm.engine) {
        dm.frame.stdout.on('data', (x) => String(x).split(/\n/).filter((l) => /^(ring|c|e) /.test(l)).forEach((l) => console.log('  wl> ' + l)));
        const run = (x) => dm.engine.cdp.send('Runtime.evaluate', { expression: x, returnByValue: true, userGesture: true, awaitPromise: true }, dm.engine.session);
        await run('document.documentElement.requestFullscreen().then(function(){return 1})'); await sleep(2500);
        const ev =await dm.engine.cdp.send('Runtime.evaluate', { expression: 'innerWidth+"x"+innerHeight+"@"+devicePixelRatio+" outer "+outerWidth+"x"+outerHeight', returnByValue: true }, dm.engine.session);
        console.log('  page: ' + ev.result.value + ', dm.fs ' + JSON.stringify(dm.fs) + ', s ' + dm.s.w + 'x' + dm.s.h);
        console.log('full screen: ring ' + JSON.stringify(ring()) + ', state ' + state.w + 'x' + state.h + ' fs ' + state.fs);
        await measure('2 ' + (dm.direct ? 'direct' : 'cast') + ' full screen scroll', 6);
        if (process.argv[3]) fs.copyFileSync(base + '/ring', process.argv[3] + '-fs.bin');
        await run('document.exitFullscreen().then(function(){return 1})'); await sleep(2500);
        console.log('page again: ring ' + JSON.stringify(ring()));
    }
    // the other path, by the rule
    tell({ op: 'policy', key: 'frames', value: dm.direct ? 'cast' : 'direct' });
    await sleep(1500);
    await until('live again', () => state.live && state.engine === 'ready', 30000);
    await sleep(2000);
    console.log('rule set: frames ' + JSON.stringify(state.pol && [state.pol.frames, state.pol.framesNow]) + ', ring ' + JSON.stringify(ring()));
    await measure('3 ' + (dm.direct ? 'direct' : 'cast') + ' scroll', 8);
    console.log('--- log');
    console.log(fs.readFileSync(base + '/log/browserd.log', 'utf8').split('\n').filter((l) => /direct|wlframe|webframe|graphics|perf|engine up|engine exited|engine start|full screen|fault/.test(l)).map((l) => l.slice(25, 300)).join('\n'));
    tell({ op: 'close' });
    await sleep(2500);
    await dm.close();
    srv.close();
    try { cp.execSync('pkill -9 -u kkds -f ' + B + '/engine/chrome'); } catch (e) { /* none */ }
    process.exit(0);
})().catch((e) => { console.error('e2e failed: ' + e.stack); process.exit(1); });
