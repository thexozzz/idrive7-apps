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
| H11 | Reguła nft o priorytecie -10 wpuszcza AirPlay zanim `mgu-uplink` odrzuci nowe połączenia na tym interfejsie | po instalacji `g21_airplay` iPhone-host Personal Hotspot widzi „G21” w lustrze ekranu |
| H12 | Odpowiedź `/info` i ogłoszenie mDNS wystarczą, żeby iOS zaczął sesję | H11; pierwsza linia żądania pojawia się na ekranie aplikacji |
| H13 | `waylandsink` UxPlay rysuje lustro na centralnym ekranie przez kompozytor jednostki | po instalacji `g21_airplay` z gałęzi `test`: na iPhonie w hotspocie widać G21, a obraz pojawia się na ekranie |
| H21 | Bundlowany avahi z overlay konta `avahi` + D-Bus z `/run` (rootfs RO) rejestruje DNS-SD na uplink Store | po Update narzędzia 0.1.7+ i starcie AirPlay: brak `mdns-brak`, iPhone widzi G21 |
| H24 | Rozdzielenie ekranów AirPlay/RDP w menu i `_sync` usuwa mieszanie statusów między protokołami | po Update aplikacji wejście w RDP nie pokazuje `brak dns`, a AirPlay nie pokazuje hosta RDP |
| H25 | RDP end-to-end: Polacz z IP/user/haslem z panelu :1235, zatwierdzenie Cert i obraz przez g21-present | na postoju po Update: status `RDP dziala`, pulpit Windows na srodku |
| H22 | iPhone jako host Personal Hotspot widzi odbiornik AirPlay u klienta swojej sieci (UxPlay+avahi) | H11 na Karolphone / `172.20.10.0/28` |
| H23 | Binarki z `/lib64` INTERP wstają na MGU przez `run-elf` i `/lib/ld-linux-x86-64.so.2` | potwierdzone odczytem 2026-11-12: sam `uxplay.bin` = not found, przez linker startuje |
| H14 | Manifest OAP dostarcza `Vehicle2.statusCarSpeed2` do tej aplikacji | na postoju ekran nie pokazuje `speed-unknown` i AirPlay wstaje po wyborze kafelka |
| H15 | `ZBETouchFrontSide` daje współrzędne palca tylko przy `statusSystemModeFrontSide` 3, a bez zapisu trybu pisania ten tryb się nie włącza | log inspektora po jeździe palcem po pokrętle; dopóki nie ma takiej próbki, touchpad zostaje niedostępny |
| H16 | `g21-present` i `g21-rdp` rysują pulpit na centralnym ekranie przez ten sam Wayland co UxPlay | na postoju VNC albo RDP do komputera w tej samej sieci, obraz 1920×720, kursor reaguje na pokrętło |
| H17 | `openEntryState` po `mapEntryState` pokazuje stronę AirPlay. Odczyt 2026-11-12: 0.1.10 otworzył stronę, ale `openEntryState` zwrócił `INVALID_UUID`, a widokiem był pusty obraz | po aktualizacji widać listę menu, nie pusty obraz |
| H18 | Lista `LT_State_Wide` z `LT_Button_2Row_2Text` rysuje menu tak jak ustawienia aplikacji, która na tym aucie pokazuje tekst. Sprawdzenie 2026-11-12: 0.1.11 otworzył tę listę (`state-open`) i wiersze zostały puste | po zmianie opisu wiersze widać bez renderera |
| H19 | Ramka CLEAR i RECT na gnieździe renderera rysuje cztery wiersze menu na stronie, która jest z przodu. Potwierdzone 2026-11-12 przez właściciela: menu AirPlay jest widoczne | zostaje wzorem dla następnych ekranów; nie wracać do samego tekstu RHMI |

H2 celowo nie jest częścią domyślnej diagnostyki. Wersja firmware bywa powiązana z numerem pojazdu w logach; dopiszemy ją do skryptu dopiero, gdy zakres odczytu zostanie zatwierdzony osobno.
