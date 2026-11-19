'use strict';

// Pictures of THEiPlay's screens without a car: every screen is drawn as the app draws it
// (menu_draw.js), the recorded ops are played into the software canvas (rt_canvas.js) and saved as
// PNG. Where the car shows a video (AirPlay, a film) a grey box stands in.
//   node tools/preview_ui.js [out-dir]        default: dev-logs/preview
var fs = require('fs');
var path = require('path');

var src = path.join(__dirname, '..', 'apps', 'g21_airplay', 'src');
var record = require(path.join(src, 'rt_record.js'));
var Canvas = require(path.join(src, 'rt_canvas.js')).Canvas;
var out = process.argv[2] || path.join(__dirname, '..', 'dev-logs', 'preview');

var realVideo = record.Recorder.prototype.video;
record.Recorder.prototype.video = function (id, x, y, w, h, r) {
    this.roundRect(x, y, w, h, 0, '#23323a');
    this.text('obraz', x + w / 2, y + h / 2 + 12, 34, '#6f97a6', { literal: true, align: 'center', font: 'bold' });
    return realVideo.call(this, id, x, y, w, h, r);
};

var menu = require(path.join(src, 'menu_draw.js'));
var kb = require(path.join(src, 'knob_keyboard.js'));

function save(name, built) {
    var f = built.frame;
    var words = new Uint32Array(f.buffer.slice(f.byteOffset + 8, f.byteOffset + f.length));
    var cv = new Canvas(1920, 720);
    cv.clear([0, 0, 0, 255]);
    // what the HMI shows around the app's page: its back column and status row
    cv.fillRect(0, 0, 1920, 88, [16, 18, 22, 255]);
    cv.fillRect(0, 88, 104, 632, [16, 18, 22, 255]);
    record.play(words, cv);
    fs.writeFileSync(path.join(out, name + '.png'), cv.png());
    return { name: name, ops: built.rects, bytes: f.length };
}

function items(name) {
    return menu.SCREENS[name].map(function (i) {
        return { name: i.name, title: i.title, hint: i.hint || '', icon: i.icon || 'play', adjust: !!i.adjust, on: !!i.on };
    });
}
var airOff = { on: false, online: false, status: 'wyłączony', screens: [{ key: 'central', on: true }, { key: 'cluster', on: false }, { key: 'hud', on: false }], mirrored: false, window: null };
var airWait = { on: true, online: false, status: 'czeka na iPhone', screens: [{ key: 'central', on: true }, { key: 'cluster', on: true }, { key: 'hud', on: false }], mirrored: false, window: null };
var airOn = { on: true, online: true, status: 'połączono', screens: [{ key: 'central', on: true }, { key: 'cluster', on: true }, { key: 'hud', on: false }], mirrored: true, window: { x: 1150, y: 196, w: 660, h: 304 }, full: false, fullUi: false, tune: null };
function menuFrame(screen, sel, detail, heading, air, extra) {
    extra = extra || {};
    var list = extra.items || items(screen);
    if (screen === 'airplay' && air && air.on) {
        list[0].title = 'Zakończ'; list[0].icon = 'stop'; list[0].hint = air.online ? 'iPhone połączony' : 'czeka na iPhone'; list[1].hint = 'środek + zegary';
    }
    if (extra.armed) { list[sel].armed = true; list[sel].adjust = true; }
    menu.useTheme(menu.themeFor(screen));
    return menu.buildFrame(list, sel, 1920, 720, detail || '', heading || 'THEiPlay', '0.1.136', extra.stream || null, extra.preview || null, null,
        menu.crumbFor(screen, heading || 'THEiPlay', ''), air, null);
}
var winPreview = { x: 640, y: 180, w: 640, h: 360, limitW: 1920, limitH: 720, label: 'Okno', sliders: [
    { key: 'pos-x', label: 'Poziomo', value: 640, min: 0, max: 1280, on: true },
    { key: 'pos-y', label: 'Pionowo', value: 180, min: 0, max: 360, on: false },
    { key: 'pos-size', label: 'Rozmiar', value: 640, min: 160, max: 1920, on: false }] };
var framesPreview = { frames: [
    { label: 'Środek', x: 640, y: 180, w: 640, h: 360, limitW: 1920, limitH: 720, focus: true },
    { label: 'Zegary', x: 300, y: 120, w: 480, h: 220, limitW: 1088, limitH: 480, focus: false },
    { label: 'HUD', x: 200, y: 120, w: 400, h: 240, limitW: 800, limitH: 480, focus: false }] };

if (!fs.existsSync(out)) { fs.mkdirSync(out); }
var done = [];
done.push(save('01-root', menuFrame('root', 0, '', 'THEiPlay', airOff)));
done.push(save('02-airplay-wait', menuFrame('airplay', 1, 'gotowe do lustra', 'THEiPlay', airWait)));
done.push(save('02b-airplay-pin', menuFrame('airplay', 0, 'PIN 4821', 'THEiPlay', airWait)));
done.push(save('03-airplay-on', menuFrame('airplay', 5, 'iPhone 172.20.10.3', 'THEiPlay', airOn)));
done.push(save('04-quality-kombi', menuFrame('quality-kombi', 3, '', 'Jakość obrazu', airOff)));
done.push(save('05-position', menuFrame('pos-out', 2, '', 'Pozycja', airOff, { preview: winPreview })));
done.push(save('06-position-armed', menuFrame('pos-out', 2, '', 'Pozycja', airOff, { preview: winPreview, armed: true })));
done.push(save('07-position-each', menuFrame('pos-each', 0, '', 'Pozycja', airOff, { preview: framesPreview })));
done.push(save('08-settings', menuFrame('settings', 0, '', 'THEiPlay', airOff)));
done.push(save('40-theme-youtube', menuFrame('youtube', 1, '', 'THEiPlay', null)));
done.push(save('41-theme-browser-settings', menuFrame('apps-settings', 2, '', 'Ustawienia', null)));
done.push(save('42-theme-store', menuFrame('apps-store', 0, '', 'Sklep', null)));
menu.useTheme('store');
done.push(save('43-app-starting', menu.buildWebFrame(1920, 720, { connected: true, engine: 'starting', app: 'hello', appName: 'Hello THEiPlay' })));
done.push(save('44-app-running', menu.buildWebFrame(1920, 720, { connected: true, engine: 'ready', live: true, video: true, w: 1796, h: 580, app: 'hello', appName: 'Hello THEiPlay' })));
menu.useTheme('browser');
done.push(save('45-browser', menu.buildWebFrame(1920, 720, { connected: true, engine: 'ready', live: true, video: true, w: 1796, h: 548, url: 'https://example.com/', title: 'Example', zoom: 1 })));
menu.useTheme('base');
done.push(save('09-label', menuFrame('label', 6, 'napis', 'Napis', airOff)));
var where = JSON.parse(JSON.stringify(airWait)); where.whereOpen = true; where.whereCursor = 0;
done.push(save('10-where', menuFrame('airplay', 1, '', 'THEiPlay', where)));
var ytGo = { yt: { live: false, screens: [{ key: 'central', on: true, hint: 'pełny ekran' }, { key: 'cluster', on: true, hint: 'pozycja 300, 120' }, { key: 'hud', on: false, hint: 'pozycja 200, 120' }], whereOpen: true, whereCursor: 3, whereGo: true } };
done.push(save('11-youtube-where', menuFrame('root', 1, '', 'THEiPlay', ytGo)));
var full = JSON.parse(JSON.stringify(airOn)); full.full = true; full.fullUi = true;
done.push(save('12-fullscreen', menuFrame('airplay', 0, '', 'THEiPlay', full)));
var stream = { pin: '', headline: 'Miracast', hint: 'czekam na komputer', mirrored: false, spin: true, lines: ['Wi-Fi: iPhone', 'Win+K na komputerze'], window: null,
    screens: [{ name: 'stream-central', title: 'Środek', on: true }, { name: 'stream-cluster', title: 'Zegary', on: false }, { name: 'stream-hud', title: 'HUD', on: false }], tune: null };
done.push(save('13-stream-wait', menu.buildFrame(items('stream'), 0, 1920, 720, 'czekam', 'Stream', '0.1.136', stream, null, null, 'Miracast', null, null)));
var pinInfo = JSON.parse(JSON.stringify(stream)); pinInfo.pin = '4821'; pinInfo.headline = 'AirPlay';
done.push(save('14-stream-pin', menu.buildFrame(items('stream'), 0, 1920, 720, 'PIN 4821', 'Stream', '0.1.136', pinInfo, null, null, 'AirPlay > Lustro', null, null)));
var tuned = JSON.parse(JSON.stringify(stream)); tuned.mirrored = true; tuned.video = true; tuned.window = { x: 1100, y: 150, w: 700, h: 300 };
tuned.tune = { name: 'central', title: 'Środek', tool: 'pos', axis: 'x', x: 640, y: 180, w: 640, h: 360, limitW: 1920, limitH: 720, saved: false };
done.push(save('15-stream-tune', menu.buildFrame(items('stream'), 0, 1920, 720, '', 'Stream', '0.1.136', tuned, null, null, 'AirPlay > Lustro', null, null)));
var edit = kb.createEdit({ mode: 'name', value: 'G21-Car', title: 'Nazwa AirPlay' });
kb.moveKeyDir(edit, 's');
done.push(save('16-keyboard', menu.buildKeyboardFrame(edit, 1920, 720, 'AirPlay > Nazwa', airOff, '0.1.136')));
var ride = { on: true, mode: 'home', status: 'Wczytuję…', sections: [{ title: 'Polecane', items: [
    { title: 'BMW G21 – test', hint: 'kanał · 12 tys. wyświetleń', duration: '12:04' }, { title: 'Nocna jazda', hint: 'kanał', duration: '8:31' }] }] };
done.push(save('17-youtube-fallback', menu.buildFrame(items('yt-browse'), 0, 1920, 720, '', 'THEiPlay', '0.1.136', null, null, null, 'YouTube', null, ride)));

// Przeglądarka: the menu with its new item, then the browser screen in its states
done.push(save('18-menu-browser', menuFrame('root', 6, '', 'THEiPlay', airOff)));
var webPage = { connected: true, engine: 'ready', err: '', url: 'https://pl.wikipedia.org/wiki/BMW_serii_3', title: 'BMW serii 3 – Wikipedia, wolna encyklopedia', loading: false, back: true, fwd: false, live: true, video: true, zoom: 1.5, editable: true, pct: 100 };
done.push(save('19-browser-page', menu.buildWebFrame(1920, 720, webPage)));
done.push(save('20-browser-loading', menu.buildWebFrame(1920, 720, Object.assign({}, webPage, { loading: true, editable: false, url: 'http://example.com/', title: '', fwd: true, err: 'zły adres' }))));
done.push(save('21-browser-download', menu.buildWebFrame(1920, 720, { connected: true, engine: 'downloading', pct: 37, video: true, zoom: 1.5 })));
done.push(save('22-browser-starting', menu.buildWebFrame(1920, 720, { connected: true, engine: 'starting', video: true, zoom: 1.5 })));
done.push(save('23-browser-failed', menu.buildWebFrame(1920, 720, { connected: true, engine: 'failed', err: 'nie udało się pobrać silnika: sprawdź internet w aucie', video: true, zoom: 1.5 })));
done.push(save('24-browser-no-tool', menu.buildWebFrame(1920, 720, { connected: false, engine: 'off', video: true, zoom: 1.5 })));
var webEdit = kb.createEdit({ mode: 'url', value: 'pl.wikipedia.org/wiki/BMW', title: 'Adres' });
done.push(save('25-browser-address', menu.buildKeyboardFrame(webEdit, 1920, 720, 'Adres', null, '0.1.136')));

done.forEach(function (d) { console.log(d.name + ': ' + d.ops + ' ops, ' + d.bytes + ' B'); });
