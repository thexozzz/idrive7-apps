'use strict';

/*
 * Window boxes on the cluster (map pocket / panel) and the HUD follow the
 * window set on the centre screen: corners and centre land in the same
 * place, the size keeps its shape, and every rect is legal for a
 * cluster-render video layer (PROTOCOL.md: frame width a multiple of 4,
 * height even; even x, y let videos share a display buffer).
 */

var assert = require('assert');
var path = require('path');
var fit = require(path.join(__dirname, '..', 'apps', 'g21_airplay', 'src', 'frame_fit.js'));

var TARGETS = [
    { name: 'map', w: 1088, h: 480 },
    { name: 'panel', w: 1920, h: 720 },
    { name: 'hud', w: 800, h: 480 }
];

function legal(r, t, label) {
    assert.ok(r.w % 4 === 0, label + ' width multiple of 4: ' + r.w);
    assert.ok(r.h % 2 === 0, label + ' even height: ' + r.h);
    assert.ok(r.x % 2 === 0 && r.y % 2 === 0, label + ' even place: ' + r.x + ',' + r.y);
    assert.ok(r.x >= 0 && r.y >= 0, label + ' inside (top-left)');
    assert.ok(r.x + r.w <= t.w && r.y + r.h <= t.h, label + ' inside (bottom-right) ' + JSON.stringify(r));
}

TARGETS.forEach(function (t) {
    var w = 640;
    var h = 360;
    var corners = {
        'top-left': { x: 0, y: 0 },
        'top-right': { x: 1920 - w, y: 0 },
        'bottom-left': { x: 0, y: 720 - h },
        'bottom-right': { x: 1920 - w, y: 720 - h },
        'centre': { x: (1920 - w) / 2, y: (720 - h) / 2 }
    };
    Object.keys(corners).forEach(function (where) {
        var r = fit.projectBox({ x: corners[where].x, y: corners[where].y, w: w, h: h }, 1920, 720, t.w, t.h);
        legal(r, t, t.name + ' ' + where);
        if (where.indexOf('left') !== -1) {
            assert.strictEqual(r.x, 0, t.name + ' ' + where + ' x');
        }
        if (where.indexOf('right') !== -1) {
            assert.ok(t.w - (r.x + r.w) <= 2, t.name + ' ' + where + ' right edge ' + (r.x + r.w));
        }
        if (where.indexOf('top') !== -1) {
            assert.strictEqual(r.y, 0, t.name + ' ' + where + ' y');
        }
        if (where.indexOf('bottom') !== -1) {
            assert.ok(t.h - (r.y + r.h) <= 2, t.name + ' ' + where + ' bottom edge ' + (r.y + r.h));
        }
        if (where === 'centre') {
            assert.ok(Math.abs((r.x + r.w / 2) - t.w / 2) <= 2, t.name + ' centre x');
            assert.ok(Math.abs((r.y + r.h / 2) - t.h / 2) <= 2, t.name + ' centre y');
        }
        // The window keeps its 16:9 shape on every target.
        assert.ok(Math.abs(r.w / r.h - w / h) < 0.05, t.name + ' ' + where + ' shape ' + r.w + 'x' + r.h);
    });
});

// The panel is the same size as the design space: nothing moves.
var same = fit.projectBox({ x: 100, y: 40, w: 640, h: 360 }, 1920, 720, 1920, 720);
assert.deepStrictEqual(same, { x: 100, y: 40, w: 640, h: 360 });

// Full-screen window: fills the smaller side and stays centred.
var full = fit.projectBox({ x: 0, y: 0, w: 1920, h: 720 }, 1920, 720, 800, 480);
legal(full, TARGETS[2], 'hud full');
assert.strictEqual(full.w, 800);

// The picture placed inside a projected box (as _placeMirrorFaces does)
// is a legal video rect and stays inside the box.
TARGETS.forEach(function (t) {
    var box = fit.projectBox({ x: 1280, y: 360, w: 640, h: 360 }, 1920, 720, t.w, t.h);
    [[600, 400], [400, 600], [640, 360], [184, 400]].forEach(function (size) {
        var view = fit.containPlace(size[0], size[1], box, t.w, t.h);
        legal(view, t, t.name + ' picture ' + size.join('x'));
        assert.ok(view.x >= box.x && view.y >= box.y, t.name + ' picture inside box');
        assert.ok(view.x + view.w <= box.x + box.w + 2 && view.y + view.h <= box.y + box.h + 2, t.name + ' picture inside box end');
    });
});

console.log('gauge-place: cluster and HUD windows follow the centre window, rects legal for cluster-render');
