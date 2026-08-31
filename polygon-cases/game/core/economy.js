/*
 * economy.js — ядро игры. Никакого DOM, никакого SDK, только числа.
 *
 * Всё состояние — один сериализуемый объект. В инвентаре лежат только
 * сиды и float: картинка собирается заново при каждом запуске, поэтому
 * сейв остаётся маленьким даже при трёхстах предметах.
 *
 * Модуль детерминирован: при одинаковом сиде открытия результат всегда
 * один и тот же. Это нужно не ради красоты, а чтобы симуляция на
 * десять тысяч открытий считала ровно ту же экономику, в которую играет
 * игрок, а не похожую.
 */
(function (root) {
  'use strict';

  var PG = (root.PG = root.PG || {});
  var B = PG.BALANCE;

  var RARITY_KEYS = ['standard', 'improved', 'rare', 'elite', 'legend', 'relic'];

  function setBalance(balance) {
    PG.BALANCE = B = balance;
    PG.CASES.reset();
  }

  /* ------------------------------------------------------------------ *
   * Состояние
   * ------------------------------------------------------------------ */
  function createState() {
    return {
      v: B.version,
      credits: B.start.credits,
      /* инвентарь: { id, seed, idx, float, counter, caseId, fav, at } */
      items: [],
      nextItemId: 1,

      /* статистика и прогресс */
      opened: 0,
      openedByCase: {},
      sold: 0,
      contracts: 0,
      upgrades: 0,
      upgradeWins: 0,
      bestDrop: -1,
      earned: 0,
      spent: 0,

      /* коллекции: caseId -> { indexes: {}, done: bool } */
      collections: {},

      /* таймеры по серверному времени */
      freeCaseAt: 0,
      dailyAt: 0,
      dailyStreak: 0,
      questsAt: 0,
      quests: [],

      cooldowns: { sellX2: 0, bonus: 0, retry: 0, dailyX3: 0 },
      boosts: { sellX2: false, retry: false },

      purchases: {
        noAds: false,
        fastCase: false,
        bigInventory: false,
        starterPack: false
      },

      /* разовые события: подсказки, оценка игры, ярлык */
      flags: {}
    };
  }

  /* Приводит сохранение к текущей структуре и чистит мусор. */
  function migrate(saved) {
    var out = createState();
    if (!saved || typeof saved !== 'object') return out;

    out.credits = Math.max(0, num(saved.credits, out.credits));
    out.nextItemId = Math.max(1, Math.floor(num(saved.nextItemId, 1)));
    out.opened = Math.max(0, Math.floor(num(saved.opened, 0)));
    out.sold = Math.max(0, Math.floor(num(saved.sold, 0)));
    out.contracts = Math.max(0, Math.floor(num(saved.contracts, 0)));
    out.upgrades = Math.max(0, Math.floor(num(saved.upgrades, 0)));
    out.upgradeWins = Math.max(0, Math.floor(num(saved.upgradeWins, 0)));
    out.bestDrop = Math.floor(num(saved.bestDrop, -1));
    out.earned = Math.max(0, num(saved.earned, 0));
    out.spent = Math.max(0, num(saved.spent, 0));
    out.freeCaseAt = Math.max(0, num(saved.freeCaseAt, 0));
    out.dailyAt = Math.max(0, num(saved.dailyAt, 0));
    out.dailyStreak = Math.max(0, Math.floor(num(saved.dailyStreak, 0)));
    out.questsAt = Math.max(0, num(saved.questsAt, 0));
    out.flags = (saved.flags && typeof saved.flags === 'object') ? saved.flags : {};

    if (saved.openedByCase && typeof saved.openedByCase === 'object') {
      PG.CASES.list.forEach(function (c) {
        var v = num(saved.openedByCase[c.id], 0);
        if (v > 0) out.openedByCase[c.id] = Math.floor(v);
      });
    }

    /* предметы переносим по одному: чужие поля в сейв не пускаем */
    var maxId = out.nextItemId;
    (saved.items || []).forEach(function (it) {
      if (!it || typeof it !== 'object') return;
      var caseId = String(it.caseId || '');
      if (!PG.CASES.byId(caseId)) return;
      var seed = num(it.seed, NaN);
      if (!isFinite(seed)) return;

      var id = Math.floor(num(it.id, maxId));
      if (id >= maxId) maxId = id + 1;

      /* номер записи в коллекции. В старых сейвах его нет — тогда
         восстанавливаем по сиду, он уникален внутри кейса */
      var idx = num(it.idx, NaN);
      if (!isFinite(idx)) {
        var found = PG.CASES.entryBySeed(caseId, seed);
        if (!found) return;
        idx = found.index;
      } else if (!PG.CASES.entry(caseId, idx)) {
        return;
      }

      out.items.push({
        id: id,
        seed: seed,
        idx: idx,
        float: clamp01(num(it.float, 0.5)),
        counter: Math.max(0, Math.floor(num(it.counter, 0))),
        caseId: caseId,
        fav: !!it.fav,
        at: num(it.at, 0)
      });
    });
    out.nextItemId = maxId;

    if (saved.collections && typeof saved.collections === 'object') {
      PG.CASES.list.forEach(function (c) {
        var src = saved.collections[c.id];
        if (!src || typeof src !== 'object') return;
        var dst = { indexes: {}, done: !!src.done };
        Object.keys(src.indexes || {}).forEach(function (k) {
          if (src.indexes[k]) dst.indexes[k] = true;
        });
        out.collections[c.id] = dst;
      });
    }

    ['cooldowns', 'boosts', 'purchases'].forEach(function (key) {
      var src = saved[key];
      if (!src || typeof src !== 'object') return;
      Object.keys(out[key]).forEach(function (k) {
        if (typeof out[key][k] === 'boolean') out[key][k] = !!src[k];
        else out[key][k] = Math.max(0, num(src[k], 0));
      });
    });

    if (Array.isArray(saved.quests)) {
      out.quests = saved.quests.filter(function (q) {
        return q && typeof q.id === 'string' && questDef(q.id);
      }).map(function (q) {
        return {
          id: q.id,
          progress: Math.max(0, num(q.progress, 0)),
          claimed: !!q.claimed
        };
      });
    }

    return out;
  }

  function num(v, fallback) {
    v = typeof v === 'string' ? parseFloat(v) : v;
    return (typeof v === 'number' && isFinite(v)) ? v : fallback;
  }

  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  /* ------------------------------------------------------------------ *
   * Цена предмета
   * ------------------------------------------------------------------ */

  /*
   * Множитель за состояние. Линейный спад плюс надбавка за крайние
   * значения: и почти идеальный, и почти убитый предмет стоят дороже
   * среднего. Без этой надбавки float был бы просто шумом в подписи.
   */
  function floatMultiplier(f) {
    var cfg = B.float;
    var m = cfg.base - cfg.slope * f;
    if (f < cfg.extremeLow.below) m *= cfg.extremeLow.mult;
    else if (f > cfg.extremeHigh.above) m *= cfg.extremeHigh.mult;
    return Math.max(0.05, m);
  }

  /*
   * Описание предмета. Редкость приходит из записи коллекции: сид задаёт
   * внешность, а какой редкостью предмет лежит в кейсе — решает раскладка.
   * Если вывести редкость из одного сида, цена предмета разойдётся с
   * таблицей дропа, по которой он выпал, — именно это и ловится в
   * симуляции.
   */
  function skinOf(item, lang) {
    var entry = PG.CASES.entry(item.caseId, item.idx);
    return PG.SkinGen.generateSkin(item.seed, {
      rarity: entry ? entry.rarity : undefined,
      float: item.float,
      hasCounter: item.counter > 0,
      lang: lang
    });
  }

  function rarityOf(item) {
    var entry = PG.CASES.entry(item.caseId, item.idx);
    return entry ? entry.rarity : 0;
  }

  function itemValue(item) {
    return valueOf(skinOf(item), item);
  }

  function valueOf(skin, item) {
    var caseDef = PG.CASES.byId(item.caseId);
    var scale = caseDef ? caseDef.valueScale : 1;
    var base = B.rarityPrice[skin.rarity] || B.rarityPrice[0];
    var cls = PG.WEAPONS.classPrice[skin.cls] || 1;
    /* у реликтов класс уже учтён в базовой цене редкости */
    if (skin.rarity === 5) cls = 1;

    var v = base * cls * floatMultiplier(item.float) * scale;
    if (item.counter > 0) v *= B.float.counterMult;
    return Math.max(1, Math.round(v));
  }

  function sellValue(item) {
    return Math.max(1, Math.round(itemValue(item) * B.market.sellRate));
  }

  function inventoryValue(state) {
    var sum = 0;
    for (var i = 0; i < state.items.length; i++) sum += itemValue(state.items[i]);
    return sum;
  }

  /* ------------------------------------------------------------------ *
   * Открытие кейса
   * ------------------------------------------------------------------ */
  function dropTable() {
    return RARITY_KEYS.map(function (k) { return B.drop[k] || 0; });
  }

  function rollRarity(rnd) {
    var table = dropTable();
    var total = 0, i;
    for (i = 0; i < table.length; i++) total += table[i];
    var r = rnd() * total;
    for (i = 0; i < table.length; i++) {
      r -= table[i];
      if (r <= 0) return i;
    }
    return 0;
  }

  /*
   * Результат открытия. Считается ДО анимации — лента потом
   * подстраивается под него, никогда наоборот.
   *
   * rndSeed передаётся снаружи, чтобы симуляция могла прогнать десять
   * тысяч открытий детерминированно.
   */
  function rollDrop(caseId, rndSeed) {
    var caseDef = PG.CASES.byId(caseId);
    if (!caseDef) return null;

    var rnd = PG.RNG.make(rndSeed);
    var rarity = rollRarity(rnd);

    var pool = PG.CASES.byRarity(caseId, rarity);
    /* коллекция может не содержать этой редкости — падаем на ступень ниже */
    while (!pool.length && rarity > 0) {
      rarity--;
      pool = PG.CASES.byRarity(caseId, rarity);
    }
    if (!pool.length) return null;

    var entry = pool[rnd.int(pool.length)];
    var design = PG.SkinGen.generateSkin(entry.seed, { rarity: entry.rarity });

    /* float экземпляра: треугольное распределение внутри диапазона
       дизайна — крайние значения должны быть находкой, а не рутиной */
    var range = design.floatRange;
    var f = clamp01(range[0] + PG.SkinGen.triangular(rnd) * (range[1] - range[0]));
    var counter = rnd.chance(0.08) ? (1 + rnd.int(999)) : 0;

    return {
      seed: entry.seed,
      float: f,
      counter: counter,
      caseId: caseId,
      rarity: entry.rarity,
      index: entry.index,
      relic: !!entry.relic
    };
  }

  /* Кладёт выпавший предмет в инвентарь и обновляет прогресс. */
  function acceptDrop(state, drop, nowMs) {
    var item = {
      id: state.nextItemId++,
      seed: drop.seed,
      idx: drop.index,
      float: drop.float,
      counter: drop.counter,
      caseId: drop.caseId,
      fav: false,
      at: nowMs || 0
    };
    state.items.push(item);

    state.opened++;
    state.openedByCase[drop.caseId] = (state.openedByCase[drop.caseId] || 0) + 1;
    if (drop.rarity > state.bestDrop) state.bestDrop = drop.rarity;

    markCollected(state, drop.caseId, drop.index, drop.relic);
    bumpQuest(state, 'open', 1);
    bumpQuest(state, 'rarity', 1, drop.rarity);

    return item;
  }

  function canOpen(state, caseId) {
    var def = PG.CASES.byId(caseId);
    if (!def) return false;
    if (state.items.length >= capacity(state)) return false;
    return state.credits >= def.price;
  }

  function openCase(state, caseId, rndSeed, nowMs) {
    var def = PG.CASES.byId(caseId);
    if (!def || !canOpen(state, caseId)) return null;

    state.credits -= def.price;
    state.spent += def.price;

    var drop = rollDrop(caseId, rndSeed);
    if (!drop) {
      state.credits += def.price;   // откатываем: коллекция пустая
      state.spent -= def.price;
      return null;
    }
    return { drop: drop, item: acceptDrop(state, drop, nowMs) };
  }

  /* Бесплатный кейс: без списания кредитов, но по таймеру. */
  function openFreeCase(state, rndSeed, nowMs) {
    var caseId = B.freeCase.caseId;
    if (state.items.length >= capacity(state)) return null;
    var drop = rollDrop(caseId, rndSeed);
    if (!drop) return null;
    return { drop: drop, item: acceptDrop(state, drop, nowMs) };
  }

  /* ------------------------------------------------------------------ *
   * Коллекции
   * ------------------------------------------------------------------ */
  function markCollected(state, caseId, index, isRelic) {
    if (isRelic && !B.collection.countRelics) return;
    var col = state.collections[caseId];
    if (!col) col = state.collections[caseId] = { indexes: {}, done: false };
    col.indexes[index] = true;
  }

  function collectionProgress(state, caseId) {
    var total = PG.CASES.collectionSize(caseId);
    var col = state.collections[caseId];
    var have = col ? Object.keys(col.indexes).length : 0;
    return { have: Math.min(have, total), total: total, done: !!(col && col.done) };
  }

  /*
   * Награда за собранную коллекцию выдаётся один раз. Проверяется не по
   * таймеру, а после каждого открытия — иначе игрок узнавал бы о награде
   * с задержкой и связь «собрал -> получил» разрывалась бы.
   */
  function claimCollection(state, caseId) {
    var def = PG.CASES.byId(caseId);
    var p = collectionProgress(state, caseId);
    if (!def || p.done || p.have < p.total) return 0;

    var reward = Math.round(def.price * B.collection.rewardFactor);
    state.credits += reward;
    state.earned += reward;
    state.collections[caseId].done = true;
    return reward;
  }

  function readyCollections(state) {
    return PG.CASES.list.filter(function (c) {
      var p = collectionProgress(state, c.id);
      return !p.done && p.have >= p.total;
    }).map(function (c) { return c.id; });
  }

  /* ------------------------------------------------------------------ *
   * Инвентарь
   * ------------------------------------------------------------------ */
  function capacity(state) {
    return state.purchases.bigInventory ? B.inventory.capacityExtended : B.inventory.capacity;
  }

  function findItem(state, id) {
    for (var i = 0; i < state.items.length; i++) {
      if (state.items[i].id === id) return state.items[i];
    }
    return null;
  }

  function removeItem(state, id) {
    for (var i = 0; i < state.items.length; i++) {
      if (state.items[i].id === id) return state.items.splice(i, 1)[0];
    }
    return null;
  }

  /*
   * Продажа. Избранные предметы не продаются вообще — ни поштучно, ни
   * пачкой: это защита от случайного массового сброса коллекции, ради
   * которой отметка и существует.
   */
  function sellItem(state, id, multiplier) {
    var item = findItem(state, id);
    if (!item || item.fav) return 0;
    var gain = Math.round(sellValue(item) * (multiplier || 1));
    removeItem(state, id);
    state.credits += gain;
    state.earned += gain;
    state.sold++;
    bumpQuest(state, 'sell', 1);
    return gain;
  }

  function sellMany(state, ids, multiplier) {
    var total = 0, count = 0;
    ids.forEach(function (id) {
      var gain = sellItem(state, id, multiplier);
      if (gain > 0) { total += gain; count++; }
    });
    return { credits: total, count: count };
  }

  function toggleFavorite(state, id) {
    var item = findItem(state, id);
    if (!item) return false;
    item.fav = !item.fav;
    return item.fav;
  }

  /* ------------------------------------------------------------------ *
   * Контракт обмена: десять предметов одной редкости -> один следующей
   * ------------------------------------------------------------------ */
  function contractInputCount() {
    return B.market.contractInput;
  }

  function canContract(state, ids) {
    if (!ids || ids.length !== contractInputCount()) return false;
    var rarity = null;
    for (var i = 0; i < ids.length; i++) {
      var item = findItem(state, ids[i]);
      if (!item || item.fav) return false;
      var r = rarityOf(item);
      if (r >= 4) return false;                    // выше Легендарного менять некуда
      if (rarity === null) rarity = r;
      else if (rarity !== r) return false;
    }
    return true;
  }

  /*
   * Результат контракта. Float выводится из среднего float входящих
   * предметов — именно поэтому есть смысл подбирать материалы, а не
   * сдавать любой мусор одной редкости.
   */
  function runContract(state, ids, rndSeed, nowMs) {
    if (!canContract(state, ids)) return null;

    var sumFloat = 0;
    var cases = [];
    var rarity = 0;

    ids.forEach(function (id) {
      var item = findItem(state, id);
      rarity = rarityOf(item);
      sumFloat += item.float;
      cases.push(item.caseId);
    });

    var avgFloat = sumFloat / ids.length;
    var rnd = PG.RNG.make(rndSeed);
    var targetRarity = rarity + 1;

    /* предмет приходит из коллекции одного из сданных — как и должно
       быть: обмен внутри своих коллекций, а не из воздуха */
    var pool = [];
    var seen = {};
    cases.forEach(function (cid) {
      if (seen[cid]) return;
      seen[cid] = true;
      pool = pool.concat(PG.CASES.byRarity(cid, targetRarity));
    });
    if (!pool.length) return null;

    var entry = pool[rnd.int(pool.length)];
    var design = PG.SkinGen.generateSkin(entry.seed, { rarity: entry.rarity });

    /* средний float входа переносится в диапазон дизайна результата */
    var range = design.floatRange;
    var f = clamp01(range[0] + avgFloat * (range[1] - range[0]));

    ids.forEach(function (id) { removeItem(state, id); });

    var drop = {
      seed: entry.seed,
      float: f,
      counter: rnd.chance(0.05) ? (1 + rnd.int(999)) : 0,
      caseId: entry.caseId,
      rarity: entry.rarity,
      index: entry.index,
      relic: !!entry.relic
    };

    var item = {
      id: state.nextItemId++,
      seed: drop.seed,
      idx: drop.index,
      float: drop.float,
      counter: drop.counter,
      caseId: drop.caseId,
      fav: false,
      at: nowMs || 0
    };
    state.items.push(item);
    state.contracts++;
    markCollected(state, drop.caseId, drop.index, drop.relic);
    bumpQuest(state, 'contract', 1);
    if (drop.rarity > state.bestDrop) state.bestDrop = drop.rarity;

    return { drop: drop, item: item, avgFloat: avgFloat };
  }

  /* ------------------------------------------------------------------ *
   * Апгрейд: ставка против цели
   * ------------------------------------------------------------------ */
  function upgradeChance(state, stakeId, targetEntry) {
    var stake = findItem(state, stakeId);
    if (!stake || !targetEntry) return 0;
    var stakeValue = itemValue(stake);
    var targetValue = entryValue(targetEntry);
    if (targetValue <= 0) return 0;

    var m = B.market;
    var chance = (stakeValue / targetValue) * m.upgradeCommission;
    if (chance > m.upgradeMaxChance) chance = m.upgradeMaxChance;
    if (chance < m.upgradeMinChance) chance = m.upgradeMinChance;
    return chance;
  }

  /* Цена «эталонного» предмета коллекции — по нему считается шанс. */
  function entryValue(entry) {
    return valueOf(
      PG.SkinGen.generateSkin(entry.seed, { rarity: entry.rarity }),
      { caseId: entry.caseId, float: entry.midFloat !== undefined ? entry.midFloat : 0.4, counter: 0 }
    );
  }

  /*
   * Цели апгрейда: предметы дороже ставки, отсортированные по цене.
   * Показываем ограниченный список — иначе выбор превращается в простыню
   * из ста семнадцати позиций.
   */
  function upgradeTargets(state, stakeId, limit) {
    var stake = findItem(state, stakeId);
    if (!stake) return [];
    var stakeValue = itemValue(stake);

    var out = [];
    PG.CASES.list.forEach(function (c) {
      PG.CASES.collection(c.id).forEach(function (entry) {
        var v = entryValue(entry);
        if (v <= stakeValue * 1.1) return;
        if (v > stakeValue * 60) return;
        out.push({ entry: entry, value: v });
      });
    });

    out.sort(function (a, b) { return a.value - b.value; });
    return out.slice(0, limit || 12);
  }

  function runUpgrade(state, stakeId, entry, rndSeed, nowMs) {
    var stake = findItem(state, stakeId);
    if (!stake || stake.fav) return null;

    var chance = upgradeChance(state, stakeId, entry);
    var rnd = PG.RNG.make(rndSeed);
    var win = rnd() < chance;

    removeItem(state, stakeId);
    state.upgrades++;
    bumpQuest(state, 'upgrade', 1);

    if (!win) return { win: false, chance: chance };

    var design = PG.SkinGen.generateSkin(entry.seed, { rarity: entry.rarity });
    var range = design.floatRange;
    var f = clamp01(range[0] + PG.SkinGen.triangular(rnd) * (range[1] - range[0]));

    var item = {
      id: state.nextItemId++,
      seed: entry.seed,
      idx: entry.index,
      float: f,
      counter: 0,
      caseId: entry.caseId,
      fav: false,
      at: nowMs || 0
    };
    state.items.push(item);
    state.upgradeWins++;
    markCollected(state, entry.caseId, entry.index, !!entry.relic);
    if (entry.rarity > state.bestDrop) state.bestDrop = entry.rarity;

    return { win: true, chance: chance, item: item, drop: { rarity: entry.rarity } };
  }

  /* ------------------------------------------------------------------ *
   * Таймеры: бесплатный кейс, ежедневный бонус, задания
   * Все считаются по серверному времени — иначе системные часы крутят.
   * ------------------------------------------------------------------ */
  function freeCaseInterval(state) {
    var base = B.freeCase.intervalMs;
    return state.purchases.fastCase ? base / B.freeCase.speedBonus : base;
  }

  function freeCaseReadyIn(state, nowMs) {
    if (!state.freeCaseAt) return 0;
    var left = state.freeCaseAt + freeCaseInterval(state) - nowMs;
    return left > 0 ? left : 0;
  }

  function freeCaseReady(state, nowMs) {
    return freeCaseReadyIn(state, nowMs) <= 0;
  }

  function markFreeCaseTaken(state, nowMs) {
    state.freeCaseAt = nowMs;
  }

  /* Сброс таймера за рекламу — основной оффер игры. */
  function resetFreeCase(state) {
    state.freeCaseAt = 0;
  }

  function dayIndex(ms) {
    return Math.floor(ms / (24 * 60 * 60 * 1000));
  }

  function dailyReady(state, nowMs) {
    return dayIndex(nowMs) > dayIndex(state.dailyAt || 0);
  }

  function dailyAmount(state, multiplier) {
    var streak = Math.min(state.dailyStreak + 1, B.daily.maxStreak);
    var amount = B.daily.base * (1 + (streak - 1) * B.daily.streakStep);
    return Math.round(amount * (multiplier || 1));
  }

  function claimDaily(state, nowMs, multiplier) {
    if (!dailyReady(state, nowMs)) return 0;

    /* серия рвётся, если пропущен целый день сверх суток */
    var gapDays = dayIndex(nowMs) - dayIndex(state.dailyAt || 0);
    if (!state.dailyAt || gapDays > 1) state.dailyStreak = 0;

    var amount = dailyAmount(state, multiplier);
    state.dailyStreak = Math.min(state.dailyStreak + 1, B.daily.maxStreak);
    state.dailyAt = nowMs;
    state.credits += amount;
    state.earned += amount;
    return amount;
  }

  /* ------------------------------------------------------------------ *
   * Задания
   * ------------------------------------------------------------------ */
  function questDef(id) {
    var list = B.quests.list;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /* Набор заданий на сутки — детерминированный от номера дня. */
  function rollQuests(state, nowMs) {
    if (state.quests.length && dayIndex(nowMs) === dayIndex(state.questsAt)) return state.quests;

    var rnd = PG.RNG.make('quests:' + dayIndex(nowMs));
    var pool = B.quests.list.slice();
    rnd.shuffle(pool);

    state.quests = pool.slice(0, B.quests.perDay).map(function (q) {
      return { id: q.id, progress: 0, claimed: false };
    });
    state.questsAt = nowMs;
    return state.quests;
  }

  /*
   * Продвижение задания. rarity передаётся только для целей вида
   * «получи предмет редкости X» — остальные его игнорируют.
   */
  function bumpQuest(state, kind, amount, rarity) {
    (state.quests || []).forEach(function (q) {
      if (q.claimed) return;
      var def = questDef(q.id);
      if (!def || def.kind !== kind) return;
      if (kind === 'rarity' && (rarity === undefined || rarity < def.rarity)) return;
      q.progress += amount;
    });
  }

  function questReady(state, id) {
    var q = null;
    (state.quests || []).forEach(function (x) { if (x.id === id) q = x; });
    var def = questDef(id);
    if (!q || !def || q.claimed) return false;
    if (def.kind === 'value') return inventoryValue(state) >= def.goal;
    return q.progress >= def.goal;
  }

  function claimQuest(state, id) {
    if (!questReady(state, id)) return 0;
    var def = questDef(id);
    (state.quests || []).forEach(function (q) { if (q.id === id) q.claimed = true; });
    state.credits += def.reward;
    state.earned += def.reward;
    return def.reward;
  }

  /* ------------------------------------------------------------------ *
   * Кулдауны рекламных офферов
   * ------------------------------------------------------------------ */
  function tickCooldowns(state, dtMs) {
    Object.keys(state.cooldowns).forEach(function (k) {
      if (state.cooldowns[k] > 0) state.cooldowns[k] = Math.max(0, state.cooldowns[k] - dtMs);
    });
  }

  function adReady(state, key) {
    return !state.cooldowns[key] || state.cooldowns[key] <= 0;
  }

  function startCooldown(state, key) {
    var cfg = B.ads[key];
    if (cfg) state.cooldowns[key] = cfg.cooldownMs;
  }

  function addCredits(state, amount) {
    if (!(amount > 0)) return;
    state.credits += amount;
    state.earned += amount;
  }

  /* ------------------------------------------------------------------ *
   * Экспорт
   * ------------------------------------------------------------------ */
  PG.Economy = {
    setBalance: setBalance,
    createState: createState,
    migrate: migrate,

    itemValue: itemValue,
    valueOf: valueOf,
    skinOf: skinOf,
    rarityOf: rarityOf,
    sellValue: sellValue,
    inventoryValue: inventoryValue,
    floatMultiplier: floatMultiplier,
    entryValue: entryValue,

    dropTable: dropTable,
    rollDrop: rollDrop,
    canOpen: canOpen,
    openCase: openCase,
    openFreeCase: openFreeCase,
    acceptDrop: acceptDrop,

    capacity: capacity,
    findItem: findItem,
    removeItem: removeItem,
    sellItem: sellItem,
    sellMany: sellMany,
    toggleFavorite: toggleFavorite,

    contractInputCount: contractInputCount,
    canContract: canContract,
    runContract: runContract,

    upgradeChance: upgradeChance,
    upgradeTargets: upgradeTargets,
    runUpgrade: runUpgrade,

    collectionProgress: collectionProgress,
    claimCollection: claimCollection,
    readyCollections: readyCollections,

    freeCaseInterval: freeCaseInterval,
    freeCaseReadyIn: freeCaseReadyIn,
    freeCaseReady: freeCaseReady,
    markFreeCaseTaken: markFreeCaseTaken,
    resetFreeCase: resetFreeCase,

    dailyReady: dailyReady,
    dailyAmount: dailyAmount,
    claimDaily: claimDaily,

    rollQuests: rollQuests,
    questDef: questDef,
    questReady: questReady,
    claimQuest: claimQuest,
    bumpQuest: bumpQuest,

    tickCooldowns: tickCooldowns,
    adReady: adReady,
    startCooldown: startCooldown,
    addCredits: addCredits,

    RARITY_KEYS: RARITY_KEYS
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
