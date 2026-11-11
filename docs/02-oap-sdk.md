# oap-sdk

## Fakty

BMW nie rozprowadza `oap-sdk` jako osobnej paczki do publikacji. SDK jest wbudowany w `javascript/app.js` każdej aplikacji OAP. Narzędzie `idrive7-apps` `kit/tools/extract_sdk.js` (commit `8681f50c8843`) odbudowuje z takiej paczki trzy rzeczy lokalnie:

| Ścieżka | Znaczenie |
|---|---|
| `oap-sdk/index.js` | `require('oap-sdk')` z publicznym API |
| `oap-sdk/package.json` | nazwa i wersja odczytana z `dependencies` aplikacji-dawcy |
| `oap-sdk/source/` | moduły do czytania, nie do publikacji |

Publiczne nazwy API wypisane w tym narzędziu i powtórzone w `mgu-store` `docs/PUBLISHING.md`: `OnlineApp`, `NsmProxy`, `config`, `logging`, `loggingLevel`, `SDKError`, `someipBuilders`, `RhmiApplication`, `RhmiResourcesLocator`, `telephony`, `getVin`, `runtimeVariant`, `appstart`, `guidance`, `map`, `MapKmlContentTypeConverters`, `poi`.

Przykładowy dawca z firmware, podany w `extract_sdk.js`:

- `/usr/lib/oap-mainapp/preinstalled_apps/x_call@*.tgz`
- później pobrany `/var/opt/public/oap/oap_12204/source/javascript/app.js`

`README.md` `idrive7-apps` podaje, że kopia z firmware (SDK 24.10.x) ma pełne API, a późniejszy `x_call` może nie mieć `telephony`, `appstart`, `map` i `poi`. Aplikacje z tamtego zestawu tych modułów nie potrzebują. `package.json` Store i aplikacji mapy deklaruje zależność `oap-sdk` `24.10.2`.

Store nie wymaga SDK w repozytorium. Gdy JavaScript woła `require('oap-sdk')` i paczka tego modułu nie wiezie, jednostka generuje go z dawcy: najpierw paczki fabryczne, potem aplikacje BMW, nigdy paczka zainstalowana przez Store. Dla pakietu źródłowego dawcą jest `MGU_SDK_DONOR`. Źródło: `mgu-store` `docs/PUBLISHING.md`, „Rules for every layout” i „Build scripts”.

Budowa na jednostce dla skryptu: Node 8.16.2 albo Python 3.12 (`mgu-python`), bez sieci, limit 10 minut i 200 MB, katalog roboczy jest kopią repozytorium. Pakiet źródłowy `"build": "unit"` nie uruchamia skryptu: jednostka linkuje moduły z `mgu-app.json` narzędziem `oap_link.js`. Plik, którego nie ma na tej liście, nie jest modułem aplikacji. Store na tym G21 przerwał budowę AirPlay 0.1.12 właśnie tym komunikatem: `requires "./menu_draw.js": not an app module`.

## Zasada tego repozytorium

`oap-sdk/` jest w `.gitignore`. Walidator odrzuca katalog `oap-sdk` i plik `javascript/app.js` w drzewie aplikacji. Wydanie GitHub nie dostaje assetu paczki. Szablon woła SDK po ścieżkach z `mgu-app.json` i zostawia `javascript/runner.js` do wstawienia przez dawcę.

Wyciągnięcie SDK na własny komputer, jeśli będzie potrzebne do czytania API, zostaje poza tym katalogiem. Skrypt `scripts/build.ps1` nie kopiuje dawcy do środka.

## Hipoteza

Wersja SDK na tym G21 nie została odczytana. `24.10.2` w `package.json` szablonu jest wersją deklarowaną przez opublikowane aplikacje Store, nie pomiarem z tego samochodu. Jeśli linkowanie na jednostce odrzuci wersję, poprawiamy deklarację po zatwierdzonym odczycie, bez wkładania SDK do gita.
