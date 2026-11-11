# Platforma OAP

Opis pochodzi z działającej jednostki, na której powstało `idrive7-apps`, nie z pomiaru tego G21. Szczegóły: [08-g21.md](08-g21.md).

## Fakty ze źródeł

Jednostka MGU w materiale `idrive7-apps` (`README.md`, sekcje 4.1–4.3, commit `8681f50c8843`):

- CPU Intel Apollo Lake, x86-64, GPU i915, Linux 4.14, systemd, BusyBox.
- Zapis aplikacji w `/var/opt/public`. Katalog główny jest tylko do odczytu.
- Magistrala SOME/IP. Katalog interfejsów na jednostce: `/etc/oap/someip/someip-interfaces.json`.
- Platforma aplikacji nazywa się Online Apps Platform. Usługa `oapcontroller.service` uruchamia MainApp z `/usr/lib/oap-mainapp` jako uid 12201.
- Aplikacja jest paczką w stylu npm: `package.json`, `manifest.json`, `permissions.json`, `rhmiData/`, `javascript/app.js`. Ląduje w `/var/opt/public/oap/oap_<uid>/` i działa jako osobny użytkownik, na Node.js 8.
- Przy instalacji MainApp generuje `someipInterfaces/*.json` i `acl.json` z `manifest.json` oraz katalogu SOME/IP. Aplikacja sięga tylko do usług wpisanych w manifeście.
- Widoczność kafelka zależy od podpisanego provisioningu. Plik cytowany w źródle: `/var/opt/public/tm/tm_12000/data/prov/ProvSigned.xml`.
- Dwa niespodziewane zakończenia procesu powodują odinstalowanie aplikacji przez MainApp. Procesu aplikacji nie wolno zabijać ręcznie. Czysty restart platformy to `systemctl restart oapcontroller` — tego polecenia tutejsze skrypty nie wysyłają.
- Limity CPU, pamięci i dysku siedzą w `oapAppSettings` w `package.json`.
- Adres SSH przez hotspot samochodu, podawany przez Store: `172.16.222.97`, port 22, użytkownik `root`. Źródło: `mgu-store` `README.md`, „Requirements”.

## Rysowanie

Są dwie niezależne drogi, opisane w [04-renderery.md](04-renderery.md):

1. RHMI: aplikacja opisuje ekran, a HMI BMW go rysuje.
2. Renderer GPU albo `cluster-render`: aplikacja wysyła klatki na własną powierzchnię, zestaw wskaźników albo HUD.

Szablon `g21_hello` używa tylko pierwszej drogi.

## Hipoteza

Że ten G21 ma ten sam układ katalogów i ten sam Node 8, wynika z opisu MGU ID7, nie z odczytu tej sztuki. Potwierdza to dopiero `scripts/diagnose.ps1` po osobnej zgodzie na połączenie odczytowe.
