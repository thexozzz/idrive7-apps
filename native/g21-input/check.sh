#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# mgu-deploy "check" (the controller is not touched): the parts are in place and the head unit has the
# SOME/IP binding and the catalog the interface schemas are made from.
set -eu
d=$(cd "$(dirname "$0")" && pwd)
exec /usr/bin/node "$d/g21-inputd.js" --check
