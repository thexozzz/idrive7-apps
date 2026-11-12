'use strict';

var fs = require('fs');
var OnlineApp = require('oap-sdk/src/core/OnlineApp.js');
var logging = require('oap-sdk/src/logging/logging');
var uplink = require('./uplink.js');
var settingsFactory = require('./settings_manager.js');
var display = require('./display_output.js');
var videoDecoder = require('./video_decoder.js');
var adapterFactory = require('./cluster_render_adapter.js');
var ClusterRender = require('./cluster_render_client.js').ClusterRender;
var parked = require('./parked_gate.js');
var pathFactory = require('./paths.js');
var desktopSettings = require('./desktop_settings.js');
var sessionFactory = require('./session_manager.js');
var desktopSessions = require('./desktop_sessions.js');
var vncFactory = require('./vnc_client.js');
var inputFactory = require('./input_manager.js');
var frameSinkFactory = require('./frame_sink.js');
var menuDraw = require('./menu_draw.js');

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
var STATUS_TEXT = {
    'speed-unknown': 'brak predkosci',
    'not-parked': 'nie stoi',
    'uplink-not-wifi': 'brak wifi',
    'wifi-down': 'brak wifi',
    'no-lease': 'brak wifi',
    'starting': 'UxPlay start',
    'running': 'UxPlay dziala',
    'missing': 'UxPlay brak',
    'mdns-brak': 'brak dns',
    'uxplay-exit': 'UxPlay stop',
    'brak-wifi': 'brak wifi',
    'idle': 'AirPlay idle',
    'waiting': 'AirPlay idle',
    'unknown': 'AirPlay idle'
};

function screenOutputs(app) {
    function layerOutput(name) {
        return {
            status: function () {
                if (!app._decoded) {
                    return { available: false, reason: 'no-decoded-frame' };
                }
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
    this._desk = desktopSettings.createDesktopSettings({});
    this._paths = pathFactory.sessionPaths();
    this._chosen = 'airplay';
    this._sessionText = 'wybierz AirPlay, RDP albo VNC';
    this._decoded = null;
    this._client = new ClusterRender('g21_airplay');
    this._adapter = adapterFactory.createClusterRenderAdapter(this._client);
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
            if (name === 'host') {
                self._desk.nextOctet();
                self._sync();
                return;
            }
            self._choose(name);
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
    self._bindHost();
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

AirPlayApp.prototype._secret = function (kind) {
    try {
        return fs.readFileSync('/var/opt/g21_airplay/' + kind + '.secret', 'utf8').replace(/\s+$/, '');
    } catch (err) {
        return '';
    }
};

AirPlayApp.prototype._endpoint = function (name) {
    if (name === 'airplay') {
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

AirPlayApp.prototype._choose = function (name) {
    var self = this;
    this._chosen = name;
    this._sessions.connect(name, this._endpoint(name)).then(function (result) {
        self._sessionText = result.ok
            ? (name + ' ' + (result.state || 'ok'))
            : (name + ' ' + (result.reason || 'blad'));
        self._tellMenu(result.ok ? (result.state || 'starting') : result.reason);
        self._sync();
    });
};

AirPlayApp.prototype._tellMenu = function (code) {
    if (!this._menu || typeof this._menu.setStatus !== 'function') {
        return;
    }
    this._menu.setStatus(STATUS_TEXT[code] || '');
};

AirPlayApp.prototype._bindTile = function (name, protocol) {
    var self = this;
    this._action(this._rows[name], function (kind) {
        if (kind === 'Increase' || kind === 'Decrease') {
            self._input.knobScroll(kind === 'Increase' ? 1 : -1);
            return;
        }
        if (kind === 'Abort') {
            self._sessions.disconnect();
            self._sessionText = 'powrot';
            self._sync();
            return;
        }
        self._choose(protocol);
    });
};

AirPlayApp.prototype._bindHost = function () {
    var self = this;
    this._action(this._rows.tileHost, function (kind) {
        var protocol = self._chosen === 'airplay' ? 'vnc' : self._chosen;
        if (kind === 'Increase') {
            self._desk.stepOctet(protocol, 1);
        } else if (kind === 'Decrease') {
            self._desk.stepOctet(protocol, -1);
        } else {
            self._desk.nextOctet();
        }
        self._sync();
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

AirPlayApp.prototype._paint = function (choice, session) {
    if (!choice.ok) {
        if (choice.reason === 'mdns-brak') {
            this._write('airNet', choice.ssid ? ('Wi-Fi: ' + choice.ssid) : 'AirPlay');
            this._write('airAddr', 'Brak avahi / mDNS na jednostce');
        } else {
            this._write('airNet', 'Wi-Fi Store: brak polaczenia');
            this._write('airAddr', 'Wlacz hotspot iPhone i dolacz MGU Store do tej sieci');
        }
        this._write('airState', choice.reason);
        return;
    }
    this._write('airNet', choice.ssid ? ('Wi-Fi: ' + choice.ssid) : ('Interfejs: ' + choice.iface));
    if (this._chosen === 'airplay') {
        this._write('airAddr', 'iPhone: Lustro ekranu, ' + this._desk.airplayName() + '  ' + choice.ip);
    } else {
        var host = this._desk.host(this._chosen);
        this._write('airAddr', this._chosen.toUpperCase() + ' ' + host.octets.join('.') + ':' + host.port + ' oktet ' + (this._desk.octet() + 1));
    }
};

AirPlayApp.prototype._watchNetwork = function () {
    var self = this;
    var tick = function () { self._sync(); };
    tick();
    this._timer = setInterval(tick, 5000);
    if (this._timer.unref) {
        this._timer.unref();
    }
};

AirPlayApp.prototype._sync = function () {
    var snap = uplink.readUplink();
    var choice = uplink.selectStoreWifi(snap.status, snap.lease);
    var text = '';
    try {
        text = fs.readFileSync(RECEIVER_STATUS, 'utf8');
    } catch (err) {
        text = '';
    }
    if (this._sessions.active()) {
        var live = this._sessions.getStatus();
        this._sessionText = live.protocol + ' ' + (live.state || '') + (live.detail ? (' ' + live.detail) : '');
    }
    this._sessions.onVehicle();
    var receiver = uplink.readReceiverStatus(text);
    if (this._chosen === 'airplay' || this._sessions.active() === 'airplay') {
        var air = uplink.selectAirplayAnnounce(receiver, choice);
        if (receiver.mode === 'running') {
            this._takeFrame();
        }
        this._paint(air, { state: receiver.mode || 'waiting', detail: receiver.mode });
        if (this._sessions.active() === 'airplay') {
            this._tellMenu(receiver.mode === 'running'
                ? 'running'
                : (STATUS_TEXT[receiver.mode] ? receiver.mode : (air.ok ? 'starting' : air.reason)));
        }
        return;
    }
    if (!choice.ok) {
        this._paint(choice, { state: 'idle', detail: choice.reason });
        this._tellMenu(choice.reason);
        return;
    }
    this._paint(choice, { state: receiver.mode || 'waiting', detail: receiver.mode });
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
