# Chromium na iDrive 7: gotowe rozwiązania i co z nich wynika (2026-11-20)

Pytanie właściciela: czy są gotowe rozwiązania z potwierdzonym działaniem i płynnością Chromium na iDrive 7, które można
przenieść do Przeglądarki THEiPlay. Rozpoznanie z publicznych źródeł; auto było poza siecią, więc **nic z tego dokumentu
nie było sprawdzane w aucie właściciela**.

## Co istnieje

| Projekt | Co robi | Co jest potwierdzone w aucie (wg autorów) |
|---|---|---|
| [Vizualyse/idrive-apps](https://github.com/Vizualyse/idrive-apps), `native/vizualyse-chromium` (GPL-3.0) | Chromium 156 (Debian) na jednostce, własny mały kompozytor Wayland → plik klatek `mgu-render`; eksperymentalny tryb GPU | Tryb procesora przez Wayland (0.2.5): konwersja klatki 3 ms. Tryb GPU na sterowniku jednostki (0.2.1): WebGL 2, kompozycja i canvas sprzętowo. W grze WebGPU (0.2.6, tryb GPU, pół rozdzielczości): ok. 5 obrazów/s |
| [pllanaio/mgu-browser](https://github.com/pllanaio/mgu-browser) | Chromium ze zrzutami ekranu, 1280×384, wysyłane tylko zmienione wiersze | Działa na jednostce; bez GPU, bez dźwięku |

Płynnego Chromium na GPU z pomiarem dla zwykłych stron nie pokazuje żaden z nich. Najbliżej jest tryb GPU Vizualyse:
działa w aucie, ale autorzy nie podają liczby klatek dla stron, a jedyny pomiar w trybie GPU to ciężka gra (5 obrazów/s).

## Architektura: to samo, co mamy

Vizualyse doszedł niezależnie do tej samej budowy, co `g21-browser` od 0.1.47/0.1.53: Chromium na własnym backendzie
Wayland (`--ozone-platform=wayland --kiosk`), własny minimalny kompozytor zamiast zrzutów DevTools, klatki jako I420 w
pliku `mgu-render`. Ich pomiar poza autem: ta sama animowana strona 1790×638 – zrzuty JPEG 143 % rdzenia, Wayland 29 %.
Nasz `g21-wlframe` robi to samo.

Różnice warte uwagi:
- **Tempo 30 klatek/s** przy widocznej stronie (5, gdy schowana): „Chromium nigdy nie rysuje więcej, niż ekran bierze".
  U nas domyślnie 60; reguła `"frames": "direct30"` daje 30.
- **Rozdzielczość** pełna, 3/4, 1/2, 1/3, 1/4 przy niezmienionym układzie strony. U nas „Obraz stron" 100 / 75 / 50 %.
- **Pamięć**: grupa cgroup z limitem (1536 MB domyślnie, do 3 GB), mniej procesów stron. U nas limit w demonie.
  Wyłączenie izolacji witryn, które tam stosują, u nas odpada: osłabia zabezpieczenia Chromium.

## Tryb GPU u Vizualyse: jak działa i czego uczy

- **Sterownik jednostki, nie własny.** Własna Mesa 25 (Vulkan) odmówiła jądra 4.14; własna Mesa 22.3 **zawiesiła proces w
  jądrze przy otwarciu GPU, trzymając blokadę DRM: HMI przestało rysować, ekran zgasł, jednostka restartowała się przy
  każdym starcie**, dopóki nie zmienili pliku przez SSH. Jądro to wydanie Intela (IOTG i915 z 2019 r.), nie zwykłe 4.14.
  Wniosek autorów, który przyjmujemy: **żadnego własnego sterownika GPU**; tylko biblioteki jednostki (Mesa 19.0.6,
  `i965`), których używa HMI i `mgu-render`.
- **Jak:** ANGLE w trybie GLES (`--use-gl=angle --use-angle=gles-egl`) na `libEGL` jednostki. Mały własny `libEGL.so.1`
  (`gpu/egl_shim.c`, 408 wierszy) zamienia domyślny wyświetlacz EGL na GBM na węźle `/dev/dri/renderD128` (inaczej Mesa
  otwiera `card0`, który należy do kompozytora BMW) i udaje powierzchnie „pbuffer", których Mesa 19 na GBM nie ma.
  Biblioteki `libgbm`, `libGLESv2`, `libglapi`, Wayland i `libffi` idą z jednostki; `libdl`/`libpthread`/`librt` jednostki
  nie mogą się załadować do procesu z nowszym glibc.
- **Siatka bezpieczeństwa:** włączany tylko ręcznie, nigdy zapamiętywany (każdy start narzędzia jest na procesorze),
  znacznik „próba w toku" w `/var/opt`, powrót na procesor, gdy sonda nie widzi GPU albo Chromium się kończy.
- **Obraz z GPU:** bufory GBM (wl_drm/PRIME) są odczytywane z powrotem przez EGL jednostki do pliku klatek. Droga bez
  odczytu (bufory wprost do kompozytora BMW, „Winston output") jest u nich sprawdzona tylko poza autem.

To rozwiązuje oba powody, dla których nasz silnik rysuje procesorem (docs/ai/BROWSER_PLAN.md): brak
`gbm_bo_get_fd_for_plane` w `libgbm` jednostki i niezgodność naszej Mesy z `libEGL` jednostki.

## Co da się przenieść

1. **Już zrobione teraz** (bez GPU): brak zapasowego procesu strony; poprawka pokazywania właściwej karty po restarcie
   silnika, dzięki której „Obraz stron" 75 / 50 % działa także bez DevTools.
2. **Tryb GPU wzorem Vizualyse** – jedyna droga z potwierdzonym działaniem w aucie:
   - `egl_shim.c` można wziąć wprost (GPL-3.0, zgodne z naszą licencją, z zachowaniem autora);
   - `g21-wlframe` musi umieć przyjąć bufory GPU (wl_drm) i odczytać je przez EGL jednostki – dziś zna tylko pamięć
     współdzieloną i jest zbudowany statycznie;
   - nasz silnik to Chrome for Testing 153 od Google, nie Chromium Debiana: trzeba sprawdzić, czy ładuje `libgbm`
     jednostki (u Debiana brakujący symbol jest „słaby") i czy jego ANGLE ma tryb `gles-egl`;
   - siatka bezpieczeństwa jak wyżej, obowiązkowo.
3. **Nie przenosimy:** własnych sterowników GPU, wyłączania izolacji witryn, startu bez piaskownicy.

## Ryzyko i czego nie wiadomo

- Tryb GPU wymaga prób w aucie; na stanowisku nie ma tego układu ani jądra. Błąd w tej warstwie może zawiesić HMI do
  restartu jednostki (tak było u Vizualyse z własnym sterownikiem; ze sterownikiem jednostki nie zgłaszają zawieszeń).
- Nie wiadomo, czy GPU przyspieszy zwykłe strony: rysowanie przejdzie na GPU, ale obraz trzeba odczytać z powrotem do
  pliku klatek. Nasz pomiar starej drogi (biblioteka wideo z 2017 r.) dał 30 ms na klatkę 854×480; odczyt przez GL nie
  był mierzony.
- Z logu auta właściciela (2026-11-20, tryb procesora, 100 % pikseli, 60 klatek/s): 13 klatek/s podczas ruchu obrazu,
  367 ms między klatkami w środku rozkładu. To punkt odniesienia dla każdej zmiany.
