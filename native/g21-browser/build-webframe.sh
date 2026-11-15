#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# g21-webframe: one static binary (no shared library of the head unit or of the build machine is used).
set -eu
cd "$(dirname "$0")"
gcc -O2 -static -fwrapv -Wall -Wextra -o g21-webframe g21-webframe.c
strip g21-webframe
ls -l g21-webframe
