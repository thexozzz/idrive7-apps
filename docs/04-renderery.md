# Renderery i HUD

## RHMI

Aplikacja OAP nie rysuje pikseli HMI. Wysyła opis ekranu i aktualizacje modelu. Źródła:

- `idrive7-apps` `README.md`, sekcja 4.4.
- `idrive7-apps` `docs/rhmi-widgets.md`: typy komponentów (`state`, `label`, `button`, `image`, a także `hudPopUp` i `hudMidPopUp`) oraz przykładowy kontener.
- `idrive-apps` `apps/robertn_waze_cluster/package/rhmiData/uiDescriptions/ID7/application.xml`: opublikowany ekran `LT_State_Wide` z etykietą `LT_Label_1Row`. Właściwości o id 2 i 3 są tam ustawione tak jak w szablonie. Plik `uiDescription.json` nazywa komponenty i niesie tekst.

Szablon ma jeden stan `ST_OnlineApps_G21Hello`, tytuł i jedną etykietę. Kod woła `getByName`, `mapEntryState`, `setAvailability`, `openEntryState` i `setValue(0, 'Text', ...)`. Te metody są użyte w `idrive-apps` `apps/robertn_waze_cluster/src/robertn_waze_cluster.js`.

AirPlay 0.1.10 na tym G21 otworzył stronę i została pusta: był to sam obraz `LT_State_Laptimer`, bez rysowania pikseli. `openEntryState` zwrócił `INVALID_UUID`. Menu jest osobną listą `LT_State_Wide` z przyciskami `LT_Button_2Row_2Text`. Czy te wiersze będą widoczne, pozostaje hipotezą H18.

## mgu-render

Renderer GPU rysuje komendy albo klatki nad HMI, na gnieździe `/run/mgu-render/render.sock` (albo `/run/mgu-renderd/renderd.sock`). Projekt ekranu aplikacji z `idrive7-apps` to 1920×720. Bez renderera aplikacja koduje PNG i oddaje go HMI, co daje kilka klatek na sekundę. Źródła: `idrive7-apps` `kit/renderd/README.md` i `kit/renderd/PROTOCOL.md`.

Protokół niesie m.in. obraz (typ IMAGE) i wideo (typ 13 VIDEO w dialekcie native/iterio). To jest droga na centralny wyświetlacz, nie na HUD.

`idrive7-apps` `mgu-repo.json` wymaga narzędzia `idrive7-renderd` 2.1.7 i bramki kontrolera `mgu-inputgate` 1.0.0. Bramka jest biblioteką ładowaną do `HmiMain3D`. Szablon jej nie wymaga i nie instaluje.

## Zestaw wskaźników i HUD

`cluster-render` z `idrive-apps` rysuje warstwy aplikacji na zestawie wskaźników i na HUD, na iDrive 7 i 8. Mapa na HUD jest opisana jako eksperymentalna. Przy dwóch celach HUD dostaje co najwyżej połowę pasma. Mapa ustępuje popupom BMW, chyba że włączono trzymanie jej nad nimi. Dwa restarty zestawu wskaźników tuż po pokazaniu mapy na HUD wyłączają HUD do następnej wersji renderera albo `cluster-render guard-reset`. Źródło: `idrive-apps` `README.md`, „The map on the HUD”. Zdjęcia w tamtym pliku są z X5 G05 2021, nie z G21.

`idrive7-cluster-info` kładzie panel na mapie Waze w zestawie albo na HUD i nie trzyma wyświetlacza samodzielnie. Źródło: `apps/cluster_info/README.md` i `README.md` repozytorium.

Uzgodnienie, która aplikacja ma HUD: pliki w `/dev/shm/mgu-hud/<id>`, odświeżane co 2 s, nieważne po 6 s. Katalog znika przy starcie jednostki, bo to tmpfs. Źródło: `idrive7-apps` `kit/runtime/hud_claim.js`.

## Postój

`idrive7-apps` `kit/runtime/parked.js`:

- sygnał `de.bmw.infotainment.vehicle.Vehicle2` / `statusCarSpeed2`, flaga `rs`;
- pole `speedVehicleCentreOfGravity`;
- km/h = surowa wartość × `0.015625`;
- wartość `65535` jest nieprawidłowa;
- jazda zaczyna się powyżej 3 km/h;
- odczyt co 2 s, bo postój może nie wysłać zmiany;
- cisza po postoju zostaje postojem, cisza po jeździe zostaje jazdą;
- brak prędkości (ławka, VM) tamto narzędzie traktuje jako postój, żeby gra mogła działać.

`lib/parked-gate.js` używa tej skali i progu, ale HUD włącza dopiero po prawdziwej próbce ≤ 3 km/h. Brak próbki zostawia HUD wyłączony. To jest zasada tego repozytorium, nie cytat z `parked.js`.

## Hipoteza

Minimalny opis RHMI z szablonu nie był zainstalowany na żadnym MGU. Nazwy widżetów są wzięte z opublikowanego ekranu, ale kompletność `uiDescription.json` dla MainApp na tym firmware jest niepotwierdzona. `insertionStateId` 24107 też nie był sprawdzony pod kątem kolizji.
