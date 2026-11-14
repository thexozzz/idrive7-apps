'use strict';
/**
 * fonts.js - loads the pre-baked glyph atlases (kit/runtime/fonts/*.json,
 * made by kit/tools/bake_fonts.py) and picks the best size for a request.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// THEiPlay: the atlases ship in the package's fonts/ folder. The linked app runs from
// source/javascript/app.js, so that folder is ../fonts there; ./fonts in a source checkout's tests.
const DIRS = [path.join(__dirname, '..', 'fonts'), path.join(__dirname, 'fonts'), path.join(__dirname, '..', 'package', 'fonts'),
    path.join(process.cwd(), '..', 'source', 'fonts')];
const DIR = DIRS.filter((d) => { try { return fs.statSync(path.join(d, 'label.json')).isFile(); } catch (e) { return false; } })[0] || DIRS[0];
const families = Object.create(null);

function family(name) {
    if (families[name] !== undefined) return families[name];
    let fam = null;
    try {
        const j = JSON.parse(fs.readFileSync(path.join(DIR, name + '.json'), 'utf8'));
        fam = j.sizes.map((s) => ({
            size: s.size, ascent: s.ascent, descent: s.descent, atlasW: s.atlasW, atlasH: s.atlasH,
            glyphs: s.glyphs, _alpha: s.alpha, alpha: null, family: name, cacheKey: j.cacheKey || '',
        }));
    } catch (e) { fam = null; }
    families[name] = fam;
    return fam;
}

/** Smallest baked size >= requested (downscaling looks better), else largest. */
function get(name, size, text) {
    // Shared supplemental atlases avoid duplicating glyphs in every numeric size.
    if (text && /[\u3000-\u9fff\uff00-\uffef]/.test(text)) name = 'cjk';
    else if (text && /[\u0400-\u04ff]/.test(text)) name = 'cyrillic';
    const fam = family(name) || family('label');
    if (!fam) return null;
    let best = null;
    for (const f of fam) if (f.size >= size && (!best || f.size < best.size)) best = f;
    if (!best) best = fam[fam.length - 1];
    if (!best.alpha) best.alpha = zlib.inflateSync(Buffer.from(best._alpha, 'base64'));
    return best;
}

function measure(f, s) {
    let w = 0;
    for (const ch of s) { const g = f.glyphs[ch.codePointAt(0)]; if (g) w += g[6]; }   // (no glyph: dropped, as drawn)
    return w;
}

module.exports = { get, measure };
