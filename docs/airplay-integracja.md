# Integracja AirPlay i cluster-render

Audyt z 11 listopada 2026. `cluster-render` z commita `a559f69ebc8c`. Silnik odbiornika AirPlay: UxPlay `v1.73.7` w `third_party/UxPlay` — tylko jako biblioteka/backend w `g21-airplay-open`, nie jako osobna aplikacja z UI jak w repo FDH2.

## Co jest w kodzie

`cluster-render` 0.5.4 to jedna usługa dla wszystkich aplikacji. Gniazdo: `/dev/shm/cluster-render/render.sock`. Klient Node 8 jest w `native/cluster-render/js/cluster_render_client.js` i został skopiowany do aplikacji wraz z nagłówkiem MPL-2.0. Nie ma drugiej kopii samej usługi w tym repozytorium. Aplikacja wymaga `cluster-render` 0.5.4 ze źródła `robertnisipeanu/idrive-apps`.

Na iDrive 7 usługa w `hello` podaje cele `map:1088x480`, `panel:1920x720`, `hud:800x480`. Środek zegarów, na którym leży mapa, to cel `map`. HUD to cel `hud`. To nie jest ten sam prostokąt. Klatka wideo to atlas YUV 4:2:0, szerokość podzielna przez 4, wysokość parzysta, co najwyżej 1920×720. Jedna aplikacja ma do 64 warstw, wszystkie razem do 96. Warstwa znika wraz z połączeniem. `yield` 1 oddaje HUD popupom BMW. `guide_hold` 0 zostawia fabryczne pole nawigacji. Tych pól adapter nie odwraca.

Backend AirPlay dekoduje H.264 raz (`decodebin`). Przy `G21_YUV` ta sama klatka I420 idzie drugą gałęzią do `/run/g21-airplay/latest.yuv`. `video_decoder.js` nie dekoduje drugi raz: składa z niej atlas YUV 4:2:0 dla `cluster-render`.

## Przepływ, który da się dziś uruchomić lokalnie

iPhone i AirPlay zostają na ścieżce środkowego ekranu. Backend odbiornika jest w `native/g21-airplay-open` (silnik + `avahi-daemon` + `lib/`), nie jako osobna aplikacja UxPlay. Paczka narzędzia to pełny `component.json`. Wcześniejszy wpis `service` w `mgu-repo.json` instalował tylko skrypt, więc status był `missing`. Odbiornik wstaje, gdy aplikacja wybierze AirPlay i uplink Store jest Wi-Fi. iPhone może być hostem Personal Hotspot; jednostka jest wtedy klientem tej sieci i ogłasza G21 przez DNS-SD. Bez `avahi-daemon` (bundlowany w narzędziu, gdy systemowy nie wstaje) odbiornik nie rejestruje usługi i telefon nic nie widzi — status `mdns-brak`. Na tym MGU nie ma `/lib64`, więc `uxplay.bin`, `avahi-daemon`, `gst-plugin-scanner` i klienci pulpitu startują przez `run-elf` (`/lib/ld-linux-x86-64.so.2 --library-path lib/`). Odczyt 2026-11-12: bezpośredni exec dawał `not found`; `--daemonize=no` psuło start avahi; potem `Failed to find user 'avahi'` przy rootfs RO bez konta avahi. Narzędzie robi bind-mount `/etc/passwd` i `/etc/group` oraz polityki D-Bus z `/run` (znika po restarcie), potem startuje avahi z `enable-dbus=yes` i flagami `--no-drop-root` (bez `user=`/`group=` w conf). Odczyt 2026-11-12: nft AirPlay OK, Wi-Fi Karolphone OK, konto avahi OK; avahi 0.7 na MGU kończył się na `Invalid configuration key "user"` / `"group"` → `mdns-brak`. Później avahi wstawał, ale UxPlay z `-fs` padał: `no property "fullscreen" in element waylandsink` i `Error initialising socket 98`, więc RAOP się wyłączał i iPhone nie widział G21 — start bez `-fs`. Ekrany AirPlay i RDP są rozdzielone: `_sync` maluje tylko aktywny ekran menu, wejście w RDP kończy sesję AirPlay i odwrotnie. Stan wyboru jest napisem pod menu. Obraz lustra na środku zostaje hipotezą H13. RDP i VNC są opisane w `docs/pulpit-zdalny.md`. `DisplayOutputManager` trzyma jedno aktywne wyjście. Domyślnie jest nim Central Display. Cluster i HUD odrzuca, dopóki nie ma postoju albo gdy renderer zgłasza `no-yuv-source`. Przełączenie, które się nie uda, wraca do poprzedniego wyjścia. Utrata prędkości albo jazda powyżej 3 km/h gasi warstwę na zegarach i HUD i oddaje obraz na środek, jeśli środek jest dostępny.

Symulator `node tools/sim_display.js` otwiera `http://127.0.0.1:8091`. Napis na stronie mówi, że to nie jest samochód i nie ma strumienia AirPlay.

## Czego ten kod nie robi

Nie dekoduje H.264 do YUV. Nie rysuje lustra na zegarach ani HUD. Nie uruchamia `cluster-render`. Nie wystawia osobnej aplikacji UxPlay — tylko integrację AirPlay. Testy sprawdzają protokół rozmiaru klatki, odmowę celu spoza `hello`, bramkę postoju i powrót po błędzie startu.
