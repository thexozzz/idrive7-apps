#!/usr/bin/env python3
# The newest picture of a video file (MGVF, I420) as a colour PNG:  ring2png.py <video file> <png>
import struct, sys, zlib
d = open(sys.argv[1], 'rb').read()
magic, one, w, h, seq, slot, nslot = struct.unpack_from('<7I', d, 0)
fr = w * h * 3 // 2
o = 64 + slot * fr
Y = d[o:o + w * h]; U = d[o + w * h:o + w * h + (w // 2) * (h // 2)]; V = d[o + w * h + (w // 2) * (h // 2):o + fr]
rows = bytearray()
cl = lambda v: 0 if v < 0 else (255 if v > 255 else int(v))
for y in range(h):
    rows.append(0)
    cy = (y // 2) * (w // 2)
    for x in range(w):
        yy = (Y[y * w + x] - 16) * 1.164; u = U[cy + x // 2] - 128; v = V[cy + x // 2] - 128
        rows += bytes((cl(yy + 1.596 * v), cl(yy - 0.392 * u - 0.813 * v), cl(yy + 2.017 * u)))
def chunk(t, b): return struct.pack('>I', len(b)) + t + b + struct.pack('>I', zlib.crc32(t + b) & 0xffffffff)
open(sys.argv[2], 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(bytes(rows), 6)) + chunk(b'IEND', b''))
print('%dx%d seq %d slot %d' % (w, h, seq, slot))
