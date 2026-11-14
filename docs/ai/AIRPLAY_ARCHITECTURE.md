# AirPlay — architektura i stan diagnozy

Zgłoszony problem (brief właściciela): iPhone **widzi** odbiornik, ale po wybraniu go zostaje w stanie „łączenie”. Poniżej każdy etap z dowodami. Nie zakładamy z góry winy sieci, dekodera ani renderera.

## Topologia

```
iPhone (host Personal Hotspot, 172.20.10.1/28)
   │ Wi-Fi
MGU wlan0 = klient (mgu-uplink Store), 172.20.10.2   ← VERIFIED log avahi 2026-11-12
   ├─ avahi-daemon (bundlowany, root, --no-drop-root, allow-interfaces=wlan0, host-name=G21)
   ├─ BMW mdnsd (fabryczny, też UDP 5353)            ← avahi: "Detected another IPv4 mDNS stack"
   ├─ uxplay.bin -p 7400 → TCP 7400/7401/7402, UDP 7400/7401/7402, bind tylko 172.20.10.2 (LD_PRELOAD g21-bind-wlan.so)
   ├─ CarPlay TCP 7000, airplay-rx TCP 7101 (fabryczne, nie ruszać)
   └─ wlan_bridge = hotspot BMW (CarPlay bezprzewodowy) — nasz odbiornik celowo tam NIE słucha
```

Źródła: `native/g21-airplay-open/g21-airplay-open` (`find_uplink_wifi`, `open_ports`, `ensure_mdns`, `start_ux`), `dev-logs/mgu-logs-20261112-*.txt`.

## Etapy i status

| # | Etap | Implementacja | Status | Dowód |
|---|---|---|---|---|
| 1 | Włączenie | menu → `/run/g21-session/allow=airplay` → pętla narzędzia `apply_airplay` | VERIFIED | log `choose airplay`, `session-ok airplay starting` |
| 2 | Wymóg sieci | `mgu-uplink` kind=wifi, link online/connected, lease iface/ip/prefix | VERIFIED | kod; avahi na wlan0 172.20.10.2 |
| 3 | Zapora | reguły z komentarzem `g21-airplay` wstawiane na **początek** fabrycznych łańcuchów `inet mgu_uplink input/output` i `ip filter input` + własna tabela `inet g21_airplay` (audyt) | VERIFIED kod; skuteczność UNVERIFIED | `open_ports` |
| 4 | Trasy | `ip route replace 224.0.0.251/32 dev wlan0` (BMW kieruje multicast przez vlan73); `ip route replace <lease-net> dev wlan0 src <ip>` przy każdym `apply` (mgu-uplink potrafi ją usuwać → SYN-ACK nie wychodził) | VERIFIED kod; wcześniejszy objaw opisany w commicie „Restore on-link Wi-Fi route so AirPlay handshake can reach the iPhone” | `open_ports`, `apply_airplay` |
| 5 | DNS-SD | UxPlay → `libdns_sd.so.1` (kompatybilność Avahi) → avahi przez D-Bus; BMW Bonjour odrzuca obcego klienta (`kDNSServiceErr_Unknown`) | VERIFIED (H40, H46) | `docs/airplay-integracja.md` |
| 6 | Odkrycie na iPhonie | `_airplay._tcp` / `_raop._tcp`, nazwa z menu (domyślnie THEiPlay/G21) | VERIFIED wg właściciela | brief |
| 7 | Połączenie TCP z :7401 (httpd RAOP) | UxPlay | **UNVERIFIED** — brak logu `connection request from` | logi z 2026-11-12 mają tylko linie startowe |
| 8 | Parowanie / autoryzacja | `-pin NNNN` (PAIR-PIN-START) lub tryb open (bez kodu, domyślny); wcześniej `-pw` (nie wywoływał promptu iOS) | UNVERIFIED | `start_ux`, CHANGELOG 0.1.69–0.1.73 |
| 9 | SETUP strumienia lustra | TCP 7400 (dane), UDP timing/control; nft 7400–7499 | UNVERIFIED | |
| 10 | Odbiór i dekodowanie H.264 | `avdec_h264` (programowo), `-s 600x400 -fps 24`, `-vsync no`, `fakesink async=false` | UNVERIFIED na aucie | `start_ux`, `video_renderer.c` |
| 11 | Klatka → aplikacja | `/run/g21-airplay/latest.yuv` (G21Y I420) | UNVERIFIED | |
| 12 | Renderer → ekran | `/dev/shm/mgu-video-g21airplay` + op 19 | UNVERIFIED | |
| 13 | Rozłączenie | watcher logu: po `Connection closed`/`Stopping RAOP` po sesji lustra → restart UxPlay (lepki port 7400) | VERIFIED kod | `watch_ux_pin` |

CHANGELOG 0.1.84–0.1.121 opisuje strojenie FPS, kolorów atlasu i „pierwsza klatka nie czeka” — to sugeruje, że w pewnym momencie obraz dochodził. **Nie ma na to logu w repo** (ostatni log 2026-11-12 17:04, wersje ~0.1.60). Status sesji: UNVERIFIED, nie BROKEN ani działa.

## Dlaczego obecne dowody nie wystarczają

1. `start_ux` robi `: > /var/log/g21-uxplay.log` przy **każdym** starcie, a pętla restartuje UxPlay m.in. przy zmianie PID avahi, przełączeniu PIN/open, „lepkim” porcie i po rozłączeniu. Ślad nieudanej próby łatwo ginie. — VERIFIED kod.
2. `dev-logs.ps1` pobiera tylko `tail -n 120` i zapisuje przez `Tee-Object` (UTF-16 w PowerShell 5.1). — VERIFIED.
3. Brak przechwyconego stanu gniazd (`ss -tn`), liczników nft i `ip rule` w chwili zawieszenia.

## Hipotezy przyczyny „łączenia” (do weryfikacji, żadna nie jest potwierdzona)

| Id | Hipoteza | Za | Jak sprawdzić (odczyt) |
|---|---|---|---|
| A1 | Dwa responder-y mDNS na UDP 5353 (BMW mdnsd + avahi): iPhone dostaje usługę, ale rozwiązanie SRV/A lub odpowiedź unicast trafia do mdnsd → zły/brak adresu | ostrzeżenie avahi w każdym starcie | `ss -lunp | grep 5353`; log UxPlay bez `connection request` przy próbie |
| A2 | Odpowiedzi TCP (SYN-ACK) wychodzą złą trasą przez routing polityk `mgu-uplink` (proces root bez znacznika) lub trasa on-link znika między `apply` | wcześniejszy identyczny objaw; komentarz w kodzie | `ip rule`, `ip route show table all`, `ip route get 172.20.10.1 from 172.20.10.2`, `ss -tn state syn-recv` w trakcie próby |
| A3 | Pakiety przychodzące nadal odrzucane przez inny łańcuch (np. inny hook/priorytet niż `ip filter input`, `logblocked`) | wymagało już trzech iteracji reguł | `nft list ruleset` (odczyt) z licznikami; `dmesg | grep -i block` |
| A4 | Restart UxPlay w trakcie parowania (pętla `apply` co ~1 s: zmiana PID avahi → `stop_ux`) przerywa handshake | logika `start_ux` przy zmianie AVAHIPID; logi pokazują częste SIGTERM avahi | porównać czasy w `g21-avahi.log` i `g21-uxplay.log` |
| A5 | Parowanie: iOS czeka na PIN/hasło, którego nie widać (fakesink nie pokaże obrazu PIN) albo tryb `-nh`/MAC | historia zmian `-pw`→`-pin`→open | log `CLIENT MUST NOW ENTER PIN`, `/run/g21-airplay/client` |
| A6 | Blokada strumienia lustra (TCP 7400 / UDP timing) po udanym parowaniu | | log `raop_rtp_mirror starting mirroring` |

## Współpraca z CarPlay i hotspotami

- Bezprzewodowy CarPlay = iPhone jako **klient** Wi-Fi BMW (`wlan_bridge`). Nasz AirPlay = MGU jako **klient** hotspotu iPhone'a (`wlan0`). iPhone nie może jednocześnie hostować hotspotu i być klientem sieci BMW → w tej topologii CarPlay bezprzewodowy i THEiPlay są praktycznie wzajemnie wykluczające. — ASSUMPTION (wiedza o iOS, niesprawdzone na aucie).
- Alternatywa: odbiornik na `wlan_bridge` (telefon w hotspocie BMW). Inny projekt na G21 otwiera port na `wlan_bridge` dla własnej usługi (`NamelsMissing/mgu-apps` `apps/mgu_video_hub/README.md`). Ryzyko kolizji z fabrycznym AirPlay CarPlay (porty 7000/7101, ten sam mDNS). — PLANNED/ASSUMPTION.
- Hotspot BMW → internet przez TCB; nie jest uplinkiem Store. — ASSUMPTION.

## Pliki do pracy nad AirPlay

`native/g21-airplay-open/g21-airplay-open` (całość), `third_party/UxPlay/renderers/video_renderer.c`, `apps/g21_airplay/src/main.js` (`_takeFrame`, `_startVideoTimer`, statusy `RECEIVER_STATUS`), `mirror_video.js`, `video_router.js`, `menu_draw.js` (op VIDEO), `tools/test_airplay.js`.
