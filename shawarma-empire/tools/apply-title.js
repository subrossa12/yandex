#!/usr/bin/env node
/*
 * apply-title.js — приводит название игры к полям черновика магазина.
 *
 *   RU: Шаурма Империя: симулятор бизнеса
 *   EN: Shawarma Empire: Business Simulator
 *
 * Положить в shawarma-empire/tools/ и запустить из любого места:
 *   node shawarma-empire/tools/apply-title.js
 *
 * Скрипт идемпотентен: если строка уже новая, файл не трогается.
 * После прогона стоит выполнить node tools/smoke.js — проверка заголовка
 * обновляется этим же скриптом.
 */

const fs = require('fs');
const path = require('path');

const RU = 'Шаурма Империя: симулятор бизнеса';
const EN = 'Shawarma Empire: Business Simulator';
const ROOT = path.resolve(__dirname, '..');

const LOADER_TITLE_OLD = '.loader__title { font-size: 22px; font-weight: 900; color: var(--accent-2); }';
const LOADER_TITLE_NEW = [
  '.loader__title {',
  '  max-width: 280px;',
  '  font-size: 21px;',
  '  font-weight: 900;',
  '  line-height: 1.16;',
  '  text-align: center;',
  '  text-wrap: balance;',
  '  color: var(--accent-2);',
  '}',
].join('\n');

const JOBS = [
  ['game/index.html', [
    ['<title>Шаурма Империя</title>', '<title>' + RU + '</title>'],
    ['content="Шаурма Империя — идл-игра', 'content="' + RU + ' — идл-игра'],
    ['<div class="loader__title">Шаурма Империя</div>', '<div class="loader__title">' + RU + '</div>'],
  ]],
  ['game/data/i18n.js', [
    ["'title': 'Шаурма Империя',", "'title': '" + RU + "',"],
    ["'title': 'Shawarma Empire',", "'title': '" + EN + "',"],
  ]],
  // Название стало длиннее — на узких экранах заставка уезжала за край.
  ['game/css/main.css', [[LOADER_TITLE_OLD, LOADER_TITLE_NEW]]],
  ['tools/smoke.js', [
    ["ruTitle !== 'Шаурма Империя'", "ruTitle !== '" + RU + "'"],
  ]],
  ['docs/store-listing.md', [
    ['```\nШаурма Империя\n```', '```\n' + RU + '\n```'],
    ['```\nShawarma Empire\n```', '```\n' + EN + '\n```'],
  ]],
  ['docs/moderation.md', [
    ['**Шаурма Империя** / **Shawarma Empire**', '**' + RU + '** / **' + EN + '**'],
  ]],
  ['README.md', [['# Шаурма Империя', '# ' + RU]]],
];

let changed = 0;
let skipped = 0;
let missing = 0;

for (const [rel, pairs] of JOBS) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    console.log('нет файла   ' + rel);
    missing++;
    continue;
  }
  const before = fs.readFileSync(file, 'utf8');
  let text = before;
  for (const [from, to] of pairs) {
    if (text.includes(to)) continue;
    if (!text.includes(from)) {
      console.log('не найдено  ' + rel + ' :: ' + from.split('\n')[0].slice(0, 60));
      missing++;
      continue;
    }
    text = text.split(from).join(to);
  }
  if (text === before) {
    console.log('без правок  ' + rel);
    skipped++;
    continue;
  }
  fs.writeFileSync(file, text);
  console.log('обновлено   ' + rel);
  changed++;
}

console.log('\nобновлено: ' + changed + ', без правок: ' + skipped + ', не найдено: ' + missing);
if (missing > 0) {
  console.log('Строки не совпали — проверь их вручную, файлы могли измениться.');
  process.exitCode = 1;
}
