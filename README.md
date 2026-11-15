# Hello THEiPlay

Testowa aplikacja do Sklepu THEiPlay (BMW iDrive 7 / MGU). To zwykła strona WWW bez zewnętrznych zasobów:
sprawdza dotyk i mysz z gładzika, przewijanie, dźwięk (Web Audio), klawiaturę, rozmiar okna i pełny ekran, czyta
dane auta (prędkość, przeglądarka wszystkich sygnałów do odczytu) i opisuje, co aplikacja w THEiPlay może.

## Skąd liczniki

`signals.json` to katalog sygnałów, które auto samo wysyła do jednostki (SOME/IP), z przeliczeniami — wzięty z aplikacji
Live Data z `cauliflowermossgrape/idrive7-apps` (licencja MIT, Copyright (c) 2026 cauliflowermossgrape) skryptem
`tools/gen_hello_signals.js`. Na G21 odpowiada 47 z 60 wartości (2026-11-15).

## Import

THEiPlay > Aplikacje > Sklep > „Importuj z git” i adres repozytorium: `wlasciciel/nazwa` albo `wlasciciel/nazwa@galaz`
(ta aplikacja: pozycja „Aplikacja testowa”, czyli `thexozzz/idrive7-apps@theiplay-hello`).

## Jak zrobić własną aplikację

Aplikacja to publiczne repozytorium GitHub ze stroną `index.html` na górze. Opcjonalny plik `theiplay.json`:

```json
{ "name": "Nazwa kafelka", "start": "index.html", "mouse": "yes" }
```

- `name` – nazwa kafelka w „Aplikacjach” (bez niego: nazwa z `manifest.json`, potem nazwa repozytorium),
- `start` – strona startowa (domyślnie `index.html`),
- `mouse` – `yes`, jeśli aplikacja ma dostać kursor z gładzika kontrolera,
- `car` – lista sygnałów auta, które aplikacja czyta (tylko odczyt): pełna nazwa `interfejs.pole`, `interfejs.*`
  albo `*`. Odczyt: `fetch('/_car/<id aplikacji>/get?i=<interfejs>&n=<pole>')`, lista: `/_car/<id>/list`
  (id to pierwszy człon adresu strony). Sygnały o osobie i miejscu (VIN, pozycja, telefon) nie są wydawane.

Strona działa w piaskownicy przeglądarki THEiPlay, serwowana z lokalnego serwera plików tylko do odczytu.
Limity: 4000 plików, 150 MB po rozpakowaniu, archiwum do 60 MB.
