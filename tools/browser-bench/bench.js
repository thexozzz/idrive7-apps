'use strict';
// Development machine: what one page frame costs on its way out of the engine, measured, for the screencast path
// (JPEG through DevTools, base64, decoded again by g21-webframe: what the head unit runs today).
//   node bench.js <scene> <seconds> <gapMs> [extra chrome switches...]
// scene: scroll (a long page scrolled every frame), anim (CSS animation), still (nothing moves), video (canvas noise)
const cp = require('child_process'), fs = require('fs'), path = require('path');
const B = '/opt/scr/bench', E = B + '/engine', L = B + '/lib';
const scene = process.argv[2] || 'scroll', secs = Number(process.argv[3]) || 8, gap = Number(process.argv[4]) || 0;
const extra = process.argv.slice(5);
const W = 1436, H = 438, SCALE = 0.9375;         // the head unit's page area at zoom 1.25, picture 0.75
const T = fs.mkdtempSync('/tmp/g21bench-');
const PAGES = {
    scroll: '<body style="margin:0;font:18px sans-serif"><div id=c></div><script>var s="";for(var i=0;i<400;i++)s+="<p style=\\"margin:8px;padding:8px;background:hsl("+(i*7%360)+",60%,85%)\\">Wiersz "+i+" Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore.</p>";c.innerHTML=s;var y=0;function f(){y+=6;if(y>document.body.scrollHeight-innerHeight)y=0;scrollTo(0,y);requestAnimationFrame(f);}f();</script>',
    anim: '<body style="margin:0;background:#123"><style>@keyframes m{from{transform:translateX(0) rotate(0)}to{transform:translateX(1100px) rotate(360deg)}}div{width:160px;height:160px;margin:20px;background:linear-gradient(45deg,#f80,#08f);animation:m 2s linear infinite alternate}</style><div></div><div style="animation-duration:3s"></div>',
    still: '<body style="margin:0;font:22px sans-serif"><h1>Strona stoi</h1><p>Nic sie nie rusza.</p>',
    video: '<body style="margin:0;background:#000"><canvas id=c width=1280 height=400></canvas><script>var x=c.getContext("2d"),t=0;function f(){t++;for(var i=0;i<60;i++){x.fillStyle="hsl("+((t*3+i*20)%360)+",80%,"+(30+(i*7+t)%50)+"%)";x.fillRect((i*97+t*5)%1280,(i*53+t*3)%400,180,120);}requestAnimationFrame(f);}f();</script>'
};
const MODE = process.env.MODE || '';
const env = { LD_LIBRARY_PATH: L + ':' + E, HOME: T, TMPDIR: T, XDG_CONFIG_HOME: T + '/xdg', XDG_CACHE_HOME: T + '/xdgc', DBUS_SESSION_BUS_ADDRESS: 'disabled:', DBUS_SYSTEM_BUS_ADDRESS: 'unix:path=' + T + '/no-dbus', TZ: 'Europe/Warsaw' };
const args = ['--remote-debugging-pipe', '--user-data-dir=' + T + '/profile', '--window-size=' + W + ',' + H].concat(process.env.MODE === 'g21' ? [] : ['--force-device-scale-factor=' + SCALE]).concat([
    '--disable-gpu', '--password-store=basic', '--use-mock-keychain', '--no-first-run', '--disable-breakpad', '--disable-background-networking', '--disable-component-update', '--disable-sync',
    '--disable-default-apps', '--disable-features=Translate,MediaRouter,OptimizationHints', '--no-default-browser-check', '--disable-extensions', '--mute-audio']).concat(MODE ? ['--ozone-platform=' + (MODE === 'g21' ? 'wayland' : MODE), '--kiosk', '--window-position=0,0'] : ['--headless=new'], extra, ['about:blank']);
let wl = null, wlStat = { frames: 0, ms: 0, med: [], p95: [], max: 0, us: [], pct: [], ring: '', notes: [] };
if (MODE === 'g21') {
    env.XDG_RUNTIME_DIR = T; env.WAYLAND_DISPLAY = 'g21wl';
    wl = cp.spawn(B + '/g21-wlframe', [T + '/ring', '601', T + '/g21wl', String(Math.round(W * SCALE) & ~1), String(Math.round(H * SCALE) & ~1), process.env.FPS || '60'], { stdio: ['pipe', 'pipe', 'inherit'] });
    let wb = '';
    wl.stdout.on('data', (d) => { wb += d; let i; while ((i = wb.indexOf('\n')) >= 0) { const l = wb.slice(0, i).split(' '); wb = wb.slice(i + 1);
        if (l[0] === 's' && wlStat.on) { wlStat.notes.push('s ' + l[1] + '/' + l[2]); wlStat.frames += +l[1]; wlStat.ms += +l[2]; wlStat.med.push(+l[3]); wlStat.p95.push(+l[4]); wlStat.max = Math.max(wlStat.max, +l[5]); wlStat.us.push(+l[6]); wlStat.pct.push(+l[7]); }
        else if (l[0] === 'ring') wlStat.ring = l[1] + 'x' + l[2]; else if (l[0] === 'c' || l[0] === 'e') wlStat.notes.push(l.join(' ')); } });
    cp.execSync('sleep 0.3');
} else if (MODE) { env.XDG_RUNTIME_DIR = '/mnt/wslg/runtime-dir'; env.WAYLAND_DISPLAY = 'wayland-0'; env.DISPLAY = ':0'; }
const chrome = cp.spawn(E + '/chrome', args, { env: env, stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
let errText = '';
chrome.stderr.on('data', (d) => { errText = (errText + d).slice(-3000); });
// DevTools over the pipe: JSON messages ended by a zero byte
let nextId = 1, waiting = {}, rest = Buffer.alloc(0), onEvent = () => {};
chrome.stdio[4].on('data', (d) => {
    rest = Buffer.concat([rest, d]);
    let i;
    while ((i = rest.indexOf(0)) >= 0) {
        const m = JSON.parse(rest.slice(0, i).toString('utf8'));
        rest = rest.slice(i + 1);
        if (m.id && waiting[m.id]) { const w = waiting[m.id]; delete waiting[m.id]; if (m.error) w.reject(new Error(m.error.message)); else w.resolve(m.result); } else if (m.method) onEvent(m);
    }
});
function send(method, params, sessionId) {
    return new Promise((resolve, reject) => { const id = nextId++; waiting[id] = { resolve, reject }; chrome.stdio[3].write(JSON.stringify({ id, method, params: params || {}, sessionId }) + '\0'); });
}
function cpuOf(match) {
    // user + system clock ticks of every process whose command line holds `match`
    let ticks = 0, rss = 0, n = 0;
    fs.readdirSync('/proc').filter((p) => /^\d+$/.test(p)).forEach((p) => {
        try {
            if (fs.readFileSync('/proc/' + p + '/cmdline', 'latin1').indexOf(match) < 0) return;
            const st = fs.readFileSync('/proc/' + p + '/stat', 'latin1'); const f = st.slice(st.lastIndexOf(')') + 2).split(' ');
            ticks += Number(f[11]) + Number(f[12]); rss += Number(f[21]) * 4096; n++;
        } catch (e) { /* gone */ }
    });
    return { ms: ticks * 10, rss, n };
}
(async () => {
    let page = null;
    for (let i = 0; i < 50 && !page; i++) {
        const tg = await send('Target.getTargets');
        page = tg.targetInfos.filter((t) => t.type === 'page')[0];
        if (!page) await new Promise((r) => setTimeout(r, 100));
    }
    if (!page) throw new Error('no page');
    const sid = (await send('Target.attachToTarget', { targetId: page.targetId, flatten: true })).sessionId;
    await send('Page.enable', {}, sid);
    if (MODE === 'g21') await send('Emulation.setFocusEmulationEnabled', { enabled: true }, sid).catch((e) => console.error('focus: ' + e.message));
    if (!MODE || MODE === 'g21' || process.env.EMU) await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: SCALE, mobile: process.env.EMU === 'mobile', screenWidth: W, screenHeight: H }, sid);
    const gpu = await send('SystemInfo.getInfo').catch((e) => ({ err: e.message }));
    await send('Page.navigate', { url: 'data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html>' + PAGES[scene]) }, sid);
    await new Promise((r) => setTimeout(r, 1200));
    const wf = cp.spawn(B + '/g21-webframe', [T + '/ring', '601'], { stdio: ['pipe', 'pipe', 'ignore'] });
    let wfUs = 0, wfN = 0, wfBuf = '', inFlight = 0;
    wf.stdout.on('data', (d) => { wfBuf += d; let i; while ((i = wfBuf.indexOf('\n')) >= 0) { const l = wfBuf.slice(0, i).split(' '); wfBuf = wfBuf.slice(i + 1); if (l[0] === 'f') { wfUs += Number(l[2]); wfN++; inFlight--; } } });
    const times = []; let bytes = 0, b64ms = 0, lastAck = 0;
    onEvent = (m) => {
        if (m.method !== 'Page.screencastFrame') return;
        const t = process.hrtime.bigint();
        const jpg = Buffer.from(m.params.data, 'base64');
        b64ms += Number(process.hrtime.bigint() - t) / 1e6;
        bytes += jpg.length; times.push(Date.now());
        const len = Buffer.alloc(4); len.writeUInt32LE(jpg.length, 0);
        inFlight++; wf.stdin.write(len); wf.stdin.write(jpg);
        const wait = Math.max(0, gap - (Date.now() - lastAck));
        lastAck = Date.now() + wait;
        setTimeout(() => send('Page.screencastFrameAck', { sessionId: m.params.sessionId }, sid).catch(() => {}), wait);
    };
    await send('Runtime.evaluate', { expression: 'window.__n=0;(function g(){window.__n++;requestAnimationFrame(g);})();' }, sid);
    wlStat.on = true;
    // RINGLOCK=1: for 0.6 s no new video file can be put in place while the window gets a new size (on the car: root owns the old file)
    if (process.env.RINGLOCK) { setTimeout(() => { fs.chmodSync(T, 0o555); wl.stdin.write('size 1280 480' + String.fromCharCode(10)); }, 2000); setTimeout(() => fs.chmodSync(T, 0o755), 2600); }
    (process.env.WLCMD || '').split('+').filter(Boolean).forEach((x) => { const i = x.indexOf(':'); setTimeout(() => { wlStat.notes.push('@' + x); wl.stdin.write(x.slice(i + 1).replace(/_/g, ' ') + '\n'); }, Number(x.slice(0, i))); });
    const c0 = cpuOf(E + '/chrome'), n0 = process.cpuUsage(), w0 = cpuOf(MODE === 'g21' ? 'g21-wlframe' : 'g21-webframe'), t0 = Date.now();
    if (!process.env.NOCAST) await send('Page.startScreencast', { format: process.env.FMT || 'jpeg', quality: Number(process.env.Q) || 64, everyNthFrame: 1 }, sid);
    await new Promise((r) => setTimeout(r, secs * 1000));
    const c1 = cpuOf(E + '/chrome'), n1 = process.cpuUsage(n0), w1 = cpuOf(MODE === 'g21' ? 'g21-wlframe' : 'g21-webframe'), el = (Date.now() - t0) / 1000;
    const raf = await send('Runtime.evaluate', { expression: 'JSON.stringify([window.__n,innerWidth,innerHeight,devicePixelRatio,document.hasFocus()+"/"+document.visibilityState])' }, sid).then((r) => JSON.parse(r.result.value)).catch(() => [0]);
    const iv = []; for (let i = 1; i < times.length; i++) iv.push(times[i] - times[i - 1]);
    iv.sort((a, b) => a - b);
    const q = (p) => (iv.length ? iv[Math.min(iv.length - 1, Math.floor(iv.length * p))] : 0);
    const fr = times.length || 1;
    const g = gpu.gpu || {};
    console.log(JSON.stringify({
        mode: MODE || 'headless', raf_fps: +(raf[0] / el).toFixed(1), view: raf.slice(1, 4).join('x'), chrome_cpu_ms_per_raf: +((c1.ms - c0.ms) / (raf[0] || 1)).toFixed(2),
        wl: MODE === 'g21' ? { ring: wlStat.ring, fps: +(wlStat.frames * 1000 / (wlStat.ms || 1)).toFixed(1), med: wlStat.med, p95: wlStat.p95, max: wlStat.max, conv_us: wlStat.us, pct: wlStat.pct, cpu_ms_per_s: Math.round((w1.ms - w0.ms) / el), notes: wlStat.notes.slice(0, 30), focus: raf[4] } : undefined,
        scene, cast: process.env.NOCAST ? 'off' : (process.env.FMT || 'jpeg') + ' q' + (process.env.Q || 64), gapMs: gap, extra: extra.join(' '), seconds: el, frames: times.length, fps: +(times.length / el).toFixed(1),
        interval_ms: { median: q(0.5), p95: q(0.95), max: q(1) },
        jpeg_kb_per_frame: +(bytes / fr / 1024).toFixed(1),
        chrome_cpu_ms_per_s: Math.round((c1.ms - c0.ms) / el), chrome_cpu_ms_per_frame: +((c1.ms - c0.ms) / fr).toFixed(1), chrome_procs: c1.n, chrome_rss_mb: Math.round(c1.rss / 1048576),
        node_cpu_ms_per_frame: +((n1.user + n1.system) / 1000 / fr).toFixed(2), base64_ms_per_frame: +(b64ms / fr).toFixed(2),
        webframe_ms_per_frame: +(wfUs / 1000 / (wfN || 1)).toFixed(2), webframe_cpu_ms_per_s: Math.round((w1.ms - w0.ms) / el),
        gl: (g.auxAttributes || {}).glRenderer || '', glImpl: (g.auxAttributes || {}).glImplementationParts || '', featureStatus: (g.featureStatus ? { compositing: g.featureStatus.gpu_compositing, raster: g.featureStatus.rasterization, video: g.featureStatus.video_decode, webgl: g.featureStatus.webgl } : (gpu.err || ''))
    }));
    try { wf.kill(); } catch (e) { /* gone */ }
    try { if (wl) wl.kill(); } catch (e) { /* gone */ }
    try { chrome.kill('SIGKILL'); } catch (e) { /* gone */ }
    if (process.env.KEEP) { try { fs.copyFileSync(T + '/ring', process.env.KEEP); } catch (e) { console.error('keep: ' + e.message); } }
    fs.rmSync(T, { recursive: true, force: true });
    process.exit(0);
})().catch((e) => { console.error('bench failed: ' + e.message + '\n' + errText.slice(-600)); try { chrome.kill('SIGKILL'); } catch (x) { /* gone */ } process.exit(1); });
