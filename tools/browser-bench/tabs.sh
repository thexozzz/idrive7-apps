#!/bin/sh
# tabs.sh [n]: tabs.js n times on each picture path, as the user kkds (run as root in the development distribution)
REPO=${REPO:-/mnt/c/Users/thexo/Documents/BMW-APLIKACJE/1}
mkdir -p /run/g21-browser && ln -sf /opt/scr/bench/lib/ld-linux-x86-64.so.2 /run/g21-browser/ld.so
chown kkds /run/g21-browser; chmod 1777 /tmp
i=0
while [ $i -lt ${1:-1} ]; do
  for m in direct cast; do
    a=""; [ $m = cast ] && a=cast
    su kkds -c "cd /tmp && REPO=$REPO timeout 170 /opt/scr/bench/node/bin/node $REPO/tools/browser-bench/tabs.js $a" 2>&1 | grep 'FAIL\|TIMEOUT\|^tabs: \|^engine: '
    pkill -9 -u kkds -f /opt/scr/bench/engine/chrome 2>/dev/null
  done
  i=$((i+1))
done
