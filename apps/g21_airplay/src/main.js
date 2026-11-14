'use strict';

var fs = require('fs');
var path = require('path');
var OnlineApp = require('oap-sdk/src/core/OnlineApp.js');
var logging = require('oap-sdk/src/logging/logging');
var uplink = require('./uplink.js');
var settingsFactory = require('./settings_manager.js');
var display = require('./display_output.js');
var videoDecoder = require('./video_decoder.js');
var mirrorVideo = require('./mirror_video.js');
var youtubeFile = require('./youtube_file.js');
var youtubeClient = require('./youtube_client.js');
var frameFit = require('./frame_fit.js');
var videoRouter = require('./video_router.js');
var adapterFactory = require('./cluster_render_adapter.js');
var ClusterRender = require('./cluster_render_client.js').ClusterRender;
var clusterLabelFactory = require('./cluster_label.js');
var parked = require('./parked_gate.js');
var pathFactory = require('./paths.js');
var desktopSettings = require('./desktop_settings.js');
var sessionFactory = require('./session_manager.js');
var desktopSessions = require('./desktop_sessions.js');
var vncFactory = require('./vnc_client.js');
var inputFactory = require('./input_manager.js');
var frameSinkFactory = require('./frame_sink.js');
var menuDraw = require('./menu_draw.js');
var knobKeyboard = require('./knob_keyboard.js');
var configStoreFactory = require('./config_store.js');
var configPanelFactory = require('./config_panel.js');
var windowsOffers = require('./windows_offers.js');
var frameBridgeFactory = require('./frame_bridge.js');
// RideTube's screen (GPL-3.0-or-later, JustAnotherPU/ridetube on the MGU App Kit): rt_*.js
var rideTube = require('./rt_host.js');

// YouTube load on the MGU: ytdec decodes in software at the film's own
// frame rate, so the picture is kept small: the size of THEiPlay's
// "Jakość obrazu" profile (_ytFilm); the centre screen scales it on the GPU,
// the cluster/HUD get at most 24 frames a second (YT_GAUGE_MS).
// The YouTube download for a picture h px tall: the lowest of 360/480/720 that covers it.
function ytHeight(h) {
    return h <= 360 ? '360' : (h <= 480 ? '480' : '720');
}
var YT_GAUGE_MS = 42;

function noteStart(text) {
    var line = String(text) + '\n';
    ['../data/start.log', 'data/start.log', '/tmp/g21-airplay-start.log'].forEach(function (file) {
        try {
            fs.appendFileSync(file, line);
        } catch (err) {
            return;
        }
    });
}

noteStart('load');
var logger;
try {
    logger = logging.getSDKLogger();
} catch (err) {
    noteStart('logger ' + (err && err.message));
    logger = { info: noteStart, warn: noteStart, error: noteStart };
}

process.on('uncaughtException', function (err) {
    noteStart('uncaught ' + (err && err.message));
});
var STATE_NAME = 'ST_OnlineApps_G21AirPlay';
var RECEIVER_STATUS = '/run/g21-airplay.status';
var AIRPLAY_PIN_FILE = '/run/g21-airplay/pin';
var AIRPLAY_CLIENT_FILE = '/run/g21-airplay/client';
var FOREGROUND_REASONS = ['ENTRY_POINT', 'LUM', 'BOOKMARK', 'START_WIDGET', 'TRIGGER_HMI', 'SPEECH_COMMAND'];
var ROOT_STATUS_TEXT = {
    'uplink-not-wifi': 'brak wifi',
    'wifi-down': 'brak wifi',
    'no-lease': 'brak wifi',
    'brak-wifi': 'brak wifi',
    'waiting': 'wybierz protokol',
    'idle': 'menu',
    'unknown': 'menu'
};

var AIR_STATUS_TEXT = {
    'uplink-not-wifi': 'brak wifi',
    'wifi-down': 'brak wifi',
    'no-lease': 'brak wifi',
    'brak-wifi': 'brak wifi',
    'starting': 'AirPlay start',
    'running': 'AirPlay dziala',
    'missing': 'brak odbiornika',
    'mdns-brak': 'brak dns',
    'uxplay-exit': 'AirPlay stop',
    'idle': 'AirPlay off',
    'waiting': 'gotowe do lustra',
    'pick-out': 'wybierz ekran',
    'pin-wait': 'czekam na kod',
    'not-parked': 'tylko postoj',
    'speed-unknown': 'brak predkosci',
    'bad-name': 'zla nazwa',
    'unknown': 'AirPlay'
};

var RDP_STATUS_TEXT = {
    'speed-unknown': 'brak predkosci',
    'not-parked': 'tylko postoj',
    'uplink-not-wifi': 'brak wifi',
    'wifi-down': 'brak wifi',
    'no-lease': 'brak wifi',
    'no-host': 'ustaw IP',
    'rdp-client-missing': 'brak g21-rdp',
    'secret-write-failed': 'blad hasla',
    'status-write': 'blad statusu',
    'connect-failed': 'RDP blad start',
    'starting': 'RDP lacze',
    'connecting': 'RDP lacze',
    'connected': 'RDP dziala',
    'running': 'RDP dziala',
    'missing': 'brak g21-rdp',
    'cert': 'zatwierdz Cert',
    'error': 'RDP blad',
    'freerdp': 'blad FreeRDP',
    'connect': 'PC odrzucil',
    'gdi': 'blad obrazu',
    'idle': 'RDP off',
    'waiting': 'profil + Polacz',
    'pick-out': 'wybierz ekran',
    'not-parked': 'tylko postoj',
    'panel-www': 'panel WWW :1235',
    'bad-host': 'zly IP',
    'bad-port': 'zly port',
    'bad-name': 'zla nazwa',
    'max-profiles': 'max 6 profili',
    'last-profile': 'zostaw 1 profil',
    'unknown': 'RDP'
};

var VNC_STATUS_TEXT = {
    'speed-unknown': 'brak predkosci',
    'not-parked': 'tylko postoj',
    'uplink-not-wifi': 'brak wifi',
    'wifi-down': 'brak wifi',
    'no-lease': 'brak wifi',
    'no-host': 'ustaw IP',
    'starting': 'odbiornik lacze',
    'running': 'odbiornik dziala',
    'connected': 'odbiornik dziala',
    'idle': 'odbiornik off',
    'waiting': 'WL = ekran z PC',
    'bad-host': 'zly IP',
    'bad-port': 'zly port',
    'max-profiles': 'max 6 profili',
    'last-profile': 'zostaw 1 profil',
    'unknown': 'VNC'
};

var WINDOWS_STATUS_TEXT = {
    'speed-unknown': 'brak predkosci',
    'not-parked': 'tylko postoj',
    'uplink-not-wifi': 'brak wifi',
    'wifi-down': 'brak wifi',
    'no-lease': 'brak wifi',
    'brak-wifi': 'brak wifi',
    'starting': 'Miracast start',
    'waiting': 'czekam Win+K',
    'offer': 'PC wykryty',
    'running': 'Miracast dziala',
    'missing': 'brak g21-mice',
    'mdns-brak': 'brak dns',
    'error': 'Miracast blad',
    'idle': 'Miracast off',
    'no-offers': 'brak ofert',
    'unknown': 'Miracast'
};

var STREAM_STATUS_TEXT = {
    'running': 'stream',
    'idle': 'koniec',
    'waiting': 'czekam na iPhone',
    'pin-wait': 'czekam na kod',
    'unknown': 'stream'
};

var STATUS_BY_SCREEN = {
    root: ROOT_STATUS_TEXT,
    airplay: AIR_STATUS_TEXT,
    windows: WINDOWS_STATUS_TEXT,
    'win-devices': WINDOWS_STATUS_TEXT,
    stream: STREAM_STATUS_TEXT,
    'air-out': AIR_STATUS_TEXT,
    rdp: RDP_STATUS_TEXT,
    'rdp-edit': RDP_STATUS_TEXT,
    'rdp-out': RDP_STATUS_TEXT,
    vnc: VNC_STATUS_TEXT,
    'vnc-edit': VNC_STATUS_TEXT
};

var PROTOCOLS = { airplay: true };

function screenOutputs(app) {
    function gaugeOutput(name) {
        return {
            status: function () {
                if (!app._client.ready) {
                    return { available: false, reason: 'cluster-render-down' };
                }
                return { available: true };
            },
            prepare: function () { return { ok: true }; },
            start: function () { return { ok: true }; },
            stopFrames: function () {},
            frame: function () { return { ok: true }; },
            stop: function () {},
            release: function () { app._dropMirrorFace(name); },
        };
    }
    return {
        central: {
            status: function () { return { available: true }; },
            prepare: function () { return { ok: true }; },
            start: function () { return { ok: true }; },
            stopFrames: function () {},
            frame: function () { return { ok: true }; },
            stop: function () {},
            release: function () {},
        },
        cluster: gaugeOutput('cluster'),
        hud: gaugeOutput('hud')
    };
}

function AirPlayApp() {
    noteStart('construct');
    this._state = null;
    this._entryUuid = null;
    this._rows = {};
    this._visible = false;
    this._shutdownPromise = null;
    this._timer = null;
    this._line = { net: '', addr: '', state: '' };
    this._gate = parked.createParkedGate();
    this._store = configStoreFactory.createConfigStore({});
    this._desk = desktopSettings.createDesktopSettings(this._store.readSettings());
    this._settings = settingsFactory.createSettings({
        outputs: this._desk.airOutputs(),
        picture: this._desk.airWindows(),
        active: (this._desk.airOutputs()[0]) || 'central'
    });
    this._boxFocus = this._settings.outputs()[0] || 'central';
    this._boxAxis = 'x';
    this._boxMove = false;
    this._tune = null;
    this._lastFrame = null;
    this._streamAir = null;
    this._streamReceiver = null;
    this._labelFocus = 'central';
    this._labelMove = false;
    this._paths = pathFactory.sessionPaths();
    this._chosen = 'airplay';
    this._airOutput = 'central';
    this._videoTimer = null;
    this._streamProtocol = '';
    this._winAutoAccepting = false;
    this._sessionText = 'THEiPlay — AirPlay na iPhone';
    this._decoded = null;
    this._rdpOutput = 'central';
    this._client = new ClusterRender('g21_airplay');
    this._label = clusterLabelFactory.createClusterLabel({
        client: this._client,
        enabled: this._desk.clusterLabel(),
        text: this._desk.labelText(),
        scale: this._desk.labelScale(),
        font: this._desk.labelFont(),
        color: this._desk.labelColor(),
        places: {
            panel: { x: this._settings.picture('cluster').x, y: this._settings.picture('cluster').y },
            hud: { x: this._settings.picture('hud').x, y: this._settings.picture('hud').y }
        },
        log: noteStart,
    });
    var selfBridge = this;
    this._frameBridge = frameBridgeFactory.createFrameBridge({
        sockPath: this._paths.frameSock,
        log: noteStart,
        onFrame: function (frame) {
            selfBridge._onDesktopFrame(frame);
        }
    });
    this._panel = configPanelFactory.createConfigPanel({
        desk: this._desk,
        store: this._store,
        port: 1235,
        log: noteStart,
    });
    this._adapter = adapterFactory.createClusterRenderAdapter(this._client);
    this._clusterLayer = '';
    var selfRouter = this;
    this._router = videoRouter.createVideoRouter({
        centralFps: 60,
        clusterFps: 24,
        onCentral: function (frame) {
            var firstFrame = !selfRouter._decoded;
            var wrote;
            var shown;
            try {
                if (!selfRouter._mirrorVideo) {
                    selfRouter._mirrorVideo = mirrorVideo.createMirrorVideo();
                }
                shown = selfRouter._centralFrame(selfRouter._turnedFrame(frame, 'central'));
                wrote = selfRouter._mirrorVideo.push(shown.i420, shown.w, shown.h);
                selfRouter._decoded = { w: shown.w, h: shown.h };
                if (firstFrame || wrote === 'new') {
                    selfRouter._refreshAirBadge();
                }
                if (wrote === 'new' && selfRouter._menu && typeof selfRouter._menu.rebindVideo === 'function') {
                    selfRouter._menu.rebindVideo();
                }
            } catch (err) {
                noteStart('mirror-video ' + (err && err.message));
            }
        },
        onCentralStop: function () {
            if (selfRouter._mirrorVideo) {
                selfRouter._mirrorVideo.close();
                selfRouter._mirrorVideo = null;
            }
        },
        onCluster: function (frame) {
            selfRouter._presentCluster(frame);
        },
        onClusterStop: function (reason) {
            selfRouter._dropClusterMirror(reason);
        },
    });
    var selfLabel = this;
    this._client.on('ready', function () {
        noteStart('cluster-ready');
        selfLabel._label.show();
        if (selfLabel._lastFrame && selfLabel._streamProtocol === 'airplay') {
            selfLabel._faceAt = 0;
            selfLabel._placeMirrorFaces(selfLabel._lastFrame.i420, selfLabel._lastFrame.w, selfLabel._lastFrame.h);
        }
    });
    this._client.on('refused', function (op, ref, reason) {
        noteStart('cluster-refused ' + op + ' ' + ref + ' ' + reason);
    });
    this._client.on('layer', function (ref, state, reason) {
        noteStart('cluster-layer ' + ref + ' ' + state + (reason ? (' ' + reason) : ''));
    });
    this._display = display.createDisplayOutputManager({
        settings: this._settings,
        gate: this._gate,
        outputs: screenOutputs(this),
        log: function (event, name, reason) {
            logger.info(event + ' ' + name + ' ' + reason);
        },
    });
    var self = this;
    this._frames = frameSinkFactory.createFrameSink(this._paths.frameSock);
    this._vnc = vncFactory.createVncClient({
        onFrame: function (frame) { self._frames.write(frame); },
    });
    this._sessions = sessionFactory.createSessionManager({
        gate: this._gate,
        sessions: {
            airplay: desktopSessions.createAirPlaySession({
                paths: this._paths,
                readStatus: function () {
                    var text = '';
                    try {
                        text = fs.readFileSync(self._paths.receiverStatus, 'utf8');
                    } catch (err) {
                        text = '';
                    }
                    var receiver = uplink.readReceiverStatus(text);
                    return { state: receiver.mode || 'idle', detail: receiver.mode || '' };
                },
            }),
            windows: desktopSessions.createWindowsSession({ paths: this._paths }),
            rdp: desktopSessions.createRdpSession({ paths: this._paths }),
            vnc: {
                connect: function (target) {
                    return self._vnc.connect(target.host, target.port, { password: self._secret('vnc') });
                },
                disconnect: function () { return self._vnc.disconnect(); },
                getStatus: function () { return self._vnc.getStatus(); },
                sendMouseMove: function (x, y) { return self._vnc.sendMouseMove(x, y); },
                sendMouseClick: function (button, down) { return self._vnc.sendMouseClick(button, down); },
                sendMouseScroll: function (delta) { return self._vnc.sendMouseScroll(delta); },
                sendKey: function (key, down) { return self._vnc.sendKey(key, down); },
            },
        },
    });
    this._input = inputFactory.createInputManager({
        settings: this._desk,
        session: this._sessions,
        logFile: this._paths.inputLog,
    });
    this._menu = menuDraw.createMenuSurface({
        note: noteStart,
        version: (this._packageJson && this._packageJson.version) || '0.1.128',
        choose: function (name) {
            self._onMenuChoice(name);
        },
        onTilt: function (dir) {
            return self._tiltBox(dir);
        },
        onWindowMove: function (x, y, done) {
            var box = self._settings.picture('central');
            self._settings.setPicture('central', {
                x: x,
                y: y,
                w: box.w,
                h: box.h,
                fps: box.fps,
                scale: box.scale,
                rotate: box.rotate
            });
            if (self._tune && self._tune.name === 'central') {
                self._tune.saved = false;
            }
            if (done && !self._tune) {
                self._flushWindowSave();
            } else if (!self._tune) {
                self._queueWindowSave();
            }
        },
        adjust: function (name, delta) {
            return self._adjustMenu(name, delta);
        },
    });
    // YouTube screens come back as they were left (saved in the settings).
    var ytScreens = this._desk.ytScreens ? this._desk.ytScreens() : { central: true, cluster: false, hud: false };
    this._ytCentral = ytScreens.central !== false;
    this._ytCluster = !!ytScreens.cluster;
    this._ytHud = !!ytScreens.hud;
    this._ytLive = false;
    this._ytFile = youtubeFile.createYoutubeFile();
    this._bindRideTube();
    // 42 ms: at most 24 film frames a second for the cluster/HUD. Without
    // gauges _takeYoutube itself keeps to one look every 200 ms.
    this._ytTimer = setInterval(function () {
        self._takeYoutube();
    }, YT_GAUGE_MS);
    if (this._ytTimer.unref) {
        this._ytTimer.unref();
    }
    if (this._desk.uiLang && this._desk.uiLang() === 'en' && this._menu.setLang) {
        this._menu.setLang('en');
    }
    if (this._desk.uiRender && this._desk.uiRender() === 'software') {
        this._paintRender();
    }
    this.on('appStatusProxyReady', function () {
        noteStart('status-ready');
        Promise.resolve(self.registerActive()).catch(function (err) {
            noteStart('active ' + (err && err.message));
        });
    });
    this.on('initialized', function () {
        noteStart('initialized');
        self._appInitialized().catch(function (err) {
            noteStart('init ' + (err && err.message));
            logger.error('g21_airplay init failed: ' + (err && err.message));
        });
    });
    this.on('shutdown', function (reason) {
        noteStart('shutdown ' + JSON.stringify(reason));
        self._handleShutdown(reason);
    });
    this.on('error', function (err) { logger.warn('OnlineApp error: ' + (err && err.message)); });
    this.on('entryPointExecute', function (uuid) { self._onEntryPointExecute(uuid); });
    this.on('changeVisibility', function (data) {
        noteStart('visibility ' + JSON.stringify(data));
        if (!data) {
            return;
        }
        var visible = data.visible;
        if (typeof visible === 'undefined' && data.data) {
            visible = data.data.visible;
        }
        if (visible === false || visible === 0 || visible === 'false') {
            self._setVisible(false);
            return;
        }
        if (visible === true || visible === 1 || visible === 'true') {
            self._setVisible(true);
        }
    });
    this.on('hmiFocusLost', function () {
        noteStart('hmi-focus-lost');
        self._setVisible(false);
    });
    this.on('hmiFocusGained', function () {
        noteStart('hmi-focus-gained');
        self._setVisible(true);
    });
    this.on('appStatusChanged', function (status) {
        noteStart('status ' + JSON.stringify(status));
        if (status && (status === 'BACKGROUND' || status.foreground === false || status.visible === false)) {
            self._setVisible(false);
        }
    });
    noteStart('constructed');
}

AirPlayApp.prototype._startedForeground = function () {
    var data = this.getVisibilityData && this.getVisibilityData();
    var reason = (data && data.reason) || this.startReason;
    return FOREGROUND_REASONS.indexOf(reason) !== -1;
};

AirPlayApp.prototype._appInitialized = function () {
    var self = this;
    noteStart('app-init');
    logger.info(
        'g21_airplay ' + this.getAppId() +
        ' v' + ((this._packageJson && this._packageJson.version) || '0.1.128') +
        ' starting'
    );
    this._writeAirplayAuth();
    Promise.resolve(this.registerActive()).catch(function (err) {
        noteStart('active ' + (err && err.message));
    });
    this._client.connect();
    if (!this.rhmiApplication) {
        return this.initialized();
    }
    var foregroundStart = this._startedForeground();
    return this._setupRhmi()
        .catch(function (err) {
            logger.error('rhmi setup: ' + (err && err.message));
        })
        .then(function () { return self._registerEntryPoints(); })
        .then(function () {
            if (foregroundStart) {
                self.registerActive();
            }
            return self.initialized();
        })
        .then(function () {
            noteStart('ready');
            // Panel WWW :1235 był pod RDP — w THEiPlay wyłączony.
            self._watchNetwork();
            self._watchCar();
            var lastUuid = self.getLastExecutedEntryPointUuid && self.getLastExecutedEntryPointUuid();
            if (lastUuid) {
                self._entryUuid = lastUuid;
            }
            if (foregroundStart || lastUuid) {
                self._setVisible(true);
                return self._openPage();
            }
        });
};

AirPlayApp.prototype._setupRhmi = function () {
    var rhmi = this.rhmiApplication;
    var self = this;
    this._state = rhmi.getByName(STATE_NAME);
    ['airNet', 'airAddr', 'airState', 'tileAir', 'tileRdp', 'tileVnc', 'tileHost'].forEach(function (name) {
        self._rows[name] = rhmi.getByName(name);
    });
    this._rows.airTitle = rhmi.getByName('airTitle');
    self._bindTile('tileAir', 'airplay');
    self._bindTile('tileRdp', 'rdp');
    self._bindTile('tileVnc', 'vnc');
    if (!this._state || !this._rows.tileAir) {
        noteStart('ui-missing');
        return Promise.reject(new Error('uiDescription has no AirPlay screen'));
    }
    return Promise.resolve();
};

AirPlayApp.prototype._showMenu = function () {
    noteStart('menu-on-bar');
    if (this._rt && this._rt.isOpen()) {
        // RideTube was open: it comes back (the menu only for its keyboard).
        this._rt.resume();
        if (this._rt.spelling() && this._menu) {
            this._menu.open();
        }
        return this._openPage();
    }
    if (this._clusterClosed && this._client) {
        // Closed by "Wyłącz aplikację": connect again; the label comes back on ready.
        this._clusterClosed = false;
        this._client.connect();
    }
    if (this._menu) {
        this._menu.open();
        if (this._sessions && this._sessions.active() === 'airplay') {
            this._enterStream('airplay');
        } else if (typeof this._menu.setScreen === 'function') {
            this._menu.setScreen('root');
        }
    }
    return this._openPage();
};

AirPlayApp.prototype._openPage = function () {
    if (!this.rhmiApplication) {
        noteStart('open-skip');
        return Promise.resolve();
    }
    var rhmi = this.rhmiApplication;
    var action = null;
    try {
        if (typeof rhmi.openState === 'function') {
            action = rhmi.openState(STATE_NAME);
        }
    } catch (err) {
        noteStart('open ' + (err && err.message));
        return Promise.resolve();
    }
    return Promise.resolve(action).then(function () {
        noteStart('state-open');
    }).catch(function (err) {
        noteStart('open ' + (err && err.message));
    });
};

AirPlayApp.prototype._seedBuiltinRdp = function () {
    var builtin = desktopSettings.BUILTIN_RDP;
    var profiles;
    var host = null;
    var i;
    var kind;
    if (!builtin) {
        return;
    }
    this._desk.setActiveProfile('rdp', 'p1');
    profiles = this._desk.profiles('rdp');
    for (i = 0; i < profiles.length; i += 1) {
        if (profiles[i].id === 'p1') {
            host = profiles[i];
            break;
        }
    }
    try {
        this._store.writeSettings(this._desk.snapshot());
        noteStart('rdp-seed profile1');
    } catch (err) {
        noteStart('rdp-seed-settings ' + (err && err.message));
    }
    if (!host || host.ip !== builtin.octets.join('.') || host.user !== builtin.user) {
        noteStart('rdp-seed-skip-secret');
        return;
    }
    kind = 'rdp-p1';
    // No password in the code (the repository is public): the one already
    // saved on the car stays; else it is typed once (menu "Haslo RDP" or the
    // config panel) and kept in the app's data folder only.
    if (!this._store.hasSecret(kind) && !this._store.hasSecret('rdp')) {
        noteStart('rdp-seed no secret: type the RDP password in the menu');
    }
};

AirPlayApp.prototype._secret = function (kind) {
    var key = kind;
    if ((kind === 'rdp' || kind === 'vnc') && this._desk && typeof this._desk.secretKind === 'function') {
        key = this._desk.secretKind(kind);
    }
    if (this._store && typeof this._store.readSecret === 'function') {
        var text = this._store.readSecret(key);
        if (!text && key !== kind) {
            text = this._store.readSecret(kind);
        }
        return text;
    }
    try {
        return fs.readFileSync(path.join(this._store.dir, key + '.secret'), 'utf8').replace(/\s+$/, '');
    } catch (err) {
        return '';
    }
};

AirPlayApp.prototype._rebuildProtocolMenu = function (protocol) {
    var self = this;
    var items = [];
    var profiles;
    var active;
    if (!this._menu || typeof this._menu.setItems !== 'function') {
        return;
    }
    if (protocol === 'rdp') {
        profiles = this._desk.profiles('rdp');
        active = this._desk.activeProfileId('rdp');
        items.push({ name: 'rdp-connect', title: 'Polacz', hint: 'wybierz ekran', icon: 'desktop' });
        items.push({ name: 'rdp-cut', title: 'Stop RDP', hint: 'Koniec sesji', icon: 'stop' });
        profiles.forEach(function (p) {
            items.push({
                name: 'rdp-prof-' + p.id,
                title: (p.id === active ? '* ' : '') + (p.label || p.id),
                hint: p.ip + ':' + p.port,
                icon: 'host'
            });
        });
        items.push({ name: 'rdp-add', title: 'Dodaj', hint: 'Nowy profil', icon: 'tag' });
        items.push({ name: 'rdp-edit', title: 'Edytuj', hint: 'IP / konto', icon: 'gear' });
        items.push({ name: 'rdp-del', title: 'Usun', hint: 'Skasuj profil', icon: 'stop' });
        items.push({ name: 'rdp-cert', title: 'Cert', hint: 'zaufaj odcisk', icon: 'wifi' });
        items.push({ name: 'rdp-panel', title: 'WWW', hint: ':1235', icon: 'grid' });
        items.push({ name: 'rdp-back', title: 'Wstecz', hint: 'Menu glowne', icon: 'back' });
        this._menu.setItems(items, 'RDP');
        return;
    }
    if (protocol === 'vnc') {
        profiles = this._desk.profiles('vnc');
        active = this._desk.activeProfileId('vnc');
        items.push({ name: 'vnc-toggle', title: 'WYL', hint: 'wylaczony', icon: 'grid' });
        items.push({ name: 'vnc-connect', title: 'Polacz', hint: 'ekran z PC', icon: 'grid' });
        items.push({ name: 'vnc-cut', title: 'Stop VNC', hint: 'Koniec sesji', icon: 'stop' });
        profiles.forEach(function (p) {
            items.push({
                name: 'vnc-prof-' + p.id,
                title: (p.id === active ? '* ' : '') + (p.label || p.id),
                hint: p.ip + ':' + p.port,
                icon: 'host'
            });
        });
        items.push({ name: 'vnc-add', title: 'Dodaj', hint: 'Nowy profil', icon: 'tag' });
        items.push({ name: 'vnc-edit', title: 'Edytuj', hint: 'IP / port', icon: 'gear' });
        items.push({ name: 'vnc-del', title: 'Usun', hint: 'Skasuj profil', icon: 'stop' });
        items.push({ name: 'vnc-back', title: 'Wstecz', hint: 'Menu glowne', icon: 'back' });
        this._menu.setItems(items, 'VNC');
    }
};

AirPlayApp.prototype._writeAirplayAuth = function () {
    var auth = this._desk && this._desk.airplayPin && this._desk.airplayPin() ? 'pin' : 'open';
    try {
        fs.writeFileSync(this._paths.airplayAuth, auth + '\n');
    } catch (err) {
        noteStart('airplay-auth-write ' + (err && err.message));
    }
    this._writeAirplayMode();
    return auth;
};

// AirPlay Sound: g21-airplay-open starts the receiver with -vs 0 (audio only)
// for "audio", the mirror for "video"; a change restarts the receiver there.
AirPlayApp.prototype._writeAirplayMode = function () {
    var mode = this._desk && this._desk.airplaySound && this._desk.airplaySound() ? 'audio' : 'video';
    try {
        if (this._paths.airplayMode) {
            fs.writeFileSync(this._paths.airplayMode, mode + '\n');
        }
    } catch (err) {
        noteStart('airplay-mode-write ' + (err && err.message));
    }
    return mode;
};

AirPlayApp.prototype._toggleAirplaySound = function () {
    var on = !(this._desk && this._desk.airplaySound && this._desk.airplaySound());
    if (!this._desk.setAirplaySound) {
        return;
    }
    this._desk.setAirplaySound(on);
    this._saveDesk();
    this._writeAirplayMode();
    this._paintAirPinSwitch();
    noteStart(on ? 'air-sound-on' : 'air-sound-off');
    this._sync();
};

AirPlayApp.prototype._endpoint = function (name) {
    if (name === 'airplay') {
        return {
            name: this._desk.airplayName(),
            auth: this._desk.airplayPin() ? 'pin' : 'open'
        };
    }
    if (name === 'windows') {
        return { name: this._desk.airplayName() };
    }
    var host = this._desk.host(name);
    return {
        host: host.octets.join('.'),
        port: host.port,
        user: host.user,
        cert: host.cert,
        password: this._secret(name),
    };
};

AirPlayApp.prototype._action = function (component, handler) {
    if (!component) {
        return;
    }
    var call = function (event) {
        var kind = 'Click';
        if (typeof event === 'string') {
            kind = event;
        } else if (event && event.subType) {
            kind = event.subType;
        } else if (event && event.action) {
            kind = event.action;
        }
        handler(kind);
    };
    if (typeof component.onAction === 'function') {
        component.onAction(call);
    } else if (typeof component.on === 'function') {
        component.on('action', call);
    }
};

AirPlayApp.prototype._menuScreen = function () {
    if (this._menu && typeof this._menu.screen === 'function') {
        return this._menu.screen();
    }
    return 'root';
};

AirPlayApp.prototype._openProtocolScreen = function (protocol) {
    var active = this._sessions && this._sessions.active ? this._sessions.active() : null;
    var live;
    var keep = {
        running: true,
        connected: true,
        starting: true,
        waiting: true,
        offer: true
    };
    if (!PROTOCOLS[protocol]) {
        protocol = 'airplay';
    }
    if (active && active !== protocol) {
        this._winAutoAccepting = false;
        this._sessions.disconnect();
    }
    // Keep a live AirPlay session; failed/error/idle must not stick on the submenu.
    if (active === protocol) {
        live = this._sessions.getStatus() || {};
        if (!keep[live.state]) {
            this._winAutoAccepting = false;
            this._sessions.disconnect();
        }
    }
    this._chosen = protocol;
    if (this._menu && typeof this._menu.setScreen === 'function') {
        this._menu.setScreen(protocol);
    }
    if (protocol === 'rdp' || protocol === 'vnc') {
        this._rebuildProtocolMenu(protocol);
    }
    this._tellMenu('waiting');
    this._sync();
};

AirPlayApp.prototype._goRoot = function () {
    this._chosen = 'airplay';
    if (this._menu && typeof this._menu.setScreen === 'function') {
        this._menu.setScreen('root');
    }
    this._sync();
};

AirPlayApp.prototype._saveDesk = function () {
    try {
        this._store.writeSettings(this._desk.snapshot());
    } catch (err) {
        noteStart('settings ' + (err && err.message));
    }
};

AirPlayApp.prototype._panelUrl = function () {
    var snap = uplink.readUplink();
    var choice = uplink.selectStoreWifi(snap.status, snap.lease);
    if (choice.ok && choice.ip) {
        return 'http://' + choice.ip + ':1235';
    }
    return 'http://MGU:1235';
};

AirPlayApp.prototype._adjustMenu = function (name, delta) {
    var key;
    var focus;
    var keys = {
        'air-box-x': 'x',
        'air-box-y': 'y',
        'air-box-size': 'size',
        'pos-x': 'x',
        'pos-y': 'y',
        'pos-size': 'size'
    };
    if (name === 'label-size') {
        var scales = [2, 3, 4, 6, 8];
        var atScale = scales.indexOf(this._desk.labelScale());
        var nextScale = atScale + (delta > 0 ? 1 : -1);
        if (nextScale < 0) {
            nextScale = 0;
        }
        if (nextScale >= scales.length) {
            nextScale = scales.length - 1;
        }
        this._desk.setLabelScale(scales[nextScale]);
        this._saveDesk();
        this._refreshLabel();
        this._paintLabel();
        return true;
    }
    if (name === 'stream-tune') {
        return this._slideTune(delta);
    }
    if (name === 'air-box-power' || name === 'air-box-place' || name === 'air-box-center' || name === 'air-box-back') {
        return true;
    }
    key = keys[name];
    if (!key) {
        return false;
    }
    focus = name.indexOf('pos-') === 0 ? (this._posFocus || 'central') : (this._boxFocus || 'central');
    if (name.indexOf('pos-') === 0 && this._posFocus === 'shared') {
        this._settings.slide('central', key, delta);
        this._mirrorSharedWindow();
        this._nudgeMirror('central');
        this._nudgeMirror('cluster');
        this._nudgeMirror('hud');
        this._refreshLabel();
        this._paintYoutube();
        this._paintPosition();
        this._queueWindowSave();
        return true;
    }
    this._settings.slide(focus, key, delta);
    this._nudgeMirror(focus);
    this._refreshLabel();
    this._paintYoutube();
    if (name.indexOf('pos-') === 0) {
        this._paintPosition();
    } else {
        this._paintAirBox();
    }
    this._queueWindowSave();
    return true;
};

AirPlayApp.prototype._tiltBox = function (dir) {
    var key;
    var delta;
    if (this._menuScreen() === 'label' && this._labelMove) {
        var at = this._desk.labelAt(this._labelFocus || 'central');
        var nx = at.x;
        var ny = at.y;
        if (dir === 'n') ny -= 16;
        else if (dir === 's') ny += 16;
        else if (dir === 'w') nx -= 16;
        else if (dir === 'e') nx += 16;
        else return false;
        this._desk.setLabelAt(this._labelFocus || 'central', nx, ny);
        this._saveDesk();
        this._refreshLabel();
        this._paintLabel();
        return true;
    }
    if (this._menuScreen() === 'stream' && this._tune) {
        if (this._tune.tool === 'pos') {
            if (dir === 'n' || dir === 's') {
                key = 'y';
            } else if (dir === 'e' || dir === 'w') {
                key = 'x';
            } else {
                return true;
            }
            delta = (dir === 's' || dir === 'e') ? 1 : -1;
            this._tune.axis = key;
            this._settings.slide(this._tune.name, key, delta);
            this._tune.saved = false;
            this._liveApply(this._tune.name);
        }
        return true;
    }
    return false;
};

AirPlayApp.prototype._startFieldEdit = function (field, mode, value, title) {
    var self = this;
    if (!this._menu || typeof this._menu.startEdit !== 'function') {
        this._tellMenu('waiting');
        this._sync();
        return;
    }
    this._menu.startEdit({
        field: field,
        mode: mode,
        value: value,
        title: title,
        onDone: function (text) {
            self._applyFieldEdit(field, mode, text);
        },
        onCancel: function () {
            self._sync();
        }
    });
};

AirPlayApp.prototype._applyFieldEdit = function (field, mode, text) {
    if (field === 'yt-search') {
        if (this._ytModel) {
            this._ytModel.search(String(text || '').trim());
        }
        this._ytBrowse = 'results';
        if (this._menu && this._menuScreen() !== 'yt-browse' && typeof this._menu.setScreen === 'function') {
            this._menu.setScreen('yt-browse');
        }
        this._syncYoutubeList();
        return;
    }
    var checked = knobKeyboard.validate(mode, text);
    var set;
    if (!checked.ok) {
        this._tellMenu(checked.reason || 'waiting');
        this._sync();
        return;
    }
    if (field === 'air-name') {
        set = this._desk.setAirplayName(checked.value);
    } else if (field === 'label-text') {
        set = this._desk.setLabelText(checked.value);
        if (set && set.ok) {
            this._refreshLabel();
        }
    } else if (field === 'rdp-ip') {
        set = this._desk.setRdpHost(checked.value);
    } else if (field === 'rdp-port') {
        set = this._desk.setRdpPort(checked.value);
    } else if (field === 'rdp-user') {
        set = this._desk.setRdpUser(checked.value);
    } else     if (field === 'rdp-label') {
        set = this._desk.setProfileLabel('rdp', this._desk.activeProfileId('rdp'), checked.value);
    } else if (field === 'vnc-label') {
        set = this._desk.setProfileLabel('vnc', this._desk.activeProfileId('vnc'), checked.value);
    } else if (field === 'rdp-pass') {
        set = this._store.writeSecret(this._desk.secretKind('rdp'), checked.value);
        if (set && set.ok) {
            this._store.writeSecret('rdp', checked.value);
        }
    } else if (field === 'vnc-ip') {
        set = this._desk.setVncHost(checked.value);
    } else if (field === 'vnc-port') {
        set = this._desk.setVncPort(checked.value);
    } else {
        set = { ok: false, reason: 'unknown' };
    }
    if (!set || !set.ok) {
        this._tellMenu((set && set.reason) || 'waiting');
        this._sync();
        return;
    }
    if (field !== 'rdp-pass') {
        this._saveDesk();
    }
    if (this._menuScreen() === 'rdp' || this._menuScreen() === 'rdp-edit') {
        if (this._menuScreen() === 'rdp') {
            this._rebuildProtocolMenu('rdp');
        }
    }
    if (this._menuScreen() === 'vnc' || this._menuScreen() === 'vnc-edit') {
        if (this._menuScreen() === 'vnc') {
            this._rebuildProtocolMenu('vnc');
        }
    }
    this._sync();
};

AirPlayApp.prototype._acceptRdpCert = function () {
    var fingerprint = '';
    try {
        var text = fs.readFileSync(this._paths.desktopStatus, 'utf8');
        if (String(text).indexOf('cert|') === 0) {
            fingerprint = String(text).split('|')[1].replace(/\s+$/, '');
        }
    } catch (err) {
        fingerprint = '';
    }
    if (!fingerprint && this._desk.host('rdp').cert) {
        fingerprint = this._desk.host('rdp').cert;
    }
    if (!fingerprint) {
        this._tellMenu('waiting');
        this._sync();
        return;
    }
    this._desk.setRdpCert(fingerprint);
    this._saveDesk();
    try {
        fs.writeFileSync(this._paths.cert, fingerprint + '\n');
    } catch (err2) {
        noteStart('cert ' + (err2 && err2.message));
    }
    this._choose('rdp');
};

AirPlayApp.prototype._sessionLive = function (protocol) {
    var live;
    if (!this._sessions || this._sessions.active() !== protocol) {
        return { active: false, state: 'idle', on: false };
    }
    live = this._sessions.getStatus() || {};
    return {
        active: true,
        on: true,
        state: live.state || 'idle',
        detail: live.detail || ''
    };
};

AirPlayApp.prototype._toggleItem = function (protocol) {
    if (protocol === 'windows') {
        return 'win-toggle';
    }
    if (protocol === 'vnc') {
        return 'vnc-toggle';
    }
    return 'air-toggle';
};

AirPlayApp.prototype._quality = function (kind) {
    var value = kind === 'kombi'
        ? (this._desk.qualityKombi ? this._desk.qualityKombi() : desktopSettings.QUALITY_DEFAULT.kombi)
        : (this._desk.qualityCentral ? this._desk.qualityCentral() : desktopSettings.QUALITY_DEFAULT.central);
    return desktopSettings.qualitySize(value) || desktopSettings.qualitySize(desktopSettings.QUALITY_DEFAULT[kind === 'kombi' ? 'kombi' : 'central']);
};

// The centre profile is what UxPlay asks the iPhone for (-s WxH). It is the
// one decode; the KOMBI frames are scaled from it in _placeMirrorFaces.
AirPlayApp.prototype._writeAirplaySize = function () {
    var q = this._quality('central');
    var text = q.w + 'x' + q.h;
    try {
        fs.writeFileSync(this._paths.airplaySize, text + '\n');
    } catch (err) {
        noteStart('airplay-size ' + (err && err.message));
    }
    return text;
};

AirPlayApp.prototype._qualityHint = function () {
    return this._desk.qualityCentral() + ', ' + this._desk.qualityKombi();
};

AirPlayApp.prototype._showQuality = function (screenName) {
    var next = screenName || 'quality';
    var items;
    if (!this._menu || typeof this._menu.setScreen !== 'function') {
        return;
    }
    this._menu.setScreen(next);
    if (next === 'quality-central') {
        items = menuDraw.qualityOptions('central', desktopSettings.QUALITY_CENTRAL, this._desk.qualityCentral(), desktopSettings.QUALITY_NAMES);
    } else if (next === 'quality-kombi') {
        items = menuDraw.qualityOptions('kombi', desktopSettings.QUALITY_KOMBI, this._desk.qualityKombi(), desktopSettings.QUALITY_NAMES);
    } else {
        items = menuDraw.qualityItems(this._desk.qualityCentral(), this._desk.qualityKombi());
    }
    if (typeof this._menu.setItems === 'function') {
        this._menu.setItems(items, 'Jakość obrazu');
    }
};

AirPlayApp.prototype._setQuality = function (kind, value) {
    var set = this._desk.setQuality(kind, value);
    if (!set.ok) {
        noteStart('quality-refused ' + kind + ' ' + value);
        return false;
    }
    this._saveDesk();
    noteStart('quality ' + kind + ' ' + value);
    if (kind === 'central') {
        // UxPlay reads this file when it starts; a running mirror keeps its
        // size until the next Start, as before.
        this._writeAirplaySize();
        return true;
    }
    // KOMBI: the next frame is cut to the new size; the layers are made again
    // because the frame size (vw x vh) is part of the layer.
    this._ytGaugeOuts = '';
    this._faceAt = 0;
    if (this._lastFrame && this._streamProtocol === 'airplay') {
        this._placeMirrorFaces(this._lastFrame.i420, this._lastFrame.w, this._lastFrame.h);
    }
    return true;
};

AirPlayApp.prototype._onQualityChoice = function (name) {
    if (name === 'air-quality') {
        this._showQuality('quality');
        return true;
    }
    if (name === 'q-central') {
        this._showQuality('quality-central');
        return true;
    }
    if (name === 'q-kombi') {
        this._showQuality('quality-kombi');
        return true;
    }
    if (name === 'qc-back' || name === 'qk-back') {
        this._showQuality('quality');
        return true;
    }
    if (name === 'q-back') {
        if (this._menu && typeof this._menu.setScreen === 'function') {
            this._menu.setScreen('airplay');
        }
        this._sync();
        return true;
    }
    if (name.indexOf('qc-') === 0) {
        this._setQuality('central', name.slice(3));
        this._showQuality('quality-central');
        return true;
    }
    if (name.indexOf('qk-') === 0) {
        this._setQuality('kombi', name.slice(3));
        this._showQuality('quality-kombi');
        return true;
    }
    return false;
};

AirPlayApp.prototype._writeSessionOutput = function (name) {
    try {
        fs.writeFileSync(this._paths.output, String(name || 'central') + '\n');
    } catch (err) {
        noteStart('output-write ' + (err && err.message));
    }
};

AirPlayApp.prototype._onDesktopFrame = function (frame) {
    if (!frame || !frame.atlas) {
        return;
    }
    this._decoded = { w: frame.w, h: frame.h };
    if (this._display.active() === 'cluster' || this._display.active() === 'hud') {
        this._display.frame(frame.atlas);
    }
};

AirPlayApp.prototype._beginRdpConnect = function () {
    // Leave the output picker: periodic _sync was resetting status to pick-out
    // and never entered the stream screen after g21-rdp reported connected.
    if (this._menu && typeof this._menu.setScreen === 'function') {
        this._menu.setScreen('rdp');
    }
    this._rebuildProtocolMenu('rdp');
    this._tellMenu('starting');
    this._choose('rdp');
};

AirPlayApp.prototype._startRdpToOutput = function (outputName) {
    var out = outputName === 'cluster' || outputName === 'hud' ? outputName : 'central';
    var selected;
    var limits;
    var self = this;
    this._rdpOutput = out;
    this._writeSessionOutput(out);
    if (out === 'central') {
        if (this._frameBridge) {
            this._frameBridge.stop();
        }
        this._display.select('central');
        noteStart('rdp-out ' + out);
        this._beginRdpConnect();
        return;
    }
    selected = this._display.select(out);
    if (!selected.ok) {
        this._tellMenu(selected.reason || 'not-parked');
        noteStart('rdp-out-refuse ' + out + ' ' + (selected.reason || ''));
        this._writeSessionOutput('central');
        this._rdpOutput = 'central';
        if (this._menu && typeof this._menu.setScreen === 'function') {
            this._menu.setScreen('rdp-out');
        }
        this._sync();
        return;
    }
    // cluster-render frames use the KOMBI profile, whatever the target size.
    limits = this._quality('kombi');
    // Drop present's hold on frame.sock, then listen before g21-rdp connects.
    // Tool apply() used to run only every 5s — wait/retry until bridge can bind.
    try {
        fs.writeFileSync(this._paths.allow, 'stop\n');
    } catch (errStop) {
        noteStart('rdp-prestop ' + (errStop && errStop.message));
    }
    this._tellMenu('starting');
    this._startRdpBridgeWhenFree(out, limits, 0);
};

AirPlayApp.prototype._startRdpBridgeWhenFree = function (out, limits, attempt) {
    var self = this;
    var next = typeof attempt === 'number' ? attempt : 0;
    if (!self._frameBridge) {
        noteStart('rdp-bridge-missing');
        self._tellMenu('error');
        return;
    }
    self._frameBridge.setTargetSize(limits.w, limits.h);
    if (self._frameBridge.isListening && self._frameBridge.isListening()) {
        noteStart('rdp-out ' + out);
        self._beginRdpConnect();
        return;
    }
    self._frameBridge.start();
    setTimeout(function () {
        if (self._frameBridge && self._frameBridge.isListening && self._frameBridge.isListening()) {
            noteStart('rdp-out ' + out);
            self._beginRdpConnect();
            return;
        }
        noteStart('rdp-bridge-wait ' + out + ' ' + next);
        if (next >= 25) {
            noteStart('rdp-bridge-fail ' + out);
            self._tellMenu('error');
            return;
        }
        if (self._frameBridge) {
            self._frameBridge.stop();
        }
        self._startRdpBridgeWhenFree(out, limits, next + 1);
    }, 200);
};

AirPlayApp.prototype._paintSwitch = function (itemName, on, onHint, offHint) {
    if (!this._menu) {
        return;
    }
    if (typeof this._menu.setItemTitle === 'function') {
        this._menu.setItemTitle(itemName, on ? 'Włącz' : 'Wyłącz');
    }
    if (typeof this._menu.setItemHint === 'function') {
        this._menu.setItemHint(itemName, on ? (onHint || 'włączony') : (offHint || 'wyłączony'));
    }
};

AirPlayApp.prototype._toggleProtocol = function (protocol) {
    var live = this._sessionLive(protocol);
    var toggle = this._toggleItem(protocol);
    // Switch follows active session (allow=...), not backend mode. AirPlay used
    // to look "off" while waiting because receiver.status was still idle.
    if (live.on) {
        this._winAutoAccepting = false;
        this._paintSwitch(toggle, false);
        this._endStream(protocol);
        return;
    }
    if (protocol === 'airplay') {
        this._startAirplaySelected();
        return;
    }
    this._paintSwitch(toggle, true, 'start...');
    this._choose(protocol);
};

AirPlayApp.prototype._stopVideoTimer = function () {
    if (this._videoTimer) {
        clearInterval(this._videoTimer);
        this._videoTimer = null;
    }
    if (this._faceWait) {
        clearTimeout(this._faceWait);
        this._faceWait = null;
    }
};

AirPlayApp.prototype._startVideoTimer = function () {
    var self = this;
    this._stopVideoTimer();
    // One look per display frame. The copy stays short; gauges wait their own turn.
    this._videoTimer = setInterval(function () {
        if (self._streamProtocol === 'airplay' && self._sessions.active() === 'airplay') {
            self._takeFrame();
            if (!self._decoded && self._menu && typeof self._menu.repaint === 'function') {
                var spinNow = Date.now();
                if (!self._spinAt || spinNow - self._spinAt >= 140) {
                    self._spinAt = spinNow;
                    self._menu.repaint();
                }
            }
        } else {
            self._stopVideoTimer();
        }
    }, 16);
};

// mgu-render frame: the decoded frame as it is when it fits the centre
// profile (the iPhone is asked for that size), else scaled down to it.
AirPlayApp.prototype._centralFrame = function (frame) {
    var q = this._quality('central');
    if (!frame || frameFit.fitsProfile(frame.w, frame.h, q.w, q.h)) {
        return frame;
    }
    return frameFit.scaleToProfile(frame.i420, frame.w, frame.h, q.w, q.h);
};

// cluster-render frame size for a source frame and a screen's turn. Same
// numbers _placeMirrorFaces sends; no pixels touched.
AirPlayApp.prototype._kombiDims = function (sw, sh, name) {
    var q = this._quality('kombi');
    var box = this._settings.picture(name);
    var quarters = (((box && box.rotate) || 0) / 90) % 2;
    var dims = frameFit.profileDims(sw, sh, q.w, q.h);
    return quarters ? { w: dims.h, h: dims.w } : dims;
};

AirPlayApp.prototype._turnedFrame = function (frame, name) {
    var box = this._settings.picture(name);
    var quarters = ((box && box.rotate) || 0) / 90;
    return frameFit.rotateI420(frame.i420, frame.w, frame.h, quarters);
};

AirPlayApp.prototype._outputLabel = function (name) {
    if (name === 'cluster') {
        return 'Zegary';
    }
    if (name === 'hud') {
        return 'HUD';
    }
        return 'Środek';
};

AirPlayApp.prototype._saveWindows = function () {
    var snap = this._settings.snapshot();
    this._desk.setAirOutputs(snap.outputs);
    this._desk.setAirWindows(snap.picture);
    this._saveDesk();
};

AirPlayApp.prototype._showGauges = function () {
    return true;
};

AirPlayApp.prototype._routerMode = function () {
    var names = this._settings.outputs();
    if (names.indexOf('central') !== -1) {
        return 'central';
    }
    return 'off';
};

AirPlayApp.prototype._parkFlag = function () {
    return true;
};

AirPlayApp.prototype._bindYoutube = function () {
    var self = this;
    var log = {
        info: function (msg) { noteStart(String(msg)); },
        warn: function (msg) { noteStart(String(msg)); },
        error: function (msg) { noteStart(String(msg)); }
    };
    this._ytCtl = new youtubeClient.Ctl(process.env.MGU_YT_SOCKET || youtubeClient.SOCKET, log);
    this._ytModel = new youtubeClient.Model(function (obj) {
        return self._ytCtl.send(obj);
    });
    this._ytCtl.on('up', function () {
        self._ytModel.setConnected(true);
        self._syncYoutubeList();
    });
    this._ytCtl.on('down', function () {
        self._ytModel.setConnected(false);
        self._syncYoutubeList();
    });
    this._ytCtl.on('msg', function (msg) {
        self._ytModel.onMsg(msg);
        if (self._menuScreen() === 'yt-login' && self._ytLoginWaiting && self._ytModel.auth && self._ytModel.auth.state === 'signed_out') {
            self._ytLoginWaiting = false;
            self._ytModel.authStart(true);
        }
        if (msg && msg.ev === 'time') {
            self._paintYoutube();
            return;
        }
        self._syncYoutubeList();
    });
    this._ytCtl.connect();
};

AirPlayApp.prototype._ytSignedIn = function () {
    return !!(this._ytModel && this._ytModel.auth && this._ytModel.auth.state === 'signed_in');
};

AirPlayApp.prototype._ytScreenHint = function () {
    var parts = [];
    if (this._ytCentral !== false) {
        parts.push('Środek');
    }
    if (this._ytCluster) {
        parts.push('Zegary');
    }
    if (this._ytHud) {
        parts.push('HUD');
    }
    return parts.length ? parts.join(', ') : 'wyłączone';
};

AirPlayApp.prototype._syncYoutubeList = function () {
    var screen;
    if (!this._menu || !this._ytModel) {
        return;
    }
    screen = this._menuScreen();
    if (screen === 'yt-login') {
        this._syncYoutubeLogin();
        return;
    }
    if (screen === 'yt-browse') {
        this._syncYoutubeBrowse();
        return;
    }
    if (screen === 'youtube') {
        this._syncYoutubeGate();
    }
};

AirPlayApp.prototype._syncYoutubeGate = function () {
    var signed;
    var items;
    if (!this._menu || !this._ytModel || typeof this._menu.setItems !== 'function') {
        return;
    }
    signed = this._ytSignedIn();
    items = [
        { name: 'yt-where', title: 'Ekrany', hint: this._ytScreenHint(), icon: 'desktop' },
        {
            name: 'yt-login',
            title: signed ? 'Zalogowano' : 'Zaloguj się do YouTube',
            hint: signed ? (this._ytSignOutArmed ? 'naciśnij jeszcze raz, żeby wylogować' : 'konto w aucie') : 'kod na telefonie',
            icon: 'tag',
            on: signed
        }
    ];
    if (signed) {
        items.push({ name: 'yt-browse', title: 'Przeglądaj', hint: 'Home, subskrypcje, do obejrzenia', icon: 'play' });
    }
    items.push({ name: 'yt-back', title: 'Wstecz', hint: 'strona główna', icon: 'back' });
    this._menu.setItems(items, 'YouTube');
    if (typeof this._menu.setRideView === 'function') {
        this._menu.setRideView(null);
    }
    this._paintYoutube();
};

AirPlayApp.prototype._beginYoutubeLogin = function () {
    var state;
    if (!this._ytModel) {
        return;
    }
    if (this._menu && typeof this._menu.setScreen === 'function' && this._menuScreen() !== 'yt-login') {
        this._menu.setScreen('yt-login');
    }
    state = this._ytModel.auth ? this._ytModel.auth.state : 'unknown';
    if (state === 'signed_in') {
        this._syncYoutubeGate();
        if (this._menu && typeof this._menu.setScreen === 'function') {
            this._menu.setScreen('youtube');
        }
        this._syncYoutubeGate();
        return;
    }
    this._ytLoginWaiting = state === 'unknown' || state === 'asking';
    if (state === 'signed_out' || state === 'error') {
        this._ytModel.authStart(true);
    }
    this._syncYoutubeLogin();
};

AirPlayApp.prototype._syncYoutubeLogin = function () {
    var auth;
    var items;
    var url;
    if (!this._menu || !this._ytModel || this._menuScreen() !== 'yt-login' || typeof this._menu.setItems !== 'function') {
        return;
    }
    auth = this._ytModel.auth || { state: 'unknown' };
    url = auth.url || 'https://www.google.com/device';
    if (auth.state === 'signed_in') {
        if (this._menu.setScreen) {
            this._menu.setScreen('youtube');
        }
        this._syncYoutubeGate();
        return;
    }
    if (auth.state === 'code' && auth.code) {
        items = [
            { name: 'yt-login-code', title: String(auth.code), hint: url, icon: 'tag', on: true },
            { name: 'yt-login-retry', title: 'Nowy kod', hint: 'jeszcze raz', icon: 'play' },
            { name: 'yt-login-back', title: 'Wstecz', hint: 'YouTube', icon: 'back' }
        ];
    } else if (auth.state === 'error') {
        items = [
            { name: 'yt-login-code', title: 'Logowanie niedostępne', hint: auth.msg || 'błąd', icon: 'tag' },
            { name: 'yt-login-retry', title: 'Nowy kod', hint: 'jeszcze raz', icon: 'play' },
            { name: 'yt-login-back', title: 'Wstecz', hint: 'YouTube', icon: 'back' }
        ];
    } else if (auth.state === 'unsupported') {
        items = [
            { name: 'yt-login-code', title: 'Potrzebny nowszy jap-ridetube-d', hint: 'usługa w aucie', icon: 'tag' },
            { name: 'yt-login-back', title: 'Wstecz', hint: 'YouTube', icon: 'back' }
        ];
    } else {
        items = [
            { name: 'yt-login-code', title: 'Pobieram kod logowania', hint: 'google.com/device', icon: 'tag' },
            { name: 'yt-login-back', title: 'Wstecz', hint: 'YouTube', icon: 'back' }
        ];
    }
    this._menu.setItems(items, 'Zaloguj się do YouTube');
    if (typeof this._menu.setRideView === 'function') {
        this._menu.setRideView({
            on: true,
            mode: 'signin',
            auth: {
                state: auth.state,
                code: auth.code || '',
                url: url,
                msg: auth.msg || ''
            }
        });
    }
};

AirPlayApp.prototype._ytBrowseSections = function () {
    var model = this._ytModel;
    var which = this._ytBrowse || 'home';
    var feed;
    var sections = [];
    var titles = { home: 'Recommended', subs: 'Subscriptions', wl: 'Watch later' };
    var i;
    if (!model || which === 'player') {
        return sections;
    }
    if (which === 'results') {
        if (model.results && model.results.length) {
            sections.push({ title: 'Results', items: model.results.slice(0, 4) });
        }
        return sections;
    }
    if (which === 'home' && model.resume && model.resume.length) {
        sections.push({ title: 'Continue watching', items: model.resume.slice(0, 4) });
    }
    feed = model.feeds ? model.feeds[which] : null;
    if (feed && feed.shelves && feed.shelves.length) {
        for (i = 0; i < feed.shelves.length && sections.length < 2; i += 1) {
            if (feed.shelves[i].items && feed.shelves[i].items.length) {
                sections.push({ title: feed.shelves[i].title || titles[which] || 'Home', items: feed.shelves[i].items.slice(0, 4) });
            }
        }
    } else if (feed && feed.items && feed.items.length) {
        sections.push({ title: titles[which] || 'Home', items: feed.items.slice(0, 4) });
    }
    return sections;
};

AirPlayApp.prototype._ytBrowseRows = function () {
    var sections = this._ytBrowseSections();
    var rows = [];
    var i;
    var j;
    for (i = 0; i < sections.length; i += 1) {
        for (j = 0; j < sections[i].items.length; j += 1) {
            rows.push(sections[i].items[j]);
        }
    }
    return rows;
};

AirPlayApp.prototype._openYtFeed = function (which) {
    this._ytBrowse = which;
    if (!this._ytModel || !this._ytSignedIn()) {
        return;
    }
    if (which === 'home' || which === 'subs' || which === 'wl') {
        this._ytModel.feed(which);
        if (which === 'home') {
            this._ytModel.feed('wl');
        }
        if (which === 'subs' && typeof this._ytModel.loadChannels === 'function') {
            this._ytModel.loadChannels();
        }
    }
};

AirPlayApp.prototype._syncYoutubeBrowse = function () {
    var model;
    var which;
    var rows;
    var items;
    var i;
    var row;
    var hint;
    var names = { home: 'Home', subs: 'Subskrypcje', wl: 'Do obejrzenia', results: 'Wyniki' };
    if (!this._menu || !this._ytModel || this._menuScreen() !== 'yt-browse' || typeof this._menu.setItems !== 'function') {
        return;
    }
    model = this._ytModel;
    which = this._ytBrowse || 'home';
    rows = this._ytBrowseRows();
    this._ytRows = rows;
    items = [
        { name: 'yt-feed-home', title: 'Home', hint: 'RideTube', icon: 'grid', on: which === 'home' },
        { name: 'yt-feed-subs', title: 'Subskrypcje', hint: 'RideTube', icon: 'grid', on: which === 'subs' },
        { name: 'yt-feed-wl', title: 'Do obejrzenia', hint: 'RideTube', icon: 'tag', on: which === 'wl' },
        { name: 'yt-search', title: 'Szukaj', hint: model.q || 'tytuł filmu', icon: 'tag', on: which === 'results' }
    ];
    if (model.state === 'playing' || model.state === 'paused' || model.state === 'preparing') {
        items.push({
            name: 'yt-play',
            title: model.state === 'playing' ? 'Pauza' : 'Play',
            hint: (model.title || names[which] || 'Teraz').slice(0, 28),
            icon: 'play',
            on: true
        });
        items.push({ name: 'yt-back10', title: '-10 s', hint: 'cofnij', icon: 'back' });
        items.push({ name: 'yt-fwd10', title: '+10 s', hint: 'do przodu', icon: 'play' });
        items.push({ name: 'yt-stop', title: 'Stop', hint: 'koniec filmu', icon: 'stop' });
    }
    for (i = 0; i < rows.length; i += 1) {
        row = rows[i];
        hint = String(row.channel || '');
        if (row.duration_s > 0 && youtubeClient.clock) {
            hint = (hint ? hint + ' · ' : '') + youtubeClient.clock(row.duration_s * 1000);
        }
        items.push({
            name: 'yt-vid-' + i,
            title: String(row.title || row.id).slice(0, 36),
            hint: hint.slice(0, 40),
            icon: 'play'
        });
    }
    if (!rows.length) {
        items.push({
            name: 'yt-browse-empty',
            title: model.connected ? (which === 'results' ? 'Nic nie znaleziono' : 'Ładuję') : 'Brak usługi',
            hint: names[which] || '',
            icon: 'tag'
        });
    }
    items.push({ name: 'yt-browse-back', title: 'Wstecz', hint: 'YouTube', icon: 'back' });
    this._menu.setItems(items, 'Przeglądaj');
    if (typeof this._menu.setRideView === 'function') {
        this._menu.setRideView({
            on: true,
            mode: which === 'player' ? 'player' : which,
            sections: this._ytTileSections(rows),
            status: model.connected ? (which === 'results' ? 'Nothing found' : 'Loading...') : 'The RideTube service is not running',
            playing: {
                title: model.title || '',
                channel: model.channel || '',
                state: model.state || '',
                elapsed: model.elapsed || 0,
                total: model.total || 0
            }
        });
    }
    this._paintYoutube();
};

AirPlayApp.prototype._ytTileSections = function (rows) {
    var sections = this._ytBrowseSections();
    var out = [];
    var i;
    var j;
    var item;
    var hint;
    for (i = 0; i < sections.length; i += 1) {
        out.push({ title: sections[i].title, items: [] });
        for (j = 0; j < sections[i].items.length; j += 1) {
            item = sections[i].items[j];
            hint = String(item.channel || '');
            if (item.duration_s > 0 && youtubeClient.clock) {
                hint = (hint ? hint + ' · ' : '') + youtubeClient.clock(item.duration_s * 1000);
            }
            out[i].items.push({
                title: String(item.title || item.id || ''),
                hint: hint,
                duration: item.duration_s > 0 && youtubeClient.clock ? youtubeClient.clock(item.duration_s * 1000) : ''
            });
        }
    }
    return out;
};

AirPlayApp.prototype._playYoutube = function (row) {
    if (!this._ytModel || !row) {
        return;
    }
    if (this._ytCentral === false && !this._ytCluster && !this._ytHud) {
        this._ytCentral = true;
    }
    if (this._menuScreen() === 'yt-browse' && this._ytBrowse !== 'player') {
        this._ytListMode = this._ytBrowse || 'home';
        this._ytBrowse = 'player';
    }
    this._useYoutube();
    this._ytModel.setWantVideo(true);
    var film = this._ytFilm();
    this._ytModel.play(row.id, film.rect, false, row, { quality: film.quality });
    this._syncYoutubeList();
};

// What ytdec is asked for when a film starts. With the centre screen on:
// 848x480 from 480p. Only the cluster/HUD: the film comes straight in the
// KOMBI profile (16:9 inside it, e.g. 240x134 for 240x180) from 360p, so
// _placeMirrorFaces has nothing left to scale. The daemon cannot change
// the size mid-film: a screen switched on later counts from the next film.
AirPlayApp.prototype._ytFilm = function () {
    // THEiPlay's "Jakość obrazu" decides: the centre profile while the centre
    // screen shows the film, else the cluster/HUD profile. The film is 16:9
    // inside the profile (600x400 -> 600x336, 240x180 -> 240x132) and is
    // downloaded at the lowest YouTube height that covers it (360/480/720).
    var central = this._ytCentral !== false || (!this._ytCluster && !this._ytHud);
    var p = this._quality(central ? 'central' : 'kombi');
    var d = frameFit.profileDims(1920, 1080, p.w, p.h);
    return { rect: d.w + 'x' + d.h, quality: ytHeight(d.h), profile: p.w + 'x' + p.h, kind: central ? 'central' : 'kombi' };
};

// RideTube's screen: browse with thumbnails, the player, sign-in, channels and
// its settings, drawn as in RideTube (rt_host.js). It owns the connection to
// jap-ridetube-d; this._ytModel is its model, so the cluster/HUD code below
// reads the same film. Without it (a start error) the old menu screens stay.
AirPlayApp.prototype._bindRideTube = function () {
    var self = this;
    try {
        this._rt = rideTube.createRideTube({
            log: noteStart,
            dataDir: this._store && this._store.dir,
            version: (this._packageJson && this._packageJson.version) || '',
            spell: function (title) {
                return self._rtSpell(title);
            },
            onExit: function () {
                self._rtClosed();
            },
            screen: function (key) {
                if (key === 'yt_central') {
                    return self._ytCentral !== false;
                }
                return key === 'yt_cluster' ? !!self._ytCluster : !!self._ytHud;
            },
            setScreen: function (key, on) {
                self._setYtScreen(key.replace('yt_', ''), on);
            },
            kombiWanted: function () {
                return !!(self._ytCluster || self._ytHud);
            },
            centralVideo: function () {
                return self._ytCentral !== false || (!self._ytCluster && !self._ytHud);
            },
            videoRect: function () {
                return self._ytFilm().rect;
            },
            // RideTube's quality is THEiPlay's "Jakość obrazu" (not its own setting)
            videoQuality: function () {
                return self._ytFilm().quality;
            },
            qualityText: function () {
                var f = self._ytFilm();
                return (f.kind === 'central' ? 'Środek ' : 'Zegary/HUD ') + f.profile + ' (' + f.quality + 'p)';
            },
        });
        this._ytModel = this._rt.model;
        noteStart('rt-ready');
    } catch (err) {
        noteStart('rt-start ' + (err && (err.stack || err.message)));
        this._rt = null;
        this._bindYoutube();
    }
};

AirPlayApp.prototype._openRideTube = function () {
    if (!this._rt) {
        return;
    }
    // as a film from the old menu did: AirPlay gives the screen to YouTube
    this._useYoutube();
    if (this._menu) {
        this._menu.close();
    }
    this._rt.open();
};

// RideTube closed (its THEiPlay entry, Back): THEiPlay's menu again. The film
// plays on (sound, cluster/HUD) until Stop or "Wyłącz aplikację".
AirPlayApp.prototype._rtClosed = function () {
    if (this._exiting || this._visible === false || !this._menu) {
        return;
    }
    this._menu.open();
    if (typeof this._menu.setScreen === 'function') {
        this._menu.setScreen('root');
    }
};

// RideTube's search: THEiPlay's knob keyboard (the HMI's speller screens are
// blank on this G21). The menu has the screen while it is up.
AirPlayApp.prototype._rtSpell = function (title) {
    var self = this;
    return new Promise(function (resolve) {
        if (!self._menu || typeof self._menu.startEdit !== 'function') {
            resolve(null);
            return;
        }
        self._menu.open();
        self._menu.startEdit({
            field: 'rt-search',
            mode: 'search',
            value: '',
            title: title === 'Find a channel' ? 'Kanał' : 'Szukaj',
            onDone: function (text) {
                self._menu.close();
                resolve(String(text || ''));
            },
            onCancel: function () {
                self._menu.close();
                resolve(null);
            }
        });
    });
};

// One YouTube screen on or off (central, cluster, hud), saved with the
// desktop settings. Used by RideTube's settings.
AirPlayApp.prototype._setYtScreen = function (kind, on) {
    if (kind === 'central') {
        this._ytCentral = !!on;
    } else if (kind === 'cluster') {
        this._ytCluster = !!on;
    } else if (kind === 'hud') {
        this._ytHud = !!on;
    } else {
        return;
    }
    if (on) {
        this._useYoutube();
    }
    if (this._desk.setYtScreens) {
        this._desk.setYtScreens({ central: this._ytCentral !== false, cluster: !!this._ytCluster, hud: !!this._ytHud });
        this._saveDesk();
    }
    this._ytGaugeOuts = '';
    if (!this._ytCluster && this._settings.outputs().indexOf('cluster') === -1) {
        this._dropMirrorFace('cluster');
    }
    if (!this._ytHud && this._settings.outputs().indexOf('hud') === -1) {
        this._dropMirrorFace('hud');
    }
    this._paintYoutube();
};

AirPlayApp.prototype._stopYoutube = function () {
    if (this._ytModel) {
        this._ytModel.setWantVideo(false);
        this._ytModel.stop();
    }
    // The chosen screens stay for the next film (they are a setting, not
    // part of one film); only this film's pictures leave the cluster and HUD.
    this._ytGaugeOuts = '';
    this._dropYoutubeFaces();
    this._paintYoutube();
};

AirPlayApp.prototype._useYoutube = function () {
    if (this._airStarting || (this._sessions && this._sessions.active() === 'airplay')) {
        this._endStream('airplay');
    }
    if (this._ytModel) {
        this._ytModel.setWantVideo(true);
    }
};

AirPlayApp.prototype._startAirplaySelected = function () {
    var names = this._settings.outputs();
    this._stopYoutube();
    var started;
    if (!names.length) {
        this._airNeedPick = true;
        this._refreshAirBadge();
        return;
    }
    this._airNeedPick = false;
    if (this._router) {
        this._router.setMode(this._routerMode());
        this._router.setParked(this._parkFlag());
    }
    this._writeAirplayAuth();
    this._writeAirplaySize();
    // central pixels are the menu VIDEO op. g21-present's waylandsink is a
    // black layer on top of that, so the tool must not be asked for central.
    var toolOut = [];
    names.forEach(function (item) {
        if (item !== 'central') {
            toolOut.push(item);
        }
    });
    this._writeSessionOutput(toolOut.length ? toolOut.join(',') : 'off');
    if (this._frameBridge) {
        this._frameBridge.stop();
    }
    started = this._display.selectMany(names);
    noteStart('air-out ' + names.join(',') + (started.failed && started.failed.length ? (' fail ' + started.failed.join(',')) : ''));
    if (!started.ok && names.indexOf('central') !== -1) {
        this._tellMenu((started.failed && started.failed[0]) || 'not-parked');
        this._sync();
        return;
    }
    this._airStarting = true;
    this._choose('airplay');
    this._enterStream('airplay');
};

AirPlayApp.prototype._endStream = function (protocol) {
    var back = protocol || this._streamProtocol || 'airplay';
    this._winAutoAccepting = false;
    this._stopVideoTimer();
    if (this._frameBridge) {
        this._frameBridge.stop();
    }
    if (back === 'airplay') {
        this._writeSessionOutput('off');
        this._dropMirror();
    } else {
        this._writeSessionOutput('central');
    }
    this._rdpOutput = 'central';
    this._airOutput = 'central';
    var keepScreens = this._settings.outputs().slice();
    this._display.select('central');
    if (keepScreens.length) {
        this._settings.setOutputs(keepScreens);
    }
    this._sessions.disconnect();
    this._airStarting = false;
    this._sessionText = back + ' stop';
    this._streamProtocol = '';
    this._tune = null;
    if (this._menuScreen() === 'stream' && this._menu && typeof this._menu.setScreen === 'function') {
        this._menu.setScreen(back);
    }
    this._chosen = back;
    this._paintSwitch(this._toggleItem(back), false);
    this._tellMenu('idle');
    this._sync();
    this._refreshAirBadge();
};

AirPlayApp.prototype._enterStream = function (protocol) {
    if (protocol === 'airplay') {
        if (this._streamProtocol === 'airplay' && this._videoTimer) {
            if (this._menuScreen() === 'stream' && this._menu && typeof this._menu.setScreen === 'function') {
                this._menu.setScreen('airplay');
            }
            this._refreshAirBadge();
            return;
        }
        this._streamProtocol = 'airplay';
        this._tune = null;
        this._decoded = null;
        this._mirrorPainted = false;
        this._yuvStamp = '';
        this._streamEpoch = Date.now();
        this._dropMirror();
        if (this._menu && typeof this._menu.rebindVideo === 'function') {
            this._menu.rebindVideo();
        }
        this._startVideoTimer();
        this._chosen = 'airplay';
        if (this._menuScreen() === 'stream' && this._menu && typeof this._menu.setScreen === 'function') {
            this._menu.setScreen('airplay');
        }
        this._refreshAirBadge();
        this._tellMenu('waiting');
        return;
    }
    if (this._menuScreen() === 'stream' && this._streamProtocol === protocol) {
        return;
    }
    this._streamProtocol = protocol;
    this._tune = null;
    this._chosen = protocol;
    if (this._menu && typeof this._menu.setScreen === 'function') {
        this._menu.setScreen('stream');
    }
    this._paintStreamInfo(
        { ok: true, ip: '', ssid: '', reason: '' },
        { mode: '' }
    );
    this._tellMenu('running');
};

AirPlayApp.prototype._readWinOffers = function () {
    return windowsOffers.readOffers(this._paths.offers);
};

AirPlayApp.prototype._rebuildWinDevicesMenu = function () {
    var offers = this._readWinOffers();
    var items = windowsOffers.menuItems(offers);
    if (this._menu && typeof this._menu.setItems === 'function') {
        this._menu.setItems(items, 'Urzadzenia');
    }
    return offers;
};

AirPlayApp.prototype._acceptWinOffer = function (id) {
    var wrote = windowsOffers.writeAccept(this._paths.accept, id);
    noteStart(wrote.ok ? ('win-accept ' + id) : ('win-accept-fail ' + (wrote.reason || '')));
    if (!wrote.ok) {
        this._winAutoAccepting = false;
        this._tellMenu(wrote.reason || 'error');
        return;
    }
    this._sessionText = 'windows accept ' + id;
    this._tellMenu('starting');
    this._sync();
};

AirPlayApp.prototype._maybeAutoAcceptWin = function () {
    var live;
    var offers;
    if (this._sessions.active() !== 'windows') {
        return;
    }
    live = this._sessions.getStatus() || {};
    if (live.state === 'running' || live.state === 'starting') {
        return;
    }
    offers = this._readWinOffers();
    if (!offers.length) {
        this._winAutoAccepting = false;
        return;
    }
    if (this._winAutoAccepting) {
        return;
    }
    // Newest offer: after Win+K detection, connect without an extra tap.
    this._winAutoAccepting = true;
    noteStart('win-auto ' + offers[offers.length - 1].id);
    this._acceptWinOffer(offers[offers.length - 1].id);
};

AirPlayApp.prototype._onWinAction = function (name) {
    if (name === 'win-back') {
        this._goRoot();
        return;
    }
    if (name === 'win-toggle') {
        this._toggleProtocol('windows');
        return;
    }
    if (name === 'win-devices') {
        if (this._menu && typeof this._menu.setScreen === 'function') {
            this._menu.setScreen('win-devices');
        }
        this._rebuildWinDevicesMenu();
        this._tellMenu(this._readWinOffers().length ? 'offer' : 'no-offers');
        return;
    }
    if (name === 'win-info') {
        this._sync();
    }
};

AirPlayApp.prototype._onWinDevicesAction = function (name) {
    if (name === 'win-d-back') {
        if (this._menu && typeof this._menu.setScreen === 'function') {
            this._menu.setScreen('windows');
        }
        this._tellMenu('waiting');
        this._sync();
        return;
    }
    if (name.indexOf('win-d-') === 0) {
        this._acceptWinOffer(name.slice('win-d-'.length));
    }
};

AirPlayApp.prototype._paintAirPinSwitch = function () {
    var on = !!(this._desk && this._desk.airplayPin && this._desk.airplayPin());
    if (!this._menu) {
        return;
    }
    if (typeof this._menu.setItemTitle === 'function') {
        this._menu.setItemTitle('air-pin', 'Kod');
    }
    if (typeof this._menu.setItemHint === 'function') {
        this._menu.setItemHint(
            'air-pin',
            on ? 'z kodem, wpisz na iPhonie' : 'bez kodu'
        );
    }
    if (typeof this._menu.setItemIcon === 'function') {
        this._menu.setItemIcon('air-pin', on ? 'lock' : 'unlock');
    }
    // AirPlay Sound sits beside the code switch and is painted with it
    var sound = !!(this._desk && this._desk.airplaySound && this._desk.airplaySound());
    if (typeof this._menu.setItemHint === 'function') {
        this._menu.setItemHint('air-sound', sound ? 'włączone: tylko dźwięk, bez obrazu' : 'wyłączone: obraz i dźwięk');
    }
};

AirPlayApp.prototype._toggleAirplayPin = function () {
    var on = !(this._desk && this._desk.airplayPin && this._desk.airplayPin());
    this._desk.setAirplayPin(on);
    this._saveDesk();
    this._writeAirplayAuth();
    this._paintAirPinSwitch();
    this._tellMenu(on ? 'pin-wait' : 'waiting');
    noteStart(on ? 'air-auth-pin' : 'air-auth-open');
    this._sync();
};

AirPlayApp.prototype._onAirAction = function (name) {
    if (name === 'air-back') {
        this._goRoot();
        return;
    }
    if (name === 'air-toggle') {
        this._toggleProtocol('airplay');
        return;
    }
    if (name === 'air-pin') {
        this._toggleAirplayPin();
        return;
    }
    if (name === 'air-sound') {
        this._toggleAirplaySound();
        return;
    }
    if (name === 'air-quality') {
        this._onQualityChoice(name);
        return;
    }
    if (name === 'air-screen') {
        if (this._menu && typeof this._menu.setScreen === 'function') {
            this._menu.setScreen('air-out');
        }
        this._paintAirOut();
        this._tellMenu('pick-out');
        this._sync();
        return;
    }
    if (name === 'air-out-back' || name === 'air-box-back') {
        this._boxMove = false;
        this._flushWindowSave();
        if (name === 'air-box-back' && this._menu && typeof this._menu.setScreen === 'function') {
            this._menu.setScreen('air-out');
            this._sync();
            return;
        }
        this._openProtocolScreen('airplay');
        return;
    }
    if (name === 'air-out-central' || name === 'air-out-cluster' || name === 'air-out-hud') {
        this._openScreenOptions(name.replace('air-out-', ''));
        return;
    }
    if (name === 'air-out-start') {
        this._startAirplaySelected();
        return;
    }
    if (name === 'air-box-power') {
        this._settings.toggleOutput(this._boxFocus || 'central');
        this._saveWindows();
        if (this._router) {
            this._router.setMode(this._routerMode());
        }
        this._paintAirBox();
        return;
    }
    if (name === 'air-box-place') {
        var nextPlace = this._desk.airClusterTarget() === 'panel' ? 'map' : 'panel';
        this._desk.setAirClusterTarget(nextPlace);
        this._saveDesk();
        this._clusterLayer = '';
        this._dropMirrorFace('cluster');
        if (this._lastFrame) {
            this._faceAt = 0;
            this._placeMirrorFaces(this._lastFrame.i420, this._lastFrame.w, this._lastFrame.h);
        }
        this._paintAirBox();
        return;
    }
    if (name === 'air-box-x' || name === 'air-box-y' || name === 'air-box-size') {
        this._paintAirBox();
        return;
    }
    if (name === 'air-box-center') {
        this._settings.center(this._boxFocus || 'central');
        this._saveWindows();
        this._liveApply(this._boxFocus || 'central');
        this._paintAirBox();
        return;
    }
    if (name === 'air-name') {
        this._startFieldEdit('air-name', 'name', this._desk.airplayName(), 'Nazwa THEiPlay');
        return;
    }
    if (name === 'air-info') {
        this._sync();
    }
};

AirPlayApp.prototype._onStreamAction = function (name) {
    var which;
    if (name === 'stream-end') {
        this._tune = null;
        this._endStream(this._streamProtocol || this._chosen || 'airplay');
        return;
    }
    if (name === 'stream-central' || name === 'stream-cluster' || name === 'stream-hud') {
        which = name.replace('stream-', '');
        this._openTune(which, '');
        return;
    }
    if (name === 'stream-win-pos') {
        this._openTune('central', 'pos');
        return;
    }
    if (name === 'stream-win-size') {
        this._openTune('central', 'size');
        return;
    }
    if (name === 'stream-pos' || name === 'stream-size' || name === 'stream-w' || name === 'stream-h') {
        if (!this._tune) {
            this._openTune('central', name.replace('stream-', ''));
            return;
        }
        this._tune.tool = name.replace('stream-', '');
        if (this._tune.tool === 'pos') {
            this._tune.axis = this._tune.axis === 'y' ? 'y' : 'x';
        }
        this._tune.saved = false;
        this._refreshAirBadge();
        return;
    }
    if (name === 'stream-axis-x' || name === 'stream-axis-y') {
        if (!this._tune) {
            return;
        }
        this._tune.tool = 'pos';
        this._tune.axis = name === 'stream-axis-y' ? 'y' : 'x';
        this._refreshAirBadge();
        return;
    }
    if (name === 'stream-save') {
        this._saveTune();
        return;
    }
    if (name === 'stream-cancel') {
        this._cancelTune();
    }
};

AirPlayApp.prototype._onRdpAction = function (name) {
    var added;
    var removed;
    var id;
    if (name === 'rdp-back') {
        this._goRoot();
        return;
    }
    if (name === 'rdp-e-back') {
        this._openProtocolScreen('rdp');
        return;
    }
    if (name === 'rdp-connect') {
        if (this._menu && typeof this._menu.setScreen === 'function') {
            this._menu.setScreen('rdp-out');
        }
        this._tellMenu('pick-out');
        this._sync();
        return;
    }
    if (name === 'rdp-out-back') {
        this._openProtocolScreen('rdp');
        return;
    }
    if (name === 'rdp-out-central') {
        this._startRdpToOutput('central');
        return;
    }
    if (name === 'rdp-out-cluster') {
        this._startRdpToOutput('cluster');
        return;
    }
    if (name === 'rdp-out-hud') {
        this._startRdpToOutput('hud');
        return;
    }
    if (name === 'rdp-cut') {
        if (this._frameBridge) {
            this._frameBridge.stop();
        }
        this._writeSessionOutput('central');
        this._rdpOutput = 'central';
        this._display.select('central');
        this._sessions.disconnect();
        this._sessionText = 'rdp stop';
        this._tellMenu('idle');
        this._sync();
        return;
    }
    if (name.indexOf('rdp-prof-') === 0) {
        id = name.slice('rdp-prof-'.length);
        this._desk.setActiveProfile('rdp', id);
        this._saveDesk();
        this._rebuildProtocolMenu('rdp');
        this._sync();
        return;
    }
    if (name === 'rdp-add') {
        added = this._desk.addProfile('rdp');
        if (!added.ok) {
            this._tellMenu(added.reason || 'waiting');
            this._sync();
            return;
        }
        this._saveDesk();
        if (this._menu && typeof this._menu.setScreen === 'function') {
            this._menu.setScreen('rdp-edit');
        }
        this._sync();
        return;
    }
    if (name === 'rdp-edit') {
        if (this._menu && typeof this._menu.setScreen === 'function') {
            this._menu.setScreen('rdp-edit');
        }
        this._sync();
        return;
    }
    if (name === 'rdp-del') {
        removed = this._desk.removeProfile('rdp', this._desk.activeProfileId('rdp'));
        if (!removed.ok) {
            this._tellMenu(removed.reason || 'waiting');
            this._sync();
            return;
        }
        this._saveDesk();
        this._rebuildProtocolMenu('rdp');
        this._sync();
        return;
    }
    if (name === 'rdp-e-label') {
        this._startFieldEdit('rdp-label', 'user', this._desk.host('rdp').label || '', 'Nazwa profilu');
        return;
    }
    if (name === 'rdp-e-ip' || name === 'rdp-ip') {
        this._startFieldEdit('rdp-ip', 'ip', this._desk.formatHostIp('rdp'), 'IP RDP');
        return;
    }
    if (name === 'rdp-e-port' || name === 'rdp-port') {
        this._startFieldEdit('rdp-port', 'port', String(this._desk.host('rdp').port), 'Port RDP');
        return;
    }
    if (name === 'rdp-e-user' || name === 'rdp-user') {
        this._startFieldEdit('rdp-user', 'user', this._desk.host('rdp').user || '', 'Konto RDP');
        return;
    }
    if (name === 'rdp-e-pass' || name === 'rdp-pass') {
        this._startFieldEdit('rdp-pass', 'pass', '', 'Haslo RDP');
        return;
    }
    if (name === 'rdp-cert') {
        this._acceptRdpCert();
        return;
    }
    if (name === 'rdp-panel') {
        this._tellMenu('panel-www');
        this._sync();
    }
};

AirPlayApp.prototype._onVncAction = function (name) {
    var added;
    var removed;
    var id;
    if (name === 'vnc-back') {
        this._goRoot();
        return;
    }
    if (name === 'vnc-e-back') {
        this._openProtocolScreen('vnc');
        return;
    }
    if (name === 'vnc-toggle') {
        this._toggleProtocol('vnc');
        return;
    }
    if (name === 'vnc-connect') {
        this._choose('vnc');
        return;
    }
    if (name === 'vnc-cut') {
        this._sessions.disconnect();
        this._sessionText = 'vnc stop';
        this._tellMenu('idle');
        this._sync();
        return;
    }
    if (name.indexOf('vnc-prof-') === 0) {
        id = name.slice('vnc-prof-'.length);
        this._desk.setActiveProfile('vnc', id);
        this._saveDesk();
        this._rebuildProtocolMenu('vnc');
        this._sync();
        return;
    }
    if (name === 'vnc-add') {
        added = this._desk.addProfile('vnc');
        if (!added.ok) {
            this._tellMenu(added.reason || 'waiting');
            this._sync();
            return;
        }
        this._saveDesk();
        if (this._menu && typeof this._menu.setScreen === 'function') {
            this._menu.setScreen('vnc-edit');
        }
        this._sync();
        return;
    }
    if (name === 'vnc-edit') {
        if (this._menu && typeof this._menu.setScreen === 'function') {
            this._menu.setScreen('vnc-edit');
        }
        this._sync();
        return;
    }
    if (name === 'vnc-del') {
        removed = this._desk.removeProfile('vnc', this._desk.activeProfileId('vnc'));
        if (!removed.ok) {
            this._tellMenu(removed.reason || 'waiting');
            this._sync();
            return;
        }
        this._saveDesk();
        this._rebuildProtocolMenu('vnc');
        this._sync();
        return;
    }
    if (name === 'vnc-e-label') {
        this._startFieldEdit('vnc-label', 'user', this._desk.host('vnc').label || '', 'Nazwa profilu');
        return;
    }
    if (name === 'vnc-e-ip' || name === 'vnc-ip') {
        this._startFieldEdit('vnc-ip', 'ip', this._desk.formatHostIp('vnc'), 'IP VNC');
        return;
    }
    if (name === 'vnc-e-port' || name === 'vnc-port') {
        this._startFieldEdit('vnc-port', 'port', String(this._desk.host('vnc').port), 'Port VNC');
        return;
    }
};

AirPlayApp.prototype._spot = function (name) {
    var box = this._settings.picture(name || 'central');
    return { x: box.x | 0, y: box.y | 0 };
};

AirPlayApp.prototype._captionColor = function () {
    return {
        white: 0xFFFFFFFF,
        orange: 0xE6A15CFF,
        red: 0xE23B3BFF,
        yellow: 0xF5D76EFF,
        blue: 0x7EB6FFFF
    }[this._desk.labelColor()] || 0xFFFFFFFF;
};

AirPlayApp.prototype._refreshLabel = function () {
    var at = this._spot('central');
    if (this._label) {
        this._label.setText(this._desk.labelText());
        if (typeof this._label.setLook === 'function') {
            this._label.setLook({
                font: this._desk.labelFont(),
                scale: this._desk.labelScale(),
                color: this._desk.labelColor()
            });
        }
        this._label.setPlaces({
            panel: this._spot('cluster'),
            hud: this._spot('hud')
        });
        this._label.setEnabled(this._desk.clusterLabel());
    }
    if (this._menu && typeof this._menu.setCaption === 'function') {
        this._menu.setCaption({
            on: this._desk.clusterLabel(),
            text: this._desk.labelText(),
            x: at.x,
            y: at.y,
            scale: Math.max(2, Math.min(5, this._desk.labelScale())),
            color: this._captionColor()
        });
    }
};

AirPlayApp.prototype._paintYoutube = function () {
    var playing = this._ytModel && (this._ytModel.state === 'preparing' || this._ytModel.state === 'playing' || this._ytModel.state === 'paused');
    var live = !!this._ytLive || !!playing;
    var self = this;
    // Each tile says where the picture stands there (THEiPlay's position menu).
    var where = function (key) {
        var p = self._settings && self._settings.picture ? self._settings.picture(key) : null;
        return p ? 'pozycja ' + (p.x | 0) + ', ' + (p.y | 0) : '';
    };
    var screens = [
        { key: 'cluster', on: !!this._ytCluster, hint: where('cluster') },
        { key: 'hud', on: !!this._ytHud, hint: where('hud') },
        { key: 'central', on: this._ytCentral !== false, hint: this._rt ? 'pełny ekran' : where('central') }
    ];
    if (this._menu && typeof this._menu.setItemHint === 'function' && !(this._ytModel && this._ytModel.title)) {
        this._menu.setItemHint('yt-play', live ? 'odtwarzanie' : (this._ytModel && this._ytModel.connected ? 'gotowy' : 'brak usługi'), true);
    }
    if (this._menu && typeof this._menu.setYtState === 'function') {
        this._menu.setYtState({
            live: live,
            central: this._ytCentral !== false,
            screens: screens,
            window: this._settings.picture('central')
        });
    }
};

AirPlayApp.prototype._dropYoutubeFaces = function () {
    // Faces are shared with AirPlay; only drop the ones AirPlay is not using.
    var airplay = this._sessions && this._sessions.active() === 'airplay';
    this._ytGaugeFrame = null;
    if (airplay) {
        return;
    }
    if (this._mirrorFaces && this._mirrorFaces.cluster) {
        this._dropMirrorFace('cluster');
    }
    if (this._mirrorFaces && this._mirrorFaces.hud) {
        this._dropMirrorFace('hud');
    }
};

AirPlayApp.prototype._takeYoutube = function () {
    var frame;
    var now = Date.now();
    var gauges = !!this._ytCluster || !!this._ytHud;
    if (this._airStarting || (this._sessions && this._sessions.active() === 'airplay')) {
        return;
    }
    var outs;
    if (!this._ytFile) {
        return;
    }
    // The centre screen reads the film file itself; this loop only needs a
    // film frame rate when the cluster or the HUD shows it.
    if (!gauges && this._ytPolledAt && (now - this._ytPolledAt) < 200) {
        return;
    }
    this._ytPolledAt = now;
    // Without gauges only the file's 64-byte head is read (is a film on?).
    frame = this._ytFile.pull(!gauges);
    if (frame === null && gauges && this._ytFile.lastError) {
        // Logged once per change: EACCES means the film is there but this
        // app's uid cannot read it (the tool makes it readable, 0.1.46+).
        var readErr = this._ytFile.lastError();
        if (readErr !== (this._ytReadErr || '')) {
            this._ytReadErr = readErr;
            if (readErr && readErr !== 'ENOENT') {
                noteStart('yt-frames ' + readErr + ' ' + this._ytFile.path);
            }
        }
    }
    if (frame === null) {
        if (this._ytLive) {
            this._ytLive = false;
            this._ytFrame = null;
            this._dropYoutubeFaces();
            this._paintYoutube();
        }
        return;
    }
    if (frame) {
        if (!this._ytLive) {
            this._ytLive = true;
            this._paintYoutube();
        }
        // (a peek has no picture: the next full read takes the frame)
        this._ytFrame = frame.peek ? null : frame;
        if (this._ytReadErr) {
            this._ytReadErr = '';
            noteStart('yt-frames ok ' + frame.w + 'x' + frame.h);
        }
    }
    outs = [];
    if (this._ytCluster) {
        outs.push('cluster');
    }
    if (this._ytHud) {
        outs.push('hud');
    }
    if (!outs.length) {
        if (this._ytGaugeFrame) {
            this._dropYoutubeFaces();
        }
        return;
    }
    if (!this._ytFrame) {
        return;
    }
    // Same frame as last time: the layers keep it (stall_ms is long), and a
    // moved window is placed by _nudgeMirror. Sending it again only spends
    // the cluster's upload budget.
    if (!frame && this._ytGaugeFrame && this._ytGaugeOuts === outs.join(',')) {
        return;
    }
    // The film is scaled once, straight to the KOMBI profile, in
    // _placeMirrorFaces. The centre screen reads the film file itself.
    frame = this._ytFrame;
    this._ytGaugeFrame = frame;
    // A throttled call sent nothing: try the same frame on the next tick.
    this._ytGaugeOuts = this._placeMirrorFaces(frame.i420, frame.w, frame.h, outs) ? outs.join(',') : '';
};

AirPlayApp.prototype._paintRender = function () {
    var gpu = this._desk.uiRender() !== 'software';
    var label = gpu ? 'GPU' : 'Programowe';
    var lists = [menuDraw.ROOT_ITEMS, menuDraw.SCREENS.settings];
    var names = ['settings', 'set-render'];
    var i;
    var j;
    for (i = 0; i < lists.length; i += 1) {
        if (!lists[i]) {
            continue;
        }
        for (j = 0; j < lists[i].length; j += 1) {
            if (lists[i][j].name === names[i]) {
                lists[i][j].hint = label;
            }
        }
    }
    if (this._menu && typeof this._menu.setItemHint === 'function') {
        this._menu.setItemHint('settings', label, true);
        this._menu.setItemHint('set-render', label, true);
    }
    if (this._menu && typeof this._menu.repaint === 'function') {
        this._menu.repaint();
    }
};

AirPlayApp.prototype._paintLabel = function () {
    var name = this._labelFocus || 'central';
    var at;
    if (!this._menu || this._menuScreen() !== 'label') {
        return;
    }
    var fontName = { pixel: 'Pixel', bold: 'Gruby', tall: 'Wysoki' }[this._desk.labelFont()] || 'Pixel';
    var colorName = { white: 'Biały', orange: 'Pomarańcz', red: 'Czerwony', yellow: 'Żółty', blue: 'Niebieski' }[this._desk.labelColor()] || 'Biały';
    this._menu.setItemTitle('label-on', 'Napis');
    this._menu.setItemHint('label-on', this._desk.clusterLabel() ? 'widoczny' : 'ukryty');
    this._menu.setItemHint('label-text', this._desk.labelText());
    this._menu.setItemTitle('label-where', this._outputLabel(name));
    this._menu.setItemHint('label-font', fontName);
    this._menu.setItemHint('label-size', String(this._desk.labelScale()));
    this._menu.setItemHint('label-color', colorName);
    this._refreshLabel();
};

AirPlayApp.prototype._toggleClusterLabel = function () {
    var on = !this._desk.clusterLabel();
    this._desk.setClusterLabel(on);
    this._saveDesk();
    this._paintLabel();
    this._refreshLabel();
    noteStart(on ? 'label-wl' : 'label-wyl');
};

AirPlayApp.prototype._onMenuChoice = function (name) {
    var screen = this._menuScreen();
    if (name === 'app-exit') {
        this._exitApp();
        return;
    }
    if (this._onQualityChoice(name)) {
        return;
    }
    if (name === 'label-toggle') {
        this._labelMove = false;
        if (this._menu && typeof this._menu.setScreen === 'function') {
            this._menu.setScreen('label');
        }
        this._paintLabel();
        return;
    }
    if (name === 'label-on') {
        this._toggleClusterLabel();
        return;
    }
    if (name === 'label-text') {
        this._labelMove = false;
        this._startFieldEdit('label-text', 'caption', this._desk.labelText(), 'Napis');
        return;
    }
    if (name === 'label-where') {
        var screens = ['central', 'cluster', 'hud'];
        var atScreen = screens.indexOf(this._labelFocus);
        this._labelMove = false;
        this._labelFocus = screens[(atScreen + 1) % screens.length];
        this._paintLabel();
        return;
    }
    if (name === 'label-font') {
        var fonts = ['pixel', 'bold', 'tall'];
        var atFont = fonts.indexOf(this._desk.labelFont());
        this._desk.setLabelFont(fonts[(atFont + 1) % fonts.length]);
        this._saveDesk();
        this._paintLabel();
        return;
    }
    if (name === 'label-color') {
        var colors = ['white', 'orange', 'red', 'yellow', 'blue'];
        var atColor = colors.indexOf(this._desk.labelColor());
        this._desk.setLabelColor(colors[(atColor + 1) % colors.length]);
        this._saveDesk();
        this._paintLabel();
        return;
    }
    if (name === 'label-back') {
        this._labelMove = false;
        if (this._menu && typeof this._menu.setScreen === 'function') {
            this._menu.setScreen('root');
        }
        this._sync();
        return;
    }
    if (name === 'lang-toggle') {
        this._desk.setUiLang(this._menu && this._menu.lang ? this._menu.lang() : 'pl');
        this._saveDesk();
        return;
    }
    if (name === 'position' || name === 'pos-back' || name === 'pos-each-back') {
        this._showPositionList();
        return;
    }
    if (name === 'pos-out-back') {
        this._posFocus = '';
        if (this._menu && typeof this._menu.setBoxPreview === 'function') {
            this._menu.setBoxPreview(null);
        }
        if (this._menu && typeof this._menu.setScreen === 'function') {
            this._menu.setScreen('root');
        }
        return;
    }
    if (name === 'pos-shared') {
        this._posMode = 'shared';
        this._posFocus = 'shared';
        this._mirrorSharedWindow();
        this._nudgeMirror('central');
        this._nudgeMirror('cluster');
        this._nudgeMirror('hud');
        this._refreshLabel();
        this._paintYoutube();
        this._queueWindowSave();
        this._showPositionList();
        return;
    }
    if (name === 'pos-each') {
        this._posMode = 'each';
        if (this._posScreen !== 'cluster' && this._posScreen !== 'hud') {
            this._posScreen = 'central';
        }
        this._posFocus = this._posScreen;
        this._showPositionList();
        return;
    }
    if (name === 'pos-out-central' || name === 'pos-out-cluster' || name === 'pos-out-hud') {
        this._posMode = 'each';
        this._posScreen = name.replace('pos-out-', '');
        this._posFocus = this._posScreen;
        this._showPositionList();
        return;
    }
    if (name === 'pos-center') {
        if (this._posFocus === 'shared') {
            this._settings.center('central');
            this._mirrorSharedWindow();
            this._liveApply('central');
            this._liveApply('cluster');
            this._liveApply('hud');
        } else {
            this._settings.center(this._posFocus || 'central');
            this._liveApply(this._posFocus || 'central');
        }
        this._saveWindows();
        this._refreshLabel();
        this._paintYoutube();
        this._paintPosition();
        return;
    }
    if (name === 'youtube') {
        // First the sheet "where to show YouTube" (centre, cluster, HUD; each at
        // the position set in THEiPlay), its button opens RideTube.
        if (this._rt && this._menu && typeof this._menu.openYtWhere === 'function') {
            if (typeof this._menu.setScreen === 'function') {
                this._menu.setScreen('youtube');
            }
            this._paintYoutube();
            this._menu.openYtWhere();
            return;
        }
        if (this._rt) {
            this._openRideTube();
            return;
        }
        if (this._menu && typeof this._menu.setScreen === 'function') {
            this._menu.setScreen('youtube');
        }
        this._syncYoutubeGate();
        return;
    }
    if (name === 'yt-login') {
        if (this._ytSignedIn()) {
            if (!this._ytSignOutArmed) {
                var ytApp = this;
                this._ytSignOutArmed = true;
                if (this._ytSignOutTimer) {
                    clearTimeout(this._ytSignOutTimer);
                }
                this._ytSignOutTimer = setTimeout(function () {
                    ytApp._ytSignOutArmed = false;
                    ytApp._ytSignOutTimer = null;
                    ytApp._syncYoutubeGate();
                }, 5000);
                this._syncYoutubeGate();
                return;
            }
            this._ytSignOutArmed = false;
            if (this._ytSignOutTimer) {
                clearTimeout(this._ytSignOutTimer);
                this._ytSignOutTimer = null;
            }
            this._ytModel.signOut();
            this._syncYoutubeGate();
            return;
        }
        this._ytSignOutArmed = false;
        this._beginYoutubeLogin();
        return;
    }
    if (name === 'yt-login-retry') {
        if (this._ytModel) {
            this._ytModel.authStart(true);
        }
        this._syncYoutubeLogin();
        return;
    }
    if (name === 'yt-login-code') {
        return;
    }
    if (name === 'yt-login-back') {
        if (this._menu && typeof this._menu.setScreen === 'function') {
            this._menu.setScreen('youtube');
        }
        this._syncYoutubeGate();
        return;
    }
    if (name === 'yt-browse') {
        if (!this._ytSignedIn()) {
            this._beginYoutubeLogin();
            return;
        }
        this._ytBrowse = this._ytBrowse && this._ytBrowse !== 'results' ? this._ytBrowse : 'home';
        if (this._menu && typeof this._menu.setScreen === 'function') {
            this._menu.setScreen('yt-browse');
        }
        this._openYtFeed(this._ytBrowse);
        this._syncYoutubeBrowse();
        return;
    }
    if (name === 'yt-feed-home' || name === 'yt-feed-subs' || name === 'yt-feed-wl') {
        this._openYtFeed(name === 'yt-feed-home' ? 'home' : (name === 'yt-feed-subs' ? 'subs' : 'wl'));
        this._syncYoutubeBrowse();
        return;
    }
    if (name === 'yt-ride-back') {
        if (this._menuScreen() === 'yt-login') {
            if (this._menu && typeof this._menu.setScreen === 'function') {
                this._menu.setScreen('youtube');
            }
            this._syncYoutubeGate();
            return;
        }
        if (this._ytBrowse === 'player') {
            this._ytBrowse = this._ytListMode || 'home';
            this._syncYoutubeBrowse();
            return;
        }
        if (this._menu && typeof this._menu.setScreen === 'function') {
            this._menu.setScreen('youtube');
        }
        this._syncYoutubeGate();
        return;
    }
    if (name === 'yt-browse-back') {
        if (this._menu && typeof this._menu.setScreen === 'function') {
            this._menu.setScreen('youtube');
        }
        this._syncYoutubeGate();
        return;
    }
    if (name === 'yt-browse-empty') {
        return;
    }
    if (name === 'youtube' || name === 'yt-play') {
        if (name === 'yt-play' && this._ytModel) {
            if (this._ytModel.state === 'playing' || this._ytModel.state === 'paused') {
                this._ytModel.toggle();
            }
        }
        this._syncYoutubeList();
        return;
    }
    if (name === 'yt-search') {
        this._startFieldEdit('yt-search', 'search', this._ytModel && this._ytModel.q ? this._ytModel.q : '', 'Szukaj');
        return;
    }
    if (name.indexOf('yt-vid-') === 0 && this._ytRows) {
        this._playYoutube(this._ytRows[Number(name.slice(7))]);
        return;
    }
    if (name.indexOf('yt-res-') === 0 && this._ytModel) {
        this._playYoutube(this._ytModel.results[Number(name.slice(7))]);
        return;
    }
    if (name === 'yt-back10' && this._ytModel) {
        this._ytModel.skip(-10000);
        return;
    }
    if (name === 'yt-fwd10' && this._ytModel) {
        this._ytModel.skip(10000);
        return;
    }
    if (name === 'yt-stop') {
        this._stopYoutube();
        if (this._menuScreen() !== 'yt-browse' && this._menu && typeof this._menu.setScreen === 'function') {
            this._menu.setScreen('youtube');
        }
        this._syncYoutubeList();
        return;
    }
    if (name === 'yt-back') {
        if (this._menu && typeof this._menu.setScreen === 'function') {
            this._menu.setScreen('root');
        }
        return;
    }
    if (name === 'yt-where') {
        return;
    }
    if (name === 'yt-where-go') {
        this._openRideTube();
        return;
    }
    if (name === 'yt-where-cancel') {
        if (this._menu && typeof this._menu.setScreen === 'function') {
            this._menu.setScreen('root');
        }
        return;
    }
    if (name === 'yt-pick-central' || name === 'yt-pick-cluster' || name === 'yt-pick-hud') {
        var ytKey = name.replace('yt-pick-', '');
        var ytOn = false;
        if (ytKey === 'central') {
            this._ytCentral = this._ytCentral === false;
            ytOn = this._ytCentral !== false;
        } else if (ytKey === 'cluster') {
            this._ytCluster = !this._ytCluster;
            ytOn = !!this._ytCluster;
        } else if (ytKey === 'hud') {
            this._ytHud = !this._ytHud;
            ytOn = !!this._ytHud;
        }
        if (ytOn) {
            this._useYoutube();
        }
        if (this._desk.setYtScreens) {
            this._desk.setYtScreens({ central: this._ytCentral !== false, cluster: !!this._ytCluster, hud: !!this._ytHud });
            this._saveDesk();
        }
        this._ytGaugeOuts = '';
        if (!this._ytCluster && this._settings.outputs().indexOf('cluster') === -1) {
            this._dropMirrorFace('cluster');
        }
        if (!this._ytHud && this._settings.outputs().indexOf('hud') === -1) {
            this._dropMirrorFace('hud');
        }
        this._paintYoutube();
        return;
    }
    if (name === 'settings') {
        if (this._menu && typeof this._menu.setScreen === 'function') {
            this._menu.setScreen('settings');
        }
        this._paintRender();
        return;
    }
    if (name === 'set-render') {
        this._desk.setUiRender(this._desk.uiRender() === 'gpu' ? 'software' : 'gpu');
        this._saveDesk();
        this._paintRender();
        return;
    }
    if (name === 'set-back') {
        if (this._menu && typeof this._menu.setScreen === 'function') {
            this._menu.setScreen('root');
        }
        return;
    }
    if (name === 'airplay') {
        this._openProtocolScreen('airplay');
        return;
    }
    if (name === 'air-pick-central' || name === 'air-pick-cluster' || name === 'air-pick-hud') {
        this._settings.toggleOutput(name.replace('air-pick-', ''));
        this._airNeedPick = false;
        this._saveWindows();
        if (this._router) {
            this._router.setMode(this._routerMode());
        }
        if (this._menuScreen() === 'air-out') {
            this._paintAirOut();
        }
        this._refreshAirBadge();
        return;
    }
    if (name === 'air-full') {
        var fullBox = this._settings.picture('central');
        if (fullBox.w >= 1800 && fullBox.h >= 680) {
            this._settings.setPicture('central', this._centralRest || { x: 640, y: 180, w: 640, h: 360 });
        } else {
            this._centralRest = {
                x: fullBox.x,
                y: fullBox.y,
                w: fullBox.w,
                h: fullBox.h,
                fps: fullBox.fps,
                scale: fullBox.scale,
                rotate: fullBox.rotate
            };
            this._settings.setPicture('central', {
                x: 0,
                y: 0,
                w: 1920,
                h: 720,
                fps: fullBox.fps,
                scale: fullBox.scale,
                rotate: fullBox.rotate
            });
        }
        this._saveWindows();
        this._refreshAirBadge();
        return;
    }
    if (name === 'air-badge') {
        this._toggleProtocol('airplay');
        return;
    }
    if (name.indexOf('stream-') === 0) {
        this._onStreamAction(name);
        return;
    }
    if ((screen === 'airplay' || screen === 'air-out' || screen === 'air-box') && name.indexOf('air-') === 0) {
        this._onAirAction(name);
        return;
    }
    if (screen === 'win-devices' && name.indexOf('win-') === 0) {
        this._onWinDevicesAction(name);
        return;
    }
    if (screen === 'windows' && name.indexOf('win-') === 0) {
        this._onWinAction(name);
        return;
    }
    if ((screen === 'rdp' || screen === 'rdp-edit' || screen === 'rdp-out') && name.indexOf('rdp-') === 0) {
        this._onRdpAction(name);
        return;
    }
    if ((screen === 'vnc' || screen === 'vnc-edit') && name.indexOf('vnc-') === 0) {
        this._onVncAction(name);
        return;
    }
    noteStart('ignore-menu ' + screen + ' ' + name);
};

AirPlayApp.prototype._choose = function (name) {
    var self = this;
    if (!PROTOCOLS[name]) {
        noteStart('refuse-protocol ' + name);
        return;
    }
    this._chosen = name;
    noteStart('choose ' + name);
    this._sessions.connect(name, this._endpoint(name)).then(function (result) {
        self._sessionText = result.ok
            ? (name + ' ' + (result.state || 'ok'))
            : (name + ' ' + (result.reason || 'blad'));
        noteStart(result.ok
            ? ('session-ok ' + name + ' ' + (result.state || 'ok'))
            : ('session-fail ' + name + ' ' + (result.reason || 'blad')));
        if (name === 'airplay') {
            self._airStarting = false;
            if (!result.ok && self._menu && typeof self._menu.setScreen === 'function') {
                self._streamProtocol = '';
                self._menu.setScreen('airplay');
            }
        }
        self._tellMenu(result.ok ? (result.state || 'starting') : result.reason);
        self._sync();
    });
};

AirPlayApp.prototype._readAirplayPin = function () {
    var text;
    try {
        text = String(fs.readFileSync(AIRPLAY_PIN_FILE, 'utf8') || '').trim();
    } catch (err) {
        return '';
    }
    if (/^\d{4,6}$/.test(text)) {
        return text;
    }
    return '';
};

AirPlayApp.prototype._readAirplayClient = function () {
    var text;
    var parts;
    try {
        text = String(fs.readFileSync(AIRPLAY_CLIENT_FILE, 'utf8') || '').trim();
    } catch (err) {
        return { state: '', detail: '' };
    }
    parts = text.split('|');
    return {
        state: String(parts[0] || ''),
        detail: String(parts[1] || '')
    };
};

AirPlayApp.prototype._copyBox = function (box) {
    return {
        scale: box.scale,
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        fps: box.fps,
        rotate: box.rotate
    };
};

AirPlayApp.prototype._tuneView = function () {
    var tune = this._tune;
    var box;
    var shown;
    var limitW = 1920;
    var limitH = 720;
    var panel;
    if (!tune) {
        return null;
    }
    box = this._settings.picture(tune.name);
    shown = box;
    if (tune.name === 'hud') {
        limitW = 800;
        limitH = 480;
    }
    if (tune.name === 'cluster') {
        panel = this._desk.airClusterTarget && this._desk.airClusterTarget() === 'panel';
        limitW = panel ? 1920 : 1088;
        limitH = panel ? 720 : 480;
        shown = this._mapBox(box, limitW, limitH);
    }
    return {
        name: tune.name,
        title: this._outputLabel(tune.name),
        tool: tune.tool || '',
        axis: tune.axis === 'y' ? 'y' : 'x',
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        limitW: tune.name === 'cluster' ? 1920 : limitW,
        limitH: tune.name === 'cluster' ? 720 : limitH,
        saved: !!tune.saved,
        shown: {
            x: shown.x,
            y: shown.y,
            w: shown.w,
            h: shown.h,
            limitW: limitW,
            limitH: limitH
        }
    };
};

AirPlayApp.prototype._openTune = function (name, tool) {
    var box;
    var added = false;
    if (this._tune && this._tune.name !== name) {
        var previous = this._tune.name;
        this._settings.setPicture(previous, this._tune.snap);
        if (this._tune.added && this._settings.outputs().indexOf(previous) !== -1) {
            this._settings.toggleOutput(previous);
            if (this._router) {
                this._router.setMode(this._routerMode());
            }
        }
        this._tune = null;
        this._liveApply(previous);
    }
    if (this._tune && this._tune.name === name) {
        if (!tool) {
            if (!this._tune.tool) {
                this._cancelTune();
                return;
            }
            this._tune.tool = '';
            this._tune.saved = false;
            this._refreshAirBadge();
            return;
        }
        this._tune.tool = tool;
        this._tune.axis = 'x';
        this._tune.saved = false;
        this._refreshAirBadge();
        return;
    }
    if (this._settings.outputs().indexOf(name) === -1) {
        this._settings.toggleOutput(name);
        added = true;
        if (this._router) {
            this._router.setMode(this._routerMode());
        }
    }
    box = this._settings.picture(name);
    this._tune = {
        name: name,
        tool: tool || '',
        axis: 'x',
        added: added,
        saved: false,
        snap: this._copyBox(box)
    };
    this._liveApply(name);
};

AirPlayApp.prototype._slideTune = function (delta) {
    var key;
    if (!this._tune || !this._tune.tool) {
        return false;
    }
    if (this._tune.tool === 'pos') {
        key = this._tune.axis === 'y' ? 'y' : 'x';
    } else {
        key = this._tune.tool;
    }
    this._settings.slide(this._tune.name, key, delta);
    this._tune.saved = false;
    this._liveApply(this._tune.name);
    return true;
};

AirPlayApp.prototype._saveTune = function () {
    var box;
    if (!this._tune) {
        return;
    }
    this._saveWindows();
    box = this._settings.picture(this._tune.name);
    this._tune.snap = this._copyBox(box);
    this._tune.added = false;
    this._tune.saved = true;
    this._refreshAirBadge();
};

AirPlayApp.prototype._cancelTune = function () {
    var tune = this._tune;
    var name;
    if (!tune) {
        return;
    }
    name = tune.name;
    this._settings.setPicture(name, tune.snap);
    if (tune.added && this._settings.outputs().indexOf(name) !== -1) {
        this._settings.toggleOutput(name);
        if (this._router) {
            this._router.setMode(this._routerMode());
        }
    }
    this._tune = null;
    this._liveApply(name);
};

AirPlayApp.prototype._liveApply = function (name) {
    if ((name === 'hud' || name === 'cluster') && this._lastFrame) {
        this._faceAt = 0;
        this._placeMirrorFaces(this._lastFrame.i420, this._lastFrame.w, this._lastFrame.h);
    }
    if (this._menuScreen() === 'stream' && this._streamProtocol !== 'airplay') {
        this._paintStreamInfo(this._streamAir || { ok: false, reason: '' }, this._streamReceiver || {});
        return;
    }
    this._refreshAirBadge();
};

AirPlayApp.prototype._refreshAirBadge = function () {
    var live = this._sessionLive('airplay');
    var client = live.on ? this._readAirplayClient() : { state: '', detail: '' };
    var text = '';
    var receiver = { mode: '' };
    var snap;
    var choice;
    var online;
    var status;
    var bad;
    var pin = '';
    var picture = null;
    if (!this._menu || typeof this._menu.setAirState !== 'function') {
        return;
    }
    if (live.on) {
        try {
            text = fs.readFileSync(RECEIVER_STATUS, 'utf8');
        } catch (errBadge) {
            text = '';
        }
        receiver = uplink.readReceiverStatus(text);
        if (this._desk.airplayPin && this._desk.airplayPin()) {
            pin = this._readAirplayPin();
        }
    }
    snap = uplink.readUplink();
    choice = uplink.selectStoreWifi(snap.status, snap.lease);
    online = !!(live.on && (this._decoded || client.state === 'mirroring'));
    bad = false;
    if (!live.on) {
        status = this._airNeedPick ? 'wybierz ekran' : 'offline';
    } else if (online) {
        status = 'sukces';
    } else if (client.state === 'error') {
        status = client.detail ? ('blad ' + String(client.detail).slice(0, 16)) : 'blad lustra';
        bad = true;
    } else if (client.state === 'pair') {
        status = 'iPhone laczy';
    } else if (pin) {
        status = 'kod ' + pin;
    } else if (receiver.mode === 'missing') {
        status = 'brak odbiornika';
        bad = true;
    } else if (receiver.mode === 'mdns-brak') {
        status = 'brak dns';
        bad = true;
    } else if (receiver.mode === 'uxplay-exit') {
        status = 'odbiornik spadl';
        bad = true;
    } else if (!choice.ok) {
        status = 'brak wifi';
        bad = true;
    } else {
        status = 'czekam na iPhone';
    }
    var picked = this._settings.outputs();
    if (live.on && online && picked.indexOf('central') !== -1) {
        picture = this._settings.picture('central');
    }
    this._menu.setAirState({
        on: !!live.on,
        online: online,
        bad: bad,
        status: status,
        screens: [
            { key: 'central', on: picked.indexOf('central') !== -1 },
            { key: 'cluster', on: picked.indexOf('cluster') !== -1 },
            { key: 'hud', on: picked.indexOf('hud') !== -1 }
        ],
        mirrored: online,
        window: picture,
        tune: live.on ? this._tuneView() : null
    });
};

AirPlayApp.prototype._paintStreamInfo = function (air, receiver) {
    var pin;
    var name;
    var net;
    var out;
    var mode;
    var client;
    var mirrored;
    var headline;
    var lines;
    if (!this._menu || this._menuScreen() !== 'stream') {
        return;
    }
    if (typeof this._menu.setStreamInfo !== 'function') {
        return;
    }
    this._streamAir = air || null;
    this._streamReceiver = receiver || null;
    pin = this._streamProtocol === 'airplay' && this._desk.airplayPin && this._desk.airplayPin()
        ? this._readAirplayPin()
        : '';
    name = this._desk.airplayName ? this._desk.airplayName() : 'THEiPlay';
    net = air && air.ok
        ? ((air.ssid ? air.ssid + ' ' : '') + (air.ip || ''))
        : (air && air.reason ? String(air.reason) : 'brak wifi');
    out = this._settings.outputs().map(this._outputLabel.bind(this)).join('+') || 'brak';
    mode = receiver && receiver.mode ? String(receiver.mode) : '';
    client = this._streamProtocol === 'airplay' ? this._readAirplayClient() : { state: '', detail: '' };
    mirrored = !!(this._decoded && this._streamProtocol === 'airplay');
    if (mirrored) {
        headline = 'THEiPlay — lustro';
    } else if (client.state === 'pair') {
        headline = 'THEiPlay — iPhone laczy';
    } else if (client.state === 'error') {
        headline = 'THEiPlay — blad lustra';
    } else if (pin) {
        headline = 'THEiPlay — kod';
    } else {
        headline = 'THEiPlay — czekam';
    }
    lines = [
        'nazwa ' + String(name).slice(0, 28),
        'siec ' + String(net).slice(0, 28),
        'ekran ' + out,
        'ochrona ' + (this._desk.airplayPin && this._desk.airplayPin() ? 'z kodem' : 'bez kodu')
    ];
    if (mode && this._streamProtocol === 'airplay') {
        lines.push('odbiornik ' + mode);
    }
    if (client.state && client.state !== 'idle') {
        lines.push('klient ' + client.state + (client.detail ? (' ' + client.detail) : ''));
    }
    if (pin && !mirrored) {
        lines.push('wpisz kod na iPhonie (parowanie)');
    }
    if (this._paceLine) {
        lines.push(this._paceLine);
    }
    var names = this._settings.outputs();
    var showCentral = names.indexOf('central') !== -1;
    var linked = client.state === 'mirroring' || client.state === 'pair' || client.state === 'connected';
    var waitWin = { x: 480, y: 180, w: 960, h: 360 };
    var screenRow = null;
    if (this._streamProtocol === 'airplay') {
        screenRow = [
            { name: 'stream-central', title: 'Środek', on: names.indexOf('central') !== -1 },
            { name: 'stream-cluster', title: 'Zegary', on: names.indexOf('cluster') !== -1 },
            { name: 'stream-hud', title: 'HUD', on: names.indexOf('hud') !== -1 }
        ];
    }
    // AirPlay Sound: no picture comes; the screen says how to send the sound.
    var soundOnly = this._streamProtocol === 'airplay' && !!(this._desk && this._desk.airplaySound && this._desk.airplaySound());
    this._menu.setStreamInfo({
        pin: mirrored ? '' : pin,
        headline: soundOnly ? 'AirPlay Sound — tylko dźwięk' : headline,
        hint: soundOnly
            ? (pin ? 'wpisz kod na iPhonie' : 'iPhone: Centrum sterowania → AirPlay → ' + ((this._desk && this._desk.airplayName && this._desk.airplayName()) || 'THEiPlay'))
            : mirrored
                ? (showCentral ? 'lustro aktywne' : 'obraz poza srodkiem')
                : (linked ? 'czekam na klatke' : (pin ? 'wpisz kod na iPhonie' : 'połącz iPhone z THEiPlay')),
        mirrored: !soundOnly && showCentral && mirrored,
        spin: !soundOnly && !mirrored,
        lines: lines,
        window: (showCentral || !mirrored) ? (showCentral ? this._settings.picture('central') : waitWin) : null,
        screens: screenRow,
        tune: this._tuneView()
    });
    if (typeof this._menu.setItemHint === 'function') {
        this._menu.setItemHint(
            'stream-end',
            mirrored ? 'koniec lustra' : (pin ? ('kod ' + pin + ' na iPhonie') : 'koniec')
        );
    }
};

AirPlayApp.prototype._tellMenu = function (code) {
    if (!this._menu || typeof this._menu.setStatus !== 'function') {
        return;
    }
    var screen = this._menuScreen();
    var map = STATUS_BY_SCREEN[screen] || ROOT_STATUS_TEXT;
    var pin;
    // Big PIN on car while iPhone asks for the code; hide once mirror frames arrive.
    if ((screen === 'airplay' || screen === 'stream') && code !== 'idle'
            && this._desk.airplayPin && this._desk.airplayPin()) {
        pin = this._readAirplayPin();
        if (pin && !(screen === 'stream' && this._decoded)) {
            this._menu.setStatus('PIN ' + pin);
            return;
        }
    }
    this._menu.setStatus(map[code] || String(code || ''));
};

AirPlayApp.prototype._paintWindowsMenu = function (air) {
    if (!this._menu || this._menuScreen() !== 'windows') {
        return;
    }
    if (typeof this._menu.setItemHint !== 'function') {
        return;
    }
    var live = this._sessionLive('windows');
    var offers;
    var net = air && air.ok
        ? ((air.ssid ? air.ssid + ' ' : '') + (air.ip || ''))
        : (air && air.reason ? String(air.reason) : 'brak wifi');
    var onHint = 'włączony';
    if (live.state === 'running') {
        onHint = 'emisja PC';
    } else if (live.state === 'offer' || this._readWinOffers().length) {
        onHint = 'PC wykryty';
    } else if (live.on) {
        onHint = 'czekaj Win+K';
    }
    this._paintSwitch('win-toggle', live.on, onHint, 'wyłączony');
    offers = this._readWinOffers();
    this._menu.setItemHint(
        'win-devices',
        offers.length ? (String(offers.length) + ' czekajacych') : 'lista po Win+K'
    );
    this._menu.setItemHint('win-info', net.slice(0, 28));
};

AirPlayApp.prototype._queueWindowSave = function () {
    var self = this;
    if (this._windowSave) {
        clearTimeout(this._windowSave);
    }
    this._windowSave = setTimeout(function () {
        self._windowSave = null;
        self._saveWindows();
    }, 400);
};

AirPlayApp.prototype._flushWindowSave = function () {
    if (this._windowSave) {
        clearTimeout(this._windowSave);
        this._windowSave = null;
    }
    this._saveWindows();
};

AirPlayApp.prototype._nudgeMirror = function (name) {
    var face;
    var view;
    var slash;
    if (name !== 'hud' && name !== 'cluster') {
        return;
    }
    if (!this._mirrorFaces || !this._adapter || !this._gaugeFrame()) {
        return;
    }
    face = this._mirrorFaces[name];
    if (!face || !face.layer) {
        return;
    }
    view = this._gaugeView(name);
    if (!view) {
        return;
    }
    try {
        this._adapter.place(face.layer, {
            x: view.x,
            y: view.y,
            w: view.w,
            h: view.h,
            fps: 30
        });
    } catch (err) {
        noteStart('mirror-nudge ' + name);
        return;
    }
    slash = face.key ? face.key.indexOf('/') : -1;
    face.key = face.layer + '@' + view.x + ',' + view.y + ' ' + view.w + 'x' + view.h + (slash === -1 ? '' : face.key.slice(slash));
};

AirPlayApp.prototype._gaugeFrame = function () {
    // YouTube and AirPlay never run together; the faces show whichever is live.
    if (this._ytGaugeFrame && !(this._sessions && this._sessions.active() === 'airplay')) {
        return this._ytGaugeFrame;
    }
    return this._lastFrame || null;
};

AirPlayApp.prototype._gaugeView = function (name) {
    var panel = this._desk.airClusterTarget && this._desk.airClusterTarget() === 'panel';
    var maxW = name === 'hud' ? 800 : (panel ? 1920 : 1088);
    var maxH = name === 'hud' ? 480 : (panel ? 720 : 480);
    var source = this._gaugeFrame();
    var turned;
    var legal;
    var box;
    if (!source) {
        return null;
    }
    turned = null;
    legal = this._kombiDims(source.w, source.h, name);
    if (name === 'cluster') {
        box = this._mapBox(this._settings.picture('cluster'), maxW, maxH);
    } else {
        box = this._settings.picture(name);
    }
    return frameFit.containPlace(legal.w, legal.h, box, maxW, maxH);
};

AirPlayApp.prototype._mirrorSharedWindow = function () {
    var src = this._settings.picture('central');
    var hud = this._mapBox(src, 800, 480);
    this._settings.setPicture('cluster', {
        x: src.x,
        y: src.y,
        w: src.w,
        h: src.h,
        fps: src.fps,
        scale: src.scale,
        rotate: src.rotate
    });
    this._settings.setPicture('hud', {
        x: hud.x,
        y: hud.y,
        w: hud.w,
        h: hud.h,
        fps: src.fps,
        scale: src.scale,
        rotate: src.rotate
    });
};

AirPlayApp.prototype._screenFrame = function (name) {
    var panel = this._desk.airClusterTarget && this._desk.airClusterTarget() === 'panel';
    var limit = { w: 1920, h: 720, label: 'Środek' };
    var box;
    var shown;
    if (name === 'hud') {
        limit = { w: 800, h: 480, label: 'HUD' };
    } else if (name === 'cluster') {
        limit = panel ? { w: 1920, h: 720, label: 'Zegary' } : { w: 1088, h: 480, label: 'Zegary' };
    }
    box = this._settings.picture(name);
    shown = name === 'cluster' ? this._mapBox(box, limit.w, limit.h) : box;
    return {
        label: limit.label,
        limitW: limit.w,
        limitH: limit.h,
        x: shown.x | 0,
        y: shown.y | 0,
        w: shown.w | 0,
        h: shown.h | 0,
        focus: this._posFocus === name || this._posFocus === 'shared'
    };
};

AirPlayApp.prototype._fillPositionPreview = function (withSliders) {
    var name;
    var box;
    var designW;
    var designH;
    var xMax;
    var yMax;
    var sel;
    var preview;
    if (!this._menu || typeof this._menu.setBoxPreview !== 'function') {
        return;
    }
    if (this._menuScreen() !== 'pos-out' && this._menuScreen() !== 'pos-box') {
        return;
    }
    if (this._posMode === 'each' && this._posFocus && this._posFocus !== 'shared') {
        preview = { frames: [this._screenFrame(this._posFocus)], sliders: [] };
    } else {
        preview = {
            frames: [
                this._screenFrame('central'),
                this._screenFrame('cluster'),
                this._screenFrame('hud')
            ],
            sliders: []
        };
    }
    if (withSliders && (this._menuScreen() === 'pos-out' || this._menuScreen() === 'pos-box')) {
        name = this._posFocus === 'shared' ? 'central' : (this._posFocus || 'central');
        box = this._settings.picture(name);
        designW = name === 'hud' ? 800 : 1920;
        designH = name === 'hud' ? 480 : 720;
        xMax = Math.max(0, designW - box.w);
        yMax = Math.max(0, designH - box.h);
        sel = this._menu.selectedName ? this._menu.selectedName() : '';
        preview.sliders = [
            { key: 'pos-x', label: 'Poziomo', value: box.x, min: 0, max: xMax, on: sel === 'pos-x' },
            { key: 'pos-y', label: 'Pionowo', value: box.y, min: 0, max: yMax, on: sel === 'pos-y' },
            { key: 'pos-size', label: 'Rozciągnięcie', value: box.w, min: 160, max: designW, on: sel === 'pos-size' }
        ];
    }
    this._menu.setBoxPreview(preview);
};

AirPlayApp.prototype._showPositionList = function () {
    var mode = this._posMode === 'each' ? 'each' : 'shared';
    var screen = this._posScreen === 'cluster' || this._posScreen === 'hud' ? this._posScreen : 'central';
    this._posMode = mode;
    this._posScreen = screen;
    this._posFocus = mode === 'each' ? screen : 'shared';
    if (!this._menu) {
        return;
    }
    if (this._menuScreen() !== 'pos-out' && typeof this._menu.setScreen === 'function') {
        this._menu.setScreen('pos-out');
    }
    if (typeof this._menu.setItems === 'function') {
        this._menu.setItems(menuDraw.positionPage(mode, screen), 'Pozycja');
    }
    this._paintPosition();
};

AirPlayApp.prototype._openPosition = function (name) {
    this._posMode = 'each';
    this._posScreen = name;
    this._posFocus = name;
    this._showPositionList();
};

AirPlayApp.prototype._paintPosition = function () {
    var name = this._posFocus === 'shared' ? 'central' : (this._posFocus || 'central');
    var box;
    var shown;
    if (!this._menu || (this._menuScreen() !== 'pos-out' && this._menuScreen() !== 'pos-box')) {
        return;
    }
    box = this._settings.picture(name);
    shown = this._screenFrame(name);
    this._menu.setItemHint('pos-x', String(box.x), true);
    this._menu.setItemHint('pos-y', String(box.y), true);
    this._menu.setItemHint('pos-size', 'rozciągnięcie ' + box.w + 'x' + box.h, true);
    this._menu.setItemHint('pos-center', shown.x + ',' + shown.y, true);
    this._fillPositionPreview(true);
    if (name === 'central' && typeof this._menu.setAirWindow === 'function') {
        this._menu.setAirWindow(box);
    }
};

AirPlayApp.prototype._openScreenOptions = function (name) {
    var titles = { central: 'Środek', cluster: 'Zegary', hud: 'HUD' };
    this._boxFocus = name;
    if (this._menu && typeof this._menu.setScreen === 'function') {
        this._menu.setScreen('air-box');
    }
    if (this._menu && typeof this._menu.setItems === 'function') {
        this._menu.setItems(menuDraw.screenOptions(name), titles[name] || 'Opcje');
    }
    this._paintAirBox();
};

AirPlayApp.prototype._paintAirOut = function () {
    var names;
    var area;
    var self = this;
    if (!this._menu || this._menuScreen() !== 'air-out') {
        return;
    }
    names = this._settings.outputs();
    area = this._desk.airClusterTarget && this._desk.airClusterTarget() === 'panel' ? 'panel' : 'map';
    ['central', 'hud', 'cluster'].forEach(function (name) {
        var on = names.indexOf(name) !== -1;
        var hint = on ? 'włączony' : 'wyłączony';
        if (name === 'cluster') {
            hint += area === 'panel' ? ', panel: całe zegary' : ', mapa: kieszeń';
        }
        self._menu.setItemHint('air-out-' + name, hint);
    });
};

AirPlayApp.prototype._paintAirBox = function () {
    var name = this._boxFocus || 'central';
    if (!this._menu || this._menuScreen() !== 'air-box') {
        return;
    }
    var on = this._settings.outputs().indexOf(name) !== -1;
    var panelOn = this._desk.airClusterTarget && this._desk.airClusterTarget() === 'panel';
    this._menu.setItemHint('air-box-power', on ? 'włączony na Start' : 'wyłączony', true);
    if (name === 'cluster') {
        this._menu.setItemTitle('air-box-place', 'Gdzie rysować', true);
        this._menu.setItemHint(
            'air-box-place',
            panelOn ? 'Panel: całe zegary, zasłania BC' : 'Mapa: kieszeń, wskazówki zostają',
            true
        );
    }
    if (name === 'central' && typeof this._menu.setAirWindow === 'function') {
        this._menu.setAirWindow(this._settings.picture(name));
    }
};

AirPlayApp.prototype._paintAirMenu = function (air, receiver) {
    if (!this._menu || this._menuScreen() !== 'airplay') {
        return;
    }
    if (typeof this._menu.setItemHint !== 'function') {
        return;
    }
    var name = this._desk.airplayName();
    var live = this._sessionLive('airplay');
    var mode = live.on && receiver && receiver.mode ? receiver.mode : 'idle';
    var wantPin = !!(this._desk.airplayPin && this._desk.airplayPin());
    var pin = wantPin ? this._readAirplayPin() : '';
    var onHint = 'włączony';
    if (pin) {
        onHint = 'PIN ' + pin;
    } else if (mode === 'running') {
        onHint = wantPin ? 'lustro / czekaj iPhone' : 'bez kodu / czekaj iPhone';
    } else if (live.on) {
        onHint = wantPin ? 'czekaj na iPhone' : 'bez kodu';
    }
    if (typeof this._menu.setItemTitle === 'function') {
        this._menu.setItemTitle('air-toggle', live.on ? 'Zakończ' : 'Start');
        this._menu.setItemIcon('air-toggle', live.on ? 'stop' : 'play');
    }
    this._menu.setItemHint('air-toggle', live.on ? onHint : 'włącz lustro');
    this._paintAirPinSwitch();
    this._menu.setItemHint(
        'air-screen',
        this._settings.outputs().map(this._outputLabel.bind(this)).join(' + ') || 'żaden'
    );
    this._menu.setItemHint('air-name', name);
    if (typeof this._menu.setItemTitle === 'function') {
        this._menu.setItemTitle('air-quality', 'Jakość obrazu');
    }
    this._menu.setItemHint('air-quality', this._qualityHint());
};

AirPlayApp.prototype._paintRdpMenu = function () {
    var screen = this._menuScreen();
    if (!this._menu || (screen !== 'rdp' && screen !== 'rdp-edit' && screen !== 'rdp-out')) {
        return;
    }
    if (typeof this._menu.setItemHint !== 'function') {
        return;
    }
    var host = this._desk.host('rdp');
    var session = this._sessionLive('rdp');
    var active = session.on;
    var live = active ? this._sessions.getStatus() : { state: 'idle' };
    var secretKind = this._desk.secretKind('rdp');
    var user = host.user || 'brak';
    var pass = this._store.hasSecret(secretKind) || this._store.hasSecret('rdp')
        ? 'zapisane'
        : 'wpisz pokretlem';
    var cert = '';
    var outHint = this._rdpOutput === 'cluster' ? 'zegary' : (this._rdpOutput === 'hud' ? 'HUD' : 'srodek');
    if (live.state === 'cert' && live.detail) {
        cert = String(live.detail).slice(0, 18);
    } else if (host.cert) {
        cert = 'OK ' + String(host.cert).slice(0, 14);
    } else {
        cert = 'brak odcisku';
    }
    if (screen === 'rdp-out') {
        this._menu.setItemHint('rdp-out-central', 'ekran centralny');
        this._menu.setItemHint('rdp-out-cluster', 'cluster panel');
        this._menu.setItemHint('rdp-out-hud', 'HUD');
        return;
    }
    if (screen === 'rdp') {
        this._menu.setItemHint('rdp-connect', active ? ('na ' + outHint) : 'wybierz ekran');
        this._menu.setItemHint('rdp-cut', active ? 'Rozlacz teraz' : 'Sesja off');
        this._menu.setItemHint('rdp-edit', (host.label || host.id) + ' ' + this._desk.formatHostIp('rdp'));
        this._menu.setItemHint('rdp-cert', cert);
        this._menu.setItemHint('rdp-panel', this._panelUrl().replace('http://', '').slice(0, 28));
        return;
    }
    this._menu.setItemHint('rdp-e-label', host.label || host.id);
    this._menu.setItemHint('rdp-e-ip', this._desk.formatHostIp('rdp'));
    this._menu.setItemHint('rdp-e-port', String(host.port));
    this._menu.setItemHint('rdp-e-user', user.slice(0, 24));
    this._menu.setItemHint('rdp-e-pass', pass);
};

AirPlayApp.prototype._paintVncMenu = function () {
    var screen = this._menuScreen();
    if (!this._menu || (screen !== 'vnc' && screen !== 'vnc-edit')) {
        return;
    }
    if (typeof this._menu.setItemHint !== 'function') {
        return;
    }
    var host = this._desk.host('vnc');
    var session = this._sessionLive('vnc');
    var active = session.on;
    var live = active ? this._sessions.getStatus() : { state: 'idle' };
    var onHint = 'odbiornik WL';
    if (live.state === 'connected' || live.state === 'running') {
        onHint = 'ekran z PC';
    } else if (session.on) {
        onHint = 'lacze do PC';
    }
    if (screen === 'vnc') {
        this._paintSwitch('vnc-toggle', session.on, onHint, 'wylaczony');
        this._menu.setItemHint('vnc-connect', live.state === 'connected' || live.state === 'running' ? 'ekran z PC' : 'Polacz teraz');
        this._menu.setItemHint('vnc-cut', active ? 'Rozlacz teraz' : 'Sesja off');
        this._menu.setItemHint('vnc-edit', (host.label || host.id) + ' ' + this._desk.formatHostIp('vnc'));
        return;
    }
    this._menu.setItemHint('vnc-e-label', host.label || host.id);
    this._menu.setItemHint('vnc-e-ip', this._desk.formatHostIp('vnc'));
    this._menu.setItemHint('vnc-e-port', String(host.port));
};

AirPlayApp.prototype._bindTile = function (name, protocol) {
    var self = this;
    this._action(this._rows[name], function (kind) {
        if (kind === 'Increase' || kind === 'Decrease') {
            self._input.knobScroll(kind === 'Increase' ? 1 : -1);
            return;
        }
        if (kind === 'Abort') {
            var screen = self._menuScreen();
            if (self._menu && typeof self._menu.editing === 'function' && self._menu.editing()) {
                self._menu.cancelEdit();
                self._sync();
                return;
            }
            if (screen === 'airplay') {
                self._onAirAction('air-back');
                return;
            }
            if (screen === 'windows') {
                self._onWinAction('win-back');
                return;
            }
            if (screen === 'win-devices') {
                self._onWinDevicesAction('win-d-back');
                return;
            }
            if (screen === 'rdp-out') {
                self._onRdpAction('rdp-out-back');
                return;
            }
            if (screen === 'rdp-edit') {
                self._onRdpAction('rdp-e-back');
                return;
            }
            if (screen === 'rdp') {
                self._onRdpAction('rdp-back');
                return;
            }
            if (screen === 'vnc-edit') {
                self._onVncAction('vnc-e-back');
                return;
            }
            if (screen === 'vnc') {
                self._onVncAction('vnc-back');
                return;
            }
            self._sessions.disconnect();
            self._sessionText = 'powrot';
            self._sync();
            return;
        }
        self._onMenuChoice(protocol);
    });
};

AirPlayApp.prototype._watchSignal = function (interfaceName, attribute, handler) {
    if (!this.signals || typeof this.signals.watch !== 'function') {
        return;
    }
    var watched = {};
    watched[attribute] = handler;
    try {
        this.signals.watch(interfaceName, '1', watched);
    } catch (err) {
        logger.info('signal ' + attribute + ' unavailable');
    }
};

AirPlayApp.prototype._watchCar = function () {
    var self = this;
    this._watchSignal('de.bmw.infotainment.vehicle.Vehicle2', 'statusCarSpeed2', function (value) {
        var raw = value && value.speedVehicleCentreOfGravity;
        if (typeof raw === 'number') {
            self._display.vehicle(raw);
            self._sessions.onVehicle();
            if (self._router) {
                self._router.setParked(self._parkFlag());
            }
        }
    });
    this._watchSignal('de.bmw.infotainment.controlelements.FrontCCU', 'statusRotaryEncoderState', function (value) {
        self._input.feedEncoder(value || {});
    });
    this._watchSignal('de.bmw.infotainment.ControllerElements', 'ZBETouchFrontSide', function (value) {
        self._input.feedPad(value || {});
    });
};

AirPlayApp.prototype._entryPointList = function () {
    var raw;
    var list;
    var keys;
    var i;
    try {
        raw = this.getEntryPoints();
    } catch (err) {
        return [];
    }
    if (Array.isArray(raw)) {
        return raw;
    }
    if (raw && typeof raw.length === 'number') {
        try {
            return Array.prototype.slice.call(raw);
        } catch (errSlice) {
            list = [];
            for (i = 0; i < raw.length; i += 1) {
                if (raw[i]) {
                    list.push(raw[i]);
                }
            }
            return list;
        }
    }
    if (raw && typeof raw.forEach === 'function') {
        list = [];
        raw.forEach(function (ep) { list.push(ep); });
        return list;
    }
    if (raw && typeof raw === 'object') {
        keys = Object.keys(raw);
        list = [];
        for (i = 0; i < keys.length; i += 1) {
            if (raw[keys[i]] && typeof raw[keys[i]].getDescription === 'function') {
                list.push(raw[keys[i]]);
            }
        }
        return list;
    }
    return [];
};

AirPlayApp.prototype._registerEntryPoints = function () {
    var self = this;
    var descriptions = (this.appDescription && this.appDescription.application.entryPoints) || [];
    var points = this._entryPointList();
    var ours = null;
    var i;
    for (i = 0; i < points.length; i += 1) {
        if (points[i] && typeof points[i].getDescription === 'function' &&
                descriptions.some(function (item) {
                    return item.uuid === points[i].getDescription().uuid;
                })) {
            ours = points[i];
            break;
        }
    }
    if (!ours && points.length === 1 && points[0] && typeof points[0].getDescription === 'function') {
        ours = points[0];
    }
    if (!ours) {
        return Promise.reject(new Error('no entry point handed over by the manager'));
    }
    var description = ours.getDescription();
    return ours.init()
        .then(function () { return ours.setAvailability('ENABLED'); })
        .then(function () {
            logger.info('entry point ' + description.name + ' ENABLED');
            if (!self._state || !self.rhmiApplication) {
                return null;
            }
            return self.rhmiApplication.mapEntryState(description.uuid, self._state);
        });
};

AirPlayApp.prototype._onEntryPointExecute = function (uuid) {
    if (uuid) {
        this._entryUuid = uuid;
    }
    noteStart('entry');
    if (this._shutdownPromise || !this.rhmiApplication || !uuid) {
        noteStart('entry-skip');
        return Promise.resolve();
    }
    this._visible = true;
    this._showMenu();
    return this._openPage();
};

AirPlayApp.prototype._write = function (name, text) {
    if (this._line[name] === text || !this._rows[name]) {
        return;
    }
    this._line[name] = text;
    Promise.resolve(this._rows[name].setValue(0, 'Text', text, 'Text')).catch(function (err) {
        logger.warn(name + ' render failed: ' + (err && err.message));
    });
};

AirPlayApp.prototype._paint = function (choice) {
    var screen = this._menuScreen();
    if (!choice.ok) {
        this._write('airNet', 'Wi-Fi Store: brak połączenia');
        this._write('airAddr', 'Wlacz hotspot iPhone i dolacz MGU Store do tej sieci');
        this._write('airState', choice.reason || 'brak-wifi');
        return;
    }
    this._write('airNet', choice.ssid ? ('Wi-Fi: ' + choice.ssid) : ('Interfejs: ' + choice.iface));
    if (screen === 'airplay') {
        this._write('airAddr', 'AirPlay ' + this._desk.airplayName() + ' ' + choice.ip);
        return;
    }
    if (screen === 'windows' || screen === 'win-devices') {
        this._write('airAddr', 'Miracast ' + this._desk.airplayName() + ' ' + choice.ip);
        return;
    }
    if (screen === 'rdp') {
        var rdp = this._desk.host('rdp');
        this._write('airAddr', 'RDP ' + rdp.octets.join('.') + ':' + rdp.port + ' ' + (rdp.user || '-'));
        return;
    }
    if (screen === 'vnc') {
        var vnc = this._desk.host('vnc');
        this._write('airAddr', 'VNC ' + vnc.octets.join('.') + ':' + vnc.port);
        return;
    }
    this._write('airAddr', 'menu ' + choice.ip);
};

AirPlayApp.prototype._watchNetwork = function () {
    var self = this;
    var tick = function () {
        self._sync();
        self._refreshAirBadge();
    };
    tick();
    // 1s: AirPlay/Miracast switches and Win+K auto-accept need a short loop.
    this._timer = setInterval(tick, 1000);
    if (this._timer.unref) {
        this._timer.unref();
    }
};

AirPlayApp.prototype._sync = function () {
    var snap = uplink.readUplink();
    var choice = uplink.selectStoreWifi(snap.status, snap.lease);
    var screen = this._menuScreen();
    var text = '';
    var receiver;
    var airLive;
    var air;
    var clientLive;
    var rdpLive;
    var vncLive;
    var winLive;
    var hostCheck;

    if (this._sessions.active()) {
        var live = this._sessions.getStatus();
        this._sessionText = live.protocol + ' ' + (live.state || '') + (live.detail ? (' ' + live.detail) : '');
    }
    this._sessions.onVehicle();

    // Miracast: accept as soon as a PC appears, even off the Miracast screen.
    if (this._sessions.active() === 'windows') {
        winLive = this._sessions.getStatus() || {};
        if (winLive.state === 'running' && screen !== 'stream') {
            this._winAutoAccepting = false;
            this._enterStream('windows');
            return;
        }
        this._maybeAutoAcceptWin();
    }

    if (screen === 'stream' && this._streamProtocol === 'airplay') {
        if (this._menu && typeof this._menu.setScreen === 'function') {
            this._menu.setScreen('airplay');
        }
        screen = 'airplay';
    }

    if (screen === 'stream') {
        air = choice.ok
            ? { ok: true, ip: choice.ip, ssid: choice.ssid, iface: choice.iface, reason: '' }
            : choice;
        this._paint(air);
        if (this._streamProtocol === 'airplay' && (this._sessions.active() === 'airplay' || this._airStarting)) {
            try {
                text = fs.readFileSync(RECEIVER_STATUS, 'utf8');
            } catch (errAir) {
                text = '';
            }
            receiver = uplink.readReceiverStatus(text);
            this._takeFrame();
            if (this._router && (!this._statAt || Date.now() - this._statAt > 5000)) {
                var pace = this._router.stats(Date.now());
                noteStart(
                    'fps dec ' + pace.decodedFps +
                    ' c ' + pace.centralFps +
                    ' k ' + pace.clusterFps +
                    ' drop ' + pace.dropped +
                    ' lat ' + pace.latencyMs
                );
                this._statAt = Date.now();
                this._paceLine = 'fps ' + pace.decodedFps + '/' + pace.centralFps + '/' + pace.clusterFps
                    + ' drop ' + pace.dropped;
            }
            this._paintStreamInfo(air, receiver);
            clientLive = this._readAirplayClient();
            if (clientLive.state === 'mirroring' || this._decoded) {
                this._tellMenu('running');
            } else if (this._readAirplayPin()) {
                this._tellMenu('pin-wait');
            } else if (receiver.mode === 'missing' || receiver.mode === 'mdns-brak' || receiver.mode === 'uxplay-exit') {
                this._tellMenu(receiver.mode);
            } else {
                this._tellMenu('waiting');
            }
            return;
        }
        if (this._streamProtocol === 'windows' && this._sessions.active() === 'windows') {
            if ((this._sessions.getStatus().state) === 'running') {
                this._paintStreamInfo(air, {});
                this._tellMenu('running');
                return;
            }
            this._endStream('windows');
            return;
        }
        this._endStream(this._streamProtocol || 'airplay');
        return;
    }

    if (screen === 'air-out' || screen === 'air-box') {
        air = choice.ok
            ? { ok: true, ip: choice.ip, ssid: choice.ssid, iface: choice.iface, reason: '' }
            : choice;
        this._paint(air);
        if (screen === 'air-box') {
            this._paintAirBox();
        } else {
            this._paintAirOut();
        }
        this._tellMenu('pick-out');
        return;
    }

    if (screen === 'airplay') {
        try {
            text = fs.readFileSync(RECEIVER_STATUS, 'utf8');
        } catch (err) {
            text = '';
        }
        receiver = uplink.readReceiverStatus(text);
        airLive = this._sessions.active() === 'airplay';
        // Stale mdns status is ignored until toggle starts an AirPlay session.
        air = choice.ok
            ? { ok: true, ip: choice.ip, ssid: choice.ssid, iface: choice.iface, reason: '' }
            : choice;
        if (airLive) {
            air = uplink.selectAirplayAnnounce(receiver, choice);
            this._takeFrame();
        }
        this._paint(air);
        this._paintAirMenu(air, airLive ? receiver : { mode: 'idle' });
        if (airLive) {
            if (receiver.mode === 'missing' || receiver.mode === 'mdns-brak' || receiver.mode === 'uxplay-exit') {
                this._tellMenu(receiver.mode);
            } else {
                this._tellMenu(air.ok ? 'starting' : (air.reason || 'starting'));
            }
        } else {
            this._tellMenu(choice.ok
                ? (((choice.ssid ? choice.ssid + ' ' : '') + (choice.ip || '')).trim() || 'waiting')
                : (choice.reason || 'brak-wifi'));
        }
        return;
    }

    if (screen === 'win-devices') {
        air = choice.ok
            ? { ok: true, ip: choice.ip, ssid: choice.ssid, iface: choice.iface, reason: '' }
            : choice;
        this._paint(air);
        this._rebuildWinDevicesMenu();
        if (this._sessions.active() === 'windows' && (this._sessions.getStatus().state) === 'running') {
            this._enterStream('windows');
            return;
        }
        this._tellMenu(this._readWinOffers().length ? 'offer' : 'no-offers');
        return;
    }

    if (screen === 'windows') {
        air = choice.ok
            ? { ok: true, ip: choice.ip, ssid: choice.ssid, iface: choice.iface, reason: '' }
            : choice;
        if (this._sessions.active() === 'windows' && (this._sessions.getStatus().state) === 'running') {
            this._winAutoAccepting = false;
            this._enterStream('windows');
            return;
        }
        if (this._sessions.active() === 'windows') {
            this._maybeAutoAcceptWin();
        }
        this._paint(air);
        this._paintWindowsMenu(air);
        if (!choice.ok) {
            this._tellMenu(choice.reason || 'brak-wifi');
            return;
        }
        if (this._sessions.active() === 'windows') {
            winLive = this._sessions.getStatus();
            if (winLive.state === 'offer' || this._readWinOffers().length) {
                this._tellMenu('offer');
                return;
            }
            this._tellMenu(winLive.state || 'starting');
            return;
        }
        this._tellMenu(this._readWinOffers().length ? 'offer' : 'waiting');
        return;
    }

    if (screen === 'rdp' || screen === 'rdp-edit' || screen === 'rdp-out') {
        this._paint(choice);
        this._paintRdpMenu();
        if (this._sessions.active() === 'rdp') {
            rdpLive = this._sessions.getStatus();
            if (rdpLive.state === 'connected' || rdpLive.state === 'running') {
                this._enterStream('rdp');
                return;
            }
            if (rdpLive.state === 'cert') {
                if (screen === 'rdp-out' && typeof this._menu.setScreen === 'function') {
                    this._menu.setScreen('rdp');
                    this._rebuildProtocolMenu('rdp');
                }
                this._tellMenu('cert');
                return;
            }
            if (rdpLive.state === 'error') {
                this._tellMenu(rdpLive.detail || 'error');
                return;
            }
            this._tellMenu(rdpLive.state === 'connecting' ? 'starting' : (rdpLive.state || 'starting'));
            return;
        }
        if (screen === 'rdp-out') {
            this._tellMenu('pick-out');
            return;
        }
        if (screen === 'rdp-edit') {
            this._tellMenu('waiting');
            return;
        }
        if (!choice.ok) {
            this._tellMenu(choice.reason || 'brak-wifi');
            return;
        }
        hostCheck = this._desk.host('rdp');
        this._tellMenu(hostCheck.octets.join('.') === '0.0.0.0' ? 'no-host' : 'waiting');
        return;
    }

    if (screen === 'vnc' || screen === 'vnc-edit') {
        this._paint(choice);
        this._paintVncMenu();
        if (screen === 'vnc-edit') {
            this._tellMenu('waiting');
            return;
        }
        if (!choice.ok) {
            this._tellMenu(choice.reason || 'brak-wifi');
            return;
        }
        if (this._sessions.active() === 'vnc') {
            vncLive = this._sessions.getStatus();
            this._tellMenu(vncLive.state || 'starting');
            return;
        }
        hostCheck = this._desk.host('vnc');
        this._tellMenu(hostCheck.octets.join('.') === '0.0.0.0' ? 'no-host' : 'waiting');
        return;
    }

    if (screen === 'label') {
        this._paintLabel();
        this._tellMenu('napis');
        return;
    }

    this._paint(choice);
    if (this._menu && typeof this._menu.setItemHint === 'function') {
        this._menu.setItemHint('label-toggle', this._desk.clusterLabel() ? this._desk.labelText() : 'ukryty');
    }
    this._tellMenu(choice.ok ? 'waiting' : (choice.reason || 'brak-wifi'));
};

AirPlayApp.prototype._dropMirror = function () {
    this._decoded = null;
    this._mirrorPainted = false;
    if (this._mirrorVideo) {
        try {
            this._mirrorVideo.close();
        } catch (err) {
            noteStart('mirror-close ' + (err && err.message));
        }
        this._mirrorVideo = null;
    }
    try {
        fs.unlinkSync('/dev/shm/mgu-video-g21airplay');
    } catch (err) {
        /* already gone */
    }
    this._dropMirrorFaces();
    this._dropClusterMirror('stop');
};

AirPlayApp.prototype._dropMirrorFace = function (name) {
    var face;
    if (!this._mirrorFaces) {
        return;
    }
    face = this._mirrorFaces[name];
    if (!face) {
        return;
    }
    if (face.ref) {
        try {
            this._client.drop(face.ref);
        } catch (err) {
            noteStart('mirror-face-drop ' + name);
        }
    }
    if (face.layer && this._adapter) {
        this._adapter.destroyLayer(face.layer);
    }
    delete this._mirrorFaces[name];
};

AirPlayApp.prototype._dropMirrorFaces = function () {
    var self = this;
    if (!this._mirrorFaces) {
        return;
    }
    Object.keys(this._mirrorFaces).forEach(function (name) {
        self._dropMirrorFace(name);
    });
};

AirPlayApp.prototype._armFace = function (delay) {
    var self = this;
    if (this._faceWait || !this._lastFrame) {
        return;
    }
    this._faceWait = setTimeout(function () {
        self._faceWait = null;
        if (!self._lastFrame || self._streamProtocol !== 'airplay') {
            return;
        }
        self._placeMirrorFaces(self._lastFrame.i420, self._lastFrame.w, self._lastFrame.h);
    }, delay > 0 ? delay : 1);
};

AirPlayApp.prototype._placeMirrorFaces = function (i420, sw, sh, outsOverride) {
    var self = this;
    var outs = outsOverride || this._settings.outputs();
    var panel = this._desk.airClusterTarget && this._desk.airClusterTarget() === 'panel';
    var faces = {};
    var now = Date.now();
    if (outs.indexOf('hud') !== -1) {
        faces.hud = { layer: 'hud', maxW: 800, maxH: 480, contend: 0 };
    }
    if (outs.indexOf('cluster') !== -1) {
        faces.cluster = {
            layer: panel ? 'cluster' : 'map',
            maxW: panel ? 1920 : 1088,
            maxH: panel ? 720 : 480,
            contend: panel ? 1 : 0
        };
    }
    if (!this._mirrorFaces) {
        this._mirrorFaces = {};
    }
    if (outs.indexOf('hud') === -1) {
        this._dropMirrorFace('hud');
    }
    if (outs.indexOf('cluster') === -1) {
        this._dropMirrorFace('cluster');
    }
    if (this._faceAt && (now - this._faceAt) < 30) {
        this._armFace(30 - (now - this._faceAt));
        return false;
    }
    if (this._faceWait) {
        clearTimeout(this._faceWait);
        this._faceWait = null;
    }
    this._faceAt = now;
    if (!Object.keys(faces).length) {
        return true;
    }
    // KOMBI profile: the decoded frame is scaled once to the cluster/HUD size
    // (aspect kept, never the centre-screen size) and turned per screen. The
    // window drawn on the cluster or HUD can be any size; the renderer
    // stretches this frame into it on the GPU.
    var kq = this._quality('kombi');
    var kombiBase = null;
    var kombiTurned = {};
    function kombiFrame(name) {
        var box = self._settings.picture(name);
        var quarters = ((box && box.rotate) || 0) / 90;
        if (!kombiTurned[quarters]) {
            if (!kombiBase) {
                kombiBase = frameFit.scaleToProfile(i420, sw, sh, kq.w, kq.h);
            }
            kombiTurned[quarters] = frameFit.rotateI420(kombiBase.i420, kombiBase.w, kombiBase.h, quarters);
        }
        return kombiTurned[quarters];
    }
    Object.keys(faces).forEach(function (name) {
        var spec = faces[name];
        var box;
        var turned;
        var legal;
        var view;
        var key;
        var face;
        var made;
        var src;
        var sent;
        if (!self._client.ready) {
            return;
        }
        turned = null;
        legal = kombiFrame(name);
        if (!legal || legal.w > 1920 || legal.h > 720 || (legal.w % 4) !== 0 || (legal.h % 2) !== 0) {
            return;
        }
        if (name === 'cluster') {
            box = self._mapBox(self._settings.picture('cluster'), spec.maxW, spec.maxH);
        } else {
            box = self._settings.picture(name);
        }
        view = frameFit.containPlace(legal.w, legal.h, box, spec.maxW, spec.maxH);
        key = spec.layer + '@' + view.x + ',' + view.y + ' ' + view.w + 'x' + view.h + '/' + legal.w + 'x' + legal.h;
        face = self._mirrorFaces[name];
        if (!face || face.key !== key) {
            self._dropMirrorFace(name);
            made = self._adapter.createLayer(spec.layer, {
                x: view.x,
                y: view.y,
                w: view.w,
                h: view.h,
                vw: legal.w,
                vh: legal.h,
                fps: 30,
                level_bits: 0,
                dirty_threshold: 0,
                pan_blocks: 0,
                stall_ms: 600000,
                klass: 'overlay',
                z: 40,
                contend: spec.contend
            });
            if (!made.ok) {
                noteStart('mirror-face-refused ' + name + ' ' + made.reason);
                return;
            }
            face = {
                key: key,
                layer: spec.layer,
                vw: made.w,
                vh: made.h,
                atlas: null,
                fail: ''
            };
            self._mirrorFaces[name] = face;
            noteStart('mirror-face ' + name + ' ' + sw + 'x' + sh + ' frame ' + legal.w + 'x' + legal.h + ' (kombi ' + kq.w + 'x' + kq.h + ') -> ' + view.w + 'x' + view.h);
        }
        src = legal;
        if (face.vw !== legal.w || face.vh !== legal.h) {
            src = frameFit.fitI420(legal.i420, legal.w, legal.h, face.vw, face.vh, 'contain');
        }
        face.atlas = videoDecoder.i420IntoAtlas(src.i420, src.w, src.h, face.atlas);
        sent = self._adapter.updateFrame(face.layer, face.atlas);
        if (!sent.ok && face.fail !== sent.reason) {
            face.fail = sent.reason;
            noteStart('mirror-frame ' + name + ' ' + sent.reason);
        } else if (sent.ok) {
            face.fail = '';
        }
    });
    return true;
};

AirPlayApp.prototype._mapBox = function (box, limitW, limitH) {
    // Window boxes for the cluster (and the shared window) are kept in the
    // 1920x720 design space of the centre screen. The target can be the map
    // pocket (1088x480), the whole panel (1920x720) or the HUD (800x480).
    // Corners and centre stay where they were set; the size keeps its shape.
    return frameFit.projectBox(box, 1920, 720, limitW, limitH);
};

AirPlayApp.prototype._presentCluster = function (frame) {
    var experimental = this._desk.airClusterTarget && this._desk.airClusterTarget() === 'panel';
    var name = experimental ? 'cluster' : 'map';
    var limitW = experimental ? 1920 : 1088;
    var limitH = experimental ? 720 : 480;
    var box = this._settings.picture('cluster');
    var placed = this._mapBox(box, limitW, limitH);
    var turned = this._turnedFrame(frame, 'cluster');
    var srcW = turned.w;
    var srcH = turned.h;
    var buf = turned.i420;
    var made;
    var sent;
    var direct = srcW >= 16 && srcH >= 2 && srcW <= 1920 && srcH <= 720 && (srcW % 4) === 0 && (srcH % 2) === 0;
    if (!direct) {
        buf = frameFit.fitI420(turned.i420, turned.w, turned.h, placed.w, placed.h, 'contain').i420;
        srcW = placed.w;
        srcH = placed.h;
    }
    var key = name + ':' + placed.x + ',' + placed.y + ':' + placed.w + 'x' + placed.h + '/' + srcW + 'x' + srcH;
    if (this._clusterLayer !== key) {
        this._adapter.destroyLayer('map');
        this._adapter.destroyLayer('cluster');
        made = this._adapter.createLayer(name, {
            x: placed.x,
            y: placed.y,
            w: placed.w,
            h: placed.h,
            vw: srcW,
            vh: srcH,
            fps: 30
        });
        if (!made.ok) {
            if (this._clusterFail !== made.reason) {
                noteStart('cluster-mirror ' + made.reason);
                this._clusterFail = made.reason;
            }
            this._clusterLayer = '';
            this._clusterVideoOk = false;
            return;
        }
        this._clusterLayer = key;
        this._clusterVideoOk = true;
        noteStart('cluster-mirror ' + name + ' ' + srcW + 'x' + srcH + ' -> ' + placed.w + 'x' + placed.h + ' @30');
        if (made.w !== srcW || made.h !== srcH) {
            buf = frameFit.fitI420(turned.i420, turned.w, turned.h, made.w, made.h, 'contain').i420;
            srcW = made.w;
            srcH = made.h;
        }
    }
    buf = videoDecoder.i420ToAtlas(buf, srcW, srcH);
    sent = this._adapter.updateFrame(name, buf);
    if (!sent.ok) {
        if (this._clusterFail !== sent.reason) {
            noteStart('cluster-frame ' + sent.reason);
            this._clusterFail = sent.reason;
        }
        this._clusterVideoOk = false;
        return;
    }
    this._clusterFail = '';
    this._clusterVideoOk = true;
};

AirPlayApp.prototype._dropClusterMirror = function (reason) {
    if (!this._clusterLayer) {
        return;
    }
    this._adapter.destroyLayer('map');
    this._adapter.destroyLayer('cluster');
    this._clusterLayer = '';
    if (reason && reason !== 'mode') {
        noteStart('cluster-mirror-off ' + reason);
    }
};

AirPlayApp.prototype._takeFrame = function () {
    var parsed = null;
    var st;
    var stamp;
    var outs;
    var now = Date.now();
    var started;
    if (this._frameBusy) {
        return;
    }
    if (this._ingestAt && (now - this._ingestAt) < (this._ingestGap || 16)) {
        return;
    }
    try {
        st = fs.statSync('/run/g21-airplay/latest.yuv');
    } catch (err) {
        return;
    }
    stamp = String(st.mtime.getTime()) + ':' + String(st.size);
    // iPhone often sends one frame and then waits for the screen to change.
    // A frame that landed just before we started watching is still the live picture.
    if (this._streamEpoch && st.mtime.getTime() + (this._decoded ? 0 : 15000) < this._streamEpoch) {
        return;
    }
    if (stamp === this._yuvStamp) {
        return;
    }
    // The phone is asked for the centre profile ("Jakość obrazu", 600x400), but
    // an iPhone sends its own size anyway (seen on the car: 1080x498 landscape,
    // 332x720 portrait). Every frame is taken (dropping or slowing the big ones
    // made the picture stutter) and scaled to the profile (_centralFrame,
    // _placeMirrorFaces: ~1.5 ms for 1080x498). Only past 1920x1080 is it left.
    var cq = this._quality('central');
    var big = st.size > 8 + Math.ceil(cq.w * cq.h * 1.1 * 3 / 2);
    if (st.size > 8 + (1920 * 1080 * 3) / 2) {
        this._yuvStamp = stamp;
        return;
    }
    this._yuvStamp = stamp;
    this._frameBusy = true;
    started = Date.now();
    try {
        parsed = videoDecoder.parseI420(fs.readFileSync('/run/g21-airplay/latest.yuv'));
    } catch (err) {
        parsed = null;
    }
    if (!parsed) {
        this._frameBusy = false;
        this._ingestAt = Date.now();
        this._ingestGap = 16;
        return;
    }
    // The phone turned (or changed its picture): one line per new size in the start log.
    if (!this._airDims || this._airDims.w !== parsed.w || this._airDims.h !== parsed.h) {
        noteStart('air-frame ' + parsed.w + 'x' + parsed.h + (this._airDims ? ' (was ' + this._airDims.w + 'x' + this._airDims.h + ')' : '') + (big ? ' big' : ''));
        this._airDims = { w: parsed.w, h: parsed.h };
    }
    this._lastFrame = { i420: parsed.i420, w: parsed.w, h: parsed.h };
    outs = this._settings.outputs();
    try {
        if (this._router) {
            this._router.setMode(this._routerMode());
            this._router.setParked(this._parkFlag());
            this._router.push({
                i420: parsed.i420,
                w: parsed.w,
                h: parsed.h,
                ts: Date.now(),
            });
            this._router.tick(Date.now());
            if (outs.indexOf('hud') === -1 && outs.indexOf('cluster') === -1) {
                this._dropMirrorFace('hud');
                this._dropMirrorFace('cluster');
            } else if (!this._showGauges()) {
                // (a big frame while the phone turns: the cluster/HUD keep their last picture)
                this._dropMirrorFace('hud');
                this._dropMirrorFace('cluster');
            }
        } else {
            this._decoded = { w: parsed.w, h: parsed.h };
            if (outs.indexOf('central') !== -1) {
                try {
                    if (!this._mirrorVideo) {
                        this._mirrorVideo = mirrorVideo.createMirrorVideo();
                    }
                    this._mirrorVideo.push(parsed.i420, parsed.w, parsed.h);
                } catch (mirrorErr) {
                    noteStart('mirror-video ' + (mirrorErr && mirrorErr.message));
                }
            } else if (this._mirrorVideo) {
                this._mirrorVideo.close();
                this._mirrorVideo = null;
            }
        }
    } catch (presentErr) {
        noteStart('frame ' + (presentErr && presentErr.message));
    }
    this._frameBusy = false;
    var spent = Date.now() - started;
    // A slow copy waits one extra frame. It does not drop the picture down to a crawl.
    this._ingestGap = spent > 12 ? 32 : 16;
    this._ingestAt = Date.now();
    // (a big frame too: an iPhone always sends one; _placeMirrorFaces scales it to the KOMBI profile)
    if ((outs.indexOf('hud') !== -1 || outs.indexOf('cluster') !== -1) && this._showGauges()) {
        this._armFace(0);
    }
};

AirPlayApp.prototype._setVisible = function (visible) {
    if (this._shutdownPromise) {
        return;
    }
    if (this._visible === visible) {
        if (!visible && this._rt) {
            this._rt.pause();
        }
        if (!visible && this._menu) {
            this._menu.setFront(false);
        }
        if (visible) {
            this._showMenu();
        }
        return;
    }
    this._visible = visible;
    noteStart(visible ? 'visible' : 'hidden');
    if (!visible && this._rt) {
        this._rt.pause();
    }
    if (visible) {
        this._showMenu();
    } else if (this._menu) {
        this._menu.setFront(false);
    }
    if (!this._initialized || !this._appStatusService) {
        return;
    }
    var reports = visible
        ? [this.registerActive(), this.registerHmiVisible()]
        : [this.unregisterHmiVisible(), this.registerInactive()];
    reports.forEach(function (report) {
        Promise.resolve(report).catch(function (err) {
            logger.warn('app status report failed: ' + (err && err.message));
        });
    });
};

// "Wyłącz aplikację": end the sessions, free everything this app holds on the
// three screens, then leave the page so the iDrive is in front again.
// The Node process is NOT ended here: the SDK has no call for an app to stop
// itself, and MainApp counts an exit it did not ask for as a crash (the
// second one uninstalls the app). MainApp ends the process itself through
// appGetsTerminated -> _handleShutdown. Opening the app again starts clean.
// Shared renderers (mgu-render, cluster-render) and the tool service keep
// running for other apps; only our layers and sockets go.
AirPlayApp.prototype._exitApp = function () {
    var active;
    var self = this;
    if (this._shutdownPromise || this._exiting) {
        return Promise.resolve();
    }
    this._exiting = true;
    noteStart('app-exit');
    // 1. Sessions: AirPlay / desktop session, YouTube film, tool back to idle.
    try {
        active = this._sessions && this._sessions.active ? this._sessions.active() : null;
        if (active || this._streamProtocol || this._airStarting) {
            this._endStream(active || this._streamProtocol || 'airplay');
        }
    } catch (err) {
        noteStart('exit-session ' + (err && err.message));
    }
    try {
        if (this._rt) {
            this._rt.close();
        }
    } catch (err) {
        noteStart('exit-ridetube ' + (err && err.message));
    }
    try {
        this._stopYoutube();
    } catch (err) {
        noteStart('exit-youtube ' + (err && err.message));
    }
    try {
        // The tool stops UxPlay, avahi, g21-mice/present/rdp and takes its
        // firewall rules out when it reads stop.
        fs.writeFileSync(this._paths.allow, 'stop\n');
    } catch (err) {
        noteStart('exit-allow ' + (err && err.message));
    }
    // 2. Rendering and buffers: timers, the mirror file, the KOMBI layers.
    this._stopVideoTimer();
    this._dropMirror();
    this._dropMirrorFaces();
    this._ytFrame = null;
    this._ytGaugeFrame = null;
    this._ytGaugeOuts = '';
    this._lastFrame = null;
    this._decoded = null;
    this._clusterLayer = '';
    if (this._adapter) {
        this._adapter.destroyLayer();
    }
    if (this._label) {
        this._label.hide();
    }
    // 3. Sockets: cluster-render connection, frame bridge, config panel and
    // the mgu-render surface (its drop takes the centre layer away).
    if (this._client) {
        this._client.close();
        this._clusterClosed = true;
    }
    if (this._frameBridge) {
        this._frameBridge.stop();
    }
    if (this._panel) {
        this._panel.stop();
    }
    if (this._menu) {
        this._menu.close();
    }
    // 4. Leave the page: the HMI shows the screen it showed before the app.
    return Promise.resolve()
        .then(function () {
            var rhmi = self.rhmiApplication;
            if (rhmi && typeof rhmi.closeState === 'function') {
                return rhmi.closeState(STATE_NAME);
            }
            return null;
        })
        .then(function () {
            noteStart('exit-page-closed');
        }, function (err) {
            noteStart('exit-page ' + (err && err.message));
        })
        .then(function () {
            self._visible = false;
            self._exiting = false;
            var reports = self._initialized && self._appStatusService
                ? [self.unregisterHmiVisible(), self.registerInactive()]
                : [];
            return Promise.all(reports.map(function (report) {
                return Promise.resolve(report).catch(function (err) {
                    logger.warn('app status report failed: ' + (err && err.message));
                });
            }));
        })
        .then(function () {
            noteStart('exit-done');
        });
};

AirPlayApp.prototype._handleShutdown = function () {
    if (this._shutdownPromise) {
        return this._shutdownPromise;
    }
    if (this._timer) {
        clearInterval(this._timer);
    }
    if (this._sessions) {
        this._sessions.dispose();
    }
    if (this._label) {
        this._label.hide();
    }
    if (this._frameBridge) {
        this._frameBridge.stop();
    }
    if (this._panel) {
        this._panel.stop();
    }
    if (this._menu) {
        this._menu.close();
    }
    var self = this;
    this._shutdownPromise = Promise.resolve()
        .then(function () { return self.destroyBundles(); })
        .catch(function (err) { logger.info('destroyBundles: ' + (err && err.message)); })
        .then(function () { process.exit(0); });
    return this._shutdownPromise;
};

var app = new OnlineApp();
Object.keys(AirPlayApp.prototype).forEach(function (name) {
    if (name !== 'constructor' && typeof AirPlayApp.prototype[name] === 'function') {
        app[name] = AirPlayApp.prototype[name];
    }
});
AirPlayApp.call(app);
noteStart('start-called');
app.start().catch(function (err) {
    noteStart('start ' + (err && err.message));
    logger.error('g21_airplay failed to start: ' + (err && err.message));
});
