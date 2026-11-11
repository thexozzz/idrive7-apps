# Zasady pracy nad aplikacjami MGU

To repozytorium przygotowuje aplikacje infotainment dla BMW G21 2020 z iDrive 7. Jednostka główna to MGU. Aplikacje wchodzą na nią wyłącznie jako pakiety źródłowe MGU Store. Ten plik jest obowiązujący dla każdej zmiany w `apps/`, `lib/`, `scripts/`, `tools/` i `docs/`.

## Zakres

Dozwolona jest aplikacja na centralnym wyświetlaczu, a po osobnym zatwierdzeniu także rysunek na zestawie wskaźników albo HUD. Poza zakresem są sterowniki jazdy i konfiguracja bezpieczeństwa: DSC, DME, DDE, VTG oraz wszystko, co zmienia hamulce, napęd, poduszki albo nadzór stabilności.

Manifest aplikacji nie deklaruje tych interfejsów. Walidator odrzuca ich nazwy w `manifest.json`. Sygnał prędkości, jeśli przyszła aplikacja go doda, jest wyłącznie odczytem `Vehicle2.statusCarSpeed2` i służy do zgaszenia HUD.

## Zapis na samochód

Żaden skrypt w tym repozytorium nie kopiuje plików na MGU, nie restartuje usług i nie wywołuje instalatora Store. `scripts/diagnose.ps1` ma stałą listę poleceń odczytu. `scripts/publish.ps1` przy próbie zapisu na urządzenie kończy się błędem.

Połączenie SSH, instalacja, aktualizacja i usunięcie wymagają osobnej, wyraźnej zgody w bieżącej wiadomości użytkownika. Zgoda na diagnostykę nie jest zgodą na instalację. Zgoda na jedną aplikację nie obejmuje następnej.

Jednostka właściciela ma adres `100.125.63.29`. Na tym hoście dozwolony jest wyłącznie odczyt plików, katalogów i logów. Zakazany jest każdy zapis, usunięcie, zmiana uprawnień, restart usługi, instalacja i aktualizacja. Naprawa idzie do repozytorium, a na samochód wraca tylko przez MGU Store, z ekranu, po osobnej zgodzie.

Na samochodzie instaluje i usuwa właściciel, z ekranu MGU Store. Aktualizacje nie instalują się same. Każda aplikacja w `mgu-repo.json` ma `uninstallable: true`.

## Sekrety i SDK

BMW `oap-sdk` nie jest w repozytorium i nie wolno go dodać. Pakiet zbudowany na komputerze, który zawiera wyciągnięty SDK, też nie wchodzi do gita ani do assetów wydania. To samo dotyczy kluczy SSH, tokenów, numeru VIN, logów z jednostki i katalogu `reference/` ze zrzutem SOME/IP.

Klucz przekazany do `diagnose.ps1` musi leżeć poza tym katalogiem. Wydanie GitHub, jeśli powstanie, nie ma załączonego pakietu `.tgz` ani `.mgu`.

## Język aplikacji

Kod w `apps/` i `lib/` ma działać na Node.js 8.16.2, bo tak jednostka buduje i uruchamia pakiet źródłowy. Dozwolone są `const`, `let`, funkcje strzałkowe, `class`, `Promise` i `async` znane Node 8. Niedozwolone są m.in. `?.`, `??`, `replaceAll`, `Object.fromEntries`, `Promise.allSettled`, `globalThis` i `fs.rm`.

Moduł wymaga innego pliku aplikacji jako `'./plik.js'`, a SDK pod ścieżką wpisaną w `mgu-app.json` (`oap-sdk/src/core/OnlineApp.js`, `oap-sdk/src/logging/logging`). Nie dodajemy `javascript/app.js`. Ten plik powstaje na jednostce.

Id aplikacji ma własny przedrostek (`g21_`). Nie używamy id BMW (`store`, `x_call` i podobnych). `loggingId` ma cztery znaki i jest unikalny w tym repozytorium.

## Wersja, którą widzi samochód

Store na kanale gałęzi instaluje `mgu-repo.json` z czubka gałęzi. Numer, który porównuje z zainstalowaną paczką, siedzi w `mgu-app.json` i musi być taki sam w `package/package.json`, `package/npm-shrinkwrap.json` i `package/rhmiData/application.json`. `package/CHANGELOG.md` ma `## Unreleased` oraz nagłówek tej wersji.

Zmiana widoczna dla właściciela dostaje punkt pod `## Unreleased`. Numer podnosi `scripts/bump.ps1`. Sam bump niczego nie wysyła. Push gałęzi jest osobną decyzją, a tapnięcie Update w Store też.

Nie twórz wydania GitHub z paczką `.tgz` albo `.mgu`. Kanał Releases zacząłby szukać gotowej paczki zamiast drzewa źródeł.

## Testy

Każda zmiana zachowania przechodzi `node tools/test_all.js` przed uznaniem jej za gotową. Zestaw sprawdza kontrakt pakietu, brak sekretów i bramkę postoju dla HUD.

Test na samochodzie nie zastępuje testu lokalnego i nie jest uruchamiany z tego repozytorium automatycznie. Emulator GPU z `idrive7-apps` jest narzędziem tamtego projektu.

Na tym G21 tekst RHMI zostaje pusty. Widoczne menu AirPlay 0.1.13 jest ramką prostokątów na rendererze, a kod tego rysunku jest w `apps/g21_airplay/src/menu_draw.js`. Nowy plik aplikacji dopisuje się do `modules` w `mgu-app.json`, inaczej Store nie zbuduje paczki.

## Dokumentacja

Zmiana, która koryguje fakt albo dodaje zachowanie, aktualizuje `docs/` w tym samym kroku. Zdanie o tym, co zrobiono na tym G21, pozostaje hipotezą, dopóki diagnostyka albo instalacja zatwierdzona przez właściciela go nie potwierdzi. Wtedy dostaje datę, polecenie i wynik, bez numeru VIN i bez treści kluczy.

Źródła zewnętrzne podajemy jako repozytorium, skrót commita i ścieżkę pliku. Nie kopiujemy do tego drzewa kodu GPL ani PolyForm tylko po to, żeby mieć lokalną kopię tamtych projektów.
