'use strict';

var fs = require('fs');
var path = require('path');
var OnlineApp = require('oap-sdk/src/core/OnlineApp.js');
var logging = require('oap-sdk/src/logging/logging');
var uplink = require('./uplink.js');
var settingsFactory = require('./settings_manager.js');
var display = require('./display_output.js');
var videoDecoder = require('./video_decoder.js');
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
    'starting': 'RDP lacze',
    'running': 'RDP dziala',
    'missing': 'brak g21-rdp',
    'cert': 'zatwierdz Cert',
    'error': 'RDP blad',
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
    'waiting': 'stream',
    'unknown': 'stream'
};

var STATUS_BY_SCREEN = {
    root: ROOT_STATUS_TEXT,
    airplay: AIR_STATUS_TEXT,
    windows: WINDOWS_STATUS_TEXT,
    'win-devices': WINDOWS_STATUS_TEXT,
    stream: STREAM_STATUS_TEXT,
    rdp: RDP_STATUS_TEXT,
    'rdp-edit': RDP_STATUS_TEXT,
    'rdp-out': RDP_STATUS_TEXT,
    vnc: VNC_STATUS_TEXT,
    'vnc-edit': VNC_STATUS_TEXT
};

var PROTOCOLS = { airplay: true, windows: true, rdp: true, vnc: true };

function screenOutputs(app) {
    function layerOutput(name) {
        return {
            status: function () {
                if (!app._client.ready) {
                    return { available: false, reason: 'cluster-render-down' };
                }
                return { available: true };
            },
            prepare: function (picture) {
                return app._adapter.createLayer(name, picture);
            },
            start: function () { return { ok: true }; },
            stopFrames: function () {},
            frame: function (buffer) { return app._adapter.updateFrame(buffer); },
            stop: function () {},
            release: function () { app._adapter.destroyLayer(); },
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
        cluster: layerOutput('cluster'),
        hud: layerOutput('hud'),
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
    this._settings = settingsFactory.createSettings({ active: 'central' });
    this._gate = parked.createParkedGate();
    this._store = configStoreFactory.createConfigStore({});
    this._desk = desktopSettings.createDesktopSettings(this._store.readSettings());
    this._seedBuiltinRdp();
    this._paths = pathFactory.sessionPaths();
    this._chosen = 'airplay';
    this._streamProtocol = '';
    this._winAutoAccepting = false;
    this._sessionText = 'wybierz AirPlay, Miracast, RDP albo VNC';
    this._decoded = null;
    this._rdpOutput = 'central';
    this._client = new ClusterRender('g21_airplay');
    this._label = clusterLabelFactory.createClusterLabel({
        client: this._client,
        enabled: this._desk.clusterLabel(),
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
    var selfLabel = this;
    this._client.on('ready', function () {
        noteStart('cluster-ready');
        selfLabel._label.show();
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
        choose: function (name) {
            self._onMenuChoice(name);
        },
        adjust: function (name, delta) {
            return self._adjustMenu(name, delta);
        },
    });
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
    logger.info('g21_airplay ' + this.getAppId() + ' v' + this._packageJson.version + ' starting');
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
            if (self._panel) {
                self._panel.start();
            }
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
    if (this._menu) {
        this._menu.open();
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
    var pass = 'Karoleslaw1234?';
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
    if (this._store.hasSecret(kind) && this._store.hasSecret('rdp')) {
        return;
    }
    try {
        this._store.writeSecret(kind, pass);
        this._store.writeSecret('rdp', pass);
        noteStart('rdp-seed secret p1');
    } catch (err) {
        noteStart('rdp-seed-secret ' + (err && err.message));
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

AirPlayApp.prototype._endpoint = function (name) {
    if (name === 'airplay' || name === 'windows') {
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
    if (active && active !== protocol) {
        this._winAutoAccepting = false;
        this._sessions.disconnect();
    }
    // Keep a live session of the same protocol (incl. Miracast offer).
    // Failed/error/idle attempts must not stick on the submenu.
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
    if (this._menu && typeof this._menu.setScreen === 'function') {
        this._menu.setScreen('root');
    }
    this._chosen = '';
    this._streamProtocol = '';
    this._tellMenu('waiting');
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
    // Editable fields use the knob keyboard on press; rotate stays for browse only.
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
    var checked = knobKeyboard.validate(mode, text);
    var set;
    if (!checked.ok) {
        this._tellMenu(checked.reason || 'waiting');
        this._sync();
        return;
    }
    if (field === 'air-name') {
        set = this._desk.setAirplayName(checked.value);
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
        this._choose('rdp');
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
        return;
    }
    limits = settingsFactory.LIMITS[out];
    // Drop present's hold on frame.sock, then listen before g21-rdp connects.
    try {
        fs.writeFileSync(this._paths.allow, 'stop\n');
    } catch (errStop) {
        noteStart('rdp-prestop ' + (errStop && errStop.message));
    }
    setTimeout(function () {
        if (self._frameBridge) {
            self._frameBridge.setTargetSize(limits.w, limits.h);
            self._frameBridge.start();
        }
        noteStart('rdp-out ' + out);
        self._choose('rdp');
    }, 400);
};

AirPlayApp.prototype._paintSwitch = function (itemName, on, onHint, offHint) {
    if (!this._menu) {
        return;
    }
    if (typeof this._menu.setItemTitle === 'function') {
        this._menu.setItemTitle(itemName, on ? 'WL' : 'WYL');
    }
    if (typeof this._menu.setItemHint === 'function') {
        this._menu.setItemHint(itemName, on ? (onHint || 'wlaczony') : (offHint || 'wylaczony'));
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
    this._paintSwitch(toggle, true, 'start...');
    this._choose(protocol);
};

AirPlayApp.prototype._endStream = function (protocol) {
    var back = protocol || this._streamProtocol || 'airplay';
    this._winAutoAccepting = false;
    if (this._frameBridge) {
        this._frameBridge.stop();
    }
    this._writeSessionOutput('central');
    this._rdpOutput = 'central';
    this._sessions.disconnect();
    this._sessionText = back + ' stop';
    this._streamProtocol = '';
    if (this._menu && typeof this._menu.setScreen === 'function') {
        this._menu.setScreen(back);
    }
    this._chosen = back;
    this._paintSwitch(this._toggleItem(back), false);
    this._tellMenu('idle');
    this._sync();
};

AirPlayApp.prototype._enterStream = function (protocol) {
    if (this._menuScreen() === 'stream' && this._streamProtocol === protocol) {
        return;
    }
    this._streamProtocol = protocol;
    this._chosen = protocol;
    if (this._menu && typeof this._menu.setScreen === 'function') {
        this._menu.setScreen('stream');
    }
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

AirPlayApp.prototype._onAirAction = function (name) {
    if (name === 'air-back') {
        this._goRoot();
        return;
    }
    if (name === 'air-toggle') {
        this._toggleProtocol('airplay');
        return;
    }
    if (name === 'air-name') {
        this._startFieldEdit('air-name', 'name', this._desk.airplayName(), 'Nazwa AirPlay');
        return;
    }
    if (name === 'air-info') {
        this._sync();
    }
};

AirPlayApp.prototype._onStreamAction = function (name) {
    if (name === 'stream-end') {
        this._endStream(this._streamProtocol || this._chosen || 'airplay');
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

AirPlayApp.prototype._toggleClusterLabel = function () {
    var on = !this._desk.clusterLabel();
    this._desk.setClusterLabel(on);
    this._saveDesk();
    this._paintSwitch('label-toggle', on, 'napis cluster/HUD', 'napis wylaczony');
    if (this._label) {
        this._label.setEnabled(on);
    }
    this._tellMenu(on ? 'waiting' : 'waiting');
    noteStart(on ? 'label-wl' : 'label-wyl');
};

AirPlayApp.prototype._onMenuChoice = function (name) {
    var screen = this._menuScreen();
    if (name === 'label-toggle') {
        this._toggleClusterLabel();
        return;
    }
    if (name === 'airplay' || name === 'windows' || name === 'rdp' || name === 'vnc') {
        this._openProtocolScreen(name);
        return;
    }
    if (screen === 'stream' && name.indexOf('stream-') === 0) {
        this._onStreamAction(name);
        return;
    }
    if (screen === 'airplay' && name.indexOf('air-') === 0) {
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
        self._tellMenu(result.ok ? (result.state || 'starting') : result.reason);
        self._sync();
    });
};

AirPlayApp.prototype._tellMenu = function (code) {
    if (!this._menu || typeof this._menu.setStatus !== 'function') {
        return;
    }
    var screen = this._menuScreen();
    var map = STATUS_BY_SCREEN[screen] || ROOT_STATUS_TEXT;
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
    var onHint = 'wlaczony';
    if (live.state === 'running') {
        onHint = 'emisja PC';
    } else if (live.state === 'offer' || this._readWinOffers().length) {
        onHint = 'PC wykryty';
    } else if (live.on) {
        onHint = 'czekaj Win+K';
    }
    this._paintSwitch('win-toggle', live.on, onHint, 'wylaczony');
    offers = this._readWinOffers();
    this._menu.setItemHint(
        'win-devices',
        offers.length ? (String(offers.length) + ' czekajacych') : 'lista po Win+K'
    );
    this._menu.setItemHint('win-info', net.slice(0, 28));
};

AirPlayApp.prototype._paintAirMenu = function (air, receiver) {
    if (!this._menu || this._menuScreen() !== 'airplay') {
        return;
    }
    if (typeof this._menu.setItemHint !== 'function') {
        return;
    }
    var name = this._desk.airplayName();
    var net = air && air.ok
        ? ((air.ssid ? air.ssid + ' ' : '') + (air.ip || ''))
        : (air && air.reason ? String(air.reason) : 'brak wifi');
    var live = this._sessionLive('airplay');
    var mode = live.on && receiver && receiver.mode ? receiver.mode : 'idle';
    var onHint = 'wlaczony';
    if (mode === 'running') {
        onHint = 'lustro dziala';
    } else if (live.on) {
        onHint = 'czekaj na iPhone';
    }
    this._paintSwitch('air-toggle', live.on, onHint, 'wylaczony');
    this._menu.setItemHint('air-name', name);
    this._menu.setItemHint('air-info', net.slice(0, 28));
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
        }
    });
    this._watchSignal('de.bmw.infotainment.controlelements.FrontCCU', 'statusRotaryEncoderState', function (value) {
        self._input.feedEncoder(value || {});
    });
    this._watchSignal('de.bmw.infotainment.ControllerElements', 'ZBETouchFrontSide', function (value) {
        self._input.feedPad(value || {});
    });
};

AirPlayApp.prototype._registerEntryPoints = function () {
    var self = this;
    var descriptions = (this.appDescription && this.appDescription.application.entryPoints) || [];
    var ours = this.getEntryPoints().find(function (ep) {
        return descriptions.some(function (item) { return item.uuid === ep.getDescription().uuid; });
    });
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
        this._write('airNet', 'Wi-Fi Store: brak polaczenia');
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
    var tick = function () { self._sync(); };
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

    if (screen === 'stream') {
        air = choice.ok
            ? { ok: true, ip: choice.ip, ssid: choice.ssid, iface: choice.iface, reason: '' }
            : choice;
        this._paint(air);
        if (this._streamProtocol === 'airplay' && this._sessions.active() === 'airplay') {
            try {
                text = fs.readFileSync(RECEIVER_STATUS, 'utf8');
            } catch (errAir) {
                text = '';
            }
            receiver = uplink.readReceiverStatus(text);
            if (receiver.mode === 'running') {
                this._takeFrame();
                this._tellMenu('running');
                return;
            }
            this._endStream('airplay');
            return;
        }
        if (this._streamProtocol === 'windows' && this._sessions.active() === 'windows') {
            if ((this._sessions.getStatus().state) === 'running') {
                this._tellMenu('running');
                return;
            }
            this._endStream('windows');
            return;
        }
        this._endStream(this._streamProtocol || 'airplay');
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
            if (receiver.mode === 'running') {
                this._takeFrame();
                this._enterStream('airplay');
                return;
            }
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
            this._tellMenu(choice.ok ? 'waiting' : (choice.reason || 'brak-wifi'));
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
        if (this._sessions.active() === 'rdp') {
            rdpLive = this._sessions.getStatus();
            this._tellMenu(rdpLive.state === 'cert' ? 'cert' : (rdpLive.state || 'starting'));
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

    this._paint(choice);
    this._paintSwitch(
        'label-toggle',
        this._desk.clusterLabel(),
        'napis cluster/HUD',
        'napis wylaczony'
    );
    this._tellMenu(choice.ok ? 'waiting' : (choice.reason || 'brak-wifi'));
};

AirPlayApp.prototype._takeFrame = function () {
    var parsed = null;
    try {
        parsed = videoDecoder.parseI420(fs.readFileSync('/run/g21-airplay/latest.yuv'));
    } catch (err) {
        parsed = null;
    }
    if (!parsed) {
        return;
    }
    this._decoded = parsed;
    var active = this._display.active();
    if (active !== 'cluster' && active !== 'hud') {
        return;
    }
    var w = active === 'hud' ? 800 : 1088;
    var atlas = videoDecoder.atlasFromI420(parsed.i420, parsed.w, parsed.h, w, 480);
    this._display.frame(atlas);
};

AirPlayApp.prototype._setVisible = function (visible) {
    if (this._shutdownPromise) {
        return;
    }
    if (this._visible === visible) {
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
    if (visible) {
        this._showMenu();
    } else if (this._menu) {
        if (typeof this._menu.setScreen === 'function') {
            this._menu.setScreen('root');
        }
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
