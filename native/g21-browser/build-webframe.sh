#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# g21-webframe: one static binary (no shared library of the head unit or of the build machine is used).
set -eu
cd "$(dirname "$0")"
gcc -O2 -static -fwrapv -Wall -Wextra -o g21-webframe g21-webframe.c
strip g21-webframe
ls -l g21-webframe
# g21-wlframe: the same way (the direct frame path; no library at all, Wayland is written out by hand)
gcc -O3 -static -fwrapv -Wall -Wextra -o g21-wlframe g21-wlframe.c
strip g21-wlframe
ls -l g21-wlframe
