# Hipotezy

Zdania poniżej nie są potwierdzone na tym BMW G21 2020. Nie wolno ich zapisywać w dokumentacji jako faktów, dopóki zatwierdzony odczyt albo instalacja ich nie sprawdzi. Wynik takiego sprawdzenia dopisujemy tutaj z datą i bez VIN, kluczy i logów.

| Id | Hipoteza | Jak ją sprawdzić, gdy będzie zgoda |
|---|---|---|
| H1 | Ta sztuka ma MGU z HMI ID7 i Node 8 w OAP | `scripts/diagnose.ps1`: `HmiMain3D`, `node -v`, katalog OAP |
| H2 | Firmware zachowuje się jak `P18_23w44.2` z `idrive7-apps` | osobny odczyt wersji, jeszcze nie ma go w skrypcie diagnostycznym, żeby nie zbierać danych pojazdu przy pierwszym połączeniu |
| H3 | Dawca `x_call` na tej jednostce ma SDK 24.10.x z `OnlineApp` i `logging` | budowa `g21_hello` przez Store; błąd linkowania wskaże brakującą nazwę |
| H4 | Minimalny RHMI szablonu otwiera kafelek i jedną etykietę | pierwsza instalacja `g21_hello` z UI Store |
| H5 | Lista aplikacji iDrive 7 to stan `20974`, ten sam co w `robertn_waze_cluster` | po aktualizacji kafelek `g21_airplay` jest w menu aplikacji, nie tylko na stronie Installed w Store |
| H6 | G21 z HUD przyjmie `cluster-render` tak jak G05 z dokumentacji mapy | osobny projekt, po H1 i po instalacji renderera ze Store, nie z tego repozytorium |
| H7 | Aplikacja z `mguInternet` dosięgnie adresu w sieci LAN hotspotu, a nie tylko internetu publicznego | próba połączenia na postoju do serwera, który uruchomi właściciel |
| H8 | Hotspot iPhone’a da się dołączyć z poziomu `mgu-uplink`, jeśli ogłasza WPA2 | ustawienia Wi-Fi Store; sieć tylko WPA3 na radiu Broadcom jest z góry opisana jako nieskuteczna |
| H9 | Prędkość `statusCarSpeed2` na tym aucie używa skali 0,015625 i progu 3 km/h | odczyt sygnału na postoju i przy toczeniu, bez zapisu |
| H10 | Cisza sygnału po jeździe ma być traktowana jak jazda, tak jak w `parked.js` | H9, zostawiając HUD wyłączony przy wątpliwości |
| H11 | Reguła nft o priorytecie -10 wpuszcza AirPlay zanim `mgu-uplink` odrzuci nowe połączenia na tym interfejsie | po instalacji `g21_airplay` iPhone w tej samej sieci widzi „G21” w lustrze ekranu |
| H12 | Odpowiedź `/info` i ogłoszenie mDNS wystarczą, żeby iOS zaczął sesję | H11; pierwsza linia żądania pojawia się na ekranie aplikacji |
| H13 | `waylandsink` UxPlay rysuje lustro na centralnym ekranie przez kompozytor jednostki | po instalacji `g21_airplay` z gałęzi `test`: na iPhonie w tym samym Wi-Fi widać G21, a obraz pojawia się na ekranie |
| H14 | Manifest OAP dostarcza `Vehicle2.statusCarSpeed2` do tej aplikacji | na postoju ekran nie pokazuje `speed-unknown` i AirPlay wstaje po wyborze kafelka |
| H15 | `ZBETouchFrontSide` daje współrzędne palca tylko przy `statusSystemModeFrontSide` 3, a bez zapisu trybu pisania ten tryb się nie włącza | log inspektora po jeździe palcem po pokrętle; dopóki nie ma takiej próbki, touchpad zostaje niedostępny |
| H16 | `g21-present` i `g21-rdp` rysują pulpit na centralnym ekranie przez ten sam Wayland co UxPlay | na postoju VNC albo RDP do komputera w tej samej sieci, obraz 1920×720, kursor reaguje na pokrętło |
| H17 | `openEntryState` po `mapEntryState` pokazuje stronę AirPlay. Odczyt 2026-11-12: proces 0.1.9 doszedł do `ready` i został włączony, ale kod nie otwierał punktu wejścia, więc ekran się nie zmieniał | po aktualizacji log startu ma `state-open`, a na ekranie widać tytuł i pasek |

H2 celowo nie jest częścią domyślnej diagnostyki. Wersja firmware bywa powiązana z numerem pojazdu w logach; dopiszemy ją do skryptu dopiero, gdy zakres odczytu zostanie zatwierdzony osobno.
