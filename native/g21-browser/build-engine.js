#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/*
 * build-engine.js - packs Google's chrome-headless-shell for the head unit (development machine only).
 *
 *   node build-engine.js <dir of chrome-headless-shell-linux64> [out dir = ./engine]
 *
 * Takes the files the engine needs, unchanged, writes them as one stream
 *   entry = u16 name length, name, u32 mode, u64 size, data
 * compresses it with brotli and cuts it into parts under 45 MB, and writes engine/manifest.json:
 * every file with its SHA-256, and Google's address of the same build.
 *
 * Only manifest.json goes into the repository. The head unit downloads the engine from Google
 * itself (g21-browserd.js) and keeps a file only when its SHA-256 is the manifest's. The packed
 * parts are for this machine: tools/test_browser_tool.js runs the real engine from them, and the
 * daemon uses them instead of a download when they lie beside the manifest (.gitignore keeps them
 * out of git: Google's binary is Google's to hand out). Nothing in the engine is modified here.
 */
const fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');

const FILES = [
    ['chrome-headless-shell.real', 'chrome-headless-shell', 0o755], // (the Playwright image renames the binary; Google's zip calls it chrome-headless-shell)
    ['chrome-headless-shell', 'chrome-headless-shell', 0o755],
    ['icudtl.dat', 'icudtl.dat', 0o644],
    ['v8_context_snapshot.bin', 'v8_context_snapshot.bin', 0o644],
    ['headless_lib_data.pak', 'headless_lib_data.pak', 0o644],
    ['headless_lib_strings.pak', 'headless_lib_strings.pak', 0o644],
    ['headless_command_resources.pak', 'headless_command_resources.pak', 0o644],
    ['libEGL.so', 'libEGL.so', 0o755],
    ['libGLESv2.so', 'libGLESv2.so', 0o755],
    ['libvk_swiftshader.so', 'libvk_swiftshader.so', 0o755],
    ['libvulkan.so.1', 'libvulkan.so.1', 0o755],
    ['vk_swiftshader_icd.json', 'vk_swiftshader_icd.json', 0o644]
];
const PART = 44 * 1024 * 1024;
const INTERP_TO = '/run/g21-browser/ld.so';

function isElf(file) { const b = Buffer.alloc(4); const fd = fs.openSync(file, 'r'); fs.readSync(fd, b, 0, 4, 0); fs.closeSync(fd); return b.toString('latin1') === '\x7fELF'; }
function sha(file) { const h = crypto.createHash('sha256'); const fd = fs.openSync(file, 'r'); const b = Buffer.alloc(1 << 20); let n; while ((n = fs.readSync(fd, b, 0, b.length, null)) > 0) h.update(b.subarray(0, n)); fs.closeSync(fd); return h.digest('hex'); }
// PT_INTERP of a 64-bit ELF: {offset, size, value}
function interp(file) {
    const fd = fs.openSync(file, 'r'); const h = Buffer.alloc(64); fs.readSync(fd, h, 0, 64, 0);
    const phoff = Number(h.readBigUInt64LE(32)), phentsize = h.readUInt16LE(54), phnum = h.readUInt16LE(56);
    let out = null;
    for (let i = 0; i < phnum && !out; i++) {
        const ph = Buffer.alloc(phentsize); fs.readSync(fd, ph, 0, phentsize, phoff + i * phentsize);
        if (ph.readUInt32LE(0) === 3) {
            const off = Number(ph.readBigUInt64LE(8)), size = Number(ph.readBigUInt64LE(32)); const v = Buffer.alloc(size); fs.readSync(fd, v, 0, size, off);
            out = { offset: off, size: size, from: v.toString('latin1').replace(/\0+$/, ''), to: INTERP_TO };
        }
    }
    fs.closeSync(fd); return out;
}

async function main() {
    const src = process.argv[2], out = process.argv[3] || path.join(__dirname, 'engine');
    if (!src) { console.error('usage: build-engine.js <chrome-headless-shell-linux64 dir> [out dir]'); process.exit(2); }
    const quality = Number(process.env.G21_BROTLI_QUALITY || 11);
    fs.mkdirSync(out, { recursive: true });
    fs.readdirSync(out).filter((n) => /^engine\.pack\.br\.\d+$/.test(n)).forEach((n) => fs.unlinkSync(path.join(out, n)));
    const files = [], seen = {};
    for (const [from, to, mode] of FILES) {
        const p = path.join(src, from);
        if (seen[to] || !fs.existsSync(p)) continue;
        if (to === 'chrome-headless-shell' && !isElf(p)) continue; // the image's wrapper script
        seen[to] = true;
        files.push({ path: to, from: p, mode: mode, size: fs.statSync(p).size, sha256: sha(p) });
    }
    const need = FILES.map((f) => f[1]).filter((n, i, a) => a.indexOf(n) === i && !seen[n]);
    if (need.length) throw new Error('missing in ' + src + ': ' + need.join(', '));
    const bin = files[0];
    const br = zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: quality, [zlib.constants.BROTLI_PARAM_LGWIN]: 24, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: files.reduce((a, f) => a + f.size, 0) } });
    const parts = [];
    let cur = null;
    const done = new Promise((resolve, reject) => {
        br.on('data', (d) => {
            while (d.length) {
                if (!cur || cur.size >= PART) {
                    if (cur) { fs.closeSync(cur.fd); cur.sha256 = cur.h.digest('hex'); }
                    const name = 'engine.pack.br.' + String(parts.length).padStart(2, '0');
                    cur = { name: name, fd: fs.openSync(path.join(out, name), 'w'), size: 0, h: crypto.createHash('sha256') }; parts.push(cur);
                }
                const take = d.subarray(0, Math.min(d.length, PART - cur.size));
                fs.writeSync(cur.fd, take); cur.h.update(take); cur.size += take.length; d = d.subarray(take.length);
            }
        });
        br.on('end', () => { if (cur) { fs.closeSync(cur.fd); cur.sha256 = cur.h.digest('hex'); } resolve(); });
        br.on('error', reject);
    });
    const put = (b) => new Promise((r) => { if (br.write(b)) r(); else br.once('drain', r); });
    for (const f of files) {
        const name = Buffer.from(f.path, 'utf8'), head = Buffer.alloc(2 + name.length + 4 + 8);
        head.writeUInt16LE(name.length, 0); name.copy(head, 2); head.writeUInt32LE(f.mode, 2 + name.length); head.writeBigUInt64LE(BigInt(f.size), 6 + name.length);
        await put(head);
        const fd = fs.openSync(f.from, 'r'); const b = Buffer.alloc(1 << 20); let n;
        while ((n = fs.readSync(fd, b, 0, b.length, null)) > 0) await put(Buffer.from(b.subarray(0, n)));
        fs.closeSync(fd);
    }
    br.end(); await done;
    let product = '';
    // the machine's own loader and libraries first, then the ones the head unit gets (lib/): a development machine need not have Chrome's libraries
    const run = require('child_process').execFileSync, libs = path.join(__dirname, 'lib');
    try { product = run(bin.from, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch (e) {
        try { product = run(path.join(libs, 'ld-linux-x86-64.so.2'), ['--library-path', libs, bin.from, '--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch (e2) { product = ''; }
    }
    // no version means no address of the same build at Google: a manifest like that would send the head unit to a file that is not there
    if (!/\d+\.\d+\.\d+\.\d+/.test(product)) throw new Error('cannot read the engine version (' + bin.from + ' --version did not run here); the manifest was not written');
    const manifest = {
        schema: 1, product: product, binarySha256: bin.sha256,
        // where the head unit fetches the engine itself (Google's Chrome for Testing storage); the packed parts below stay on the development machine
        source: { url: 'https://storage.googleapis.com/chrome-for-testing-public/' + ((/(\d+\.\d+\.\d+\.\d+)/.exec(product) || [0, 'UNKNOWN'])[1]) + '/linux64/chrome-headless-shell-linux64.zip', prefix: 'chrome-headless-shell-linux64/' },
        format: 'g21pack1+brotli',
        interp: interp(bin.from),
        files: files.map((f) => ({ path: f.path, mode: f.mode, size: f.size, sha256: f.sha256 })),
        parts: parts.map((p) => ({ name: p.name, size: p.size, sha256: p.sha256 }))
    };
    fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log(product + ': ' + files.length + ' files, ' + Math.round(files.reduce((a, f) => a + f.size, 0) / 1e6) + ' MB -> ' + parts.length + ' parts, ' + Math.round(parts.reduce((a, p) => a + p.size, 0) / 1e6) + ' MB (brotli ' + quality + ')');
}
main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
