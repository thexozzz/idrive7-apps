'use strict';

var OUTPUTS = ['central', 'cluster', 'hud'];

var WINDOW_DEFAULTS = {
    central: { x: 180, y: 36, w: 1280, h: 640 },
    cluster: { x: 320, y: 48, w: 1280, h: 640 },
    hud: { x: 24, y: 16, w: 752, h: 448 }
};

var LIMITS = {
    central: { w: 1920, h: 720, fps: 30 },
    cluster: { w: 1920, h: 720, fps: 30 },
    hud: { w: 800, h: 480, fps: 30 },
};

function clampBox(output, box) {
    var limit = LIMITS[output];
    var width = Math.max(2, Math.min(limit.w, box.w || limit.w));
    var height = Math.max(2, Math.min(limit.h, box.h || limit.h));
    width -= width % 2;
    height -= height % 2;
    var x = box.x || 0;
    var y = box.y || 0;
    if (x < 0) {
        x = 0;
    }
    if (y < 0) {
        y = 0;
    }
    if (x + width > limit.w) {
        x = limit.w - width;
    }
    if (y + height > limit.h) {
        y = limit.h - height;
    }
    var fps = box.fps || limit.fps;
    if (fps < 1) {
        fps = 1;
    }
    if (fps > limit.fps) {
        fps = limit.fps;
    }
    return {
        scale: box.scale === 'cover' ? 'cover' : 'contain',
        x: x,
        y: y,
        w: width,
        h: height,
        fps: fps,
        rotate: ((box.rotate || 0) % 360) === 90 || ((box.rotate || 0) % 360) === 180 || ((box.rotate || 0) % 360) === 270
            ? (box.rotate % 360)
            : 0,
    };
}

function fit(frameW, frameH, box) {
    var scale = Math.min(box.w / frameW, box.h / frameH);
    if (box.scale === 'cover') {
        scale = Math.max(box.w / frameW, box.h / frameH);
    }
    var w = Math.round(frameW * scale);
    var h = Math.round(frameH * scale);
    return {
        x: box.x + Math.round((box.w - w) / 2),
        y: box.y + Math.round((box.h - h) / 2),
        w: w,
        h: h,
    };
}

function normalizeOutputs(list) {
    var out = [];
    var i;
    var name;
    var source = list && list.length ? list : ['central'];
    for (i = 0; i < source.length; i += 1) {
        name = source[i];
        if (OUTPUTS.indexOf(name) !== -1 && out.indexOf(name) === -1) {
            out.push(name);
        }
    }
    return out;
}

function createSettings(stored) {
    var data = stored || {};
    var selected = normalizeOutputs(data.outputs || (data.active ? [data.active] : ['central']));
    var active = selected[0] || 'central';
    var picture = {};
    OUTPUTS.forEach(function (name) {
        var saved = data.picture && data.picture[name];
        picture[name] = clampBox(name, saved && saved.w ? saved : (WINDOW_DEFAULTS[name] || {}));
    });
    return {
        active: function () { return active; },
        setActive: function (name) {
            if (OUTPUTS.indexOf(name) !== -1) {
                active = name;
            }
        },
        outputs: function () { return selected.slice(); },
        setOutputs: function (list) {
            selected = normalizeOutputs(list);
            if (selected.indexOf(active) === -1) {
                active = selected[0] || 'central';
            }
            return selected.slice();
        },
        toggleOutput: function (name) {
            var i;
            if (OUTPUTS.indexOf(name) === -1) {
                return selected.slice();
            }
            i = selected.indexOf(name);
            if (i === -1) {
                selected.push(name);
            } else {
                selected.splice(i, 1);
            }
            if (selected.indexOf(active) === -1) {
                active = selected[0] || 'central';
            }
            return selected.slice();
        },
        picture: function (name) { return picture[name]; },
        setPicture: function (name, box) { picture[name] = clampBox(name, box); return picture[name]; },
        scale: function (name, delta) {
            var box = picture[name];
            var limit = LIMITS[name];
            var ratio;
            var nextW;
            var nextH;
            var cx;
            var cy;
            var step;
            if (!box || !delta || !box.h) {
                return box;
            }
            ratio = box.w / box.h;
            step = Math.round(box.w * 0.08);
            if (step < 32) {
                step = 32;
            }
            nextW = box.w + step * (delta > 0 ? 1 : -1);
            nextW -= nextW % 2;
            if (nextW < 320) {
                nextW = 320;
            }
            nextH = Math.round(nextW / ratio);
            nextH -= nextH % 2;
            if (nextH < 160) {
                nextH = 160;
                nextW = Math.round(nextH * ratio);
                nextW -= nextW % 2;
            }
            if (nextW > limit.w) {
                nextW = limit.w - (limit.w % 2);
                nextH = Math.round(nextW / ratio);
                nextH -= nextH % 2;
            }
            if (nextH > limit.h) {
                nextH = limit.h - (limit.h % 2);
                nextW = Math.round(nextH * ratio);
                nextW -= nextW % 2;
            }
            cx = box.x + box.w / 2;
            cy = box.y + box.h / 2;
            picture[name] = clampBox(name, {
                scale: box.scale,
                x: Math.round(cx - nextW / 2),
                y: Math.round(cy - nextH / 2),
                w: nextW,
                h: nextH,
                fps: box.fps,
                rotate: box.rotate
            });
            return picture[name];
        },
        nudge: function (name, key, delta) {
            var box = picture[name];
            var next;
            if (!box || !delta) {
                return box;
            }
            next = {
                scale: box.scale,
                x: box.x,
                y: box.y,
                w: box.w,
                h: box.h,
                fps: box.fps,
                rotate: box.rotate
            };
            if (key === 'x' || key === 'y' || key === 'w' || key === 'h') {
                next[key] = box[key] + (32 * delta);
            }
            picture[name] = clampBox(name, next);
            return picture[name];
        },
        fill: function (name) {
            picture[name] = clampBox(name, {});
            return picture[name];
        },
        turn: function (name) {
            var box = picture[name];
            var rot = ((box.rotate || 0) + 90) % 360;
            picture[name] = clampBox(name, {
                scale: box.scale,
                x: box.x,
                y: box.y,
                w: box.w,
                h: box.h,
                fps: box.fps,
                rotate: rot
            });
            return picture[name];
        },
        snapshot: function () {
            return { active: active, outputs: selected.slice(), picture: picture };
        },
    };
}

module.exports = {
    OUTPUTS: OUTPUTS,
    LIMITS: LIMITS,
    clampBox: clampBox,
    fit: fit,
    createSettings: createSettings,
};
