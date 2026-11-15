#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# mgu-deploy "check" (offline on purpose): the engine manifest reads, every packed part has its size,
# node22 can unpack brotli, the libraries and the frame decoder are in place. Nothing is unpacked or run here.
set -eu
d=$(cd "$(dirname "$0")" && pwd)
exec /var/opt/jap-node22/current/bin/node "$d/g21-browserd.js" --check
