# Wydajność przeglądarki (Chromium na MGU) – pomiar, wąskie gardło, zmiany

Stan: 2026-11-19, `g21-browser` 0.1.45. **Pomiary pochodzą z maszyny deweloperskiej (WSL, Intel Core Ultra 9 285K),
nie z auta** – auto było poza siecią. Liczby bezwzględne na MGU (Atom A3960) będą kilka razy gorsze; porównanie
„przed/po” jest robione tym samym silnikiem, tymi samymi bibliotekami i tymi samymi scenami, więc proporcje są
miarodajne. Potwierdzenie w aucie: rozdział „Jak sprawdzić w aucie”.

## 1. Jak mierzone

Stanowisko: `tools/browser-bench/` (pełny Chrome for Testing 153 z załatanym loaderem, biblioteki z `lib/`, piaskownica
włączona, bez GPU – tak jak w aucie). Sceny, każda 8 s, okno strony 1436 × 438 px CSS przy skali 0,9375 (obraz
1346 × 410):

- `scroll` – długa strona przewijana w każdej klatce (cały obraz się zmienia),
- `anim` – dwie animacje CSS (zmienia się część obrazu),
- `video` – płótno przerysowywane co klatkę (namiastka filmu, bez dekodera),
- `still` – strona stoi.

Mierzone: klatki na sekundę dostarczone do pliku wideo, odstęp między klatkami (środkowy / 95% / najdłuższy), czas
procesora wszystkich procesów silnika, narzędzia klatek i demona (ms na sekundę; 1000 = jeden rdzeń), pamięć.

## 2. Wąskie gardło

Nie rysowanie strony, tylko **droga obrazu z silnika na ekran**. Dotąd każda klatka szła tak:
silnik → odczyt klatki → kodowanie JPEG → base64 w JSON (DevTools `Page.startScreencast`) → demon (Node) → dekodowanie
JPEG w `g21-webframe` → plik wideo. Pomiar:

| co | CPU silnika na klatkę |
|---|---|
| przewijanie, zrzuty JPEG q64 | 7,8 ms |
| to samo, JPEG q30 / q90 / PNG | 7,3 / 8,0 / 7,8 ms (jakość kodowania prawie bez znaczenia) |
| to samo, bez zrzutów (silnik tylko rysuje) | 1,3 ms |

Czyli ok. 80% kosztu klatki to zrzut i jego transport. Zgadza się to z pomiarem z auta z 2026-11-15 (film w pełnym
ekranie: jednostka 92–98%, połowa udziału narzędzia to przenoszenie obrazu). Z tego powodu tor był ograniczony do
20 klatek/s i 75% rozdzielczości.

## 3. Co zmienione

**Nowy tor obrazu („bezpośredni”)**: pełny Chrome nie pracuje już bez okna, tylko rysuje do jednego okna Wayland, a
drugim końcem tego okna jest nasz mały program `g21-wlframe` (serwer Wayland napisany ręcznie, bez bibliotek, jeden
plik C, statyczny). Silnik oddaje gotową klatkę przez pamięć współdzieloną (`wl_shm`), `g21-wlframe` przelicza BGRA →
I420 prosto do pliku wideo, i tylko ten prostokąt, który silnik zgłosił jako zmieniony. Nie ma JPEG, base64 ani Node
po drodze. Tempo nadaje serwer (potwierdzenia klatek): najwyżej 60 albo 30 klatek/s.

Wynik (te same sceny, ta sama maszyna):

| scena | tor | klatki/s | odstęp śr./95%/maks. | silnik ms/s | narzędzie klatek ms/s | demon ms/s | pamięć (RSS) |
|---|---|---|---|---|---|---|---|
| scroll | zrzuty (jak dotąd, 20/s) | 20,4 | 50 / 51 / 51 ms | 329 | 36 | 14 | 1416 MB |
| scroll | bezpośredni 60 | 59,7 | 16 / 16 / 26 ms | 112 | 31 | 9 | 1222 MB |
| scroll | bezpośredni 30 | 30,0 | 33 / 33 / 33 ms | 69 | 16 | 8 | 1201 MB |
| anim | zrzuty | 20,4 | 50 / 51 / 53 ms | 276 | 11 | 11 | 1360 MB |
| anim | bezpośredni 60 | 59,5 | 16 / 24 / 34 ms | 81 | 20 | 8 | 1166 MB |
| video | zrzuty | 20,4 | 50 / 51 / 52 ms | 351 | 16 | 12 | 1386 MB |
| video | bezpośredni 60 | 59,8 | 16 / 16 / 21 ms | 116 | 30 | 8 | 1178 MB |
| still | zrzuty | – | – | 30 | 0 | 0 | 1359 MB |
| still | bezpośredni | – | – | 29 | 0 | 3 | 1166 MB |

Trzy razy więcej klatek za mniej niż połowę procesora (przewijanie: 379 → 152 ms/s łącznie; przy 30 klatkach/s
93 ms/s). Przez prawdziwego demona (`tools/browser-bench/e2e.js`, piaskownica włączona): 59 klatek/s przy 12% jednego
rdzenia na silnik, wobec 20 klatek/s przy 34% starym torem.

Pozostałe zmiany:

- Pełny ekran filmu w torze bezpośrednim jest renderowany w 2/3 rozdzielczości ekranu (1280 × 480 zamiast 960 × 360).
- Gdy nikt nie patrzy (aplikacja zminimalizowana), klatki nie są przeliczane; ostatnia jest pokazywana po powrocie.
- Diagnostyka w demonie (rozdział 5).
- Reguła `frames` w `state/policy.json` i w menu: Aplikacje > Ustawienia > „Tor obrazu”: bezpośredni 60 / bezpośredni
  30 / zrzuty.

Zabezpieczenia bez zmian: piaskownica Chromium włączona, silnik pod własnym uid, gniazdo okna w katalogu 0700 silnika,
żadnych bibliotek ani usług BMW. Nic nie jest zmieniane w systemie auta.

## 4. Akceleracja sprzętowa – stan faktyczny

Silnik zgłasza (to samo trafia do logu jako wiersz `graphics:`): kompozycja `disabled_software`, raster
`disabled_software`, dekodowanie wideo `disabled_software`. **Sprzętowego renderowania w Chromium nadal nie ma** i ta
zmiana go nie włącza. Powody, zmierzone wcześniej w aucie:

- dekodowanie wideo: Chrome wymaga libva 2, auto ma libva 1.99 (VA-API 0.99, sterownik iHD 16.7.4). Sam układ dekoduje
  H.264 720p szybko (600 klatek: 0,6 s CPU), ale odczyt klatki z GPU do pamięci kosztował ok. 30 ms/klatkę wobec 11 ms
  dekodowania na CPU – dopóki obraz idzie przez pamięć, dekoder GPU jest stratą;
- GL/EGL: auto ma Mesa 19.0.6 (i965, EGL, GBM). Chrome 153 z własnym ANGLE na tak starym sterowniku nie był
  uruchamiany; wymaga sesji w aucie.

Nowy tor jest krokiem w tę stronę: silnik ma teraz prawdziwe okno Wayland, więc kolejny etap (bufory DMA-BUF zamiast
pamięci współdzielonej i GL przez Mesę auta) nie wymaga już zmiany architektury. Tego etapu tu **nie ma** – nie
włączam funkcji GPU, których sterownik auta nie potwierdził.

## 5. Diagnostyka (wbudowana)

- Log `/var/opt/g21-browser/log/browserd.log`:
  - `graphics: …` – raz po starcie silnika: renderer GL, stan kompozycji / rastra / dekodowania wideo, użyty tor;
  - `perf: …` – co 30 s, gdy obraz się rusza: tor, klatki/s, odstępy między klatkami (środkowy / 95% / najdłuższy),
    koszt klatki w narzędziu klatek, procesor silnika / narzędzia klatek / demona (udział jednego rdzenia), pamięć
    silnika, obciążenie systemu, czas wczytania ostatniej strony, czas od dotknięcia do następnego nowego obrazu;
  - `direct frames: …` – gdy tor bezpośredni nie zadziałał i nastąpił powrót do zrzutów.
- Strona `chrome://perf` w przeglądarce – te same liczby na ekranie.
- `tools/browser-bench/car-perf.sh` – wyciąga te wiersze z auta przez ssh.

Czego diagnostyka nie mierzy: obciążenia GPU (silnik go nie używa), klatek zgubionych w `mgu-render` (to proces BMW;
widzimy tylko klatki oddane do pliku wideo), opóźnienia panelu dotykowego przed aplikacją.

## 6. Przegląd przełączników silnika

| przełącznik | decyzja | uzasadnienie |
|---|---|---|
| `--disable-gpu`, `--disable-accelerated-video-decode/encode`, `VaapiVideoDecoder/Encoder` wyłączone | zostaje | rozdział 4: brak potwierdzonego GL, libva 1.99; próby: `state/engine-flags` |
| `--disable-software-rasterizer` | tylko lekki silnik | pełny Chrome bez niego nie startuje (auto, 2026-11-15) |
| `--headless=new` | tylko tor „zrzuty” | tor bezpośredni potrzebuje okna |
| `--ozone-platform=wayland --kiosk` | nowe, tor bezpośredni | okno w `g21-wlframe`, bez pasków przeglądarki |
| `--test-type=gpu` | nowe, tor bezpośredni | usuwa pasek „Chrome for Testing…” rysowany w oknie (sprawdzone na stanowisku); nie wyłącza piaskownicy |
| `--hide-crash-restore-bubble`, `--disable-search-engine-choice-screen` | nowe, tor bezpośredni | dymki, których nie da się kliknąć (wejście idzie przez DevTools) |
| `--force-device-scale-factor` | tylko tor „zrzuty” | w oknie skalę strony ustawia `Emulation.setDeviceMetricsOverride` (zmierzone: wymuszona skala zostawiała czarny margines) |
| `--disable-smooth-scrolling` | zostaje | dotyk go nie używa; kółko/pokrętło bez dodatkowych klatek |
| `--disable-background-*`, `--disable-renderer-backgrounding` | zostaje | film gra, gdy silnik uważa okno za zasłonięte |
| `--js-flags=--max-old-space-size=512`, limity pamięci | zostaje | pamięć jednostki |
| `--no-sandbox` | nigdy z własnej decyzji | reguła `sandbox`; bez zmian |

Nie dodałem żadnego przełącznika „przyspieszającego” bez pomiaru (`--enable-zero-copy`, `--ignore-gpu-blocklist`,
`--enable-gpu-rasterization` itp.): bez działającego GL nic nie dają, a mogą zawiesić start.

## 7. Ograniczenia i ryzyka (niesprawdzone w aucie)

- Całość toru bezpośredniego jest sprawdzona tylko na stanowisku. W aucie może nie ruszyć (jądro 4.14, inne limity);
  wtedy demon sam wraca do zrzutów (silnik nie wstał z oknem albo 8 s bez obrazu) i pisze `direct frames:` w logu.
- Menu rozwijane `<select>`, menu kontekstowe i dymki Chrome są osobnymi oknami – `g21-wlframe` je odsyła (nie da się
  ich kliknąć). W trybie bez okna też nie były widoczne, ale zachowanie na stronach z `<select>` trzeba sprawdzić.
- Silnik czeka na potwierdzenie klatki ok. 50 ms, potem rysuje sam – ograniczenie tempa działa od 20 klatek/s w górę.
- 60 klatek/s to tempo oddawania klatek do pliku wideo; czy `mgu-render` pokazuje je wszystkie, nie wiadomo.
- Koszt przeliczenia BGRA → I420 na Atomie nie jest zmierzony (stanowisko: 0,5 ms na pełną klatkę).
- Wideo HTML5: dekodowanie programowe jak dotąd; zyskuje tylko droga obrazu. Synchronizacja A/V bez zmian.

## 8. Jak sprawdzić w aucie (na postoju)

1. Zainstalować przez MGU Store (`g21-browser` 0.1.45, THEiPlay 0.1.203).
2. Otworzyć przeglądarkę, przewijać stronę ok. minuty, puścić film; potem Aplikacje > Ustawienia > „Tor obrazu” →
   „zrzuty” i to samo jeszcze raz.
3. `sh tools/browser-bench/car-perf.sh` (albo `chrome://perf` na ekranie) – wiersze `perf:` dla obu torów to pomiar
   „przed/po” z auta.

Cofnięcie: „Tor obrazu” → „zrzuty” (albo `"frames": "cast"` w `state/policy.json`) – stary tor jest nietknięty.
