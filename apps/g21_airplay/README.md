# THEiPlay

Aplikacja iDrive 7: lustro AirPlay iPhone na MGU. Start idzie ścieżką Store (`AppBookmarks` → `WakeUpOnDemand` → `Provisioning`).

THEiPlay pokazuje tylko AirPlay. Wyjście: ekran centralny albo zegary (cluster). HUD jest wyłączony.

## AirPlay

`g21_airplay` to integracja AirPlay w aucie: iPhone widzi odbiornik **THEiPlay**, obraz idzie na Wayland jednostki. Pod spodem usługa `g21-airplay-open` odpala silnik odbiornika (binarka z [UxPlay](https://github.com/FDH2/UxPlay) 1.73.7, GPL-3.0) jako backend DNS-SD/RAOP + dekoder.

Start backendu: Wi-Fi MGU Store + przełącznik w menu AirPlay. Po zestrojeniu: stream + Zakoncz. Porty z podsieci dzierżawy: UDP 5353 oraz TCP/UDP 7400–7402.

Źródła silnika: `third_party/UxPlay` (tag v1.73.7). Na jednostce: `native/g21-airplay-open/` (`uxplay` → `uxplay.bin` przez `run-elf`, avahi, `lib/`).
