# tools/sim – THEiPlay w całości na maszynie deweloperskiej

To nie jest emulator BMW MGU. Uruchamia **prawdziwy kod aplikacji** (`apps/g21_airplay/src/main.js` ze wszystkim, co
ładuje: rysowanie menu, obsługa pokrętła, dotyku i kursora, klient przeglądarki, zapis ustawień) oraz – na życzenie –
**prawdziwego demona przeglądarki** `g21-browserd.js` z pełnym Chrome ze stanowiska `tools/browser-bench`.
Atrapy zastępują tylko to, czego bez auta nie ma:

| Atrapa | Co zastępuje |
|---|---|
| `oap-sdk/` | SDK BMW (`OnlineApp`, logger): aplikacja jest „uruchomiona z punktu wejścia" i „widoczna" |
| gniazdo rendera w `stand.js` | `mgu-render`: przyjmuje klatki aplikacji, odpowiada jak renderer, wysyła dotyk i pokrętło |
| gniazdo G21 Input w `stand.js` | gładzik jako mysz |
| `tools/test_services.js --fake-systemctl` | systemd (dla „Zresetuj usługi") |

Dźwięk, odbiornik AirPlay, demon YouTube i renderer zegarów nie są uruchamiane – aplikacja widzi ich brak tak jak na
jednostce bez tych narzędzi. Nie ma HMI BMW, SOME/IP, GPU auta ani jego procesora; liczby z `perf.js` porównują wersje
kodu na tej maszynie i nie przewidują auta.

Nic z tego katalogu nie trafia do paczki MGU Store (paczka aplikacji to `apps/g21_airplay`).

## Uruchamianie (WSL, jako root; skrypt przechodzi na zwykłego użytkownika)

```sh
sh tools/sim/run.sh walk.js menu        # całe menu: pokrętło, dotyk, kursor, zrzuty każdego widoku i stanu
sh tools/sim/run.sh walk.js web         # z prawdziwym Chrome: ustawienia nad stroną, aplikacja obok przeglądarki, reset usług
NODE_FLAGS=--expose-gc sh tools/sim/run.sh perf.js          # pomiary tej wersji
SIM_REPO=/ścieżka/do/innej/wersji sh tools/sim/run.sh perf.js   # ta sama miara dla innego checkoutu
node tools/sim/build_time.js [repo]     # czas budowania jednej klatki (bez stanowiska, także na Windows)
```

`SIM_OUT=<katalog>` kopiuje zrzuty PNG. Zrzut zawiera prawdziwy obraz strony z pliku wideo demona.
Testy samego silnika (karty, rozmiary, historia): `tools/browser-bench/tabs.js`.

Film w przeglądarce (potrzebny internet; domyślnie film z YouTube): `sh tools/sim/run.sh video.js [adres] [desktop] [long|fslong] [nohide] [trace] [anyvideo] [zoom=0.75]`.
Dźwięk obok stanowiska: prawdziwy `g21-audiod.js` z `G21_AUDIO_OUT` wskazującym `tools/sim/pcm_out.js` (czyta w tempie zegara).
