# AirPlay — potok obrazu

Potwierdzone na tym G21 (listopad 2026), nie na podstawie samych nazw w kodzie.

## Co jest faktem

- UxPlay 1.73.7 dekoduje H.264 w GStreamer (`decodebin`) i zapisuje jedną klatkę I420 z nagłówkiem `G21Y` do `/run/g21-airplay/latest.yuv`. Drugiego dekodera w aplikacji nie ma.
- Ekran środkowy rysuje `mgu-renderd` na `/run/mgu-renderd/renderd.sock`, dialekt `mgu-render/1`. Klatka idzie do `/dev/shm/mgu-video-g21airplay` (nagłówek `MGVF`, I420, dwa sloty). Menu wysyła komunikat VIDEO i operację 19. Renderer zachowuje proporcje.
- `g21-present` / waylandsink na tym aucie jest czarną warstwą nad menu. Środka nie rysujemy tą drogą.
- Zegary: `cluster-render` 0.5.x, cele z hello `map:1088x480`, `panel:1920x720`, `hud:800x480`. Warstwa wideo wymaga szerokości podzielnej przez 4 i parzystej wysokości. Cel `panel` pokrywa cały KOMBI i chowa fabryczne BC (prędkość, obrotomierz, komunikaty). Cel `map` to kieszeń na środku zegarów. Napis w aplikacji działa, bo jest małym obrazem na `panel`/`hud`, nie warstwą wideo na całym `panel`.
- Fabryczny `airplay-rx` zostaje. Nasz odbiornik słucha na `172.20.10.2:7401`, gdy auto jest w hotspotcie iPhone'a. Zapytania mDNS z telefonu ucina fabryczny `ip filter` / `logblocked`, dopóki narzędzie nie wstawi wąskiego `accept` dla `wlan0` i `172.20.10.0/28`.

## Potok

`iPhone → UxPlay (jeden dekoder) → latest.yuv → video_router → backendy`

Router trzyma pierścień 3 klatek. Zostaje najnowsza. Środek i zegary mają osobny zegar.

| Wyjście | Backend | Limit | Kiedy |
|---|---|---|---|
| Środek | plik `mgu-video-*` + op 19 | 30 FPS | tryb `central` albo `both` |
| Zegary | `cluster-render`, domyślnie `map` 1088×480 | 2–6 FPS, start 4 | tryb `cluster` albo `both` i potwierdzony postój |

Wolniejsze zegary nie wstrzymują środka. Przy zbyt długim rysowaniu na KOMBI limit FPS schodzi w stronę 2.

Postój: `parked_gate`, próg 3 km/h. Brak próbki prędkości albo jazda wyłącza warstwę zegarów i zostawia fabryczny widok. Domyślny tryb to sam środek.

Dopasowanie `contain` daje pasy, `cover` przycina. Na `map` obraz nie jest rozciągany do 1920×720.

`panel` jest trybem eksperymentalnym. Zakrywa BC. Domyślnie wyłączony.

## Tryby w menu

Ekran AirPlay → Ekrany:

- Środek
- Zegary (mapa, tylko postój)
- Oba
- Wyłączone
- Mapa / Panel
- Contain / Cover

Jakość strumienia z telefonu: 720p (`-s 1280x720 -fps 30`) albo 1080p (`-s 1920x1080 -fps 30`). To żądanie do iPhone'a. Ta wersja UxPlay nie ma osobnego pola bitrate. Telefon dobiera przepływność do rozmiaru, zwykle około 4 Mb/s i 8 Mb/s.

## Pomiary

Co 5 s w logu startu, jedna linia `fps dec … c … k … drop … lat …`:

- `dec` — klatki zdekodowane na sekundę
- `c` — pokazane na środku
- `k` — pokazane na zegarach
- `drop` — klatki nadpisane w pierścieniu
- `lat` — ms od znacznika klatki do prezentacji

RAM i CPU procesu OAP nie są w tej linii. Limit pamięci OAP już raz ubił aplikację (`MEMORY_LIMIT_REACHED`), gdy co 50 ms liczyła pełne BGRA. Tego przeliczania nie ma.

## Co było nie tak

- Drugie rysowanie BGRA na cały ekran, co 50 ms, ubijało aplikację (`MEMORY_LIMIT_REACHED`). Został jeden dekoder w UxPlay.
- Obraz szedł na środek niezależnie od wybranego wyjścia, a `g21-present` kładł czarną warstwę na menu.
- Zegary dostawały warstwę wideo na cały `panel`. Renderer odrzucał szerokość niepodzielną przez 4, a sam `panel` chowa fabryczne BC. Napis działa, bo to mały obraz, nie pełna warstwa wideo.
- Środek i zegary były w jednym kroku. Wolniejsze KOMBI nie miało własnego zegara.
- Brak potwierdzonego postoju nie blokował pikseli na zegarach.

## Test bez auta

`node tools/test_all.js` przechodzi, w tym `tools/test_video_router.js`: contain i cover, pierścień 3 klatek, osobne FPS, blokada zegarów bez postoju, zejście limitu przy przeciążeniu.

## Test na postoju

1. Auto stoi, prędkość znana i nie większa niż 3 km/h.
2. Wgrać aplikację z gałęzi `test` dopiero po osobnej zgodzie. Nie restartować MGU.
3. Tryb Środek, jakość 720p, Start, lustro z iPhone'a. Obraz tylko na środku.
4. Zatrzymać. Tryb Zegary. Start. Obraz w kieszeni mapy, wskazówki i BC zostają.
5. Jazda albo zanik prędkości: warstwa zegarów schodzi sama.
6. Tryb Oba: środek nie czeka na zegary.
7. Po Zakończ nie zostaje plik `/dev/shm/mgu-video-g21airplay` ani warstwa `map`.

## Zużycie

Środek 720p: około 1,4 MB na klatkę I420, do 30 na sekundę, dwa sloty w `/dev/shm` (około 3 MB). 1080p: około 3,1 MB na klatkę, około 6 MB w shm.

Zegary: jedna klatka 1088×480 I420 to około 0,75 MB, 4 razy na sekundę. Szacunek CPU to kopiowanie tej klatki, nie drugie dekodowanie. GPU środka liczy renderer, nie proces OAP.
