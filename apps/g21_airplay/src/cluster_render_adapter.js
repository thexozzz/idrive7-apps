'use strict';

/*
 * Wraps the MPL cluster-render Node client (cluster_render_client.js).
 * Target names and frame layout are protocol version 1, idrive-apps
 * native/cluster-render/PROTOCOL.md at a559f69ebc8c.
 * On iDrive 7 the hello targets are map 1088x480, panel 1920x720, hud 800x480.
 * The instrument-cluster centre used by the map apps is the target "map".
 * HUD is the target "hud". They are not the same size.
 */

var TARGETS = {
    cluster: { protocol: 'map', w: 1088, h: 480 },
    hud: { protocol: 'hud', w: 800, h: 480 },
};

function yuvBytes(w, h) {
    return w * (h + (h >> 1));
}

function createClusterRenderAdapter(client) {
    var layer = 0;
    var placed = null;
    var frameId = 0;

    function fail(reason) {
        return { ok: false, reason: reason };
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
            if (!known.ok) {
                return known;
            }
            if (layer) {
                this.destroyLayer();
            }
            var box = geometry || {};
            var ref = client.video({
                target: known.protocol,
                vw: known.w,
                vh: known.h,
                fps: box.fps || 30,
                x: box.x || 0,
                y: box.y || 0,
                w: box.w || known.w,
                h: box.h || known.h,
                rotate: box.rotate || 0,
                klass: 'content',
                yield: 1,
                exclusive: 0,
                guide_hold: 0,
                contend: 0,
            });
            if (!ref) {
                return fail('layer-refused');
            }
            layer = ref;
            placed = { name: name, w: known.w, h: known.h };
            frameId = 0;
            return { ok: true, ref: ref, w: known.w, h: known.h };
        },
        updateFrame: function (atlas) {
            if (!layer || !placed) {
                return fail('no-layer');
            }
            var need = yuvBytes(placed.w, placed.h);
            if (!atlas || atlas.length !== need) {
                return fail('bad-frame');
            }
            frameId += 1;
            if (!client.frame(layer, atlas, frameId)) {
                return fail('frame-not-sent');
            }
            return { ok: true, id: frameId };
        },
        place: function (geometry) {
            if (!layer) {
                return fail('no-layer');
            }
            client.set(layer, {
                x: geometry.x,
                y: geometry.y,
                w: geometry.w,
                h: geometry.h,
                rotate: geometry.rotate || 0,
                fps: geometry.fps || 30,
            });
            return { ok: true };
        },
        destroyLayer: function () {
            if (!layer) {
                return { ok: true };
            }
            client.drop(layer);
            layer = 0;
            placed = null;
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
