# Ekosystem iDrive 7 — repozytoria zewnętrzne

Sprawdzone 2026-11-14 płytkim klonem (`git clone --depth 1`). Kodu nie kopiowano. „Zgodność” = czy można z tego korzystać w naszym projekcie (MIT) bez łamania licencji.

| Repo | HEAD (data) | Licencja | Co zawiera / przydatność | Użycie u nas |
|---|---|---|---|---|
| [robertnisipeanu/idrive-apps](https://github.com/robertnisipeanu/idrive-apps) | `f7a678b` (2026-11-13); lokalny klon `84e14d6` | GPL-3.0 (klient JS: MPL-2.0) | `cluster-render` 0.5.8 (KOMBI `map`/`panel`, HUD), `PROTOCOL.md`, aplikacja Waze-na-zegarach, `tools/oap_link.js`, `oap_pack.js` | runtime cluster-render (narzędzie Store); `cluster_render_client.js` skopiowany z nagłówkiem MPL — OK (MPL plikowa) |
| [robertnisipeanu/mgu-store](https://github.com/robertnisipeanu/mgu-store) | `9c2360a` (2026-11-13) | GPL-3.0 | Store, `mgu-deploy` (link/instalacja/rollback), `mgu-uplink` (Wi-Fi/LTE/tethering, nft), `docs/PUBLISHING.md` | kanał instalacji; tylko jako usługa |
| [cauliflowermossgrape/idrive7-apps](https://github.com/cauliflowermossgrape/idrive7-apps) | `8d860de` (2026-11-14); lokalny klon `58cb47d` | MIT (części `third_party` osobno) | renderer GPU `mgu-render`/`idrive7-renderd` + `mgu-inputgate`, `PROTOCOL.md`, emulator `emu.js`, `extract_sdk.js`, `parked.js`, opis platformy (§4), SOME/IP sygnały (§7). Aplikacje: Redline, Dyno, Live Data, **Engine Config** (pisze do DME/DSC — nie dla nas), **Transmission Config** (ZF 8HP, odczyt EGS), Ambient, Service, Fault Scanner (UDS) | najlepsze źródło wiedzy o renderze i OAP; MIT = można się wzorować z atrybucją |
| [NamelsMissing/mgu-apps](https://github.com/NamelsMissing/mgu-apps) | `18c0657` (2026-11-14) | MIT (+ `THIRD_PARTY_NOTICES`) | **budowane na G21 ID7**: DPF Monitor, AutoHeating, GIF Home, Phone Terminal, Ambient, **Custom Cluster** (eksperymentalny, odczyt `getValue` co 5 s dla prędkości), Video Hub (port na `wlan_bridge`, mgu-render video), narzędzia `phone-bridge`, `video-net`, `equalizer-dsp`, `display-bridge` (DBR1) | wzorzec: firewall tylko na `wlan_bridge`, odczyt prędkości, cluster; MIT |
| [IterioDev/car-apps](https://github.com/IterioDev/car-apps) | `cdab455` (2026-11-13) | **PolyForm Strict 1.0.0** (bez modyfikacji i dzieł pochodnych) | Ambient, Car Data, Drag Timer, Drive Recorder, Live Adjustments, Seats/Comfort, **Tailscale**, Screencast, Overlays; większość tylko iDrive 8 | używamy jedynie `iteriodev-tailscale` jako usługi; **nie kopiować, nie modyfikować** |
| [hexlay/idrive7-custom-apps](https://github.com/hexlay/idrive7-custom-apps) | `a856fdc` (2026-11-14) | GPL-3.0 (+ LICENSE.MIT dla części) | Spotify Connect, M-Copilot; opisuje MGU High / Atom A3960; usunięte „M-Cinema” (YouTube) — słabe odtwarzanie | tylko lektura |
| [FDH2/UxPlay](https://github.com/FDH2/UxPlay) v1.73.7 `df67c21` | — | GPL-3.0 | silnik AirPlay | zmodyfikowany w `third_party/UxPlay`, binarka w narzędziu; GPL wymaga udostępnienia źródeł — są w repo |
| `jap_ridetube` / `jap-ridetube-d` | upstream UNVERIFIED | GPL-3.0-or-later | YouTube | narzędzie w `native/` (OK jako GPL), **kopia JS w aplikacji MIT — K-06** |
| JustAnotherPU/moonride `d1073ce` | — | GPL-3.0-or-later | sygnały wejścia (nie kopiowane) | tylko nazwy sygnałów |
| eroobeeroo/idrive7-cluster-info `10cefda` | — | PolyForm Noncommercial (od 2026-11-10) | panel na Waze/HUD | tylko lektura |

Tematy GitHub `idrive-app`, `idrive7`, `mgu`: wyszukiwanie po tematach nie było możliwe w tej sesji (brak dostępu do API GitHub) — UNVERIFIED.

## Przydatność według tematu

| Temat | Gdzie szukać |
|---|---|
| SDK MGU (OAP) | `idrive7-apps/kit/tools/extract_sdk.js`, lokalny `../idrive7-apps/oap-sdk/` (24.10.2, nie publikować) |
| Emulator | `idrive7-apps/kit/tools/emu.js`, `docs/emulator.md` (lokalnie z poprawkami Windows) |
| Kompilacja natywna | `idrive7-apps/kit/renderd/docker` (Ubuntu 18.04), `idrive-apps/native/cluster-render/docker` |
| Pakietowanie | `mgu-store/docs/PUBLISHING.md`, `idrive-apps/tools/oap_pack.js`, `oap_link.js` |
| Natywny interfejs BMW (RHMI) | `idrive7-apps/docs/rhmi-widgets.md`, README §4.4 |
| Renderowanie środka | `idrive7-apps/kit/renderd/PROTOCOL.md`, `README.mgu-render.md` |
| Cluster / HUD | `idrive-apps/native/cluster-render/README.md`, `PROTOCOL.md`; `NamelsMissing/mgu-apps/apps/custom_cluster` |
| SOME/IP | `/etc/oap/someip/someip-interfaces.json` (na aucie), idrive7-apps README §7 |
| Diagnostyka / UDS | idrive7-apps Fault Scanner, Live Data (TASU) — **tylko odczyt** |
| Comfort / Ambient | IterioDev Comfort (PolyForm), NamelsMissing `g21_ambient` (MIT) |
| Engine / Transmission Config, Live Adjustments | idrive7-apps, IterioDev — **zapisują do sterowników: poza zakresem** |
