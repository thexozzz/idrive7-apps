# Pulpit zdalny w g21_airplay

Rozszerzenie istniejącej aplikacji `g21_airplay`, nie nowa aplikacja. AirPlay i Miracast to odbiorniki (iPhone / Win+K → auto; wzorowane na [AirShow](https://github.com/zitlem/AirShow) i [lazycast](https://github.com/homeworkc/lazycast)). RDP to klient pulpitu: profil → zaznacz → Polacz → wybór ekranu (Srodek / Zegary `panel` / HUD), potem `g21-rdp` łączy się do PC. VNC też jest klientem RFB. W danej chwili działa jedna sesja — wejście w inny protokół kończy poprzedni.

## Licencje

Moonride (`JustAnotherPU/moonride`, commit `d1073cef7c5be72fbbd2cdeb441e874342ae6083`) jest na GPL-3.0-or-later. Jego kod nie został skopiowany do tego repozytorium. Z opisu sygnałów w `apps/jap_moonride/app.json` i `input.js` wynikają tylko nazwy odczytów, które tu są hipotezą dla tego G21:

- `de.bmw.infotainment.vehicle.Vehicle2` / `statusCarSpeed2`
- `de.bmw.infotainment.controlelements.FrontCCU` / `statusRotaryEncoderState`
- `de.bmw.infotainment.ControllerElements` / `ZBETouchFrontSide`

Moonride włącza touchpad zapisem `ccsControlTouchCCU = TOUCH_AKTIV` i sam opisuje skutek uboczny: po zabiciu procesu pokrętło może zostać w trybie pisania. Ten projekt tego zapisu nie wysyła. Manifest ma tylko odczyt.

Silnik AirPlay (UxPlay) zostaje na GPL-3.0 i nie jest osobną aplikacją w menu — tylko backend. Klient RDP jest własnym programem `g21-rdp` zlinkowanym z FreeRDP 2.2.0 (Apache-2.0, pakiet Ubuntu 18.04 `freerdp2`). Klient VNC jest własną implementacją RFB 3.8 w `vnc_client.js` i nie łączy LibVNC.

## Kafelek

`package/config/base.json` ma `rhmiLoadingEnabled` i `entryPointLoadingEnabled`. Nowsze SDK buduje ekran i wpis na liście aplikacji tylko z tymi flagami. Bez nich Store pokazuje Installed, a listy aplikacji nie ma. Wpis jest publiczny (`private: false`) i wchodzi pod stan `20974`, ten sam co MGU Store i Waze.

## Ekran

Widżety listy na tym G21 otwierają stronę i zostają puste. Odczyt 2026-11-12: AirPlay 0.1.11 doszedł do `state-open` z czterema `LT_Button_2Row_2Text`, a wiersze nie były widoczne. Menu jest rysowane na powierzchni renderera (`/run/mgu-renderd/renderd.sock`, potem `/run/mgu-render/render.sock`): tło, wiersze i napisy z prostych prostokątów. Właściciel potwierdził tego dnia, że te wiersze widać, gdy powierzchnia leży na całym ekranie. Zawężenie jej do pola 104,88 zgasiło rysunek. Przejęcie pokrętła zablokowało powrót. Aktualna ramka znowu jest na cały ekran, menu jest w środku, a kolumna wstecz zostaje pusta. Przejęcia nie ma. Menu ma osobne ekrany i prefiksy akcji (`air-*`, `win-*`, `stream-*`, `rdp-*`, `vnc-*`); handler ignoruje akcję z innego protokołu. Root: AirPlay / Miracast / RDP / VNC — każde wejście to osobna funkcja (osobny ekran, osobny start). AirPlay i Miracast: kafelek przełącznika `WYL`/`WL` (stan = aktywna sesja `allow=…`, nie tryb backendu), Siec, Wstecz; AirPlay ma jeszcze Nazwa. Po `WL` Miracast ogłasza sink; gdy w `/run/g21-desktop/offers` pojawi się PC, aplikacja sama zapisuje `accept` (bez drugiego kliknięcia) i po `running` przechodzi na `stream` z Zakoncz. AirPlay po `running` też na `stream`. Zakoncz zapisuje `allow=stop` i wraca do ekranu protokołu. RDP/VNC: Polacz, Stop, lista profili (kafelek wybiera aktywny), Dodaj, Edytuj (nazwa/IP/port/konto/hasło), Usun, oraz RDP: Cert/WWW. Dotyk: aplikacja wysyła `CLAIM` na cały ekran przy każdej klatce (bez bramki `front`, która na tym G21 gasła zaraz po READY). Statusy są per ekran; `brak dns` tylko przy aktywnej sesji AirPlay/Windows. Wejście w protokół kończy inne sesje i czyści nieudaną sesję tego samego typu. Pola do wpisania (nazwa AirPlay, IP/port/konto/hasło RDP, IP/port VNC) otwierają klawiaturę na rendererze w stylu iDrive: pokrętło wybiera znak, OK dopisuje albo zatwierdza, DEL kasuje, ANULUJ wraca. RHMI `LT_Speller` na tym G21 zostaje pusty, więc speller jest rysowany. Panel `:1235` zostaje jako zapas; cert: kafelek Cert. Renderer chowa powierzchnię po około trzech sekundach bez klatki. Właściciel widział menu i pasek iDrive, a potem oba zgasły. Klatka jest powtarzana, dopóki aplikacja jest z przodu. Po wyjściu powierzchnia jest zrywana (gniazdo renderera), nie tylko chowana. W przeciwnym razie ostatnia klatka zostaje nad iDrive.

## Postój

AirPlay, Windows (Win+K / Miracast) i RDP (także wyjście Zegary/HUD) startują bez próbki prędkości — na tym G21 `Vehicle2` często nie dochodzi. Gdy próbka już jest i auto jedzie, Zegary/HUD oraz sesje RDP/VNC są gaszone. VNC nadal wymaga próbki, żeby w ogóle wystartować. Usługa `g21-airplay-open` uruchamia odbiornik AirPlay (backend) przez BMW `mdnsd` albo bundlowany avahi, gdy aplikacja zapisze `airplay` w `/run/g21-session/allow` i uplink Store jest Wi-Fi. Dla `windows` startuje `g21-mice` (MS-MICE TCP 7250 + RTSP do PC + RTP 1028) i ogłasza `_display._tcp` z TXT `container_id=<GUID>` (wymóg [MS-MICE] / Win11 Win+K) — bez Wi-Fi Direct, po istniejącej sieci Store. Po SOURCE_READY oferty trafiają do `/run/g21-desktop/offers`; przy włączonym Miracast aplikacja auto-acceptuje najnowszą ofertę (menu **Urzadzenia** zostaje jako podgląd/awaryjny wybór). Potem ekran Zakoncz. iPhone może być hostem hotspotu.

## Protokoły

VNC mówi RFB 3.8 z kodowania Raw i CopyRect. Hasło, jeśli jest, czyta z katalogu danych aplikacji OAP (`…/data/g21_airplay/*.secret`, nie `/var/opt` — uid OAP nie może tam tworzyć katalogów) i nie trafia do logu ani do ustawień. Obraz idzie do gniazda `/run/g21-desktop/frame.sock`. `g21-present` kładzie go na Wayland przez ten sam GStreamer co UxPlay.

RDP to `g21-rdp` (FreeRDP, GDI programowe, 1920×720), startowany przez `run-elf` z bundlowanym `libfreerdp2`. Status `/run/g21-desktop.status` musi być zapisywalny też przez uid OAP — narzędzie 0.1.16+ ustawia `chmod 666` przy każdym `desk`/`ensure_dirs`; aplikacja zapisuje `allow=rdp` przed statusem (wcześniej root `644` dawało EACCES i `connect-failed`). Od 0.1.20 tool nie nadpisuje `connected`/`cert`/`error` z `g21-rdp` własnym `running|rdp` (to dawało „łącze” bez obrazu). Zegary/HUD: najpierw `allow=stop` i mostek na `frame.sock` dopiero gdy `g21-present` zwolni bind (wcześniej EADDRINUSE przy pętli toola co 5 s). Adresy Tailscale (`100.64.0.0/10`) idą przez SOCKS5 Tailscale (`127.0.0.2`, plik `socks5-port`) — na MGU `tailscaled` jest userspace bez trasy kernelowej; narzędzie 0.1.18+ tworzy `socks5-port=1055` i w razie potrzeby restartuje `iteriodev-tailscale`. LAN (np. hotspot) łączy się bezpośrednio. Pierwsze połączenie nie ufa certyfikatowi: odcisk pojawia się jako `cert|...`. Kafelek Cert zapisuje odcisk. Hasło jest w danych OAP (`rdp.secret` / `rdp-pN.secret`), na czas sesji w pliku `0600`.

Sprzętowy dekoder nie jest włączany. Na tej jednostce nie ma potwierdzonego VA-API dla RDP, a UxPlay i tak zostawia wybór `decodebin`.

## Wejście

Wspólna warstwa jest w `input_manager.js`.

- Pokrętło na przycisku RHMI: obrót to scroll, klik to lewy przycisk, `Abort` to rozłączenie.
- Ekran: sam przycisk nie daje współrzędnych palca. Ruch kursora po ekranie włącza się dopiero, gdy zdarzenie ma liczby `x` i `y`.
- Touchpad: ruch i tap liczą się dopiero przy `statusSystemModeFrontSide === 3` i niezerowych `touchCoordinatesX1FrontSide` / `touchCoordinatesY1FrontSide`. Inna próbka jest tylko w inspektorze. Tryb touchpada zostaje `unavailable`, dopóki taka próbka nie przyjdzie.
- Surowy enkoder bez pola `delta` zostaje `unconfirmed`.

Inspektor, gdy w ustawieniach jest `inspect`, dopisuje nazwy pól do `/run/g21-session/input.log`. Nie zapisuje haseł.

## Czego ten samochód jeszcze nie potwierdził

Wayland z `g21-present`, widoczność przycisków RHMI, odczyt prędkości przez manifest OAP, oraz to, czy `ZBETouchFrontSide` w ogóle przychodzi bez zapisu trybu pisania. Na tym G21 nie ma próbki touchpadu, więc ruch i tapnięcie touchpada nie zostały uzyskane.
