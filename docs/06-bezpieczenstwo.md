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
- Narzędzie `g21-airplay-open` uruchamia UxPlay i dopisuje reguły wejścia tylko dla jego portów: UDP 5353 (także do `224.0.0.251`), TCP 7100, 7000 i 7001 oraz UDP 6000, 6001 i 7011. Najpierw na interfejsie hotspotu auta (`172.16.222.97`), inaczej na Wi-Fi uplink Store, które nie jest Personal Hotspotem iPhone’a. Źródło portów: README FDH2/UxPlay, opcja `-p`. Źródło ograniczenia zapory: `mgu-store` `native/mgu-uplink/firewall.go`. Usunięcie narzędzia kończy UxPlay i kasuje tabelę `inet g21_airplay`.
- Każde wejście na urządzenie, także odczyt, wymaga osobnej zgody. Przygotowanie skryptu nie jest jego uruchomieniem.

## Spoza zakresu

Rootowanie jednostki, łata MainApp, przechwytywanie strumienia CarPlay albo AirPlay oraz uzbrajanie poleceń diagnostycznych do sterowników. `idrive7-apps` wprost pisze, że nie publikuje sposobu uzyskania roota (`README.md`, „What you need”). Store zakłada już istniejący dostęp SSH i wskazuje osobne narzędzie społeczności. Tego narzędzia tu nie ma.
