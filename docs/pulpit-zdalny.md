# Pulpit zdalny w g21_airplay

Rozszerzenie istniejącej aplikacji `g21_airplay`, nie nowa aplikacja. AirPlay zostaje na UxPlay. RDP i VNC dochodzą obok niego. W danej chwili działa jedna sesja.

## Licencje

Moonride (`JustAnotherPU/moonride`, commit `d1073cef7c5be72fbbd2cdeb441e874342ae6083`) jest na GPL-3.0-or-later. Jego kod nie został skopiowany do tego repozytorium. Z opisu sygnałów w `apps/jap_moonride/app.json` i `input.js` wynikają tylko nazwy odczytów, które tu są hipotezą dla tego G21:

- `de.bmw.infotainment.vehicle.Vehicle2` / `statusCarSpeed2`
- `de.bmw.infotainment.controlelements.FrontCCU` / `statusRotaryEncoderState`
- `de.bmw.infotainment.ControllerElements` / `ZBETouchFrontSide`

Moonride włącza touchpad zapisem `ccsControlTouchCCU = TOUCH_AKTIV` i sam opisuje skutek uboczny: po zabiciu procesu pokrętło może zostać w trybie pisania. Ten projekt tego zapisu nie wysyła. Manifest ma tylko odczyt.

UxPlay zostaje na GPL-3.0. Klient RDP jest własnym programem `g21-rdp` zlinkowanym z FreeRDP 2.2.0 (Apache-2.0, pakiet Ubuntu 18.04 `freerdp2`). Klient VNC jest własną implementacją RFB 3.8 w `vnc_client.js` i nie łączy LibVNC.

## Kafelek

`package/config/base.json` ma `rhmiLoadingEnabled` i `entryPointLoadingEnabled`. Nowsze SDK buduje ekran i wpis na liście aplikacji tylko z tymi flagami. Bez nich Store pokazuje Installed, a listy aplikacji nie ma. Wpis jest publiczny (`private: false`) i wchodzi pod stan `20974`, ten sam co MGU Store i Waze.

## Ekran

Widżety listy na tym G21 otwierają stronę i zostają puste. Odczyt 2026-11-12: AirPlay 0.1.11 doszedł do `state-open` z czterema `LT_Button_2Row_2Text`, a wiersze nie były widoczne. Menu jest rysowane na powierzchni renderera (`/run/mgu-renderd/renderd.sock`, potem `/run/mgu-render/render.sock`): tło, wiersze i napisy z prostych prostokątów. Właściciel potwierdził tego dnia, że te wiersze widać, gdy powierzchnia leży na całym ekranie. Zawężenie jej do pola 104,88 zgasiło rysunek. Przejęcie pokrętła zablokowało powrót. Aktualna ramka znowu jest na cały ekran, menu jest w środku, a kolumna wstecz zostaje pusta. Przejęcia nie ma. Menu to poziomy rząd kart z ikonami 16×16; przy `setScreen` ikona jest kopiowana (wcześniej ginęła i RDP wyglądał jak AirPlay). Pierwszy ekran: AirPlay, RDP, VNC. AirPlay: Lustro, Stop, Nazwa, Siec, Wstecz. RDP: Polacz, Rozlacz, IP, Port, Konto, Haslo, Cert, WWW, Wstecz. Na IP/Port pokrętło zmienia wartość (oktet/port), klik na IP przełącza oktet. Status RDP jest osobny (`RDP lacze`, `zatwierdz Cert`, `tylko postoj`). Wejście w AirPlay kończy RDP/VNC i odwrotnie. Konto i hasło RDP ustawia panel HTTP `:1235` (`http://<ip-mgu>:1235`); hasło tylko w `/var/opt/g21_airplay/rdp.secret`. Pierwsze połączenie może zgłosić `cert|odcisk` — kafelek Cert zapisuje odcisk i łączy ponownie. Renderer chowa powierzchnię po około trzech sekundach bez klatki. Właściciel widział menu i pasek iDrive, a potem oba zgasły. Klatka jest powtarzana, dopóki aplikacja jest z przodu. Po wyjściu powierzchnia jest zrywana (gniazdo renderera), nie tylko chowana. W przeciwnym razie ostatnia klatka zostaje nad iDrive.

## Postój

AirPlay startuje bez próbki prędkości i nie jest gaszony przez jazdę. RDP i VNC nadal startują tylko po próbce i tylko na postoju. Brak próbki blokuje te dwa (`speed-unknown`). Jazda albo utrata próbki rozłącza ich aktywną sesję. Usługa `g21-airplay-open` uruchamia UxPlay i avahi, gdy aplikacja zapisze `airplay` w `/run/g21-session/allow` i uplink Store jest Wi-Fi. iPhone może być hostem tego hotspotu.

## Protokoły

VNC mówi RFB 3.8 z kodowania Raw i CopyRect. Hasło, jeśli jest, czyta z `/var/opt/g21_airplay/vnc.secret` i nie trafia do logu ani do ustawień. Obraz idzie do gniazda `/run/g21-desktop/frame.sock`. `g21-present` kładzie go na Wayland przez ten sam GStreamer co UxPlay.

RDP to `g21-rdp` (FreeRDP, GDI programowe, 1920×720). Pierwsze połączenie nie ufa certyfikatowi: odcisk pojawia się na ekranie jako `cert|...`. Drugie kliknięcie kafelka RDP zapisuje ten odcisk i łączy się tylko z nim. Hasło jest w `/var/opt/g21_airplay/rdp.secret`, a na czas sesji w pliku `0600`. Nie ma go w argumentach procesu.

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
