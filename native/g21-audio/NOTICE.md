# G21 Audio: where its parts come from

G21 Audio is THEiPlay's own module (GPL-3.0-or-later). It is built on ways that were already proven on ID7
head units; nothing of BMW's is copied or shipped.

| Part | From | Licence | Changed |
|---|---|---|---|
| `speakers.js` | Vizualyse/idrive-apps, `platform/tool/speakers/1.0.0/speakers.js` (commit 5675eb4), Copyright (C) 2026 Yousaf Khan | GPL-3.0-or-later | no |
| `g21-audio-out.c` | written here; the way of writing to SmartX (dlopen of the system's libasound, non-blocking, 64 ms, drop instead of queue) follows JustAnotherPU/moonride `native/mgu-moonlight/src/audio.cpp` (commit d1073ce), Copyright (C) 2026 JustAnotherPU | GPL-3.0-or-later | own code |
| `g21-audiod.js` | written here | GPL-3.0-or-later | |

Facts taken from public notes, not code: Vizualyse/idrive-apps `knowledge/sound.md` (CarLifeMedia 287,
MediaSink_Front 1024, RoutingControlObserver, the SmartX lock's group and mode), pllanaio/mgu-browser
`docs/AUDIO.md` (the browser engine's sound through a private ALSA file device into a FIFO).

The file backend (a finished audio file through BMW's MediaPlayer, source OAPGenericMedia 1046) is not in this
module yet: YouTube still plays through `jap-ridetube-d` (JustAnotherPU/ridetube, GPL-3.0-or-later).

Runtime needs of the head unit: `/usr/bin/node` (8), `/usr/lib/someip.node`,
`/etc/oap/someip/someip-interfaces.json`, `libasound.so.2` with its SmartX plugin, the group `mgu_alsa`.
