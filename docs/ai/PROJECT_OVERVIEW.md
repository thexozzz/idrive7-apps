# Przegląd projektu

Stan analizy: 2026-11-14 (onboarding, tylko odczyt). Repo lokalne `1/` @ `fd4c9d6` (= `origin/test`) + niezatwierdzone zmiany (patrz SESSION_HANDOFF).

## Co to jest

Prywatne środowisko aplikacji dla jednostki MGU (iDrive 7) w BMW G21 2020. Aplikacje są **pakietami źródłowymi MGU Store** (`"build": "unit"`): Store pobiera drzewo z gałęzi `test` repozytorium `thexozzz/idrive7-apps`, linkuje je na aucie z BMW `oap-sdk` dawcy i instaluje jako aplikację OAP. — VERIFIED (`mgu-repo.json`, `docs/03-publikacja.md`, `AGENTS.md`).

Główny produkt to **THEiPlay** (`apps/g21_airplay`, v0.1.121): lustro ekranu iPhone (AirPlay) + klienci pulpitu (RDP, VNC), odbiornik Windows Win+K (MS-MICE) i odtwarzacz YouTube, z wyjściem na ekran centralny, licznik (KOMBI) i HUD. Obok jest szablon `apps/g21_hello`. Część natywna to narzędzia Store `native/g21-airplay-open` (backend: UxPlay, avahi, FreeRDP, presenter, MS-MICE) i `native/jap-ridetube-d` (YouTube, GPL-3.0, cudzy).

## Workspace (`C:\Users\thexo\Documents\BMW-APLIKACJE`)

| Ścieżka | Co to | Status |
|---|---|---|
| `1/` | **nasze repo** `thexozzz/idrive7-apps` (publiczne) | VERIFIED `1/.git/config` |
| `idrive-apps/` | klon `robertnisipeanu/idrive-apps` @ `84e14d6` (cluster-render, GPL-3.0) | VERIFIED `.git/logs/HEAD` |
| `idrive7-apps/` | klon `cauliflowermossgrape/idrive7-apps` @ `58cb47d` + lokalne zmiany (kk_remotein, jap_ridetube, emu.js) + `oap-sdk/` 24.10.2 (nie publikować) | VERIFIED |
| `dev/` | stub cluster-render (`cluster-demo`), `sdk-work/x_call` (SDK z MGU, nie publikować) | VERIFIED |
| `scripts/` | wrappery `dev-*.ps1` → `1/scripts/dev/`, `extract-sdk-from-mgu.ps1` | VERIFIED |
| `data/data/` | **klucze prywatne, klucz root SSH, certyfikaty, VIN (enrollments), log flashowania MGU** — nie jest repozytorium git | VERIFIED (lista plików; treści kluczy nie czytano) |
| `1.tar` (222 MB), `data.7z`, `idrive7-apps-main.zip`, `*.exe` | archiwa/instalatory | UNVERIFIED zawartość |
| `DEVELOPMENT.md`, `.cursor/rules/` | wcześniejsze ustalenia i reguły agenta (Cursor) | VERIFIED |

## Stan funkcjonalności (skrót, szczegóły w APPLICATIONS.md)

| Funkcja | Status | Dowód |
|---|---|---|
| Kafelek aplikacji i menu rysowane na rendererze GPU | VERIFIED (potwierdzone przez właściciela 2026-11-12) | `.cursor/rules/mgu-screen.mdc`, log `menu-ready 1920x720 native` |
| Tekst RHMI (listy, speller) | BROKEN na tym G21 — strony puste | `docs/hipotezy.md` H18, `mgu-screen.mdc` |
| Dotyk w menu (TOUCH przez renderer) | VERIFIED | log `menu-touch …`, `menu-hit up air-toggle` (2026-11-12 17:04) |
| AirPlay: ogłoszenie mDNS, iPhone widzi odbiornik | VERIFIED wg właściciela (brief) / log avahi „Server startup complete” | brief, `dev-logs/…170432` |
| AirPlay: zestawienie sesji i obraz | UNVERIFIED — historycznie BROKEN („telefon zostaje w łączeniu”); późniejsze wersje (0.1.72–0.1.121) zakładają przychodzące klatki, ale **brak logów** po 2026-11-12 17:04 | brief, CHANGELOG, brak logów |
| RDP | BROKEN w ostatnim logu (`error|freerdp|` w pętli) | `dev-logs/…170432` |
| VNC | UNVERIFIED (brak logów) | — |
| Windows Win+K (MS-MICE) | UNVERIFIED (H28–H36) | `docs/hipotezy.md` |
| YouTube w THEiPlay | UNVERIFIED, w trakcie pracy (niezatwierdzone zmiany: logowanie QR) | diff lokalny vs `origin/test` |
| Napis/klatki na liczniku i HUD (cluster-render) | VERIFIED: warstwy `shown` w logu; obraz AirPlay na KOMBI/HUD UNVERIFIED | log `cluster-layer N shown`, `label-on panel/hud` |
| Bramka postoju dla licznika/HUD | **BROKEN (wyłączona celowo w kodzie)** | `main.js` `_parkFlag()` zwraca `true` |
| Pokrętło iDrive (CCU) | ASSUMPTION — kod obsługuje CCU z renderera, dowodu w logach brak | `menu_draw.js` `take()` |
| Touchpad, kursor | PLANNED / niedostępne | `input_manager.js`, `docs/pulpit-zdalny.md` |
| Moonride / streaming pulpitu (Moonlight) | PLANNED — brak kodu | brak plików |

## Najważniejsze ryzyka (szczegóły KNOWN_ISSUES.md)

1. Hasło RDP jawnym tekstem w publicznym repo (K-01).
2. Wyłączona bramka postoju dla licznika/HUD (K-02).
3. Narzędzie modyfikuje w runtime fabryczne łańcuchy nft, bind-mountuje `/etc/passwd`, `/etc/group`, `/etc/dbus-1/system.d` i restartuje usługę innego dostawcy (K-04).
4. Kod GPL skopiowany do aplikacji MIT (K-06).
