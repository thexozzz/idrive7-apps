ffmpeg-va: FFmpeg 4.4.4 (https://ffmpeg.org/releases/ffmpeg-4.4.4.tar.xz), LGPL-2.1-or-later configuration (no --enable-gpl),
built on Ubuntu 18.04. The decoder of THEiPlay Player and of "Test GPU".
VA-API: headers of libva 2.0.0 with VAImageFormat (32 bytes) and VAImage (96 bytes) laid out as the car's libva 1.99
has them (read on the car, 2026-11-15); linked for libva.so.1 / libva-drm.so.1 and /lib/ld-linux-x86-64.so.2; the calls
of vaSetErrorCallback and vaSetInfoCallback are removed (the car's libva does not have them).
Decoders h264 hevc vp9 vp8 aac opus vorbis mp3 ac3; demuxers mov matroska mpegts flv; input from files and pipes only.
test720.mp4: 20 s of FFmpeg's testsrc2 pattern, H.264 High 1280x720 30 fps. Used only by "Test GPU".
