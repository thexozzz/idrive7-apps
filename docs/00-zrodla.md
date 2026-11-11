# Źródła

Odczyt wykonany 11 listopada 2026 z gałęzi `main`. Do tego repozytorium nie kopiowano drzew źródeł, binariów renderera ani SDK.

| Repozytorium | Commit | Licencja | Rola |
|---|---|---|---|
| [cauliflowermossgrape/idrive7-apps](https://github.com/cauliflowermossgrape/idrive7-apps) | `8681f50c8843` | MIT | Zestaw aplikacji ID7, opis platformy, `extract_sdk.js`, renderer GPU, bramka postoju |
| [robertnisipeanu/mgu-store](https://github.com/robertnisipeanu/mgu-store) | `e883efb4616d` | GPL-3.0-or-later | Store, updater, deploy z wycofaniem, publikacja |
| [robertnisipeanu/idrive-apps](https://github.com/robertnisipeanu/idrive-apps) | `a559f69ebc8c` | GPL-3.0-or-later | `cluster-render`, aplikacja mapy na zestawie wskaźników i HUD |
| [eroobeeroo/idrive7-cluster-info](https://github.com/eroobeeroo/idrive7-cluster-info) | `10cefda018e5` | PolyForm Noncommercial 1.0.0 dla prac eroobeeroo od 10 listopada 2026; zestaw `kit/` pozostaje MIT | Aplikacje zestawu wskaźników budowane na jednostce z `mgu-repo.json` |

## Fakty o podziale ról

- Store instaluje aplikacje i narzędzia z repozytoriów GitHub, adresów HTTPS i pamięci USB. Źródło: `mgu-store` `README.md`, „An app store…”.
- Domyślne źródła Store to `robertnisipeanu/mgu-store`, `cauliflowermossgrape/idrive7-apps`, `robertnisipeanu/idrive-apps` i `IterioDev/car-apps`. Źródło: `mgu-store` `deploy/sources.json`.
- `idrive7-apps` publikuje aplikacje jako gotowe paczki, a `mgu-repo.json` mówi jednostce, jak zbudować je z kodu. Źródło: `idrive7-apps` `mgu-repo.json` oraz `mgu-store` `docs/PUBLISHING.md`, sekcja „Repo tree”.
- `idrive7-cluster-info` też jest drzewem repozytorium: `mgu-repo.json` wskazuje `kit/tools/build.py` i katalog `oap-sdk`, którego w gicie nie ma. Źródło: `idrive7-cluster-info` `README.md`, „Development”, oraz `mgu-repo.json`.
- `idrive-apps` publikuje katalog wydań. Aplikacja `robertn_waze_cluster` jest pakietem źródłowym (`mgu-app.json`, `"build": "unit"` w opisie publikacji). Źródło: `idrive-apps` `README.md` i `apps/robertn_waze_cluster/mgu-app.json`.

## Czego świadomie nie przeniesiono

`idrive7-apps` zawiera aplikację Engine Config, która po uzbrojeniu wysyła żądania do DME i, w trybie eksperymentalnym, do DSC. Źródło: `idrive7-apps` `README.md`, wiersz „Engine Config”. Tego mechanizmu tu nie ma i nie będzie instrukcji jego użycia.

Starszy instalator `deploy/car/deploy-car.sh` z `idrive7-apps` podmienia zachowanie MainApp przez bind-mount. Źródło: `idrive7-apps` `deploy/car/README.txt`. To środowisko używa ścieżki Store, która umie aplikację usunąć, i nie uruchamia tamtego instalatora.
