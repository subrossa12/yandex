#!/usr/bin/env sh
# build.sh — пересобирает обведённые модели из исходных рисунков.
#
#   sh tools/trace/build.sh <папка-с-исходниками>
#
# Габариты каждой модели найдены заранее через analyze.py и зафиксированы
# здесь: искать их заново при каждой сборке незачем, а руками потом не
# вспомнишь, какая рамка к какому оружию относилась.
#
# Обводятся только те классы, для которых есть исходники: винтовки и
# снайперские. Пистолеты, дробовики, ПП и реликты остаются нарисованными
# координатами — под них исходников нет.
set -eu

SRC=${1:-/root/.claude/uploads}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
OUT="$ROOT/tools/trace/out"
mkdir -p "$OUT"

trace() {
  file=$1; x0=$2; y0=$3; x1=$4; y1=$5; id=$6; cls=$7
  echo "  обводка $id ← $(basename "$file")"
  python3 "$ROOT/tools/trace/trace.py" "$file" "$x0" "$y0" "$x1" "$y1" "$id" "$cls" \
    > "$OUT/$id.json"
}

echo "== Обводка моделей =="
trace "$SRC/1b78de99-image.webp"  56 571 1010 912  vector9  rifle
trace "$SRC/682a2b91-image.webp"  41 432 1030 727  krechet  rifle
trace "$SRC/699c9c0e-image.webp"  21 435 1057 837  grom7    rifle
trace "$SRC/e76d1f3b-image.webp"  76  50 1007 421  bereg    rifle
trace "$SRC/e76d1f3b-image.webp"  44 489 1023 749  tundra   rifle
trace "$SRC/686c805b-image.webp"  50 447 1073 745  sapsan   sniper
trace "$SRC/978b1d6c-image.webp"  61 447 1057 721  remez    sniper

echo ""
echo "== Сборка в данные игры =="
python3 "$ROOT/tools/trace/pack.py"
