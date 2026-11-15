ffmpeg-va: FFmpeg 4.4.4 (https://ffmpeg.org/releases/ffmpeg-4.4.4.tar.xz), LGPL-2.1-or-later configuration (no --enable-gpl),
built on Ubuntu 18.04 with the headers of libva at commit 0fd48763 (2017-09-08, https://github.com/intel/libva), the
last one before the va_reserved fields: the layout the car's libva 1.99 (VA-API 0.99) has. Linked for libva.so.1 /
libva-drm.so.1 and /lib/ld-linux-x86-64.so.2; the calls of vaSetErrorCallback and vaSetInfoCallback are removed
(sed on libavutil/hwcontext_vaapi.c), the car's libva does not have them.
test720.mp4: 20 s of FFmpeg's testsrc2 pattern, H.264 High 1280x720 30 fps. Used only by "Test GPU".
