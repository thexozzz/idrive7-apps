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

module.exports = {
    parseI420: parseI420,
    scaleI420: scaleI420,
    toAtlas: toAtlas,
    atlasFromI420: atlasFromI420,
};
