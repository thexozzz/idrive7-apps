#!/bin/sh
# Builds g21-yuvring (static, no libraries: runs on the MGU as it is) from g21-yuvring.c.
set -eu
here=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
gcc -O2 -Wall -Wextra -static -o "$here/g21-yuvring" "$here/g21-yuvring.c"
strip "$here/g21-yuvring"
chmod 755 "$here/g21-yuvring"
echo "built $here/g21-yuvring"
