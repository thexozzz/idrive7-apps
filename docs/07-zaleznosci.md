# Zależności

## Komputer, na którym powstają aplikacje

Dla tego repozytorium:

| Narzędzie | Wymagane do | Źródło wymagania |
|---|---|---|
| Node.js 18 albo nowszy | `tools/test_all.js`, a także instalator Store `mgu-install.js`, jeśli właściciel kiedyś uruchomi go sam | `mgu-store` `README.md`: Node 18+; nasze skrypty używają tej samej granicy |
| Klient OpenSSH | tylko `scripts/diagnose.ps1` | `mgu-store` `README.md`: Windows, macOS i Linux mają go w systemie |
| GitHub CLI `gh` | tylko `scripts/publish.ps1 -ConfirmGitHubRelease` | lokalna decyzja; bez `gh` powstaje sam plik planu w `dist/` |

Python nie jest potrzebny do szablonu RHMI. Jest potrzebny, gdy ktoś buduje aplikacje `idrive7-apps` u siebie: Python 3.6+ i Node 14+ według `idrive7-apps` `README.md`, sekcja „On your PC”. Node 22 używany w CI tamtych projektów i w naszym workflow jest nowszy niż to minimum.

Docker jest potrzebny tylko do własnej kompilacji `mgu-render` / `cluster-render`. Szablon go nie kompiluje. Obrazy w źródłach są Ubuntu 18.04, bo taki glibc ma jednostka (`idrive7-apps` `kit/renderd/README.md`).

## Jednostka główna

| Element | Wartość | Źródło |
|---|---|---|
| Node aplikacji | 8, a przy budowie skryptem dokładnie 8.16.2 | `idrive7-apps` `README.md` 4.3; `mgu-store` `docs/PUBLISHING.md` |
| Python budowy | 3.12, narzędzie `mgu-python`, tylko gdy `mgu-repo.json` podaje skrypt `python` | `PUBLISHING.md` |
| SDK | generowany z dawcy na jednostce, nie z tego gita | `PUBLISHING.md`, `extract_sdk.js` |
| Sieć budowy pakietu źródłowego | brak | `PUBLISHING.md`, „Source packages” |
| Limit skryptu budowy | 10 minut, 200 MB | `PUBLISHING.md` |
| Zależność szablonu | `mgu-deploy` co najmniej 0.2.0 | minimum z przykładu katalogu w `PUBLISHING.md`; szablon nie wymaga renderera |

`package.json` szablonu deklaruje `oap-sdk` `24.10.2`, bo tak robią opublikowane aplikacje Store (`apps/robertn_store/package/package.json`). To deklaracja, nie plik SDK.

## Sieć

- Hotspot samochodu: SSH pod `172.16.222.97` (`mgu-store` `README.md`).
- `mgu-uplink` daje updaterowi i aplikacjom z `mguInternet` sieć przez USB Ethernet, modem LTE, tethering Androida, iPhone z Personal Hotspot po USB (telefon odblokowany, zaufanie, a odtwarzanie muzyki po USB wtedy stoi) albo Wi-Fi. Własny hotspot samochodu i bezprzewodowy CarPlay działają obok Wi-Fi. Na iDrive 7 z radiem Broadcom sieć tylko WPA3 nie łączy się. Źródło: `mgu-store` `README.md`, „Internet”.

## Hipoteza

Że komputer deweloperski ma już Node 18 i OpenSSH, nie było sprawdzane w tej sesji poza uruchomieniem lokalnych testów Node. Wynik testów jest w podsumowaniu prac, nie w tej tabeli.
