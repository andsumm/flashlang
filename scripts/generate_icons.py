#!/usr/bin/env python3
"""Rasterize the existing flower mark into app icons, using only Python stdlib."""

from pathlib import Path
import math
import struct
import zlib


ASSETS = Path(__file__).resolve().parent.parent / 'assets'
NAVY = (32, 43, 60)
BLUE = (164, 217, 242)
ORANGE = (242, 139, 84)


def cubic(p0, p1, p2, p3, t):
    a = 1 - t
    return tuple(a*a*a*p0[i] + 3*a*a*t*p1[i] + 3*a*t*t*p2[i] + t*t*t*p3[i] for i in (0, 1))


def icon_png(size):
    # 3x supersampling gives smooth strokes without a graphics dependency.
    samples = 3
    width = size * samples
    pixels = bytearray(NAVY * (width * width))
    # Keep all artwork within the central 80% circle for Android maskable icons.
    unit = width / 64 * 0.88
    offset = (width - 64 * unit) / 2

    def disc(x, y, radius, color):
        x, y, radius = offset + x * unit, offset + y * unit, radius * unit
        for row in range(max(0, int(y-radius)), min(width, math.ceil(y+radius)+1)):
            dy = row + 0.5 - y
            if dy*dy > radius*radius:
                continue
            half = math.sqrt(radius*radius-dy*dy)
            start, end = max(0, math.ceil(x-half-0.5)), min(width, math.floor(x+half-0.5)+1)
            begin = (row * width + start) * 3
            pixels[begin:begin+(end-start)*3] = bytes(color) * (end-start)

    segments = [
        ((32,10),(40,10),(43,19),(43,21)),
        ((43,21),(45,21),(54,24),(54,32)),
        ((54,32),(54,40),(45,43),(43,43)),
        ((43,43),(43,45),(40,54),(32,54)),
        ((32,54),(24,54),(21,45),(21,43)),
        ((21,43),(19,43),(10,40),(10,32)),
        ((10,32),(10,24),(19,21),(21,21)),
        ((21,21),(21,19),(24,10),(32,10)),
    ]
    for points in segments:
        for step in range(size + 1):
            x, y = cubic(*points, step/size)
            disc(x, y, 1.25, BLUE)
    for step in range(size + 1):
        position = 22 + 20 * step/size
        disc(32, position, 1.25, BLUE)
        disc(position, 32, 1.25, BLUE)
    disc(47, 17, 5, ORANGE)

    rows = bytearray()
    for y in range(size):
        rows.append(0)  # PNG row filter: none.
        for x in range(size):
            sums = [0, 0, 0]
            for dy in range(samples):
                for dx in range(samples):
                    pos = (((y*samples+dy)*width) + x*samples+dx) * 3
                    for channel in (0, 1, 2):
                        sums[channel] += pixels[pos+channel]
            rows.extend(round(total/(samples*samples)) for total in sums)

    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind+data) & 0xffffffff)

    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b'')


if __name__ == '__main__':
    ASSETS.mkdir(exist_ok=True)
    for filename, size in (('icon-192.png', 192), ('icon-512.png', 512), ('apple-touch-icon.png', 180)):
        path = ASSETS / filename
        path.write_bytes(icon_png(size))
        print(f'Created {path.name}: {size}x{size}')
