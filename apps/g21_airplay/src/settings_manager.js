'use strict';

var OUTPUTS = ['central', 'cluster', 'hud'];

var LIMITS = {
    central: { w: 1920, h: 720, fps: 30 },
    cluster: { w: 1920, h: 720, fps: 30 },
    hud: { w: 800, h: 480, fps: 30 },
};

function clampBox(output, box) {
    var limit = LIMITS[output];
    var width = Math.max(1, Math.min(limit.w, box.w || limit.w));
    var height = Math.max(1, Math.min(limit.h, box.h || limit.h));
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
        rotate: box.rotate || 0,
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

function createSettings(stored) {
    var data = stored || {};
    var active = data.active || 'central';
    var picture = {};
    OUTPUTS.forEach(function (name) {
        picture[name] = clampBox(name, data.picture && data.picture[name] || {});
    });
    return {
        active: function () { return active; },
        setActive: function (name) { active = name; },
        picture: function (name) { return picture[name]; },
        setPicture: function (name, box) { picture[name] = clampBox(name, box); },
        snapshot: function () {
            return { active: active, picture: picture };
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
