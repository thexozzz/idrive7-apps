# Publikacja w MGU Store

Źródło tej strony: `mgu-store` `docs/PUBLISHING.md` przy commicie `e883efb4616d`, oraz `README.md` tego samego repozytorium.

## Fakty

Właściciel dodaje źródło GitHub na jeden z dostępnych kanałów: **Releases**, **Tags** albo gałąź. Przy Releases Store czyta `catalog.json` z wydania o nazwie `catalog`, a gdy go nie ma, paczki dołączone do wydań. Gałąź i tagi są czytane jako drzewo repozytorium (`mgu-repo.json`).

Wspólne reguły:

- W repozytorium nie ma SDK.
- Id jest globalne na jednostce. Id używane przez BMW potrafi schować kafelek. Własny przedrostek jest wymagany. Gdy id jest zajęte, Store dokłada `2` tylko dla aplikacji budowanej na jednostce z `{id}` w argumentach budowy.
- `mguHmi` to `["ID7"]`, `["ID8"]` albo oba. Bez tego pola aplikacja jest przypisana do HMI, dla którego ma `rhmiData`. Wpis katalogu bez `mguHmi` pokazuje się jako nieznany.
- Aplikacja, która potrzebuje sieci, ma `"mguInternet": true` w `package.json` paczki albo `"internet": true` w `mgu-app.json`. Dostaje sieć, gdy `mgu-uplink` jest zainstalowany i online.
- Nie ma podpisu paczki. Właściciel ufa źródłu, które sam dodał. Katalog sprawdza rozmiar i sha256. Assety wydań i drzewo repozytorium skrótu nie podają.
- Deploy dopisuje `"mguLocalOnly": true`.
- Aktualizacje nie wchodzą same. Narzędzie po aktualizacji może czekać na restart jednostki.
- Aplikację tego układu da się usunąć ze Store. Narzędzie jest usuwalne, gdy katalog ma `uninstallable: true`. Store nie oferuje usunięcia własnych narzędzi Store.

### Pakiet źródłowy, którego używa ten projekt

`mgu-app.json` w katalogu aplikacji:

```json
{
  "schema": 1,
  "id": "g21_hello",
  "version": "0.1.0",
  "tree": "package",
  "modules": ["src/main.js"],
  "sdk": ["oap-sdk/src/core/OnlineApp.js", "oap-sdk/src/logging/logging"]
}
```

`tree` wskazuje katalog z `package.json` (`main`: `javascript/runner.js`) i `rhmiData/`. Brak pliku pod `main` powoduje wstawienie punktu wejścia dawcy, a ten ładuje wygenerowany `javascript/app.js`. Moduły wołają się nawzajem przez `'./nazwa.js'`, a SDK przez ścieżki z pola `sdk`.

`mgu-repo.json` w korzeniu wymienia komponent. Ikona kafelka w Store, zanim aplikacja jest zainstalowana, bierze się z `rhmiData/application.json`. Po instalacji Store pokazuje ikonę zainstalowanej paczki. Lista aplikacji w samochodzie oczekuje PNG 140×140, a Store przyjmuje PNG do 128 KiB.

### Dwa pozostałe układy

Układ Releases: asset `<id>@<wersja>.tgz` albo `.mgu`, bez `node_modules/oap-sdk`. Układ Catalog: `catalog.json` schema 2 z `size` i `sha256`. Ten projekt ich nie używa, bo paczka zlinkowana z SDK nie może iść do publicznego wydania, a budowa na jednostce z drzewa repozytorium jest opisana jako droga bez SDK w git.

## Wybór dla tego repozytorium

`mgu-repo.json` publikuje wyłącznie `g21_hello` jako `"build": "unit"`, `mguHmi: ["ID7"]`, `uninstallable: true`. iPhone Mirror nie jest na tej liście, dopóki nie ma zatwierdzonej implementacji i testów.

Kanał, który ma być wybrany w Store, to **gałąź**. Store czyta wtedy `mgu-repo.json` z czubka gałęzi. Każdy nowy commit jest rewizją i przy niezmienionym numerze pokazuje się jako krótki sha. Nowy numer `x.y.z` powstaje przez `scripts/bump.ps1`, które przepisuje tę samą wersję w `mgu-app.json`, `package.json`, `npm-shrinkwrap.json`, `rhmiData/application.json` i przenosi punkty z `## Unreleased` pod nowy nagłówek.

Kanał Releases nie jest używany. Pojawia się, gdy repozytorium ma wydanie GitHub, i szuka paczek albo `catalog.json`, a nie drzewa źródeł. Pusta publikacja zasłoniłaby działającą gałąź. `scripts/publish.ps1` i workflow `Update check` tylko sprawdzają drzewo.

Kanał tagów też czyta drzewo, przy najwyższym tagu `v1.2.3`, `1.2.3` albo `<id>@1.2.3`. Ten projekt go nie wystawia automatycznie.

## Hipoteza

Że Store na tym G21 pokaże Install, a po nowym commicie Update, wynika z opisu kanału gałęzi w `PUBLISHING.md`. Na tej sztuce nie było jeszcze dodanego źródła. Sam push gałęzi niczego w samochodzie nie instaluje.
