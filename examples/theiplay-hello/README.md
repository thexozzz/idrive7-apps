# Hello THEiPlay

Testowa aplikacja do Sklepu THEiPlay (BMW iDrive 7 / MGU). To zwykła strona WWW bez zewnętrznych zasobów:
sprawdza dotyk i mysz z gładzika, dźwięk (Web Audio), klawiaturę, rozmiar okna i pełny ekran.

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
- `mouse` – `yes`, jeśli aplikacja ma dostać kursor z gładzika kontrolera.

Strona działa w piaskownicy przeglądarki THEiPlay, serwowana z lokalnego serwera plików tylko do odczytu.
Limity: 4000 plików, 150 MB po rozpakowaniu, archiwum do 60 MB.
