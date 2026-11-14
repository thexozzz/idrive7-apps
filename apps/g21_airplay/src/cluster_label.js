'use strict';

/*
 * Diagnostic "AIRPLAY" image overlay on cluster-render targets panel + hud.
 * README: panel 0x203 = whole cluster over gauges (1920x720); hud 0x323 (800x480).
 * map (0x100) is only the nav pocket under the needles — not the zegary surface.
 */

var LABEL = 'THEiPlay';
var FONT = require('./menu_draw.js').FONT;

var TARGETS = {
    panel: { w: 1920, h: 720, contend: 1 },
    hud: { w: 800, h: 480, contend: 0 }
};

var LABEL_COLORS = {
    white: [255, 255, 255],
    orange: [230, 161, 92],
    red: [226, 59, 59],
    yellow: [245, 215, 110],
    blue: [126, 182, 255]
};

function renderTextRgba(text, scale, color, font) {
    var chars = String(text || '').split('');
    var cellW = 6;
    var cellH = 7;
    var pad = 12;
    var rgb = LABEL_COLORS[color] || LABEL_COLORS.white;
    var tall = font === 'tall';
    var bold = font === 'bold';
    var sy = tall ? scale * 2 : scale;
    var w = pad * 2 + chars.length * cellW * scale + (bold ? scale : 0);
    var h = pad * 2 + cellH * sy;
    var rgba = Buffer.alloc(w * h * 4);
    var i;
    var row;
    var col;
    var gx;
    var gy;
    var px;
    var py;
    var ox;
    var glyph;
    var bit;
    var o;
    // Dark plate so white glyphs stay readable on bright cluster chrome.
    for (i = 0; i < rgba.length; i += 4) {
        rgba[i] = 0;
        rgba[i + 1] = 0;
        rgba[i + 2] = 0;
        rgba[i + 3] = 180;
    }
    for (i = 0; i < chars.length; i += 1) {
        glyph = FONT[chars[i]];
        if (!glyph) {
            continue;
        }
        ox = pad + i * cellW * scale;
        for (row = 0; row < cellH; row += 1) {
            for (col = 0; col < 5; col += 1) {
                bit = glyph[row].charAt(col) === '1';
                if (!bit) {
                    continue;
                }
                for (gy = 0; gy < sy; gy += 1) {
                    for (gx = 0; gx < scale; gx += 1) {
                        px = ox + col * scale + gx;
                        py = pad + row * sy + gy;
                        o = (py * w + px) * 4;
                        rgba[o] = rgb[0];
                        rgba[o + 1] = rgb[1];
                        rgba[o + 2] = rgb[2];
                        rgba[o + 3] = 255;
                        if (bold && px + scale < w) {
                            o = (py * w + px + scale) * 4;
                            rgba[o] = rgb[0];
                            rgba[o + 1] = rgb[1];
                            rgba[o + 2] = rgb[2];
                            rgba[o + 3] = 255;
                        }
                    }
                }
            }
        }
    }
    return { w: w, h: h, rgba: rgba };
}

function placeBox(targetW, targetH, imgW, imgH) {
    return {
        x: Math.max(0, Math.floor((targetW - imgW) / 2)),
        y: Math.max(0, Math.floor((targetH - imgH) / 2)),
        w: Math.min(imgW, targetW),
        h: Math.min(imgH, targetH)
    };
}

function createClusterLabel(opts) {
    var client = opts.client;
    var log = opts.log || function () {};
    var enabled = opts.enabled !== false;
    var scale = opts.scale || 4;
    var font = opts.font || 'pixel';
    var color = opts.color || 'white';
    var text = opts.text || LABEL;
    var places = opts.places || {};
    var bitmap = renderTextRgba(text, scale, color, font);
    var layers = { panel: 0, hud: 0 };

    function dropOne(name) {
        if (layers[name]) {
            try {
                client.drop(layers[name]);
            } catch (err) {
                log('label-drop ' + name + ' ' + (err && err.message));
            }
            layers[name] = 0;
        }
    }

    function hide() {
        dropOne('panel');
        dropOne('hud');
    }

    function showTarget(name) {
        var size = TARGETS[name];
        var box;
        var ref;
        if (!size || !client || !client.ready) {
            return false;
        }
        dropOne(name);
        box = places[name] ? {
            x: Math.max(0, Math.min(size.w - bitmap.w, places[name].x | 0)),
            y: Math.max(0, Math.min(size.h - bitmap.h, places[name].y | 0)),
            w: Math.min(bitmap.w, size.w),
            h: Math.min(bitmap.h, size.h)
        } : placeBox(size.w, size.h, bitmap.w, bitmap.h);
        ref = client.image({
            target: name,
            klass: 'overlay',
            z: 50,
            x: box.x,
            y: box.y,
            w: box.w,
            h: box.h,
            iw: bitmap.w,
            ih: bitmap.h,
            opacity: 1,
            exclusive: 0,
            contend: size.contend ? 1 : 0,
            guide_hold: 0,
            yield: 1,
            prewarm: 1
        });
        if (!ref) {
            log('label-refused ' + name);
            return false;
        }
        layers[name] = ref;
        if (!client.pixels(ref, null, bitmap.rgba)) {
            log('label-pixels-fail ' + name);
            return false;
        }
        log('label-on ' + name + ' ' + box.w + 'x' + box.h);
        return true;
    }

    function show() {
        var okPanel;
        var okHud;
        if (!enabled) {
            hide();
            return { ok: true, enabled: false };
        }
        okPanel = showTarget('panel');
        okHud = showTarget('hud');
        return { ok: okPanel || okHud, panel: okPanel, hud: okHud, enabled: true };
    }

    return {
        enabled: function () { return enabled; },
        setEnabled: function (on) {
            enabled = !!on;
            if (enabled) {
                return show();
            }
            hide();
            return { ok: true, enabled: false };
        },
        show: show,
        hide: hide,
        text: function () { return text; },
        setText: function (next) {
            text = String(next || LABEL);
            bitmap = renderTextRgba(text, scale, color, font);
            if (enabled) {
                return show();
            }
            return { ok: true, enabled: false };
        },
        setLook: function (next) {
            var look = next || {};
            if (look.scale) {
                scale = look.scale;
            }
            if (look.font) {
                font = look.font;
            }
            if (look.color) {
                color = look.color;
            }
            bitmap = renderTextRgba(text, scale, color, font);
            if (enabled) {
                return show();
            }
            return { ok: true, enabled: false };
        },
        setPlaces: function (next) {
            places = next || {};
            if (enabled) {
                return show();
            }
            return { ok: true, enabled: false };
        }
    };
}

module.exports = {
    LABEL: LABEL,
    TARGETS: TARGETS,
    renderTextRgba: renderTextRgba,
    LABEL_COLORS: LABEL_COLORS,
    createClusterLabel: createClusterLabel
};
