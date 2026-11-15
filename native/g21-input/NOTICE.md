# G21 Input: where its parts come from

G21 Input is THEiPlay's own module (GPL-3.0-or-later). Nothing of BMW's is copied or shipped: the interface
schemas are made on the head unit from its own catalog (`/etc/oap/someip/someip-interfaces.json`).

| Part | From | Licence | Changed |
|---|---|---|---|
| `someip_iface.js` | Vizualyse/idrive-apps: `tools/someip_iface.py` and the `schemaGen` of `platform/tool/speakers/1.0.0/speakers.js` (commit 5675eb4), Copyright (C) 2026 Yousaf Khan | GPL-3.0-or-later | one JavaScript module, with fields and events |
| `g21-inputd.js` | written here. What to read and write is Moonride's finding (`apps/jap_moonride/main.js`, `input.js`, commit d1073ce, Copyright (C) 2026 JustAnotherPU): `ControllerElements.ZBETouchFrontSide` in touch mode, which `FrontCCU.ccsControlTouchCCU = TOUCH_AKTIV` switches on | GPL-3.0-or-later | own code |

Moonride is not needed on the car, nor its daemon, Sunshine, Moonlight or the internet.

Runtime needs of the head unit: `/usr/bin/node` (8), `/usr/lib/someip.node`, the catalog above.
