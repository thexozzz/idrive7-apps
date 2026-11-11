# G21 AirPlay

Na postoju aplikacja ma trzy kafelki: AirPlay, RDP i VNC. Działa jedna sesja. Bez odczytanej prędkości żadna się nie uruchamia. Szczegóły są w `docs/pulpit-zdalny.md`.

Aplikacja nie otwiera własnego portu AirPlay. Odbiornikiem jest [UxPlay](https://github.com/FDH2/UxPlay) 1.73.7 (GPL-3.0). Usługa `g21-airplay-open` startuje go poleceniem `uxplay -n G21 -nh -p -vsync no -fs -vs waylandsink -as alsasink -s 1920x720`, gdy MGU Store jest na Wi-Fi, i kończy go, gdy to Wi-Fi znika.

Porty wpuszczane z podsieci tej dzierżawy: UDP 5353 oraz zestaw legacy UxPlay (`-p`): TCP 7100, 7000, 7001 i UDP 6000, 6001, 7011. Źródło zestawu: README UxPlay, opcja `-p`.

Źródła UxPlay są w `third_party/UxPlay` (tag v1.73.7, commit `df67c212a433`, GPL-3.0). Gotowy program dla jednostki leży obok usługi: `native/g21-airplay-open/uxplay` uruchamia `uxplay.bin` z bibliotekami z `lib/` (glibc 2.27, GStreamer 1.14). Usługa sama ustawia ścieżki do tych bibliotek.

Obraz ma iść na kompozytor Wayland jednostki (`waylandsink`, `XDG_RUNTIME_DIR=/run/wayland`). Że to okno widać na centralnym ekranie tego G21, nie jest jeszcze potwierdzone.
