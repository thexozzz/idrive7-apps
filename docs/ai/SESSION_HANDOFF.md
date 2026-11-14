# Przekazanie sesji

## Sesja 2026-11-14 — onboarding (Claude)

**Zakres:** tylko odczyt repozytorium, logów i repozytoriów zewnętrznych; jedyne zmiany to nowe pliki `CLAUDE.md` i `docs/ai/*`. Nie było połączenia SSH z MGU, nie było commitów ani pushów.

**Ograniczenia tej sesji:** powłoka na komputerze właściciela była niedostępna (brak miejsca na dysku na VM), więc pliki czytano przez kopiowanie do kontenera; `git status` nie był uruchomiony; stan drzewa roboczego ustalono porównaniem z klonem `origin/test`. Binaria i `rhmiData` nie były kopiowane → walidator repo niesprawdzony; 13 testów jednostkowych przeszło (Node 22).

### Stan repo

- HEAD `store-publish` = `origin/test` = `fd4c9d6` („Put YouTube inside THEiPlay…”, 2026-11-14 02:12).
- **Niezatwierdzona praca w toku** (nie nadpisywać): `apps/g21_airplay/src/main.js` (YouTube login/QR, wspólna pozycja okna), `menu_draw.js`, nowy `src/qr.js`, `mgu-app.json` (+`src/qr.js`).
- Nowe (onboarding): `CLAUDE.md`, `docs/ai/*.md` — nie commitowane.

### Najważniejsze ustalenia

1. Hasło RDP w publicznym repo (K-01) — właściciel poinformowany w czacie.
2. Bramka postoju wyłączona w kodzie (K-02), manifest bez sygnałów pojazdu (K-03).
3. AirPlay: odkrywanie działa; zestawienie sesji niepotwierdzone — brak świeżych logów; hipotezy A1–A6.
4. RDP w ostatnim logu BROKEN; VNC, Win+K, YouTube niezweryfikowane.
5. Renderowanie środka działa wyłącznie przez renderer GPU społeczności; RHMI-tekst i waylandsink nie.

### Otwarte pytania do właściciela

- Czy AirPlay obecnie (0.1.121) daje obraz, czy nadal wisi na „łączeniu”? Jaka wersja jest zainstalowana na aucie?
- Czy wyłączenie bramki postoju było świadome i czy ma zostać?
- Jaki renderer GPU jest zainstalowany (idrive7-renderd / mgu-render 0.6.11) i czy `mgu-inputgate` jest aktywny?
- Czy `1.tar` to kopia `1/`? Czy dane z `../data/data/` mogą zostać przeniesione poza workspace?
- Czy repo `thexozzz/idrive7-apps` ma pozostać publiczne?

### Proponowana kolejność dalszych prac (czeka na decyzję)

1. K-01: usunięcie hasła z kodu (seed z pliku sekretu na aucie), zmiana hasła przez właściciela, decyzja o przepisaniu historii.
2. K-02/K-03: przywrócenie bramki postoju i dodanie odczytu `Vehicle2.statusCarSpeed2` do manifestu (zmiana wymaga reinstalacji → zgoda).
3. Diagnostyka AirPlay wg DEBUGGING.md (odczyt na postoju), lepsze logowanie (bez czyszczenia logu, UTF-8, więcej linii).
4. Ograniczenie ingerencji narzędzia w system (K-04/K-05) po ustaleniu, które reguły są naprawdę potrzebne.
5. Licencja YouTube (K-06), porządek wersji (K-13) i dokumentacji (K-14).
6. Optymalizacja pipeline'u (K-17) dopiero po działającej sesji.

## Sesja 2026-11-14 (2) — AirPlay/YouTube na zegarach i HUD wg cluster-render

Zgodne z `PROTOCOL.md` cluster-render (bez zmian): atlas YUV (Y, potem wiersze U|V po w/2), `vw` ×4, `vh` parzyste, ≤1920×720, cele `map`/`panel`/`hud`, `set` do przesuwania bez odtwarzania warstwy.

Naprawione (lokalnie, bez commita, bez wdrożenia):
1. `_mapBox` (`main.js`) skalował okno z przestrzeni 1920×720 jednym współczynnikiem i centrował pas → na HUD okno mieściło się tylko w y 90–390, w kieszeni mapy w y 36–444; róg na środku nie był rogiem na zegarach/HUD. Teraz `frameFit.projectBox`: rozmiar w tej samej skali (kształt zachowany), położenie jako ten sam udział wolnego miejsca (rogi i środek się zgadzają). Dotyczy też podglądu w menu Pozycja (`_screenFrame`) i trybu wspólnego (`_mirrorSharedWindow`).
2. YouTube na zegarach/HUD: pętla co 200 ms → max 5 kl/s; teraz 40 ms, gdy wybrane są zegary/HUD (bez nich nadal co 200 ms).
3. YouTube: po końcu filmu (`pull()` = null) albo po wyłączeniu zegarów i HUD warstwy zostawały z ostatnią klatką (stall_ms 600000 = 10 min). Teraz `_dropYoutubeFaces()` (nie rusza warstw, gdy aktywny jest AirPlay).
4. YouTube: ta sama klatka była wysyłana co tick (marnowanie budżetu uploadu). Teraz tylko nowa klatka lub zmiana zestawu ekranów.
5. `_nudgeMirror`/`_gaugeView` przesuwały tylko warstwy AirPlay (`_lastFrame`); teraz `_gaugeFrame()` bierze klatkę YouTube, gdy gra YouTube.

Testy: nowy `tools/test_gauge_place.js` (rogi/środek/kształt/legalność rectów dla map, panel, hud), dopisany do `test_all.js`; wszystkie testy jednostkowe przechodzą (Node 22). Dodatkowo test harness z atrapą SDK i cluster-render (poza repo): tworzenie warstw, brak ponownej wysyłki, przesunięcie, zrzucenie po końcu filmu i po wyłączeniu ekranów. Na aucie NIE testowane.

Nie zmienione, do decyzji: bramka postoju (K-02, `_parkFlag`), zamrożona ostatnia klatka AirPlay po rozłączeniu iPhone'a (stall_ms 600000), napis zawsze na `panel` także gdy wideo jest w `map`, skalowanie/obrót klatek w JS (CPU).

## Sesja 2026-11-14 (3) — profile jakości MGU/KOMBI i „Wyłącz aplikację”

Zrobione lokalnie (bez commita; commit i push robi właściciel):
- `desktop_settings.js`: `qualityCentral` (lista `QUALITY_CENTRAL` = tylko 600x400, jedyna obsługiwana dziś przez `_takeFrame`) i `qualityKombi` (240x144…600x360, domyślnie 400x240), zapis w snapshot, migracja: brak pól → 600x400 / 400x240 (stare `airQuality` nie było czytane od 0.1.109, pole zostaje).
- `frame_fit.js`: `profileDims`, `fitsProfile`, `scaleToProfile` (proporcje, wymiary ×4, bez powiększania, portret = profil obrócony).
- `main.js`: `_writeAirplaySize` = profil centralny (żądanie do iPhone'a, jedno dekodowanie), `_centralFrame` (mgu-render dostaje ≤ profil centralny), `_placeMirrorFaces`: jedno skalowanie klatki do profilu KOMBI na klatkę, wspólne dla zegarów i HUD, potem obrót; rozmiar klatki niezależny od okienka; YouTube bez wstępnego skalowania do 640x360; RDP→KOMBI: bridge do profilu KOMBI z zachowaniem proporcji (`frame_bridge.js`). Menu: `air-quality` → podmenu `quality` / `quality-central` / `quality-kombi`.
- „Wyłącz aplikację” (prawy dolny przycisk na stronach menu; w klawiaturze zostaje „wybierz”): `_exitApp` — koniec sesji, `allow=stop`, stop YouTube, timery, plik mgu-video, warstwy cluster-render, napis, zamknięcie gniazda cluster-render, bridge, panel, powierzchnia mgu-render, `rhmi.closeState(STATE_NAME)`, `unregisterHmiVisible` + `registerInactive`. **Proces Node nie jest zabijany**: SDK nie ma wywołania „zakończ aplikację”, a samodzielne wyjście MainApp liczy jako awarię (2× = deinstalacja). Ponowne otwarcie łączy cluster-render od nowa.
- Testy: nowy `tools/test_quality.js` (+ w `test_all.js`); wszystkie testy jednostkowe OK (Node 22); harness z atrapą SDK: 600x400 → mgu-render 600x400, KOMBI 360x240 (profil 400x240), po zmianie na 240x144 → 216x144, YouTube 1280x720 → 400x224, wyjście i ponowne otwarcie.

Nie sprawdzone na aucie: `closeState` jako powrót do iDrive, zachowanie HMI po wyjściu. RDP/VNC są w 0.1.121 wyłączone (`PROTOCOLS = { airplay: true }`), a wyjście RDP→KOMBI w `screenOutputs` to atrapa (`frame()` nic nie wysyła) — nie przebudowywano. YouTube na środku dekoduje demon `jap-ridetube-d` w 1280x720 i renderer czyta jego plik sam; profil centralny go nie zmienia (decyzja do potwierdzenia).

## Sesja 2026-11-14 (4) — 0.1.122–0.1.128: YouTube/RideTube, AirPlay, wersje

Zasada właściciela: każda paczka do pushu ma podbitą wersję (`CLAUDE.md` pkt 11). Commit i push robi właściciel.

- 0.1.122: YouTube lżej (mały obraz z dekodera, 24 kl/s na zegary/HUD, sam nagłówek pliku bez zegarów), profil KOMBI 240x180. VERIFIED na aucie przez właściciela: YouTube płynny, z dźwiękiem, na każdym ekranie.
- 0.1.123: ekran YouTube = RideTube (JustAnotherPU/ridetube, GPL-3.0-or-later) przeniesiony do THEiPlay (`src/rt_*.js`, `rt_host.js` = atrapa RHMI + ctx kitu; czcionki w `package/fonts`). THEiPlay jest na GPL-3.0-or-later (`package/LICENSE`, `package/NOTICE.md`). Wyszukiwanie = klawiatura THEiPlay. Pierwsza pozycja paska RideTube = powrót do THEiPlay. Jedno połączenie z `jap-ridetube-d` (demon trzyma jednego klienta).
- 0.1.124: okienko „Gdzie pokazać” po wybraniu YouTube; przyciski Wyświetl na zegarach / na HUD w odtwarzaczu.
- 0.1.125: jakość RideTube = profile THEiPlay (środek / zegary i HUD), pobieranie 360/480/720p wg wysokości.
- 0.1.126: plik obrazu AirPlay dla renderera: nowy rozmiar = nowy plik (rename), nie przycinanie pliku czytanego przez renderer.
- 0.1.127: AirPlay płynny. VERIFIED (most SSH, `dev-logs/ssh-bridge.ps1`): iPhone ignoruje `-s 600x400` i wysyła 1080x498 / 332x720; 0.1.126 zwalniało takie klatki do ~8/s. Teraz każda klatka, skalowana do profilu.
- 0.1.128: AirPlay Sound (`airplay-mode` → narzędzie 0.1.47 startuje UxPlay z `-vs 0`). Hasło RDP usunięte z kodu (K-01: nadal w historii git — zmienić hasło).

Dźwięk AirPlay (lustro): VERIFIED w logu UxPlay — iPhone nie otwiera strumienia audio (brak SETUP typu 96), więc ALSA `smartx:CarPlayMain` nic nie dostaje. UNVERIFIED: czy dźwięk z AirPlay Sound jest słyszalny (SmartX/AudioManager bez połączenia źródła). Hipoteza: potrzebne `connect` w GENIVI CommandControl jak w `jap-ridetube-d` (`Audio.playNow`).

Narzędzia: `dev-logs/ssh-bridge.cmd` (most SSH tylko do odczytu, lista dozwolonych poleceń, `dev-logs/` w `.gitignore`), `dev-logs/airplay-diag.cmd`. `validate_repo.js` sprawdza pliki, które commit może objąć (`git ls-files` z `.gitignore`); `ssh/` i `__pycache__/` w `.gitignore`.
