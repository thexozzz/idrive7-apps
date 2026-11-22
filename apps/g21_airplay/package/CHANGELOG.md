# THEiPlay

## Unreleased

## 0.2.16

- Z logu auta (2026-11-22, film 21 minut, wersja 0.2.15, rysowanie procesorem): 21–24 klatki/s, silnik 105–125 % jednego rdzenia, jednostka zajęta w ok. 90 %. Obok silnika: `node` 36–37 %, `NavigationBasic` 31–35 %, `avb_streamhandl` 14 %, `AlsaRoutingAdap` 14 %. Właściciel: „już wszystko jest płynnie". Trybu GPU nadal nikt nie włączył, więc nie jest zmierzony.
- `node` to kilkanaście różnych narzędzi na jednostce (nasze i cudze) i z logu nie wynikało, które zużywa procesor; po zakończeniu filmu udział `node` nie spadł (42–57 %), więc nie jest to samo odtwarzanie. `g21-browser` 0.1.62: w wierszu `perf:` proces `node` ma dopisaną nazwę pliku skryptu (np. `node:g21-audiod.js`), nic więcej z wiersza poleceń.
- Dźwięk (`g21-audio` 0.1.26) w tym samym logu: po aktualizacji pierwsze otwarcie urządzenia jeszcze wolne (35 581 ramek/s), urządzenie zamknięte w 2 ms, pięć kolejnych otwarć w pełnym tempie, 21 minut filmu bez zgubionych ramek. Jedna sesja – to jeszcze nie potwierdzenie.

## 0.2.15

- Płynność przeglądarki (prośba właściciela, 2026-11-21). Z logu auta: jednostka jest stale przeciążona (obciążenie 8–37 przy czterech rdzeniach), silnik przeglądarki dostaje ok. jednego rdzenia (do 130 %) i przy 100 % obrazu pokazuje 10–40 klatek/s; zamiana klatki na format ekranu kosztuje 3–15 ms i nie jest wąskim gardłem.
- Pomiar na stanowisku (`tools/sim/smooth.js`: ciężka strona przewijana 12 s, całość ograniczona do 15 % rdzenia, co daje tempo podobne do auta – 12–13 klatek/s, powtarzalnie). Przełączniki silnika nie dają nic ponad szum pomiaru (12,7–14,4 klatki/s): bez wygładzania liter, bez rozmycia tła, 1 lub 4 wątki rysujące, kafle 512, kafle niskiej rozdzielczości, bez wygładzania krawędzi, strony mobilne. Limit 30 klatek/s też nie (10,8). Daje liczba pikseli: „Obraz stron" 75 % – 18 klatek/s (+50 %), 50 % – 37 klatek/s (trzy razy więcej). Żadnego z tych przełączników nie włączam, bo nie ma czego potwierdzić. Liczby porównują warianty na stanowisku, nie przewidują auta.
- Tryb GPU: z logu auta (2026-11-20, 23:17) wynika, że RUSZYŁ dwa razy – biblioteki jednostki się załadowały, klatki szły z układu graficznego (`wlframe: frames: gpu`), jednostka się nie zawiesiła. Był jednak włączony łącznie ok. 5 s: drugie naciśnięcie w trakcie restartu silnika wyłączało go, a każdy start narzędzia i tak go cofał, więc nie ma ani jednego pomiaru w tym trybie.
- `g21-browser` 0.1.61: przełącznik trybu GPU jest zapamiętywany (do wyłączenia przez właściciela). Sam się wyłącza, gdy silnik zakończy się w tym trybie albo gdy uruchomienie w nim nie skończyło się normalnie (znacznik zostaje teraz na cały czas pracy w trybie, nie na 45 s) – także po odcięciu zasilania z otwartą przeglądarką. Naciśnięcie w ciągu 6 s po przełączeniu jest pomijane; ustawienie pokazuje „silnik się uruchamia…".
- Wiersz `perf:` w logu zaczyna się od „GPU mode", gdy silnik rysuje układem, i kończy tym, kto ma procesor jednostki: ile z czterech rdzeni jest zajęte i pięć procesów, które zużyły najwięcej (same nazwy, odczyt z /proc). Dotąd nie było wiadomo, czyje jest to obciążenie.
- Tryb GPU nadal NIE jest zmierzony – ani w aucie, ani na stanowisku (nie ma tam tego układu). Po próbie w aucie log sam pokaże, czy jest szybszy.

## 0.2.14

- Pierwsze logi wysłane przez auto (2026-11-21, serwer logów na komputerze właściciela) – wysyłka działa. Odczyt z logu dźwięku (`g21-audio` 0.1.25, wejście odtwarzacza BMW): w czterech startach jednostki na cztery PIERWSZE otwarcie urządzenia dźwięku brało pełne 48 000 próbek na sekundę (raz AirPlay grał tak 24 minuty bez przerwy), a prawie każde następne 36 000 – po osiem prób z rzędu. To jest zgłoszone zacinanie: „po restarcie MGU film gra dobrze, po przejściu na AirPlay i z powrotem się zacina". Wejście odtwarzacza BMW ma więc tę samą wadę co wejście CarLife. Urządzenie przyznaje zawsze bufor 3072 próbek i okres 1024, o cokolwiek prosimy.
- `g21-audio` 0.1.26: program zapisujący zamyka urządzenie dźwięku przed wyjściem (`drop`, `close`, razem najwyżej 400 ms; gdy nie wrócą, wychodzi jak dotąd i zapisuje to w logu). Dotąd wychodził z otwartym urządzeniem, bo zamknięcie raz nie wróciło (auto, 2026-11-15). Tym pierwsze otwarcie różni się od następnych: nikt nie zostawił strumienia otwartego. Wszystkie inne projekty grające przez to urządzenie je zamykają (docs/12). Czy to przywraca pełne tempo, NIE WIADOMO – to próba; następny log pokaże wiersze `out: device closed in … ms` i czy po nich są jeszcze `out: slow`.
- `g21-browser` 0.1.60: wysyłka logów nie zapisuje już do logu wiersza o każdej udanej rundzie. Ten wiersz był nowym logiem do wysłania, więc auto wysyłało 45 bajtów co 30 s bez końca.
- Znane i nienaprawione, z tego samego logu: gdy wejście odtwarzacza BMW przestaje przyjmować dźwięk i narzędzie wraca do wejścia CarLife, przejęcie głośników dla CarLife zostało odrzucone (`connect: E_NOT_POSSIBLE`) i dźwięku nie było do zamknięcia strony.
- Sprawdzone na stanowisku (test strumieni z prawdziwą binarką: urządzenie jest zamykane). W aucie NIESPRAWDZONE.

## 0.2.13

- Serwer logów działa na komputerze właściciela (decyzja właściciela, 2026-11-21), więc `g21-browser` 0.1.59 wysyła logi na `100.89.159.94:12346` zamiast na adres z 0.1.58. Logi leżą w `dev-logs/car/` (poza gitem) i dochodzą tylko wtedy, gdy ten komputer jest włączony; reszta bez zmian. W aucie NIESPRAWDZONE.

## 0.2.12

- Właściciel, 2026-11-21: po restarcie MGU film w przeglądarce grał dobrze; po zamknięciu przeglądarki i włączeniu AirPlay dźwięk się zacinał, po powrocie do filmu w przeglądarce też. Auto poza siecią, więc bez logu – przyczyna NIE jest ustalona. Pasuje do znanego objawu (pierwsze otwarcie urządzenia dźwięku trafia w pełne tempo, następne w trzy czwarte), ale to trzeba zobaczyć w logu.
- Wysyłanie logów (pomysł właściciela: „serwerek co pobiera logi, a aplikacja wysyła je na niego"). `g21-browser` 0.1.58: demon co 30 s wysyła nowe wiersze logów narzędzi THEiPlay (dźwięk, przeglądarka, sterowanie, aplikacja) na serwer właściciela `100.89.166.19:12346`, przez wyjście Tailscale auta (SOCKS5, to samo co RDP/VNC). Serwer nieosiągalny niczego nie gubi: wysyłka rusza od miejsca, w którym stanęła, także po restarcie; log przemianowany na `.1` jest dosyłany do końca. Przy pierwszym razie idzie ostatnie 512 KB każdego pliku.
- Ustawienia > Zaawansowane > „Wysyłanie logów": włączone domyślnie, pokazuje, kiedy serwer ostatnio coś odebrał albo że jest nieosiągalny. Wysyłane są tylko logi naszych narzędzi, nic z systemu BMW; log przeglądarki zawiera adresy otwieranych stron. Inny serwer: `"logServer"` w `settings.json` narzędzia.
- Serwer: `tools/logserver/server.js` (jeden plik, bez zależności; opis w `tools/logserver/README.md`). Bez hasła, domyślnie słucha tylko na adresie Tailscale maszyny.
- Sprawdzone na stanowisku (wysyłka do prawdziwego serwera, także przez atrapę SOCKS5; przerwa serwera; restart; zmiana pliku logu). W aucie NIESPRAWDZONE: nie wiadomo, czy wyjście Tailscale auta przepuszcza ruch demona do tego adresu – pokaże to wiersz w ustawieniu.

## 0.2.11

- Dźwięk: porównanie z innymi projektami iDrive 7 (prośba właściciela; docs/12). Vizualyse, Moonride, idrive-enginesound, mgu-browser i id7 używają tej samej drogi co `g21-audio` (źródło CarLife 287 → głośniki, to samo urządzenie; nasz moduł głośników pochodzi z Vizualyse). Gotowej naprawy, której nie mamy, nie ma w żadnym; żaden nie opisuje też tempa 36 000 zamiast 48 000 próbek.
- `g21-audio` 0.1.25, dwie różnice przeniesione: (1) blokada strumienia dźwięku auta – u Vizualyse blokada założona przez proces roota uciszyła CarPlay do restartu jednostki (auto, 2026-11-05); nasz program zapisujący dla wejścia odtwarzacza BMW też startuje jako root, więc blokadę, która jest roota, oddaje teraz właścicielowi i grupie folderu blokad (0660), tak jak zakłada je system. Tylko zwykły plik w tym folderze, bez podążania za dowiązaniami. (2) Log zapisuje, jaki bufor i okres urządzenie naprawdę przyznało (`out: device buffer … frames, period … frames`) – brakująca liczba do sprawy 36 000 / 48 000.
- Bez zmian w tym, którędy i jak dźwięk gra. Sprawdzone na stanowisku (test strumieni z prawdziwą binarką, blokada jako root w folderze testowym); w aucie NIESPRAWDZONE – auto było poza siecią. Nadal niepotwierdzone w aucie: `g21-audio` 0.1.24 (usunięte zawieszenie demona po przejęciu głośników).

## 0.2.10

- Tryb GPU przeglądarki, EKSPERYMENTALNY (`g21-browser` 0.1.57; właściciel: „Tak, wdrażaj"). Ustawienia > Zaawansowane > „Układ graficzny (próba)". NIGDZIE NIESPRAWDZONY: na stanowisku nie ma układu graficznego auta, więc pierwszą próbą jest auto właściciela.
- Jak: droga z projektu Vizualyse (`vizualyse-chromium`), jedyna znana z działania w aucie (docs/11). Silnik rysuje przez ANGLE w trybie GLES na WŁASNYCH bibliotekach jednostki (Mesa 19, sterownik `i965` – te, których używa BMW); żaden sterownik nie jest dowożony (ich własny zawiesił jądro jednostki i gasił ekran przy każdym starcie). `gpu/libEGL.so.1` to ich `egl_shim.c` bez zmian (GPL-3.0, Yousaf Khan): wyświetlacz na węźle `renderD128` przez GBM i powierzchnie, których Mesa 19 nie ma. Klatki silnika są wtedy buforami układu; nowy `g21-wlframe-gpu` przyjmuje je (wl_drm) i odczytuje przez EGL jednostki do pliku wideo, tylko zmienioną część obrazu.
- Siatka bezpieczeństwa: włączany ręcznie (pierwsze naciśnięcie ostrzega, drugie w ciągu 8 s włącza), NIGDY nie zapamiętywany – każdy start narzędzia jest na procesorze, więc jednostka, która się zawiesi i zrestartuje, wraca bez trybu GPU. Znacznik `state/gpu-trial` jest zapisywany przed dotknięciem układu i usuwany po 45 s pracy albo po zwykłym zatrzymaniu; znaleziony przy starcie oznacza próbę przerwaną restartem (log i pozycja w ustawieniach to mówią). Gdy czegoś brakuje (węzeł, biblioteka jednostki, grupa `video`, nasze dwa pliki), próby nie ma i pozycja mówi, czego brak. Gdy silnik sam skończy pracę w tym trybie, tryb się wyłącza.
- Co ustawienie pokazuje: „włączony: rysuje układ graficzny" (klatki przychodzą z układu), „włączony, ale silnik rysuje procesorem" (proces graficzny silnika sam zrezygnował z układu – powód jest w logu, wiersze `gpu:` i `egl-shim:`).
- Zabezpieczenia w tym trybie: proces graficzny silnika działa bez swojej piaskownicy (musi ładować biblioteki jednostki z miejsc, których piaskownica nie pozwala otworzyć); procesy stron zachowują swoją. Silnik i jego okno działają w grupie `video`.
- Bez zmian, gdy tryb jest wyłączony (stanowisko: te same testy co dotąd; stuknięcie → obraz 3 ms). Nowe testy: lista potrzeb, folder bibliotek, znacznik, argumenty silnika, dwa naciśnięcia w aplikacji; test powierzchni biblioteki pośredniczącej przy każdym budowaniu (`build-gpu.sh`).

## 0.2.9

- Błąd znaleziony przy sprawdzaniu „Obrazu stron" w nowym sposobie sterowania (`g21-browser` 0.1.56): przy każdym ponownym starcie silnika (zmiana powiększenia, „Obraz stron", start po bezczynności) Chrome sam przywracał kartę z poprzedniego uruchomienia i stawiał ją na wierzchu. Ekran pokazywał starą stronę w starej skali, a dotyk i polecenia szły do innej karty. Teraz przy starcie zostaje jedna karta – ta z adresem, z którym silnik wystartował – a karty przywracane przez silnik są zamykane. Po tej poprawce „Obraz stron" 75 % i 50 % działa także bez DevTools (stanowisko: strona widzi swój pełny układ, stuknięcie trafia).
- Silnik nie trzyma już zapasowego procesu strony (`SpareRendererForSitePerProcess`): mniej pamięci i mniej pracy procesora przy starcie.
- Rozpoznanie gotowych rozwiązań Chromium na iDrive 7 i plan trybu GPU: `docs/11-przegladarka-gpu-rozpoznanie.md`. Tryb GPU NIE jest wdrożony.
- W aucie NIESPRAWDZONE.

## 0.2.8

- Limit pamięci silnika przeglądarki: domyślnie 2048 MB (właściciel, 2026-11-20; było 1500). `g21-browser` 0.1.55. Aplikacja zapisuje cały zestaw reguł przy każdej zmianie, więc stare 1500 stoi wpisane w `policy.json` właściciela: przy pierwszym starcie tej wersji jest raz podnoszone do 2048 (limit ustawiony później, także 1500, zostaje). „Limit pamięci" w ustawieniach ma teraz stopnie 600, 900, 1200, 1500 i 2048 MB. W aucie NIESPRAWDZONE – nie wiem, ile pamięci jednostka ma wtedy wolnej dla reszty.

## 0.2.7

- Przegląd nowego sposobu sterowania przeglądarką (0.2.6) na życzenie właściciela; `g21-browser` 0.1.54. Wszystko poniżej sprawdzone na stanowisku (prawdziwa aplikacja, demon i Chrome), nic w aucie.
- Bez cichego powrotu do DevTools. Gdy rozszerzenie silnika się nie zgłosi, silnik jest uruchamiany jeszcze raz tak samo; dopiero po drugim niepowodzeniu ten start idzie z DevTools, a właściciel widzi to w linii obok adresu („tryb awaryjny: część stron może odmawiać (logowanie, serwisy wideo)"). Po pięciu minutach następny start znów próbuje bez DevTools i napis znika (`tools/sim/fallback.js`).
- Połączenie rozszerzenia z demonem odzyskuje się samo, bez restartu Chrome: rozszerzenie próbuje dwa razy na sekundę, a alarm budzi je najpóźniej po pół minuty. Na stanowisku zerwane połączenie wróciło po 0,55 s – ten sam proces silnika, te same strony. Gdy trwa to dłużej niż 4 s, właściciel widzi „sterowanie stroną nie odpowiada, łączę ponownie"; dotyk i klawisze działają w tym czasie dalej (idą przez okno silnika, nie przez rozszerzenie).
- Znaleziony błąd: dane połączenia (port i hasło) były skryptem rozszerzenia, a silnik trzyma kopię skryptów między uruchomieniami – po restarcie demona rozszerzenie pukałoby starym hasłem. Teraz są plikiem czytanym z dysku przy każdym łączeniu, a rozszerzenie dostaje przy każdym starcie własny numer wersji.
- Okna otwierane przez strony (logowanie „przez Google/Apple/Facebook", linki do nowego okna) są teraz osobnym oknem nad stroną, a nie podmianą strony: okno może odpowiedzieć stronie, która je otworzyła, i samo się zamknąć; „wstecz" zamyka okno, które nie ma dokąd wrócić. Strona pod spodem zostaje nietknięta. Najwyżej trzy okna nad jedną stroną. (W trybie awaryjnym jak dawniej: adres okna otwiera się w stronie.)
- „Wstecz" i „dalej" używają historii samej strony. Własne „wstecz" silnika pomija strony, na których niczego nie dotknięto, więc po wpisaniu nowego adresu przeskakiwało stronę tylko przeczytaną.
- Ciasteczka i dane stron: silnik kończy pracę przez zamknięcie okien przez rozszerzenie i zapisuje wtedy profil. Zatrzymany sygnałem gubił ciasteczka z ostatnich ok. 30 s – także logowanie zrobione tuż przed zamknięciem widoku. Profil jest w `/var/opt/g21-browser/cache/profile` i zostaje między uruchomieniami i aktualizacjami; jest jeden (jak dotąd). Przy nagłym odcięciu zasilania może przepaść ostatnie pół minuty.
- Rozszerzenie prosi tylko o: `tabs`, `webNavigation`, `downloads` (żeby anulować pobieranie), `alarms`. Bez dostępu do danych stron (`host_permissions`), bez `scripting`, bez interfejsu debugowania; nic z niego nie jest dostępne dla stron. Linia do demona: tylko `127.0.0.1`, hasło jednego uruchomienia (144 bity) w pliku czytelnym wyłącznie dla użytkownika silnika, wpuszczany jest tylko nadawca będący rozszerzeniem – strona internetowa nie może ani podać takiego nadawcy, ani poznać hasła.
- Obraz bez zmian: `g21-wlframe` i pamięć współdzielona (nowy sposób działa wyłącznie z nimi). Pomiar na stanowisku, stuknięcie → pierwszy nowy obraz strony: 3 ms bez DevTools, 11 ms z DevTools (środkowa z 15); adres → załadowana strona: 81 ms w obu (`tools/sim/caps.js`).
- Formaty i ochrona treści (to samo w obu sposobach): H.264, AAC, Opus tak; VP9 i AV1 tak, gdy reguła „lekkie wideo" jest wyłączona; HEVC nie. Widevine jest (programowy, poziom L3; sprzętowego nie ma), ClearKey jest, PlayReady nie ma. Nic nie jest odblokowywane ani obchodzone: serwis, który wymaga poziomu sprzętowego albo certyfikowanego urządzenia, może odmówić odtwarzania albo dać niższą jakość.
- Serwisy bez DevTools: otwierają się strona logowania Google, YouTube (film gra po 170 s), Crunchyroll, Spotify (odtwarzacz w przeglądarce), Twitch, Netflix, Disney+. NIESPRAWDZONE: samo logowanie i odtwarzanie po zalogowaniu – wymagają kont właściciela, haseł tu nie wpisuję.

## 0.2.6

- Właściciel, 2026-11-20: nie da się zalogować do Google z YouTube („Ta przeglądarka lub aplikacja może nie być bezpieczna", adres `signin/rejected`), Crunchyroll pokazuje „Coś poszło nie tak"; „przeglądarka ma działać tak, że wszystkie strony można na niej otworzyć".
- Przyczyna (stanowisko, ten sam Chrome): demon sterował silnikiem przez jego interfejs DevTools, a silnik uruchomiony z tym interfejsem sam mówi o tym każdej stronie (`navigator.webdriver` = true). Strony, które po tym sortują przeglądarki, odmawiały: Google przy logowaniu, serwery Crunchyroll odpowiedzią 403, YouTube odmową strumienia po 30–75 s (`ump.spsrejectfailure`, 0.2.3). Ten sam silnik bez tego interfejsu otwiera Crunchyroll i gra film z YouTube dalej niż trzy minuty.
- `g21-browser` 0.1.53: silnik działa bez interfejsu DevTools, jak przeglądarka używana przez człowieka – nic nie jest ukrywane ani podrabiane, tego interfejsu po prostu nie ma. Palec, kursor gładzika, pokrętło i klawisze trafiają do silnika przez jego okno jako prawdziwe urządzenia (`g21-wlframe` dostał wskaźnik, ekran dotykowy i klawiaturę). Adres, tytuł, ładowanie, „wstecz/dalej", pełny ekran, pole tekstowe i tekst z klawiatury THEiPlay idą przez własne rozszerzenie silnika (`ext/`), połączone z demonem na tej samej jednostce (port i hasło jednego uruchomienia; tylko rozszerzenie jest wpuszczane). Reguła „lekkie wideo" i zakaz pobierania działają także tak.
- Zapas: gdy rozszerzenie nie zgłosi się w 15 s, ten sam start idzie dalej po staremu (DevTools) i tak zostaje do następnego startu narzędzia; log mówi dlaczego. Reguła `"control": "devtools"` w `policy.json` wymusza stary sposób.
- Co się zmienia dla właściciela: logowania zapisane dotąd przez demona (`cookies.json`) nie przechodzą – silnik trzyma teraz własne ciasteczka w swoim profilu, więc do stron trzeba zalogować się raz od nowa. Powiększenie strony jest ustawiane przez rozszerzenie przy każdej nowej stronie (krótkie przeskalowanie na starcie strony przy powiększeniu innym niż 100 %). Wiersz „odtwarzacz strony: …" (0.2.4) działa tylko w starym sposobie.
- Sprawdzone na stanowisku (`tools/sim/native.js`, prawdziwa aplikacja, demon i Chrome): stuknięcie w link, wstecz i dalej, pole tekstowe i tekst z polskimi znakami, Enter, przewijanie pokrętłem i palcem, pełny ekran i Escape, link do nowego okna, ustawienia nad stroną, powiększenie, aplikacja ze Sklepu obok przeglądarki; strona widzi `navigator.webdriver` = false i prawdziwe zdarzenia. Crunchyroll się otwiera, film z YouTube gra po 170 s (także z „lekkim wideo"). Stary sposób: dotychczasowe testy przechodzą bez zmian. Nowy test `tools/test_browser_native.js`.
- NIESPRAWDZONE: nic z tego w aucie; samo zalogowanie do Google (nie wpisuję cudzych haseł – strona logowania się otwiera, wynik po wpisaniu hasła zna tylko właściciel).

## 0.2.5

- Właściciel, 2026-11-20 (`g21-audio` 0.1.23): dźwięk nie działa wcale. Odczyt z auta w trakcie: demon dźwięku stał w miejscu zaraz po wpisie „speakers claimed" – nie odpowiadał na „status", wszystkie jego wątki czekały (futex), zero czasu procesora. Tak samo kończy się log każdego uruchomienia od 0.1.18: po pierwszym przejęciu głośników nie ma już ani jednego wpisu aż do następnego startu jednostki.
- Przyczyna: sprawdzanie odtwarzacza BMW zaraz po przejęciu głośników (dodane w 0.1.18, żeby zatrzymać odtwarzacz, gdyby sam zaczął grać). Tworzyło w procesie demona drugi zestaw połączeń SOME/IP obok tego, który przejmuje głośniki, i biblioteka jednostki z tego nie wracała. To jest właściwa przyczyna zgłoszeń „pierwszy dźwięk gra, po zmianie treści już nie" (0.1.18–0.1.21: pierwszy strumień grał, bo jego program zapisujący startował przed przejęciem i jest osobnym procesem; demon już nic więcej nie zrobił) oraz „dźwięk nie działa wcale" (0.1.22–0.1.23: program zapisujący startuje po przejęciu, więc nie wystartował nigdy).
- `g21-audio` 0.1.24: to sprawdzanie nie jest już wywoływane. Reszta z 0.1.22–0.1.23 zostaje (własny strumień dla każdego modułu, głośniki dla tego, który gra). W aucie NIESPRAWDZONE po poprawce; przyczyna jest odczytana z auta, nie zgadnięta.

## 0.2.4

- Właściciel, 2026-11-20: w aucie film nie urywa się, gdy przez 2 minuty niczego się nie dotyka – tylko po zminimalizowaniu aplikacji albo po zmianie na pełny ekran. Odmowa strumienia przez YouTube po 30–75 s, którą pokazało stanowisko (0.2.3), nie jest więc przyczyną w aucie. Na stanowisku minimalizacja i pełny ekran filmu nie psują (te same próby co w 0.2.3, ponownie); auto jest poza siecią, więc przyczyna NIE jest znana.
- `g21-browser` 0.1.52, żeby następny błąd w aucie sam ją wskazał: powód podany przez odtwarzacz YouTube pojawia się na ekranie w linii nad stroną („odtwarzacz strony: …") – można go odczytać bez logu – a log zapisuje go razem z tym, co było zrobione wcześniej i ile sekund przed błędem („… s after "full screen on"", „the app was hidden", „the app is in front again", „the app opens the view"), czy pełny ekran był włączony i czy strona miała dźwięk.
- THEiPlay mówi narzędziu przeglądarki, kiedy jest chowany za strony auta i kiedy wraca (tylko do logu; zachowanie bez zmian).

## 0.2.3

- Właściciel, 2026-11-20: film w przeglądarce często kończy się komunikatem YouTube „Coś poszło nie tak" po zminimalizowaniu aplikacji albo po przejściu na pełny ekran; strony wydają się za niskie. Auto poza siecią, więc próby na stanowisku (prawdziwa aplikacja, prawdziwy demon przeglądarki, prawdziwy Chrome, film z YouTube): `tools/sim/video.js`.
- Wynik prób: minimalizacja i powrót, pełny ekran i powrót, minimalizacja w pełnym ekranie – ten sam proces silnika, ta sama strona, film gra dalej. Komunikat „Coś poszło nie tak" pojawia się na stanowisku 30–75 s po starcie filmu także wtedy, gdy nic się nie robi; odtwarzacz YouTube podaje powód `ump.spsrejectfailure` (`HTML5_SPS_UMP_STATUS_REJECTED`): serwer YouTube odmawia tej przeglądarce dalszego strumienia. Nie zależy to od pełnego ekranu, od wersji mobilnej ani od reguły „lekkie wideo" (sprawdzone osobno). To zabezpieczenie YouTube, nie awaria silnika; nie jest obchodzone. Czy w aucie powód jest ten sam – NIE wiadomo.
- `g21-browser` 0.1.51: powód podany przez odtwarzacz YouTube trafia do logu przeglądarki („player gave up: …"), więc log z auta rozstrzygnie. Powiększenie strony ma dwa stopnie poniżej 100 % (75 % i 88 %; „A−" na pasku i „Powiększenie" w ustawieniach): obszar strony ma 1796 × 548 punktów, szeroki i niski, a przy 75 % strona dostaje okno 2384 × 728.
- `g21-audio` 0.1.23: gdy inne źródło zabierze głośniki (np. radio wybrane w menu BMW), dźwięk strony jest dalej odbierany w tempie zegara zamiast trafiać do urządzenia, którego nikt nie czyta. Wejście CarLife nie przyjmowało wtedy nic, program zapisujący czekał, a film za potokiem stawał. Głośniki nie są odbierane źródłu, które je wzięło, dopóki strona gra bez przerwy; po pauzie następny dźwięk bierze je od nowa.
- Uwaga do „za niskich" stron: mobilny YouTube układa film na 72 % szerokości okna (1296 × 729 punktów przy oknie wysokim na 548), więc bez pełnego ekranu widać górną część filmu przy każdym powiększeniu. Wersja komputerowa (Ustawienia > Przeglądarka > Wersja mobilna: wył.) mieści film w oknie (768 × 432). Domyślne ustawienia bez zmian.
- Stanowisko: `tools/sim/video.js` (film: minimalizacja, pełny ekran, długie odtwarzanie, ślad zdarzeń silnika) i `tools/sim/pcm_out.js` (program zapisujący w tempie zegara; urządzenie „null" ALSA przyjmuje wszystko naraz i film pędzi). W aucie NIESPRAWDZONE.

## 0.2.2

- Właściciel, 2026-11-20: po włączeniu jednostki pierwszy dźwięk gra, ale po zatrzymaniu AirPlay i przejściu do przeglądarki już nie. Auto poza siecią, więc bez logu; przyczyna odczytana z kodu. Strumień dźwięku był jeden: dostawał go odtwarzacz, który poprosił przy swoim starcie, a następny mu go zabierał (0.1.21). Ten, któremu zabrano, pisał dalej do potoku, którego już nie było, i był niemy aż do własnego restartu – silnik przeglądarki żyje do 90 s po zamknięciu widoku (a od 0.2.1 także pod ustawieniami), odbiornik AirPlay tak długo, jak AirPlay jest włączony. Kto zagrał pierwszy, ten grał; drugi już nie, w obie strony.
- `g21-audio` 0.1.22: każdy odtwarzacz ma własny strumień na cały czas połączenia – nikt nie dostaje odmowy i nikomu nic nie jest zabierane. Demon czyta strumienie, których nikt nie słyszy (odtwarzacz nigdy nie czeka), i patrzy na próbki: głośniki dostaje ten, który gra, gdy nikt inny ich nie ma albo ten, kto je ma, milczy od 1,5 s. Przejście AirPlay → przeglądarka → AirPlay odbywa się bez oddawania głośników radiu po drodze.
- Kolejność jak w próbach ręcznych w aucie z 2026-11-20 (pięć pomiarów i ton słyszany przez właściciela): najpierw połączenie źródła z głośnikami, 0,3 s później otwarcie urządzenia. Dotąd urządzenie było otwierane od razu, a połączenie zestawiane równolegle. Program zapisujący jest kończony sygnałem TERM (wychodzi między dwoma zapisami), dopiero potem połączenie jest zdejmowane.
- Cisza nie zajmuje już głośników: telefon, który tylko pokazuje ekran (wysyła samą ciszę), nie odbiera ich radiu, a strumień, w którym przez czas trzymania kanału (20 s) jest tylko cisza, oddaje je. Następny dźwięk bierze je od nowa.
- Nowy test `tools/test_audio_streams.js` (Linux): prawdziwy demon z atrapą głośników, raz z atrapą programu zapisującego, raz z prawdziwą binarką `g21-audio-out` na urządzeniu „null” – dwa odtwarzacze naraz, przejścia w obie strony, cisza, odejście odtwarzacza, ponowne otwarcie. W aucie NIESPRAWDZONE. Czego ten test nie mówi: czy wejście odtwarzacza BMW gra przy drugim przejęciu głośników po ich oddaniu radiu (0.1.18: „pierwszy dźwięk gra, po zmianie treści nie”) – jeżeli po tej wersji cisza zostanie, rozstrzygnie to `/var/opt/g21-audio/log/audiod.log` z auta.
- `g21-browser` bez zmian (0.1.50). Poprawiony test narzędzia przeglądarki (część uruchamiana tylko jako root pod Linuksem miała nieaktualne oczekiwanie pól `frames`/`framesNow`).

## 0.2.1

- Aplikacja ze Sklepu i Przeglądarka są rozdzielone (`g21-browser` 0.1.50; właściciel: „bezwzględnie, ma działać tak samo"). Każda ma w silniku własną kartę: własną stronę, własne „wstecz", własne miejsce przewinięcia i własny rozmiar. Strona przeglądarki czeka nietknięta (filmy wstrzymane, karta zamrożona), gdy na ekranie jest aplikacja, i jest tam z powrotem po otwarciu Przeglądarki; aplikacja startuje od swojej pierwszej strony jak dotąd. Wspólne zostają: proces silnika i jego profil (ciasteczka). Stanowisko pokazało też przyczynę dotychczasowego mieszania: aplikacja ma inny obszar strony niż przeglądarka i każde przejście restartowało silnik („new size"). Sprawdzone z prawdziwym Chrome na maszynie deweloperskiej (oba tory obrazu); niesprawdzone w aucie.
- Ustawienia jako warstwa nad działającym modułem. „Ekrany" > „Opcje" ze strony albo z aplikacji nie zamyka już jej widoku (0.2.0 zamykało, a silnik gasł po 90 s razem ze stroną): połączenie z demonem zostaje, strona działa dalej, menu jest rysowane nad nią, a pokrętło, dotyk i kursor idą do menu. „Wstecz" zdejmuje warstwę: ta sama strona, od razu. Wyjście z ustawień gdzie indziej (ekran główny, inny moduł) to prawdziwy koniec widoku, z dotychczasowymi 90 s silnika. Na stanowisku: ten sam proces silnika, ta sama strona i miejsce po 12 wejściach i po 9 s w ustawieniach przy czasie bezczynności silnika 6 s. AirPlay i YouTube nie zależały od widoku i grają dalej jak dotąd.
- Jeden mechanizm stanów dla wszystkiego, co da się dotknąć (`drawStates`): wciśnięte (palec albo stuknięcie gładzika), kursor nad elementem, fokus pokrętła poza listą. Obejmuje wiersze i kafelki, przyciski nagłówka i stopki, klawisze klawiatury, pasek przeglądarki i aplikacji, przyciski rysowane na obrazie, kafelki panelu. Stan dostaje tylko element na wierzchu; najechanie niczego nie uruchamia. Elementy niedostępne są przygaszone i nie reagują.
- Pokrętło dociera wszędzie: z pierwszego rzędu w górę – nagłówek („wstecz", „Ekrany"), z ostatniego w dół – stopka (mysz, „Wyłącz aplikację"); obrót albo wychylenie w bok przechodzi między nimi, naciśnięcie używa. W siatce kafelków wychylenie idzie o rząd, w bok o kafelek. W przeglądarce i w aplikacji naciśnięcie stawia pokrętło na pasku (najpierw adres – drugie naciśnięcie go otwiera, jak dotąd jedno), obrót idzie po pasku, wychylenie w górę lub w dół wraca na stronę. Panel „Ekrany" nad stroną obsługuje się pokrętłem tak samo jak nad menu. Powrót z podstrony stawia pokrętło na wierszu, który do niej prowadził; zamknięcie panelu – tam, gdzie było.
- „Ekrany": jeden komponent i jedno zachowanie. Zawsze otwiera ten sam panel: dla modułu, którego stroną jest ekran; na stronach THEiPlay – dla modułu, który gra (włączony AirPlay); gdy nie gra żaden, ekrany są pokazane jako niedostępne, a „Opcje" działają. Panel nad stroną przeglądarki należy teraz do tej samej powierzchni co nad menu.
- Wygląd: jeden kolor interakcji (bursztyn) w całej aplikacji; moduł rozpoznaje się po małym znaku w nagłówku i kolorze ikony na ekranie głównym, nie po kolorze całego menu. Nagłówek mówi, gdzie się jest („Ustawienia › Zaawansowane" – strony ustawień pokazywały samo „THEiPlay"). Klawiatura, strona lustra AirPlay i pasek aplikacji w tym samym grafitowym stylu i z tymi samymi przyciskami; edytor napisu ma podgląd; klawiatura nie ma już przycisku „Ekrany".
- Ustawienia: sześć grup zamiast pięciu. „Ekrany i obraz" (Pozycja, Rozdzielczość, Obszar zegarów, Opóźnienie AirPlay, Napis), „Sterowanie", „Przeglądarka" (to, co zmienia się przy przeglądaniu: strona startowa, powiększenie, pełny ekran, autoodtwarzanie, tryb mobilny), „Aplikacje", „Zaawansowane" (Renderowanie – bez osobnej strony z jednym przełącznikiem – oraz reguły silnika: silnik, tor obrazu, obraz stron, lekkie wideo, piaskownica, limit pamięci, strony chrome), „Ogólne" (język, O systemie, Zresetuj usługi). Każda opcja ma tę samą nazwę wewnętrzną, tę samą obsługę, te same wartości i ten sam zapis co w 0.2.0.
- „Zresetuj usługi": usługi są uruchamiane po kolei (najpierw własny silnik przeglądarki jest zamykany, potem dźwięk, sterowanie, AirPlay, YouTube, na końcu przeglądarka), każda z limitem 30 s i sprawdzeniem `is-active`; nieinstalowana jest pomijana; drugie żądanie w trakcie jest odrzucane. „usługi działają" pojawia się dopiero, gdy uruchomiony na nowo demon potwierdzi wynik po ponownym połączeniu aplikacji; inaczej jest napisane, które nie wystartowały. Tylko pięć jednostek THEiPlay, po nazwie, przez `systemctl restart`; żadnego `killall`/`pkill`, nic z BMW; pliki ustawień, logowań i aplikacji nie są ruszane. Naprawione: w 0.2.0 drugie naciśnięcie zwykle kończyło się „brak narzędzia Przeglądarka", bo połączenie z demonem dopiero się otwierało.
- Naprawione przy okazji: strona, która stoi w miejscu po zmianie rozmiaru obrazu (inna karta, wyjście z pełnego ekranu), zostawała na „Uruchamiam" aż coś się na niej poruszyło; napis na ekranie środkowym nie dostawał ustawionego rozmiaru i koloru; ruch kursora w menu budował 60 klatek na sekundę – teraz najwyżej 40, a kursor, który stoi, nie rysuje nic.
- Stanowisko `tools/sim`: cała aplikacja (prawdziwy `main.js`) z atrapami SDK, rendera, gładzika i systemd oraz prawdziwym demonem przeglądarki i Chrome; skrypty przejścia przez interfejs ze zrzutami i pomiary. Nie jest w paczce i nie jest emulatorem MGU.
- Niesprawdzone w aucie: wszystko powyżej. Ograniczenia: ekran YouTube (kod RideTube) ma własną nawigację i nie został przebudowany; w trybie myszy z gładzika naciśnięcie pokrętła jest kliknięciem, a do paska prowadzi kursor; osobny wygląd „wciśnięte" pod stuknięciem gładzika trwa 140 ms.
- Integracja z fabrycznym menu Media BMW: tylko analiza (`docs/10-integracja-media-bmw.md`) i sonda do odczytu (`tools/car-media-probe.sh`); nic nie wdrożono.

## 0.2.0

- Nowy interfejs (zamówienie właściciela, 2026-11-20). Jeden system stylu dla całej aplikacji: grafitowe powierzchnie z cienką linią, jeden akcent na moduł (THEiPlay bursztynowy, AirPlay niebieski, YouTube czerwony, Przeglądarka zielony, Aplikacje fioletowy), mniejsze zaokrąglenia, wspólne wartości w jednym miejscu (`TOK`, `THEMES` w `menu_draw.js`) i wspólne komponenty: karta/wiersz, przycisk, panel.
- Ekran główny: moduły wprost – YouTube, AirPlay, Przeglądarka, Aplikacje, Ustawienia – po jednej dużej karcie (dotąd: Multimedia / Aplikacje / Ustawienia i dopiero pod nimi moduły). Powrót z YouTube i AirPlay prowadzi na ekran główny. „Aplikacje” to zaimportowane aplikacje i Sklep; ustawienia przeglądarki są w Ustawienia > Przeglądarka.
- Jeden wspólny przycisk „Ekrany” w rogu każdej strony (dotąd w tym rogu był stan AirPlay, jego własne „Ekrany” i Start/Stop – na wszystkich stronach). Otwiera jeden panel: Zegary / HUD / Środek dla modułu, który jest na wierzchu (AirPlay, YouTube, Przeglądarka i aplikacje), z zaznaczeniem wybranych; u dołu „Opcje” – prosto do ustawień ekranów (Pozycja, Rozdzielczość, Obszar zegarów, Opóźnienie obrazu AirPlay, Renderowanie), a „wstecz” stamtąd wraca do modułu. Ten sam przycisk jest na pasku przeglądarki i na pasku aplikacji ze Sklepu. Na stronach samego THEiPlay (ekran główny, Ustawienia) prowadzi od razu do ustawień ekranów. Logika wyboru ekranów bez zmian: panel wysyła te same polecenia co dotychczasowe przełączniki (dla przeglądarki: dawne Ustawienia > Aplikacje > Zegary / HUD, teraz jeden wiersz „Ekrany”).
- Stan AirPlay jest cichym napisem obok przycisku na stronach AirPlay; Start/Stop pozostaje pierwszym kafelkiem AirPlay.
- Hover: karta, wiersz, przycisk nagłówka i dolnego paska, kafelek panelu, przycisk paska przeglądarki i pole adresu rozjaśniają się pod kursorem (jaśniejsza powierzchnia i linia) – inaczej niż fokus pokrętła (linia w kolorze modułu) i wybrana opcja (znaczek). Nic nie zmienia rozmiaru i nic się samo nie uruchamia.
- Ustawienia > Ogólne > „Zresetuj usługi” (prośba właściciela): po potwierdzeniu drugim wyborem demon przeglądarki (root) uruchamia ponownie usługi, przez które THEiPlay gra – g21-audio, g21-airplay-open, g21-input, jap-ridetube-d – i na końcu siebie (`g21-browser` 0.1.49). Tylko te usługi, nic z systemu BMW.
- Zachowane: wszystkie opcje, ich znaczenie, wartości domyślne i zapis ustawień. Sprawdzone podglądami ekranów z prawdziwego kodu rysującego i testami; W AUCIE NIESPRAWDZONE. Znane ograniczenia: pokrętło dochodzi do panelu „Ekrany” przez wiersz „Ekrany” na liście modułu (przycisku w rogu nie da się wybrać pokrętłem); „Opcje” z uruchomionej przeglądarki zamyka jej widok (silnik żyje jeszcze 90 s); widoki odtwarzacza YouTube (RideTube), klawiatury i strony lustra AirPlay dostały nowe kolory i przyciski, ale ich układ nie był przebudowywany; restart usług zakłada `systemctl` i nazwy jednostek jak wyżej.

## 0.1.213

- Właściciel, 2026-11-20 (`g21-audio` 0.1.20): dźwięk z AirPlay działa, w przeglądarce nie. Auto poza siecią, więc bez logu; przyczyna odczytana z kodu: strumień dźwięku jest jeden i przeglądarka dostaje go tylko od odtwarzacza, który milczy. Od 0.1.20 kanał jest trzymany przez przerwy, więc AirPlay uchodził za grający jeszcze 20 s po ostatnim dźwięku, a przy włączonym lustrze telefonu cały czas (telefon wysyła dźwięk bez przerwy, także ciszę). Przeglądarka dostawała odmowę i jej silnik startował bez urządzenia dźwiękowego – niemy aż do zatrzymania.
- `g21-audio` 0.1.21: program zapisujący sprawdza próbki i zgłasza „quiet”, gdy przez 1,5 s nic nie było głośniejsze niż ok. −66 dBFS (albo nic nie przyszło), i „sound”, gdy znów coś słychać. Strumień odtwarzacza, który tylko trzyma kanał, jest oddawany temu, kto o niego prosi.
- `g21-browser` 0.1.48: gdy przy starcie silnika strumień jest zajęty (AirPlay właśnie gra i dopiero się kończy), przeglądarka pyta jeszcze cztery razy co 0,7 s, zamiast od razu wystartować niema.
- Sprawdzone na atrapie urządzenia i testami; w aucie niesprawdzone. Jeśli przyczyna jest inna, pokaże to log z auta.

## 0.1.212

- Pomysł właściciela (2026-11-20): kanał dźwięku auta ma być przejęty raz i trzymany jak żywy strumień, a nie oddawany radiu przy każdej przerwie. `g21-audio` 0.1.20: dopóki aplikacja coś odtwarza z przerwami krótszymi niż 20 s, głośniki i urządzenie zostają nasze – jedno otwarcie i jedno połączenie na cały czas grania – a w przerwach (następny film, następny utwór, pauza) podawana jest cisza. Radio wraca dopiero po 20 s ciszy albo po zamknięciu aplikacji. Dotąd były to 3 s, więc każda zmiana treści oddawała i przejmowała kanał od nowa – i właśnie przy ponownym przejęciu psuło się tempo (stare wejście) albo dźwięk nie wracał wcale (nowe wejście, 0.1.18).
- Czas trzymania: `"holdMs"` w `/var/opt/g21-audio/config.json` (3000–600000 ms). Dotyczy AirPlay i przeglądarki, obu wejść. Sprawdzone na atrapie urządzenia; w aucie niesprawdzone. Nie usuwa przyczyny ciszy przy ponownym przejęciu kanału po długiej przerwie – ta nadal czeka na log z auta (na ten przypadek jest powrót do wejścia CarLife z 0.1.19).

## 0.1.211

- Auto, 2026-11-20 (`g21-audio` 0.1.18, właściciel): pierwszy dźwięk gra od razu, ale po zmianie treści nie gra wcale, „jakby coś trzymało”, w przeglądarce i w AirPlay. Auto było poza siecią, więc przyczyna NIE jest znana – logu z tej próby nie ma.
- `g21-audio` 0.1.19: zabezpieczenie. Gdy nowe wejście (odtwarzacza BMW) zawiedzie w dowolny sposób – urządzenie się nie otworzy, głośniki nie zostaną połączone albo urządzenie jest otwarte i głośniki są nasze, a mimo to nie pobiera dźwięku przez ok. 3 s – narzędzie samo wraca do wejścia CarLife do swojego następnego startu i zapisuje powód w logu („media input: …”). Dźwięk jest wtedy po staremu (z próbami pełnego tempa), ale jest. Sprawdzone na atrapie urządzenia; w aucie niesprawdzone. Właściwa poprawka wymaga logu z auta.

## 0.1.210

- Właściwa droga dźwięku (właściciel: „RideTube jakoś podaje ten dźwięk prawidłowo”). Auto, 2026-11-20: odtwarzacz multimediów BMW, przez który gra RideTube, pisze do własnego wejścia dźwięku auta (MediaSink_AudioOut_Front), nie do wejścia CarLife, którego używaliśmy. Pomiar ciszą na tym wejściu: 47 997–48 007 próbek na sekundę w pięciu rundach na pięć (CarLife: losowo 48 000 albo 36 000), ton testowy przyjęty w całości i słyszany przez właściciela.
- `g21-audio` 0.1.18: dźwięk AirPlay i przeglądarki idzie na żywo wprost do tego wejścia, ze źródłem multimediów BMW (1046) na głośnikach – bez pliku i bez odtwarzacza po drodze. Mechanizm prób pełnego tempa zostaje tylko dla starego wejścia (`"input": "carlife"` w `/var/opt/g21-audio/config.json` przywraca je).
- To wejście otwiera tylko root (zwykły użytkownik z grupą mgu_alsa dostał odmowę), więc program zapisujący startuje jako root i zaraz po otwarciu urządzenia trwale zrzuca uprawnienia do nobody:mgu_alsa.
- Ograniczenia: źródło jest wspólne z RideTube, więc AirPlay/przeglądarka i YouTube nie zagrają dźwięku jednocześnie. Gdy odtwarzacz BMW sam zacznie grać ostatni utwór w chwili przejęcia głośników, jest zatrzymywany. Całość NIESPRAWDZONA w aucie w tej postaci – sprawdzone były pomiar tempa i ton z ręcznej próby.

## 0.1.209

- Auto, 2026-11-20 (`g21-audio` 0.1.16): gorzej niż w 0.1.15. Osiem prób z rzędu zostało w tempie trzech czwartych i dźwięk przeglądarki został zły. Samo ponowne otwarcie urządzenia nie pomaga (4 z 4 prób złe), a „nowe połączenie” nie było naprawdę zrywane – menedżer dźwięku oddawał to samo połączenie (ten sam numer w logu). Pełne tempo przywraca dopiero faktyczne zerwanie i ponowne zestawienie połączenia, jak w 0.1.15.
- `g21-audio` 0.1.17: przy próbie połączenie jest naprawdę zrywane (czekamy, aż zniknie) i zestawiane od nowa, ale głośniki nie są oddawane żadnemu innemu źródłu. Próby 1–3: najpierw połączenie, potem urządzenie; 4–6: najpierw urządzenie (kolejność z 0.1.15); 7–8: jak w 0.1.15, z oddaniem głośników (może być słychać radio). Niesprawdzone w aucie: nie wiadomo, czy menedżer dźwięku auta sam nie włączy radia, gdy głośniki zostają na chwilę bez źródła, ani czy do trafienia w pełne tempo nie jest potrzebne właśnie przejście przez inne źródło.

## 0.1.208

- Auto, 2026-11-20 (`g21-audio` 0.1.15): mechanizm ponownego otwierania działa – w logu po kilku próbach tempo wraca do pełnego i zostaje (raz po 1 próbie, raz dopiero po ok. 8). Ale między próbami głośniki były oddawane poprzedniemu źródłu, więc przez sekundę grało radio, kilka razy z rzędu.
- `g21-audio` 0.1.16: w trakcie prób głośniki zostają przy nas, radio się nie włącza. Pierwsze cztery próby otwierają od nowa tylko urządzenie; od piątej dodatkowo nasze połączenie jest zrywane i zestawiane ponownie (bez oddawania głośników). Niesprawdzone w aucie: nie wiadomo, czy samo ponowne otwarcie urządzenia wystarcza do trafienia w pełne tempo – log pokaże, przy której próbie się udaje.

## 0.1.207

- Każda aplikacja ma menu w swoim kolorze i z podpisem, czyje to menu (właściciel, 2026-11-20): AirPlay niebieski („Menu: AirPlay”), YouTube czerwony, Przeglądarka zielony (jej pasek i jej ustawienia), aplikacje ze Sklepu fioletowy; strony samego THEiPlay zostają bursztynowe. Pasek przeglądarki ma kolor, ale bez podpisu – nie ma na niego miejsca.
- Aplikacja ze Sklepu jest oddzielona od Przeglądarki: przy starcie ma własny ekran z nazwą aplikacji i napisem „Uruchamiam aplikację” (było: pasek przeglądarki i „Uruchamiam przeglądarkę”), a na dolnym pasku jej nazwę. `g21-browser` 0.1.47: przy przejściu między przeglądarką a aplikacją historia „wstecz” jest czyszczona, więc „wstecz” w aplikacji nie pokazuje już strony, którą wcześniej miała przeglądarka, tylko z pierwszej strony wychodzi z aplikacji; przeglądarka otwarta po aplikacji zaczyna od strony startowej, nie od strony aplikacji.
- Sprawdzone na podglądzie ekranów (`tools/preview_ui.js`) i testami; czyszczenie historii w aucie niesprawdzone.

## 0.1.206

- Ustawienia przeglądarki z auta właściciela (2026-11-19) są teraz domyślne po instalacji (`g21-browser` 0.1.46): pełny Chrome, tor obrazu bezpośredni do 60 kl./s, tryb mobilny, lekkie wideo, rozdzielczość 100% (było 75%), powiększenie 100% (było 150%), piaskownica „wymagana” (było „pytaj”), limit pamięci 1500 MB (było 900). Dotyczy tylko instalacji bez własnych ustawień: istniejący plik reguł i zapisane powiększenie zostają.

## 0.1.205

- Trop właściciela (2026-11-19): pierwszy dźwięk po restarcie MGU jest prawidłowy, po zmianie filmu albo ponownym połączeniu znowu źle. Potwierdzone w logu i próbami w aucie: o tym, czy wejście dźwięku auta bierze pełne 48 000 próbek na sekundę, czy trzy czwarte, decyduje chwila otwarcia urządzenia i tak zostaje do jego zamknięcia; następne otwarcie może trafić inaczej. Zatrzymanie naszego programu zapisującego w trakcie grania i ponowny start: 36 000 → 48 000 trzy razy, raz znowu 36 000. Dlaczego tak jest – nie wiadomo.
- `g21-audio` 0.1.15: program zapisujący sam mierzy tempo urządzenia (od 1,5 s po otwarciu, okna 0,8 s) i gdy jest to trzy czwarte, kończy się, a demon od razu otwiera urządzenie od nowa – do ośmiu prób na minutę, potem zostaje. Dotyczy AirPlay i przeglądarki. Dźwięk przeglądarki jest w tym czasie wstrzymany, nie odrzucany (po ręcznym ubiciu film się wysypywał, bo ścieżka awaryjna czytała dźwięk bez hamowania).
- Skutek uboczny: na początku odtwarzania może być kilka krótkich przerw (każda próba to ok. 3–4 s), zanim trafi się pełne tempo. Sprawdzone tylko na atrapie urządzenia na maszynie deweloperskiej (`tools/fake_alsa.c`); w aucie niesprawdzone.

## 0.1.204

- Auto, 2026-11-19, z właścicielem. Przeglądarka: nowy tor obrazu działa w aucie po przełączeniu „Silnik” na pełny Chrome (lekki silnik go nie obsługuje): 40–50 klatek/s na stronie i 28–32 przy filmie zamiast 12–15, koszt klatki w narzędziu klatek 0,6–5 ms zamiast 13–26 ms. Auto było przy tym przeciążone (obciążenie 10–21, sprawdzenia MGU Store po aktualizacji, film VP9 720p dekodowany programowo – „Lekkie wideo” było wyłączone).
- Dźwięk NIE jest naprawiony. Pomiar na żywo (AirPlay): co 5 s przychodzi 240 000 próbek, wejście auta przyjmuje 180 000, ok. 54 000 jest wycinane; sonda ciszą: 36 000 na sekundę czterema metodami. Przyczyna nieznana.
- `g21-audio` 0.1.14: „zegar” (odtwarzacz multimediów BMW odtwarzający ciszę) wyłączony. Nie działał: odtwarzacz zatrzymuje się za każdym razem, gdy nasz dźwięk przejmuje głośniki, a w jedynej dobrej minucie z 15.11 też stał – więc to nie on dawał pełne tempo. Dokładał ok. 0,4 s do startu dźwięku. Powrót: `"clock": true` w `/var/opt/g21-audio/config.json`.
- Sprawdzone i odrzucone: inny proces z otwartym wejściem SmartX (jest tylko nasz), parametry wejścia (okres 1024 × 3, jak CarPlay). Niesprawdzone: w konfiguracji BMW wejście CarLife ma opóźnienie zadeklarowane jak dla 24 kHz (128 ms; CarPlay i Android Auto 64 ms) – próba na wejściu Android Auto nie została wykonana.

## 0.1.203

- Wydajność przeglądarki (`g21-browser` 0.1.45), pełny opis i tabele: `docs/09-wydajnosc-przegladarki.md`. Pomiar wskazał wąskie gardło: nie rysowanie strony, tylko droga obrazu z silnika na ekran (każda klatka fotografowana przez DevTools, kodowana do JPEG, przesyłana jako tekst i dekodowana ponownie) – ok. 80% kosztu klatki.
- Nowy tor obrazu „bezpośredni” (domyślny dla pełnego Chrome): silnik rysuje do okna Wayland, którego drugim końcem jest nowy program `g21-wlframe`; klatka idzie przez pamięć współdzieloną prosto do pliku wideo, bez JPEG, i przeliczany jest tylko zmieniony fragment. Na maszynie deweloperskiej, te same sceny: 60 zamiast 20 klatek/s przy mniej niż połowie procesora (przewijanie: 379 → 152 ms procesora na sekundę). Pełny ekran filmu w tym torze ma 1280 × 480 zamiast 960 × 360.
- Aplikacje > Ustawienia > „Tor obrazu”: bezpośredni do 60 kl./s / bezpośredni do 30 kl./s / zrzuty JPEG (stary tor, bez zmian). Gdy tor bezpośredni nie ruszy, przeglądarka sama wraca do zrzutów i zapisuje to w logu („direct frames:”).
- Diagnostyka: wiersze `graphics:` (co silnik mówi o grafice) i `perf:` (klatki/s, odstępy klatek, procesor silnika i narzędzia klatek, pamięć, czas wczytania strony, czas od dotknięcia do obrazu) w logu przeglądarki co 30 s oraz strona `chrome://perf`. Skrypty pomiarowe: `tools/browser-bench/`.
- NIESPRAWDZONE W AUCIE (auto było poza siecią): cały nowy tor działał tylko na stanowisku. Sprzętowej akceleracji w silniku nadal nie ma (kompozycja i raster programowe; powody i następny krok w dokumencie). Piaskownica bez zmian – włączona. Do sprawdzenia w aucie: czy tor rusza, liczby `perf:` dla obu torów, strony z listami rozwijanymi (okna podręczne silnika nie są pokazywane).

## 0.1.202

- Opóźnienie obrazu AirPlay (`g21-airplay-open` 0.1.63). Opóźnienie w AirPlay jest zamierzone: odbiornik wstrzymuje obraz i dźwięk o ten sam stały zapas (UxPlay zgłasza telefonowi 0,25 s), żeby to, co przychodzi nierówno przez Wi‑Fi, wyszło równo i żeby usta zgadzały się z głosem. U nas dźwięk był opóźniony o ok. 0,3 s (zapas 240 ms w G21 Audio i 64 ms bufora urządzenia), a obraz wychodził od razu. `g21-yuvring` trzyma teraz każdą klatkę przez zadany czas i dopiero wtedy ją pokazuje; czas jest w pliku `<airplay-size>.delay` (ms, 0–1500, bez pliku 300).
- Ustawienia > Obraz > „Opóźnienie obrazu AirPlay”: 0, 100, 200, 300 (domyślnie), 400, 500, 700 ms; zmiana działa od następnej klatki. Obraz na zegarach i HUD nie jest opóźniany. Niesprawdzone w aucie – właściwą wartość trzeba dobrać na filmie z mówiącą osobą.

## 0.1.201

- Dźwięk AirPlay po 0.1.12 (właściciel, 2026-11-19): obraz prawidłowy, dźwięk „przerywa co chwilę, blisko płynności”. Auto było poza siecią, więc bez logu z tej próby; poprawione jest to, co wynika z konstrukcji.
- `g21-audio` 0.1.13: zamiast twardego przycinania zapasu o 420 ms (słyszalna przerwa, gdy zegar telefonu jest minimalnie szybszy od auta – w pomiarze z 2026-11-15 przychodziło ok. 48 170 próbek na sekundę) tempo odtwarzania podąża za wypełnieniem zapasu, najwyżej o 1,5%; przycięcie zostaje tylko na prawdziwy zator. Zapas startowy 240 ms (było 180), górna granica 800 ms (było 600). „Zegar”: odtwarzacz multimediów nie jest już uruchamiany od nowa co 5 s, gdy nie jest w stanie odtwarzania (samo to mogłoby rwać dźwięk) – przy pauzie dostaje „odtwarzaj dalej” najwyżej co 20 s, po zatrzymaniu plik startuje ponownie najwyżej raz na minutę, a każde takie zdarzenie trafia do logu. NIESPRAWDZONE w aucie.

## 0.1.200

- Sesja w aucie 2026-11-15 z właścicielem (AirPlay grał). Odtwarzacz multimediów BMW jako wyjście na żywo odpada: adres strumienia odrzuca („ITEM_UNPLAYABLE”), a plik czyta ok. 52 s naprzód (odtwarzał 60. sekundę, przeczytane miał 112 s), więc dźwięk zapisywany tuż przed głowicą nie jest słyszany.
- Znaleziona przyczyna cięć i „slow-mo”: wejście SmartX, do którego piszemy (CarLifeMedia), pobiera dźwięk w pełnym tempie tylko wtedy, gdy odtwarzacz multimediów BMW coś odtwarza. Bez tego: 36 000 z 48 000 próbek na sekundę (pięć raportów z rzędu po 180 000 na 5 s, ok. 12 300/s odrzucanych). Z odtwarzaczem grającym w tle plik ciszy: 240 000 na 5 s, 0 odrzuconych, sześć raportów z rzędu, i potwierdzenie właściciela, że dźwięk jest prawidłowy. Samo oddanie głośników źródłu odtwarzacza (bez odtwarzania) nie wystarcza. Dlaczego tak jest – nie wiadomo.
- `g21-audio` 0.1.12: „zegar” – gdy strumień bierze głośniki, odtwarzacz multimediów BMW odtwarza w tle plik ciszy (rzadki plik WAV, nie zajmuje miejsca); startuje przed przejęciem głośników, kończy po ich oddaniu, a głośniki wracają do źródła, które miało je wcześniej. Wyłącznik: `"clock": false` w `config.json`. Dotyczy AirPlay, Przeglądarki i THEiPlay Player. Sama automatyka (kolejność start/stop, powrót głośników) NIESPRAWDZONA w aucie – sprawdzony jest ręcznie wywołany stan.

## 0.1.199

- Próby w aucie z odtwarzaczem multimediów BMW, którym RideTube puszcza dźwięk (2026-11-15, cichy ton, postój): plik WAV gra – start 0,8 s po `playFile`, czas biegnie równo; potok (FIFO) nie jest czytany wcale; plik dopisywany w trakcie zatrzymuje się tam, gdzie kończył się przy otwarciu. Konfiguracja silnika multimediów (Cinemo) ma „strumienie na żywo” z buforem 350 ms.
- `g21-audio` 0.1.11: druga droga wyjścia dźwięku, wzorem RideTube – strumień odtwarza odtwarzacz multimediów auta (źródło 1046 → głośniki 1024), nie urządzenie CarLifeMedia, które pobiera dźwięk tylko przez trzy czwarte czasu. Dwa warianty: `media-http` (odtwarzacz dostaje adres strumienia WAV bez końca z `127.0.0.1`) i `media-file` (plik WAV o pełnej zadeklarowanej długości, dźwięk zapisywany z wyprzedzeniem `leadMs` przed głowicą). Demon sam czyta potok: AirPlay w całości od razu, pozostałe źródła w tempie zegara. Gdy droga zawiedzie, wraca pisanie do SmartX.
- Droga jest WYŁĄCZONA domyślnie (`smartx`) i NIEURUCHOMIONA w aucie: nie wiadomo jeszcze, który wariant odtwarzacz przyjmie ani jakie będzie opóźnienie dźwięku. Przełączanie bez instalacji: `g21-audio-client.js backend media-http` (albo `media-file 600`, `smartx`).

## 0.1.198

- Cofniete: przeliczanie dzwieku do 36 000 probek na sekunde (g21-audio 0.1.9). Auto, 2026-11-15: dzwiek byl za wysoki i za szybki (efekt wiewiorki), z przerwami. Urzadzenie gra wiec probki w tempie 48 kHz, a jedynie pobiera je przez trzy czwarte czasu; w logu: odebrane 1 982 464 probki, oddane 1 489 531 w ok. 41 s. Tej wady urzadzenia (plug:smartx:CarLifeMedia_CF_48_STEREO) zaden sposob pisania nie usuwa. g21-audio 0.1.10: AirPlay jak w 0.1.8 (calosc dzwieku, lekkie ciecia), Przegladarka jak przed 0.1.6.
- Wniosek: wlasciwa droga to ta, ktorej uzywa RideTube - dzwiek odtwarza odtwarzacz multimediow auta (zrodlo 1046), a nie urzadzenie CarLifeMedia. To nastepny krok, jeszcze nie zrobiony.

## 0.1.197

- Pomiar `probe` w aucie (2026-11-15, `g21-audio` 0.1.8), cisza pisana czterema sposobami: przez `plug:` po 480 próbek 36 194/s, po 1024 próbki 36 043/s, wprost do urządzenia 36 049/s, z blokowaniem 35 946/s. Urządzenie głośników zabiera więc 36 000 próbek na sekundę niezależnie od sposobu pisania, choć w nazwie ma 48. Dźwięk pisany jako 48 kHz trwał przez to o jedną trzecią dłużej: AirPlay musiał wyrzucać ćwierć dźwięku (cięcia), a silnik Przeglądarki, który liczy czas filmu po zapisanym dźwięku, odtwarzał filmy w trzech czwartych tempa.
- `g21-audio` 0.1.9: jeden sposób pisania dla wszystkich źródeł – dźwięk jest przeliczany do tempa urządzenia (z zapasu powstają próbki w tempie, w jakim urządzenie je bierze, ok. 4 wejściowe na 3 wyjściowe; dokładna proporcja podąża za wypełnieniem zapasu, więc inne tempo urządzenia albo zegar telefonu też są śledzone). AirPlay: potok opróżniany natychmiast. Przeglądarka i film: potok czytany w tempie zegara (48 000/s), co wstrzymuje źródło dokładnie do czasu rzeczywistego. Raport co 5 s podaje też próbki odebrane i bieżącą proporcję. NIESPRAWDZONE w aucie: jeżeli urządzenie odtwarza próbki w tempie 48 kHz z przerwami (a nie 36 kHz), dźwięk będzie za wysoki – wtedy wracam do poprzedniego sposobu (`play DEVICE plain` zostaje w programie).

## 0.1.196

- Dźwięk AirPlay, wynik z auta (2026-11-15, `g21-audio` 0.1.6 / `g21-airplay-open` 0.1.62): dźwięk dociera w całości (0 przerw), ale jest lekko przycinany. Trzy kolejne raporty co 5 s: telefon dostarcza ok. 48 300 próbek na sekundę, urządzenie głośników (`plug:smartx:CarLifeMedia_CF_48_STEREO`) zabiera dokładnie 36 000 – równo 75% – więc zapas rośnie do 600 ms i jest przycinany (ok. 12 200 próbek na sekundę wyrzuconych). To samo 75% widać w pomiarze z 0.1.2 („dropped” 25%). Konfiguracja SmartX auta dla tego urządzenia: okres 1024, 3 okresy.
- `g21-audio` 0.1.8: pomiar `probe` (`g21-audio-client.js probe`): pisze ciszę czterema sposobami (przez `plug:` po 480 i po 1024 próbki, wprost do urządzenia, z blokowaniem) i zapisuje, ile próbek na sekundę urządzenie zabiera przy każdym. Nic nie słychać; głośniki są na ok. 30 s zajęte. Sam pomiar – sposób pisania zmienię po jego wyniku.

## 0.1.195

- Cofniete: odbieranie dzwieku Przegladarki bez wstrzymywania (g21-audio 0.1.6) bylo bledem. Auto, 2026-11-15: silnik pisal dzwiek 49 razy szybciej niz plynie czas (1 005 856 probek odtworzonych, 48 570 080 wyrzuconych) i film na stronie pedzil. Silnik nie ma wlasnego zegara dla dzwieku - zegarem jest wlasnie wstrzymywanie przez nasz modul wyjscia. g21-audio 0.1.7: tryb live tylko dla AirPlay, Przegladarka jak przed 0.1.6. Wczesniejszy wniosek o 25 000 probek na sekunde byl bledny.

## 0.1.194

- Przeglądarka bez zewnętrznego odtwarzacza (decyzja właściciela, 2026-11-15): wideo na stronie nie jest już zakrywane kafelkiem „Odtwórz” ani przekazywane do THEiPlay Player / odtwarzacza YouTube; strona odtwarza film sama. Kod odtwarzacza zostaje wyłączony (reguła `player`: `on` w `state/policy.json` go przywraca).
- Tryb mobilny (`g21-browser` 0.1.43, reguła `mobile`, domyślnie włączony, przełącznik Ustawienia > Przeglądarka > „Tryb mobilny”): strony dostają nagłówek przeglądarki telefonu i układ dla ekranu dotykowego (jak „tryb urządzenia” w Chrome), więc ładują lżejsze wersje i prostsze odtwarzacze.
- Dźwięk Przeglądarki: silnik pisze dźwięk własnym zegarem i liczy czas filmu po tym, co zapisał – wstrzymywanie go przez nasz moduł wyjścia spowalniało film na stronie, dźwięk i obraz naraz (auto, 2026-11-15: ok. 25 000 próbek na sekundę zamiast 48 000). `g21-audio` 0.1.6: każde źródło jest odbierane natychmiast (tryb „live” z 0.1.4), nikt nie jest wstrzymywany. To ta sama zasada co w RideTube: zegarem jest odtwarzacz dźwięku, a obraz idzie za nim – tu zegar ma sam silnik strony i nie wolno mu go psuć.
- Strefa czasowa stron: zegar auta jest w UTC bez strefy, więc strony pokazywały zimą godzinę mniej. Reguła `timezone` (domyślnie `Europe/Warsaw`) ustawia strefę silnika.
- Wszystko z tej pozycji NIESPRAWDZONE w aucie.

## 0.1.193

- AirPlay: przy włączeniu AirPlay (i pulpitu zdalnego) silnik Przeglądarki, jeśli jeszcze żyje w tle, jest zatrzymywany od razu. Auto, 2026-11-15: obraz AirPlay skakał przy obciążeniu jednostki 14, z pięcioma procesami pełnego Chrome w tle (silnik żyje 90 s po wyjściu z Przeglądarki). Niesprawdzone w aucie.

## 0.1.192

- Dzwiek AirPlay, wynik z auta (2026-11-15, g21-audio 0.1.5 / g21-airplay-open 0.1.61): obraz plynny, dzwiek partiami i jakby przyspieszony. Tryb live dzialal, ale w 71 s dotarlo 7 s dzwieku (19 przerw): UxPlay dopisuje na koncu podanego toru sync=true, wiec wyjscie znow czekalo na znaczniki czasu, a jego cieknaca kolejka wyrzucala reszte. g21-airplay-open 0.1.62: tor konczy sie slepa galezia (tee, cieknaca kolejka, fakesink), na ktora trafia dopisek; galaz zapisujaca dzwiek nie jest niczym wstrzymywana. Sprawdzone na komputerze (gst-launch: caly dzwiek przechodzi mimo dopisku), w aucie nie.

## 0.1.191

- Pełny Chrome działa w aucie (2026-11-15, `g21-browser` 0.1.41: „engine up: Chrome/153.0.8010.12”, z piaskownicą). Crunchyroll odpowiada 403 na weryfikację także jemu.
- AirPlay bez dźwięku, przyczyna z logu auta (2026-11-15): strumień głośników trzymała jeszcze Przeglądarka (jej silnik żyje jakiś czas po wyjściu) i AirPlay dostał odpowiedź „busy (held by chromium)”. `g21-audio` 0.1.5: odtwarzacz, który prosi o strumień celowo (włączany AirPlay, start Przeglądarki, start filmu), dostaje go od innego, który w tej chwili milczy; ten, który tylko ponawia prośbę po utracie, już nie – dwa milczące nie przerzucają się strumieniem.
- THEiPlay Player zacinał się (auto, film z cda.pl: 694 klatki w 51 s, dźwięk w paczkach po 6 s z przerwami): każdy megabajt filmu był pobierany nowym połączeniem (nowe wyszukanie nazwy i nowe TLS), bez zapasu. `g21-browser` 0.1.42: jedno utrzymywane połączenie, pobieranie z wyprzedzeniem w osobnym wątku (do 8 zakresów czeka w pamięci), zakresy po 4 MB poza YouTube; film prosi o strumień głośników, jeśli w międzyczasie go stracił.
- Pełny Chrome był zatrzymywany przez limit pamięci lekkiego silnika („engine uses 1238 MB (limit 1200)”): dla pełnego silnika limit to co najmniej 2000 MB. Wideo strony jest teraz także wyciszane, nie tylko zatrzymywane (YouTube zdążył zagrać kilka sekund dźwięku przed przejęciem przez odtwarzacz).
- Wszystko z tej pozycji NIESPRAWDZONE w aucie. Nowy tryb dźwięku AirPlay z 0.1.4 nie był jeszcze użyty (AirPlay nie dostał strumienia).

## 0.1.190

- Pełny Chrome, przyczyna awarii przy starcie znaleziona (auto 2026-11-15 z `g21-browser` 0.1.40: nadal kończył pracę po 160 ms, przeglądarka przeszła na lekki silnik, a Crunchyroll dalej odpowiadał 403). Odtworzone na komputerze z bibliotekami i przełącznikami z auta: Chrome przy starcie uruchamia własny program pomocniczy `chrome_crashpad_handler`, który miał wpisaną ścieżkę programu ładującego z Ubuntu (poprawiana była tylko w głównym pliku); pomocnik nie startował i Chrome sam się zatrzymywał. Z poprawioną ścieżką w obu plikach Chrome startuje (sprawdzone na komputerze, nie w aucie).
- `g21-browser` 0.1.41: instalacja silnika poprawia ścieżkę programu ładującego także w `chrome_crashpad_handler` (`interpAlso` w `engine-chrome/manifest.json`; silnik zostanie pobrany jeszcze raz, bo zmienił się jego opis). Log nieudanego startu zachowuje początek komunikatów silnika, nie tylko koniec.

## 0.1.189

- Dźwięk AirPlay, przyczyna znaleziona w logu UxPlay z auta (2026-11-15): jego tor dźwięku ma kolejkę 8 buforów, która „cieknie” – gdy odbiornik nie odbierze dźwięku od razu, UxPlay go wyrzuca. Nasz moduł wyjścia wstrzymywał potok, kiedy urządzenie było pełne (zmiana z 0.1.3), więc dźwięk ginął właśnie tam: ok. 11 s na 29 s bez żadnej straty policzonej u nas. Do tego wyjście UxPlay czekało na znaczniki czasu, które bywały błędne – wtedy nie było dźwięku wcale (stan po 0.1.60).
- `g21-audio` 0.1.4: dla AirPlay osobny tryb „live” – potok jest opróżniany natychmiast, zawsze, do magazynu 2 s; urządzenie dostaje dźwięk z magazynu, gdy ma miejsce. Odtwarzanie rusza po zebraniu 180 ms (wyrównuje to, co przychodzi paczkami), a zapas ponad 600 ms jest przycinany do 180 ms, więc dźwięk nie odstaje od obrazu bardziej niż o tyle. Pozostałe źródła (Przeglądarka, THEiPlay Player) działają jak dotąd. `g21-airplay-open` 0.1.61: wyjście UxPlay pisze dźwięk od razu (`sync=false`). Niesprawdzone w aucie.
- Sprostowanie do 0.1.60: powiększony bufor odbioru UDP nie był przyczyną ani lekarstwem; liczniki systemu, na których się oparłem, liczyły pakiety wszystkich programów auta.

## 0.1.188

- Pełny Chrome, wynik z auta (2026-11-15, `g21-browser` 0.1.39): pobrał się z Google w 36 s i zainstalował (wszystkie biblioteki znalezione), ale kończył pracę 160 ms po starcie; demon uznawał to za problem z piaskownicą i przy regule „wymagana” pokazywał „reguły wymagają piaskownicy, a silnik nie może jej użyć”, więc nie zadziałał też powrót do lekkiego silnika. Powodu awarii nie było w logu (zapisywane były tylko trzy ostatnie linie, czyli zrzut rejestrów).
- `g21-browser` 0.1.40: pełny silnik nie dostaje już zakazu programowego rysowania (bez układu graficznego i bez niego kończy pracę sam – najbardziej prawdopodobna przyczyna, niepotwierdzona); nieudany start pełnego silnika nie jest już pytaniem o piaskownicę – przeglądarka przechodzi na lekki silnik; log zapisuje linie z przyczyną awarii. Piaskownica pozostaje włączona. Niesprawdzone w aucie.

## 0.1.187

- Drugi silnik Przeglądarki: pełny Google Chrome for Testing 153.0.8010.12 (ta sama wersja co dotychczasowy), uruchamiany bez okna (`--headless=new`), domyślny. Powód: dotychczasowy „headless shell” to Chrome zbudowany do sterowania przez programy i strony, które to sprawdzają, odrzucają go (auto, 2026-11-15: weryfikacja Crunchyroll odpowiadała 403 za każdym razem); nie ma też modułu do filmów chronionych. Pełny Chrome ma w tej samej paczce od Google moduł Widevine.
- `g21-browser` 0.1.39: opis silnika w `engine-chrome/manifest.json` (17 plików, 360 MB po rozpakowaniu; auto pobiera `chrome-linux64.zip`, ok. 196 MB, z magazynu Google i sprawdza SHA-256 każdego pliku), 35 dodatkowych bibliotek w `lib/` (Ubuntu 24.04, lista w `LIBS.txt`, +15 MB). Reguła `engine`: `chrome` albo `shell`; przełącznik w Ustawienia > Przeglądarka > „Silnik” – to droga powrotu do lekkiego silnika. Oba silniki zostają rozpakowane, więc zmiana nie pobiera od nowa.
- NIESPRAWDZONE: pełny Chrome nie był uruchamiany ani w aucie, ani poza nim (sprawdzone jest tylko, że program ładujący znajduje wszystkie jego biblioteki w `lib/`). Nie wiadomo jeszcze, czy wystartuje w aucie, ile zajmie pamięci i procesora, czy Crunchyroll go przepuści i czy Widevine zadziała. Jeśli nie wystartuje: Ustawienia > Przeglądarka > Silnik > lekki.

## 0.1.186

- Mysz (gładzik) w odtwarzaczu YouTube (RideTube): kursor jest rysowany na jego ekranie, a kliknięcie działa jak dotknięcie – lista filmów, przyciski odtwarzacza, Wstecz. Auto, 2026-11-15: po przekazaniu filmu ze strony do odtwarzacza YouTube przycisk Wstecz nie działał, bo gładzik i gałka zostawały przechwycone dla kursora menu, którego na tym ekranie nie było; teraz kursor przechodzi razem z ekranem (menu ↔ YouTube).
- Mysz w THEiPlay Player: kliknięcie to dotknięcie w miejscu kursora (przyciski odtwarzacza; poza nimi – pokazanie przycisków). Niesprawdzone w aucie.

## 0.1.185

- Dźwięk AirPlay, pomiar w aucie (2026-11-15): do głośników docierało ok. 11 s dźwięku na 29 s sesji, choć moduł wyjścia nic nie gubił (0 opróżnień, bufor urządzenia prawie pusty). Przyczyna: auto odrzucało pakiety UDP z dźwiękiem, zanim UxPlay je odczytał – licznik systemu „RcvbufErrors” 52 178 wobec 53 046 wpisów „resent audio packet” w logu UxPlay.
- `g21-airplay-open` 0.1.60: gniazda UDP UxPlay dostają bufor odbioru 4 MiB zamiast systemowych 208 KiB (tylko jego gniazda, ustawienia systemu nietknięte; log UxPlay zapisuje uzyskany rozmiar), a UxPlay działa z nieco wyższym priorytetem. Niesprawdzone w aucie.

## 0.1.184

- Film na stronie (`g21-browser` 0.1.38): całe miejsce wideo jest zakryte czarnym kafelkiem – nie widać ani nie da się nacisnąć żadnych przycisków odtwarzacza strony – z dużym przyciskiem „▶ Odtwórz” na środku (kafelek stoi w miejscu, nie przesuwa się pod kursorem). Naciśnięcie: obracające się kółko i „Ładowanie…”; gdy film jest gotowy, przycisk zmienia kolor i pyta jeszcze raz „▶ Odtwórz” – dopiero to naciśnięcie pokazuje film na pełnym ekranie. Wideo chronione DRM (EME) nie jest zatrzymywane ani zakrywane.
- Film z YouTube kliknięty na stronie odtwarza odtwarzacz YouTube aplikacji (RideTube): dźwięk przez odtwarzacz multimediów auta, obraz jego dekoderem na zegarze tego odtwarzacza, ze wszystkimi jego przyciskami, zegarami i HUD. Dla YouTube nie ma drugiego potwierdzenia: po „Ładowanie…” otwiera się odtwarzacz YouTube.
- THEiPlay Player dla pozostałych stron dostał przyciski jak w RideTube: pasek z czasem, −10 s, pauza/odtwarzanie, +10 s, jakość (Auto/720/480/360) i „Rozciągnij”; gałka: obrót ±10 s, wciśnięcie pauza, w lewo wyjście. Przyciski pokazują się na 5 s po dotknięciu oraz w pauzie. Przewijanie działa dla strumieni będących jednym plikiem MP4 z indeksem (pobieranie zakresami od wybranego fragmentu); dźwięk jest zegarem – dekoder nie jest spowalniany, więc dźwięk nie czeka na pobieranie. Pobierane zakresami po 1 MB, zapamiętany adres strumienia przez 30 min.
- Całość tej wersji NIESPRAWDZONA w aucie.

## 0.1.183

- THEiPlay Player, wynik z auta (2026-11-15, `g21-browser` 0.1.36): obraz lepszy (767 klatek w 34 s), ale dźwięk mocno przerywał – do głośników docierał ułamek dźwięku, bo serwer filmu spowalnia jedno długie pobieranie. `g21-browser` 0.1.37: strumienie są pobierane krótkimi zakresami po 1 MB (każdy z pełną prędkością); log zapisuje parametry strumieni i liczbę klatek na sekundę. Niesprawdzone w aucie.

## 0.1.182

- THEiPlay Player, wynik z auta (2026-11-15, `g21-browser` 0.1.35): film z YouTube odtworzył się własną drogą, pauza i wyjście działają; 1234 klatki w 56 s, czyli ok. 22 klatki/s – za mało (strumień 720p skalowany do 1280×480 przy obciążeniu jednostki 11). Start trwał ok. 14 s.
- `g21-browser` 0.1.36: film na stronie nie odtwarza się wcale – każde wideo jest trzymane w pauzie, a na jego środku jest duży przycisk „▶ Odtwórz”, który uruchamia THEiPlay Player na pełnym ekranie. Odtwarzacz bierze strumień 480p (obraz filmu w 1280×480 ma 854×480, więc nic nie jest skalowane), większe kolejki wejścia dekodera. Przycisk pokazuje „Ładowanie filmu…” do 45 s, a drugie naciśnięcie w tym czasie nie zaczyna pobierania od nowa. Niesprawdzone w aucie.
- GPU, pomiar w aucie (2026-11-15): po poprawce układu struktur kopiowanie klatek z GPU działa, ale jest wolne. 720p: GPU z kopiowaniem 600 klatek w 46,9 s (38,7 s czasu procesora); GPU ze skalowaniem do 854×480 i kopiowaniem ok. 30 ms czasu procesora na klatkę; sam procesor (dekodowanie i skalowanie) ok. 11 ms na klatkę. Dlatego odtwarzacz dekoduje procesorem.

## 0.1.181

- THEiPlay Player, pierwsza wersja (`g21-browser` 0.1.35). Na każdym wideo strony w Przeglądarce pojawia się przycisk „▶ Odtwórz w THEiPlay Player”. Po kliknięciu film strony zatrzymuje się, a odtwarza go własny odtwarzacz na całym ekranie środkowym: strumień pobiera `g21-film.py` (yt-dlp z `jap-ridetube-d`, Python z `mgu-python`), dekoduje i skaluje `gputest/ffmpeg-va`, klatki idą wprost do warstwy wideo przez `g21-webframe` (bez zrzutów ekranu i JPEG), dźwięk do strumienia G21 Audio przeglądarki. Krzyżyk kończy film i wraca do strony, wciśnięcie gałki albo klik pauzuje.
- Ograniczenia tej wersji: dekodowanie na procesorze (GPU dekoduje, ale kopiowanie klatek z GPU jeszcze nie działa – niżej); film zaczyna się od początku, nie ma przewijania; obraz z zachowaniem proporcji (czarne pasy po bokach), bez opcji rozciągnięcia; tylko ekran środkowy (zegary i HUD jeszcze nie); filmy z DRM nie zadziałają. Całość NIESPRAWDZONA w aucie ani poza nim (części linuksowe nie uruchamiają się na Windows).
- Test GPU, wynik z auta (2026-11-15): binarka na nagłówkach libva z 2017-09 (0.1.34) wysypuje się już przy dekodowaniu; na nagłówkach 2.0.0 dekodowanie działa, a nie działa tylko kopiowanie klatki. Odczyt układu struktur na aucie: `VAImageFormat` ma 32 bajty, `VAImage` 96. Nowa binarka: nagłówki 2.0.0 z tymi dwiema strukturami w układzie auta. Kopiowanie klatek z GPU nadal niesprawdzone.

## 0.1.180

- Test GPU, wynik z auta (2026-11-15, g21-browser 0.1.33): test startuje z kafelka. Procesor: 600 klatek H.264 1280x720 w 2,9 s, 5,0 s czasu procesora. GPU, samo dekodowanie (klatki zostaja w pamieci GPU): 600 klatek w 0,8 s, 0,6 s czasu procesora. Kopiowanie klatki z GPU do pamieci nie dzialalo: biblioteka auta (libva 1.99, VA-API 0.99, stan z 2017 r.) ma struktury obrazu w starym ukladzie (VAImageFormat 32 bajty, VAImage 96 bajtow), a binarka byla zbudowana z naglowkami 2.0.0.
- g21-browser 0.1.34: gputest/ffmpeg-va zbudowany z naglowkami libva z 2017-09-08 (commit 0fd48763, ostatni przed dodaniem pol va_reserved), z nazwami bibliotek auta. Kopiowanie klatek z GPU nadal niesprawdzone w aucie.

## 0.1.179

- Test GPU, trzecia budowa (g21-browser 0.1.33). Auto, 2026-11-15, 0.1.32: binarka nie startowała (blad programu ladujacego: nazwa biblioteki zmieniona w gotowym pliku nie zgadzala sie z tablica wersji symboli). Teraz biblioteka ma nazwy auta juz przy linkowaniu, a z FFmpeg usuniete sa dwa wywolania (vaSetErrorCallback, vaSetInfoCallback), ktorych biblioteka auta nie ma. Dekodowanie na GPU nadal niesprawdzone w aucie.

## 0.1.178

- „Test GPU”, wynik z auta (2026-11-15, 0.1.177 / 0.1.31): z kafelka test nie ruszył (binarka miała ścieżkę programu ładującego z Ubuntu, której w aucie nie ma). Uruchomiony ręcznie: procesor dekoduje 600 klatek H.264 1280×720 w 3,1 s i zużywa 4,4 s czasu procesora na 20 s filmu (ok. 22% jednego rdzenia); na GPU test kończył się awarią („stack smashing detected”), bo nagłówki libva 1.8.3 nie pasują do biblioteki auta (Intel 0.99).
- `g21-browser` 0.1.32: `gputest/ffmpeg-va` zbudowany z nagłówkami libva 2.0.0, z programem ładującym auta i nazwami bibliotek auta; test nie zostawia zrzutu pamięci, gdy się wysypie; kafelek od razu pokazuje „trwa…”, a wynik jest krótki (klatki na sekundę i czas procesora dla GPU i dla procesora), szczegóły w logu. Dekodowanie na GPU nadal niesprawdzone w aucie.

## 0.1.177

- „Test GPU” w Ustawienia > Ogólne > O systemie: ten sam 20‑sekundowy film H.264 1280×720 jest dekodowany raz przez układ graficzny (VA-API, `/dev/dri/renderD128`) i raz przez procesor; wynik (klatki, czas, czas procesora) pojawia się na kafelku i w logu `g21-browser`. Odczyt z auta 2026-11-15: sterownik Intel (VA-API 0.99) zgłasza dekodowanie H.264, HEVC, VP8, VP9 i JPEG. `g21-browser` 0.1.31 niesie do tego `gputest/ffmpeg-va` (FFmpeg 4.4.4 zbudowany pod `libva.so.1` auta) i próbkę filmu. To pomiar przed budową odtwarzacza na GPU; samo dekodowanie w aucie niesprawdzone.

## 0.1.176

- Pełny ekran bez napisów: zamiast dwóch przycisków z tekstem („Pełny ekran” i „Pozycja” nad oknem AirPlay, „Wyjdź” i „Pełny ekran” w Przeglądarce, „Rozciągnij” i pasek „Wyjdź z trybu pełnoekranowego” w AirPlay) są okrągłe znaki. Okno AirPlay: jeden znak (cztery narożniki) – pełny ekran; położenie okna ustawia się w Ustawienia > Obraz > Pozycja. Pełny ekran AirPlay: krzyżyk (wyjście, zawsze widoczny) i strzałka w obie strony (rozciągnięcie na 1920×720). Pełny ekran Przeglądarki: tylko krzyżyk, w tym samym miejscu.
- Przeglądarka: pełny ekran odtwarzacza to zawsze cały ekran środkowy (wariant „okno z Pozycji” z drugim przyciskiem usunięty). `g21-browser` 0.1.30: wyjście z pełnego ekranu mówi stronie wprost `document.exitFullscreen()` – sam klawisz Escape w silniku bez własnego okna nie wychodził z pełnego ekranu.
- Pomiar na aucie podczas filmu (2026-11-15, 0.1.175 / 0.1.29): odtwarzacz strony dostał H.264 1280×720 („lekkie wideo” działa), dekoduje programowo (FFmpegVideoDecoder), procesor wolny w 0–10%, dźwięk bez opróżnień bufora. Nowe przyciski niesprawdzone w aucie.

## 0.1.175

- Płynność filmu w Przeglądarce, po pomiarze na aucie podczas odtwarzania (2026-11-15, 0.1.174): procesor zajęty w 92–98%, obciążenie ok. 11 na 4 rdzeniach; procesy THEiPlay ok. 40%, z czego połowa to przenoszenie obrazu strony (silnik koduje każdą klatkę jako JPEG, `g21-webframe` ją dekoduje), a nie dekodowanie filmu; reszta to kilkadziesiąt procesów systemu po 2–5%. Dźwięk czysty (0 opróżnień bufora). `g21-browser` 0.1.29: pełny ekran jest renderowany w połowie rozmiaru (960×360 zamiast 1280×480, o 44% mniej pikseli na klatkę), JPEG o jakości 64, usługa ma priorytet `Nice=-4`. Log zapisuje, jakiego dekodera, rozmiaru i liczby klatek używa odtwarzacz. Niesprawdzone w aucie.
- Przeglądarka pokazuje film przez zrzuty ekranu silnika i na tej jednostce nie będzie w pełni płynna; do filmów z YouTube służy Multimedia > YouTube, gdzie film jest dekodowany bez przeglądarki.

## 0.1.174

- Lekkie wideo (`g21-browser` 0.1.28, reguła `video`, Ustawienia > Przeglądarka > „Lekkie wideo”, domyślnie włączone): strona dowiaduje się, zanim ruszą jej skrypty, że silnik odtwarza tylko H.264, do 720 linii i 30 klatek na sekundę. YouTube i podobne serwisy podają silnikowi najpierw VP9 albo AV1, których programowe dekodowanie kosztuje kilka razy więcej niż H.264 — na czterech wolnych rdzeniach tej jednostki obraz się zacinał, a po chwili dźwięk. Gdy silnik nie ma H.264, nic nie jest zmieniane. Niesprawdzone w aucie: nie zmierzono, o ile spada obciążenie.
- Naprawa: kursor nie trafiał dokładnie. Obraz strony jest rysowany w swoim rozmiarze od lewego górnego rogu obszaru i przy niektórych powiększeniach jest o kilka–kilkanaście pikseli mniejszy od obszaru, a położenie kursora było rozciągane na cały obszar (do ok. 20 px obok przy prawej i dolnej krawędzi). Teraz liczone jest od obrazu; strona aplikacji ze Sklepu jest też rysowana 1:1.
- Klawiatura: klawisze „<” i „>” przesuwają kursor tekstu, „wyczyść” usuwa cały tekst; „usuń” kasuje znak przed kursorem, a nowe znaki wchodzą w miejscu kursora.
- Naprawa: linki na stronach `chrome://` (i link do `chrome://about` na stronie startowej) nic nie robiły — silnik odrzucał je jako przejście pod adres `data:` (log z auta: „Not allowed to navigate top frame to data URL”).
- Crunchyroll: w logu z auta strona odpowiada 403 na żądanie z tokenem wyzwania Cloudflare (`__cf_chl_rt_tk`). To odmowa po stronie ich ochrony antybotowej, nie błąd przekierowań ani proxy THEiPlay (proxy niczego dla tej strony nie odrzuciło). Nie jest obchodzone.

## 0.1.173

- Odczyty diagnostyczne sterowników dla aplikacji ze Sklepu (`g21-browser` 0.1.27), drogą, której używają Live Data i ZF 8HP z `cauliflowermossgrape/idrive7-apps` (MIT): zapytania UDS przez TASU, własny transport diagnostyczny jednostki. Na sztywno w czytniku `g21-car.js`: tylko usługi odczytu 22 (ReadDataByIdentifier) i 01 (OBD, dane bieżące), tylko jeden sterownik naraz (nigdy adres „wszystkie”), nigdy identyfikator VIN, jedno zapytanie naraz co najmniej co 120 ms. Nie ma zmiany sesji, zapisu, kodowania, testów elementów, resetu ani kasowania błędów. Aplikacja zgłasza sterowniki w `theiplay.json` (`"uds"`), pyta przez `/_car/<aplikacja>/uds?e=<adres>&s=<22|01>&d=<identyfikator>`; wyłącznik: Ustawienia > Aplikacje > „Diagnostyka” (reguła `carDiag`).
- Hello THEiPlay: karta „Sterowniki” z katalogami `diag.json` (OBD-II 51 pozycji, identyfikacja 9, silnik benzynowy DME8 118, skrzynia ZF 8HP 41), odczyt jednej pozycji albo całego katalogu, z dekodowaniem i surową odpowiedzią. Katalog silnika jest dla benzynowych B38/B48/B58; dla diesla zostają OBD-II i identyfikacja.
- Sprawdzone tylko testem z udawanym sterownikiem (`tools/test_car_bridge.js`). Na aucie NIE: uruchomienie zapytań diagnostycznych z sesji programisty zostało zablokowane przez zabezpieczenia narzędzia; pierwszy prawdziwy odczyt zrobi właściciel z aplikacji Hello.

## 0.1.172

- Hello THEiPlay: karta „Auto” rysuje katalog 60 sygnałów w 5 grupach (Silnik, Paliwo i podróż, Jazda, Opony, Podwozie) z przeliczeniami — `signals.json`, wygenerowany skryptem `tools/gen_hello_signals.js` z aplikacji Live Data z `cauliflowermossgrape/idrive7-apps` (MIT). Katalog jest w naszym repozytorium, nic nie trzeba doinstalowywać. Sprawdzone na aucie 2026-11-15 przy pracującym silniku: odpowiada 47 z 60 (m.in. obroty 778, moment, płyn i olej 67 °C, paliwo 19 l, zasięg 231 km, przebieg, opony 2,0 / 1,9 / 2,3 / 2,2 bar, akumulator 83%, poziom oleju).
- `g21-browser` 0.1.26: czytnik danych auta czeka na zgłoszenie się usługi przed pierwszym odczytem (do 2,5 s). Bez tego pierwsze pytanie o pole z KombiIF, TPMS i Vehicle2 wracało jako „niedostępne”, choć auto je ma. Filtr prywatności nie blokuje już pól z „Driver” w nazwie (np. kąt kierownicy, hamowanie kierowcy); VIN, pozycja, telefon, kontakty i profile zostają zablokowane.
- Dane diagnostyczne sterowników (to, co czytają Live Data „Useful”, ZF 8HP, Service) idą inną drogą — zapytania UDS przez TASU do sterowników — i nie są dodane.

- Pisanie kursorem: gdy na ekranie jest klawiatura THEiPlay (pole adresu, pole na stronie, nazwa), kursor z gładzika pisze po niej — stuknięcie albo wciśnięcie pokrętła to dotknięcie klawisza pod kursorem; strona pod klawiaturą niczego wtedy nie dostaje. Niesprawdzone w aucie.

## 0.1.171

- Menu jak galeria: małe kafelki z małą ikoną, układane wierszami w maksymalnie trzech rzędach (pięć w rzędzie, 15 na stronie); przy większej liczbie rzędy się przesuwają. Dotąd był jeden rząd dużych kafelków.
- Ustawienia podzielone na pięć grup: „Obraz i ekrany” (Pozycja, Rozdzielczość, Obszar zegarów, Renderowanie — wszystko o obrazie w jednym miejscu, dla AirPlay, YouTube, Przeglądarki i aplikacji), „Sterowanie” (mysz z gładzika, szybkość, kursor w menu, wyłącznik), „Przeglądarka” (strona startowa, powiększenie, rozdzielczość strony, pełny ekran, autoodtwarzanie, piaskownica, limit pamięci, strony chrome), „Aplikacje” (Zegary, HUD, Dane auta) i „Ogólne” (napis, język, o systemie). „Ustawienia” w Aplikacjach otwierają te same Ustawienia. Niesprawdzone w aucie.

## 0.1.170

- Płynność wideo w Przeglądarce (`g21-browser` 0.1.25). Pomiar na aucie 2026-11-15: jednostka jest stale obciążona (średnie obciążenie 9–10 na 4 rdzeniach), a silnik przeglądarki działał z obniżonym priorytetem (`Nice=5`), więc film dekodowany programowo przegrywał o procesor ze wszystkim innym — przycinał obraz, a po chwili dźwięk. Usługa ma teraz zwykły priorytet (`Nice=0`). Klatki strony idą jako JPEG o jakości 72 zamiast 82 (mniej pracy przy kodowaniu i dekodowaniu każdej klatki).
- Log błędów strony nie jest już zapychany: odczyty sygnałów auta, na które auto nie odpowiada, oraz powtórzenia tej samej linii nie są zapisywane, a limit 60 linii liczy się od nowa po każdym przejściu na inną stronę. Przez to zapchanie błąd odtwarzacza YouTube („Coś poszło nie tak”) nie zapisał się i jego przyczyna dalej nie jest znana.
- Hello THEiPlay, karta „Auto”: liczniki na żywo z sygnałów, które odpowiedziały na G21 (prędkość, tryb jazdy, zasięg, paliwo, przebieg, temperatura zewnętrzna, ciśnienie i temperatura opon, dane podróży, średnia prędkość i zużycie, doładowanie, przeciążenia, skala mocy i momentu). Przeliczenia surowych wartości są przyjęte (dały wiarygodne liczby na aucie), nie ze specyfikacji. Osobna karta „Sygnały” to przeglądarka wszystkich 1648 pól do odczytu; pole, które nie odpowiada, nie jest już odpytywane w kółko.
- Most danych auta potwierdzony na aucie: `g21-car.js` na Node 8 jednostki wylistował 338 interfejsów i odczytał 93 z 245 sprawdzonych pól pojazdu (reszta: usługa niedostępna w tym aucie).

## 0.1.169

- Ustawienia > „O systemie”: wolne miejsce (pamięć aplikacji `/var/opt`, dysk `/var/opt/hdshare`), pamięć RAM, procesor, grafika, system i USB. Czyta to demon `g21-browser` 0.1.24 (Node 8 aplikacji nie umie zapytać o wolne miejsce); dotknięcie kafelka odświeża.
- Stan auta odczytany 2026-11-15: Atom A3960 (4 rdzenie, do 2,4 GHz), 5,5 GB RAM, Intel HD 505 (Broxton, i915), `/var/opt` 10,8 GB (wolne 6,9), dysk danych 89 GB (wolne 83), BMW MGU P18_23w44.2-1-3, Linux 4.14.198-apl.

## 0.1.168

- Dane auta dla aplikacji ze Sklepu, tylko odczyt (`g21-browser` 0.1.23). Aplikacja zgłasza w `theiplay.json` sygnały (`"car": [...]`), a jej strona czyta je z własnego serwera: `/_car/<aplikacja>/list` i `/_car/<aplikacja>/get?i=<interfejs>&n=<pole>`. Czyta je nowy proces `g21-car.js` (root, Node 8 jednostki, SOME/IP z katalogu jednostki); nie ma w nim kodu, który cokolwiek ustawia albo wywołuje. Bramki: pyta tylko strona tej aplikacji i tylko jako ta aplikacja, wydawane jest tylko to, co zgłosiła, nigdy sygnały o osobie i miejscu (VIN, pozycja, cele, telefon, kontakty, profile), a właściciel wyłącza całość w Aplikacje > Ustawienia > „Dane auta” (reguła `carData`). Droga i bramki sprawdzone testem `tools/test_car_bridge.js` z udawanym SOME/IP; odczyt z prawdziwego auta niesprawdzony.
- To nie są dane diagnostyczne sterowników (to, co Engine Config czy aplikacja 8HP czytają przez UDS) — tej drogi do auta narzędzie nie ma.
- Hello THEiPlay ma trzy karty: „Test” (dotyk, mysz, przewijanie, dźwięk, klawiatura, ekran), „Auto” (prędkość na żywo i przeglądarka wszystkich sygnałów do odczytu) i „Co aplikacja może” (lista możliwości, `theiplay.json`, przykład odczytu). Obraz aplikacji na zegarach i HUD włącza się w Aplikacje > Ustawienia.
- Gładzik, dwa palce: w lewo — wstecz, w prawo — dalej; w górę i w dół — przewijanie. W Przeglądarce to poprzednia / następna strona (w aplikacji krok wstecz, potem wyjście; w pełnym ekranie wyjście z niego), w menu („Kursor w menu”) poprzednia strona menu / wejście w zaznaczoną pozycję, a góra–dół przesuwa zaznaczenie.

## 0.1.167

- Naprawa: w Przeglądarce kursor z gładzika był zamknięty w obszarze strony i nie dało się nim sięgnąć paska ani przycisków. Teraz chodzi po całym ekranie: w stronie jest myszą strony, poza nią stuknięcie to dotknięcie w tym miejscu (pasek adresu, wstecz, pływające przyciski).
- Aplikacja ze Sklepu ma na dole dyskretny pasek jak w telefonie: „wstecz” (krok wstecz w aplikacji, z pierwszej strony — wyjście) i „home” (Aplikacje w THEiPlay). Zastępuje „Zamknij”.
- Naprawa: film w Przeglądarce przełączony na pełny ekran robił się małym oknem, z którego nie było widać wyjścia (pełny ekran szedł w okno z Pozycji, domyślnie 640×360). Pełny ekran jest teraz domyślnie całym ekranem 1920×720 (przycisk „Pełny ekran” przełącza na okno z Pozycji), a obok jest zawsze przycisk „Wyjdź”.
- Menu: każda strona to rząd dużych kafelków, który się przesuwa (pokrętło, palec, kursor z gładzika), zamiast wierszy. Wierszami zostaje tylko strona z suwakami (Pozycja).

- Aplikacja ze Sklepu otwiera się jako aplikacja, nie jako strona w przeglądarce: bez paska adresu i przycisków przeglądarki, na całym dotykowym obszarze ekranu (1796×632 zamiast 1796×548). W prawym górnym rogu pływa „Zamknij”; pokrętło w lewo cofa wewnątrz aplikacji, a z jej pierwszej strony ją zamyka. W trakcie ładowania i przy błędzie widać jeszcze pasek ze stanem. Niesprawdzone w aucie.

- Ustawienia nie giną. Plik ustawień był nadpisywany w miejscu i zostawiany systemowi do zapisania: wyłączenie auta albo zakończenie aplikacji tuż po zmianie gubiło zmianę albo zostawiało pół pliku, a następny start czytał wartości domyślne. Teraz zapis idzie do pliku obok, jest wymuszany na dysk i dopiero zajmuje miejsce właściwego; poprzedni plik zostaje jako `.bak` i jest czytany, gdy właściwego nie da się odczytać. Tak samo zapisuje reguły i ustawienia `g21-browser` 0.1.22.
- Zapis nie jest już odrzucany w całości, gdy jakaś wartość (napis, nazwa) zawiera słowo „password” albo „secret”; odrzucane jest tylko pole o takiej nazwie.
- Zapisywane są też oba przełączniki rozciągnięcia na cały ekran (Przeglądarka, AirPlay), które dotąd żyły tylko do zamknięcia aplikacji.
- Log startu podaje folder ustawień i ostrzega, gdy jest to `/tmp` (znika przy restarcie jednostki).

- Pełny ekran AirPlay ma pływający przycisk „Rozciągnij” w prawym górnym rogu: obraz wypełnia cały ekran środkowy 1920×720, kosztem proporcji; drugi raz — z powrotem z proporcjami. Renderer zawsze zachowuje kształt klatki, więc rozciąganie robi `g21-yuvring` (`g21-airplay-open` 0.1.59): gdy aplikacja poda kształt ekranu w pliku `airplay-size.stretch`, klatka jest robiona w tym kształcie. Działa na ścieżce pierścienia (ta, której używa auto). Poza pełnym ekranem obraz zawsze ma swoje proporcje. Niesprawdzone w aucie.

## 0.1.166

- Ustawienia > Rozdzielczość treści > Ekran centralny ma dwie nowe wartości obok 600×400: 960×640 i 1280×720. To ramka, w którą wpisywany jest obraz (AirPlay i film YouTube), z zachowaniem proporcji i bez powiększania: obraz iPhone’a 1080×498 wychodzi jako 600×276, 960×442 albo bez zmniejszania. Większa ramka to ostrzejszy obraz i więcej pracy procesora; YouTube pobiera i dekoduje wtedy 720p. Domyślnie zostaje 600×400. Zmiana działa od następnego Startu AirPlay i następnego filmu. Niesprawdzone w aucie.

## 0.1.165

- Naprawa przerywania dźwięku AirPlay, tym mocniejszego, im większy obraz przysyłał iPhone. Log z auta 2026-11-15: w jednej sesji pisarz `g21-audio-out` odrzucił 1 461 888 z 5 772 480 próbek (25%), 3045 razy „urządzenie pełne”, ani jednego opróżnienia. Urządzenie SmartX trzyma 3072 próbki (64 ms) niezależnie od tego, o co się prosi; zapas 80 ms z 0.1.2 go przepełniał, a dźwięk przychodzący porcjami (procesor zajęty dekodowaniem obrazu, obciążenie 8,6 na 4 rdzeniach) był wyrzucany, gdy brakowało miejsca. `g21-audio` 0.1.3: pisarz nigdy nie odrzuca, tylko czeka na miejsce (odtwarzacz czeka wtedy w potoku), nie odmierza już czasu własnym zegarem, a zapas dobiera do faktycznej pojemności urządzenia (SmartX: 40 ms). Binarka przebudowana na Ubuntu 18.04; w aucie niesprawdzone.
- Mniej pracy procesora w AirPlay: `g21-airplay-open` 0.1.58 uruchamia UxPlay z `-srgb no`. UxPlay domyślnie przeliczał każdą klatkę na RGB w gałęzi, która kończy się w `fakesink` (obraz dla ekranu bierze druga gałąź, I420) — przy 1080×498 i 24 kl./s to była praca na nic.
- Ustalone przy okazji: iPhone nie trzyma się rozmiaru 600×400, o który prosi THEiPlay (`-s 600x400`); w poziomie przysłał 1080×498, w pionie 332×720. Do 600×400 obraz zmniejsza dopiero `g21-yuvring` (na ekranie było 600×276).

## 0.1.164

- Dostosowanie do `mgu-render` 0.6.20 (MGU Store). Renderer oddaje teraz HMI dotyk i pokrętło, gdy nad aplikacją pojawi się komunikat, menu nagłówka albo asystent, i zdejmuje wtedy warstwę aplikacji — to dzieje się po stronie renderera i THEiPlay korzysta z tego bez zmian (aplikacja dostaje „nie na ekranie”, więc mysz z gładzika oddaje kontroler). Nowa jest też reguła: aplikacja, której obraz nie zmienia się przez 4 kolejne dotknięcia lub ruchy pokrętła w 10 s, traci oba na 10 s i znika z ekranu. Menu THEiPlay nie zawsze zmienia obraz (pokrętło na końcu listy, dotknięcie obok pozycji, strona Przeglądarki w trakcie ładowania), więc każde wejście dostaje teraz odpowiedź: ponownie wysłane te same obszary dotyku, co renderer liczy jako reakcję. Sprawdzone ze źródłem renderera (`native/mgu-render/src/main.c`), nie w aucie.

## 0.1.163

- Panel WWW na porcie 1235 jest teraz menu THEiPlay w przeglądarce: ta sama strona, te same pozycje z tymi samymi podpowiedziami i przełącznikami, a kliknięcie to ten sam wybór co dotknięcie na ekranie auta. Panel niczego nie wylicza sam — pyta aplikację, co menu pokazuje (`/api/menu`), i mówi jej, co wybrano (`/api/choose`), więc zawsze za menu nadąża. Wcześniej był to formularz adresu RDP (jest pod `/rdp`) i przy starcie w ogóle nie był uruchamiany. Wybrać można tylko to, co menu pokazuje w danej chwili; żądania z innych stron są odrzucane. Pola tekstowe (nazwa, adres, szukanie) otwierają klawiaturę na ekranie auta. Panel nie ma hasła: działa dla każdego w tej samej sieci co MGU. Sprawdzony na komputerze, nie w aucie.

- Ustawienia > „Przycisk wyłączenia” (obok „Renderowania”): czerwony przycisk X w prawym dolnym rogu, rysowany nad wszystkim, co pokazuje THEiPlay (menu, Przeglądarka, pełny ekran, AirPlay), i sprawdzany przed każdym innym dotykiem. Dotknięcie kończy aplikację: najpierw porządnie (sesje, narzędzia, zamknięcie strony — HMI wraca do tego, co pokazywało), potem proces się kończy; jeśli porządne zamknięcie nie skończy się w 2 s, proces kończy się mimo to. Nie ma go na ekranie YouTube (RideTube rysuje własną powierzchnię). Niesprawdzone w aucie.

## 0.1.162

- Naprawa: po zminimalizowaniu aplikacji i powrocie nie było kursora myszy. Menu nie mówiło aplikacji, że znów jest na pierwszym planie (renderer nie powtarza tego dla powierzchni, którą aplikacja sama przywraca).
- Nowa opcja Ustawienia > „Kursor w menu”: kursor z gładzika działa też na stronach samego THEiPlay (menu, listy); stuknięcie w gładzik to dotknięcie w miejscu kursora. Domyślnie wyłączona.
- Przewijanie dwoma palcami na gładziku (`g21-input` 0.1.2): dwa palce przesuwają stronę w Przeglądarce, nie kursor. Oparte na polach drugiego palca z opisu sygnału (`touchCoordinatesX2/Y2/Z2FrontSide`); czy gładzik je faktycznie podaje, pokaże log demona („two fingers on the pad”) — niesprawdzone w aucie.
- Naprawa dźwięku AirPlay (przerywanie, brzęczenie): `g21-audio` 0.1.2, pisarz `g21-audio-out` zbiera najpierw 80 ms dźwięku i dopiero wtedy gra (i ponownie po opróżnieniu bufora), bufor urządzenia 250 ms. AirPlay podaje dźwięk dokładnie w czasie rzeczywistym, bez zapasu, więc każda spóźniona porcja opróżniała głośniki. Binarka przebudowana na Ubuntu 18.04; w aucie niesprawdzone.
- Naprawa: po AirPlay nie było dźwięku w YouTube. AirPlay trzymał jedyny strumień G21 Audio; teraz otwarcie YouTube albo Przeglądarki kończy AirPlay tak jak jego przełącznik Start.
- Pełny ekran filmu w Przeglądarce ma pływający przycisk „Pełny ekran” w prawym górnym rogu obrazu: rozciąga go na cały ekran środkowy (1920×720, największy rozmiar tego ekranu) albo wraca do okna z Pozycji (`g21-browser` 0.1.21). AirPlay ma taki przycisk od dawna.

## 0.1.161

- Aplikacje > Ustawienia ma pozycję „Strony przeglądarki”: otwiera Przeglądarkę na `chrome://about` (wersja, reguły, przełączniki, historia). `g21-browser` 0.1.20 przyjmuje pierwszą stronę od aplikacji.
- Przegląd kodu. Nowe narzędzie `tools/check_calls.js` (w `test_all.js`) szuka wywołań metod, których nie ma — błąd tego rodzaju wywracał aplikację przy włączeniu myszy; teraz nie znajduje żadnego. `g21-airplay-open` 0.1.57: dźwięk AirPlay nie czeka już w 64 KiB buforze `filesink` (0,34 s opóźnienia i dźwięk porcjami), jest pisany od razu.
- Auto było nieosiągalne w czasie przeglądu: logów z ostatnich wersji nie czytano, nic z powyższego nie było w nim uruchamiane.

## 0.1.160

- Adresy `chrome://` w Przeglądarce. Dotąd pole adresu je odrzucało, a silnik (Chrome headless shell) i tak nie ma stron takich jak `chrome://version` czy `chrome://settings`. `g21-browser` 0.1.19: własne strony `chrome://about` (lista), `version`, `settings`, `policy`, `flags`, `history`, `downloads`, `extensions`, `bookmarks`, `password-manager`; pozostałe adresy `chrome://` idą do silnika (np. `chrome://gpu`), a gdy silnik strony nie ma, przeglądarka to pisze zamiast pustego ekranu. `about:nazwa` działa tak samo. Link do listy jest na stronie startowej. Strony własne sprawdzone testem jednostkowym; strony silnika i całość w aucie niesprawdzone.

## 0.1.159

- Logowania w Przeglądarce zostają. `g21-browser` 0.1.18: (1) silnik dostaje do 4 s na zamknięcie i zapis profilu, zamiast być ubijany 0,1 s po poleceniu zamknięcia; (2) demon trzyma kopię wszystkich ciasteczek w `state/cookies.json` (root, 0600), zapisywaną w trakcie pracy i przy zatrzymaniu, i oddaje je następnemu silnikowi — także ciasteczka sesyjne, które silnik sam gubił przy każdym restarcie. Nie ma menedżera haseł: zapamiętywane jest zalogowanie, a nie hasła do formularzy. Nieuruchamiane w aucie ani na silniku (testy na Windows nie startują silnika).

## 0.1.158

- Naprawa: linki „Ostatnio otwierane” na stronie startowej Przeglądarki nie otwierały tej samej strony, bo adres był zapisywany bez części po `?` i `#` (film YouTube `/watch?v=…` otwierał pusty odtwarzacz, wyszukiwanie pustą stronę). `g21-browser` 0.1.17 zapisuje cały adres; pomija tylko parametry wyglądające na dane logowania (token, code, session…) i fragmenty z tokenem. Wpisy zapisane wcześniej zostają skrócone, dopóki strona nie zostanie otwarta ponownie. Sprawdzone testem jednostkowym, nie w aucie.

## 0.1.157

- Sklep działa: Aplikacje > Sklep ma „Importuj z git” (adres `wlasciciel/repo` albo `wlasciciel/repo@galaz`) i „Aplikacja testowa”, która importuje bez wpisywania stronę testową `Hello THEiPlay` (gałąź `theiplay-hello` tego repozytorium; źródło w `examples/theiplay-hello/`). Zaimportowana aplikacja jest kafelkiem w Aplikacjach i otwiera się w Przeglądarce; w Sklepie można ją usunąć (dwa wybory). `g21-browser` 0.1.16: gałąź inna niż domyślna jest osobną aplikacją.
- Sprawdzone na komputerze skryptem `tools/e2e_store.js` na prawdziwym GitHubie: pobranie archiwum, rozpakowanie, lista, serwer plików, strona startowa, odmowa wyjścia poza folder, usunięcie. Niesprawdzone w aucie (menu, kafelek, otwarcie w silniku).

## 0.1.156

- Pełny ekran odtwarzacza w Przeglądarce jest rysowany w oknie z Ustawienia > Pozycja (ekran środkowy), tak jak obraz AirPlay i YouTube, a nie zawsze na całym ekranie. `g21-browser` 0.1.15 przyjmuje okno mniejsze niż obszar strony i renderuje je piksel w piksel (duże okno nadal w 2/3). Zmiana Pozycji działa od następnego otwarcia Przeglądarki. Niesprawdzone w aucie.

## 0.1.155

- Przegląd ustawień ekranów. „Gdzie rysować” (mapa albo cały panel zegarów) było w AirPlay > Ekrany > Zegary, choć dotyczy też YouTube i Przeglądarki; jest teraz w głównych Ustawieniach jako „Obszar na zegarach”. Do Ustawień doszły też „Mysz z gładzika” (ten sam przełącznik co ikona w pasku aplikacji) i „Szybkość myszy” (1–5; ustawienie istniało bez pozycji w menu).
- Stan po przeglądzie: obraz na zegarach i HUD z AirPlay, YouTube i Przeglądarki idzie jedną ścieżką i używa tej samej Pozycji, Rozdzielczości treści i obszaru zegarów. Przeglądarka na ekranie środkowym celowo ich nie używa (strona interaktywna pod paskiem; ma własne Powiększenie i Rozdzielczość w Aplikacje > Ustawienia). Niesprawdzone w aucie.

## 0.1.154

- Odtwarzanie multimediów w Przeglądarce: dźwięk nie może już zatrzymać odtwarzacza. Narzędzie `g21-audio` 0.1.1 samo odbiera i odrzuca strumień w tempie czasu rzeczywistego, gdy pisarz nie działa (urządzenia nie da się otworzyć, pisarz jest uruchamiany ponownie), i zabija pisarza, który w 4 s nie otworzył urządzenia. Wcześniej potok zapełniał się w 85 ms, wątek dźwięku silnika stawał w zapisie, film się zacinał i strona pokazywała „coś poszło nie tak”. To prawdopodobna, ale niepotwierdzona logiem przyczyna zgłoszonego błędu.
- `g21-browser` 0.1.14: silnik nie wstrzymuje multimediów ani nie spowalnia timerów „niewidocznej” strony; po restarcie G21 Audio strumień dźwięku jest otwierany ponownie bez zamykania Przeglądarki.
- Bez zmian: treści z DRM (Widevine) nie zadziałają w tym silniku; dekodowanie wideo jest programowe.
- Niesprawdzone w aucie.

## 0.1.153

- `g21-browser` 0.1.13 zapisuje w swoim logu błędy strony i odtwarzacza (CDP `Log` i `Media`, najwyżej 60 wierszy na uruchomienie silnika). Powód: odtwarzacz znów pokazał „coś poszło nie tak”, a auto było w tym czasie nieosiągalne i log nie mówił, dlaczego. Sama przyczyna nie jest ustalona ani naprawiona.

## 0.1.152

- Naprawa: gładzik nie przekazywał ruchu, choć kursor był widoczny. Narzędzie `g21-input` 0.1.0 odmówiło przejęcia kontrolera („the car moves”), bo auto jechało (blokada postoju). Właściciel potwierdził, że auto wtedy jechało, i polecił zdjąć blokadę postoju: w 0.1.1 mysz działa także w czasie jazdy. Blokadę przywraca plik `/var/opt/g21-input/config.json` z `{ "parkedOnly": true }`. Prędkość jest teraz czytana przy każdym włączeniu, liczona tylko gdy świeża (6 s) i zapisywana w logu. Niesprawdzone jeszcze w aucie.
- `g21-browser` 0.1.12: przejście w pełny ekran nie jest już wykonywane dwa razy naraz.

## 0.1.151

- Naprawa: brak dźwięku z iPhone’a w AirPlay po drugim Starcie. `g21-airplay-open` zamykał tylko powłokę, a klient G21 Audio (node) zostawał i trzymał jedyny strumień; kolejny Start dostawał „busy (held by airplay)” i przechodził na starą trasę bez dźwięku (log z auta 2026-11-15). 0.1.56 zamyka każdego swojego klienta strumienia AirPlay, także pozostałego po starszej wersji. Czy sam zapis UxPlay do G21 Audio daje dźwięk, nie jest jeszcze potwierdzone w aucie.

## 0.1.150

- Naprawa: mysz z gładzika kontrolera iDrive (G21 Input) nie działała, a aplikacja wywracała się z błędem `this._input.on is not a function` (log z auta 2026-11-15). Klient G21 Input był zapisywany w polu `_input`, które od dawna zajmuje menedżer pokrętła, więc nigdy nie powstawał. Ma teraz własne pole `_padInput`. Poprawka nie była jeszcze sprawdzana w aucie.

## 0.1.149

- Naprawa: AirPlay przestał być wykrywany przez iPhone’a. Narzędzie `g21-airplay-open` 0.1.54 otwierało G21 Audio wewnątrz `$(...)`; klient dźwięku działający w tle trzymał potok podstawienia otwarty i start zatrzymywał się na zawsze przed uruchomieniem UxPlay (stan z auta 2026-11-15: avahi i strumień dźwięku działają, UxPlay nie ma). 0.1.55 otwiera dźwięk bez podstawienia i czyta nazwę FIFO z pliku. Poprawka nie była jeszcze sprawdzana w aucie.

## 0.1.148

- Aplikacje > Ustawienia ma nowe opcje Przeglądarki: „Strona startowa” (adres albo pusto = wbudowana), „Powiększenie” (100–200%), „Rozdzielczość” (dawniej „Jakość obrazu”), „Pełny ekran” (cały ekran / obszar strony) i „Autoodtwarzanie” (dozwolone / po dotknięciu). Autoodtwarzanie jest teraz domyślnie dozwolone.
- Pełny ekran odtwarzacza na stronie: narzędzie `g21-browser` 0.1.11 wykrywa pełny ekran strony i przełącza obraz na cały ekran środkowy (1920×720, renderowany jako 1280×480, proporcje filmu zachowane), aplikacja chowa pasek i rysuje obraz na całym ekranie. Wyjście: przycisk odtwarzacza, wciśnięcie pokrętła albo pokrętło w lewo.
- „Rozdzielczość treści” (dawniej „Jakość obrazu” w AirPlay) jest teraz tylko w głównych Ustawieniach, obok „Pozycji”, i dotyczy wszystkiego, co pokazuje THEiPlay. Wybór ekranów, na których aplikacja ma się wyświetlać, zostaje w każdej aplikacji.
- Nic z tego nie było sprawdzane w aucie.

## 0.1.147

- Narzędzie `g21-browser` 0.1.10 i aplikacja mają napisany import aplikacji z git dla Sklepu (publiczne repozytorium GitHub ze stroną `index.html`, rozpakowane do `apps/` i serwowane silnikowi z lokalnego serwera plików tylko do odczytu; kafelek aplikacji w „Aplikacjach”). Na życzenie właściciela nie jest to jeszcze podpięte do menu: Sklep pozostaje kafelkiem z zapowiedzią. Kod nie był uruchamiany.

## 0.1.146

- Menu główne to teraz duże kafelki w rzędzie, który się przesuwa (pokrętło, strzałki, palec w poziomie): Multimedia, Aplikacje, Ustawienia. Multimedia: YouTube i AirPlay. Aplikacje: Przeglądarka, Sklep, Ustawienia aplikacji. Ustawienia: Napis, Język, Renderowanie, Pozycja (to, co było wierszami starego menu). „Wstecz” z YouTube i AirPlay wraca do Multimediów, z Napisu, Renderowania i Pozycji do Ustawień. Gdy kafelków jest więcej, niż się mieści, rząd przesuwa się tak, żeby wybrany był widoczny.
- Sklep jest na razie zapowiedzią: kafelek otwiera stronę z pozycją „Import aplikacji z git — w przygotowaniu”. Kod importu (publiczne repozytorium GitHub ze stroną `index.html`, serwowane silnikowi z lokalnego serwera plików) jest napisany w `g21-browser` 0.1.10 i w aplikacji, ale nie jest podpięty do menu i nie był uruchamiany.
- Na aucie jeszcze niesprawdzone.

## 0.1.145

- G21 Input: nowe narzędzie `g21-input` 0.1.0 — fizyczny touchpad na pokrętle iDrive jako mysz. Demon włącza w kontrolerze tryb dotyku tylko wtedy, gdy aplikacja o to prosi, czyta położenie palca i wysyła aplikacji ruch oraz stuknięcia; po zamknięciu aplikacji, jej awarii, ruszeniu auta albo zatrzymaniu demona tryb dotyku jest wyłączany. Sprawdzone na aucie: tryb dotyku przyjęty, 60 próbek na sekundę ze współrzędnymi palca, po próbie kontroler wrócił do zwykłego trybu.
- Kursor w Przeglądarce: biała strzałka z ciemnym obrysem, tylko nad stroną. Ruch względny jak na touchpadzie laptopa (szybszy palec = dalej), kursor startuje na środku strony. Wciśnięcie pokrętła = lewy przycisk myszy (wciśnięcie i zwolnienie osobno, więc działa też przeciąganie) i nic poza tym; lekkie stuknięcie touchpada = kliknięcie. Do silnika idą prawdziwe zdarzenia myszy (`g21-browser` 0.1.9), bez wstrzykiwania skryptów w strony. Obrót i wychylenie pokrętła działają jak dotąd.
- Przełącznik myszy: ikona myszy w rzędzie nawigacji stron menu, na lewo od strzałek obok „Wyłącz aplikację”. Włączona: podświetlona; wyłączona: wygaszona i przekreślona. Stan jest zapisywany. Kursor pojawia się tylko, gdy przełącznik jest włączony, otwarta jest aplikacja z `mouse: yes` (Przeglądarka), aplikacja jest na pierwszym planie i strona jest gotowa; w menu kursora nie ma nigdy.
- Czego jeszcze nie ma: kursora w ekranach YouTube (własny interfejs, bez adaptera myszy), sekcji „G21 Input” w ustawieniach (czułość jest stała), blokady na czas jazdy — demon nie dostał prędkości z auta przy próbie, więc włącza mysz bez sprawdzenia postoju i zapisuje to w logu. Nowe elementy na aucie jeszcze niesprawdzone.

## 0.1.144

- G21 Audio: nowe narzędzie `g21-audio` 0.1.0, wspólna droga dźwięku THEiPlay do głośników auta dla dźwięku, który przychodzi jako strumień. Strumień PCM (S16LE, 48 kHz, stereo) trafia do urządzenia SmartX `CarLifeMedia`, a AudioManager BMW łączy to źródło (287) z przednimi głośnikami (1024); głośność reguluje iDrive. Głośniki są przejmowane dopiero, gdy płynie dźwięk (około 1,4 s), i oddawane poprzedniemu źródłu (CarPlay, radio) po 3 s ciszy albo po zamknięciu. Sprawdzone na aucie: ton testowy 440 Hz słychać z głośników, po próbie CarPlay wraca.
- Przeglądarka ma dźwięk: narzędzie `g21-browser` 0.1.8 kieruje wyjście audio silnika do G21 Audio (prywatne urządzenie ALSA silnika zapisuje do kolejki G21 Audio; biblioteki silnika i auta nie mieszają się w jednym procesie, piaskownica zostaje). Nowa reguła `audio`: `on` (domyślnie) / `off`. Bez zainstalowanego G21 Audio strony są nieme, jak dotąd. Na aucie jeszcze niesprawdzone.
- Skąd kod: `speakers.js` to niezmienione narzędzie „speakers” z Vizualyse/idrive-apps (GPL-3.0-or-later, Yousaf Khan); sposób zapisu do SmartX według Moonride (GPL-3.0-or-later, JustAnotherPU). Szczegóły w `native/g21-audio/NOTICE.md`. Niczego z BMW nie kopiujemy.
- AirPlay ma dźwięk przez G21 Audio: narzędzie `g21-airplay-open` 0.1.54 najpierw prosi G21 Audio o strumień, a UxPlay zapisuje do niego dźwięk (S16LE, 48 kHz, stereo, w takt zegara strumienia). Dotychczasowa droga (samo połączenie źródła w AudioManagerze) zostaje jako zapas, gdy G21 Audio nie ma albo strumień zajmuje przeglądarka. Wyjaśniona cisza z 0.1.132/0.1.133: połączenie CarLifeMedia bez oznaczenia źródła jako dostępnego wisi w stanie „łączenie”. Na aucie jeszcze niesprawdzone.
- Czego jeszcze nie ma: YouTube nadal gra przez `jap-ridetube-d` (odtwarzacz BMW, gotowe pliki) — nic w nim nie zmieniono; RDP i pozostałe moduły nie są podłączone do G21 Audio; jest jeden strumień naraz (przeglądarka albo AirPlay); nie ma sekcji „G21 Audio” w ustawieniach.

## 0.1.143

- Przeglądarka: film nie powinien już kończyć się po chwili komunikatem odtwarzacza „Coś poszło nie tak”. Odczyt z auta: domyślne urządzenie dźwiękowe ALSA to kanał zestawu głośnomówiącego (`hw:0,0`, `root:audio`), którego użytkownik silnika nie może otworzyć, a samo wyciszenie (`--mute-audio`) nadal próbowało je otwierać. Narzędzie `g21-browser` 0.1.7 uruchamia silnik z `--disable-audio-output` (sztuczne wyjście dźwięku, zegar filmu działa dalej). Przyczyna wskazana odczytem konfiguracji auta; skutek poprawki na aucie jeszcze niesprawdzony. Dźwięku stron nadal nie ma.

## 0.1.142

- Menu główne: ostatnia pozycja „Przeglądarka” to teraz „Aplikacje”. W środku: Przeglądarka, YouTube (ten sam co w menu głównym) i Ustawienia. Pozostałe pozycje menu głównego i ich kolejność bez zmian. Sklep z aplikacjami jest przewidziany na później.
- Przeglądarka na zegarach i na HUD: Aplikacje > Ustawienia > „Zegary” i „HUD” (włącz/wyłącz, zapamiętane). Strona idzie na te same warstwy cluster-render co AirPlay i YouTube, w rozmiarze profilu KOMBI i w miejscu ustawionym w „Pozycja”; najwyżej 8 obrazów na sekundę, bo każdy jest czytany i skalowany na procesorze. AirPlay i film z YouTube mają pierwszeństwo (jeden obraz naraz). Po zamknięciu przeglądarki jej obraz znika z zegarów i HUD. Środek pokazuje przeglądarkę zawsze — tam się ją obsługuje.
- Aplikacje > Ustawienia, reguły silnika (zapisywane przez narzędzie w `state/policy.json`): „Jakość obrazu” 100% / 75% / 50% (zmiana uruchamia silnik ponownie na tej samej stronie), „Piaskownica” pytaj / wymagana, „Limit pamięci” 600 / 900 / 1200 / 1500 MB. Wyłączenia piaskownicy i reguł sieci nie da się ustawić z menu — tylko w pliku reguł. Narzędzie `g21-browser` 0.1.6 (polecenie `policy`, reguły w stanie demona).
- Sprawdzone na aucie (odczyt logów, 0.1.141 / 0.1.5): silnik działa w piaskownicy przez pomocnika setuid, bez pytania. Nowe menu, zegary i HUD dla przeglądarki oraz ustawienia: sprawdzone testami lokalnie i na Ubuntu 18.04 z jądrem 4.14.195, na aucie jeszcze nie.

## 0.1.141

- Przeglądarka działa w piaskownicy Chromium także na aucie. Jądro MGU nie ma przestrzeni nazw użytkownika, więc narzędzie `g21-browser` 0.1.5 niesie pomocnika piaskownicy Chromium (`g21-chrome-sandbox`: niezmienione źródła Chromium 153.0.8010.12 z `sandbox/linux/suid`, zbudowane statycznie na Ubuntu 18.04; źródła w `native/g21-browser/sandbox-src`). Demon kładzie go obok silnika jako plik roota z bitem setuid (4755), tak jak wymaga tego Chromium. Procesy stron dostają osobną przestrzeń PID i sieci oraz filtr seccomp. Pytanie „Uruchom bez piaskownicy” pojawia się już tylko wtedy, gdy piaskownica mimo to nie wstanie.
- Reguły przeglądarki w jednym pliku: `/var/opt/g21-browser/state/policy.json` (wzór: `policy.example.json` w narzędziu). Klucze: `sandbox` (`ask` — domyślnie, `required` — nigdy bez piaskownicy, `off` — zawsze bez, bez pytania), `picture` (1, 0.75, 0.5), `memoryLimitMb` (300–3000), `network.blockPrivate` i `network.allow` (wyjątki „adres:port” dla adresów lokalnych, np. narzędzia w aucie), `gpu` (na razie tylko `off`). Plik jest czytany przed każdym startem silnika; wartość spoza listy zostaje przy domyślnej, a log i `/run/g21-browser/policy.json` (reguły obowiązujące, do odczytu) mówią, co odrzucono.
- GPU: silnik nadal rysuje na procesorze. Sprawdzone, dlaczego nie da się tego przełączyć: binarka silnika wymaga funkcji `gbm_bo_get_fd_for_plane`, której `libgbm` auta (Mesa 19.0.6) nie ma, a nasze `libgbm` (Mesa 25) nie pasuje do `libEGL` auta.
- Sprawdzone: pełny test na Ubuntu 18.04 z jądrem 4.14.195, w tym start silnika w piaskownicy przy wyłączonych przestrzeniach nazw użytkownika (jak na aucie). Na aucie jeszcze niesprawdzone.

## 0.1.140

- Przeglądarka: obraz nie zamiera po włączeniu pełnego ekranu w odtwarzaczu. Na aucie (0.1.139) silnik zaczynał wtedy wysyłać klatki w innym rozmiarze, a dekoder nie mógł podmienić pliku obrazu należącego do roota (253 razy „Operation not permitted”), więc ekran stał. Narzędzie `g21-browser` 0.1.4: ekran, który widzi strona, ma rozmiar jej okna, więc pełny ekran wypełnia obszar strony; gdy rozmiar klatki jednak się zmieni, demon usuwa stary plik i dekoder tworzy nowy.
- Pełny ekran odtwarzacza = cały obszar strony pod paskiem (pasek przeglądarki zostaje). W tym trybie silnik rysuje jeden piksel na piksel CSS, więc film mniej obciąża procesor.
- Lżejszy obraz: strona jest rysowana w 75% pikseli ekranu (np. 1332×396 zamiast 1788×546 przy 150%), a renderer skaluje ją na GPU do tego samego miejsca. To 56% pikseli do narysowania, zakodowania i zdekodowania na procesorze auta. Układ strony i dotyk się nie zmieniają.
- Dźwięk stron jest nadal wyłączony (silnik startuje z `--mute-audio`); wyprowadzenie go na głośniki auta to osobna praca. Filmy z YouTube z dźwiękiem: pozycja „YouTube” w menu.
- Sprawdzone: pełny test na Ubuntu 18.04 z jądrem 4.14.195 na prawdziwym silniku Google, w tym nowy test pełnego ekranu. Na aucie jeszcze niesprawdzone.

## 0.1.139

- Przeglądarka: widać stronę. Na aucie (0.1.138) renderer odrzucał plik obrazu strony („is not the app's (owner uid 12710)”), bo zapisywał go użytkownik silnika, i pod paskiem było puste tło. Narzędzie `g21-browser` 0.1.3 przejmuje plik na roota zaraz po utworzeniu; dekoder pisze dalej przez otwarty uchwyt.
- Przeglądarka: cały ekran mieści się w obszarze dotyku aplikacji (od 104,88; strona 1796×548). Wcześniej pasek był rysowany od rogu ekranu, gdzie dotyk należy do iDrive: stuknięcie w „Menu” trafiało do HMI i renderer zamykał aplikację.
- Po zamknięciu powierzchni przez renderer (dotknięcie HMI) i powrocie aplikacja znów się pokazuje i reaguje na dotyk. Wcześniej rysowała klatki, ale nie zgłaszała się rendererowi ponownie.
- Piaskownica: zgoda na pracę bez niej obowiązuje tylko do zamknięcia przeglądarki; każde otwarcie pyta ponownie i nic nie jest zapisywane na dysku (plik `state/sandbox` z 0.1.2 jest usuwany). Ustalone na aucie: jądro 4.14.198-apl nie ma przestrzeni nazw użytkownika, więc piaskownica Chromium wymaga pomocnika setuid — to następny krok.
- Rozmiar okna silnika jest dobierany do powiększenia tak, żeby obraz miał całe piksele, szerokość podzielną przez 4 i parzystą wysokość (np. 1788×546 przy 150%); aplikacja rysuje go w rzeczywistym rozmiarze.
- Sprawdzone: pełny test na Ubuntu 18.04 z jądrem 4.14.195 (prawdziwy silnik Google). Na aucie potwierdzone wcześniej: pobranie i start silnika. Nowe poprawki na aucie jeszcze niesprawdzone.

## 0.1.138

- Przeglądarka nie wyłącza już sama piaskownicy silnika. Gdy system auta na nią nie pozwala (albo silnik z nią nie wstaje), ekran pokazuje „System auta nie pozwala na piaskownicę silnika” i przycisk „Uruchom bez piaskownicy”. Dopiero stuknięcie uruchamia silnik bez niej; wybór jest zapamiętany (`state/sandbox`). „Odśwież” próbuje ponownie z piaskownicą. Wcześniej narzędzie przechodziło na pracę bez piaskownicy bez pytania.
- Narzędzie `g21-browser` 0.1.2, poprawki wzięte z porównania z projektem `pllanaio/mgu-browser` (działa na prawdziwym ID7): `--password-store=basic` i `--use-mock-keychain` (stały magazyn szyfrowania ciasteczek, żeby logowania nie znikały po ponownym uruchomieniu), `--disable-smooth-scrolling` (przewijanie pokrętłem bez dziesiątek klatek pośrednich).
- Do bibliotek narzędzia doszły `librt.so.1` i `libresolv.so.2` z tego samego pakietu libc6 2.39-0ubuntu8.9 co reszta, żeby silnik nie sięgał po nie do bibliotek auta.
- Na aucie nadal niesprawdzone. Sprawdzone lokalnie na prawdziwym silniku Google (WSL, jako root): cały łańcuch i nowe pytanie o piaskownicę.

## 0.1.137

- Przeglądarka: naprawione pobieranie silnika. Narzędzie `g21-browser` 0.1.0 miało w `engine/manifest.json` sumę SHA-256 kopii silnika, która różniła się od pliku Google (607 bajtów w czterech miejscach), więc auto odrzuciłoby pobrany silnik z błędem „zła suma SHA-256” i przeglądarka by się nie otworzyła. `g21-browser` 0.1.1 ma manifest zrobiony z prawdziwego pliku Google (Chrome for Testing 153.0.8010.12). Sprawdzone lokalnie na tym pliku: pobranie, sumy, start z piaskownicą, dotyk, klawiatura, przewijanie, nawigacja, zoom. Na aucie nadal niesprawdzone.

## 0.1.136

- Nowa pozycja „Przeglądarka” na końcu menu głównego (pozostałe pozycje i ich kolejność bez zmian). Otwiera przeglądarkę internetową na środkowym ekranie. Na górze pasek: Menu (powrót), wstecz, dalej, odśwież (w trakcie ładowania: zatrzymaj), strona startowa, pole adresu z tytułem strony, klawiatura, Enter, A– i A+ (powiększenie 100, 125, 150, 175, 200%) oraz „Wyłącz aplikację”. Pod paskiem strona w pełnej rozdzielczości 1920×636.
- Sterowanie: dotyk działa jak w telefonie (stuknięcie, przeciąganie przewija). Pokrętło przewija stronę, przechylenie w lewo i w prawo to wstecz i dalej, naciśnięcie otwiera pole adresu. W polu adresu można wpisać adres albo szukane słowa (Google). Stuknięcie w pole tekstowe strony otwiera klawiaturę THEiPlay z tym, co pole już zawiera; pole hasła jest zakryte gwiazdkami. Klawiatura ma dla przeglądarki nowy układ ze znakami adresu (@ . - / : ? = & % # _ + ! ,); polskie litery są pod długim przytrzymaniem a, c, e, l, n, o, s, z.
- Silnik to nowe narzędzie `g21-browser` 0.1.0: oficjalny Google Chrome for Testing 153.0.8010.12 (chrome-headless-shell). Silnika nie ma w repozytorium: przy pierwszym otwarciu przeglądarki auto pobiera go prosto z serwera Google (około 100 MB, ekran pokazuje procenty), a narzędzie przyjmuje go tylko wtedy, gdy każdy plik ma sumę SHA-256 zapisaną w `engine/manifest.json`. Silnik używa wyłącznie własnych bibliotek z narzędzia (własny loader i glibc), nie rusza bibliotek MGU.
- Obraz strony nie przechodzi przez aplikację: dekoder `g21-webframe` zapisuje klatki do `/dev/shm/mgu-video-g21browser`, a renderer rysuje je warstwą wideo (ta sama droga co YouTube i AirPlay).
- Bezpieczeństwo: silnik, jego proxy i dekoder działają jako osobny użytkownik bez uprawnień (nie root). Cały ruch idzie przez własne proxy, które pyta serwery DNS uplinku i odmawia adresów lokalnych, prywatnych i sieci Tailscale, więc strona internetowa nie sięgnie do usług wewnątrz auta. Silnik nie ma dostępu do szyny D-Bus auta. Pobieranie plików jest wyłączone, dźwięk stron jest wyciszony. Gdy silnik przekroczy 900 MB pamięci, narzędzie go zatrzymuje. Po wyjściu z przeglądarki silnik wyłącza się po 90 s, po „Wyłącz aplikację” od razu.
- Niesprawdzone na aucie (auto było offline): start silnika na jądrze 4.14 MGU, pobranie silnika przez uplink, wolne miejsce w `/var/opt` (potrzeba około 450 MB na czas instalacji, potem około 250 MB), szybkość na procesorze MGU, kolory obrazu (plik `state/color`: 601, 709 albo full), warstwa wideo o szerokości 1920.

## 0.1.135

- Ostatnia klatka nie zostaje już na ekranach. AirPlay: gdy iPhone się rozłączy, a AirPlay w aucie dalej czeka na następne połączenie, obraz znika ze środka, z zegarów i z HUD (wcześniej zostawał do wyłączenia AirPlay w menu). Narzędzie 0.1.53 kończy wtedy g21-yuvring i usuwa klatki, a aplikacja patrzy też na stan klienta (`mirroring` → cokolwiek innego). YouTube: film zatrzymany, zakończony albo z błędem znika z zegarów i HUD (plik dekodera zostaje z ostatnią klatką, więc o tym, czy film gra, mówi teraz odtwarzacz); wyłączony ekran YouTube znika od razu, także gdy AirPlay ma ten sam ekran zapisany w ustawieniach.
- Narzędzie 0.1.53 nie obciąża już systemu szukaniem procesów. Wersje 0.1.51 i 0.1.52 uruchamiały `tr` dla każdego procesu przy każdym szukaniu (kilkaset procesów, kilka szukań na sekundę, także przy wyłączonym AirPlay). Teraz wiersz poleceń czyta wbudowane `read` powłoki, a sprzątanie osieroconych procesów jest raz na 20 obrotów pętli albo wtedy, gdy narzędzie samo coś zatrzymuje.
- Nowy wygląd całego menu. Menu rysuje teraz tymi samymi poleceniami renderera i tą samą czcionką Ubuntu co ekran YouTube: zaokrąglone karty z cieniowaniem, ikony z linii, prawdziwe litery z polskimi znakami. Klatka menu ma około 100 poleceń i 5 kB zamiast około 2000 prostokątów i 50 kB. Opcje i ich kolejność są bez zmian. Napis na ekranie („Czcionka: Pixel”) zostaje czcionką pikselową.
- Ekran YouTube ma kolory THEiPlay (ciepła czerń, kremowy tekst, bursztynowy akcent zamiast różu i niebieskiego), mówi po polsku (albo po angielsku, gdy THEiPlay jest ustawiony na angielski) i wszędzie nazywa się YouTube, nie RideTube. Arkusz ustawień YouTube też.
- Poprawki logiki interfejsu:
  - Okienko „Gdzie pokazać” jest modalne: dotknięcie miejsca, gdzie pod nim leży „Wyłącz aplikację”, strzałki albo „wstecz”, zamyka okienko, a nie aplikację.
  - Suwaki (Poziomo, Pionowo, Rozciągnięcie, Wielkość) da się ustawić samym palcem: po uzbrojeniu suwaka dwa przyciski w stopce stają się – i +, a przytrzymane powtarzają krok. Wcześniej strzałki wychodziły z suwaka.
  - Kod AirPlay jest duży, na karcie po prawej stronie strony AirPlay (był tylko mały „PIN 1234” w stopce). Gdy AirPlay czeka na iPhone'a, w tym miejscu jest krótka instrukcja połączenia z nazwą auta.
  - Strzałki w stopce pokazują górę i dół (lista biegnie w dół), na stronach z dwoma kaflami lewo i prawo. Obok listy jest pasek przewijania zamiast napisów „w gore” i „dalej”.
  - Przyciski Ekrany i Start/Stop w nagłówku mają 44 px wysokości (było 28). Ekrany pokazuje trzema kropkami, które ekrany są wybrane.
  - Podpowiedź przy „Zakończ” mówi, co się dzieje („iPhone połączony”, „czeka na iPhone”, kod), a nie „bez kodu / czekaj iPhone” także w trakcie lustra. Stany mają polskie znaki („błąd lustra”, „iPhone łączy”, „AirPlay działa”); „sukces” to teraz „połączono”, „offline” to „wyłączony”.
  - W okienkach „Gdzie pokazać” pokrętło działa też wychyleniem: lewo i prawo po kaflach, w dół na przycisk.
  - Okno ekranu Stream nie nachodzi już na nagłówek.
- Podglądy ekranów bez auta: `node tools/preview_ui.js` zapisuje PNG każdego ekranu do `dev-logs/preview`.

## 0.1.134

- Nowa klawiatura: układ jak w telefonie (cyfry na górze, litery, polskie litery, na dole Aa, szeroka spacja, usuń, anuluj, OK), zaokrąglone klawisze na ciemnej tacy, większe litery, pole tekstu z kursorem i licznikiem znaków („7 z 16”), kropka na klawiszach z polskimi odpowiednikami. Zaczyna od litery q, nie od cyfry. Pod klawiaturą nie ma już paska ze strzałkami.
- Pokrętło w klawiaturze: obrót jak dotąd przesuwa po kolei, a wychylenie w górę i w dół przechodzi do klawisza nad i pod (w tym samym miejscu rzędu, rzędy się zawijają), w lewo i w prawo do sąsiedniego klawisza w rzędzie. Naciśnięcie wpisuje.

## 0.1.133

- Dźwięk AirPlay, ciąg dalszy (narzędzie 0.1.52). Skrypt połączenia dźwięku (g21-audio-route.js) startował w środowisku przygotowanym dla UxPlay: z dołączonymi bibliotekami Ubuntu 18.04 przed systemowymi (LD_LIBRARY_PATH) i z g21-bind-wlan.so, który przypina każde gniazdo do adresu hotspotu iPhone'a (LD_PRELOAD, G21_BIND_IP). Przez to SOME/IP do menedżera audio BMW nie mogło działać, a dźwięk szedł do zajętego CarPlayMain, czyli była cisza. Teraz node startuje w czystym środowisku, jak usługa jap-ridetube-d. Brak skryptu albo node jest zapisywany w /var/log/g21-audio-route.log.
- Menu AirPlay już nie zacina urządzenia. Pętla stanu (co 1 s) ustawiała około 12 podpowiedzi, tytułów i stanów, a każda zmiana budowała i wysyłała całą klatkę menu. Renderer kilka razy na sekundę przerysowywał warstwę nad obrazem AirPlay. Teraz menu maluje się raz na obrót pętli zdarzeń, tylko gdy coś się zmieniło, a identycznej klatki nie wysyła drugi raz (podtrzymanie co sekundę zostaje).
- Czarny środkowy ekran po zminimalizowaniu THEiPlay i powrocie (narzędzie 0.1.52). iPhone wysyła klatkę tylko przy zmianie obrazu, a renderer po ponownym podłączeniu czekał na następną. g21-yuvring pokazuje ostatnią klatkę ponownie dwa razy na sekundę, gdy telefon stoi. Do tego rebindVideo poza ekranem Stream nie wyłącza już obrazu.
- „Wyłącz aplikację” także w YouTube (ostatnia pozycja paska po lewej, „Wyłącz”) i na ekranie Stream (Miracast, RDP, VNC; nagłówek po prawej).

## 0.1.132

- Dźwięk AirPlay (narzędzie 0.1.51). Log z auta: iPhone wysyła dźwięk (AAC-ELD), ale UxPlay nie mógł otworzyć urządzenia smartx:CarPlayMain ("Could not open audio device"): trzyma je fabryczny demon CarPlay. Do tego samo urządzenie SmartX gra dopiero, gdy menedżer audio połączy jego źródło z głośnikami. Nowy g21-audio-route.js robi to tak jak RideTube (CommandControl.connect, przy końcu disconnect): wolne źródło CarLifeMedia (287), potem AndroidAutoMedia (273), do wyjścia 1024. Log: /var/log/g21-audio-route.log.
- UxPlay używa systemowej libasound auta (/usr/lib/libasound.so.2), dla której zbudowano wtyczkę SmartX, a nie dołączonej z Ubuntu 18.04.
- Narzędzie nie używa już pgrep/pkill (ten BusyBox ich nie ma): UxPlay, avahi, g21-present, g21-rdp i g21-mice są szukane i zatrzymywane przez /proc. Wcześniej stare procesy zostawały i obciążały system.

## 0.1.131

- Naprawa migania wszystkich ekranów przy AirPlay (narzędzie 0.1.50). Na aucie widać było setki procesów g21-yuvring: ten BusyBox nie ma pgrep, więc narzędzie nie widziało już działającego i co sekundę uruchamiało nowy. Każdy nowy podmieniał plik obrazu (miganie) i dokładał pracę procesorowi (obciążenie ~48). Teraz narzędzie pamięta PID i szuka po /proc, a g21-yuvring nie uruchomi się drugi raz (blokada pliku).

## 0.1.130

- Zegary i HUD przy AirPlay: najwyżej 24 klatki na sekundę. Klatkę w rozmiarze profilu Zegary i HUD robi g21-yuvring (narzędzie 0.1.49) prosto z dekodera, raz na klatkę; aplikacja czyta już tylko tę małą klatkę (np. 240x108 zamiast 1080x498) i wysyła ją bez skalowania. Bez zegarów i HUD g21-yuvring tej klatki nie robi.

## 0.1.129

- AirPlay płynnie jak RideTube: nowy program g21-yuvring w narzędziu (0.1.48) wkłada każdą klatkę z AirPlay, zmniejszoną do profilu Ekran centralny, prosto do pliku, z którego rysuje ekran środkowy — tak jak dekoder YouTube. Na środek żadna klatka nie przechodzi już przez aplikację. Zegary i HUD dostają klatki jak dotąd.
- Pełny ekran AirPlay: całe menu przykryte czarnym tłem, widać tylko obraz. Dotknięcie ekranu (albo pokrętło) pokazuje na 4 s przycisk Wyjdź z trybu pełnoekranowego. Pełny ekran nie zapisuje się już jako okno 1920x720 — po wyjściu z aplikacji i powrocie był tylko czarny ekran; zapisane tak okno wraca do 640x360.
- Przyciski Pełny ekran i Pozycja nad oknem AirPlay: jeden rozmiar, w jednym rzędzie, wyrównane do prawej krawędzi okna.

## 0.1.128

- Bezpieczeństwo: hasło RDP nie jest już zapisane w kodzie aplikacji (repozytorium jest publiczne). Hasło zapisane wcześniej w aucie zostaje; nowe wpisuje się raz w menu (Hasło RDP) albo w panelu konfiguracji.
- AirPlay → nowa opcja AirPlay Sound: po włączeniu odbiornik AirPlay działa tylko z dźwiękiem, bez obrazu (iPhone wybiera auto jako głośnik: Centrum sterowania → AirPlay). Przełączenie restartuje odbiornik w narzędziu, wybór się zapisuje. Ekran AirPlay mówi wtedy, jak wysłać dźwięk, zamiast czekać na obraz. Narzędzie g21-airplay-open 0.1.47.

## 0.1.127

- AirPlay płynny: iPhone nie trzyma się rozmiaru 600x400 i wysyła swój (na aucie: 1080x498 poziomo, 332x720 pionowo). Takie klatki były dotąd zwalniane do ~8/s (a wcześniej odrzucane), stąd klatkowanie. Teraz każda klatka idzie dalej i jest zmniejszana do profilu Jakość obrazu (Ekran centralny; zegary i HUD do profilu Zegary i HUD). Duża klatka nie wstrzymuje już też obrazu na zegarach i HUD.

## 0.1.126

- AirPlay po obróceniu telefonu: nowy rozmiar obrazu idzie do nowego pliku dla renderera (rename), a nie przez ucięcie pliku, który renderer właśnie czyta — to mogło zacinać obraz i zrywać połączenie z ekranem. Klatka większa niż profil Ekran centralny (np. w trakcie obrotu) nie jest już odrzucana (obraz stawał): idzie wolniej (do ~8/s) i jest zmniejszana do profilu. Zegary i HUD zostają wtedy na ostatnim obrazie zamiast gasnąć. Każda zmiana rozmiaru klatki trafia do dziennika startu (air-frame WxH).

## 0.1.125

- Jakość YouTube w RideTube to ta sama Jakość obrazu co w menu THEiPlay: gdy film jest na środku, dekoder robi obraz w profilu Ekran centralny (600x400 → film 600x336), gdy tylko na zegarach i HUD — w profilu Zegary i HUD (np. 240x180 → 240x132). Film pobiera się w najniższej jakości YouTube, która to pokrywa (360p/480p/720p). Na zegary i HUD klatka idzie zawsze w profilu Zegary i HUD. W RideTube jakość jest tylko pokazana (odtwarzacz i ustawienia), zmienia się ją w menu THEiPlay; zmiana działa od następnego filmu.

## 0.1.124

- YouTube w menu THEiPlay najpierw otwiera okienko „Gdzie pokazać”: kafelki Zegary, HUD i Środek (włącz/wyłącz), na każdym pozycja ustawiona w menu Pozycja THEiPlay. Przycisk Otwórz YouTube uruchamia RideTube; dotknięcie obok okienka wraca do menu.
- Odtwarzacz RideTube ma z lewej dwa przyciski: Wyświetl na zegarach i Wyświetl na HUD (włącz/wyłącz w trakcie filmu; wybór się zapisuje).

## 0.1.123

- YouTube to teraz prawdziwy ekran RideTube (kod RideTube przeniesiony do THEiPlay): przeglądanie z miniaturami, półki Home, Subskrypcje, Do obejrzenia, kanały, odtwarzacz z obrazem na całym ekranie (przewijanie, -10/+10 s, rozdziały, SponsorBlock), logowanie kodem z QR i ustawienia RideTube (jakość domyślnie 480p, Na zegarach, Na HUD, obraz na środku). Układ jak w RideTube, bez rozciągania.
- Szukaj w RideTube otwiera klawiaturę THEiPlay (pokrętło/dotyk); po wpisaniu wracają wyniki.
- Pierwsza pozycja z lewej w RideTube: THEiPlay — powrót do menu THEiPlay. Film gra dalej (dźwięk, zegary, HUD) do Stop albo Wyłącz aplikację. Wstecz pokrętłem na krawędzi też wraca do THEiPlay.
- Licencja THEiPlay: GPL-3.0-or-later (kod RideTube); autorzy i licencje części w NOTICE.md.

## 0.1.122

- Jakość obrazu → Zegary i HUD ma nowy profil 240x180 (niska, 4:3). Film 16:9 mieści się w nim jako 240x132, obraz 4:3 wypełnia całe 240x180. Gdy YouTube idzie tylko na zegary i/lub HUD (środek wyłączony), dekoder od razu robi obraz w rozmiarze tego profilu z filmu 360p, więc aplikacja nic już nie skaluje. Zmiana ekranów w trakcie filmu liczy się od następnego filmu.
- YouTube lżej dla MGU: dekoder dostaje obraz 848x480 zamiast 1280x720, a film pobiera się w 480p zamiast 720p. Ekran centralny skaluje obraz na GPU. Na zegary i HUD idzie najwyżej 24 klatki na sekundę. Bez zegarów i HUD aplikacja czyta tylko nagłówek pliku z klatkami (64 B), a nie całą klatkę pięć razy na sekundę.
- YouTube dochodzi na zegary i HUD. Usługa YouTube zapisuje klatki filmu tylko dla siebie (0600), więc aplikacja nie mogła ich odczytać; narzędzie 0.1.46 daje temu jednemu plikowi prawo odczytu. Wybór ekranów YouTube (środek, zegary, HUD) zapisuje się i nie znika po Stop, po AirPlay ani po ponownym uruchomieniu.
- Jakość obrazu ma osobne podmenu z dwoma profilami: Ekran centralny (600x400) i Zegary i HUD (domyślnie 400x240, do wyboru 240x144, 320x192, 400x240, 480x288, 600x360). Oba zapisują się osobno; dotychczasowe ustawienia zostają 600x400 na środku, a zegary i HUD dostają 400x240.
- Na zegary i HUD idzie klatka w rozmiarze profilu zegarów (jedno skalowanie z tej samej zdekodowanej klatki, proporcje zachowane), a nie 600x400 ze środka. Rozmiar okienka nie zmienia rozdzielczości klatki.
- W prawym dolnym rogu jest Wyłącz aplikację: kończy AirPlay i YouTube, zdejmuje obraz ze środka, zegarów i HUD, zamyka gniazda i wraca do iDrive. Ponowne otwarcie startuje od nowa.
- Zegary i HUD: okno stoi tam, gdzie na środku. Róg zostaje rogiem, środek środkiem, także w kieszeni mapy i na HUD (wcześniej okno na HUD nie dochodziło do górnej i dolnej krawędzi).
- YouTube na zegarach i HUD idzie w tempie filmu, nie 5 klatek na sekundę. Po końcu filmu albo po wyłączeniu zegarów i HUD obraz z nich znika, zamiast stać tam do 10 minut.
- Przesunięcie okna przesuwa też obraz YouTube na zegarach i HUD.

## 0.1.121

- YouTube jest w tej samej aplikacji: szukanie, play, pauza i ekrany. Osobnej apki RideTube nie trzeba otwierać. Usługa jap-ridetube-d na aucie zostaje, bo to ona ściąga i dekoduje film.

## 0.1.120

- Pozycja pokazuje ramkę środka, zegarów i HUD w ich proporcjach, a w każdej widać, gdzie stanie okno.

## 0.1.119

- Naraz działa tylko jedno: włączenie AirPlay gasi YouTube, a włączenie YouTube zatrzymuje AirPlay.

## 0.1.118

- Pozycja okna jest jedna, w menu głównym, i obowiązuje AirPlay, YouTube i napis. Napis ma czcionkę, wielkość i kolor.

## 0.1.117

- W menu jest YouTube. Gdy RideTube puszcza film, obok Play jest Ekrany: obraz może iść na środek, zegary i HUD.

## 0.1.116

- W aplikacji jest Ustawienia. Domyślne renderowanie to GPU. W emulatorze ta opcja też wraca i jest pierwsza.

## 0.1.115

- Klatka menu idzie tak jak w pozostałych aplikacjach: jedna naraz, następna dopiero gdy renderer odda TICK. Szybsze wysyłanie zrzucało obraz.

## 0.1.114

- Środek idzie w rytmie ekranu, do 60 kl/s, własnymi klatkami. Zegary nie blokują już tego wątku, więc obraz się nie rozjeżdża.

## 0.1.113

- Na ekranie głównym jest Język. Polski jest domyślny, klik przełącza na angielski i z powrotem.

## 0.1.112

- Na oknie środka są Full screen i Pozycja. Pełny ekran zakrywa środek. Bez niego okienko przesuwa się dotykiem, a po kliknięciu Pozycja także pokrętłem i góra-dół.

## 0.1.111

- Zamiast trzech przycisków na pasku jest jeden: Ekrany. Otwiera okno nad resztą, a w nim kafelki zegarów, HUD i środka.

## 0.1.110

- Pokrętło chodzi po menu. Kliknięcie opcji pozycji lub rozmiaru zapala ją na czerwono i dopiero wtedy pokrętło ją ustawia. Drugi klik puszcza.

## 0.1.109

- Obraz z telefonu zostaje 600x400 przy 24 klatkach. W pozycji jest tylko rozmiar okna: rozciąga ten obraz, nie zmienia rozdzielczości. Wysokość i szerokość znikają.

## 0.1.108

- Ekrany najpierw pytają, który ekran. Opcje są dopiero w środku. Na zegarach widać, czy obraz idzie na mapę czy na cały panel.

## 0.1.107

- Pozycja pokazuje suwaki. Pokrętło je zmienia, góra i dół przechodzi między opcjami, na końcu jest Wstecz. Menu nie zapisuje ekranu przy każdym kroku.

## 0.1.106

- Film idzie w 24 klatkach. Aplikacja bierze jedną klatkę naraz i zwalnia tylko, gdy klatka jest za ciężka. Dźwięk kabiny jest taktowany osobno i jego błąd nie gasi odbiornika (narzędzie 0.1.45).

## 0.1.105

- Zegary i HUD dostają klatkę YUV na GPU, bez przeliczania kolorów w aplikacji. Obraz trzyma proporcje, a menu nie zacina się na każdej klatce.
- Pierwsza klatka nie czeka, aż iPhone zgasi i zapali ekran. Odbiornik puszcza obraz od razu (narzędzie 0.1.44).

## 0.1.104

- Obok statusu sa Srodek, Zegary i HUD. Start wlacza tylko zaznaczone ekrany.

## 0.1.103

- Pasek AirPlay jest waski, w rogu naglowka. Obraz nie ma paska ani przyciskow, a menu pod nim nie lapie dotyku.

## 0.1.102

- Zegary i HUD ida w 24 klatkach na sekunde. iPhone jest proszony o obraz 600x400, tez 24 razy na sekunde.

## 0.1.101

- Zegary i HUD maluja 30 razy na sekunde. Klatka jest mniejsza, a ekran ja powieksza, wiec obraz idzie rownym taktem.

## 0.1.100

- AirPlay nie zabiera menu. W prawym gornym rogu jest lampka online albo offline, przycisk Start/Stop i status: sukces albo konkretny blad.

## 0.1.99

- Podczas AirPlay na dole sa Srodek, Zegary i HUD. Klik otwiera suwaki pozycji, rozmiaru, wysokosci i szerokosci, a obraz zmienia sie od razu. Zapisz utrwala. Na oknie srodka sa przyciski pozycja i rozmiar: pokretlo ustawia, klik zapisuje.

## 0.1.98

- Obraz trzyma proporcje: pion i poziom sa w letterboxie. Rozmiary okna to 640x360, 960x540 i 1280x720, wszystkie 16:9. Domyslnie 640x360 na srodku.

## 0.1.97

- Wybor ekranow (srodek, HUD, zegary) zostaje po zakonczeniu AirPlay.

## 0.1.96

- Zegary i HUD odswiezaja obraz 40 razy na sekunde. iPhone jest proszony o 40 klatek.

## 0.1.95

- Zegary znowu licza kolor tak jak przed 30 FPS, czyli przez RGB, i odswiezaja sie 30 razy na sekunde.

## 0.1.94

- Zegary: kolor w formacie atlasu (wiersz U, potem V). Plaski I420 dawal fiolet i zielen.

## 0.1.93

- Zegary dostaja klatke 30 razy na sekunde. Renderer skaluje wideo sam, zamiast dostawac pelny obraz co 120 ms.

## 0.1.92

- Brak limitu predkosci. Obraz na zegarach i HUD zostaje takze w czasie jazdy.

## 0.1.91

- Zegary i HUD dostaja obraz ta sama droga co Napis. Domyslne okno jest na srodku ekranu. Pozycja wraca jako osobna lista: Srodek, wiekszy, mniejszy i cztery kierunki.

## 0.1.90

- AirPlay startuje takze bez srodkowego ekranu. W okienku, zanim przyjdzie klatka, kreci sie spinner.

## 0.1.89

- Start zostaje na liscie AirPlay, gdy sie nie uda, zamiast przeskakiwac do Ekranow. Na dole sa strzalki w lewo i w prawo oraz dotykowy przycisk Wybierz.

## 0.1.88

- Okno ustawia sie przyciskami: wiekszy, mniejszy, gora, dol, lewo, prawo i obrot o 90. Podglad ma ten sam rozmiar i pozycje co obraz na ekranie. Pokretlo tylko zaznacza wiersz.

## 0.1.87

- W nagłówku menu jest stały przycisk Wstecz i ścieżka miejsca, na przykład AirPlay > Nazwa.

## 0.1.86

- Lista w menu przewija się razem z pokrętłem i ze swipe, więc widać opcje, które nie mieszczą się na ekranie.

## 0.1.85

- Ekrany to znowu trzy pola: Środek, HUD i Zegary. Na zegarach osobno Mapa albo Panel. Okno na środku jest od razu po starcie, nie po pierwszej nowej klatce.

## 0.1.84

- Pokrętło: renderer puszcza je po 1,5 s, więc aplikacja odświeża je co pół sekundy. Start AirPlay pomija starą klatkę, a okno lustra zostawia przycisk Zakończ pod obrazem.

## 0.1.83

- Obraz AirPlay idzie jednym dekoderem do routera. Środek i zegary mają osobny zegar. Zegary domyślnie w kieszeni `map` i tylko na postoju, żeby nie chować BC. `panel` zostaje wyłączony, dopóki nie jest wybrany.

## 0.1.82

- Zegary i HUD: szerokosc obrazu wielokrotnosc 4, bo renderer odrzucal warstwe. Menu nie wysyla SHOW/CLAIM przy kazdym rysowaniu, przez co migalo.

## 0.1.81

- Lustro tylko na zaznaczonych ekranach. Zegary i HUD ta sama warstwa obrazu co Napis. Srodek nie dostaje obrazu, gdy jest wylaczony.

## 0.1.80

- Jakosc lustra: 720p (4 Mb/s) albo 1080p (8 Mb/s), 30 klatek. Menu nie przerysowuje sie co pol sekundy, gdy AirPlay jest wylaczony.

## 0.1.79

- Lustro: obraz tylko przez renderer GPU. Bez warstwy g21-present i bez przeliczania BGRA, które zjadalo pamiec i gasilo aplikacje.

## 0.1.78

- Menu: strona glowna AirPlay/Napis, Start od razu, ekrany po nazwie. Okno znowu reaguje. Lustro zostaje na ekranie czekania i rysuje klatke, gdy iPhone ja przysle.

## 0.1.77

- AirPlay: klatki I420 ida do menu jako wideo mgu-render, zeby lustro bylo widac na srodku.

## 0.1.76

- Okno: Wielkosc (pokretlo, proporcje, podglad) i Pozycja (strzalki, OK wychodzi).

## 0.1.75

- Menu: lista w cieplym graficie zamiast niebieskich kafelkow.
- Klawiatura: przytrzymanie wstawia polski znak, nie litere bazowa.
- Srodek: okno AirPlay plywajace, pasek tytulu przeciagany palcem.

## 0.1.74

- AirPlay: lustro na Srodek, Zegary i HUD naraz; okno z pozycja i rozmiarem na kazdym (tool 0.1.36 trzyma present, gdy lista zawiera central).

## 0.1.73

- AirPlay: w menu przełącznik Kod / Bez (tool 0.1.35 czyta `/run/g21-session/airplay-auth`); domyślnie bez kodu jak na kkds.
- Menu: świeższy layout (siatka 2 rzędy, pasek statusu, nowe kolory/ikony lock).

## 0.1.72

- AirPlay + tool 0.1.34: status klienta (`/run/g21-airplay/client`); nft 7400–7499; restart UxPlay po sticky mirror-port i po rozłączeniu (lekcja z kkds).

## 0.1.71

- Rebrand na THEiPlay; tylko AirPlay (bez Miracast/RDP/VNC); HUD wyłączony (brak przycisku, domyślnie central).

## 0.1.70

- AirPlay: okno Stream pokazuje kod + nazwe/siec/ekran; tool 0.1.29 `-pw` (haslo na iPhonie) i nie kasuje pliku PIN.

## 0.1.69

- AirPlay: PIN przy kazdym polaczeniu iPhone (tool 0.1.27 `-pw` + `/run/g21-airplay/pin`); duzy kod na ekranie stream; twardsze `getEntryPoints` (bez `.find`).

## 0.1.68

- Menu: wersja builda (`v0.1.68`) w prawym górnym rogu ekranu.

## 0.1.67

- AirPlay: obraz przez `G21_YUV` → g21-present (środek) / cluster-render (zegary/HUD); wybór ekranu jak RDP; tool 0.1.26 `-vs fakesink` + present.

## 0.1.66

- AirPlay: tool 0.1.25 — reguły mDNS/AirPlay wstawiane do `inet mgu_uplink` (osobna tabela nft: `accept` w `g21_airplay` nie blokuje dropu Store).

## 0.1.65

- AirPlay: tool 0.1.24 — trasa `224.0.0.251/32` na Wi-Fi Store + nft OUTPUT (mgu_uplink dropował mDNS root na wlan0 → iPhone nic nie widział).

## 0.1.64

- AirPlay: tool 0.1.23 — health UxPlay po TCP :7401 (httpd przy `-p 7400`); UDP nft 7400-7402; GST/Wayland env w `start_ux`; czekanie na listener zamiast zabijania co 3s.

## 0.1.63

- AirPlay: tool 0.1.22 — nie dubluj avahi (run-elf + recover PID); nie zabijaj avahi przy zmianie stamp; health UxPlay po porcie :7400.

## 0.1.62

- AirPlay: tool 0.1.21 — DNS-SD przez avahi/`libdns_sd.so.1` (BMW Bonjour dawal kDNSServiceErr_Unknown = „brak dns”).

## 0.1.61

- RDP: nie nadpisuj statusu FreeRDP; czekaj na wolne `frame.sock` (Zegary/HUD); tool 0.1.20 — petla 1s, stop present + logi SOCKS5.

## 0.1.60

- AirPlay: narzedzie 0.1.19 — `g21-detach` zamiast BusyBox `setsid` (na MGU applet nie istnieje → UxPlay w ogole nie startowal).

## 0.1.59

- RDP/VNC: wyjscie na Tailscale (`100.64/10`) przez SOCKS5 `127.0.0.2`; narzedzie 0.1.18 wlacza `socks5-port` Tailscale.

## 0.1.58

- RDP: Zegary/HUD bez Vehicle2 (odmowa tylko przy znanej jezdzie); narzedzie 0.1.17 — `g21-rdp` bez SEGV na FreeRDP char*.

## 0.1.57

- RDP: zapis `allow` przed statusem; narzedzie 0.1.16 robi `chmod 666` na `g21-desktop.status` (wczesniej EACCES → connect-failed).

## 0.1.56

- RDP: po wyborze ekranu start sesji (bez blokady speed-unknown), wyjscie z pickera i stream po `connected`.

## 0.1.55

- AirPlay: narzedzie 0.1.15 — BMW mdnsd zamiast konfliktu z avahi, UxPlay odporny na SIGHUP, status tylko przy TCP 7400.

## 0.1.54

- RDP: klient bez WL-odbiornika; Polacz → wybor ekranu (Srodek / Zegary / HUD); narzedzie 0.1.14 bez present na cluster/HUD.

## 0.1.53

- Cluster label: napis AIRPLAY na `panel` (zegary 0x203), nie na `map`; HUD bez zmian.

## 0.1.52

- Odbiorniki: root hints AirPlay/Miracast/RDP/VNC; RDP i VNC maja `WL`/`WYL` jak AirPlay (start pulpitu z aktywnego profilu).

## 0.1.51

- RDP: wymuszony `Profil 1` / `p1` z IP 100.89.166.19, kontem i haslem (nadpisuje stare p1).

## 0.1.50

- Cluster/HUD: napis `AIRPLAY` na `map`+`hud` (domyslnie WL); kafelek `WL`/`WYL` w menu glownym.

## 0.1.49

- RDP: wbudowany profil `PC` (100.89.166.19 / thexozzz@gmail.com) z haslem seedowanym przy pierwszym starcie.

## 0.1.48

- Dotyk ID7: stale pozycje kafelkow + wieksze hitboxy + aktywacja na uniesieniu palca (wczesniej tapy mijaly przesuwany carousel).

## 0.1.47

- Font bitmap: brakujace glify `h/j/q/v` i `F/J/Q/X/Y/Z` (hint „iPhone” i kafelek `WYL`).

## 0.1.46

- Root: osobne funkcje AirPlay / Miracast / RDP / VNC; przełączniki `WL`/`WYL` wg aktywnej sesji; Miracast po wykryciu PC sam łączy (auto-accept).

## 0.1.45

- Windows: DNS-SD `container_id` pod Win11; menu Urzadzenia z ofertami SOURCE_READY; klik startuje stream (narzedzie 0.1.13).

## 0.1.44

- Windows/Miracast: Wlacz bez czekania na predkosc (jak AirPlay); brak Vehicle2 nie blokuje juz Win+K.

## 0.1.43

- Ikona listy: tekst AirPlay na przezroczystym tle (64px); nazwa w menu KK-remoteIN; mniejsze ikony kart w menu.

## 0.1.42

- Naprawa na MGU: zapis ustawien w data OAP (bez EACCES /var/opt); wymaga narzedzia 0.1.12 (UxPlay -p 7400 poza CarPlay, biblioteki GST net/rtp/mpegts).

## 0.1.41

- AirPlay i Windows: jeden przełącznik Włacz/Wylacz zamiast Start/Stop; po zestrojeniu ekran stream z Zakoncz.

## 0.1.40

- RDP/VNC: profile (Dodaj/Edytuj/Usun), naprawa CLAIM/dotyku menu, czytelniejszy blad zapisu panelu WWW.

## 0.1.39

- Menu Windows (Win+K / MS-MICE): emisja z PC obok AirPlay/RDP/VNC; jedna sesja naraz; wymaga narzedzia 0.1.11.

## 0.1.38

- Klawiatura pokretlem jak w iDrive: IP, port, konto, haslo i nazwa AirPlay wpisuje sie na narysowanej klawiaturze (obrot = znak, OK = wybierz).

## 0.1.37

- AirPlay to integracja lustra, nie osobna aplikacja UxPlay: statusy i menu mowia AirPlay/lustro; silnik zostaje tylko w backendzie.

## 0.1.36

- Narzedzie 0.1.10: UxPlay bez `-fs` (MGU waylandsink nie ma fullscreen) — naprawa wykrywania G21 na iPhonie.

## 0.1.35

- Pelne rozdzielenie AirPlay/RDP/VNC: osobne ekrany, prefiksy akcji, osobne statusy; `brak dns` tylko przy aktywnej sesji AirPlay; VNC ma wlasne menu.

## 0.1.34

- Narzedzie 0.1.9: avahi conf bez `user=`/`group=` — log MGU `Invalid configuration key "user"` blokowal DNS (nie firewall).

## 0.1.33

- Menu RDP osobne end-to-end: Polacz/Rozlacz/IP/Port/Konto/Haslo/Cert/WWW; ikony nie gina przy zmianie ekranu; pokretlo edytuje IP i port; status RDP bez tekstow AirPlay.

## 0.1.32

- Narzedzie 0.1.8: usuniete `group=` z conf avahi (log: Invalid configuration key) — naprawa `brak dns`.

## 0.1.31

- Menu to nowoczesne karty z grafikami opcji (ikony AirPlay, RDP, Start/Stop, siec itd.).

## 0.1.30

- Narzedzie 0.1.7: konto avahi i polityka D-Bus przez bind-mount z /run (rootfs tylko do odczytu) — naprawa `brak dns` / brak G21 w hotspocie.

## 0.1.29

- Menu AirPlay i RDP sa rozdzielone: osobny ekran, osobny status, wejscie w jeden protokol konczy drugi.
- Narzedzie 0.1.6: avahi bez `--daemonize=no`, D-Bus dla DNS-SD (naprawa `brak dns`).

## 0.1.28

- Menu to poziomy wiersz baniek z nazwami opcji; pokretlo przesuwa wybor.

## 0.1.27

- Start AirPlay pokazuje UxPlay start zamiast mylacego AirPlay idle. Narzedzie odpala binarki przez linker /lib.

## 0.1.26

- Wejscie w RDP otwiera menu z Host/User oraz panel konfiguracji na porcie 1235 (IP, user, haslo).

## 0.1.25

- Wejscie w AirPlay otwiera osobne menu: Start, Stop, Nazwa, Siec i Wstecz.

## 0.1.24

- iPhone moze byc hostem hotspotu. Narzędzie dostarcza avahi, zeby Lustro ekranu widzialo G21.

## 0.1.23

- AirPlay oglasza sie na Wi-Fi auta. Sam hotspot iPhone nie wystarcza do wykrycia G21 w Lustrze ekranu.
- Status pod menu mowi `podlacz do auta`, gdy uplink to Personal Hotspot telefonu.

## 0.1.22

- Narzędzie AirPlay dostarcza UxPlay. Poprzednia instalacja miała tylko skrypt, więc ekran pokazywał UxPlay brak.

## 0.1.21

- Rysunek nie jest zrywany po fałszywym X_STATE. W 0.1.20 pierwsza klatka padała zaraz po starcie.

## 0.1.20

- Po wyjściu zrywa powierzchnię renderera. Samo schowanie klatki zostawiało menu na iDrive.

## 0.1.19

- Po wyjściu z aplikacji rysunek znika. Pokrętło i dotyk działają w menu tylko, gdy aplikacja jest z przodu.

## 0.1.18

- Klatka menu idzie co sekundę. Po ciszy renderer chował powierzchnię i ekran gasł.

## 0.1.17

- Rysunek wraca na cały ekran, bo węższe pole nic nie pokazało. Kolumna wstecz zostaje pusta, bez przejęcia pokrętła.

## 0.1.16

- AirPlay startuje bez prędkości i nie jest gaszony w jeździe.

## 0.1.15

- Rysunek nie zakrywa kolumny wstecz i nie przejmuje pokrętła. Po wejściu da się wrócić do iDrive.

## 0.1.14

- Pod menu widać stan UxPlay: start, działa, brak programu, brak Wi-Fi albo brak postoju.

## 0.1.13

- `menu_draw.js` jest na liście modułów. Bez tego Store nie buduje paczki.

## 0.1.12

- Menu jest rysowane pikselami na rendererze. Lista RHMI na tej jednostce otwiera się pusta.

## 0.1.11

- Ekran startowy to lista menu: AirPlay, RDP, VNC i Adres. Pusty obraz nie jest już stroną wejścia.

## 0.1.10

- Po starcie otwiera zmapowany punkt wejścia. W 0.1.9 proces dochodził do ready, ale strona zostawała w tle i ekran się nie zmieniał.

## 0.1.9

- Ekran jest taki jak w aplikacjach iDrive 7 na tej jednostce: obraz i pasek przycisków. Poprzedni opis HMI jednostka odrzucała jako nieprawidłowy parametr, więc AirPlay nie wstawał, a Hello było puste.

## 0.1.8

- Po starcie otwiera stronę z napisami AirPlay, RDP, VNC i Adres. Pusta strona startowa zostaje tylko podkładem.

## 0.1.7

- Start dostaje też WakeUpOnDemand, WodControl i Provisioning, tak jak MGU Store. Bez nich OnlineApp przerywa otwieranie na następnym brakującym interfejsie.

## 0.1.6

- Start wymaga interfejsu AppBookmarks. Bez pliku tego interfejsu OnlineApp przerywa otwieranie.

## 0.1.5

- Aplikacja jest zwykłym OnlineApp, tak jak aplikacje, które na tej jednostce zostają włączone. Poprzednia wersja dziedziczyła po niej i MainApp gasił proces zaraz po starcie.

## 0.1.4

- Aplikacja zgłasza się jako aktywna od razu po starcie. Bez tego MainApp na tej jednostce kończy proces, zanim otworzy się ekran.

## 0.1.3

- Pierwsza strona ma jeden obraz i pasek przycisków, tak jak aplikacje, które na tej jednostce się otwierają. Tekst statusu jest na stronie obok.

## 0.1.2

- Ekran startowy używa szablonu LT_State_Laptimer, tego samego co aplikacje, które na tej jednostce się otwierają. Limit pamięci i CPU jest taki jak u nich.
- Błąd startu dopisuje się do data/start.log.

## 0.1.1

- Włączone ładowanie ekranu i punktu wejścia. Bez tego nowszy SDK zostawia aplikację jako Installed i nie wstawia kafelka na listę aplikacji.
- Kafelek jest publiczny i wchodzi pod stan 20974, tak jak Store i Waze.
- Ekran wyboru AirPlay, RDP i VNC w tej samej aplikacji.
- Sesja pulpitu startuje tylko na postoju. Brak prędkości blokuje start, jazda rozłącza.
- VNC to klient RFB w aplikacji. RDP to `g21-rdp` (FreeRDP 2.2, GDI programowe) i obraz przez `g21-present`.
- Touchpad pokrętła nie jest symulowany. Ruch kursora czeka na prawdziwą próbkę trybu pisania.

## 0.1.0

- Odbiornik ekranu to UxPlay 1.73.7 (GPL-3.0, FDH2/UxPlay), uruchamiany tylko na Wi-Fi MGU Store.
