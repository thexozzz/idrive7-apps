# THEiPlay

## Unreleased

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
