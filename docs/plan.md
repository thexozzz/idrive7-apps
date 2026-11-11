# Plan

Stan na 11 listopada 2026. Wdrożenia na samochód nie rozpoczęto i żaden skrypt z tego katalogu nie był uruchomiony przeciwko MGU.

## Ustalenia po analizie źródeł

1. Droga instalacji zgodna z MGU Store i z możliwością usunięcia to pakiet źródłowy (`mgu-app.json`, `"build": "unit"`), a nie paczka z wbudowanym SDK i nie `deploy-car.sh`.
2. SDK zostaje na jednostce. Repozytorium i wydania GitHub nie dostają `oap-sdk` ani `javascript/app.js`.
3. Szablon rysuje przez RHMI, więc nie wymaga renderera GPU ani biblioteki ładowanej do HMI.
4. iPhone Mirror jest osobnym projektem. Nie wchodzi do `mgu-repo.json`, dopóki nie ma testów i osobnej zgody na instalację.
5. HUD, jeśli w ogóle powstanie, używa `lib/parked-gate.js`: obraz tylko po prawdziwej próbce prędkości ≤ 3 km/h. Brak danych gasi HUD. To jest ostrzejsze niż bramka gier w `idrive7-apps`.
6. Aplikacje z `idrive7-apps`, które piszą do DME albo DSC, nie są wzorcem dla tego środowiska.

## Zrobione lokalnie

- Baza `docs/` z rozdziałem faktów i hipotez oraz ze wskazaniem plików źródłowych.
- `AGENTS.md` i reguła Cursor `.cursor/rules/mgu-safety.mdc`.
- Skrypty odczytu, sprawdzenia kontraktu, testu, planu publikacji i instrukcji usunięcia. Publikacja na urządzenie jest odrzucana.
- Szablon `apps/g21_hello` dla ID7.
- Mechanizm wersji: `scripts/bump.ps1` i zgodność numeru w plikach paczki. Store aktualizuje gałąź. Wydanie GitHub z paczką nie powstaje.
- Plan iPhone Mirror w `docs/apps/iphone-mirror.md` oraz przetestowana bramka postoju.

## Kolejność, gdy właściciel zatwierdzi dalsze kroki

1. Odczyt `scripts/diagnose.ps1` z kluczem leżącym poza tym katalogiem. Zamknięcie albo utrzymanie H1.
2. Dodanie tego repozytorium jako źródła w Store przez właściciela, kanał gałęzi, i instalacja wyłącznie `g21_hello`. Aktualizacja tym samym kanałem, po `scripts/bump.ps1` i pushu.
3. Ocena H3–H5 na ekranie. Przy błędzie: poprawka opisu RHMI, nadal bez SDK w git.
4. Dopiero potem projekt iPhone Mirror, najpierw status na centralnym wyświetlaczu, HUD wyłącznie po osobnej zgodzie i po teście H9.

Żaden z punktów 1–4 nie jest upoważniony przez samo utworzenie tego środowiska.
