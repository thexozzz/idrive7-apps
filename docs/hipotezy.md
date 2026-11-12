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
| H26 | UxPlay bez `-fs` utrzymuje RAOP/DNS-SD na MGU waylandsink i iPhone widzi G21 | po Update narzędzia 0.1.10+: status `running`, iPhone Control Center pokazuje G21 |
| H27 | Narysowana klawiatura pokretlem (zamiast LT_Speller) pozwala wpisac IP/konto/haslo na tym G21 | po Update 0.1.38+: OK na IP otwiera klawiature, OK na znakach buduje adres, OK zatwierdza |
| H28 | Odbiornik MS-MICE (`g21-mice` + `_display._tcp`) pokazuje G21 w Win+K na PC w tej samej Wi-Fi Store | po Update narzedzia 0.1.11+ i Wlacz w Windows: PC widzi G21, status `Windows dziala`, obraz na srodku |
| H29 | Pluginy GST RTP/mpegts (dokladane do narzedzia) laduja sie z bundlowanym GStreamer 1.14 na MGU | po Win+K: brak bledu gst w `/var/log/g21-mice.log`, obraz zamiast czarnego ekranu |
| H30 | Ekran `stream` (CLEAR + jeden kafelek Zakoncz) nie zasłania `waylandsink` / GST MS-MICE po zestrojeniu | po Update: po Włacz i parze widać stream z urządzenia; Zakoncz kończy sesję |
| H31 | UxPlay `-p 7400` omija zajęte TCP 7000 (CarPlay) i 7101 (`airplay-rx`); zapis ustawień w `data/g21_airplay` omija EACCES na `/var/opt` | po Update narzędzia 0.1.12+ i app: brak errno 98 w `g21-uxplay.log`, profile RDP zapisują się, Win+K ładuje RTP |
| H32 | Windows/Miracast bez bramki postoju (jak AirPlay) da się włączyć, gdy `Vehicle2.statusCarSpeed2` nie dochodzi | po Update: Wlacz w Windows zapisuje `allow=windows`, status nie zostaje na `brak predkosci` |
| H33 | Oferty SOURCE_READY w `/run/g21-desktop/offers` + accept z menu Urzadzenia dają stream po wyborze PC | po Update: Win+K → kafelek nazwy PC → klik → `running` + Zakoncz |
| H34 | TXT `container_id` w `_display._tcp` sprawia, że Windows 11 widzi G21 w Win+K w tej samej Wi-Fi Store | po Update narzędzia 0.1.13+: PC pokazuje friendly name sinka |
| H35 | Kafelek AirPlay `WL`/`WYL` śledzi `sessions.active()===airplay`, nie `receiver.mode`, więc po Włącz kafelek zostaje WL także w waiting | po Update: klik WYL→WL, status `AirPlay start` / czekaj, bez powrotu na WYL zanim nie klikniesz wyłączenia |
| H36 | Przy Miracast WL i ofercie SOURCE_READY auto-accept łączy PC bez kafelka Urzadzenia | po Update: Win+K → log `win-auto`, status `Miracast dziala`, stream + Zakoncz |
| H37 | Staly rzad kafelkow + hitbox ze slotem/gap i aktywacja na phase=3 daje dzialajacy tap na tym G21 | po Update: log `menu-hit up airplay` przy tapnieciu; choose bez pokretla |
| H38 | Image layer `AIRPLAY` na targetach `map` i `hud` (cluster-render) pokazuje napis na clusterze i HUD | po Update: widać AIRPLAY; kafelek WYL go chowa; log `label-on map` / `label-on hud` |
| H39 | Target `panel` (0x203), nie `map`, rysuje napis AIRPLAY na zegarach; HUD zostaje na `hud` | po Update: AIRPLAY na KOMBI i HUD; log `label-on panel` |
| H40 | AirPlay na MGU z BMW `mdnsd`+`libdns_sd` (bez bundlowanego avahi), UxPlay `setsid`/ignore HUP i `-as 0` zostaje na TCP 7400 | po Update narzędzia 0.1.15+: status `running` z procesem i `:7400`, iPhone widzi G21 na Karolphone |
| H41 | Po wyborze ekranu RDP sesja startuje bez `Vehicle2`, UI schodzi z `rdp-out` i po `connected` wchodzi na `stream` | po Update: Polacz → Srodek → status `RDP lacze` / stream + Zakoncz; log `rdp-out central` + `session-ok` |
| H42 | `chmod 666` na `/run/g21-desktop.status` + `allow` przed statusem usuwa EACCES OAP → `session-fail connect-failed` | po Update narzędzia 0.1.16+app: log `session-ok rdp`, `allow=rdp`, `/var/log/g21-rdp.log` z connecting |
| H43 | Zegary/HUD w pickerze RDP bez próbki prędkości; `g21-rdp` ustawia host/user/hasło przez `_strdup` (nie `strncpy` na `char*`) | po Update 0.1.17+/0.1.58: tap Zegary/HUD startuje; status `connecting`/`cert`/`connected`, bez `error|freerdp` z SEGV |
| H30 | CLAIM bez bramki front + pelny prostokat ekranu daje TOUCH na kafelkach menu | po Update: tap na Polacz/Dodaj wybiera kafelek; w logu `menu-touch` |
| H22 | iPhone jako host Personal Hotspot widzi odbiornik AirPlay u klienta swojej sieci (UxPlay+avahi) | H11 na Karolphone / `172.20.10.0/28` |
| H23 | Binarki z `/lib64` INTERP wstają na MGU przez `run-elf` i `/lib/ld-linux-x86-64.so.2` | potwierdzone odczytem 2026-11-12: sam `uxplay.bin` = not found, przez linker startuje |
| H14 | Manifest OAP dostarcza `Vehicle2.statusCarSpeed2` do tej aplikacji | na postoju ekran nie pokazuje `speed-unknown` i AirPlay wstaje po wyborze kafelka |
| H15 | `ZBETouchFrontSide` daje współrzędne palca tylko przy `statusSystemModeFrontSide` 3, a bez zapisu trybu pisania ten tryb się nie włącza | log inspektora po jeździe palcem po pokrętle; dopóki nie ma takiej próbki, touchpad zostaje niedostępny |
| H16 | `g21-present` i `g21-rdp` rysują pulpit na centralnym ekranie przez ten sam Wayland co UxPlay | na postoju VNC albo RDP do komputera w tej samej sieci, obraz 1920×720, kursor reaguje na pokrętło |
| H17 | `openEntryState` po `mapEntryState` pokazuje stronę AirPlay. Odczyt 2026-11-12: 0.1.10 otworzył stronę, ale `openEntryState` zwrócił `INVALID_UUID`, a widokiem był pusty obraz | po aktualizacji widać listę menu, nie pusty obraz |
| H18 | Lista `LT_State_Wide` z `LT_Button_2Row_2Text` rysuje menu tak jak ustawienia aplikacji, która na tym aucie pokazuje tekst. Sprawdzenie 2026-11-12: 0.1.11 otworzył tę listę (`state-open`) i wiersze zostały puste | po zmianie opisu wiersze widać bez renderera |
| H19 | Ramka CLEAR i RECT na gnieździe renderera rysuje cztery wiersze menu na stronie, która jest z przodu. Potwierdzone 2026-11-12 przez właściciela: menu AirPlay jest widoczne | zostaje wzorem dla następnych ekranów; nie wracać do samego tekstu RHMI |

H2 celowo nie jest częścią domyślnej diagnostyki. Wersja firmware bywa powiązana z numerem pojazdu w logach; dopiszemy ją do skryptu dopiero, gdy zakres odczytu zostanie zatwierdzony osobno.
