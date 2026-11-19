# browser-bench

Stanowisko pomiarowe przeglądarki na maszynie deweloperskiej (Linux / WSL) i skrypt odczytu pomiarów z auta.
Wyniki i wnioski: `docs/09-wydajnosc-przegladarki.md`. To nie są testy z `tools/test_all.js`.

- `setup.sh` – składa stanowisko w `/opt/scr/bench`: pełny Chrome for Testing (rozpakowany wcześniej do
  `/opt/scr/cft/chrome-linux64`) z załatanym loaderem, biblioteki z `native/g21-browser/lib`, Node 22,
  `g21-webframe`. `REPO=<katalog repo> sh setup.sh`. Nic nie instaluje w systemie.
- `bench.js` – jeden przebieg: `node bench.js <scroll|anim|video|still> <sekundy> <odstęp ms> [przełączniki]`.
  Zmienne: `MODE=g21` (tor bezpośredni przez `g21-wlframe`; domyślnie zrzuty DevTools), `FPS=`, `NOCAST=1`, `Q=`,
  `FMT=png`, `KEEP=<plik>` (ostatni obraz), `WLCMD="2000:size_1280_480+4000:run_0"`. Wynik: jeden wiersz JSON.
- `runs.sh` – kilka przebiegów po kolei jako zwykły użytkownik: `sh runs.sh '- scroll 8 50' 'NOCAST=1,MODE=g21 scroll 8 0 --test-type=gpu'`.
- `e2e.js` – prawdziwy demon `g21-browserd.js` z silnikiem stanowiska: oba tory, dotknięcie, zminimalizowanie,
  pełny ekran, zmiana reguły `frames`; `node e2e.js break` – narzędzie klatek, które nie rusza (powrót do zrzutów).
  `REPO=<katalog repo>`.
- `ring2png.py` – ostatni obraz z pliku wideo jako PNG.
- `car-perf.sh` – wiersze `graphics:` / `perf:` / `direct frames:` z logu w aucie (tylko odczyt).
