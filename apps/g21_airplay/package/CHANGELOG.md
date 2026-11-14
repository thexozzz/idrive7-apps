# THEiPlay

## Unreleased

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
