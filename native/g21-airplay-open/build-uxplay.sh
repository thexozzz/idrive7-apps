#!/bin/sh
# Builds the UxPlay sources in third_party/UxPlay (FDH2/UxPlay v1.73.7, GPL-3.0).
# The MGU userland is Linux 4.14 / glibc 2.27. Build on a system with that glibc.
# Output: native/g21-airplay-open/uxplay, beside the service script.
set -eu

here=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
root=$(CDPATH= cd -- "$here/../.." && pwd)
src=$root/third_party/UxPlay
build=$here/build
cmake -S "$src" -B "$build" -DNO_X11_DEPS=ON -DNO_MARCH_NATIVE=ON
cmake --build "$build" --target uxplay
cp "$build/uxplay" "$here/uxplay"
chmod 755 "$here/uxplay"
echo "built $here/uxplay from $src"
