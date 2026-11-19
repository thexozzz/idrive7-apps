#!/bin/sh
# runs.sh "<ENV=..|-> <scene> <seconds> <gap> [switches]" ...   each argument one run, as the user kkds
N=/opt/scr/bench/node/bin/node
# (/run is made anew whenever the distribution starts)
mkdir -p /run/g21-browser && ln -sf /opt/scr/bench/lib/ld-linux-x86-64.so.2 /run/g21-browser/ld.so
for r in "$@"; do
  set -- $r
  e=$1; shift
  [ "$e" = "-" ] && e=""
  e=$(echo "$e" | tr ',' ' ')
  su kkds -c "env $e $N /opt/scr/bench/bench.js $*" > /tmp/bench.out 2>/tmp/bench.err
  grep '^{' /tmp/bench.out | cut -c1-${CUT:-430} || true
  grep -q '^{' /tmp/bench.out || { echo "RUN FAILED: $r"; tail -c 300 /tmp/bench.err; }
  pkill -9 -u kkds chrome 2>/dev/null
  sleep 1
done
