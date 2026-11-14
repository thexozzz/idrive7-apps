# CLAUDE.md — punkt wejścia dla Claude Code

Repozytorium: `thexozzz/idrive7-apps` (lokalnie `C:\Users\thexo\Documents\BMW-APLIKACJE\1`, gałąź `store-publish` → `origin/test`).
Cel: własne aplikacje iDrive 7 (MGU) dla BMW G21 320d xDrive 2020. Główna aplikacja: **THEiPlay** (`apps/g21_airplay`).

> Uwaga nazewnicza: folder `..\idrive-apps` w workspace to klon **cudzego** repo `robertnisipeanu/idrive-apps` (cluster-render). Nasz kod jest w `1/`.

## Zasady bezwzględne (pracujemy na prawdziwym samochodzie)

1. Bez wyraźnej zgody właściciela w **bieżącej** wiadomości: żadnego zapisu na MGU, restartów, `systemctl`, `nft`, kill procesów, instalacji/Update ze Store, flashowania, kodowania, poleceń do ECU (DME/DDE/EGS/DSC/VTG…).
2. **Nie commituj, nie pushuj i nie wdrażaj bez zgody.** Ta zasada ma pierwszeństwo przed `.cursor/rules/publish-test.mdc` (który każe pushować automatycznie) — patrz `docs/ai/KNOWN_ISSUES.md` K-09.
3. SSH tylko do odczytu, `StrictHostKeyChecking=yes`, przy zmianie klucza hosta — stop.
4. Nigdy nie zapisuj w repo ani w dokumentacji: haseł, kluczy, tokenów, VIN, logów HU, `oap-sdk/`, `*.tgz`, `*.mgu`. Repo jest **publiczne**.
5. Testy obrazu na liczniku/HUD tylko na postoju i bez zasłaniania komunikatów BMW. Obecny kod **nie** blokuje tego w jeździe — K-02.
6. Najpierw przyczyna (logi, kod), potem minimalna, odwracalna poprawka. Nie deklaruj „działa” bez testu na aucie.
7. Kod w `apps/` i `lib/` = **Node 8.16.2** (bez `?.`, `??`, `replaceAll`, `Object.fromEntries`, `fs.rm`…).
8. Nowy `require('./x.js')` → dopisz `src/x.js` do `modules` w `mgu-app.json` (inaczej Store nie zbuduje).
9. Nie kopiuj kodu GPL/PolyForm do aplikacji MIT. Sprawdź licencję przed użyciem czegokolwiek z zewnątrz.
10. Nie zabijaj procesu OAP aplikacji (2 crashe = MainApp odinstalowuje aplikację).
11. **Każda paczka zmian do pushu ma podbitą wersję** (polecenie właściciela, 2026-11-14): wpisy w `## Unreleased` w `package/CHANGELOG.md`, potem `node tools/bump_version.js g21_airplay patch` (mgu-app.json, package.json, npm-shrinkwrap.json, rhmiData/application.json, nagłówek CHANGELOG) i zapasowy numer w `src/main.js` (`|| '0.1.x'`). Pliki trafiają do folderu na dysku; commit i push robi właściciel — dostaje gotowe polecenia `git`.

## Komendy

```powershell
cd C:\Users\thexo\Documents\BMW-APLIKACJE\1
node tools/test_all.js                          # walidacja + testy jednostkowe (Node 18+)
node tools/sim_display.js                       # symulator wyjść, http://127.0.0.1:8091
powershell -File scripts\bump.ps1 -App g21_airplay -Level patch   # podbicie wersji (bez wysyłki)
cd ..; .\scripts\dev-test.ps1 -RemoteSmoke      # SSH tylko odczyt (wymaga zgody na połączenie)
.\scripts\dev-logs.ps1                          # logi g21_* → 1/dev-logs/ (UTF-16!)
```

HotPatch / Store / push — wyłącznie po zgodzie: `docs/ai/BUILD_AND_DEPLOY.md`.

## Mapa dokumentacji (`docs/ai/`)

| Plik | Treść |
|---|---|
| [PROJECT_OVERVIEW.md](docs/ai/PROJECT_OVERVIEW.md) | Czym jest projekt, stan funkcji |
| [REPOSITORY_MAP.md](docs/ai/REPOSITORY_MAP.md) | Katalogi, moduły, mapa zależności |
| [MGU_ENVIRONMENT.md](docs/ai/MGU_ENVIRONMENT.md) | Sprzęt, system, ścieżki na MGU |
| [APPLICATIONS.md](docs/ai/APPLICATIONS.md) | Aplikacje i narzędzia, stan modułów |
| [RENDERING_ARCHITECTURE.md](docs/ai/RENDERING_ARCHITECTURE.md) | Środek / licznik / HUD, kopie klatek |
| [AIRPLAY_ARCHITECTURE.md](docs/ai/AIRPLAY_ARCHITECTURE.md) | Pipeline AirPlay i problem „łączenia” |
| [NETWORK_ARCHITECTURE.md](docs/ai/NETWORK_ARCHITECTURE.md) | Interfejsy, nft, porty, mDNS |
| [INPUT_EVENTS.md](docs/ai/INPUT_EVENTS.md) | Dotyk, pokrętło, touchpad |
| [BUILD_AND_DEPLOY.md](docs/ai/BUILD_AND_DEPLOY.md) | Cykl ANALYZE→…→VERIFY |
| [DEBUGGING.md](docs/ai/DEBUGGING.md) | Logi, bezpieczne polecenia odczytu |
| [KNOWN_ISSUES.md](docs/ai/KNOWN_ISSUES.md) | Potwierdzone problemy i ryzyka |
| [EXTERNAL_REFERENCES.md](docs/ai/EXTERNAL_REFERENCES.md) | Repozytoria ekosystemu, licencje |
| [SESSION_HANDOFF.md](docs/ai/SESSION_HANDOFF.md) | Stan prac i co dalej |

Starsza baza wiedzy (zachowana, nie zastąpiona): `docs/README.md`, `docs/hipotezy.md` (H1–H46), `AGENTS.md`, `../DEVELOPMENT.md`, `.cursor/rules/*.mdc`.

## Statusy informacji

`VERIFIED` potwierdzone (kod, log, odczyt) · `ASSUMPTION` założenie · `UNVERIFIED` niezweryfikowane · `PLANNED` planowane · `BROKEN` potwierdzony problem. Każde ustalenie ma źródło (plik:funkcja/linia, log, repo@commit).
