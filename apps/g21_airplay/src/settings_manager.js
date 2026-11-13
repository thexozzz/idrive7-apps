'use strict';

var OUTPUTS = ['central', 'cluster', 'hud'];

function centered(limitW, limitH, w, h) {
    var width = w;
    var height = h;
    var x;
    var y;
    if (width > limitW) {
        width = limitW;
    }
    if (height > limitH) {
        height = limitH;
    }
    width -= width % 2;
    height -= height % 2;
    x = Math.floor((limitW - width) / 2);
    y = Math.floor((limitH - height) / 2);
    x -= x % 2;
    y -= y % 2;
    if (x < 0) {
        x = 0;
    }
    if (y < 0) {
        y = 0;
    }
    return { x: x, y: y, w: width, h: height };
}

var WINDOW_DEFAULTS = {
    central: centered(1920, 720, 640, 360),
    cluster: centered(1920, 720, 640, 360),
    hud: centered(800, 480, 640, 360)
};

var FRAME_SIZES = [
    { w: 640, h: 360 },
    { w: 960, h: 540 },
    { w: 1280, h: 720 }
];

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

function isOldDefault(name, saved) {
    var list = {
        central: [
            { x: 180, y: 36, w: 1280, h: 640 },
            { x: 320, y: 40, w: 1280, h: 640 }
        ],
        cluster: [
            { x: 320, y: 48, w: 1280, h: 640 },
            { x: 320, y: 40, w: 1280, h: 640 }
        ],
        hud: [
            { x: 24, y: 16, w: 752, h: 448 }
        ]
    }[name] || [];
    var i;
    var old;
    if (!saved) {
        return false;
    }
    for (i = 0; i < list.length; i += 1) {
        old = list[i];
        if (saved.x === old.x && saved.y === old.y && saved.w === old.w && saved.h === old.h) {
            return true;
        }
    }
    return false;
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
        var fresh = !saved || !saved.w || isOldDefault(name, saved);
        picture[name] = clampBox(name, fresh ? (WINDOW_DEFAULTS[name] || {}) : saved);
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
        slide: function (name, key, delta) {
            var box = picture[name];
            var limit = LIMITS[name];
            var steps = delta | 0;
            var count;
            var sign;
            var step;
            var ratio;
            var next;
            var cx;
            var cy;
            if (!box || !steps || !limit) {
                return box;
            }
            if (steps > 4) {
                steps = 4;
            }
            if (steps < -4) {
                steps = -4;
            }
            sign = steps > 0 ? 1 : -1;
            count = steps < 0 ? -steps : steps;
            next = {
                scale: box.scale,
                x: box.x,
                y: box.y,
                w: box.w,
                h: box.h,
                fps: box.fps,
                rotate: box.rotate
            };
            if (key === 'x' || key === 'y') {
                next[key] = box[key] + (64 * count * sign);
            } else if (key === 'w' || key === 'h') {
                step = Math.round(box[key] * 0.08);
                if (step < 32) {
                    step = 32;
                }
                next[key] = box[key] + (step * count * sign);
                if (key === 'w') {
                    cx = box.x + box.w / 2;
                    next.x = Math.round(cx - next.w / 2);
                } else {
                    cy = box.y + box.h / 2;
                    next.y = Math.round(cy - next.h / 2);
                }
            } else if (key === 'size') {
                ratio = box.h ? (box.w / box.h) : (16 / 9);
                step = Math.round(box.w * 0.08);
                if (step < 32) {
                    step = 32;
                }
                next.w = box.w + (step * count * sign);
                next.h = Math.round(next.w / ratio);
                cx = box.x + box.w / 2;
                cy = box.y + box.h / 2;
                next.x = Math.round(cx - next.w / 2);
                next.y = Math.round(cy - next.h / 2);
            } else {
                return box;
            }
            if (next.w < 160) {
                next.w = 160;
            }
            if (next.h < 90) {
                next.h = 90;
            }
            if (next.w > limit.w) {
                if (key === 'size' && next.w) {
                    next.h = Math.round(next.h * (limit.w / next.w));
                }
                next.w = limit.w - (limit.w % 2);
            }
            if (next.h > limit.h) {
                if (key === 'size' && next.h) {
                    next.w = Math.round(next.w * (limit.h / next.h));
                }
                next.h = limit.h - (limit.h % 2);
            }
            next.w -= next.w % 2;
            next.h -= next.h % 2;
            if (next.w < 160) {
                next.w = Math.min(limit.w, 160);
            }
            if (next.h < 90) {
                next.h = Math.min(limit.h, 90);
            }
            picture[name] = clampBox(name, next);
            return picture[name];
        },
        span: function (name, key) {
            var box = picture[name];
            var limit = LIMITS[name];
            if (!box || !limit) {
                return { min: 0, max: 1, value: 0 };
            }
            if (key === 'x') {
                return { min: 0, max: Math.max(0, limit.w - box.w), value: box.x };
            }
            if (key === 'y') {
                return { min: 0, max: Math.max(0, limit.h - box.h), value: box.y };
            }
            if (key === 'h') {
                return { min: 90, max: limit.h, value: box.h };
            }
            return { min: 160, max: limit.w, value: box.w };
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
        setFrameSize: function (name, w, h) {
            var box = picture[name];
            var limit = LIMITS[name];
            var scale = Math.min(1, limit.w / w, limit.h / h);
            var nw = Math.round(w * scale);
            var nh = Math.round(h * scale);
            var x;
            var y;
            nw -= nw % 4;
            nh -= nh % 2;
            if (nw < 16) {
                nw = 16;
            }
            if (nh < 16) {
                nh = 16;
            }
            x = Math.floor((limit.w - nw) / 2);
            y = Math.floor((limit.h - nh) / 2);
            x -= x % 2;
            y -= y % 2;
            if (x < 0) {
                x = 0;
            }
            if (y < 0) {
                y = 0;
            }
            picture[name] = clampBox(name, {
                scale: 'contain',
                x: x,
                y: y,
                w: nw,
                h: nh,
                fps: box.fps,
                rotate: box.rotate
            });
            return picture[name];
        },
        center: function (name) {
            var box = picture[name];
            var limit = LIMITS[name];
            var x = Math.floor((limit.w - box.w) / 2);
            var y = Math.floor((limit.h - box.h) / 2);
            picture[name] = clampBox(name, {
                scale: box.scale,
                x: x,
                y: y,
                w: box.w,
                h: box.h,
                fps: box.fps,
                rotate: box.rotate
            });
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
    FRAME_SIZES: FRAME_SIZES,
    createSettings: createSettings,
};
