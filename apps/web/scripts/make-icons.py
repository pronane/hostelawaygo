#!/usr/bin/env python3
"""Generate the PWA icons (no image libraries required).

Draws a coral gradient tile with a white map pin. Run from apps/web:

    python3 scripts/make-icons.py
"""
import pathlib
import struct
import zlib

OUT = pathlib.Path(__file__).resolve().parent.parent / "public" / "icons"


def chunk(tag: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def write_png(path: pathlib.Path, width: int, height: int, rows: list[bytes]) -> None:
    raw = b"".join(b"\x00" + row for row in rows)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)


def in_circle(u: float, v: float, cx: float, cy: float, r: float) -> bool:
    return (u - cx) ** 2 + (v - cy) ** 2 <= r * r


def in_triangle(u: float, v: float, a, b, c) -> bool:
    def sign(p, q, r):
        return (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1])

    d1 = sign((u, v), a, b)
    d2 = sign((u, v), b, c)
    d3 = sign((u, v), c, a)
    has_neg = d1 < 0 or d2 < 0 or d3 < 0
    has_pos = d1 > 0 or d2 > 0 or d3 > 0
    return not (has_neg and has_pos)


def render(size: int, scale: float) -> list[bytes]:
    """scale < 1 shrinks the pin, for the maskable safe-zone variant."""
    cx, cy, r = 0.5, 0.42, 0.235 * scale
    hole = r * 0.36
    top = (cx - r * 0.56, cy + r * 0.5)
    right = (cx + r * 0.56, cy + r * 0.5)
    tip = (cx, cy + r * 1.58)

    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            acc_r = acc_g = acc_b = 0
            samples = ((0.25, 0.25), (0.75, 0.25), (0.25, 0.75), (0.75, 0.75))
            for sx, sy in samples:
                u = (x + sx) / size
                v = (y + sy) / size
                pin = (in_circle(u, v, cx, cy, r) or in_triangle(u, v, top, right, tip)) and not in_circle(
                    u, v, cx, cy, hole
                )
                if pin:
                    acc_r += 255
                    acc_g += 251
                    acc_b += 247
                else:
                    t = (u + v) / 2
                    acc_r += 255
                    acc_g += int(138 + (90 - 138) * t)
                    acc_b += int(91 + (54 - 91) * t)
            n = len(samples)
            row += bytes((acc_r // n, acc_g // n, acc_b // n))
        rows.append(bytes(row))
    return rows


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for size, name, scale in [
        (192, "icon-192.png", 1.0),
        (512, "icon-512.png", 1.0),
        (512, "maskable-512.png", 0.74),
        (180, "apple-touch-icon.png", 1.0),
    ]:
        write_png(OUT / name, size, size, render(size, scale))
        print("wrote", OUT / name)


if __name__ == "__main__":
    main()
