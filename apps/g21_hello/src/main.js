'use strict';

/*
 * G21 Hello. A source package for the MGU Store.
 * The head unit links OnlineApp from its own donor. This file is not a
 * built javascript/app.js and must not vendor oap-sdk.
 *
 * Lifecycle methods below are the ones used by the published Store apps
 * (idrive-apps apps/robertn_waze_cluster/src/robertn_waze_cluster.js at
 * a559f69ebc8c). They are not yet confirmed on this G21.
 */

var OnlineApp = require('oap-sdk/src/core/OnlineApp.js');
var logging = require('oap-sdk/src/logging/logging');

var logger = logging.getSDKLogger();
var STATE_NAME = 'ST_OnlineApps_G21Hello';
var STATUS_NAME = 'helloStatus';
var FOREGROUND_REASONS = ['ENTRY_POINT', 'LUM', 'BOOKMARK', 'START_WIDGET', 'TRIGGER_HMI', 'SPEECH_COMMAND'];

function HelloApp() {
    this._state = null;
    this._status = null;
    this._visible = false;
    this._shutdownPromise = null;
    var self = this;
    this.on('appStatusProxyReady', function () {
        Promise.resolve(self.registerActive()).catch(function (err) {
            logger.warn('registerActive: ' + (err && err.message));
        });
    });
    this.on('initialized', function () {
        self._appInitialized().catch(function (err) {
            logger.error('g21_hello init failed: ' + (err && err.message));
        });
    });
    this.on('shutdown', function (reason) { self._handleShutdown(reason); });
    this.on('error', function (err) { logger.warn('OnlineApp error: ' + (err && err.message)); });
    this.on('entryPointExecute', function (uuid) { self._onEntryPointExecute(uuid); });
    this.on('changeVisibility', function (data) {
        if (data && data.visible === false) {
            self._setVisible(false);
        }
    });
}

HelloApp.prototype._startedForeground = function () {
    var data = this.getVisibilityData && this.getVisibilityData();
    var reason = (data && data.reason) || this.startReason;
    return FOREGROUND_REASONS.indexOf(reason) !== -1;
};

HelloApp.prototype._appInitialized = function () {
    var self = this;
    logger.info('g21_hello ' + this.getAppId() + ' v' + this._packageJson.version + ' starting');
    Promise.resolve(this.registerActive()).catch(function (err) {
        logger.warn('registerActive: ' + (err && err.message));
    });
    if (!this.rhmiApplication) {
        logger.info('no RhmiApplication for this start reason');
        return this.initialized();
    }
    var foregroundStart = this._startedForeground();
    return this._setupRhmi()
        .then(function () { return self._registerEntryPoints(); })
        .then(function () {
            if (foregroundStart) {
                self.registerActive();
            }
            return self.initialized();
        })
        .then(function () {
            if (foregroundStart) {
                self._setVisible(true);
            }
            var lastUuid = self.getLastExecutedEntryPointUuid && self.getLastExecutedEntryPointUuid();
            return lastUuid ? self._onEntryPointExecute(lastUuid) : undefined;
        });
};

HelloApp.prototype._setupRhmi = function () {
    var rhmi = this.rhmiApplication;
    this._state = rhmi.getByName(STATE_NAME);
    this._status = rhmi.getByName(STATUS_NAME);
    if (!this._state || !this._status) {
        return Promise.reject(new Error('uiDescription has no ' + STATE_NAME));
    }
    return Promise.resolve();
};

HelloApp.prototype._registerEntryPoints = function () {
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
        .then(function () { return self.rhmiApplication.mapEntryState(description.uuid, self._state); })
        .then(function () { return ours.setAvailability('ENABLED'); })
        .then(function () { logger.info('entry point ' + description.name + ' ENABLED'); });
};

HelloApp.prototype._onEntryPointExecute = function (uuid) {
    if (this._shutdownPromise || !this.rhmiApplication || !uuid) {
        return Promise.resolve();
    }
    this._setVisible(true);
    return Promise.resolve(this.rhmiApplication.openEntryState(uuid)).catch(function (err) {
        logger.warn('openEntryState failed: ' + (err && err.message));
    });
};

HelloApp.prototype._setVisible = function (visible) {
    if (this._shutdownPromise || this._visible === visible) {
        return;
    }
    this._visible = visible;
    logger.info('page ' + (visible ? 'visible' : 'hidden'));
    if (visible && this._status) {
        var installed = this._packageJson && this._packageJson.version;
        Promise.resolve(this._status.setValue(0, 'Text', 'G21 Hello ' + (installed || ''), 'Text')).catch(function (err) {
            logger.warn('status render failed: ' + (err && err.message));
        });
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

HelloApp.prototype._handleShutdown = function (reason) {
    if (this._shutdownPromise) {
        return this._shutdownPromise;
    }
    logger.info('g21_hello shutdown: ' + JSON.stringify(reason));
    this._shutdownPromise = Promise.resolve()
        .then(function () { return this.destroyBundles(); }.bind(this))
        .catch(function (err) { logger.info('destroyBundles: ' + (err && err.message)); })
        .then(function () { process.exit(0); });
    return this._shutdownPromise;
};

var app = new OnlineApp();
Object.keys(HelloApp.prototype).forEach(function (name) {
    if (name !== 'constructor' && typeof HelloApp.prototype[name] === 'function') {
        app[name] = HelloApp.prototype[name];
    }
});
HelloApp.call(app);
app.start().catch(function (err) {
    logger.error('g21_hello failed to start: ' + (err && err.message));
});
