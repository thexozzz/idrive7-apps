#!/bin/sh
# Rebuilds uxplay.bin from third_party/UxPlay (FDH2/UxPlay v1.73.7, GPL-3.0).
# The MGU userland is Linux 4.14 / glibc 2.27. Build on a system with that glibc.
# This does not replace uxplay (the wrapper) or lib/. Those are the runtime
# the head unit actually starts.
set -eu

here=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
root=$(CDPATH= cd -- "$here/../.." && pwd)
src=$root/third_party/UxPlay
build=$here/build
cmake -S "$src" -B "$build" -DNO_X11_DEPS=ON -DNO_MARCH_NATIVE=ON
cmake --build "$build" --target uxplay
cp "$build/uxplay" "$here/uxplay.bin"
chmod 755 "$here/uxplay.bin"
echo "built $here/uxplay.bin from $src"
