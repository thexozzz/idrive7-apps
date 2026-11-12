# Bezpieczeństwo

## Fakty, których się trzymamy

- Manifest ogranicza SOME/IP do usług, które wymienia. Źródło: `idrive7-apps` `README.md`, sekcja 4.3.
- Store usuwa aplikację oznaczoną jako usuwalna i nie instaluje aktualizacji sam. Źródło: `mgu-store` `README.md` oraz `docs/PUBLISHING.md`.
- Narzędzie deploy „wykonuje i potrafi wycofać każdą instalację”. Źródło: `mgu-store` `README.md`, lista składników. Szczegółów wycofania pojedynczej paczki nie powielano z `deploy/README.md`, bo ten plik ma ponad sto kilobajtów i nie był przepisywany do tego drzewa.
- Dwa crashy usuwają aplikację z platformy. Źródło: `idrive7-apps` `README.md`, sekcja 4.3. Niestabilna aplikacja potrafi więc zniknąć sama. To nie zastępuje przycisku Remove.
- Bramka `mgu-inputgate` ładuje się do procesu HMI i ma bezpiecznik: po kolejnych nieudanych startach jednostka wstaje bez niej. Źródło: `mgu-store` `docs/PUBLISHING.md`, „preload”, oraz `idrive7-apps` `mgu-repo.json`. Ten projekt nie dodaje bibliotek `LD_PRELOAD`.

## Reguły tego środowiska

- Brak zapisu do DSC, DME, DDE, VTG i konfiguracji bezpieczeństwa.
- Brak automatycznego zapisu na MGU. `scripts/publish.ps1 -ConfirmDeviceWrite` jest celowo odrzucane.
- Brak kluczy, danych pojazdu i plików SDK w git i w wydaniach.
- Diagnostyka SSH ma zamkniętą listę poleceń: jądro, wersja Node, obecność procesu HMI i katalogów OAP. Nie czyta provisioningu, VIN ani logów aplikacji.
- Narzędzie `g21-airplay-open` uruchamia UxPlay oraz w razie potrzeby bundlowany `avahi-daemon` i dopisuje reguły wejścia tylko dla portów AirPlay oraz panelu: UDP 5353 (także do `224.0.0.251`), TCP/UDP bloku UxPlay `-p 7400` (7400–7404) oraz TCP 1235, 7250 i UDP 1028/1029 (MS-MICE). Na tym G21 CarPlay zajmuje TCP 7000, a `airplay-rx` TCP 7101 — legacy porty UxPlay 7100/7000/7001 kończyły się errno 98. Wyłącznie z podsieci dzierżawy Wi-Fi MGU Store i wyłącznie na jej interfejsie, także gdy ta sieć to Personal Hotspot iPhone’a. Port 1235 to lokalny panel konfiguracji RDP aplikacji. Hasła nie trafiają do logów ani do `desktop.json`. Źródło ograniczenia zapory: `mgu-store` `native/mgu-uplink/firewall.go`. Usunięcie narzędzia kończy UxPlay i kasuje tabelę `inet g21_airplay`.
- Każde wejście na urządzenie, także odczyt, wymaga osobnej zgody. Przygotowanie skryptu nie jest jego uruchomieniem.

## Spoza zakresu

Rootowanie jednostki, łata MainApp, przechwytywanie strumienia CarPlay albo AirPlay oraz uzbrajanie poleceń diagnostycznych do sterowników. `idrive7-apps` wprost pisze, że nie publikuje sposobu uzyskania roota (`README.md`, „What you need”). Store zakłada już istniejący dostęp SSH i wskazuje osobne narzędzie społeczności. Tego narzędzia tu nie ma.
