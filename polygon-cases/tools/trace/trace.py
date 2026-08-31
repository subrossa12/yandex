#!/usr/bin/env python3
"""
trace.py — обводит оружие с растровой картинки в SVG-пути.

Зачем: силуэты, нарисованные координатами «на глаз», читаются как
набор плашек, сколько их ни правь. Обводка настоящего рисунка даёт
точный контур сразу — со всеми скосами приклада, изгибом магазина и
уступами коробки, которые вручную не поставишь.

Как устроено:

  1. кроп по габаритам оружия (их находит analyze.py);
  2. маска переднего плана: бумажный фон и водяной знак светлые и
     малонасыщенные, оружие — нет;
  3. цвета сводятся к нескольким кластерам (k-means по выборке), и
     каждый кластер разбивается на связные области;
  4. граница каждой области обводится по Муру и упрощается по
     Дугласу — Пекеру: сырой контур в тысячу точек не нужен ни глазу,
     ни весу билда;
  5. области сортируются по площади и выводятся от крупных к мелким —
     так мелкая тёмная деталь ложится поверх корпуса, как на рисунке.

Роль каждой области определяется её яркостью: самые тёмные — обводка и
металл, самые светлые — прицелы и планки, остальное — корпус, который и
принимает паттерн скина.

    python3 tools/trace/trace.py <файл> <x0> <y0> <x1> <y1> <id> <класс>
"""
import json
import sys
from collections import deque

import numpy as np
from PIL import Image

# ширина, в которую вписывается обведённая модель (система координат игры)
TARGET_W = 260.0

# точность упрощения контура, в долях ширины модели
SIMPLIFY = 0.003

# сколько цветовых кластеров искать
CLUSTERS = 7

# область меньше этой доли площади оружия считается шумом
MIN_AREA = 0.0035


# ---------------------------------------------------------------- #
# Маска и кластеризация
# ---------------------------------------------------------------- #
def foreground_mask(rgb):
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    return (mx < 205) | ((mx - mn) > 45)


def kmeans(samples, k, iters=14, seed=7):
    """Простой k-means: сторонних зависимостей ради него тянуть незачем."""
    rng = np.random.default_rng(seed)
    centers = samples[rng.choice(len(samples), size=k, replace=False)].astype(np.float64)

    for _ in range(iters):
        d = ((samples[:, None, :] - centers[None, :, :]) ** 2).sum(axis=2)
        labels = d.argmin(axis=1)
        for i in range(k):
            sel = samples[labels == i]
            if len(sel):
                centers[i] = sel.mean(axis=0)
    return centers


def label_pixels(rgb, centers):
    flat = rgb.reshape(-1, 3).astype(np.float64)
    d = ((flat[:, None, :] - centers[None, :, :]) ** 2).sum(axis=2)
    return d.argmin(axis=1).reshape(rgb.shape[:2])


# ---------------------------------------------------------------- #
# Связные области
# ---------------------------------------------------------------- #
def regions(mask, min_pixels):
    """
    Разметка связных областей за один проход.

    Наивная версия строила на каждую область отдельную маску во весь
    кадр — на семи кластерах по миллиону пикселей это десятки лишних
    гигабайт работы. Здесь один массив меток на всю картинку, а маска
    области собирается потом и только по её габаритам.
    """
    h, w = mask.shape
    labels = np.zeros((h, w), dtype=np.int32)
    out = []
    current = 0

    ys, xs = np.nonzero(mask)
    for k in range(len(ys)):
        y0, x0 = int(ys[k]), int(xs[k])
        if labels[y0, x0]:
            continue

        current += 1
        q = deque([(y0, x0)])
        labels[y0, x0] = current
        area = 0
        minx = maxx = x0
        miny = maxy = y0

        while q:
            y, x = q.popleft()
            area += 1
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
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not labels[ny, nx]:
                    labels[ny, nx] = current
                    q.append((ny, nx))

        if area >= min_pixels:
            out.append({
                "label": current,
                "area": area,
                "box": (minx, miny, maxx, maxy),
                "labels": labels,
            })

    return out


def region_mask(reg):
    """Маска области по её габаритам плюс поле в один пиксель на обводку."""
    x0, y0, x1, y1 = reg["box"]
    sub = reg["labels"][y0:y1 + 1, x0:x1 + 1] == reg["label"]
    padded = np.zeros((sub.shape[0] + 2, sub.shape[1] + 2), dtype=bool)
    padded[1:-1, 1:-1] = sub
    return padded, x0 - 1, y0 - 1


# ---------------------------------------------------------------- #
# Обводка границы по Муру
# ---------------------------------------------------------------- #
NEIGH = [(-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)]


def trace_boundary(mask):
    h, w = mask.shape
    start = None
    for y in range(h):
        xs = np.nonzero(mask[y])[0]
        if len(xs):
            start = (y, int(xs[0]))
            break
    if start is None:
        return []

    contour = [start]
    cur = start
    back = 6                      # пришли слева
    guard = 0
    limit = 8 * mask.sum() + 64

    while guard < limit:
        guard += 1
        found = False
        for step in range(8):
            i = (back + 1 + step) % 8
            dy, dx = NEIGH[i]
            ny, nx = cur[0] + dy, cur[1] + dx
            if 0 <= ny < h and 0 <= nx < w and mask[ny, nx]:
                back = (i + 4 + 1) % 8
                cur = (ny, nx)
                found = True
                break
        if not found:
            break
        if cur == start and len(contour) > 2:
            break
        contour.append(cur)

    return contour


# ---------------------------------------------------------------- #
# Упрощение по Дугласу — Пекеру
# ---------------------------------------------------------------- #
def simplify(points, eps):
    if len(points) < 3:
        return points

    def rec(a, b):
        if b <= a + 1:
            return []
        ax, ay = points[a]
        bx, by = points[b]
        dx, dy = bx - ax, by - ay
        norm = (dx * dx + dy * dy) ** 0.5 or 1.0

        best, best_i = -1.0, -1
        for i in range(a + 1, b):
            px, py = points[i]
            dist = abs(dy * px - dx * py + bx * ay - by * ax) / norm
            if dist > best:
                best, best_i = dist, i

        if best <= eps:
            return []
        return rec(a, best_i) + [best_i] + rec(best_i, b)

    sys.setrecursionlimit(20000)
    keep = [0] + rec(0, len(points) - 1) + [len(points) - 1]
    return [points[i] for i in keep]


# ---------------------------------------------------------------- #
# Сборка
# ---------------------------------------------------------------- #
def luminance(color):
    return 0.299 * color[0] + 0.587 * color[1] + 0.114 * color[2]


def assign_roles(centers, areas):
    """
    Роль кластера — это не его цвет, а его отклонение от среднего тона
    оружия.

    Так и должно быть: скин перекрашивает вещь целиком, а от исходного
    рисунка нам нужен не цвет, а светотень — линии расшивки, тени в
    пазах, блики на гранях. Она одинаково устроена и у песочного
    пулемёта, и у чёрной винтовки, если смотреть на отклонение, а не на
    абсолютную яркость.

    Кластеры, близкие к среднему, не выводятся вовсе: там базовый тон,
    и поверх него ничего накладывать не нужно — сквозь него и виден
    паттерн.
    """
    total = sum(areas) or 1
    mean = sum(luminance(centers[i]) * areas[i] for i in range(len(centers))) / total

    roles = {}
    for i in range(len(centers)):
        delta = luminance(centers[i]) - mean
        if delta < -52:
            roles[i] = "ink"        # контур и глубокие тени
        elif delta < -16:
            roles[i] = "shade"      # полутень, пазы, расшивка
        elif delta > 30:
            roles[i] = "light"      # блики на гранях
        else:
            roles[i] = None         # базовый тон: сквозь него виден паттерн
    return roles


def to_path(points, sx, sy, ox, oy):
    parts = []
    for i, (y, x) in enumerate(points):
        px = round((x - ox) * sx, 2)
        py = round((y - oy) * sy, 2)
        parts.append(("M" if i == 0 else "L") + f"{px} {py}")
    return "".join(parts) + "Z"


def main():
    path, x0, y0, x1, y1, wid, cls = sys.argv[1:8]
    x0, y0, x1, y1 = int(x0), int(y0), int(x1), int(y1)

    rgb = np.asarray(Image.open(path).convert("RGB")).astype(np.int16)[y0:y1 + 1, x0:x1 + 1]
    h, w, _ = rgb.shape

    fg = foreground_mask(rgb)
    # оставляем только самую крупную область: подписи и стрелки в кадр
    # попадают, но к оружию не относятся
    big = max(regions(fg, min_pixels=(w * h) // 200), key=lambda r: r["area"])
    fg = big["labels"] == big["label"]

    samples = rgb[fg]
    if len(samples) > 24000:
        idx = np.random.default_rng(3).choice(len(samples), 24000, replace=False)
        samples = samples[idx]

    centers = kmeans(samples, CLUSTERS)
    labels = label_pixels(rgb, centers)

    scale = TARGET_W / w
    eps = max(0.7, SIMPLIFY * w)
    min_pixels = int(MIN_AREA * fg.sum())

    areas = [int((fg & (labels == ci)).sum()) for ci in range(len(centers))]
    roles = assign_roles(centers, areas)

    out = []

    # силуэт целиком: именно он принимает паттерн скина 
    for ci, color in enumerate(centers):
        cluster = fg & (labels == ci)
        if not cluster.any():
            continue
        role = roles[ci]
        if role is None:
            continue
        for reg in regions(cluster, min_pixels):
            sub, ox, oy = region_mask(reg)
            contour = trace_boundary(sub)
            if len(contour) < 8:
                continue
            pts = simplify(contour, eps)
            if len(pts) < 4:
                continue
            out.append({
                "role": role,
                "area": reg["area"],
                "d": to_path([(y + oy, x + ox) for (y, x) in pts], scale, scale, 0, 0),
            })

    # от крупных к мелким: мелкая тёмная деталь ложится поверх корпуса
    out.sort(key=lambda r: -r["area"])

    # силуэт идёт первым и отдельно: он не затенение, а основа
    sil_mask, sox, soy = region_mask({
        "box": (0, 0, w - 1, h - 1), "label": 1,
        "labels": np.where(fg, 1, 0).astype(np.int32),
    })
    sil = simplify(trace_boundary(sil_mask), max(0.5, eps * 0.6))
    silhouette = {
        "role": "silhouette",
        "d": to_path([(y + soy, x + sox) for (y, x) in sil], scale, scale, 0, 0),
    }

    print(json.dumps({
        "id": wid,
        "cls": cls,
        "source": path.split("/")[-1],
        "width": round(TARGET_W, 2),
        "height": round(h * scale, 2),
        "parts": [silhouette] + [{"role": r["role"], "d": r["d"]} for r in out],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
