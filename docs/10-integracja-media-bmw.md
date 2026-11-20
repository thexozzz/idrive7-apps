# THEiPlay jako źródło w fabrycznym menu Media – stan analizy (2026-11-20)

Pytanie właściciela: czy fabryczny interfejs BMW może pokazywać THEiPlay jako źródło multimediów (nazwa, logo, moduł,
tytuł, okładka, Play/Pause, następny/poprzedni) i czy THEiPlay może być pozycją menu Media obok Bluetooth, USB i radia.

Analiza była wyłącznie odczytowa. Auto było poza siecią, więc opisów interfejsów z jednostki (`/usr/lib/oap-mainapp/src-gen`,
`/etc/oap/someip/someip-interfaces.json`) nie dało się przeczytać. **Nic z tego dokumentu nie jest wdrożone i nic nie
było sprawdzane w aucie.** Warstwy integracyjnej nie napisałem: bez opisu interfejsu byłby to kod zgadywany, który
dotyka routingu dźwięku.

## Co wiadomo

1. **Jak RideTube „podaje tytuł".** `native/jap-ridetube-d/ytd.js` nie wysyła żadnych metadanych. Łączy źródło
   AudioManagera z głośnikami (`CommandControl.connect`) i każe fabrycznemu odtwarzaczowi BMW – usłudze SOME/IP
   `de.bmw.infotainment.entertainment.mediaplayer.MediaPlayer`, instancja `OapGenericMedia` – odtworzyć **plik**
   (`playFile{path}`), a potem słucha `playerState`, `currentItemTime`, `playbackErrorEvent` i używa `sendButtonEvent`
   (PLAY/PAUSE/STOP) oraz `setTime`. Jeżeli auto pokazuje tytuł, to dlatego, że odtwarzacz BMW sam czyta go z pliku
   (znaczniki w `audio.m4a`) – to wniosek z kodu, nie obserwacja interfejsu.
2. **Dlaczego to nie przenosi się wprost na AirPlay i przeglądarkę.** Ten odtwarzacz gra pliki. AirPlay, strony i
   aplikacje dają dźwięk na żywo (PCM do wejścia SmartX: `CarLifeMedia` albo `MediaSink_AudioOut_Front…`), więc nie ma
   pliku, z którego BMW mogłoby wziąć tytuł.
3. **Publiczne projekty dla odblokowanego MGU.** Przejrzane: `cauliflowermossgrape/idrive7-apps`,
   `robertnisipeanu/mgu-store`, `robertnisipeanu/idrive-apps`, `IterioDev/car-apps`, `pllanaio/mgu-browser`. Żaden nie
   rejestruje własnego źródła w menu Media ani nie publikuje tytułu czy okładki do fabrycznego HMI. `mgu-browser` gra
   tak jak my: źródło 287 `CarLifeMedia`, zlew 1024, bez metadanych (jego `docs/AUDIO.md`). `idrive-apps` łata
   CarPlay dla mapy na zegarach – to modyfikacja usługi BMW, której tu nie robimy.
4. **Aplikacja AirPlay „zintegrowana z menu BMW".** Nie znalazłem jej w publicznych źródłach (wyszukiwanie w GitHubie
   i w sieci nie dało repozytorium ani opisu). Jeżeli właściciel zna nazwę albo adres – wystarczy mi link, żeby
   przeczytać jej manifest i wywołania.
5. **MPRIS / D-Bus.** W kodzie platformy, który mamy, nie ma śladu MPRIS; cała komunikacja aplikacji z autem idzie
   przez SOME/IP (katalog interfejsów na jednostce). Czy jest magistrala D-Bus z nazwą odtwarzacza – sprawdzi sonda.

## Czego nie wiadomo (i co rozstrzyga)

| Pytanie | Co je rozstrzyga |
|---|---|
| Czy `MediaPlayer` ma metody do ustawienia tytułu / wykonawcy / okładki bez pliku | lista metod i atrybutów z `…_mediaplayer_MediaPlayer.json` |
| Czy są inne instancje niż `OapGenericMedia` i która zasila widżet Media, zegary i HUD | instancje w opisie i w kodzie MainApp |
| Czy istnieje usługa „źródeł" (lista źródeł menu Media) i czy aplikacja OAP może do niej dopisać pozycję | katalog SOME/IP: usługi z „source", „entertainment", „media" |
| Czy da się dać własne źródło AudioManagera (własna nazwa i ikona) zamiast pożyczonego 287 / 1046 | konfiguracja AudioManagera na jednostce |
| Czy przyciski Play/Pause/Next z kierownicy trafiają do `sendButtonEvent` instancji, na którą możemy się zapisać | zdarzenia `MediaPlayer` |

Sonda tylko do odczytu: `tools/car-media-probe.sh` (uruchamia właściciel, gdy auto jest w sieci:
`ssh root@<auto> sh < tools/car-media-probe.sh > media-probe.txt`). Niczego nie uruchamia i niczego nie łączy.

## Najbardziej prawdopodobna droga (hipoteza, do potwierdzenia sondą)

- **Tytuł i okładka przez odtwarzacz BMW bez przejmowania dźwięku**: jeżeli `MediaPlayer` pozwala ustawić opis
  bieżącej pozycji albo przyjmuje „plik" będący potokiem (FIFO), wspólny menedżer „co teraz gra" w THEiPlay mógłby
  podawać mu nazwę modułu i tytuł (YouTube: tytuł filmu; przeglądarka i aplikacje: tytuł strony; AirPlay: tytuł z
  metadanych DACP, jeżeli odbiornik je dostaje). Dźwięk szedłby tym samym wejściem `MediaSink…`, które od 0.1.18
  i tak należy do tego odtwarzacza (źródło 1046).
- **Jeżeli odtwarzacz przyjmuje tylko pliki**: tytuł da się pokazać wyłącznie dla treści, które mamy jako plik
  (YouTube już tak działa). Dla AirPlay i stron zostaje nazwa źródła.
- **Własna pozycja w menu Media** wymaga usługi listy źródeł po stronie HMI. Jeżeli jej nie ma w katalogu SOME/IP dla
  aplikacji OAP, pozostaje tylko zmiana plików BMW – tego nie robimy bez osobnej zgody.

## Warunki, które każda implementacja musi spełnić

- wspólna warstwa dla wszystkich modułów (jeden menedżer, nie cztery mechanizmy),
- żadnych zmyślonych metadanych: brak tytułu = sama nazwa THEiPlay i modułu,
- po zatrzymaniu odtwarzania i po zamknięciu aplikacji opis znika,
- routing dźwięku, synchronizacja obrazu z dźwiękiem i blokady jazdy bez zmian,
- nic nie zostaje po odinstalowaniu (żadnych wpisów w plikach BMW).
