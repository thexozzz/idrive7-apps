#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# Builds g21-audio-out on Ubuntu 18.04 (glibc 2.27, the head unit's generation): dynamically linked, so it
# runs on the head unit's own loader and loads the head unit's libasound.so.2 with its SmartX plugin.
# The head unit has no /lib64: its loader is /lib/ld-linux-x86-64.so.2 (a binary that names /lib64/... there
# fails with "No such file or directory").
#   sh build-out.sh
set -eu
d=$(cd "$(dirname "$0")" && pwd)
cc -std=gnu99 -O2 -fstack-protector-strong -D_FORTIFY_SOURCE=2 -Wall -Wextra \
    -Wl,-z,relro,-z,now -Wl,--dynamic-linker=/lib/ld-linux-x86-64.so.2 \
    "$d/g21-audio-out.c" -o "$d/g21-audio-out" -ldl -lm
strip "$d/g21-audio-out"
ls -l "$d/g21-audio-out"
