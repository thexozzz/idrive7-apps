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

function containPlace(sw, sh, box, limitW, limitH) {
    var x0 = box && box.x > 0 ? (box.x | 0) : 0;
    var y0 = box && box.y > 0 ? (box.y | 0) : 0;
    var bw = box && box.w ? (box.w | 0) : limitW;
    var bh = box && box.h ? (box.h | 0) : limitH;
    var scale;
    var dw;
    var dh;
    var x;
    var y;
    if (sw < 2) {
        sw = 2;
    }
    if (sh < 2) {
        sh = 2;
    }
    if (limitW < 16) {
        limitW = 16;
    }
    if (limitH < 16) {
        limitH = 16;
    }
    if (x0 >= limitW) {
        x0 = 0;
    }
    if (y0 >= limitH) {
        y0 = 0;
    }
    if (x0 + bw > limitW) {
        bw = limitW - x0;
    }
    if (y0 + bh > limitH) {
        bh = limitH - y0;
    }
    if (bw < 16) {
        bw = 16;
    }
    if (bh < 16) {
        bh = 16;
    }
    scale = Math.min(bw / sw, bh / sh);
    dw = Math.round(sw * scale);
    dh = Math.round(sh * scale);
    dw -= dw % 4;
    dh -= dh % 2;
    if (dw < 16) {
        dw = 16;
    }
    if (dh < 16) {
        dh = 16;
    }
    if (dw > bw) {
        dw = bw - (bw % 4);
    }
    if (dh > bh) {
        dh = bh - (bh % 2);
    }
    if (dw < 16) {
        dw = 16;
    }
    if (dh < 16) {
        dh = 16;
    }
    x = x0 + Math.floor((bw - dw) / 2);
    y = y0 + Math.floor((bh - dh) / 2);
    x -= x % 2;
    y -= y % 2;
    if (x < 0) {
        x = 0;
    }
    if (y < 0) {
        y = 0;
    }
    if (x + dw > limitW) {
        x = limitW - dw;
        x -= x % 2;
    }
    if (y + dh > limitH) {
        y = limitH - dh;
        y -= y % 2;
    }
    if (x < 0) {
        x = 0;
    }
    if (y < 0) {
        y = 0;
    }
    return { x: x, y: y, w: dw, h: dh };
}

/*
 * Project a window box from one screen onto another of a different size.
 * The size scales by one factor (the window keeps its shape and fits the
 * smaller side). The place keeps its share of the free room: a window in
 * the top-left corner lands in the top-left corner, a centred one stays
 * centred, one at the bottom-right edge stays there. Width is a multiple
 * of 4 and x, y, h even, which cluster-render wants for a video layer.
 */
function projectBox(box, fromW, fromH, toW, toH) {
    var src = box || {};
    var scale = Math.min(toW / fromW, toH / fromH);
    var bw = src.w || fromW;
    var bh = src.h || fromH;
    var bx = src.x || 0;
    var by = src.y || 0;
    var freeW = fromW - bw;
    var freeH = fromH - bh;
    var w = even4(Math.round(bw * scale));
    var h = even2(Math.round(bh * scale));
    var rx;
    var ry;
    var x;
    var y;
    if (w < 16) {
        w = 16;
    }
    if (h < 16) {
        h = 16;
    }
    if (w > toW) {
        w = toW - (toW % 4);
    }
    if (h > toH) {
        h = toH - (toH % 2);
    }
    rx = freeW > 0 ? bx / freeW : 0.5;
    ry = freeH > 0 ? by / freeH : 0.5;
    if (rx < 0) {
        rx = 0;
    } else if (rx > 1) {
        rx = 1;
    }
    if (ry < 0) {
        ry = 0;
    } else if (ry > 1) {
        ry = 1;
    }
    x = evenDown(Math.round(rx * (toW - w)));
    y = evenDown(Math.round(ry * (toH - h)));
    if (x + w > toW) {
        x = evenDown(toW - w);
    }
    if (y + h > toH) {
        y = evenDown(toH - h);
    }
    return { x: x, y: y, w: w, h: h };
}

/*
 * Frame size for a quality profile (pw x ph, given landscape). A portrait
 * source uses the same profile turned (ph x pw), so both get the same pixel
 * budget. Aspect kept, never enlarged. Both sides are multiples of 4: the
 * frame stays a legal cluster-render video (width % 4) after a 90 degree
 * turn too.
 */
function profileDims(sw, sh, pw, ph) {
    var portrait = sh > sw;
    var bw = portrait ? ph : pw;
    var bh = portrait ? pw : ph;
    var scale = Math.min(bw / sw, bh / sh, 1);
    var w = even4(Math.round(sw * scale));
    var h = even4(Math.round(sh * scale));
    if (w < 64) {
        w = 64;
    }
    if (h < 32) {
        h = 32;
    }
    return { w: w, h: h };
}

// True when the frame needs no scaling for this profile (either orientation).
function fitsProfile(w, h, pw, ph) {
    var portrait = h > w;
    return w <= (portrait ? ph : pw) && h <= (portrait ? pw : ph);
}

// Scale one decoded I420 frame to a profile. One pass over the output pixels.
function scaleToProfile(i420, sw, sh, pw, ph) {
    var dims = profileDims(sw, sh, pw, ph);
    var out;
    if (dims.w === sw && dims.h === sh) {
        return { i420: i420, w: sw, h: sh };
    }
    out = fitI420(i420, sw, sh, dims.w, dims.h, 'contain');
    return { i420: out.i420, w: out.w, h: out.h };
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

function rotateI420(i420, w, h, quarters) {
    var q = ((quarters % 4) + 4) % 4;
    var ySize = w * h;
    var uvW = w >> 1;
    var uvH = h >> 1;
    var srcU = ySize;
    var srcV = ySize + uvW * uvH;
    var nw;
    var nh;
    var out;
    var x;
    var y;
    var nx;
    var ny;
    var duvW;
    var duvH;
    var uOff;
    var vOff;
    if (!q) {
        return { i420: i420, w: w, h: h };
    }
    if (q === 2) {
        nw = w;
        nh = h;
    } else {
        nw = h;
        nh = w;
    }
    duvW = nw >> 1;
    duvH = nh >> 1;
    out = Buffer.alloc(nw * nh * 3 / 2);
    uOff = nw * nh;
    vOff = uOff + duvW * duvH;
    for (y = 0; y < h; y += 1) {
        for (x = 0; x < w; x += 1) {
            if (q === 1) {
                nx = h - 1 - y;
                ny = x;
            } else if (q === 2) {
                nx = w - 1 - x;
                ny = h - 1 - y;
            } else {
                nx = y;
                ny = w - 1 - x;
            }
            out[ny * nw + nx] = i420[y * w + x];
        }
    }
    for (y = 0; y < uvH; y += 1) {
        for (x = 0; x < uvW; x += 1) {
            if (q === 1) {
                nx = uvH - 1 - y;
                ny = x;
            } else if (q === 2) {
                nx = uvW - 1 - x;
                ny = uvH - 1 - y;
            } else {
                nx = y;
                ny = uvW - 1 - x;
            }
            out[uOff + ny * duvW + nx] = i420[srcU + y * uvW + x];
            out[vOff + ny * duvW + nx] = i420[srcV + y * uvW + x];
        }
    }
    return { i420: out, w: nw, h: nh };
}

module.exports = {
    evenDown: evenDown,
    even2: even2,
    even4: even4,
    fitRect: fitRect,
    containPlace: containPlace,
    projectBox: projectBox,
    profileDims: profileDims,
    fitsProfile: fitsProfile,
    scaleToProfile: scaleToProfile,
    fitI420: fitI420,
    rotateI420: rotateI420,
};
