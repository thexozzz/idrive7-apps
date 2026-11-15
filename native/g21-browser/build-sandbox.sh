#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# Builds g21-chrome-sandbox: Chromium's setuid sandbox helper (sandbox/linux/suid, BSD licence, see
# sandbox-src/LICENSE.chromium), unchanged sources of the tag the engine is (153.0.8010.12), linked
# statically so it needs nothing of the head unit. Build on Ubuntu 18.04 (the head unit's generation):
#   sh build-sandbox.sh
# The head unit's kernel (4.14.198-apl) has no user namespaces, so the engine's own sandbox needs this
# helper: root-owned, mode 4755, beside the engine (g21-browserd.js puts it there).
set -eu
d=$(cd "$(dirname "$0")" && pwd)
cc -std=gnu99 -O2 -static -fstack-protector-strong -D_FORTIFY_SOURCE=2 -Wall -Wl,-z,relro,-z,now \
    -I"$d/sandbox-src" \
    "$d/sandbox-src/sandbox/linux/suid/sandbox.c" "$d/sandbox-src/sandbox/linux/suid/process_util_linux.c" \
    -o "$d/g21-chrome-sandbox"
strip "$d/g21-chrome-sandbox"
ls -l "$d/g21-chrome-sandbox"
