# iPhone Mirror

Plan aplikacji. Kodu strumienia nie ma. Wpis nie jest w `mgu-repo.json`, więc Store z tego repozytorium jej nie zainstaluje.

Cel właściciela: obraz z iPhone’a przez lokalną sieć jego hotspotu, na centralnym wyświetlaczu, oraz opcjonalnie na HUD wyłącznie na postoju.

## Fakty, na których plan stoi

- Aplikacja z `"mguInternet": true` dostaje sieć, gdy zainstalowany jest `mgu-uplink` i jest online. Źródło: `mgu-store` `docs/PUBLISHING.md`.
- iPhone z Personal Hotspot po USB jest obsługiwany przez uplink: telefon odblokowany, komunikat zaufania, odtwarzanie muzyki po USB wtedy stoi. Wi-Fi też jest możliwe. Własny hotspot samochodu i bezprzewodowy CarPlay działają obok. Radio Broadcom w iDrive 7 nie łączy sieci tylko WPA3. Źródło: `mgu-store` `README.md`, „Internet”.
- Strona telefonu w Store jest do zarządzania źródłami, nie do obrazu. Telefon ma być w hotspocie samochodu. Adres jednostki na tym hotspocie, podany dla SSH: `172.16.222.97`. Źródło: `mgu-store` `README.md`.
- Centralny wyświetlacz przyjmie obraz jako PNG przez RHMI (wolno, kilka klatek na sekundę bez GPU) albo jako klatkę `IMAGE` / `VIDEO` do `mgu-render`. Źródła: `idrive7-apps` `kit/renderd/README.md` i `PROTOCOL.md`.
- HUD rysuje `cluster-render`. Mapa na HUD jest eksperymentalna, ustępuje popupom BMW i wyłącza się po dwóch restartach zestawu wskaźników. Źródło: `idrive-apps` `README.md`. To narzędzie instaluje się ze źródła `robertnisipeanu/idrive-apps`, nie z tego repozytorium.
- Prędkość do bramki postoju: `Vehicle2.statusCarSpeed2`, skala 0,015625, próg 3 km/h, nieprawidłowe 65535. Źródło: `idrive7-apps` `kit/runtime/parked.js`. Implementacja w `lib/parked-gate.js` jest ostrzejsza: bez prawdziwej próbki postoju HUD zostaje pusty.
- Roszczenie HUD między aplikacjami to plik w `/dev/shm/mgu-hud`. Źródło: `kit/runtime/hud_claim.js`.

## Czego ten plan nie robi

Nie przechwytuje CarPlay, AirPlay ani obrazu chronionego. Nie dokleja się do procesu telefonu. Nie zapisuje do DSC, DME, DDE ani VTG. Nie trzyma HUD podczas jazdy, także gdy prędkość jest nieznana albo sygnał zamilkł po jeździe.

Aplikacja mapy z `idrive-apps` pokazuje mapę z CarPlay na zestawie wskaźników. To jest inny produkt, z własną łatką CarPlay, i nie jest bazą iPhone Mirror.

## Architektura

Dwa programy, oba uruchamiane świadomie przez właściciela.

1. **Nadajnik na iPhonie.** Mała usługa, którą właściciel sam włącza, publikuje kolejne klatki JPEG po HTTP w sieci lokalnej. Adres i port wpisuje się w aplikacji w samochodzie. Brak wykrywania przez mDNS, bo źródła go nie opisują (H7).
2. **Aplikacja MGU `g21_mirror`.** Na centralnym wyświetlaczu pokazuje stan: brak adresu, łączenie, ostatnia klatka, utrata sieci. Klatkę rysuje dopiero, gdy adres jest wpisany. Na HUD nie rysuje nic, dopóki `hudAllowed()` nie zwróci prawdy i dopóki właściciel nie włączy ustawienia „HUD na postoju”.

Ustawienie HUD domyślnie wyłączone. Gdy prędkość przekroczy 3 km/h albo próbka zniknie po jeździe, aplikacja gasi warstwę HUD i puszcza roszczenie w tej samej pętli, bez czekania na kolejny ekran ustawień. Centralny wyświetlacz może zostać przy stanie tekstowym także w ruchu. Obraz na środku podczas jazdy jest osobną decyzją i w pierwszej wersji też zostaje wyłączony: pierwsza wersja pokazuje obraz tylko na postoju, na obu polach. To jest surowsze niż prośba o sam HUD i upraszcza pierwszy test.

### Sieć

Właściciel prosił o hotspot iPhone’a. To jest docelowa sieć (H8): jednostka dołącza do hotspotu telefonu przez Wi-Fi Store, a aplikacja łączy się z adresem wpisanym ręcznie.

Potwierdzona alternatywa, gdy H8 odpadnie: telefon wchodzi w hotspot samochodu, tak jak strona telefonu Store, i nadajnik słucha tam. Adres telefonu i tak wpisuje właściciel, bo źródła podają tylko adres jednostki `172.16.222.97`.

USB Personal Hotspot jest faktem dla internetu jednostki, ale wyłącza muzykę USB i wymaga odblokowanego telefonu. Nie jest domyślną drogą obrazu.

### Zależności, gdy aplikacja w ogóle powstanie

- `mguInternet: true` i obecny `mgu-uplink`.
- Dla HUD: zainstalowany wcześniej `cluster-render` ze źródła `idrive-apps`, wersja ustalona w `requires` w chwili implementacji, nie zgadywana teraz.
- Dla szybszego obrazu na środku: renderer Store albo `idrive7-renderd`. Pierwsza wersja może zostać przy jednej etykiecie statusu i bez wideo, żeby nie dokładać narzędzia natywnego.
- `uninstallable: true`, brak `LD_PRELOAD`, brak zapisu sygnałów (`w`).

Do `mgu-repo.json` aplikacja trafia osobnym commitem, po testach bramki i po zgodzie na publikację źródła. Samo dopisanie jej do listy sprawia, że Store na kanale gałęzi zacznie ją oferować.

## Testy zanim powstanie ekran

Już są: `tools/test_parked_gate.js` pokrywa nieznaną prędkość, 65535, dokładnie 3 km/h, wartość tuż powyżej, powrót do zera i 65535 po jeździe.

Przy implementacji dojdą testy bez samochodu: maszyna stanów (brak adresu, łączenie, klatka, utrata), odrzucenie HUD gdy `hudAllowed()` jest fałszem, oraz rezygnacja z roszczenia HUD. Testy nie otwierają gniazda sieciowego na zewnątrz.

## Kolejność wdrożenia, każda po osobnej zgodzie

1. H1, diagnostyka odczytowa.
2. Szablon `g21_hello` ze Store, żeby potwierdzić RHMI (H4, H5).
3. Na postoju: ręczne sprawdzenie, czy Wi-Fi jednostki widzi hotspot iPhone’a (H8). Bez instalacji Mirror.
4. Status tekstowy `g21_mirror` bez obrazu i bez HUD.
5. Jedna klatka JPEG na środku, tylko na postoju.
6. HUD dopiero po H6 i H9, z ustawieniem domyślnie wyłączonym, na postoju, z natychmiastowym gaszeniem przy pierwszej próbce powyżej 3 km/h.

Usunięcie: Store → Installed → Remove, tak jak w [09-wycofanie.md](../09-wycofanie.md). Wycofanie aktualizacji: nie klikać Update. Tag nie instaluje się sam.

## Ryzyka

- Obraz na HUD, nawet na postoju, może zasłonić treść BMW. Dlatego pierwsza wersja nie rysuje HUD, a późniejsza ustępuje popupom tak, jak robi to mapa (`idrive-apps` `README.md`). Nie włączamy opcji „trzymaj nad popupami BMW”.
- Opóźnienie sygnału prędkości. Źródło czyta prędkość co 2 s, bo postój może nie wysłać zmiany. Między próbkami HUD może zostać włączony przez ułamek tego okna po ruszeniu. Dlatego próg zostaje przy 3 km/h, a pierwsza próbka powyżej gasi warstwę od razu. To nie jest hamulec ani blokada napędu. Jest wyłącznikiem obrazu.
- Dwa restarty zestawu wskaźników wyłączają mapę HUD u `cluster-render`. Mirror ma to uszanować i nie ponawiać roszczenia w kółko w tej samej jeździe.
- H7 może być fałszywa: „internet” w opisie Store nie musi oznaczać dowolnego adresu LAN. Wtedy obraz zostaje przy statusie, a sieć trzeba zaprojektować od nowa. Nie obchodzimy tego łatką systemu.
