#!/bin/sh
# Development machine: the full engine as the head unit runs it (loader path patched, the head unit's libraries),
# and Node 22, under /opt/scr/bench. Nothing is installed into the system.
set -e
REPO=${REPO:-$(cd "$(dirname "$0")/../.." && pwd)}
L=$REPO/native/g21-browser/lib
S=/opt/scr/cft/chrome-linux64
B=/opt/scr/bench
mkdir -p $B /run/g21-browser
if [ ! -x $B/engine/chrome ]; then
  rm -rf $B/engine; mkdir -p $B/engine; cp -r $S/. $B/engine/
  python3 - "$B/engine/chrome" "$B/engine/chrome_crashpad_handler" <<'PY'
import struct, sys
for p in sys.argv[1:]:
    with open(p, 'r+b') as f:
        eh = f.read(64)
        phoff, = struct.unpack_from('<Q', eh, 32)
        phentsize, phnum = struct.unpack_from('<HH', eh, 54)
        for i in range(phnum):
            f.seek(phoff + i * phentsize)
            ph = f.read(phentsize)
            if struct.unpack_from('<I', ph, 0)[0] == 3:
                off, = struct.unpack_from('<Q', ph, 8)
                size, = struct.unpack_from('<Q', ph, 32)
                f.seek(off)
                f.write(b'/run/g21-browser/ld.so'.ljust(size, bytes([0])))
PY
  chmod 755 $B/engine/chrome $B/engine/chrome_crashpad_handler
fi
rm -rf $B/lib; cp -r $L $B/lib; chmod -R a+rx $B/lib
ln -sf $B/lib/ld-linux-x86-64.so.2 /run/g21-browser/ld.so
if [ ! -x $B/node/bin/node ]; then
  mkdir -p $B/node && tar -C $B/node --strip-components=1 -xf /opt/g21-vm/node-v22.12.0-linux-x64-glibc-217.tar.xz
fi
cp $REPO/native/g21-browser/g21-webframe $REPO/native/g21-browser/g21-wlframe $B/; cp $REPO/tools/browser-bench/bench.js $REPO/tools/browser-bench/e2e.js $REPO/tools/browser-bench/runs.sh $REPO/tools/browser-bench/ring2png.py $B/; :  $B/g21-webframe; chmod 755 $B/g21-webframe $B/g21-wlframe
chmod -R a+rX $B
$B/node/bin/node -v
ls $B
