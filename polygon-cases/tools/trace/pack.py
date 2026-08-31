#!/usr/bin/env python3
"""
pack.py — собирает обведённые модели в файл данных игры.

Отдельный шаг, а не часть trace.py: обводка одной модели и сборка всего
набора — разные операции, и переобводить семь моделей ради правки одной
незачем.
"""
import glob
import json
import os
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "game" / "data" / "weapons-traced.js"

HEAD = """/*
 * weapons-traced.js — модели, обведённые с исходных рисунков.
 *
 * ФАЙЛ СОБИРАЕТСЯ ИНСТРУМЕНТОМ, руками его не правят: любая правка будет
 * затёрта следующим прогоном `sh tools/trace/build.sh`. Геометрию меняют
 * в исходной картинке или в параметрах обводки (tools/trace/trace.py).
 *
 * Обведённая модель заменяет одноимённую нарисованную и помечается
 * traced: true. Рендер по этому флагу ведёт себя иначе: не навешивает
 * свою обводку и бевел на каждую деталь, потому что контур и тени в
 * обведённой модели уже есть — это отдельные тёмные области (role: ink).
 * Иначе полсотни деталей получили бы по канту каждая и предмет
 * превратился бы в кашу.
 *
 * Обведены только те классы, для которых есть исходники. Пистолеты,
 * дробовики, ПП и реликты остаются нарисованными координатами.
 */
(function (root) {
  'use strict';

  var PG = (root.PG = root.PG || {});
  if (!PG.WEAPONS) return;

  var TRACED = [
"""

TAIL = """  ];

  /* Одноимённые нарисованные модели заменяем, новые добавляем. */
  TRACED.forEach(function (w) {
    var list = PG.WEAPONS.list;
    var at = -1;
    for (var i = 0; i < list.length; i++) if (list[i].id === w.id) at = i;
    if (at >= 0) list[at] = w;
    else list.push(w);
  });

  PG.WEAPONS.rebuild();
})(typeof globalThis !== 'undefined' ? globalThis : this);
"""


def main():
    files = sorted(glob.glob(str(ROOT / "tools" / "trace" / "out" / "*.json")))
    if not files:
        raise SystemExit("нет обведённых моделей: сначала прогони build.sh")

    chunks = []
    total = 0

    for f in files:
        w = json.load(open(f, encoding="utf-8"))
        body = [
            "    {",
            f"      id: '{w['id']}', cls: '{w['cls']}', traced: true,",
            f"      /* обведено с {w['source']} */",
            "      parts: [",
        ]
        for p in w["parts"]:
            body.append(f"        {{ role: '{p['role']}', d: '{p['d']}' }},")
        body[-1] = body[-1][:-1]
        body += ["      ],", "      lines: []", "    }"]
        chunks.append("\n".join(body))
        total += sum(len(p["d"]) for p in w["parts"])
        print(f"  {w['id']:<9} деталей {len(w['parts']):>3}  "
              f"{sum(len(p['d']) for p in w['parts']) // 1024} КБ  ← {w['source']}")

    OUT.write_text(HEAD + ",\n".join(chunks) + "\n" + TAIL, encoding="utf-8")
    print(f"\n  {OUT.relative_to(ROOT)}: {os.path.getsize(OUT) // 1024} КБ, "
          f"моделей {len(files)}")


if __name__ == "__main__":
    main()
