/*
 * economy.js — ядро игры. Никакого DOM, никакого SDK, только числа.
 * Всё состояние — один сериализуемый объект (см. createState).
 * Модуль детерминирован: tick(state, dtMs) полностью описывает симуляцию.
 */
(function (root) {
  'use strict';

  var SE = (root.SE = root.SE || {});
  var B = SE.BALANCE;

  /* ---------------------------------------------------------------- *
   * Справочники
   * ---------------------------------------------------------------- */
  var defIndex = {};
  var perBizUpgrades = [];   // плоский список апгрейдов точек

  function rebuildIndex() {
    B = SE.BALANCE;
    defIndex = {};
    perBizUpgrades = [];
    B.businesses.forEach(function (def, i) {
      defIndex[def.id] = { def: def, order: i };
      B.perBusinessUpgrades.forEach(function (u) {
        perBizUpgrades.push({
          id: def.id + '_' + u.suffix,
          business: def.id,
          reqLevel: u.reqLevel,
          mult: u.mult,
          cost: def.baseCost * u.costFactor,
          icon: def.icon
        });
      });
    });
  }

  function setBalance(balance) {
    SE.BALANCE = B = balance;
    rebuildIndex();
  }

  rebuildIndex();

  /* ---------------------------------------------------------------- *
   * Состояние
   * ---------------------------------------------------------------- */
  function createState() {
    var st = {
      v: B.version,
      money: B.start.money,
      /* заработано за текущий забег (для престижа) */
      runEarned: 0,
      /* заработано за всё время (для звёзд и лидерборда) */
      lifetimeEarned: 0,
      stars: 0,
      /* звёзды, «оплаченные» заработком: бонусные сверху сюда не идут */
      starsBase: 0,
      prestiges: 0,
      businesses: B.businesses.map(function (def) {
        return {
          id: def.id,
          level: 0,
          hasManager: false,
          progressMs: 0,
          running: false,
          upgrades: {}
        };
      }),
      globalUpgrades: {},
      boosts: {
        speedRemainMs: 0,
        discountReady: false,
        prestigeBonus: 0
      },
      cooldowns: { speed: 0, cash: 0, discount: 0 },
      purchases: {
        noAds: false,
        permaX2: false,
        offlineExtended: false,
        starterPack: false
      },
      buyMode: 1,               // 1 | 10 | 100 | 'max'
      playedMs: 0,
      unlockedCount: 1,
      taps: 0,
      flags: {}                 // разовые события: подсказки, оценка игры и т.п.
    };

    if (B.start.freeFirstBusiness) {
      st.businesses[0].level = 1;
      st.businesses[0].running = true;
    }
    return st;
  }

  /* Приводит сохранение старой версии к текущей структуре. */
  function migrate(state) {
    var fresh = createState();
    if (!state || typeof state !== 'object') return fresh;

    var out = fresh;
    out.money = num(state.money, 0);
    out.runEarned = num(state.runEarned, 0);
    out.lifetimeEarned = num(state.lifetimeEarned, out.runEarned);
    out.stars = Math.max(0, Math.floor(num(state.stars, 0)));
    out.starsBase = Math.max(0, Math.floor(num(state.starsBase, out.stars)));
    out.prestiges = Math.max(0, Math.floor(num(state.prestiges, 0)));
    out.playedMs = num(state.playedMs, 0);
    out.taps = num(state.taps, 0);
    out.buyMode = state.buyMode === 'max' ? 'max' : ([1, 10, 100].indexOf(state.buyMode) >= 0 ? state.buyMode : 1);
    out.flags = (state.flags && typeof state.flags === 'object') ? state.flags : {};

    var savedBiz = {};
    (state.businesses || []).forEach(function (b) { if (b && b.id) savedBiz[b.id] = b; });
    out.businesses.forEach(function (b, i) {
      var s = savedBiz[b.id];
      if (!s) {
        if (i === 0 && B.start.freeFirstBusiness) { b.level = 1; b.running = true; }
        return;
      }
      b.level = Math.max(0, Math.floor(num(s.level, 0)));
      b.hasManager = !!s.hasManager;
      b.progressMs = Math.max(0, num(s.progressMs, 0));
      b.running = !!s.running || b.hasManager;
      b.upgrades = (s.upgrades && typeof s.upgrades === 'object') ? s.upgrades : {};
    });

    /* булевы карты и таймеры переносим по одному ключу, чужое не тащим */
    if (state.globalUpgrades && typeof state.globalUpgrades === 'object') {
      B.globalUpgrades.forEach(function (u) {
        if (state.globalUpgrades[u.id]) out.globalUpgrades[u.id] = true;
      });
    }
    ['purchases', 'boosts', 'cooldowns'].forEach(function (key) {
      var src = state[key];
      if (!src || typeof src !== 'object') return;
      Object.keys(out[key]).forEach(function (k) {
        if (typeof out[key][k] === 'boolean') out[key][k] = !!src[k];
        else out[key][k] = Math.max(0, num(src[k], out[key][k]));
      });
    });

    out.unlockedCount = countUnlocked(out);
    return out;
  }

  function num(v, fallback) {
    v = typeof v === 'string' ? parseFloat(v) : v;
    return (typeof v === 'number' && isFinite(v)) ? v : fallback;
  }

  /* ---------------------------------------------------------------- *
   * Множители
   * ---------------------------------------------------------------- */
  function starMultiplier(state) {
    if (state.stars <= 0) return 1;
    var e = B.prestige.starExponent;
    var s = (e && e !== 1) ? Math.pow(state.stars, e) : state.stars;
    return 1 + s * B.prestige.bonusPerStar;
  }

  function globalMultiplier(state) {
    var m = starMultiplier(state);
    B.globalUpgrades.forEach(function (u) {
      if (state.globalUpgrades[u.id]) m *= u.mult;
    });
    if (state.purchases.permaX2) m *= 2;
    if (state.boosts.speedRemainMs > 0) m *= B.ads.speed.mult;
    return m;
  }

  function businessMultiplier(state, biz) {
    var m = 1;
    perBizUpgrades.forEach(function (u) {
      if (u.business === biz.id && biz.upgrades[u.id]) m *= u.mult;
    });
    return m;
  }

  function milestonesReached(level) {
    var n = 0;
    B.speedMilestones.forEach(function (ms) { if (level >= ms) n++; });
    return n;
  }

  function nextMilestone(level) {
    for (var i = 0; i < B.speedMilestones.length; i++) {
      if (level < B.speedMilestones[i]) return B.speedMilestones[i];
    }
    return null;
  }

  function cycleMs(state, biz) {
    var def = defIndex[biz.id].def;
    return def.baseCycleMs / Math.pow(2, milestonesReached(biz.level));
  }

  /* Доход за один цикл точки со всеми множителями. */
  function revenuePerCycle(state, biz) {
    if (biz.level <= 0) return 0;
    var def = defIndex[biz.id].def;
    return def.baseRevenue * biz.level * businessMultiplier(state, biz) * globalMultiplier(state);
  }

  /* Доход в секунду — считается только по работающим точкам. */
  function incomePerSecond(state) {
    var sum = 0;
    state.businesses.forEach(function (biz) {
      if (biz.level <= 0 || !biz.hasManager) return;
      sum += revenuePerCycle(state, biz) / (cycleMs(state, biz) / 1000);
    });
    return sum;
  }

  /* Потенциальный доход в секунду, если бы всё крутилось (для UI и офферов). */
  function potentialIncomePerSecond(state) {
    var sum = 0;
    state.businesses.forEach(function (biz) {
      if (biz.level <= 0) return;
      sum += revenuePerCycle(state, biz) / (cycleMs(state, biz) / 1000);
    });
    return sum;
  }

  /* ---------------------------------------------------------------- *
   * Покупка уровней
   * ---------------------------------------------------------------- */
  function discountFactor(state) {
    return state.boosts.discountReady ? (1 - B.ads.discount.off) : 1;
  }

  /* Сумма геометрической прогрессии: цена count уровней начиная с текущего. */
  function levelCost(state, biz, count) {
    var def = defIndex[biz.id].def;
    var g = def.costGrowth;
    var base = def.baseCost * Math.pow(g, biz.level);
    var raw = count === 1 ? base : base * (Math.pow(g, count) - 1) / (g - 1);
    return raw * discountFactor(state);
  }

  function maxAffordableLevels(state, biz) {
    var def = defIndex[biz.id].def;
    var g = def.costGrowth;
    var base = def.baseCost * Math.pow(g, biz.level) * discountFactor(state);
    if (state.money < base) return 0;
    var n = Math.floor(Math.log(state.money * (g - 1) / base + 1) / Math.log(g));
    /* защита от ошибок округления */
    while (n > 1 && levelCost(state, biz, n) > state.money) n--;
    return Math.max(0, n);
  }

  function buyCount(state, biz) {
    if (state.buyMode === 'max') return Math.max(1, maxAffordableLevels(state, biz));
    return state.buyMode;
  }

  function canBuyLevels(state, bizId, count) {
    var biz = getBusiness(state, bizId);
    if (!biz || !isUnlocked(state, bizId)) return false;
    return state.money >= levelCost(state, biz, count);
  }

  function buyLevels(state, bizId, count) {
    var biz = getBusiness(state, bizId);
    if (!biz || !isUnlocked(state, bizId)) return null;
    count = Math.max(1, Math.floor(count || 1));
    var cost = levelCost(state, biz, count);
    if (state.money < cost) return null;

    var wasZero = biz.level === 0;
    state.money -= cost;
    biz.level += count;
    if (state.boosts.discountReady) state.boosts.discountReady = false;
    if (biz.hasManager) biz.running = true;

    var unlockedNew = false;
    if (wasZero) {
      state.unlockedCount = countUnlocked(state);
      unlockedNew = true;
    }
    return { cost: cost, count: count, unlockedNew: unlockedNew };
  }

  /* Точка доступна к покупке, если предыдущая уже куплена. */
  function isUnlocked(state, bizId) {
    var idx = defIndex[bizId].order;
    if (idx === 0) return true;
    return state.businesses[idx - 1].level > 0;
  }

  function countUnlocked(state) {
    var n = 1;
    for (var i = 1; i < state.businesses.length; i++) {
      if (state.businesses[i - 1].level > 0) n = i + 1;
      else break;
    }
    return n;
  }

  function getBusiness(state, bizId) {
    var rec = defIndex[bizId];
    return rec ? state.businesses[rec.order] : null;
  }

  function getDef(bizId) {
    return defIndex[bizId] ? defIndex[bizId].def : null;
  }

  /* ---------------------------------------------------------------- *
   * Менеджеры и апгрейды
   * ---------------------------------------------------------------- */
  function managerCost(state, bizId) {
    return getDef(bizId).managerCost * discountFactor(state);
  }

  function buyManager(state, bizId) {
    var biz = getBusiness(state, bizId);
    if (!biz || biz.hasManager || biz.level <= 0) return false;
    var cost = managerCost(state, bizId);
    if (state.money < cost) return false;
    state.money -= cost;
    biz.hasManager = true;
    biz.running = true;
    if (state.boosts.discountReady) state.boosts.discountReady = false;
    return true;
  }

  /* Все апгрейды, доступные прямо сейчас (не купленные, уровень набран). */
  function availableUpgrades(state) {
    var out = [];
    perBizUpgrades.forEach(function (u) {
      var biz = getBusiness(state, u.business);
      if (!biz || biz.upgrades[u.id]) return;
      if (biz.level < u.reqLevel) return;
      out.push({
        id: u.id, kind: 'business', business: u.business, icon: u.icon,
        mult: u.mult, cost: u.cost * discountFactor(state)
      });
    });
    var totalLevels = 0;
    state.businesses.forEach(function (b) { totalLevels += b.level; });
    B.globalUpgrades.forEach(function (u) {
      if (state.globalUpgrades[u.id]) return;
      if (totalLevels < u.reqTotalLevels) return;
      out.push({
        id: u.id, kind: 'global', icon: u.icon,
        mult: u.mult, cost: u.cost * discountFactor(state)
      });
    });
    out.sort(function (a, b) { return a.cost - b.cost; });
    return out;
  }

  /* Ближайшие ещё не открытые апгрейды — чтобы показывать цель в UI. */
  function lockedUpgrades(state) {
    var out = [];
    perBizUpgrades.forEach(function (u) {
      var biz = getBusiness(state, u.business);
      if (!biz || biz.upgrades[u.id] || biz.level >= u.reqLevel) return;
      if (biz.level <= 0) return;
      out.push({ id: u.id, kind: 'business', business: u.business, icon: u.icon, mult: u.mult, cost: u.cost, reqLevel: u.reqLevel });
    });
    return out.sort(function (a, b) { return a.cost - b.cost; }).slice(0, 3);
  }

  function findUpgrade(id) {
    for (var i = 0; i < perBizUpgrades.length; i++) if (perBizUpgrades[i].id === id) return perBizUpgrades[i];
    for (var j = 0; j < B.globalUpgrades.length; j++) if (B.globalUpgrades[j].id === id) return B.globalUpgrades[j];
    return null;
  }

  function buyUpgrade(state, id) {
    var u = findUpgrade(id);
    if (!u) return false;
    var cost = u.cost * discountFactor(state);
    if (state.money < cost) return false;

    if (u.business) {
      var biz = getBusiness(state, u.business);
      if (!biz || biz.upgrades[id] || biz.level < u.reqLevel) return false;
      biz.upgrades[id] = true;
    } else {
      if (state.globalUpgrades[id]) return false;
      state.globalUpgrades[id] = true;
    }
    state.money -= cost;
    if (state.boosts.discountReady) state.boosts.discountReady = false;
    return true;
  }

  /*
   * Самая дешёвая осмысленная покупка прямо сейчас: уровень, менеджер
   * или апгрейд. Нужна, чтобы отличить «игрок копит» от «игрок упёрся»:
   * если денег не хватает даже на это, прогресс стоит.
   * Возвращает Infinity, когда покупать уже нечего.
   */
  function cheapestNextCost(state) {
    var min = Infinity;

    state.businesses.forEach(function (biz) {
      if (!isUnlocked(state, biz.id)) return;
      var lvl = levelCost(state, biz, 1);
      if (lvl < min) min = lvl;
      if (biz.level > 0 && !biz.hasManager) {
        var mgr = managerCost(state, biz.id);
        if (mgr < min) min = mgr;
      }
    });

    availableUpgrades(state).forEach(function (u) {
      if (u.cost < min) min = u.cost;
    });

    return min;
  }

  /* ---------------------------------------------------------------- *
   * Такт игры
   * ---------------------------------------------------------------- */
  function tap(state, bizId) {
    var biz = getBusiness(state, bizId);
    if (!biz || biz.level <= 0 || biz.running) return false;
    biz.running = true;
    state.taps++;
    return true;
  }

  /*
   * Продвигает симуляцию на dtMs. Возвращает сколько заработано и какие
   * точки завершили цикл (для эффектов в UI).
   */
  function tick(state, dtMs) {
    if (!(dtMs > 0)) return { earned: 0, completed: [] };
    if (dtMs > 5 * 60 * 1000) dtMs = 5 * 60 * 1000;  // защита от прыжков времени

    state.playedMs += dtMs;
    decayTimers(state, dtMs);

    var earned = 0;
    var completed = [];

    state.businesses.forEach(function (biz) {
      if (biz.level <= 0 || !biz.running) return;
      var len = cycleMs(state, biz);
      biz.progressMs += dtMs;
      if (biz.progressMs < len) return;

      var cycles = Math.floor(biz.progressMs / len);
      if (biz.hasManager) {
        biz.progressMs -= cycles * len;
      } else {
        cycles = 1;
        biz.progressMs = 0;
        biz.running = false;
      }
      var gain = revenuePerCycle(state, biz) * cycles;
      earned += gain;
      completed.push({ id: biz.id, gain: gain, cycles: cycles });
    });

    if (earned > 0) addMoney(state, earned);
    return { earned: earned, completed: completed };
  }

  function decayTimers(state, dtMs) {
    var b = state.boosts;
    if (b.speedRemainMs > 0) b.speedRemainMs = Math.max(0, b.speedRemainMs - dtMs);
    Object.keys(state.cooldowns).forEach(function (k) {
      if (state.cooldowns[k] > 0) state.cooldowns[k] = Math.max(0, state.cooldowns[k] - dtMs);
    });
  }

  function addMoney(state, amount) {
    if (!(amount > 0)) return;
    state.money += amount;
    state.runEarned += amount;
    state.lifetimeEarned += amount;
  }

  /* ---------------------------------------------------------------- *
   * Офлайн-доход
   * ---------------------------------------------------------------- */
  function offlineCapMs(state) {
    return state.purchases.offlineExtended ? B.offline.capMsExtended : B.offline.capMs;
  }

  /*
   * Считает офлайн-доход. elapsedMs должен приходить из серверного времени.
   * Учитываются только точки с менеджерами — это делает менеджеров ценными.
   */
  function offlineEarnings(state, elapsedMs) {
    var cap = offlineCapMs(state);
    var used = Math.max(0, Math.min(elapsedMs, cap));
    if (used < B.offline.minMs) return { amount: 0, ms: used, capped: false, cap: cap };

    var amount = 0;
    state.businesses.forEach(function (biz) {
      if (biz.level <= 0 || !biz.hasManager) return;
      var len = cycleMs(state, biz);
      var cycles = Math.floor(used / len);
      if (cycles > 0) amount += revenuePerCycle(state, biz) * cycles;
    });
    amount *= B.offline.rate;
    return { amount: amount, ms: used, capped: elapsedMs > cap, cap: cap };
  }

  function applyOffline(state, amount) {
    addMoney(state, amount);
    /* пока игрока не было, циклы точек «докрутились» */
    state.businesses.forEach(function (biz) {
      if (biz.hasManager) biz.progressMs = 0;
    });
  }

  /* ---------------------------------------------------------------- *
   * Престиж
   * ---------------------------------------------------------------- */
  function totalStarsFor(lifetimeEarned) {
    if (!(lifetimeEarned > 0)) return 0;
    return Math.floor(B.prestige.factor * Math.sqrt(lifetimeEarned / B.prestige.divisor));
  }

  /* Звёзды, честно заработанные (без рекламного бонуса) — база для формулы. */
  function starsBase(state) {
    return state.starsBase !== undefined ? state.starsBase : state.stars;
  }

  /* Сколько звёзд даст престиж без рекламного бонуса. */
  function pendingStarsRaw(state) {
    return Math.max(0, totalStarsFor(state.lifetimeEarned) - starsBase(state));
  }

  /* Сколько звёзд даст престиж прямо сейчас (с учётом бонуса за рекламу). */
  function pendingStars(state) {
    var raw = pendingStarsRaw(state);
    if (state.boosts.prestigeBonus > 0) return Math.floor(raw * (1 + state.boosts.prestigeBonus));
    return raw;
  }

  /* Порог престижа: фиксированный минимум либо доля от уже набранных звёзд. */
  function requiredStars(state) {
    var ratio = B.prestige.minStarsRatio || 0;
    return Math.max(B.prestige.minStars, Math.ceil(starsBase(state) * ratio));
  }

  function canPrestige(state) {
    return pendingStarsRaw(state) >= requiredStars(state);
  }

  /* Сколько ещё заработать до следующей звезды/до разблокировки престижа. */
  function earnedForStars(n) {
    var s = Math.max(0, n);
    return Math.pow(s / B.prestige.factor, 2) * B.prestige.divisor;
  }

  function prestigeProgress(state) {
    var need = earnedForStars(starsBase(state) + requiredStars(state));
    var have = state.lifetimeEarned;
    return { have: have, need: need, ratio: need > 0 ? Math.min(1, have / need) : 1 };
  }

  function doPrestige(state) {
    var raw = pendingStarsRaw(state);
    if (raw < requiredStars(state)) return null;
    var gained = pendingStars(state);   // с рекламным бонусом

    var keep = {
      stars: state.stars + gained,
      /* в базу идут только «оплаченные» звёзды, бонус остаётся подарком */
      starsBase: starsBase(state) + raw,
      prestiges: state.prestiges + 1,
      lifetimeEarned: state.lifetimeEarned,
      purchases: state.purchases,
      buyMode: state.buyMode,
      playedMs: state.playedMs,
      taps: state.taps,
      flags: state.flags,
      cooldowns: state.cooldowns
    };

    var fresh = createState();
    Object.keys(keep).forEach(function (k) { fresh[k] = keep[k]; });
    fresh.runEarned = 0;

    /* переносим состояние в тот же объект, чтобы не рвать ссылки */
    Object.keys(state).forEach(function (k) { delete state[k]; });
    Object.keys(fresh).forEach(function (k) { state[k] = fresh[k]; });
    state.boosts.prestigeBonus = 0;
    return { stars: gained, total: state.stars };
  }

  /* ---------------------------------------------------------------- *
   * Награды за рекламу
   * ---------------------------------------------------------------- */
  function adReady(state, key) {
    return !state.cooldowns[key] || state.cooldowns[key] <= 0;
  }

  function grantSpeedBoost(state) {
    state.boosts.speedRemainMs = B.ads.speed.durationMs;
    state.cooldowns.speed = B.ads.speed.cooldownMs;
  }

  function instantCashAmount(state) {
    return incomePerSecond(state) * B.ads.cash.seconds;
  }

  function grantInstantCash(state) {
    var amount = instantCashAmount(state);
    addMoney(state, amount);
    state.cooldowns.cash = B.ads.cash.cooldownMs;
    return amount;
  }

  function grantDiscount(state) {
    state.boosts.discountReady = true;
    state.cooldowns.discount = B.ads.discount.cooldownMs;
  }

  function grantPrestigeBonus(state) {
    state.boosts.prestigeBonus = B.prestige.adBonus;
  }

  /* ---------------------------------------------------------------- *
   * Экспорт
   * ---------------------------------------------------------------- */
  SE.Economy = {
    setBalance: setBalance,
    createState: createState,
    migrate: migrate,
    tick: tick,
    tap: tap,
    addMoney: addMoney,

    getBusiness: getBusiness,
    getDef: getDef,
    isUnlocked: isUnlocked,
    countUnlocked: countUnlocked,
    cycleMs: cycleMs,
    revenuePerCycle: revenuePerCycle,
    incomePerSecond: incomePerSecond,
    potentialIncomePerSecond: potentialIncomePerSecond,
    milestonesReached: milestonesReached,
    nextMilestone: nextMilestone,

    levelCost: levelCost,
    maxAffordableLevels: maxAffordableLevels,
    buyCount: buyCount,
    canBuyLevels: canBuyLevels,
    buyLevels: buyLevels,
    managerCost: managerCost,
    buyManager: buyManager,
    availableUpgrades: availableUpgrades,
    lockedUpgrades: lockedUpgrades,
    cheapestNextCost: cheapestNextCost,
    findUpgrade: findUpgrade,
    buyUpgrade: buyUpgrade,

    globalMultiplier: globalMultiplier,
    businessMultiplier: businessMultiplier,
    starMultiplier: starMultiplier,
    discountFactor: discountFactor,

    offlineCapMs: offlineCapMs,
    offlineEarnings: offlineEarnings,
    applyOffline: applyOffline,

    totalStarsFor: totalStarsFor,
    earnedForStars: earnedForStars,
    pendingStars: pendingStars,
    pendingStarsRaw: pendingStarsRaw,
    canPrestige: canPrestige,
    requiredStars: requiredStars,
    prestigeProgress: prestigeProgress,
    doPrestige: doPrestige,

    adReady: adReady,
    grantSpeedBoost: grantSpeedBoost,
    instantCashAmount: instantCashAmount,
    grantInstantCash: grantInstantCash,
    grantDiscount: grantDiscount,
    grantPrestigeBonus: grantPrestigeBonus
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
