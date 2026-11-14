# Sterowanie i zdarzenia wejściowe

## Źródła zdarzeń

| Źródło | Mechanizm | Status | Źródło |
|---|---|---|---|
| Ekran dotykowy (środek) | renderer: aplikacja wysyła `CLAIM` (cały ekran), renderer przekierowuje PDU dotyku (UDP 30567 → 30570, reguła nft `ip mgu_render`) i oddaje `TOUCH {phase u32, x f32, y f32}`; phase 1=down, 2=move, 3=up | **VERIFIED** (log `menu-touch 1/2/3 x,y`, `menu-hit up air-toggle`) | `menu_draw.js:take()`, `kit/renderd/PROTOCOL.md` „Touch” |
| Swipe / przewijanie | z sekwencji TOUCH w `menu_draw.js` | ASSUMPTION (CHANGELOG 0.1.86) | |
| Pokrętło iDrive (obrót, klik, kierunki) | renderer `CCU`/`X_CCU` (`onControl(code u16, a, b)`) — wymaga `GRAB` i biblioteki `mgu-inputgate.so` wczytanej do `HmiMain3D` | ASSUMPTION — kod jest; brak dowodu w logach, brak wiedzy czy inputgate jest zainstalowany | `menu_draw.js`, PROTOCOL.md „Controller”, idrive7-apps `mgu-repo.json` |
| Pokrętło przez RHMI (`Increase`/`Decrease` na przycisku) | `main.js` ~l. 3606 → `input.knobScroll` | ASSUMPTION | |
| Pokrętło przez SOME/IP `FrontCCU.statusRotaryEncoderState` | `main.js:_watchCar` | **prawdopodobnie niedostępne**: `manifest.json` nie deklaruje tego interfejsu → K-03 | |
| Touchpad pokrętła `ControllerElements.ZBETouchFrontSide` (x1/y1 przy `statusSystemModeFrontSide==3`) | `input_manager.feedPad` | PLANNED/niedostępne (H15, brak próbki, brak w manifeście). Włączenie wymagałoby zapisu `ccsControlTouchCCU` — **zakazane** (pokrętło może zostać w trybie pisania) | `docs/pulpit-zdalny.md` |
| Prędkość `Vehicle2.statusCarSpeed2` | `main.js:_watchCar` → `parked_gate` | niedostępne (brak w manifeście) + bramka i tak wyłączona (`_parkFlag`) | K-02, K-03 |

## Mapowanie w aplikacji

- Menu: dotyk → hitboxy (`activateHit` na phase=3); pokrętło → wybór/armowanie opcji (czerwone zaznaczenie, drugi klik puszcza). Klawiatura `knob_keyboard.js`: obrót = znak, OK = wybór, DEL, ANULUJ. Renderer puszcza pokrętło po 1,5 s → aplikacja odświeża GRAB co 0,5 s (CHANGELOG 0.1.84). — kod VERIFIED.
- `input_manager.js`: obrót = scroll, klik = lewy przycisk, `Abort` = rozłączenie; ruch kursora tylko przy liczbowych `x`,`y`; czułość, odwrócenie osi; inspektor do `/run/g21-session/input.log`. — kod VERIFIED.

## Przekazywanie do pulpitu

| Cel | Mechanizm | Status |
|---|---|---|
| RDP | `g21-rdp` nasłuchuje `/run/g21-desktop/input.sock`, przesuwa kursor (`freerdp/input.h`) | kod VERIFIED; działanie UNVERIFIED (RDP BROKEN w logu) |
| VNC | `vnc_client.js` `pointer(x,y)` (PointerEvent RFB) | kod VERIFIED; UNVERIFIED |
| AirPlay | brak kanału zwrotnego (AirPlay nie przenosi dotyku) | n/d |
| Moonlight/Moonride | brak kodu | PLANNED |

## Do reverse engineeringu (tylko odczyt)

Czy `mgu-inputgate` jest wczytany (`/proc/<HmiMain3D>/maps`), czy `/run/mgu-renderd/inputgate` istnieje, kody `onControl` dla obrotu/kliknięcia/kierunków (log inspektora), czy dodanie interfejsów do manifestu (tylko `rs`/odczyt) daje próbki prędkości i enkodera — to ostatnie wymaga zmiany paczki i reinstalacji, więc osobna zgoda.
