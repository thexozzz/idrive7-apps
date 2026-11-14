# Architektura sieci

## Interfejsy (wg kodu i logów)

| Interfejs | Rola | Status | Źródło |
|---|---|---|---|
| `wlan0` | Wi-Fi klient zarządzany przez `mgu-uplink` (Store): hotspot iPhone'a 172.20.10.0/28 albo inna sieć | VERIFIED | log avahi, `docs/airplay-integracja.md` |
| `wlan_bridge` | hotspot BMW (CarPlay bezprzewodowy, klienci w aucie) | ASSUMPTION (komentarz w `start_ux`, `NamelsMissing/mgu-apps`) | |
| `vlan73` | trasa multicast 224.0.0.0/4 domyślnie tędy | VERIFIED (komentarz w `open_ports`) | |
| `socnet0` + VLAN-y | Ethernet do sieci auta (SOME/IP, TCB, KOMBI) | ASSUMPTION (idrive7-apps README §4.1) | |
| `lo`, `127.0.0.2` | SOCKS5 Tailscale userspace (port z `/var/opt/iteriodev-tailscale/socks5-port`, domyślnie 1055) | VERIFIED kod | `ensure_tailscale_socks5` |
| Tailscale 100.64.0.0/10 | SSH do MGU z PC, RDP/VNC do PC | VERIFIED (adresy w skryptach) | `_common.ps1` |

## Zapora (nftables)

Fabryczne: `ip filter input` z końcowym `logblocked` („Blocking unknown connection”), Store: `inet mgu_uplink` (drop na Wi-Fi Store, wyjątki po `skuid`). Renderer dodaje własną tabelę `ip mgu_render` (przekierowanie dotyku UDP 30567→30570). — VERIFIED (komentarze kodu, PROTOCOL.md).

Nasze reguły (`open_ports`), wszystkie z komentarzem `g21-airplay`, ograniczone do `iifname wlan0` i podsieci dzierżawy:

| Kierunek | Porty | Cel |
|---|---|---|
| in | UDP 5353 (+ `224.0.0.251`) | mDNS |
| in | TCP/UDP 7400–7499 | UxPlay `-p 7400` |
| in | TCP 1235 | panel konfiguracji RDP |
| in | TCP 7250, UDP 1028/1029 | MS-MICE (Win+K) |
| out | UDP 5353, TCP/UDP sport 7400–7499, cały ruch do podsieci | odpowiedzi |

Wstawiane w łańcuchy **fabryczne/Store** (`nft insert rule inet mgu_uplink …`, `nft insert rule ip filter input …`), usuwane po `handle` w `idle()`. To zmiana runtime w konfiguracji systemowej (nietrwała po restarcie) — patrz KNOWN_ISSUES K-04. — VERIFIED kod.

## Porty zajęte przez system

TCP 7000 CarPlay, TCP 7101 `airplay-rx` → legacy porty UxPlay (7000/7001/7100) dawały errno 98. — VERIFIED (odczyt 2026-11-12, H31).

## mDNS

- BMW `mdnsd` (Apple Bonjour) działa zawsze; bundlowany avahi 0.7 startuje obok tylko dla naszych usług → dwa stosy na 5353 (ostrzeżenie avahi). — VERIFIED.
- Avahi wymaga konta `avahi` i polityki D-Bus: narzędzie kopiuje `/etc/passwd`, `/etc/group`, `/etc/dbus-1/system.d` do `/run/g21-airplay/` i **bind-mountuje** je na oryginały, potem `ReloadConfig` D-Bus. — VERIFIED (`ensure_avahi_account`, `ensure_avahi_dbus`). Skutek dla innych procesów BMW: UNVERIFIED.

## Uplink i internet

`mgu-uplink` daje sieć aplikacjom z `mguInternet: true` (nasza ma) przez USB/LTE/tethering/Wi-Fi; własny hotspot BMW i CarPlay bezprzewodowy działają obok. — ASSUMPTION (mgu-store README cytowany w `docs/07-zaleznosci.md`).

## RDP/VNC do PC

Adresy 100.64/10 → SOCKS5 Tailscale (`socks5.js`); narzędzie w razie braku nasłuchu robi `systemctl restart iteriodev-tailscale.service` i zapisuje plik konfiguracyjny w katalogu tamtego narzędzia. LAN (hotspot) bezpośrednio. — VERIFIED kod; K-05.
