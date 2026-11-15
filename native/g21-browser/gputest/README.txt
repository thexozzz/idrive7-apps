ffmpeg-va: FFmpeg 4.4.4 (https://ffmpeg.org/releases/ffmpeg-4.4.4.tar.xz), LGPL-2.1-or-later configuration (no --enable-gpl),
built on Ubuntu 18.04 with the headers of libva 2.0.0, then pointed at the car's libva.so.1 / libva-drm.so.1 and
/lib/ld-linux-x86-64.so.2 (patchelf). Decoders h264/hevc/vp9/vp8/aac with VA-API hwaccels.
test720.mp4: 20 s of FFmpeg's testsrc2 pattern, H.264 High 1280x720 30 fps. Used only by "Test GPU".
