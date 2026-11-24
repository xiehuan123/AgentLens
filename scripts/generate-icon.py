#!/usr/bin/env python3
"""Render the AgentLens mark and macOS icon using the Python standard library."""
from math import hypot
from pathlib import Path
import struct
import zlib

ROOT = Path(__file__).resolve().parent.parent


def segment_distance(x, y, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    t = min(1, max(0, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)))
    return hypot(x - a[0] - t * dx, y - a[1] - t * dy)


def coverage(distance, size):
    return min(1, max(0, 0.5 - distance * size))


def mix(base, color, alpha):
    return tuple(round(a + (b - a) * alpha) for a, b in zip(base, color))


def render(size):
    pixels = bytearray()
    trace = ((.255, .477), (.365, .477), (.427, .359), (.513, .526), (.624, .426))
    for row in range(size):
        pixels.append(0)
        y = (row + .5) / size
        for col in range(size):
            x = (col + .5) / size
            dx, dy = abs(x - .5) - .30, abs(y - .5) - .30
            edge = hypot(max(dx, 0), max(dy, 0)) + min(max(dx, dy), 0) - .145
            alpha = coverage(edge, size)
            if not alpha:
                pixels.extend((0, 0, 0, 0))
                continue
            violet = min(1, max(0, .94 - .62 * x - .44 * y))
            color = mix((23, 22, 52), (77, 49, 154), violet)
            ring = abs(hypot(x - .444, y - .435) - .236) - .024
            handle = segment_distance(x, y, (.615, .608), (.758, .751)) - .041
            color = mix(color, (239, 236, 255), coverage(min(ring, handle), size))
            if .21 < x < .66 and .31 < y < .57:
                path = min(segment_distance(x, y, a, b) for a, b in zip(trace, trace[1:])) - .015
                dot = min(hypot(x-a, y-b) for a, b in (trace[0], trace[-1])) - .022
                color = mix(color, (109, 244, 207), coverage(min(path, dot), size))
            pixels.extend((*color, round(alpha * 255)))

    def chunk(kind, payload):
        return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload))

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(pixels)) + chunk(b"IEND", b"")


if __name__ == "__main__":
    icon = render(512)
    (ROOT / "icons/icon.png").write_bytes(icon)
    (ROOT / "icons/icon.icns").write_bytes(
        b"icns" + struct.pack(">I", len(icon) + 16) + b"ic09" + struct.pack(">I", len(icon) + 8) + icon
    )
    (ROOT / "ui/icon.png").write_bytes(render(64))
