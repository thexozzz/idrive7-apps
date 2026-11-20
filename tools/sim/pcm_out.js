'use strict';
// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * tools/sim/pcm_out.js play DEVICE live|plain: a stand-in for g21-audio-out on the stand. It reads its pipe at the
 * pace of the clock (48 kHz stereo S16: 192 bytes a millisecond), as the car's sound device takes it, and speaks the
 * writer's lines on stderr (waiting for sound, active, open, quiet, sound, frames, idle). ALSA's "null" device, which
 * the real writer can play into here, takes everything at once: a player that is held by its sound (the browser's
 * engine) then races, which is not what happens in the car.
 * G21_AUDIO_IDLE_MS as the real one. Nothing is played anywhere.
 */
const fs = require('fs');
const say = (t) => process.stderr.write('[G21-AUDIO] out: ' + t + '\n');
const idle = Number(process.env.G21_AUDIO_IDLE_MS) || 3000;
const fd = fs.openSync('/proc/self/fd/0', fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
const buf = Buffer.alloc(65536);
let bytes = 0, active = false, last = Date.now(), at = Date.now(), loudAt = 0, quiet = false, report = 0, budget = 0;
say('waiting for sound');
process.on('SIGTERM', () => { say('stopped, frames ' + (bytes >> 2) + ' dropped 0 (full 0) xruns 0'); process.exit(0); });
setInterval(() => {
    const now = Date.now();
    budget = Math.min(19200, budget + (now - at) * 192);
    at = now;
    let loud = false, want = Math.floor(budget / 4) * 4;
    while (want > 0) {
        let n = 0;
        try { n = fs.readSync(fd, buf, 0, Math.min(buf.length, want), null); } catch (e) { break; }
        if (!n) break;
        want -= n; budget -= n; bytes += n; last = now;
        for (let i = 0; i + 1 < n; i += 6) { const v = buf.readInt16LE(i); if (v > 16 || v < -16) { loud = true; break; } }
    }
    if (!active && bytes) { active = true; loudAt = now; report = now + 5000; say('active'); say('open ' + process.argv[3] + ', S16LE 48000 Hz 2 ch, buffer 250000 us (the stand\'s clock)'); }
    if (!active) { budget = 0; return; }
    if (loud) { loudAt = now; if (quiet) { quiet = false; say('sound'); } }
    else if (!quiet && now - loudAt > 1500) { quiet = true; say('quiet'); }
    if (now >= report) { report = now + 5000; say('frames ' + (bytes >> 2) + ' dropped 0 (full 0) xruns 0 delay_ms 40'); }
    if (now - last > idle) { say('idle, frames ' + (bytes >> 2) + ' dropped 0 (full 0) xruns 0 silence 0'); process.exit(0); }
}, 5);
