#!/usr/bin/env python3
"""
analyze.py — разведка по референсным картинкам.

Прежде чем обводить силуэт, нужно понять, что вообще на картинке: где
бумажный фон, где водяной знак, где подписи и где, собственно, оружие.
Скрипт находит крупные связные области непохожего на фон цвета и печатает
их габариты — по ним потом выбирается, что обводить.

    python3 tools/trace/analyze.py <файл> [<файл> ...]
"""
import sys
from collections import deque

import numpy as np
from PIL import Image


def load(path):
    im = Image.open(path).convert("RGB")
    return np.asarray(im).astype(np.int16)


def foreground_mask(rgb):
    """
    Фон — светлая бумага, водяной знак — светло-серый и малонасыщенный.
    Оружие темнее и/или насыщеннее, поэтому отсекаем по яркости и
    насыщенности сразу: одной яркости мало, светлый песочный корпус по
    ней проходит как фон.
    """
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    value = mx
    sat = mx - mn
    return (value < 205) | (sat > 45)


def components(mask, min_pixels):
    """Связные области (4-связность) через обход в ширину."""
    h, w = mask.shape
    seen = np.zeros((h, w), dtype=bool)
    out = []

    for y0 in range(h):
        row = mask[y0]
        for x0 in range(w):
            if not row[x0] or seen[y0, x0]:
                continue

            q = deque([(y0, x0)])
            seen[y0, x0] = True
            pixels = 0
            minx = maxx = x0
            miny = maxy = y0

            while q:
                y, x = q.popleft()
                pixels += 1
                if x < minx:
                    minx = x
                if x > maxx:
                    maxx = x
                if y < miny:
                    miny = y
                if y > maxy:
                    maxy = y

                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))

            if pixels >= min_pixels:
                out.append({
                    "pixels": pixels,
                    "box": (minx, miny, maxx, maxy),
                    "w": maxx - minx + 1,
                    "h": maxy - miny + 1,
                })

    out.sort(key=lambda c: -c["pixels"])
    return out


def main():
    for path in sys.argv[1:]:
        rgb = load(path)
        h, w, _ = rgb.shape
        mask = foreground_mask(rgb)
        print(f"\n=== {path.split('/')[-1]}  {w}x{h} ===")
        print(f"   переднего плана: {mask.mean() * 100:.1f}%")

        for i, c in enumerate(components(mask, min_pixels=(w * h) // 400)[:8]):
            x0, y0, x1, y1 = c["box"]
            ratio = c["w"] / max(1, c["h"])
            print(f"   #{i}  {c['pixels']:>7} px  "
                  f"box=({x0},{y0})-({x1},{y1})  {c['w']}x{c['h']}  "
                  f"пропорция {ratio:.2f}")


if __name__ == "__main__":
    main()
