# G21 AirPlay

Aplikacja iDrive 7: lustro AirPlay oraz pulpit RDP/VNC. Start idzie ścieżką Store (`AppBookmarks` → `WakeUpOnDemand` → `Provisioning`).

Na postoju widać trzy wejścia: AirPlay, RDP i VNC. Działa jedna sesja. Szczegóły: `docs/pulpit-zdalny.md`.

## AirPlay

To nie jest osobna aplikacja desktopowa UxPlay. `g21_airplay` to integracja AirPlay w aucie: iPhone widzi odbiornik **G21**, obraz idzie na Wayland jednostki. Pod spodem usługa `g21-airplay-open` odpala silnik odbiornika (binarka z [UxPlay](https://github.com/FDH2/UxPlay) 1.73.7, GPL-3.0) tylko jako backend DNS-SD/RAOP + dekoder — bez trybu okna/fullscreen jak w repo FDH2.

Start backendu: Wi-Fi MGU Store + kafelek `WL` w menu AirPlay albo Miracast. Miracast po Win+K sam przyjmuje ofertę PC. Po zestrojeniu: stream + Zakoncz. Porty z podsieci dzierżawy: UDP 5353 oraz legacy `-p` (TCP 7100/7000/7001, UDP 6000/6001/7011).

Źródła silnika: `third_party/UxPlay` (tag v1.73.7). Na jednostce: `native/g21-airplay-open/` (`uxplay` → `uxplay.bin` przez `run-elf`, avahi, `lib/`).

Obraz: `waylandsink`, `XDG_RUNTIME_DIR=/run/wayland`. Widoczność na centralnym ekranie tego G21 — hipoteza H13.
