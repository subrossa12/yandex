#!/usr/bin/env sh
# build.sh — собирает архив для загрузки в Консоль разработчика Яндекс Игр.
#
#   sh tools/build.sh
#
# Перед упаковкой проверяет технические требования платформы. Если что-то
# нарушено — архив не собирается.
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
GAME="$ROOT/game"
OUT="$ROOT/build"
ZIP="$OUT/shawarma-empire.zip"
FAIL=0

say_ok()   { echo "  ✓ $1"; }
say_fail() { echo "  ✗ $1"; FAIL=1; }

echo "== Проверка требований =="

# 1. index.html строго в корне архива
if [ -f "$GAME/index.html" ]; then
  say_ok "index.html в корне"
else
  say_fail "нет $GAME/index.html"
fi

# 2. Имена файлов и папок — только латиница, цифры, точка, дефис,
#    подчёркивание. Ни пробелов, ни кириллицы.
BADNAMES=$(cd "$GAME" && find . -mindepth 1 | sed 's|^\./||' | grep -vE '^[A-Za-z0-9._/-]+$' || true)
if [ -z "$BADNAMES" ]; then
  say_ok "в именах файлов только латиница, без пробелов"
else
  say_fail "недопустимые имена: $(echo "$BADNAMES" | tr '\n' ' ')"
fi

# 3. Распакованный размер не больше 100 МБ
SIZE_KB=$(du -sk "$GAME" | cut -f1)
if [ "$SIZE_KB" -lt 102400 ]; then
  say_ok "размер распакованным: ${SIZE_KB} КБ (лимит 100 МБ)"
else
  say_fail "размер ${SIZE_KB} КБ — больше лимита в 100 МБ"
fi

# 4. Ни одного обращения на внешний домен, кроме счётчика Метрики.
#    Метрика — сервис самой платформы и единственное исключение: её адрес
#    лежит в core/metrica.js и срабатывает, только если задан номер
#    счётчика. Всё остальное обязано лежать внутри архива.
EXTERNAL=$(grep -rEo "https?://[a-zA-Z0-9.-]+" "$GAME" 2>/dev/null \
  | grep -v "https://mc.yandex.ru" || true)
if [ -z "$EXTERNAL" ]; then
  say_ok "сторонних адресов нет: ни CDN, ни шрифтов, ни чужих доменов"
else
  say_fail "внешние ссылки: $(echo "$EXTERNAL" | tr '\n' ' ')"
fi

# 4a. Номер счётчика: пока он пуст, игра не делает вообще ни одного
#     внешнего запроса. Это не ошибка, но знать об этом надо.
COUNTER=$(grep -oE "counterId: *'[0-9]*'" "$GAME/data/balance.js" | grep -oE "[0-9]+" || true)
if [ -z "$COUNTER" ]; then
  say_ok "счётчик Метрики не задан — внешних запросов не будет ни одного"
else
  say_ok "счётчик Метрики: $COUNTER (единственный внешний адрес в билде)"
fi

# 4b. Слой флагов на месте и подключён раньше платформы
if grep -q 'src="config.js"' "$GAME/index.html" && grep -q "getFlag" "$GAME/config.js"; then
  say_ok "слой удалённой конфигурации подключён"
else
  say_fail "нет config.js или он не подключён в index.html"
fi

# 5. SDK подключён
if grep -q 'src="/sdk.js"' "$GAME/index.html"; then
  say_ok "SDK Яндекс Игр подключён"
else
  say_fail "в index.html нет <script src=\"/sdk.js\">"
fi

# 6. Обязательный вызов готовности
if grep -rq "LoadingAPI" "$GAME"; then
  say_ok "LoadingAPI.ready() вызывается"
else
  say_fail "нигде не вызывается LoadingAPI.ready()"
fi

if [ "$FAIL" -ne 0 ]; then
  echo ""
  echo "Сборка остановлена: сначала почини нарушения выше."
  exit 1
fi

echo ""
echo "== Сборка =="
mkdir -p "$OUT"
rm -f "$ZIP"

# -X убирает лишние метаданные, чтобы архив был компактнее
( cd "$GAME" && zip -qrX "$ZIP" . -x '.*' -x '*/.*' )

echo "  архив:      $ZIP"
echo "  размер zip: $(du -h "$ZIP" | cut -f1)"
echo "  распакован: $(du -sh "$GAME" | cut -f1)"
echo ""
echo "  в корне архива:"
unzip -Z1 "$ZIP" | grep -v / | sed 's/^/    /'
