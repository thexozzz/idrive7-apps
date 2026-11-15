# Przeglądarka („Przeglądarka” w THEiPlay) — co jest zbudowane, co niesprawdzone

Stan: 2026-11-15, aplikacja 0.1.136, narzędzie `g21-browser` 0.1.0. Zbudowane i przetestowane lokalnie na prawdziwym silniku. **Na aucie nic nie sprawdzono** (auto było offline).

## Decyzje właściciela

- Silnik: gotowy, oficjalny binarny silnik Google (nie własna kompilacja Chromium).
- Od początku do końca, na koniec komendy pushu na `test`.

## Co to jest

| Część | Gdzie | Rola |
|---|---|---|
| Silnik | pobierany przez auto z `storage.googleapis.com/chrome-for-testing-public/…` | Google Chrome for Testing 153.0.8010.12, `chrome-headless-shell` (wymaga tylko glibc 2.25) |
| `native/g21-browser/engine/manifest.json` | repo | adres Google i SHA-256 każdego pliku silnika; narzędzie odrzuca wszystko, co się różni |
| `native/g21-browser/lib/`, `fonts/` | repo | loader, glibc 2.39 i biblioteki z Ubuntu 24.04 (lista i pakiety: `LIBS.txt`), czcionki Liberation i DejaVu. Silnik używa tylko ich |
| `g21-browserd.js` | repo, działa na `jap-node22` jako root | gniazdo `/run/g21-browser/ctl.sock`, pobranie i sprawdzenie silnika, start silnika, DevTools przez potok |
| `g21-browserd.js --proxy` | proces potomny jako uid silnika | SOCKS5: DNS z `/run/mgu-uplink/lease.json`, odmowa adresów lokalnych, prywatnych i 100.64/10 (Tailscale) |
| `g21-webframe` (C, statyczny) | proces potomny jako uid silnika | JPEG z `Page.startScreencast` → I420 → `/dev/shm/mgu-video-g21browser` (MGVF, 4 sloty), powtórka klatki co 0,5 s |
| `apps/g21_airplay/src/browser_client.js` | aplikacja | łącze do demona |
| `menu_draw.js` (`buildWebFrame`, `setWeb`), `main.js` (`_onWebChoice`…), `knob_keyboard.js` (tryby `url`, `text`, `webpass`) | aplikacja | pasek, dotyk, pokrętło, klawiatura |

Silnika **nie ma w repozytorium** (repo jest publiczne, a binarium Google jest na warunkach Google). `build-engine.js` robi lokalną paczkę `engine/engine.pack.br.NN` do testów; `.gitignore` trzyma ją poza gitem. Gdy paczka leży obok manifestu, demon bierze ją zamiast pobierania.

Jedyna zmiana w binarium silnika (po sprawdzeniu sum): ścieżka interpretera ELF `/lib64/ld-linux-x86-64.so.2` → `/run/g21-browser/ld.so` (dowiązanie do `lib/ld-linux-x86-64.so.2`). Test odtwarza z tego oryginał i porównuje SHA-256.

## Co sprawdzono lokalnie (VERIFIED, kontener Linux x86-64, jądro 6.18)

`node tools/test_browser_tool.js` (prawdziwy silnik, jako root): pobranie zipa przez proces o uid silnika, sumy, rozpakowanie, start jako uid 65534 z własnym loaderem (żadna biblioteka systemu nie jest wczytana), strona startowa 1920×636, dotyk, pole tekstowe → klawiatura, przewijanie, linki, wstecz/dalej, `target=_blank` w tej samej stronie, zoom, wyłączenie po odejściu aplikacji, strażnik pamięci, start bez piaskownicy po nieudanym starcie z piaskownicą, wybór uid, odmowy proxy.
`node tools/test_browser_app.js`: klatka paska, dotyk i pokrętło, klawiatura, łącze z fałszywym demonem, klej w `main.js`.
Dekoder: luma bit w bit jak libjpeg (porównanie z Pillow) dla 4:2:0, 4:2:2, 4:4:4, szarości, znaczników restartu.

## Czego NIE sprawdzono (UNVERIFIED) — do odczytu z auta

| Pytanie | Jak sprawdzić (most SSH, tylko odczyt) |
|---|---|
| Czy loader i silnik startują na jądrze 4.14.198 | `tail -n 40 /var/opt/g21-browser/log/browserd.log` (wiersze `engine up` albo `engine said:`) |
| Czy auto pobrało silnik (uplink, DNS, adres Google istnieje dla 153.0.8010.12) | ten sam log: `downloading the engine`, `engine installed in … ms` albo `engine download failed` |
| Wolne miejsce: ok. 450 MB na czas instalacji, ok. 250 MB potem | `stat -f /var/opt` |
| Pamięć i procesor MGU przy stronach | `head -n 4 /proc/meminfo`; `top -b -n 1` z otwartą stroną |
| Piaskownica silnika (przestrzenie nazw użytkownika) | `cat /proc/sys/user/max_user_namespaces`; `cat /var/opt/g21-browser/state/sandbox` (`off` = bez piaskownicy) |
| `/dev/shm` zapisywalne dla uid silnika i dość duże | `stat -f /dev/shm`; `ls -l /dev/shm` |
| Warstwa wideo 1920×636 w rendererze (dotąd pliki do 1280×720) | obraz na ekranie; `hexdump -C -n 64 /dev/shm/mgu-video-g21browser` (rośnie `seq`) |
| Kolory | plik `state/color`: `601` (domyślnie), `709` albo `full` — zmiana wymaga zgody (zapis na MGU) |
| Czy uplink wypuszcza uid silnika | `cat /var/opt/g21-browser/state/internet-uids`; `ls /var/opt/mgu-uplink/uids.d` |

## Ograniczenia tej wersji

- Bez dźwięku stron (`--mute-audio`), bez pobierania plików, jedna karta, bez WebGL (`--disable-software-rasterizer`), bez emoji i pisma CJK (brak czcionek).
- Rasteryzacja strony na CPU. GPU w silniku: przełącznik `state/engine-flags` (wiersz `--enable-gpu` zdejmuje `--disable-gpu`), nietestowany — trzeba najpierw zobaczyć EGL/DRI na aucie.
- Silnik 153 jest o kilka wydań starszy niż bieżący stabilny Chrome (157 w listopadzie 2026): znane luki bezpieczeństwa nowszych wydań mogą go dotyczyć. Aktualizacja: nowy zip Google → `build-engine.js` → nowy `manifest.json` → podbić wersję narzędzia.
- Bez piaskownicy (gdy jądro jej nie da) silnik chroni tylko osobny uid i proxy.
- Hasła wpisywane na stronach zostają w profilu silnika (`/var/opt/g21-browser/cache/profile`, ciasteczka). Ostatnie adresy (bez zapytań) w `state/recent.json`.

## Prawo

Biblioteki w `lib/` to niezmienione pliki pakietów Ubuntu (LGPL, MPL, MIT i podobne; źródła: archiwum Ubuntu, lista w `LIBS.txt`). Czy samo wskazanie archiwum wystarcza dla każdej z tych licencji przy publicznym repo — nie rozstrzygam, to pytanie do prawnika. Tak samo są już dołączone biblioteki w `native/g21-airplay-open/lib`.
