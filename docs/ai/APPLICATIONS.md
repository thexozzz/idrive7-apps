# Aplikacje i narzędzia

## `g21_hello` 0.1.0 (aplikacja, MIT)

Szablon pakietu źródłowego: jeden stan RHMI, tytuł, etykieta (`src/main.js`). Na tym G21 tekst RHMI się nie rysuje (H18) → realnie pusta strona. — VERIFIED kod; zachowanie na aucie ASSUMPTION (nie ma logu instalacji hello).

## `g21_airplay` „THEiPlay” 0.1.121 (aplikacja, MIT + pliki obce)

Punkt wejścia: `package/package.json` `main: javascript/runner.js` (wstawia dawca) → wygenerowany `javascript/app.js` z modułów `mgu-app.json`. Klasa `AirPlayApp` w `src/main.js` (OnlineApp). Start: `AppBookmarks` → `WakeUpOnDemand` → `Provisioning` (wymagane interfejsy w `manifest.json`). Kafelek pod stanem 20974, `config/base.json` włącza `rhmiLoadingEnabled`/`entryPointLoadingEnabled`.

Cykl życia (log `start`): `load → construct → constructed → start-called → status-ready → initialized → app-init → cluster-ready → ready → config-panel :1235 → visible → menu-show → menu-socket → menu-ready → menu-claim → menu-frame…`, zamknięcie `shutdown {"reason":"STOP_REQUEST"}` → `menu-drop close`. — VERIFIED (`dev-logs/…161219`).

### Stan modułów funkcjonalnych

| Funkcja | Status | Dowód / uwagi |
|---|---|---|
| Menu na rendererze (prostokąty, czcionka bitmapowa, PL/EN) | VERIFIED | właściciel 2026-11-12; logi |
| Dotyk w menu | VERIFIED | `menu-touch`, `menu-hit` |
| Pokrętło w menu (CCU z renderera) | ASSUMPTION | kod `menu_draw.js:take()` (`CCU`/`X_CCU`); CHANGELOG 0.1.84/0.1.110 opisuje działanie, brak logu |
| Klawiatura pokrętłem (IP/konto/hasło) | UNVERIFIED (H27) | `knob_keyboard.js`, test lokalny OK |
| AirPlay — odbiornik, mDNS | VERIFIED: avahi wstaje na `wlan0` 172.20.10.2; UxPlay „Initialized server socket(s)” | log 2026-11-12 |
| AirPlay — sesja/obraz na środku | UNVERIFIED (patrz AIRPLAY_ARCHITECTURE) | |
| AirPlay — audio przez SmartX | UNVERIFIED | commit „Play AirPlay audio through the SmartX…”, log pokazuje jeszcze `audio_disabled` (stara wersja) |
| AirPlay — PIN / bez kodu | UNVERIFIED | `-pin NNNN` / open |
| Obraz na KOMBI (`map`/`panel`) i HUD | UNVERIFIED dla wideo; VERIFIED dla małego napisu (warstwy `shown`) | log `label-on panel 360x80`, `cluster-layer N shown` |
| Wybór ekranu, okno, pozycja, rozmiar, obrót | UNVERIFIED (logika testowana lokalnie) | `frame_fit.js`, `test_display.js` |
| RDP (FreeRDP 2.2 `g21-rdp`, GDI programowe 1920×720) | BROKEN w ostatnim logu: setki `g21-rdp status error|freerdp|` | `dev-logs/…170432` |
| VNC (RFB 3.8, Raw/CopyRect, DES auth) | UNVERIFIED | `vnc_client.js`, test lokalny OK |
| Windows Win+K (MS-MICE, `g21-mice`, `_display._tcp`) | UNVERIFIED (H28–H36) | |
| YouTube (przez `jap-ridetube-d`) | UNVERIFIED, w trakcie (niezatwierdzone logowanie QR) | diff vs `origin/test` |
| Panel konfiguracji HTTP :1235 | VERIFIED start (`config-panel :1235`) | log |
| Bramka postoju | **BROKEN celowo**: `_parkFlag()` → `true`; test `test_display.js` asertuje „outputs stay on at any speed” | `main.js:1278`, wynik testu |
| Seed profilu RDP z hasłem | **BROKEN (bezpieczeństwo)** | `main.js:_seedBuiltinRdp` (~l. 594) |

Uwaga o rozjeździe dokumentacji i kodu: `README.md` aplikacji i CHANGELOG 0.1.71 mówią „tylko AirPlay, HUD wyłączony”, a nowsze wersje przywracają HUD, YouTube, RDP/VNC/Win+K są nadal w kodzie i w opisie `mgu-repo.json`. `docs/AIRPLAY_RENDER_PIPELINE.md` opisuje 720p/1080p i bramkę postoju, a kod wymusza 600×400@24 i nie ma bramki. Źródłem prawdy jest kod.

## Narzędzie `g21-airplay-open` 0.1.45 (root, systemd, MIT + binaria GPL/LGPL)

Usługa `g21-airplay-open.service` (`Restart=always`, `SupplementaryGroups=video`, `XDG_RUNTIME_DIR=/run/wayland`) uruchamia pętlę skryptu `g21-airplay-open`, która co ~1 s czyta `/run/g21-session/allow` i stan uplinku i wykonuje `apply()`:

| `allow` | Akcja (`apply_*`) |
|---|---|
| `airplay` | `find_uplink_wifi` → `open_ports` (nft + trasy) → `ensure_mdns` (avahi) → `start_ux` |
| `windows` | avahi `_display._tcp` + `g21-mice` (TCP 7250, RTP UDP 1028/1029) |
| `rdp`/`vnc` | `g21-rdp` / mostek `frame.sock` + `g21-present` |
| `stop` / brak | `idle()`: stop wszystkiego, usunięcie reguł nft i tras |

Binaria: `uxplay.bin` (UxPlay 1.73.7 zmodyfikowany, Ubuntu 18.04), `avahi-daemon` 0.7, `g21-rdp`, `g21-present`, `g21-mice`, `g21-detach` (statyczny `setsid`), `g21-bind-wlan.so` (LD_PRELOAD: bind na IP wlan0), `gst-launch-1.0`, `run-elf`. Źródła C własne są obok binariów. — VERIFIED.

## Narzędzie `jap-ridetube-d` 0.3.9 (GPL-3.0-or-later, autor zewnętrzny)

Demon YouTube (`ytd.js` na `jap-node22`, `ytdlp.pyz`, dekoder `ytdec`) sterowany przez `/run/jap-ridetube-d/ctl.sock`, wideo w `/dev/shm/mgu-video-ridetube`. Wymaga `mgu-render` 0.6.11, `mgu-python` 1.0.2, `jap-node22` 22.23.4. — VERIFIED (`component.json`). Pochodzenie: aplikacja `jap_ridetube` (kopia w `third_party/ridetube`, także w lokalnym klonie `idrive7-apps/apps/jap_ridetube`). UNVERIFIED: upstream i zgoda autora na redystrybucję w tym repo.

## Zależności zewnętrzne w runtime

| Komponent | Dostawca | Rola |
|---|---|---|
| `cluster-render` 0.5.4+ (lokalny klon 0.5.8) | robertnisipeanu/idrive-apps (GPL-3.0) | warstwy KOMBI/HUD |
| renderer `mgu-render` / `idrive7-renderd` | cauliflowermossgrape/idrive7-apps (MIT) i/lub Store | menu i wideo na środku, dotyk, CCU |
| `mgu-inputgate` 1.0.0 (preload w `HmiMain3D`) | idrive7-apps | pokrętło dla aplikacji — UNVERIFIED czy zainstalowany |
| `mgu-uplink`, `mgu-deploy` | robertnisipeanu/mgu-store (GPL-3.0) | sieć Wi-Fi, instalacja/link |
| `iteriodev-tailscale` | IterioDev/car-apps (PolyForm Strict) | dostęp do PC przez tailnet |
