'use strict';

/*
 * The H.264 decoder is UxPlay's own GStreamer element (decodebin, which
 * selects vaapi or avdec_h264). video_renderer.c tees that one decoded
 * I420 image to /run/g21-airplay/latest.yuv. This module does not decode
 * a second time. It turns that I420 into the cluster-render atlas.
 */

function parseI420(buf) {
    if (!buf || buf.length < 8) {
        return null;
    }
    if (buf[0] !== 0x47 || buf[1] !== 0x32 || buf[2] !== 0x31 || buf[3] !== 0x59) {
        return null;
    }
    var w = buf.readUInt16LE(4);
    var h = buf.readUInt16LE(6);
    if (w < 2 || h < 2 || (w % 2) !== 0 || (h % 2) !== 0) {
        return null;
    }
    var need = 8 + (w * h * 3) / 2;
    if (buf.length < need) {
        return null;
    }
    return { w: w, h: h, i420: buf.slice(8, need) };
}

function scaleI420(src, sw, sh, dw, dh) {
    if ((dw % 2) !== 0 || (dh % 2) !== 0) {
        throw new Error('target size must be even');
    }
    var sy = sw * sh;
    var su = sy + (sw / 2) * (sh / 2);
    var y = Buffer.alloc(dw * dh);
    var u = Buffer.alloc((dw / 2) * (dh / 2));
    var v = Buffer.alloc((dw / 2) * (dh / 2));
    var row;
    var col;
    for (row = 0; row < dh; row++) {
        var sy0 = Math.min(sh - 1, Math.floor(row * sh / dh));
        for (col = 0; col < dw; col++) {
            var sx0 = Math.min(sw - 1, Math.floor(col * sw / dw));
            y[row * dw + col] = src[sy0 * sw + sx0];
        }
    }
    for (row = 0; row < dh / 2; row++) {
        var suy = Math.min(sh / 2 - 1, Math.floor(row * (sh / 2) / (dh / 2)));
        for (col = 0; col < dw / 2; col++) {
            var sux = Math.min(sw / 2 - 1, Math.floor(col * (sw / 2) / (dw / 2)));
            u[row * (dw / 2) + col] = src[sy + suy * (sw / 2) + sux];
            v[row * (dw / 2) + col] = src[su + suy * (sw / 2) + sux];
        }
    }
    return { w: dw, h: dh, y: y, u: u, v: v };
}

function toAtlas(frame) {
    var w = frame.w;
    var h = frame.h;
    var atlas = Buffer.alloc(w * (h + (h >> 1)));
    frame.y.copy(atlas, 0);
    var offset = w * h;
    var row;
    var half = w >> 1;
    for (row = 0; row < (h >> 1); row++) {
        frame.u.copy(atlas, offset, row * half, row * half + half);
        offset += half;
        frame.v.copy(atlas, offset, row * half, row * half + half);
        offset += half;
    }
    return atlas;
}

function atlasFromI420(i420, sw, sh, dw, dh) {
    return toAtlas(scaleI420(i420, sw, sh, dw, dh));
}

function i420ToBgra(i420, w, h) {
    var ySize = w * h;
    var uvW = w >> 1;
    var uvH = h >> 1;
    var uOff = ySize;
    var vOff = ySize + uvW * uvH;
    var bgra = Buffer.alloc(w * h * 4);
    var row;
    var col;
    var y;
    var u;
    var v;
    var c;
    var d;
    var e;
    var r;
    var g;
    var b;
    var i;
    for (row = 0; row < h; row++) {
        for (col = 0; col < w; col++) {
            y = i420[row * w + col];
            u = i420[uOff + (row >> 1) * uvW + (col >> 1)];
            v = i420[vOff + (row >> 1) * uvW + (col >> 1)];
            c = y - 16;
            d = u - 128;
            e = v - 128;
            r = (298 * c + 409 * e + 128) >> 8;
            g = (298 * c - 100 * d - 208 * e + 128) >> 8;
            b = (298 * c + 516 * d + 128) >> 8;
            i = (row * w + col) * 4;
            bgra[i] = b < 0 ? 0 : (b > 255 ? 255 : b);
            bgra[i + 1] = g < 0 ? 0 : (g > 255 ? 255 : g);
            bgra[i + 2] = r < 0 ? 0 : (r > 255 ? 255 : r);
            bgra[i + 3] = 255;
        }
    }
    return bgra;
}

function bgraFromI420(i420, sw, sh, dw, dh) {
    var scaled = scaleI420(i420, sw, sh, dw, dh);
    var packed = Buffer.alloc(dw * dh + (dw * dh) / 2);
    scaled.y.copy(packed, 0);
    scaled.u.copy(packed, dw * dh);
    scaled.v.copy(packed, dw * dh + (dw * dh) / 4);
    return { w: dw, h: dh, bgra: i420ToBgra(packed, dw, dh) };
}

function placeBgra(src, sw, sh, dw, dh, box) {
    var canvas = Buffer.alloc(dw * dh * 4);
    var x0 = box && box.x ? box.x : 0;
    var y0 = box && box.y ? box.y : 0;
    var row;
    var copyW;
    if (x0 < 0) {
        x0 = 0;
    }
    if (y0 < 0) {
        y0 = 0;
    }
    copyW = Math.min(sw, dw - x0) * 4;
    if (copyW < 4) {
        return { w: dw, h: dh, bgra: canvas };
    }
    for (row = 0; row < sh && (y0 + row) < dh; row += 1) {
        src.copy(
            canvas,
            ((y0 + row) * dw + x0) * 4,
            row * sw * 4,
            row * sw * 4 + copyW
        );
    }
    return { w: dw, h: dh, bgra: canvas };
}

function i420IntoRgba(i420, sw, sh, dst, dw, dh) {
    var ySize = sw * sh;
    var uvW = sw >> 1;
    var uOff = ySize;
    var vOff = ySize + uvW * (sh >> 1);
    var row;
    var col;
    var sy;
    var sx;
    var yy;
    var u;
    var v;
    var c;
    var d;
    var e;
    var r;
    var g;
    var b;
    var o;
    for (row = 0; row < dh; row += 1) {
        sy = (row * sh / dh) | 0;
        if (sy >= sh) {
            sy = sh - 1;
        }
        for (col = 0; col < dw; col += 1) {
            sx = (col * sw / dw) | 0;
            if (sx >= sw) {
                sx = sw - 1;
            }
            yy = i420[sy * sw + sx];
            u = i420[uOff + (sy >> 1) * uvW + (sx >> 1)];
            v = i420[vOff + (sy >> 1) * uvW + (sx >> 1)];
            c = yy - 16;
            d = u - 128;
            e = v - 128;
            r = (298 * c + 409 * e + 128) >> 8;
            g = (298 * c - 100 * d - 208 * e + 128) >> 8;
            b = (298 * c + 516 * d + 128) >> 8;
            if (r < 0) {
                r = 0;
            } else if (r > 255) {
                r = 255;
            }
            if (g < 0) {
                g = 0;
            } else if (g > 255) {
                g = 255;
            }
            if (b < 0) {
                b = 0;
            } else if (b > 255) {
                b = 255;
            }
            o = (row * dw + col) << 2;
            dst[o] = r;
            dst[o + 1] = g;
            dst[o + 2] = b;
            dst[o + 3] = 255;
        }
    }
}

module.exports = {
    parseI420: parseI420,
    scaleI420: scaleI420,
    toAtlas: toAtlas,
    atlasFromI420: atlasFromI420,
    i420ToBgra: i420ToBgra,
    bgraFromI420: bgraFromI420,
    placeBgra: placeBgra,
    i420IntoRgba: i420IntoRgba,
};
