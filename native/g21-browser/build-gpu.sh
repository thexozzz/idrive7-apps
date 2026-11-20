#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# Builds the two parts of the GPU mode on Ubuntu 18.04 (glibc 2.27, the head unit's generation):
#   gpu/libEGL.so.1    gpu/egl_shim.c: loaded into the engine's graphics process (the engine's own, newer C library
#                      takes a library built for an older one)
#   g21-wlframe-gpu    g21-wlframe.c with -DG21_GPU: runs on the head unit's own loader and C library, because it
#                      loads the unit's EGL, GLES and GBM (the unit's loader is /lib/ld-linux-x86-64.so.2, no /lib64)
# and checks the shim's pbuffers against a stand-in EGL (gpu/fake_egl.c), as its authors do at every build.
#   sh build-gpu.sh
set -eu
d=$(cd "$(dirname "$0")" && pwd)
gcc -O2 -std=gnu11 -Wall -Wextra -shared -fPIC -fstack-protector-strong -Wl,-z,relro,-z,now \
    -Wl,-soname,libEGL.so.1 -o "$d/gpu/libEGL.so.1" "$d/gpu/egl_shim.c" -ldl -lpthread
strip "$d/gpu/libEGL.so.1"
gcc -O3 -fwrapv -Wall -Wextra -fstack-protector-strong -D_FORTIFY_SOURCE=2 -DG21_GPU \
    -Wl,-z,relro,-z,now -Wl,--dynamic-linker=/lib/ld-linux-x86-64.so.2 \
    -o "$d/g21-wlframe-gpu" "$d/g21-wlframe.c" -ldl
strip "$d/g21-wlframe-gpu"
t=$(mktemp -d)
gcc -O2 -std=gnu11 -Wall -Wextra -shared -fPIC -o "$t/fake_egl.so" "$d/gpu/fake_egl.c"
gcc -O2 -std=gnu11 -Wall -Wextra -o "$t/egl_pbuffer_test" "$d/gpu/egl_pbuffer_test.c" -ldl
"$t/egl_pbuffer_test" "$d/gpu/libEGL.so.1" "$t/fake_egl.so"
rm -rf "$t"
ls -l "$d/gpu/libEGL.so.1" "$d/g21-wlframe-gpu"
