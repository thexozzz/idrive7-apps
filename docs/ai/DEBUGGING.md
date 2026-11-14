# Diagnostyka

## Logi i pliki stanu

| Plik na MGU | Zawartość | Uwagi |
|---|---|---|
| `/tmp/g21-airplay-start.log` | cykl życia aplikacji, menu, dotyk, warstwy cluster | `noteStart()` w `main.js` |
| `/var/log/g21-uxplay.log` | UxPlay `-d 1` | **czyszczony przy każdym starcie UxPlay** |
| `/var/log/g21-avahi.log` | avahi | dopisywany |
| `/var/log/g21-rdp.log`, `g21-present.log`, `g21-mice.log` | klienci pulpitu, Win+K | |
| `/run/g21-airplay.status` | `stan|etykieta|ip` (`running`, `mdns-brak`, `uxplay-exit`, `missing`, `idle|brak-wifi`) | |
| `/run/g21-airplay/client` | `idle|waiting`, `pair|iphone`, `pair|pin-NNNN`, `mirroring|stream`, `error|mirror-port` | z `watch_ux_pin` |
| `/run/g21-desktop.status`, `/run/g21-session/{allow,output}` | sesje | |
| `/run/mgu-uplink/{status,lease}.json` | uplink Store | |
| journal | `journalctl -u g21-airplay-open` | niesprawdzone, czy journald trzyma |

Lokalnie: `1/dev-logs/*.txt` — **UTF-16LE**; konwersja: `iconv -f UTF-16 -t UTF-8` albo `Get-Content -Encoding Unicode`. Nie commitować (gitignored), mogą zawierać dane pojazdu.

## Bezpieczne polecenia odczytu (po zgodzie na połączenie)

Tylko czytanie, bez zmian stanu. Przekazywać przez `Invoke-DevSsh` bez `-AllowWrite`.

```sh
uname -a; cat /etc/os-release; uptime
cat /proc/meminfo | head -5; free 2>/dev/null
df -h /var/opt /run /dev/shm /tmp
cat /proc/cpuinfo | grep -m1 'model name'; nproc
ls /dev/dri 2>/dev/null; ls /usr/lib | grep -i va 2>/dev/null
top -b -n1 | head -25
ps w | grep -E 'g21|uxplay|avahi|mgu-render|cluster-render|HmiMain3D' | grep -v grep
ip -br addr; ip route; ip rule; ip route show table all | head -60
ss -lntup 2>/dev/null || netstat -lntup
cat /run/g21-airplay.status /run/g21-airplay/client /run/g21-session/allow 2>/dev/null
cat /run/mgu-uplink/status.json /run/mgu-uplink/lease.json
tail -n 300 /var/log/g21-uxplay.log; tail -n 200 /var/log/g21-avahi.log
grep ' /etc/' /proc/mounts
systemctl status g21-airplay-open --no-pager
journalctl -u g21-airplay-open -n 200 --no-pager
```

Uwaga: `nft list ruleset` jest odczytem, ale `_common.ps1` blokuje fragment `nft ` w trybie odczytu — wymaga świadomej decyzji (osobna zgoda, polecenie tylko `list`).

## Procedura dla problemu AirPlay „łączenie” (propozycja, nie wykonana)

1. Na postoju: włączyć AirPlay, poczekać na `running`.
2. Wybrać odbiornik na iPhonie; **nie przełączać nic w menu** przez 30 s.
3. Od razu odczytać: `/var/log/g21-uxplay.log`, `/run/g21-airplay/client`, `ss -tn | grep 740`, `ip route get 172.20.10.1 from 172.20.10.2`, ostatnie 50 linii `g21-avahi.log`, `ss -lunp | grep 5353`.
4. Porównać z hipotezami A1–A6 w AIRPLAY_ARCHITECTURE.md.

## Diagnostyka procesów i zasobów

- Pamięć procesu OAP: `grep -E 'VmRSS|VmHWM' /proc/<pid runner.js 12249>/status` (limit ~192 MB).
- CPU UxPlay: `top -b -n1 | grep uxplay`. GPU: brak narzędzia w repo (ewentualnie `/sys/kernel/debug/dri` — niesprawdzone, wymaga debugfs).
- Biblioteki: `/var/opt/g21-airplay-open/current/run-elf --list <elf>` (jeśli linker obsługuje) — niesprawdzone.
