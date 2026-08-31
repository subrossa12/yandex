/*
 * simulate.js — прогон экономики без браузера.
 *   node tools/simulate.js [прогонов] [--flag key=value] [--csv]
 *
 * Считает фактическое матожидание дропа по каждому кейсу: то самое
 * число, которое обязано быть НИЖЕ цены кейса. Если матожидание выше
 * цены, экономика инфлирует за вечер и играть становится незачем.
 *
 * Ориентир — 0.75–0.85 от цены. Ниже 0.7 игрок чувствует себя обобранным
 * и уходит, выше 0.9 — кредиты обесцениваются и пропадает смысл копить.
 *
 * Числа здесь считаются ровно тем же кодом, в который играет игрок:
 * подменять формулы «для симуляции» нельзя, иначе она врёт.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GAME = path.join(__dirname, '..', 'game');

const FILES = [
  'core/rng.js',
  'data/naming.js',
  'data/palettes.js',
  'data/weapons.js',
  'core/skingen.js',
  'data/balance.js',
  'data/cases.js',
  'core/economy.js',
  'config.js'
];

function loadCore(flags) {
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  FILES.forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(GAME, f), 'utf8'), sandbox, { filename: f });
  });
  if (flags) sandbox.PG.Config.applyRemote(flags);
  return sandbox.PG;
}

function flagsFromArgv(argv) {
  const out = {};
  argv.forEach((a, i) => {
    if (a !== '--flag') return;
    const pair = argv[i + 1] || '';
    const eq = pair.indexOf('=');
    if (eq > 0) out[pair.slice(0, eq)] = pair.slice(eq + 1);
  });
  return Object.keys(out).length ? out : null;
}

/* ---------------------------------------------------------------- */
const args = process.argv.slice(2);
const RUNS = parseInt(args.find((a) => /^\d+$/.test(a)) || '10000', 10);
const CSV = args.includes('--csv');
const overrides = flagsFromArgv(args);

const PG = loadCore(overrides);
const { Economy, CASES, SkinGen } = PG;
const B = PG.BALANCE;

if (overrides) {
  const applied = PG.Config.report().applied;
  console.log('Флаги поверх дефолтов: ' + (applied.length
    ? applied.map((a) => `${a.key} ${a.from} -> ${a.to}`).join(', ')
    : 'ни один не принят'));
  console.log('');
}

const RARITY_NAMES = ['Стандарт', 'Улучшенный', 'Редкий', 'Элитный', 'Легендарный', 'Реликт'];

function fmt(n) {
  if (!isFinite(n)) return '∞';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(Math.round(n));
}

function pad(s, n, right) {
  s = String(s);
  while (s.length < n) s = right ? s + ' ' : ' ' + s;
  return s;
}

/* ---------------------------------------------------------------- *
 * 1. Матожидание по кейсам
 *
 * Считается двумя способами. Точный — перебором: у кейса всего
 * семнадцать записей, вероятность каждой известна, остаётся усреднить
 * цену по распределению состояния. Монте-Карло рядом нужен как сверка:
 * если два числа разошлись, значит расчёт разошёлся с тем, что реально
 * выдаёт rollDrop, и виноват код, а не случайность.
 *
 * Одним Монте-Карло тут не обойтись: реликт выпадает раз на тысячу и
 * даёт почти половину матожидания, так что на десяти тысячах прогонов
 * оценка гуляет на десятки процентов — по такой цифру не откалибруешь.
 * ---------------------------------------------------------------- */

/* Средняя цена одной записи коллекции по распределению состояния. */
const FLOAT_SAMPLES = 400;

function entryMeanValue(entry) {
  const design = SkinGen.generateSkin(entry.seed, { rarity: entry.rarity });
  const lo = design.floatRange[0];
  const hi = design.floatRange[1];

  let acc = 0;
  for (let i = 0; i < FLOAT_SAMPLES; i++) {
    const rnd = PG.RNG.make(`ev:${entry.seed}:${i}`);
    const f = lo + SkinGen.triangular(rnd) * (hi - lo);
    acc += Economy.valueOf(design, { caseId: entry.caseId, float: f, counter: 0 });
  }

  /* счётчик выпадает у 8% предметов и поднимает цену */
  const counterChance = 0.08;
  return (acc / FLOAT_SAMPLES) * (1 - counterChance + counterChance * B.float.counterMult);
}

function expectedValue(caseDef) {
  const table = Economy.dropTable();
  let ev = 0;
  for (let r = 0; r < table.length; r++) {
    const pool = CASES.byRarity(caseDef.id, r);
    if (!pool.length) continue;
    let sum = 0;
    pool.forEach((e) => { sum += entryMeanValue(e); });
    ev += table[r] * (sum / pool.length);
  }
  return ev;
}

/* ---------------------------------------------------------------- */
function simulateCase(caseDef) {
  let total = 0;
  let best = 0;
  const byRarity = [0, 0, 0, 0, 0, 0];
  const valueByRarity = [0, 0, 0, 0, 0, 0];
  let profitable = 0;      // сколько открытий окупили цену кейса

  for (let i = 0; i < RUNS; i++) {
    const drop = Economy.rollDrop(caseDef.id, `sim:${caseDef.id}:${i}`);
    if (!drop) continue;
    const value = Economy.valueOf(
      SkinGen.generateSkin(drop.seed, { rarity: drop.rarity }),
      drop
    );
    total += value;
    byRarity[drop.rarity]++;
    valueByRarity[drop.rarity] += value;
    if (value > best) best = value;
    if (value >= caseDef.price) profitable++;
  }

  return {
    ev: total / RUNS,
    best,
    byRarity,
    valueByRarity,
    profitable: profitable / RUNS
  };
}

console.log(`=== МАТОЖИДАНИЕ ДРОПА (${RUNS.toLocaleString('ru-RU')} открытий каждого кейса) ===\n`);

if (CSV) {
  console.log('case,price,ev,ratio,profitable');
} else {
  console.log(
    pad('кейс', 10, true) + pad('цена', 10) + pad('EV точно', 12) +
    pad('EV прогон', 12) + pad('EV/цена', 10) + pad('в плюс', 9) + pad('лучший', 12)
  );
  console.log('  ' + '-'.repeat(73));
}

const results = [];
let warnings = 0;

CASES.list.forEach((c) => {
  const r = simulateCase(c);
  const exact = expectedValue(c);
  const ratio = exact / c.price;
  results.push({ c, r, exact, ratio });

  if (CSV) {
    console.log(`${c.id},${c.price},${Math.round(exact)},${ratio.toFixed(4)},${r.profitable.toFixed(4)}`);
    return;
  }

  const flag = (ratio < 0.75 || ratio > 0.85)
    ? `  ← вне ориентира, цена должна быть ~${Math.round(exact / 0.8)}`
    : '';
  if (flag) warnings++;

  console.log(
    pad(c.id, 10, true) + pad(fmt(c.price), 10) + pad(fmt(exact), 12) +
    pad(fmt(r.ev), 12) + pad(ratio.toFixed(3), 10) +
    pad((r.profitable * 100).toFixed(1) + '%', 9) + pad(fmt(r.best), 12) + flag
  );
});

if (CSV) process.exit(0);

/* ---------------------------------------------------------------- *
 * 2. Из чего складывается матожидание
 * ---------------------------------------------------------------- */
console.log('\n=== ВКЛАД РЕДКОСТЕЙ (на примере среднего кейса) ===\n');

const sample = results[Math.floor(results.length / 2)];
console.log(
  pad('редкость', 14, true) + pad('шанс факт', 12) + pad('шанс план', 12) +
  pad('доля EV', 10) + pad('средняя цена', 14)
);
console.log('  ' + '-'.repeat(60));

const planned = Economy.dropTable();
RARITY_NAMES.forEach((name, i) => {
  const count = sample.r.byRarity[i];
  const share = sample.r.valueByRarity[i] / (sample.r.ev * RUNS || 1);
  console.log(
    pad(name, 14, true) +
    pad((count / RUNS * 100).toFixed(3) + '%', 12) +
    pad((planned[i] * 100).toFixed(3) + '%', 12) +
    pad((share * 100).toFixed(1) + '%', 10) +
    pad(count ? fmt(sample.r.valueByRarity[i] / count) : '—', 14)
  );
});

/* ---------------------------------------------------------------- *
 * 3. Контракт обмена: десять предметов -> один следующей редкости
 * ---------------------------------------------------------------- */
console.log('\n=== КОНТРАКТ ОБМЕНА (десять предметов -> один) ===\n');
console.log(
  pad('редкость входа', 16, true) + pad('стоимость входа', 18) +
  pad('стоимость выхода', 18) + pad('возврат', 10)
);
console.log('  ' + '-'.repeat(60));

const CONTRACT_RUNS = Math.min(RUNS, 3000);

[0, 1, 2, 3].forEach((rarity) => {
  let inSum = 0, outSum = 0, done = 0;

  for (let i = 0; i < CONTRACT_RUNS; i++) {
    const state = Economy.createState();
    state.credits = 0;
    const ids = [];

    /*
     * Материал берём из одного кейса: смешивать коллекции разной
     * ценности бессмысленно — вход тогда считается по самой дорогой,
     * а выход приходит из случайной, и цифра ничего не значит.
     */
    const caseDef = CASES.list[i % CASES.list.length];
    const pool = CASES.byRarity(caseDef.id, rarity);
    if (!pool.length) continue;

    for (let k = 0; k < B.market.contractInput; k++) {
      const rnd = PG.RNG.make(`contract:${rarity}:${i}:${k}`);
      const entry = pool[rnd.int(pool.length)];
      const design = SkinGen.generateSkin(entry.seed, { rarity: entry.rarity });
      const range = design.floatRange;
      const f = range[0] + SkinGen.triangular(rnd) * (range[1] - range[0]);
      const item = {
        id: state.nextItemId++, seed: entry.seed, idx: entry.index, float: f,
        counter: 0, caseId: entry.caseId, fav: false, at: 0
      };
      state.items.push(item);
      ids.push(item.id);
      inSum += Economy.itemValue(item);
    }

    if (ids.length !== B.market.contractInput) continue;
    const res = Economy.runContract(state, ids, `contract-out:${rarity}:${i}`, 0);
    if (!res) continue;
    outSum += Economy.itemValue(res.item);
    done++;
  }

  if (!done) {
    console.log(pad(RARITY_NAMES[rarity], 16, true) + '  обмен недоступен');
    return;
  }

  const avgIn = inSum / done;
  const avgOut = outSum / done;
  console.log(
    pad(RARITY_NAMES[rarity], 16, true) +
    pad(fmt(avgIn), 18) + pad(fmt(avgOut), 18) +
    pad((avgOut / avgIn).toFixed(2), 10)
  );
});

/* ---------------------------------------------------------------- *
 * 4. Сколько кейсов нужно на коллекцию
 * ---------------------------------------------------------------- */
console.log('\n=== СБОР КОЛЛЕКЦИИ ===\n');
console.log(
  pad('кейс', 10, true) + pad('предметов', 12) + pad('открытий (медиана)', 22) + pad('затраты', 12)
);
console.log('  ' + '-'.repeat(56));

CASES.list.forEach((c) => {
  const size = CASES.collectionSize(c.id);
  const runs = 200;
  const opens = [];

  for (let i = 0; i < runs; i++) {
    const seen = {};
    let count = 0;
    let n = 0;
    while (count < size && n < 20000) {
      const drop = Economy.rollDrop(c.id, `col:${c.id}:${i}:${n}`);
      n++;
      if (!drop || drop.relic) continue;
      if (!seen[drop.index]) { seen[drop.index] = true; count++; }
    }
    opens.push(n);
  }

  opens.sort((a, b) => a - b);
  const median = opens[Math.floor(opens.length / 2)];
  console.log(
    pad(c.id, 10, true) + pad(size, 12) + pad(median, 22) + pad(fmt(median * c.price), 12)
  );
});

/* ---------------------------------------------------------------- *
 * Итог
 * ---------------------------------------------------------------- */
console.log('\n=== ИТОГ ===\n');
const avgRatio = results.reduce((s, r) => s + r.ratio, 0) / results.length;
console.log(`  среднее EV/цена: ${avgRatio.toFixed(3)} (ориентир 0.75–0.85)`);
if (warnings) {
  console.log(`  кейсов вне ориентира: ${warnings} — крутить price или valueScale`);
  process.exitCode = 1;
} else {
  console.log('  все кейсы в ориентире');
}
