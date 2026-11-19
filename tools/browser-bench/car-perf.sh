#!/bin/sh
# The browser's own measurements from the car (read only): the "graphics:", "perf:" and "direct frames:" lines of
# g21-browserd's log, the rule in force and the engine's processes. Run it parked, after a minute of scrolling and a
# film with each picture path (Aplikacje > Ustawienia > "Tor obrazu").
#   sh car-perf.sh [user@host] [ssh key]
HOST=${1:-root@100.125.63.29}
KEY=${2:-$(dirname "$0")/../../ssh/id_rsa}
ssh -o ConnectTimeout=10 -o BatchMode=yes -i "$KEY" "$HOST" '
L=/var/opt/g21-browser/log/browserd.log
echo "== rule"; grep -o "\"frames\": *\"[a-z0-9]*\"" /run/g21-browser/policy.json 2>/dev/null
echo "== graphics / path"; grep -E "graphics:|direct frames:|wlframe:|engine up|engine exited|engine start failed" $L | tail -n 20
echo "== perf"; grep "perf:" $L | tail -n 40
echo "== processes"; ps | grep -E "engine-|g21-wlframe|g21-webframe|g21-browserd" | grep -v grep | head -n 30
echo "== load"; cat /proc/loadavg; grep -E "MemAvailable|MemFree" /proc/meminfo
'
