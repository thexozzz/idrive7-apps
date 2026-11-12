'use strict';

/*
 * Fit one I420 frame into a cluster target. Width stays a multiple of 4
 * and height even, which is what cluster-render accepts for a video layer.
 * Contain letterboxes. Cover crops the source and fills the target.
 * Bars are black (Y=16, U=V=128). Node 8.
 */

function evenDown(n) {
    n = n | 0;
    if (n < 0) {
        n = 0;
    }
    return n - (n % 2);
}

function even2(n) {
    n = n | 0;
    if (n < 2) {
        n = 2;
    }
    return n - (n % 2);
}

function even4(n) {
    n = n | 0;
    if (n < 4) {
        n = 4;
    }
    return n - (n % 4);
}

function fitRect(sw, sh, dw, dh, mode) {
    var scale = mode === 'cover'
        ? Math.max(dw / sw, dh / sh)
        : Math.min(dw / sw, dh / sh);
    var w = even4(Math.round(sw * scale));
    var h = even2(Math.round(sh * scale));
    var srcW;
    var srcH;
    var x;
    var y;
    var sx;
    var sy;
    if (w > dw) {
        w = even4(dw);
    }
    if (h > dh) {
        h = even2(dh);
    }
    srcW = even4(Math.round(w / scale));
    srcH = even2(Math.round(h / scale));
    if (srcW > sw) {
        srcW = even4(sw);
    }
    if (srcH > sh) {
        srcH = even2(sh);
    }
    x = evenDown(Math.floor((dw - w) / 2));
    y = evenDown(Math.floor((dh - h) / 2));
    sx = evenDown(Math.floor((sw - srcW) / 2));
    sy = evenDown(Math.floor((sh - srcH) / 2));
    if (x + w > dw) {
        x = evenDown(dw - w);
    }
    if (y + h > dh) {
        y = evenDown(dh - h);
    }
    if (sx + srcW > sw) {
        sx = evenDown(sw - srcW);
    }
    if (sy + srcH > sh) {
        sy = evenDown(sh - srcH);
    }
    return { x: x, y: y, w: w, h: h, sx: sx, sy: sy, sw: srcW, sh: srcH };
}

function fitI420(i420, sw, sh, dw, dh, mode) {
    var rect = fitRect(sw, sh, dw, dh, mode);
    var ySize = dw * dh;
    var uvW = dw >> 1;
    var uvH = dh >> 1;
    var out = Buffer.alloc(ySize + uvW * uvH * 2);
    var row;
    var col;
    var sy;
    var sx;
    var uOff = ySize;
    var vOff = ySize + uvW * uvH;
    var suvW = sw >> 1;
    var srcU = sw * sh;
    var srcV = srcU + suvW * (sh >> 1);
    out.fill(16, 0, ySize);
    out.fill(128, ySize);
    for (row = 0; row < rect.h; row += 1) {
        sy = rect.sy + ((row * rect.sh / rect.h) | 0);
        if (sy >= sh) {
            sy = sh - 1;
        }
        for (col = 0; col < rect.w; col += 1) {
            sx = rect.sx + ((col * rect.sw / rect.w) | 0);
            if (sx >= sw) {
                sx = sw - 1;
            }
            out[(rect.y + row) * dw + rect.x + col] = i420[sy * sw + sx];
        }
    }
    for (row = 0; row < (rect.h >> 1); row += 1) {
        sy = (rect.sy >> 1) + ((row * (rect.sh >> 1) / (rect.h >> 1)) | 0);
        if (sy >= (sh >> 1)) {
            sy = (sh >> 1) - 1;
        }
        for (col = 0; col < (rect.w >> 1); col += 1) {
            sx = (rect.sx >> 1) + ((col * (rect.sw >> 1) / (rect.w >> 1)) | 0);
            if (sx >= suvW) {
                sx = suvW - 1;
            }
            out[uOff + ((rect.y >> 1) + row) * uvW + (rect.x >> 1) + col] = i420[srcU + sy * suvW + sx];
            out[vOff + ((rect.y >> 1) + row) * uvW + (rect.x >> 1) + col] = i420[srcV + sy * suvW + sx];
        }
    }
    return { w: dw, h: dh, rect: rect, i420: out };
}

module.exports = {
    evenDown: evenDown,
    even2: even2,
    even4: even4,
    fitRect: fitRect,
    fitI420: fitI420,
};
