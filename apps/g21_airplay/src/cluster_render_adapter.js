'use strict';

/*
 * Wraps the MPL cluster-render Node client (cluster_render_client.js).
 * Target names and frame layout are protocol version 1, idrive-apps
 * native/cluster-render/PROTOCOL.md at a559f69ebc8c.
 * On iDrive 7 the hello targets are map 1088x480, panel 1920x720, hud 800x480.
 * AirPlay on the cluster uses "map" (0x103, 1088x480), the nav pocket.
 * "panel" (0x203, 1920x720) covers the gauges and hides factory BC.
 * HUD is the target "hud" (0x323, 800x480).
 */

var TARGETS = {
    map: { protocol: 'map', w: 1088, h: 480 },
    cluster: { protocol: 'panel', w: 1920, h: 720 },
    hud: { protocol: 'hud', w: 800, h: 480 },
};

function yuvBytes(w, h) {
    return w * (h + (h >> 1));
}

function createClusterRenderAdapter(client) {
    var layers = {};

    function fail(reason) {
        return { ok: false, reason: reason };
    }

    function evenSize(value, fallback, limit) {
        var n = value || fallback || limit;
        if (n > limit) {
            n = limit;
        }
        if (n < 2) {
            n = 2;
        }
        return n - (n % 2);
    }

    return {
        targets: TARGETS,
        connect: function () {
            client.connect();
            return { ok: true };
        },
        knownTarget: function (name) {
            var spec = TARGETS[name];
            if (!spec) {
                return fail('unknown-target');
            }
            var listed = client.targets || '';
            if (listed && listed.indexOf(spec.protocol + ':') === -1) {
                return fail('target-not-offered');
            }
            return { ok: true, protocol: spec.protocol, w: spec.w, h: spec.h };
        },
        createLayer: function (name, geometry) {
            var known = this.knownTarget(name);
            var box;
            var fw;
            var fh;
            var ref;
            if (!known.ok) {
                return known;
            }
            if (layers[name]) {
                this.destroyLayer(name);
            }
            box = geometry || {};
            fw = evenSize(box.w, known.w, known.w);
            fh = evenSize(box.h, known.h, known.h);
            fw -= fw % 4;
            if (fw < 16) {
                fw = 16;
            }
            var vw = box.vw || fw;
            var vh = box.vh || fh;
            if (vw > 1920) {
                vw = 1920;
            }
            if (vh > 720) {
                vh = 720;
            }
            vw -= vw % 4;
            vh -= vh % 2;
            if (vw < 16) {
                vw = 16;
            }
            if (vh < 2) {
                vh = 2;
            }
            ref = client.video({
                target: known.protocol,
                vw: vw,
                vh: vh,
                fps: box.fps || 30,
                x: box.x || 0,
                y: box.y || 0,
                w: fw,
                h: fh,
                rotate: box.rotate || 0,
                klass: 'content',
                yield: 1,
                exclusive: 0,
                guide_hold: 0,
                contend: known.protocol === 'panel' ? 1 : 0,
                prewarm: 1,
            });
            if (!ref) {
                return fail('layer-refused');
            }
            layers[name] = { ref: ref, w: vw, h: vh, frameId: 0 };
            return { ok: true, ref: ref, w: vw, h: vh, dw: fw, dh: fh };
        },
        updateFrame: function (name, atlas) {
            var slot;
            var keys;
            var need;
            if (Buffer.isBuffer(name)) {
                atlas = name;
                name = null;
            }
            slot = name ? layers[name] : null;
            if (!slot && !name) {
                keys = Object.keys(layers);
                if (keys.length === 1) {
                    slot = layers[keys[0]];
                }
            }
            if (!slot) {
                return fail('no-layer');
            }
            need = yuvBytes(slot.w, slot.h);
            if (!atlas || atlas.length !== need) {
                return fail('bad-frame');
            }
            slot.frameId += 1;
            if (!client.frame(slot.ref, atlas, slot.frameId)) {
                return fail('frame-not-sent');
            }
            return { ok: true, id: slot.frameId };
        },
        place: function (name, geometry) {
            var slot = layers[name];
            if (!slot) {
                return fail('no-layer');
            }
            client.set(slot.ref, {
                x: geometry.x,
                y: geometry.y,
                w: geometry.w,
                h: geometry.h,
                rotate: geometry.rotate || 0,
                fps: geometry.fps || 30,
            });
            return { ok: true };
        },
        destroyLayer: function (name) {
            var slot;
            if (!name) {
                Object.keys(layers).forEach(function (key) {
                    client.drop(layers[key].ref);
                });
                layers = {};
                return { ok: true };
            }
            slot = layers[name];
            if (!slot) {
                return { ok: true };
            }
            client.drop(slot.ref);
            delete layers[name];
            return { ok: true };
        },
        stop: function () {
            this.destroyLayer();
            client.close();
            return { ok: true };
        },
    };
}

module.exports = {
    TARGETS: TARGETS,
    yuvBytes: yuvBytes,
    createClusterRenderAdapter: createClusterRenderAdapter,
};
