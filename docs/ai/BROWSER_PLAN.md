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

## Weryfikacja 2026-11-15 (Claude Code, PC właściciela + WSL Ubuntu 20.04, jądro 6.6, root)

- **Naprawione: manifest miał sumę złej binarki.** Kopia silnika ze środowiska asystenta różniła się od pliku Google 4 wyzerowanymi fragmentami (607 bajtów, klucze publiczne wbudowanych certyfikatów); auto odrzuciłoby pobranie („zła suma SHA-256”). `engine/manifest.json` i lokalna paczka są teraz zrobione z prawdziwego zipa Google (MD5 zipa = ETag Google `9a8eb613…`, binarka SHA-256 `ded93a9c…`). Pozostałe 10 plików było identyczne.
- VERIFIED: `test_browser_tool.js` w całości (bez SKIP) na prawdziwej binarce Google, raz z zipa Google (`G21_TEST_ENGINE_ZIP`), raz z paczki: pobranie jako uid silnika, sumy, start **z piaskownicą**, dotyk, klawiatura, przewijanie, nawigacja, zoom, strażnik pamięci.
- `build-engine.js`: wersję silnika czyta też przez loader z `lib/`; bez wersji nie zapisuje manifestu (wcześniej wpisałby adres `…/UNKNOWN/…`).
- Testy na Windows: `test_airplay_audio.js` i `test_browser_tool.js` padały (brak `sh`, brak prawa do dowiązań) — teraz mówią SKIP; `node tools/test_all.js` → 0.
- **Ustalenie (UNVERIFIED na aucie): silnik otwiera po nazwie biblioteki, których narzędzie nie niesie**, i loader szuka ich wtedy w systemie: `libresolv.so.2`, `libpci.so.3`, `libva.so.2`, `libva-drm.so.2`, `libX11-xcb.so.1`, a proces GPU (tylko z piaskownicą) także `libvulkan_intel.so` z jego `libstdc++`, `libwayland-client`, `libffi`, `libxcb-*`. W WSL (glibc 2.31 systemu obok 2.39 narzędzia) silnik mimo to działa. Na aucie do odczytu: `ls /usr/lib /lib | grep -E 'vulkan|libva|libpci|X11-xcb|wayland-client|libresolv'` oraz po otwarciu strony `grep -l -E 'vulkan_intel|libva' /proc/[0-9]*/maps`. Jeśli silnik pada przy starcie na aucie, to pierwszy trop (wiersze `engine said:` w logu).

## Porównanie z pllanaio/mgu-browser (2026-11-15) — g21-browser 0.1.2, aplikacja 0.1.138

Ich przeglądarka (Debian Chromium 156, własny loader i biblioteki, piaskownica setuid, obraz 1280×384) wyświetlała strony na prawdziwym ID7. Wzięte stamtąd:

- **Piaskownica: decyzja właściciela (2026-11-15): pytać na ekranie.** Demon nigdy sam nie dodaje `--no-sandbox`. Stan `ask: "sandbox"` → aplikacja rysuje przycisk „Uruchom bez piaskownicy” (`web-sandbox-off`) → polecenie `sandbox-off` zapisuje `state/sandbox` = `off` i startuje silnik. Zip Google `chrome-headless-shell` nie ma `chrome-sandbox` (setuid), więc na jądrze bez przestrzeni nazw użytkownika jedyna droga to praca bez piaskownicy.
- Flagi: `--password-store=basic`, `--use-mock-keychain`, `--disable-smooth-scrolling`.
- `lib/librt.so.1`, `lib/libresolv.so.2` (libc6 2.39-0ubuntu8.9; pliki pakietu porównane bajt w bajt z `libc.so.6`, `libm`, `libdl`, `libpthread` i loaderem z `lib/`).
- NIE zrobione (większa przeróbka, najpierw pomiar na aucie): mniejszy obraz albo wysyłanie tylko zmienionych wierszy (oni: z ok. 14 do 30 kl/s), RPATH w plikach zamiast `LD_LIBRARY_PATH`, zamrażanie strony w tle.

## Ubuntu 18.04 z jądrem 4.14 i pierwszy wynik z auta (2026-11-15)

- VERIFIED (maszyna QEMU/KVM w WSL właściciela, `/opt/g21-vm`: Ubuntu 18.04.6, glibc systemu 2.27, jądro mainline **4.14.195** — wersji 4.14.198 nie ma już na kernel.ubuntu.com; Node 22.12.0 w wydaniu `glibc-217`): `test_browser_tool.js` w całości, bez SKIP. Silnik Google startuje z własnym loaderem i glibc 2.39 na jądrze 4.14, **z piaskownicą** (ta maszyna ma przestrzenie nazw użytkownika), i nie wczytuje żadnej biblioteki systemu.
- VERIFIED na aucie (zgłoszenie właściciela, 0.1.138): silnik pobrał się i uruchomił, **bez piaskownicy** (auto jej nie daje; właściciel zobaczył pytanie i stuknął). Pasek pokazuje tytuł strony i ładowanie, aplikacja działa płynnie.
- **BROKEN na aucie: nie widać treści strony.** Pod paskiem jest jednolite tło bez napisu, czyli aplikacja wysłała VIDEO + op 19 (`live` i warstwa wideo są), a renderer nic nie rysuje z `/dev/shm/mgu-video-g21browser`. Hipotezy (UNVERIFIED): (1) renderer nie przyjmuje pliku 1920×636 (dotąd najwyżej 1280×720), (2) renderer nie może odczytać pliku uid silnika, (3) klatki przestają dochodzić po pierwszej. Do odczytu z auta przy otwartej stronie: `ls -l /dev/shm/`; `hexdump -C -n 64 /dev/shm/mgu-video-g21browser` dwa razy (czy rośnie `seq`); `tail -n 60 /var/opt/g21-browser/log/browserd.log`; log renderera (`journalctl -u mgu-render* -n 60`).

## Auto 2026-11-15 (odczyt przez ssh, tylko odczyt) — g21-browser 0.1.3, aplikacja 0.1.139

VERIFIED na aucie (0.1.138 / 0.1.2, jądro 4.14.198-apl):

- Silnik pobiera się (77 s) i startuje; klatki dochodzą do `/dev/shm/mgu-video-g21browser` (`seq` rośnie), 1920×636.
- **Brak obrazu strony:** `mgu-renderd`: `video 1: /dev/shm/mgu-video-g21browser is not the app's (owner uid 12710)`. Renderer rysuje plik tylko aplikacji albo roota (YouTube i AirPlay piszą jako root). Naprawa: `adoptRing` w demonie (fchown na roota po wierszu `ring` dekodera, bez podążania za dowiązaniem).
- **Dotyk:** `touch: 70,75 is outside the apps' claims: to the HMI` → `g21_airplay: the HMI was touched - closed`. Aplikacja może zająć dotyk tylko w `CONTENT` (104,88 1796×632). Naprawa: `webLayout` w tym obszarze (strona 1796×548).
- **Po powrocie nic nie działa:** log aplikacji `menu-closed` … `menu-show open`, `menu-frame 46`, bez ponownego SHOW/CLAIM. Naprawa: `CLOSED` i `showSurface` zerują `surfaced` (i nazwę pliku wideo).
- **Piaskownica:** `/proc/self/ns` nie ma `user` (jądro bez CONFIG_USER_NS; `max_user_namespaces` 22563 nic tu nie znaczy), są `pid` i `net`. LSM: `capability,yama`. Demon: bez seccomp, pełne capability. `/dev/shm` i `/run` są `nosuid`; `/var/opt` (ext4) — opcje do odczytania w całości. Piaskownica wymaga więc pomocnika setuid `chrome-sandbox` (tak robi pllanaio/mgu-browser); zip `chrome-headless-shell` go nie ma. Decyzja właściciela: do czasu działającej piaskownicy pytać przy każdym otwarciu; cel: piaskownica.

### Wynik 0.1.139 / 0.1.3 na aucie (2026-11-15, 10:45 UTC)

- VERIFIED (właściciel + logi): **stronę widać.** Plik `/dev/shm/mgu-video-g21browser` jest `0:12710 0644`, 5857552 B (1788×546), `seq` rośnie; renderer nie zgłasza już „is not the app's” ani „outside the apps' claims”; dotyk dochodzi do aplikacji.
- VERIFIED: pytanie o piaskownicę przy otwarciu, zgoda „for this opening”, `state/sandbox` z 0.1.2 usunięty.
- UNVERIFIED: stuknięcie „Menu” i powrót po wyjściu do iDrive (w logu jeszcze nie wystąpiły po aktualizacji); płynność (przy ładowaniu youtube.pl 0–4% bezczynności procesora, główny proces silnika ok. 23%).

### 0.1.140 / g21-browser 0.1.4 (2026-11-15)

- VERIFIED na aucie (log 0.1.3, 10:47 UTC): po pełnym ekranie w odtwarzaczu YouTube `webframe: video file: Operation not permitted` ×253 — klatki w innym rozmiarze, `rename()` na plik roota w `/dev/shm` (sticky) odmówione; obraz stał („aplikacja się zawiesza”). Aplikacja i demon działały.
- Naprawa: `Emulation.setDeviceMetricsOverride` z `screenWidth/Height` = okno (ekran silnika bez tego to 800×600); przy błędzie `video file` demon usuwa plik i zeruje `live/ino`. W pełnym ekranie silnik daje klatki w rozmiarze CSS (np. 1184×352), nie ×skala.
- `pageCss(w, h, zoom, q)`: obraz w `q` = 0.75 pikseli ekranu (opcja `picture`, env `G21_BROWSER_PICTURE` 1 / 0.75 / 0.5), stan `w`,`h` = rozmiar na ekranie (css × zoom), plik = css × zoom × q. Decyzja właściciela: zmniejszyć rozdzielczość tak, żeby nie było widać.
- Dźwięk: brak (`--mute-audio`). pllanaio/mgu-browser ma własny most do AudioManager/SmartX (`native/audio_bridge.c`, `docs/AUDIO.md`) — wzór na przyszłość; u nas `g21-audio-route.js` (AirPlay) łączy źródło 287/273 z wyjściem 1024, słyszalność UNVERIFIED.
- UNVERIFIED na aucie: wszystko powyżej; płynność po zmniejszeniu obrazu.

## Ograniczenia tej wersji

- Bez dźwięku stron (`--mute-audio`), bez pobierania plików, jedna karta, bez WebGL (`--disable-software-rasterizer`), bez emoji i pisma CJK (brak czcionek).
- Rasteryzacja strony na CPU. GPU w silniku: przełącznik `state/engine-flags` (wiersz `--enable-gpu` zdejmuje `--disable-gpu`), nietestowany — trzeba najpierw zobaczyć EGL/DRI na aucie.
- Silnik 153 jest o kilka wydań starszy niż bieżący stabilny Chrome (157 w listopadzie 2026): znane luki bezpieczeństwa nowszych wydań mogą go dotyczyć. Aktualizacja: nowy zip Google → `build-engine.js` → nowy `manifest.json` → podbić wersję narzędzia.
- Bez piaskownicy (gdy jądro jej nie da) silnik chroni tylko osobny uid i proxy.
- Hasła wpisywane na stronach zostają w profilu silnika (`/var/opt/g21-browser/cache/profile`, ciasteczka). Ostatnie adresy (bez zapytań) w `state/recent.json`.

## Prawo

Biblioteki w `lib/` to niezmienione pliki pakietów Ubuntu (LGPL, MPL, MIT i podobne; źródła: archiwum Ubuntu, lista w `LIBS.txt`). Czy samo wskazanie archiwum wystarcza dla każdej z tych licencji przy publicznym repo — nie rozstrzygam, to pytanie do prawnika. Tak samo są już dołączone biblioteki w `native/g21-airplay-open/lib`.
