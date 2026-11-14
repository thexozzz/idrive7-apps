# Budowa i wdrożenie

Docelowy cykl: **ANALYZE → EDIT → BUILD → DEPLOY SSH → TEST → LOGS → VERIFY**. Każdy krok zapisujący na MGU lub do GitHuba wymaga zgody właściciela w bieżącej wiadomości.

## Co jest dostępne

| Krok | Narzędzie | Status |
|---|---|---|
| ANALYZE | kod + `docs/` + logi `1/dev-logs/` | dostępne |
| EDIT | lokalnie w `1/` | dostępne |
| BUILD (JS) | brak kroku budowy lokalnie — Store linkuje na aucie (`oap_link.js`). Lokalnie: `node tools/test_all.js` (walidator + 13 testów) | VERIFIED: 13/13 testów przechodzi na Node 22 w kopii roboczej (2026-11-14); walidator wymaga pełnego drzewa (binaria, `rhmiData`) — w tej sesji niesprawdzony |
| BUILD (natywne) | `native/g21-airplay-open/build-uxplay.sh` (CMake, glibc 2.27 → Ubuntu 18.04); C narzędzi bez Makefile w repo | **brak** toolchainu na PC (brak `g++`/`make` wg `../DEVELOPMENT.md`); binaria w repo są gotowe | 
| BUILD emulator | `idrive7-apps/kit/tools/emu.js` + `build.py` (inny projekt), `kk_remotein` ładuje nasz `menu_draw` | VERIFIED wg `../DEVELOPMENT.md` |
| DEPLOY Store | `scripts/dev/dev-deploy.ps1 -Mode Store [-PushTest]` → push `origin/test`; właściciel klika Update w Store | VERIFIED skrypt |
| DEPLOY HotPatch | `dev-deploy.ps1 -Mode HotPatch -AllowMguWrite -ConfirmPhrase DEPLOY-G21-AIRPLAY -What app|tool|both`: SCP do stagingu, SHA-256, backup, podmiana w allowliście; po zmianie JS **relink** `javascript/app.js` (`remote-relink-app.js` na aucie) | VERIFIED skrypt |
| Rollback | `dev-rollback.ps1 -BackupStamp … -AllowMguWrite -ConfirmPhrase …` | VERIFIED skrypt |
| TEST zdalny | `dev-test.ps1 -RemoteSmoke` (odczyt) | VERIFIED skrypt |
| LOGS | `dev-logs.ps1` → `1/dev-logs/mgu-logs-*.txt` (UTF-16LE, `tail -n 120`) | VERIFIED |
| VERIFY | ręcznie na postoju, właściciel otwiera aplikację z listy HMI | — |

Wrappery w `../scripts/dev-*.ps1` wołają `1/scripts/dev/`. Wspólne: `_common.ps1` (host, klucz poza repo, `StrictHostKeyChecking=yes`, miękka blokada słów `nft`, `systemctl …`, `mount` itp. dla trybu odczytu).

## Zasady dla agenta

1. Domyślnie tylko Store-path przygotowany lokalnie; **bez pushu** do czasu zgody (sprzeczność z `.cursor/rules/publish-test.mdc` — obowiązuje zgoda).
2. HotPatch dopiero po zgodzie; zawsze pokaż listę plików i backup stamp.
3. Nie uruchamiać `remote-relaunch-app.sh` / `remote-fix-oap-launch.sh` (zabijają runner OAP — ryzyko deinstalacji) bez wyraźnej zgody.
4. Niezweryfikowanych binariów nie wdrażamy (każde nowe ELF: `file`, `ldd` przez `run-elf`, sha256 w manifeście stagingu).

## Zauważone niespójności

- `AllowWriteRoots` w `_common.ps1` obejmuje cały `/var/opt/public/oap/` (wszystkie aplikacje OAP), a dokumentacja mówi o `…/oap_12249/` — szersze niż deklarowane (K-08).
- Wersje: `release.json` (0.1.10) vs `mgu-repo.json` (0.1.36) vs narzędzie (0.1.45) — patrz REPOSITORY_MAP.md.
- `origin/test` (to, co instaluje Store) nie zawiera `src/qr.js` — lokalny `menu_draw.js` go wymaga; push bez `mgu-app.json` z `qr.js` przerwałby budowę Store.

## Kompatybilność binariów

Wszystkie ELF zbudowane na Ubuntu 18.04 (glibc 2.27), INTERP `/lib64/…` → start przez `run-elf` (`/lib/ld-linux-x86-64.so.2 --library-path lib/`). glibc/libm/libpthread/libdl/librt z jednostki — nie podmieniać. `g21-detach` statyczny. — VERIFIED (`UXPLAY.txt`, `LIBS.txt`).
