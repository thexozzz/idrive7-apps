'use strict';
// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * rt_host.js - RideTube's screen inside THEiPlay.
 *
 * RideTube (JustAnotherPU/ridetube, GPL-3.0-or-later) runs on the MGU App Kit (kit/runtime/mgu.js),
 * which owns a whole OAP app: its RHMI screens, settings and lifecycle. THEiPlay is one app with its
 * own menu, so here the kit's ctx is made by hand for RideTube's view (rt_view.js):
 *
 *   - a stand-in for the RHMI (FakeUi): RideTube's buttons are events here, its screen VIEW is "shown"
 *     while THEiPlay has it open; MAIN (the HMI's search menu, blank on this G21) is the search keyboard
 *   - the kit's display (rt_display.js) draws the screen with mgu-render, as in RideTube; it holds the
 *     renderer only while the screen is open (THEiPlay's menu has it the rest of the time)
 *   - the settings (RideTube's, plus the cluster / HUD screens and the account) on the kit's sheet
 *   - ctx.loop as the kit's, ctx.spell = THEiPlay's knob keyboard
 *
 * Never exits, never throws to the caller: every handler logs its errors.
 */
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const { Display } = require('./rt_display.js');
const themes = require('./rt_themes.js');
const { listSheet } = require('./rt_sheet.js');
const view = require('./rt_view.js');

const SB_OPTIONS = [['skip', 'Skip'], ['ask', 'Show a Skip button'], ['off', 'Off']];
// RideTube 0.3.8 app.json "settings" (quality: 480p by default here - the MGU decodes in software),
// then THEiPlay's: where the film also goes, and the account.
const SCHEMA = [
    { key: 'fill', label: 'Fill the screen (crops the video; off: black side bars)', type: 'bool', default: false },
    // THEiPlay: the quality is THEiPlay's "Jakość obrazu" (centre / cluster and HUD profiles), shown here, set there
    { key: 'quality', label: 'Jakość obrazu (menu THEiPlay)', type: 'action', host: true },
    { key: 'video_driving', label: 'Video while driving - at your own risk, only for a car coded for video in motion (passengers); takes effect once parked', type: 'bool', default: false },
    { key: 'members', label: 'Show members-only videos', type: 'bool', default: false },
    { key: 'sb_sponsor', label: 'SponsorBlock: Sponsors', type: 'choice', default: 'skip', options: SB_OPTIONS },
    { key: 'sb_selfpromo', label: 'SponsorBlock: Self-promotion', type: 'choice', default: 'skip', options: SB_OPTIONS },
    { key: 'sb_interaction', label: 'SponsorBlock: Like & subscribe reminders', type: 'choice', default: 'skip', options: SB_OPTIONS },
    { key: 'sb_intro', label: 'SponsorBlock: Intros', type: 'choice', default: 'skip', options: SB_OPTIONS },
    { key: 'sb_outro', label: 'SponsorBlock: End cards and credits', type: 'choice', default: 'ask', options: SB_OPTIONS },
    { key: 'sb_music_offtopic', label: 'SponsorBlock: Non-music parts of music videos', type: 'choice', default: 'off', options: SB_OPTIONS },
    { key: 'battery', label: 'Parked: pause when the 12 V battery is under', type: 'choice', default: '65', options: [['60', '60 %'], ['65', '65 %'], ['70', '70 %'], ['0', 'Never']] },
    { key: 'yt_central', label: 'Picture on the centre screen (off: the cluster / HUD only, a smaller picture)', type: 'bool', default: true, screen: true },
    { key: 'yt_cluster', label: 'Also on the cluster (gauges)', type: 'bool', default: false, screen: true },
    { key: 'yt_hud', label: 'Also on the HUD', type: 'bool', default: false, screen: true },
    { key: 'account', label: 'YouTube account', type: 'action' },
];
const BUTTONS = [['BTN_PLAY', 'Play'], ['BTN_RW', '-10 s'], ['BTN_FF', '+10 s'], ['BTN_LIST', 'Player'], ['BTN_FIND', 'Search'], ['BTN_SETTINGS', 'Settings']];

/** Settings as the kit's (get / set / onChange / item / display / cycle), in THEiPlay's data folder. */
class Settings {
    constructor(schema, file, log, hooks) {
        this.schema = schema; this.file = file; this.log = log; this.hooks = hooks || {};
        this.values = {}; this.listeners = [];
        schema.forEach((s) => { if (s.type !== 'action') this.values[s.key] = s.default; });
        try { Object.assign(this.values, JSON.parse(fs.readFileSync(file, 'utf8'))); } catch (e) { /* none yet */ }
    }
    get(key) {
        const it = this.item(key);
        if (it && it.host && this.hooks.host) return this.hooks.host(key);
        if (it && it.screen && this.hooks.screen) return !!this.hooks.screen(key);
        return this.values[key];
    }
    set(key, value) {
        const it = this.item(key);
        if (it && it.screen && this.hooks.setScreen) this.hooks.setScreen(key, !!value);
        else {
            this.values[key] = value;
            try { fs.writeFileSync(this.file, JSON.stringify(this.values, null, 1)); } catch (e) { this.log.warn('settings save: ' + e); }
        }
        this.listeners.forEach((fn) => { try { fn(key, value); } catch (e) { this.log.error('settings', e); } });
    }
    onChange(fn) { this.listeners.push(fn); }
    item(key) { return this.schema.find((s) => s.key === key); }
    display(key) {
        const s = this.item(key), v = this.get(key);
        if (!s) return String(v);
        if (s.host && this.hooks.hostText) return this.hooks.hostText(key);
        if (s.type === 'action') return this.hooks.actionText ? this.hooks.actionText(key) : '';
        if (s.type === 'choice') { const o = (s.options || []).find((x) => x[0] === v); return o ? o[1] : String(v); }
        if (s.type === 'bool') return v ? 'On' : 'Off';
        return String(v);
    }
    cycle(key) {
        const s = this.item(key);
        if (!s) return;
        if (s.host) return;                                   // set in THEiPlay's menu
        if (s.type === 'action') { if (this.hooks.action) this.hooks.action(key); return; }
        if (s.type === 'bool') { this.set(key, !this.get(key)); return; }
        const list = s.type === 'choice' ? s.options.map((o) => o[0]) : [];
        if (!list.length) return;
        this.set(key, list[(list.indexOf(this.get(key)) + 1) % list.length]);
    }
}

/** RideTube's RHMI components: events only (THEiPlay has no RHMI screens for them). */
class Comp extends EventEmitter {
    constructor(name, id) { super(); this.name = name; this.id = id; }
    getId() { return this.id; }
}

class FakeUi {
    constructor(host, log) {
        this.host = host; this.log = log;
        this.comps = new Map();
        this._vis = {}; this._focus = {};
        this._visH = []; this._focH = []; this._topH = [];
        this.timing = { png: 0, push: 0 };
        this.display = null;
        this.rhmi = { getByName: (n) => this.comp(n) };
    }
    comp(name) {
        let c = this.comps.get(name);
        if (!c) { c = new Comp(name, 9000 + this.comps.size); this.comps.set(name, c); }
        return c;
    }
    text(name, text) { if (this.display) this.display.label(name, text); return Promise.resolve(); }
    cells() { return Promise.resolve(); }
    selected() { return Promise.resolve(); }
    rows() { return Promise.resolve(); }
    visible() { return Promise.resolve(); }
    enabled() { return Promise.resolve(); }
    checked() { return Promise.resolve(); }
    onClick(name, fn) {
        this.comp(name).on('action', (ev) => {
            Promise.resolve().then(() => fn(ev || {})).catch((e) => this.log.error('click ' + name, e));
        });
    }
    /** VIEW: show the screen; MAIN (RideTube's search menu): the search keyboard; SETTINGS: the settings sheet. */
    open(name) {
        if (name === 'VIEW') this.host.show();
        else if (name === 'MAIN') this.comp('BTN_SEARCH').emit('action', {});
        else if (name === 'SETTINGS') this.comp('BTN_SETTINGS').emit('action', {});
        return Promise.resolve();
    }
    /** VIEW closed (the controller pushed left at the edge, Back): back to THEiPlay's menu. */
    close(name) { if (name === 'VIEW') this.host.exit(); return Promise.resolve(); }
    isVisible(name) { return !!this._vis[name]; }
    hasFocus(name) { return this._focus[name] !== false; }
    onVisible(fn) { this._visH.push(fn); }
    onFocus(fn) { this._focH.push(fn); }
    onTop(fn) { this._topH.push(fn); }
    topScreen() { return this._vis.VIEW ? 'VIEW' : null; }
    _raise() { /* one screen */ }
    _invalidate() { /* no HMI images */ }
    _setVisible(name, on) {
        on = !!on;
        if (!!this._vis[name] === on) return;
        this._vis[name] = on;
        this._visH.forEach((fn) => { try { fn(name, on); } catch (e) { this.log.error('visible', e); } });
    }
    _setFocus(name, on) {
        on = on !== false;
        if (this.hasFocus(name) === on) return;
        this._focus[name] = on;
        this._focH.forEach((fn) => { try { fn(name, on); } catch (e) { this.log.error('focus', e); } });
    }
    /** A frame: to the renderer (rt_display); there is no HMI image to fall back on. */
    image(name, r) { return this.display ? this.display.present(name, r, () => Promise.resolve()) : Promise.resolve(); }
}

/** The kit's ctx.loop (mgu.js): fn once per renderer tick while the screen shows, else fps a second. */
function makeLoop(ui, display, log) {
    return function loop(stateName, fps, fn) {
        let timer = null, on = false, running = false;
        const gpuOn = () => display.active(stateName);
        const tick = async () => {
            timer = null;
            if (!on || running) return;
            running = true;
            const t0 = Date.now();
            try { await fn(); } catch (e) { log.error('loop ' + stateName, e); }
            running = false;
            schedule(Date.now() - t0);
        };
        const schedule = (dt) => {
            if (!on || timer !== null || running) return;
            if (gpuOn()) timer = setTimeout(tick, display.gpu.waiting ? 250 : 16);
            else timer = setTimeout(tick, Math.max(15, 1000 / fps - (dt || 0)));
        };
        display.onTick(() => {
            if (!on || running) return;
            if (timer !== null) { clearTimeout(timer); timer = null; }
            if (gpuOn()) tick(); else schedule(0);
        });
        const set = (v) => {
            on = v;
            if (on && timer === null && !running) timer = setTimeout(tick, 0);
            if (!on && timer !== null) { clearTimeout(timer); timer = null; }
        };
        ui.onVisible((name, v) => { if (name === stateName) set(v); });
        if (ui.isVisible(stateName)) set(true);
        return { stop: () => set(false), kick: () => { if (on && !running) { if (timer !== null) clearTimeout(timer); timer = setTimeout(tick, 0); } } };
    };
}

/** No SOME/IP vehicle signals in THEiPlay yet (its manifest has none): RideTube runs without speed and battery. */
const NO_SIGNALS = { watch: () => Promise.resolve({ available: false, error: 'no vehicle signals in THEiPlay' }) };

/**
 * opts: {
 *   log(text)            THEiPlay's start log
 *   dataDir              where RideTube keeps its settings, recent searches, hidden channels
 *   version              shown at the settings' top
 *   spell(title)         -> Promise of the text typed (null: cancelled): THEiPlay's knob keyboard
 *   onExit()             the screen closed: THEiPlay's menu comes back
 *   screen(key) / setScreen(key, on)   yt_cluster / yt_hud: THEiPlay's YouTube screens
 *   kombiWanted()        the cluster or the HUD shows the film (the picture stays on while this screen is closed)
 *   videoRect()          the decoder's picture size, e.g. '848x480'
 *   centralVideo()       false: the centre screen shows the player without the picture (the cluster / HUD only)
 * }
 * Returns { model, open(), exit(), close(), isOpen(), spelling(), pause(), resume(), display, ui, settings }.
 */
function createRideTube(opts) {
    const note = opts.log || function () {};
    const fmt = (m, e) => String(m) + (e ? ' ' + (e && (e.stack || e.message) || e) : '');
    const log = {
        info: (m) => note('rt ' + m), debug: () => {},
        warn: (m) => note('rt-warn ' + m), error: (m, e) => note('rt-error ' + fmt(m, e)),
    };
    // open: THEiPlay has the screen open; hidden: THEiPlay itself is not in front (Home, another app);
    // spelling: THEiPlay's keyboard has the screen. Shown = open and neither of the others.
    let open = false, hidden = false, spelling = false;
    const host = {
        show() {
            if (!open) { open = true; note('rt-open'); }
            if (hidden || spelling) return;
            display.suspend(false);
            ui._setFocus('VIEW', true);
            ui._setVisible('VIEW', true);
        },
        exit(quiet) {
            if (!open) return;
            open = false;
            note('rt-close');
            ui._setVisible('VIEW', false);
            display.suspend(true);
            if (!quiet) try { if (opts.onExit) opts.onExit(); } catch (e) { log.error('exit', e); }
        },
    };
    const ui = new FakeUi(host, log);
    let model = null;
    const settings = new Settings(SCHEMA, path.join(opts.dataDir || process.cwd(), 'ridetube-settings.json'), log, {
        screen: (key) => (opts.screen ? opts.screen(key) : false),
        host: () => (opts.videoQuality ? opts.videoQuality() : '480'),
        hostText: () => (opts.qualityText ? opts.qualityText() : ''),
        setScreen: (key, on) => { if (opts.setScreen) opts.setScreen(key, on); },
        actionText: () => (model && model.auth && model.auth.state === 'signed_in' ? 'Signed in - press to sign out' : 'Sign in'),
        // signed in: out at once (the sheet stays); else the Home page shows the sign-in code
        action: () => {
            if (!model) return;
            if (model.auth && model.auth.state === 'signed_in') { model.signOut(); return; }
            display.closeSheet();
            ui.comp('BTN_ACCOUNT').emit('action', {});
        },
    });
    const SPEC = {
        id: 'g21_airplay', title: 'RideTube', version: opts.version || '', suspended: true, neverBlock: true,
        screens: [{ name: 'VIEW', kind: 'canvas', title: 'RideTube', hmi: false, bg: '#0f0f0f', buttons: BUTTONS }],
        settings: SCHEMA,
    };
    const theme = () => themes.theme(settings.get('theme'));
    const display = new Display(ui, log, SPEC, settings, theme);
    ui.display = display;
    // the kit's Settings tab: RideTube's settings drawn over the page
    ui.onClick('BTN_SETTINGS', () => {
        if (display.sheet && display.sheet.settings) { display.closeSheet(); return; }
        const sh = listSheet(settings, null, { version: SPEC.version });
        sh.settings = true;
        display.openSheet(sh);
    });
    const ctx = {
        app: null, ui, settings, log, spec: SPEC, dataDir: opts.dataDir || process.cwd(), display,
        signals: NO_SIGNALS,
        strictParked: false,
        theme,
        background: () => true,
        // the search keyboard: THEiPlay's menu takes the screen meanwhile, then RideTube's comes back
        spell: (app, title) => {
            ui._setVisible('VIEW', false);
            display.suspend(true);
            spelling = true;
            const back = () => { spelling = false; if (open) host.show(); };
            return Promise.resolve()
                .then(() => (opts.spell ? opts.spell(title) : null))
                .then((t) => { back(); return t; }, (e) => { back(); throw e; });
        },
        kombiWanted: () => !!(opts.kombiWanted && opts.kombiWanted()),
        centralVideo: () => !opts.centralVideo || !!opts.centralVideo(),
        videoRect: opts.videoRect,
        qualityText: opts.qualityText,
        exit: () => host.exit(),
        controller: { grab(on) { display.grab(on); }, onInput(fn) { display.onCcu = fn; } },
        onTab(fn) { display.onTab = fn; },
        onTap(fn) { display.onTap = fn; },
        onTouch(fn) { display.onTouch = fn; },
        onBack(fn) { display.onBack = fn; },
        focus(key) { display.focusPage(key); },
        sheet(sh) { return display.openSheet(sh); },
        hideButton(id, hide) { display.hideButton(id, hide); },
        onPageFocus(fn) { display.onPageFocus = fn; },
        onScroll(fn) { display.onScroll = fn; },
        onSwipe(fn) { display.onSwipe = fn; },
        onLayout(fn) { display.onLayout(fn); },
        canvas(w, h) { return display.canvas(w, h); },
    };
    ctx.loop = makeLoop(ui, display, log);
    try {
        Promise.resolve(view.start(ctx)).catch((e) => log.error('start', e));
    } catch (e) {
        log.error('start', e);
    }
    model = ctx.model || null;
    return {
        model,
        ui, settings, display,
        open: () => host.show(),
        /** back to THEiPlay's menu (onExit) */
        exit: () => host.exit(false),
        /** closed without onExit (THEiPlay's "Wyłącz aplikację") */
        close: () => host.exit(true),
        isOpen: () => open,
        /** THEiPlay's keyboard is up for RideTube's search (it has the screen meanwhile) */
        spelling: () => spelling,
        /** THEiPlay hidden (Home, another app): the screen lets go of the renderer, open stays as it was. */
        pause() {
            if (hidden) return;
            hidden = true;
            ui._setVisible('VIEW', false);
            display.suspend(true);
        },
        resume() {
            if (!hidden) return;
            hidden = false;
            if (open) host.show();
        },
    };
}

module.exports = { createRideTube, SCHEMA, Settings, FakeUi };
