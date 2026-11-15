#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# mgu-deploy "check" (nothing is played, the audio manager is not touched): the parts are in place, the
# head unit has the group the PCM writer runs in and the catalog speakers.js makes its interfaces from.
set -eu
d=$(cd "$(dirname "$0")" && pwd)
test -r /etc/oap/someip/someip-interfaces.json
test -r /usr/lib/someip.node
exec /usr/bin/node "$d/g21-audiod.js" --check
