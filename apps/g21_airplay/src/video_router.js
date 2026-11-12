'use strict';

/*
 * One decoded AirPlay frame, two backends.
 * The ring keeps the newest 3 frames (latest-frame-wins). The central
 * screen and the cluster each have their own clock, so a slow KOMBI
 * update never stalls the centre. Cluster stays off until the caller
 * sets parked to true. Node 8.
 */

var RING = 3;

function createVideoRouter(opts) {
    var options = opts || {};
    var ring = [null, null, null];
    var count = 0;
    var mode = 'central';
    var parked = false;
    var centralFps = options.centralFps || 30;
    var clusterFps = options.clusterFps || 4;
    var lastCentral = 0;
    var lastCluster = 0;
    var lastCentralSeq = -1;
    var lastClusterSeq = -1;
    var decodedWindow = [];
    var centralWindow = [];
    var clusterWindow = [];
    var stats = {
        decoded: 0,
        presentedCentral: 0,
        presentedCluster: 0,
        dropped: 0,
        clusterBytes: 0,
        lastBytes: 0,
        latencyMs: 0,
    };

    function fpsOf(window, now) {
        var i = 0;
        while (i < window.length && now - window[i] > 1000) {
            i += 1;
        }
        if (i) {
            window.splice(0, i);
        }
        return window.length;
    }

    function note(window, now) {
        window.push(now);
        return fpsOf(window, now);
    }

    function latest() {
        if (!count) {
            return null;
        }
        return ring[(count - 1) % RING];
    }

    function due(last, fps, now) {
        if (fps < 1) {
            fps = 1;
        }
        return !last || (now - last) >= (1000 / fps);
    }

    return {
        push: function (frame) {
            var slot;
            if (!frame || !frame.i420) {
                return false;
            }
            slot = count % RING;
            if (ring[slot]) {
                stats.dropped += 1;
            }
            ring[slot] = {
                i420: frame.i420,
                w: frame.w,
                h: frame.h,
                ts: frame.ts || 0,
                seq: count,
                bytes: frame.i420.length,
            };
            count += 1;
            stats.decoded += 1;
            stats.lastBytes = frame.i420.length;
            return true;
        },
        setMode: function (next) {
            var previous = mode;
            if (next === 'cluster' || next === 'both' || next === 'off') {
                mode = next;
            } else {
                mode = 'central';
            }
            if (previous === mode) {
                return mode;
            }
            if (mode !== 'cluster' && mode !== 'both' && options.onClusterStop) {
                options.onClusterStop('mode');
            }
            if (mode !== 'central' && mode !== 'both' && options.onCentralStop) {
                options.onCentralStop('mode');
            }
            return mode;
        },
        mode: function () { return mode; },
        setParked: function (on) {
            var next = on === true;
            if (parked === true && !next && options.onClusterStop) {
                options.onClusterStop(on === false ? 'moving' : 'speed-unknown');
            }
            parked = next;
            return parked;
        },
        setClusterFps: function (fps) {
            var n = fps | 0;
            if (n < 2) {
                n = 2;
            }
        if (n > 60) {
            n = 60;
        }
            clusterFps = n;
            return clusterFps;
        },
        tick: function (now) {
            var frame = latest();
            var spent;
            var presented = [];
            if (!frame || mode === 'off') {
                return this.stats(now);
            }
            note(decodedWindow, now);
            if ((mode === 'central' || mode === 'both') && due(lastCentral, centralFps, now)) {
                if (frame.seq !== lastCentralSeq && options.onCentral) {
                    options.onCentral(frame);
                    lastCentralSeq = frame.seq;
                    stats.presentedCentral += 1;
                    stats.latencyMs = frame.ts ? (now - frame.ts) : 0;
                    presented.push('central');
                }
                lastCentral = now;
                note(centralWindow, now);
            }
            if (mode === 'cluster' || mode === 'both') {
                if (parked === true && due(lastCluster, clusterFps, now) && frame.seq !== lastClusterSeq) {
                    if (options.onCluster) {
                        options.onCluster(frame);
                    }
                    if (options.clock) {
                        spent = options.clock() - now;
                        if (spent > (1000 / clusterFps) && clusterFps > 2) {
                            clusterFps -= 1;
                        }
                    }
                    lastClusterSeq = frame.seq;
                    lastCluster = now;
                    stats.presentedCluster += 1;
                    stats.clusterBytes += frame.bytes;
                    note(clusterWindow, now);
                    presented.push('cluster');
                }
            }
            return this.stats(now);
        },
        stats: function (now) {
            var t = now || 0;
            return {
                mode: mode,
                parked: parked,
                clusterFpsLimit: clusterFps,
                decoded: stats.decoded,
                presentedCentral: stats.presentedCentral,
                presentedCluster: stats.presentedCluster,
                dropped: stats.dropped,
                clusterBytes: stats.clusterBytes,
                lastBytes: stats.lastBytes,
                latencyMs: stats.latencyMs,
                decodedFps: fpsOf(decodedWindow, t),
                centralFps: fpsOf(centralWindow, t),
                clusterFps: fpsOf(clusterWindow, t),
                depth: count > RING ? RING : count,
            };
        },
    };
}

module.exports = {
    RING: RING,
    createVideoRouter: createVideoRouter,
};
