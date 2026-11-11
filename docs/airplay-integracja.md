# Integracja AirPlay, UxPlay i cluster-render

Audyt z 11 listopada 2026. `cluster-render` z commita `a559f69ebc8c`. UxPlay z tagu `v1.73.7` w `third_party/UxPlay`.

## Co jest w kodzie

`cluster-render` 0.5.4 to jedna usługa dla wszystkich aplikacji. Gniazdo: `/dev/shm/cluster-render/render.sock`. Klient Node 8 jest w `native/cluster-render/js/cluster_render_client.js` i został skopiowany do aplikacji wraz z nagłówkiem MPL-2.0. Nie ma drugiej kopii samej usługi w tym repozytorium. Aplikacja wymaga `cluster-render` 0.5.4 ze źródła `robertnisipeanu/idrive-apps`.

Na iDrive 7 usługa w `hello` podaje cele `map:1088x480`, `panel:1920x720`, `hud:800x480`. Środek zegarów, na którym leży mapa, to cel `map`. HUD to cel `hud`. To nie jest ten sam prostokąt. Klatka wideo to atlas YUV 4:2:0, szerokość podzielna przez 4, wysokość parzysta, co najwyżej 1920×720. Jedna aplikacja ma do 64 warstw, wszystkie razem do 96. Warstwa znika wraz z połączeniem. `yield` 1 oddaje HUD popupom BMW. `guide_hold` 0 zostawia fabryczne pole nawigacji. Tych pól adapter nie odwraca.

UxPlay dekoduje H.264 raz, elementem `decodebin` (na MGU może to być dekoder VA-API, inaczej `avdec_h264`). Przy `G21_YUV` ta sama klatka I420 idzie drugą gałęzią do `/run/g21-airplay/latest.yuv`. `video_decoder.js` nie dekoduje drugi raz: składa z niej atlas YUV 4:2:0, którego oczekuje `cluster-render`.

## Przepływ, który da się dziś uruchomić lokalnie

iPhone, AirPlay i UxPlay zostają na ścieżce środkowego ekranu. Program jest w `native/g21-airplay-open` (`uxplay` + `uxplay.bin` + `lib/`). Od tej zmiany UxPlay wstaje dopiero, gdy aplikacja na postoju wybierze AirPlay. RDP i VNC są opisane w `docs/pulpit-zdalny.md`. `DisplayOutputManager` trzyma jedno aktywne wyjście. Domyślnie jest nim Central Display. Cluster i HUD odrzuca, dopóki nie ma postoju albo gdy renderer zgłasza `no-yuv-source`. Przełączenie, które się nie uda, wraca do poprzedniego wyjścia. Utrata prędkości albo jazda powyżej 3 km/h gasi warstwę na zegarach i HUD i oddaje obraz na środek, jeśli środek jest dostępny.

Symulator `node tools/sim_display.js` otwiera `http://127.0.0.1:8091`. Napis na stronie mówi, że to nie jest samochód i nie ma strumienia AirPlay.

## Czego ten kod nie robi

Nie dekoduje H.264 do YUV. Nie rysuje lustra na zegarach ani HUD. Nie uruchamia `cluster-render`. Nie zmienia UxPlay. Testy sprawdzają protokół rozmiaru klatki, odmowę celu spoza `hello`, bramkę postoju i powrót po błędzie startu.
