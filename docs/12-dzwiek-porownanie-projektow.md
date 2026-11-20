# Dźwięk na iDrive 7: inne projekty a `g21-audio` (2026-11-20)

Pytanie właściciela: czy na GitHubie są rozwiązania dźwięku dla iDrive 7, które naprawią nasz problem „raz na zawsze";
porównać z naszym i poprawić. Auto było poza siecią, więc **nic z tego dokumentu nie było sprawdzane w aucie właściciela**.

## Co istnieje

| Projekt | Droga dźwięku | Co jest potwierdzone w aucie (wg autorów) |
|---|---|---|
| [Vizualyse/idrive-apps](https://github.com/Vizualyse/idrive-apps) (`tool/speakers`, `tool/pcm_play`, `knowledge/sound.md`) | źródło CarLife 287 → głośniki 1024, urządzenie `smartx:CarLifeMedia_CF_48_STEREO`; wcześniej wejście CarPlay | wejście CarPlay i odtwarzacz BMW (`playFile`) w aucie; `tool/speakers` „not yet tried on the car" (emulator) |
| [JustAnotherPU/moonride](https://github.com/JustAnotherPU/moonride) | to samo (287 → 1024), urządzenie otwierane bez blokowania, 3 × 1024 próbki | w aucie; stąd pochodzi nasz sposób pisania |
| [loenne007/idrive-enginesound](https://github.com/loenne007/idrive-enginesound) | to samo (287 → 1024) albo kanał nakładki 1048 (24 kHz mono) | w autach (zgłoszenia z G20); trzaski przy zajętej jednostce usunięte priorytetem czasu rzeczywistego i pełnym buforem |
| [pllanaio/mgu-browser](https://github.com/pllanaio/mgu-browser) (`docs/AUDIO.md`, `native/audio_bridge.c`) | to samo (287 → 1024), proces bez roota, `umask 0007` | wg opisu wydania 0.12.0 dźwięk w aucie niepotwierdzony |
| [Rbt1411/id7](https://github.com/Rbt1411/id7) | to samo (287 → 1024) | wg własnych notatek nietestowane w aucie |

Wszystkie pięć projektów używa tej samej drogi, którą `g21-audio` ma od początku (nasz `speakers.js` to moduł Vizualyse).
**Gotowego rozwiązania, którego nie mamy, nie ma.** Żaden z nich nie opisuje też naszego objawu „36 000 zamiast 48 000
próbek na sekundę" na wejściu CarLife – syntezator dźwięku silnika by go nie zauważył (wytwarza tyle, ile urządzenie bierze),
a pozostałe nie mierzą tempa.

## Porównanie z `g21-audio`

| Sprawa | Inni | My | Wniosek |
|---|---|---|---|
| Przejęcie głośników | `connect(287, 1024)` po oznaczeniu źródła jako dostępne | to samo (ten sam moduł), plus `park()` | bez zmian |
| Wejście odtwarzacza BMW (źródło 1046, `MediaSink_AudioOut_Front…`) | nikt go nie używa; Vizualyse: „8 kanałów, nie to gra dla źródła aplikacji", a ich testowy odtwarzacz na tym urządzeniu zablokował odtwarzacz BMW | domyślne od 0.1.18, z powrotem do CarLife, gdy zawiedzie | zostaje: pomiar w aucie właściciela (48 000/s w 5 rundach na 5, ton słyszany) jest mocniejszy niż cudza notatka; ale to jedyne miejsce, gdzie idziemy drogą, której nikt inny nie potwierdza |
| Blokada strumienia SmartX (`/run/smartx/smartx_<strumień>_p.lock`) | Vizualyse, auto 2026-11-05: blokada założona przez roota (0640) uciszyła CarPlay do restartu jednostki; naprawione w `pcm_play` 1.0.1 | program zapisujący dla wejścia odtwarzacza BMW startuje jako root; liczyliśmy na `umask 0007` i bit grupy folderu | **poprawione w 0.1.25**: blokada, która jest roota, dostaje właściciela i grupę folderu blokad, 0660 |
| Otwarcie urządzenia | bez blokowania (Moonride, enginesound); Vizualyse z blokowaniem i „pierwsze otwarcie po starcie może trwać 52 s" | bez blokowania | bez zmian |
| Bufor urządzenia | 3 × 1024 próbki narzucone przez SmartX; enginesound trzyma w nim zawsze cały okres | prosimy o 250 ms, piszemy do pełna; **nie logowaliśmy, ile urządzenie naprawdę dało** | **0.1.25 loguje** bufor i okres – potrzebne do sprawy 36 000 |
| Zator / opóźnienie | Vizualyse: starsze próbki są wyrzucane, urządzenie trzymane 60 ms | zapas 240 ms, tempo ±1,5 %, cięcie dopiero powyżej 800 ms | bez zmian |
| Priorytet czasu rzeczywistego | enginesound: SCHED_RR 2, bo zajęta jednostka (kamera cofania) dawała trzaski przy buforze 21 ms | brak; nasz bufor to 64 ms i więcej | nie przenoszę bez objawu w aucie |
| Powrót do radia | Vizualyse: menedżer dźwięku pamięta ostatnie źródło i wraca do niego po restarcie – trzeba kończyć na radiu | `release()` i `recover()` przy starcie (ten sam moduł) | bez zmian |

## Sprawa 36 000 / 48 000

Nasze pomiary z auta (2026-11-15…20): wejście CarLife bierze 48 000 albo 36 000 próbek na sekundę, losowo przy każdym
otwarciu, niezależnie od sposobu pisania. Inne projekty tego nie tłumaczą. Jedna hipoteza z ich kodu: bufor ma 3 okresy
po 1024 próbki, a 36 000 to dokładnie 3/4 – tyle dostaje czytelnik, który raz na cztery okresy zabiera cały bufor. Jeżeli
tak jest, większy przyznany bufor usuwa objaw. Tego nie da się sprawdzić poza autem; od 0.1.25 w logu przy każdym
otwarciu jest wiersz `out: device buffer N frames, period M frames` obok wierszy tempa (`slow, the device takes …`).

## Czego nadal nie wiadomo

- Czy `g21-audio` 0.1.24 (usunięte zawieszenie demona) gra w aucie przy drugim i kolejnych strumieniach. To była
  odczytana z auta przyczyna zgłoszeń „pierwszy dźwięk gra, potem nie" i „nie działa wcale"; po poprawce niesprawdzone.
- Czy wejście odtwarzacza BMW działa przy kolejnych przejęciach głośników (Vizualyse: HMI samo wraca do radia ok. 10 s po
  połączeniu źródła 1046, gdy odtwarzacz BMW nic nie gra). Jeżeli log pokaże `media input: …` przy każdym strumieniu,
  właściwy ruch to `"input": "carlife"` jako domyślne – droga wszystkich pozostałych projektów.
