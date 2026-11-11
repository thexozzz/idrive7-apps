# Usunięcie i wycofanie aktualizacji

## Fakty

- Aplikacja w układzie wydań Store jest usuwalna z ekranu. Wpis katalogu i `release.json` mogą powtórzyć `uninstallable: true`. Źródło: `mgu-store` `docs/PUBLISHING.md`.
- Aktualizacja nie startuje sama. Na stronie Installed są **Update** i **Update all**. Źródło: `mgu-store` `README.md`, „Using the Store”.
- Odinstalowanie całego Store (`uninstall` oficjalnego instalatora) pyta, zanim zdejmie aplikacje i narzędzia zainstalowane przez Store, łącznie z narzędziami innych repozytoriów. To polecenie uruchamia właściciel. Tutejsze skrypty go nie wołają. Źródło: `mgu-store` `README.md`, „Uninstall”.
- Starsza ścieżka `idrive7-apps` trzyma pierwszą kopię zapasową jako „stock” i ma `deploy-car.sh restore`, które pyta o `YES`. Źródło: `deploy/car/README.txt`. To środowisko tej ścieżki nie instaluje, więc nie ma tu czego przywracać tym skryptem.
- Deploy Store „potrafi wycofać każdą instalację”. Źródło: pierwsze akapity `mgu-store` `README.md`.
- MainApp sam odinstalowuje aplikację po drugim niespodziewanym zakończeniu. Źródło: `idrive7-apps` `README.md` 4.3.

## Procedura w tym projekcie

1. `scripts/uninstall.ps1` tylko sprawdza, że `apps/g21_hello/release.json` ma `uninstallable: true`, i wypisuje ścieżkę w menu. Nic nie wysyła.
2. Właściciel na postoju, po osobnej zgodzie na tę czynność: Store → Installed → G21 Hello → Remove.
3. Niewdrożenie nowszej wersji: nie klikać Update. Push gałęzi tylko pokazuje aktualizację w Store.
4. Gdyby aplikacja po starcie jednostki nie wstała, nie zabijać jej procesu. Dwa takie zabicia kończą się usunięciem przez MainApp. Zgłoszenie problemu idzie przez log, który właściciel sam zdecyduje się odczytać; logu nie commitujemy, bo może zawierać dane pojazdu.

## Hipoteza

Że Remove w Store zdejmuje też kafelek bez restartu na ID7, jest zgodne z opisem Store dla iDrive 7. `mgu-store` `README.md` mówi wprost, że na iDrive 8 instalacja i usunięcie czekają na restart jednostki. Dla ID7 tego zastrzeżenia przy Remove nie powtórzono. Na tym G21 pozostaje to do obejrzenia przy pierwszej, zatwierdzonej instalacji szablonu.
