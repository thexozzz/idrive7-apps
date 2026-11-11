# Testy

## Fakty o testach w źródłach

- `idrive7-apps` `.github/workflows/app-tests.yml` odpala testy Node bez SDK, renderera i samochodu. Emulator (`docs/emulator.md`) potrzebuje wcześniejszego `build.py`, który na komputerze linkuje SDK.
- `idrive7-cluster-info` `.github/workflows/tests.yml` tak samo: Node 22, bez SDK. `tools/test_built.js` jest opisany jako lokalny, bo potrzebuje SDK.
- `idrive-apps` `.github/workflows/test.yml` buduje narzędzia natywne i porównuje artefakty. Aplikacja mapy ma własne testy Node.
- `mgu-store` publikuje bez dawcy SDK w GitHub Actions (`.github/workflows/release.yml`: „No oap-sdk donor here”). Testy Store idą na Node 22.

## Co sprawdza to repozytorium

`node tools/test_all.js` albo `scripts/test.ps1`:

1. `tools/validate_repo.js` — `mgu-repo.json`, zgodność wersji, `uninstallable`, ID7, brak `javascript/`, ścieżki SDK, brak nazw sterowników w manifeście, brak plików SDK i znaczników kluczy, składnia Node 8 w `apps/` i `lib/`.
2. `tools/test_parked_gate.js` — HUD wyłączony bez próbki, przy `65535`, przy prędkości powyżej 3 km/h i po nieprawidłowej próbce następującej po jeździe. HUD włączony przy surowej wartości 192, czyli dokładnie 3 km/h.
3. `tools/test_version.js` — podbicie patch, minor i major oraz przeniesienie changelogu. Drugie podbicie bez nowego punktu w `## Unreleased` jest odrzucane.

Workflow `.github/workflows/test.yml` uruchamia ten sam zestaw na Node 22. Node 22 nie jest Node 8: zgodność z jednostką trzyma lista zabronionych konstrukcji, nie uruchomienie starego interpretera. Prawdziwy Node 8.16.2 pojawia się dopiero przy budowie na jednostce.

## Czego testy nie pokrywają

Nie sprawdzają linkowania z dawcą, wyglądu RHMI, adresu IP telefonu ani zachowania HUD na tym G21. Tych rzeczy nie wolno uznawać za zrobione na podstawie zielonego CI.
