# Środowisko MGU (BMW G21 320d xDrive 2020, iDrive 7)

Nie podajemy VIN, kluczy, haseł. Adres SSH i ścieżka klucza są w `scripts/dev/_common.ps1` (`Get-DevSshDefaults`) i `../DEVELOPMENT.md`.

## Sprzęt i system

| Fakt | Status | Źródło |
|---|---|---|
| Kernel `Linux 4.14.198-apl x86_64` | VERIFIED (odczyt SSH 2026-11-12) | `docs/01-platforma.md`, sekcja „Hipoteza” (odczyt) |
| `NAME="BMW MGU"`, `VERSION="P18_23w44.2-1-3"`, `VARIANT_ID="mgu-high"` | VERIFIED (odczyt 2026-11-12) | tamże |
| Node aplikacji OAP `v8.16.2` | VERIFIED | tamże; `AGENTS.md` |
| CPU Intel Apollo Lake, GPU i915 (HD Graphics 505), EGL + GLES2 | ASSUMPTION (źródła zewnętrzne, sufiks `-apl` zgodny) | `cauliflowermossgrape/idrive7-apps` README §4.1; `hexlay/idrive7-custom-apps` README (Atom A3960) |
| ~6 GB RAM | UNVERIFIED (brak odczytu `/proc/meminfo` w repo) | brief właściciela |
| BusyBox (1.27, bez appletu `setsid`) + systemd | VERIFIED | `docs/airplay-integracja.md`, commit „replace missing BusyBox setsid with g21-detach” |
| Brak `/lib64`; linker `/lib/ld-linux-x86-64.so.2`; glibc 2.27-kompatybilny | VERIFIED (H23 odczyt 2026-11-12) | `native/g21-airplay-open/UXPLAY.txt`, `run-elf` |
| Rootfs tylko do odczytu; zapis w `/var/opt` (aplikacje `/var/opt/public`) | VERIFIED pośrednio (avahi: „Failed to find user 'avahi'”, potrzeba bind-mount) | `g21-airplay-open:ensure_avahi_account` |
| Ograniczone miejsce na partycji systemowej | UNVERIFIED (brak `df`) | brief |
| eMMC + dysk 2.5" (`/var/opt/hdshare` ~90 GB) | ASSUMPTION | idrive7-apps README §4.1 |
| X11 / standardowy Wayland desktop | **brak** standardowego środowiska; jest kompozytor BMW (Winston/ivi, `XDG_RUNTIME_DIR=/run/wayland`, `wayland-0`), HMI `HmiMain3D` (RAMSES) | VERIFIED częściowo: `.service` i `start_ux`; RAMSES — ASSUMPTION (idrive7-apps README §4.2) |
| VA-API / sprzętowy dekoder H.264 | UNVERIFIED; nasz pakiet GStreamer nie zawiera vaapi → dekodowanie programowe `avdec_h264` | `native/g21-airplay-open/LIBS.txt` |

## Dostęp root

- Root SSH uzyskany 2026-11-11 narzędziem zewnętrznym „MGU-SSH” (wgranie obrazu debug MGU ID7 BDC2/BDC3 przez ENET). — VERIFIED (`data/data/logs/session-20261111T160821Z-flash.log`, nagłówek). Szczegółów nie powielamy; plik zawiera dane identyfikacyjne jednostki.
- Klucze: poza repo (`%USERPROFILE%\.ssh\g21_mgu_root`, zapas `%TEMP%\mgu-read-only\id_rsa`); kopia kluczy także w `..\data\data\assets\` (poza gitem). — VERIFIED (lista plików, treści nie czytano).
- Adres przez hotspot BMW wg mgu-store: `172.16.222.97`; obecnie używany adres Tailscale (100.64/10) z `_common.ps1`. — VERIFIED (pliki).

## Platforma OAP (aplikacje)

| Fakt | Status | Źródło |
|---|---|---|
| `oapcontroller.service` → MainApp `/usr/lib/oap-mainapp` (uid 12201); aplikacja = osobny uid, katalog `/var/opt/public/oap/oap_<uid>/` | ASSUMPTION (zewnętrzne) + VERIFIED dla naszego uid **12249** (`oap_12249`) | idrive7-apps README §4.3; `scripts/dev/_common.ps1` |
| Uid może się zmienić po reinstalacji ze Store | VERIFIED (komentarz) | `_common.ps1`, `remote-relink-app.js:findOapRoot` |
| Pakiet: `package.json`, `manifest.json` (SOME/IP), `permissions.json` (joynr ACL), `rhmiData/`, `javascript/runner.js` + generowany `javascript/app.js` | VERIFIED | `apps/g21_airplay/package/` |
| Limity z `oapAppSettings`: CPU 60, pamięć 196608 KB (~192 MB), dysk 20 MB | VERIFIED | `package/package.json` |
| Przekroczenie pamięci ubija aplikację (`MEMORY_LIMIT_REACHED`) | VERIFIED (zdarzyło się) | `docs/AIRPLAY_RENDER_PIPELINE.md` |
| 2 nieoczekiwane zakończenia → odinstalowanie | ASSUMPTION (zewnętrzne, powtarzane w regułach) | idrive7-apps README §4.3 |
| Dostęp SOME/IP tylko do usług z `manifest.json` | ASSUMPTION (zewnętrzne) | tamże; **nasz manifest nie ma Vehicle2/FrontCCU/ControllerElements** → K-03 |
| SDK: `oap-sdk` 24.10.2 z dawcy `x_call@4.25.3`; dawca linkowania Store: `ts_diagnostic_service@4.20.2` | VERIFIED (ekstrakcja 2026-11-12) | `../DEVELOPMENT.md`, `.cursor/rules/mgu-screen.mdc` |
| Store linkuje pakiet przez `/var/opt/mgu-deploy/current/oap_link.js` | VERIFIED (ścieżka w skrypcie) | `scripts/dev/remote-relink-app.js` |

## Ścieżki naszych komponentów na MGU

| Ścieżka | Właściciel | Treść |
|---|---|---|
| `/var/opt/g21-airplay-open/current/` | narzędzie (root) | skrypt, binaria, `lib/` |
| `/var/opt/public/oap/oap_12249/source/` | aplikacja | pakiet + `javascript/app.js` |
| `/var/opt/public/oap/oap_12249/data/` | aplikacja | ustawienia, `*.secret`, `app.js.bytecode` |
| `/run/g21-session/` (`allow`, `output`, `airplay-auth`, `airplay-size`, `socks5-port`, `input.log`) | wspólne (1777) | sterowanie app→narzędzie |
| `/run/g21-airplay/` (`latest.yuv`, `pin`, `client`, `ux.cmd`, avahi conf, passwd/group overlay) | narzędzie | |
| `/run/g21-airplay.status`, `/run/g21-desktop.status` (chmod 666) | narzędzie/app | statusy |
| `/run/g21-desktop/` (`frame.sock`, `input.sock`, `offers`) | narzędzie | pulpit |
| `/dev/shm/mgu-video-g21airplay` | aplikacja | klatki dla renderera |
| `/var/log/g21-{uxplay,rdp,present,avahi,mice}.log`, `/tmp/g21-airplay-start.log` | | logi |

## Usługi współistniejące (fabryczne i obce)

| Usługa | Status | Źródło |
|---|---|---|
| Bezprzewodowy CarPlay na TCP 7000; `airplay-rx` na TCP 7101 | VERIFIED (odczyt 2026-11-12, errno 98 przy UxPlay na 7000/7100) | `docs/06-bezpieczenstwo.md`, komentarz w `g21-airplay-open` |
| BMW `mdnsd` + `/usr/lib/libdns_sd.so` (Apple Bonjour) — `DNSServiceRegister` od obcego klienta → `kDNSServiceErr_Unknown` | VERIFIED (status „brak dns” 0.1.15–0.1.20) | `docs/airplay-integracja.md`, H40 |
| Fabryczny filtr `ip filter input` kończy się `logblocked` (odrzuca wlan0) | VERIFIED pośrednio (komentarze + naprawa) | `g21-airplay-open:open_ports` |
| Renderer GPU społeczności (`/run/mgu-renderd/renderd.sock`, dialekt `mgu-render/1` native) | VERIFIED (log `menu-ready 1920x720 native`) | `dev-logs/…161219` |
| `cluster-render` (Store, R. Nisipeanu) | VERIFIED (log `cluster-ready`, warstwy `shown`) | `dev-logs/…170432` |
| `mgu-uplink` (Store) — Wi-Fi klient `wlan0`, tabela `inet mgu_uplink` | VERIFIED (status/lease json czytane przez narzędzie; nazwa tabeli) | `g21-airplay-open:find_uplink_wifi` |
| `iteriodev-tailscale` (userspace, SOCKS5 127.0.0.2:1055) | VERIFIED wg kodu/komentarzy | `g21-airplay-open:ensure_tailscale_socks5` |
| Audio: brak `default` ALSA; karta 0 = BT handsfree; media przez plugin `smartx:CarPlayMain` | ASSUMPTION (komentarz w kodzie, „Play AirPlay audio through SmartX”) | `g21-airplay-open:start_ux` |

## Czego nie wiemy (do bezpiecznego odczytu, po zgodzie)

`/proc/meminfo`, `df -h /var/opt /run /dev/shm /tmp`, `/proc/cpuinfo`, lista `ip -br addr`, `ip route`, `nft list ruleset` (tylko odczyt), `systemctl list-units --type=service` (odczyt), obecność `/dev/dri/*` i `libva*`, wersje zainstalowanych narzędzi Store. Polecenia: DEBUGGING.md.
