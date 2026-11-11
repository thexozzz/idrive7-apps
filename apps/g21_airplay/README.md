# G21 AirPlay

Aplikacja nie otwiera własnego portu AirPlay. Odbiornikiem jest [UxPlay](https://github.com/FDH2/UxPlay) 1.73.7 (GPL-3.0). Usługa `g21-airplay-open` startuje go poleceniem `uxplay -n G21 -nh -p -vsync no -fs -vs waylandsink -s 1920x720`, gdy MGU Store jest na Wi-Fi, i kończy go, gdy to Wi-Fi znika.

Porty wpuszczane z podsieci tej dzierżawy: UDP 5353 oraz zestaw legacy UxPlay (`-p`): TCP 7100, 7000, 7001 i UDP 6000, 6001, 7011. Źródło zestawu: README UxPlay, opcja `-p`.

Źródła UxPlay są w `third_party/UxPlay` (tag v1.73.7, commit `df67c212a433`, GPL-3.0). `native/g21-airplay-open/build-uxplay.sh` buduje je na miejscu i kładzie binarkę `uxplay` obok skryptu usługi. Budowa musi być na glibc 2.27, takim jak jednostka. Dopóki binarki nie ma, ekran pokazuje „brak programu uxplay”.

Obraz ma iść na kompozytor Wayland jednostki (`waylandsink`, `XDG_RUNTIME_DIR=/run/wayland`). Że to okno widać na centralnym ekranie tego G21, nie jest jeszcze potwierdzone.
