# Pulpit zdalny w g21_airplay

Rozszerzenie istniejącej aplikacji `g21_airplay`, nie nowa aplikacja. AirPlay zostaje na UxPlay. RDP i VNC dochodzą obok niego. W danej chwili działa jedna sesja.

## Licencje

Moonride (`JustAnotherPU/moonride`, commit `d1073cef7c5be72fbbd2cdeb441e874342ae6083`) jest na GPL-3.0-or-later. Jego kod nie został skopiowany do tego repozytorium. Z opisu sygnałów w `apps/jap_moonride/app.json` i `input.js` wynikają tylko nazwy odczytów, które tu są hipotezą dla tego G21:

- `de.bmw.infotainment.vehicle.Vehicle2` / `statusCarSpeed2`
- `de.bmw.infotainment.controlelements.FrontCCU` / `statusRotaryEncoderState`
- `de.bmw.infotainment.ControllerElements` / `ZBETouchFrontSide`

Moonride włącza touchpad zapisem `ccsControlTouchCCU = TOUCH_AKTIV` i sam opisuje skutek uboczny: po zabiciu procesu pokrętło może zostać w trybie pisania. Ten projekt tego zapisu nie wysyła. Manifest ma tylko odczyt.

UxPlay zostaje na GPL-3.0. Klient RDP jest własnym programem `g21-rdp` zlinkowanym z FreeRDP 2.2.0 (Apache-2.0, pakiet Ubuntu 18.04 `freerdp2`). Klient VNC jest własną implementacją RFB 3.8 w `vnc_client.js` i nie łączy LibVNC.

## Ekran

Ten sam stan RHMI co dotychczas. Doszły cztery przyciski z `Focusable` 3: AirPlay, RDP, VNC i Adres. Pokrętło na adresie zmienia oktet, kliknięcie przechodzi do następnego oktetu. Kliknięcie kafelka prosi o sesję. Zdarzenie `Abort` rozłącza. Nazwy szablonów `LT_Button_1Row` nie były sprawdzone na tym aucie.

## Postój

Sesja startuje tylko po próbce prędkości i tylko gdy bramka postoju mówi, że auto stoi. Brak próbki blokuje start (`speed-unknown`). Jazda albo utrata próbki rozłącza aktywną sesję. Usługa `g21-airplay-open` uruchamia UxPlay dopiero, gdy aplikacja zapisze `airplay` w `/run/g21-session/allow`. Bez tego pliku odbiornik nie wstaje sam z Wi-Fi.

## Protokoły

VNC mówi RFB 3.8 z kodowania Raw i CopyRect. Hasło, jeśli jest, czyta z `/var/opt/g21_airplay/vnc.secret` i nie trafia do logu ani do ustawień. Obraz idzie do gniazda `/run/g21-desktop/frame.sock`. `g21-present` kładzie go na Wayland przez ten sam GStreamer co UxPlay.

RDP to `g21-rdp` (FreeRDP, GDI programowe, 1920×720). Certyfikat jest przyjmowany tylko wtedy, gdy jego odcisk jest już w `/run/g21-session/cert`. Inaczej połączenie pada, a odcisk ląduje w `/run/g21-desktop.status` jako `cert|...`. Hasło jest w `/var/opt/g21_airplay/rdp.secret`, a na czas sesji w pliku `0600`. Nie ma go w argumentach procesu.

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
