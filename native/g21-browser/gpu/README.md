# gpu/ – the GPU mode's libEGL.so.1

`egl_shim.c`, `fake_egl.c` and `egl_pbuffer_test.c` are from
[Vizualyse/idrive-apps](https://github.com/Vizualyse/idrive-apps), `native/vizualyse-chromium/gpu`
(Copyright (C) 2026 Yousaf Khan, GPL-3.0-or-later), unchanged. See the head of `egl_shim.c` for what it does and why:
ANGLE's GLES backend (`--use-angle=gles-egl`) on the head unit's own Mesa 19 EGL, on the render node through GBM, with
pbuffers made from GBM surfaces. Its two settings keep their names: `CHROMIUM_EGL_REAL` (the unit's `libEGL.so.1`) and
`CHROMIUM_EGL_NODE` (the render node).

`libEGL.so.1` here is that file built by `../build-gpu.sh` on Ubuntu 18.04 (glibc 2.27). It is loaded only by the
engine's graphics process and only in the GPU mode (g21-browserd.js, "The GPU mode"). No graphics driver is shipped:
one that did not come from the unit hung the unit's kernel in that project.
