/*
 * simulate.js — прогон экономики без браузера.
 *   node tools/simulate.js [минут] [--quiet] [--csv]
 *
 * Симулирует «разумного активного игрока»: тапает, открывает точки,
 * берёт менеджеров и апгрейды, докупает уровни с лучшим приростом дохода.
 * Печатает кривую дохода и ключевые события — по ней калибруется balance.js.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GAME = path.join(__dirname, '..', 'game');

/*
 * Грузим ровно ту же цепочку, что и игра: дефолты -> ядро -> слой флагов.
 * config.js здесь не лишний: он отдаёт ядру эффективный баланс, и если
 * симуляция обойдёт его стороной, она будет считать не по тем числам,
 * по которым играет игрок.
 */
function loadCore(flags) {
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  ['data/balance.js', 'core/economy.js', 'config.js'].forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(GAME, f), 'utf8'), sandbox, { filename: f });
  });
  if (flags) sandbox.SE.Config.applyRemote(flags);
  return sandbox.SE;
}

/*
 * Флаги можно подсунуть прямо в командной строке:
 *   node tools/simulate.js 120 --flag prestige.factor=180
 * Так можно прикинуть новый баланс, не пересобирая билд, — ровно то же
 * самое потом делается из Консоли.
 */
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
const minutes = parseFloat(args.find((a) => /^\d/.test(a)) || '120');
const QUIET = args.includes('--quiet');
const CSV = args.includes('--csv');

const overrides = flagsFromArgv(args);
const SE = loadCore(overrides);
const { Economy } = SE;
const BALANCE = SE.BALANCE;
if (overrides && !QUIET) {
  const applied = SE.Config.report().applied;
  console.log('Флаги поверх дефолтов: ' + (applied.length
    ? applied.map((a) => `${a.key} ${a.from} -> ${a.to}`).join(', ')
    : 'ни один не принят'));
}
const state = Economy.createState();

const TICK = 100;                       // мс на шаг симуляции
const TAPS_PER_SEC = 4;                 // темп живого игрока
const REPORT_EVERY = 5 * 60 * 1000;     // отчёт раз в 5 минут

let tapBudget = 0;
let elapsed = 0;
let nextReport = 0;
const events = [];
const rows = [];

function log(t, text) {
  events.push({ t, text });
}

function fmtTime(ms) {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(3)}:${String(s).padStart(2, '0')}`;
}

const UNITS = ['', 'K', 'M', 'B', 'T', 'aa', 'bb', 'cc', 'dd', 'ee', 'ff'];
function fmtMoney(n) {
  if (!isFinite(n)) return '∞';
  if (n < 1000) return n.toFixed(n < 10 ? 2 : 0);
  const tier = Math.floor(Math.log10(n) / 3);
  const scaled = n / Math.pow(1000, tier);
  return scaled.toFixed(scaled < 10 ? 2 : scaled < 100 ? 1 : 0) + (UNITS[tier] || `e${tier * 3}`);
}

/* ---------------------------------------------------------------- *
 * Поведение игрока
 * ---------------------------------------------------------------- */
function playerTaps(dt) {
  tapBudget += (dt / 1000) * TAPS_PER_SEC;
  const idle = state.businesses
    .filter((b) => b.level > 0 && !b.hasManager && !b.running)
    .sort((a, b) => Economy.revenuePerCycle(state, b) - Economy.revenuePerCycle(state, a));
  for (const biz of idle) {
    if (tapBudget < 1) break;
    if (Economy.tap(state, biz.id)) tapBudget -= 1;
  }
  if (tapBudget > 5) tapBudget = 5;
}

function tryUnlockNext() {
  for (let i = 0; i < state.businesses.length; i++) {
    const biz = state.businesses[i];
    if (biz.level > 0) continue;
    if (!Economy.isUnlocked(state, biz.id)) return false;
    if (Economy.canBuyLevels(state, biz.id, 1)) {
      Economy.buyLevels(state, biz.id, 1);
      log(elapsed, `🔓 открыта точка «${biz.id}»`);
      return true;
    }
    return false;
  }
  return false;
}

function tryManagers() {
  let bought = false;
  for (const biz of state.businesses) {
    if (biz.level <= 0 || biz.hasManager) continue;
    if (Economy.buyManager(state, biz.id)) {
      log(elapsed, `👤 менеджер «${biz.id}» за ${fmtMoney(Economy.getDef(biz.id).managerCost)}`);
      bought = true;
    }
  }
  return bought;
}

function tryUpgrades() {
  let bought = false;
  for (const u of Economy.availableUpgrades(state)) {
    if (state.money >= u.cost && Economy.buyUpgrade(state, u.id)) {
      if (u.kind === 'global') log(elapsed, `🌍 глобальный апгрейд ${u.id} ×${u.mult} за ${fmtMoney(u.cost)}`);
      bought = true;
    }
  }
  return bought;
}

/* Покупает уровень там, где прирост дохода на рубль максимален. */
function tryLevels() {
  let best = null;
  for (const biz of state.businesses) {
    if (biz.level <= 0) continue;
    const cost = Economy.levelCost(state, biz, 1);
    if (cost > state.money) continue;

    const before = Economy.revenuePerCycle(state, biz) / (Economy.cycleMs(state, biz) / 1000);
    biz.level += 1;
    const after = Economy.revenuePerCycle(state, biz) / (Economy.cycleMs(state, biz) / 1000);
    biz.level -= 1;

    const gain = (after - before) / cost;
    if (!best || gain > best.gain) best = { id: biz.id, gain, cost };
  }
  if (!best) return false;
  Economy.buyLevels(state, best.id, 1);
  return true;
}

function playerDecisions() {
  /* сначала то, что меняет игру качественно, потом просто уровни */
  let guard = 0;
  while (guard++ < 200) {
    if (tryUnlockNext()) continue;
    if (tryManagers()) continue;
    if (tryUpgrades()) continue;
    if (tryLevels()) continue;
    break;
  }
}

/* ---------------------------------------------------------------- *
 * Прогон
 * ---------------------------------------------------------------- */
const totalMs = minutes * 60 * 1000;
let prestigeAnnounced = false;
let firstPrestigeAt = null;
let prestigeCount = 0;
let lastPrestigeAt = 0;
const cycles = [];

function snapshot() {
  const owned = state.businesses.filter((b) => b.level > 0).length;
  const managers = state.businesses.filter((b) => b.hasManager).length;
  rows.push({
    t: elapsed,
    money: state.money,
    ips: Economy.incomePerSecond(state),
    lifetime: state.lifetimeEarned,
    owned,
    managers,
    levels: state.businesses.map((b) => b.level).join('/'),
    stars: state.stars,
    pending: Economy.pendingStarsRaw(state)
  });
}

while (elapsed < totalMs) {
  playerTaps(TICK);
  Economy.tick(state, TICK);
  playerDecisions();
  elapsed += TICK;

  if (!prestigeAnnounced && Economy.canPrestige(state)) {
    prestigeAnnounced = true;
    firstPrestigeAt = elapsed;
    log(elapsed, `⭐ престиж доступен: ${Economy.pendingStarsRaw(state)} звёзд`);
  }

  /* игрок делает престиж, как только он открылся (проверяем поведение циклов) */
  if (Economy.canPrestige(state) && Economy.pendingStarsRaw(state) >= Economy.requiredStars(state)) {
    const res = Economy.doPrestige(state);
    if (res) {
      prestigeCount++;
      cycles.push({ n: prestigeCount, ms: elapsed - lastPrestigeAt, stars: res.stars, total: res.total, mult: Economy.starMultiplier(state) });
      log(elapsed, `♻️ ПРЕСТИЖ #${prestigeCount}: +${res.stars} звёзд (всего ${res.total}, множитель ×${Economy.starMultiplier(state).toFixed(2)}), цикл ${fmtTime(elapsed - lastPrestigeAt)}`);
      lastPrestigeAt = elapsed;
    }
  }

  if (elapsed >= nextReport) {
    snapshot();
    nextReport += REPORT_EVERY;
  }
}
snapshot();

/* ---------------------------------------------------------------- *
 * Вывод
 * ---------------------------------------------------------------- */
if (CSV) {
  console.log('minutes,money,income_per_sec,lifetime_earned,owned,managers,stars');
  rows.forEach((r) => console.log([
    (r.t / 60000).toFixed(1), r.money.toFixed(0), r.ips.toFixed(2),
    r.lifetime.toFixed(0), r.owned, r.managers, r.stars
  ].join(',')));
} else {
  console.log('\n=== КРИВАЯ ДОХОДА ===');
  console.log('  время |    баланс |    доход/с |  всего заработано | точек | менеджеров | ⭐ | уровни');
  console.log('  ------+-----------+------------+-------------------+-------+------------+----+-------------------------');
  rows.forEach((r) => {
    console.log(
      `  ${fmtTime(r.t)} | ${fmtMoney(r.money).padStart(9)} | ${fmtMoney(r.ips).padStart(10)} | ${fmtMoney(r.lifetime).padStart(17)} | ${String(r.owned).padStart(5)} | ${String(r.managers).padStart(10)} | ${String(r.stars).padStart(2)} | ${r.levels}`
    );
  });

  if (!QUIET) {
    console.log('\n=== СОБЫТИЯ ===');
    events.forEach((e) => console.log(`  ${fmtTime(e.t)}  ${e.text}`));
  }

  console.log('\n=== ЦИКЛЫ ПРЕСТИЖА ===');
  cycles.forEach((c) => console.log(`  #${String(c.n).padStart(2)}  длина ${fmtTime(c.ms)}  +${String(c.stars).padStart(4)}⭐  всего ${String(c.total).padStart(5)}⭐  множитель ×${c.mult.toFixed(2)}`));

  console.log('\n=== ИТОГ ===');
  console.log(`  первый престиж доступен: ${firstPrestigeAt === null ? 'НЕ ДОСТИГНУТ' : fmtTime(firstPrestigeAt)}  (цель 30–60 мин)`);
  console.log(`  престижей за ${minutes} мин: ${prestigeCount}`);
  console.log(`  точек открыто: ${state.businesses.filter((b) => b.level > 0).length}/9, менеджеров: ${state.businesses.filter((b) => b.hasManager).length}`);
  console.log(`  звёзд: ${state.stars}, множитель престижа ×${Economy.starMultiplier(state).toFixed(2)}`);
  console.log(`  тапов сделано: ${state.taps}`);
  console.log('');
}
