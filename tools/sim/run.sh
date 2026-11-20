#!/bin/sh
# tools/sim/run.sh <script.js> [args]: a script of the stand, as the user kkds, with the places the app expects
# (/run/mgu-renderd, /run/g21-input, /run/g21-browser) made for it. As root, in the development distribution.
REPO=${REPO:-/mnt/c/Users/thexo/Documents/BMW-APLIKACJE/1}
N=/opt/scr/bench/node/bin/node
U=${SIM_USER:-kkds}
for d in /run/mgu-renderd /run/g21-input /run/g21-browser; do mkdir -p $d && chown $U $d; done
ln -sf /opt/scr/bench/lib/ld-linux-x86-64.so.2 /run/g21-browser/ld.so
chmod 1777 /tmp
DIR=${SIM_DIR:-/tmp/theiplay-sim}
rm -rf $DIR; mkdir -p $DIR; chown $U $DIR
s=$1; shift
su $U -c "cd $REPO/tools/sim && SIM_VERSION=${SIM_VERSION:-sim} exec $N $NODE_FLAGS $s ${SIM_REPO:-$REPO} $DIR $*"
rc=$?
[ -n "$SIM_OUT" ] && mkdir -p "$SIM_OUT" && cp -f $DIR/shots/*.png "$SIM_OUT"/ 2>/dev/null
pkill -9 -u $U -f /opt/scr/bench/engine/chrome 2>/dev/null
exit $rc
