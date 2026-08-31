/*
 * config.js — единая точка чтения настроек игры.
 *
 * Для симулятора кейсов это критичнее, чем для любого другого жанра:
 * таблицы дропа и цены придётся крутить постоянно, по метрикам, и
 * каждая правка числа не должна означать новую сборку и новую модерацию.
 *
 *   data/balance.js  ←  дефолты, зашиты в билд, работают всегда
 *          ↓ перекрываются
 *   ysdk.getFlags()  ←  один запрос на старте
 *          ↓
 *   эффективный конфиг  ←  его и видит вся остальная игра
 *
 * Игра обязана полностью работать на локальных дефолтах: сети может не
 * быть, флаги могут не приехать, значение может прийти мусорным. Каждый
 * из этих случаев здесь штатный, а не ошибка.
 */
(function (root) {
  'use strict';

  var PG = (root.PG = root.PG || {});

  /* ------------------------------------------------------------------ *
   * СХЕМА ФЛАГОВ
   *
   * `[]` разворачивается по массиву, `$id` подставляется из поля id.
   * Одна строка про кейсы даёт по флагу на каждый кейс.
   * ------------------------------------------------------------------ */
  var SCHEMA_SRC = [
    /* цены предметов по редкости — главная ручка всей экономики */
    { path: 'rarityPrice.0', key: 'price.standard', type: 'num' },
    { path: 'rarityPrice.1', key: 'price.improved', type: 'num' },
    { path: 'rarityPrice.2', key: 'price.rare', type: 'num' },
    { path: 'rarityPrice.3', key: 'price.elite', type: 'num' },
    { path: 'rarityPrice.4', key: 'price.legend', type: 'num' },
    { path: 'rarityPrice.5', key: 'price.relic', type: 'num' },

    /* таблица дропа */
    { path: 'drop.standard', key: 'drop.standard', type: 'num' },
    { path: 'drop.improved', key: 'drop.improved', type: 'num' },
    { path: 'drop.rare', key: 'drop.rare', type: 'num' },
    { path: 'drop.elite', key: 'drop.elite', type: 'num' },
    { path: 'drop.legend', key: 'drop.legend', type: 'num' },
    { path: 'drop.relic', key: 'drop.relic', type: 'num' },

    /* множители за состояние */
    { path: 'float.base', key: 'float.base', type: 'num' },
    { path: 'float.slope', key: 'float.slope', type: 'num' },
    { path: 'float.extremeLow.below', key: 'float.low.below', type: 'num' },
    { path: 'float.extremeLow.mult', key: 'float.low.mult', type: 'num' },
    { path: 'float.extremeHigh.above', key: 'float.high.above', type: 'num' },
    { path: 'float.extremeHigh.mult', key: 'float.high.mult', type: 'num' },
    { path: 'float.counterMult', key: 'float.counter', type: 'num' },

    /* рынок */
    { path: 'market.sellRate', key: 'market.sellRate', type: 'num' },
    { path: 'market.contractInput', key: 'market.contractInput', type: 'int' },
    { path: 'market.upgradeCommission', key: 'market.upgradeCommission', type: 'num' },
    { path: 'market.upgradeMaxChance', key: 'market.upgradeMaxChance', type: 'num' },
    { path: 'market.upgradeMinChance', key: 'market.upgradeMinChance', type: 'num' },

    /* кейсы: цена и ценность коллекции */
    { path: 'cases[].price', key: 'case.$id.price', type: 'num', from: 'cases' },
    { path: 'cases[].valueScale', key: 'case.$id.value', type: 'num', from: 'cases' },

    /* бесплатный кейс и ежедневный бонус */
    { path: 'freeCase.intervalMs', key: 'freeCase.intervalMs', type: 'num' },
    { path: 'freeCase.caseId', key: 'freeCase.caseId', type: 'str' },
    { path: 'freeCase.speedBonus', key: 'freeCase.speedBonus', type: 'num' },
    { path: 'daily.base', key: 'daily.base', type: 'num' },
    { path: 'daily.streakStep', key: 'daily.streakStep', type: 'num' },
    { path: 'daily.maxStreak', key: 'daily.maxStreak', type: 'int' },

    /* коллекции */
    { path: 'collection.rewardFactor', key: 'collection.rewardFactor', type: 'num' },

    /* анимация открытия */
    { path: 'roll.durationMs', key: 'roll.durationMs', type: 'num' },
    { path: 'roll.suspenseMs', key: 'roll.suspenseMs', type: 'num' },
    { path: 'roll.suspenseFromRarity', key: 'roll.suspenseFromRarity', type: 'int' },

    /* инвентарь */
    { path: 'inventory.capacity', key: 'inventory.capacity', type: 'int' },
    { path: 'inventory.capacityExtended', key: 'inventory.capacityExtended', type: 'int' },

    /* кулдауны и сила рекламных офферов */
    { path: 'ads.freeCase.cooldownMs', key: 'ads.freeCase.cooldownMs', type: 'num' },
    { path: 'ads.sellX2.mult', key: 'ads.sellX2.mult', type: 'num' },
    { path: 'ads.sellX2.cooldownMs', key: 'ads.sellX2.cooldownMs', type: 'num' },
    { path: 'ads.bonus.amount', key: 'ads.bonus.amount', type: 'num' },
    { path: 'ads.bonus.cooldownMs', key: 'ads.bonus.cooldownMs', type: 'num' },
    { path: 'ads.retry.cooldownMs', key: 'ads.retry.cooldownMs', type: 'num' },
    { path: 'ads.dailyX3.mult', key: 'ads.dailyX3.mult', type: 'num' },
    { path: 'ads.dailyX3.cooldownMs', key: 'ads.dailyX3.cooldownMs', type: 'num' },

    /* межстраничная реклама */
    { path: 'interstitial.onLeaveInventory', key: 'interstitial.onLeaveInventory', type: 'bool' },
    { path: 'interstitial.onSeriesEnd', key: 'interstitial.onSeriesEnd', type: 'bool' },
    { path: 'interstitial.minGapMs', key: 'interstitial.minGapMs', type: 'num' },
    { path: 'interstitial.skipFirstSessionMs', key: 'interstitial.skipFirstSessionMs', type: 'num' },
    { path: 'interstitial.afterRollMs', key: 'interstitial.afterRollMs', type: 'num' },

    /* sticky-баннер */
    { path: 'banner.manageFromCode', key: 'banner.manageFromCode', type: 'bool' },
    { path: 'banner.hideInGameplay', key: 'banner.hideInGameplay', type: 'bool' },

    { path: 'save.cloudDebounceMs', key: 'save.cloudDebounceMs', type: 'num' },
    { path: 'metrica.counterId', key: 'metrica.counterId', type: 'str' },
    { path: 'shortcut.fromSession', key: 'shortcut.fromSession', type: 'int' },
    { path: 'shortcut.delayMs', key: 'shortcut.delayMs', type: 'num' }
  ];

  var schema = [];
  var byKey = {};
  var effective = null;
  var remoteRaw = {};
  var applied = [];

  /* ------------------------------------------------------------------ *
   * Доступ по пути
   * ------------------------------------------------------------------ */
  function getPath(obj, path) {
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur === null || cur === undefined) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function setPath(obj, path, value) {
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (cur[parts[i]] === null || typeof cur[parts[i]] !== 'object') return false;
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
    return true;
  }

  /*
   * Кейсы живут не в balance.js, а в cases.js — отдельным списком.
   * Чтобы флаги могли их крутить, список подмешивается в эффективный
   * конфиг под ключом cases и оттуда же читается игрой.
   */
  function attachCases(target) {
    if (!PG.CASES) return;
    target.cases = PG.CASES.list;
  }

  function expandSchema(cfg) {
    var out = [];
    SCHEMA_SRC.forEach(function (row) {
      var mark = row.path.indexOf('[]');
      if (mark < 0) {
        out.push({ key: row.key, path: row.path, type: row.type });
        return;
      }
      var arrPath = row.path.slice(0, mark);
      var tail = row.path.slice(mark + 2).replace(/^\./, '');
      var arr = getPath(cfg, arrPath);
      if (!arr || !arr.length) return;
      arr.forEach(function (item, i) {
        out.push({
          key: row.key.replace('$id', String(item.id || i)),
          path: arrPath + '.' + i + (tail ? '.' + tail : ''),
          type: row.type
        });
      });
    });
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Разбор значений. Флаги приезжают строками и приезжать могут какими
   * угодно — мусор молча отбрасывается, остаётся локальный дефолт.
   * ------------------------------------------------------------------ */
  function parseValue(raw, type) {
    if (raw === null || raw === undefined) return undefined;
    var s = String(raw).trim();
    if (s === '') return undefined;

    if (type === 'str') return s;
    if (type === 'bool') {
      if (/^(1|true|yes|on)$/i.test(s)) return true;
      if (/^(0|false|no|off)$/i.test(s)) return false;
      return undefined;
    }
    if (type === 'nums') {
      var list = s.split(/[,;\s]+/).map(parseFloat);
      if (!list.length || list.some(function (x) { return !isFinite(x); })) return undefined;
      return list;
    }
    var n = parseFloat(s);
    if (!isFinite(n)) return undefined;
    return type === 'int' ? Math.round(n) : n;
  }

  /*
   * Санитарная проверка. Отрицательная цена или нулевая длительность
   * анимации ломают игру наглухо, а шанс апгрейда больше единицы
   * превращает её в печатный станок.
   */
  function isSane(path, value) {
    if (typeof value === 'boolean' || typeof value === 'string') return true;
    if (!isFinite(value)) return false;
    if (/Chance$|^drop\./.test(path)) return value >= 0 && value <= 1;
    if (/sellRate|upgradeCommission/.test(path)) return value > 0 && value <= 2;
    if (/(price|Price|value|Ms|amount|capacity|base|mult|Mult|Factor|Input|Scale)$/i.test(path)) return value > 0;
    return value >= 0;
  }

  function deepClone(obj) {
    if (Array.isArray(obj)) return obj.map(deepClone);
    if (obj && typeof obj === 'object') {
      var out = {};
      Object.keys(obj).forEach(function (k) { out[k] = deepClone(obj[k]); });
      return out;
    }
    return obj;
  }

  /* ------------------------------------------------------------------ *
   * Публичное API
   * ------------------------------------------------------------------ */
  function initLocal() {
    effective = deepClone(PG.BALANCE);
    attachCases(effective);
    schema = expandSchema(effective);
    byKey = {};
    schema.forEach(function (row) { byKey[row.key] = row; });
    applied = [];
    remoteRaw = {};
    publish();
    return effective;
  }

  /*
   * Накатывает удалённые значения поверх дефолтов. Неизвестные ключи
   * игнорируются, мусорные отбрасываются поштучно: один плохой флаг не
   * должен ронять весь конфиг.
   */
  function applyRemote(remote) {
    if (!effective) initLocal();
    if (!remote || typeof remote !== 'object') return effective;

    remoteRaw = remote;
    schema.forEach(function (row) {
      if (!Object.prototype.hasOwnProperty.call(remote, row.key)) return;
      var value = parseValue(remote[row.key], row.type);
      if (value === undefined || !isSane(row.path, value)) return;
      var before = getPath(effective, row.path);
      if (before === value) return;
      if (setPath(effective, row.path, value)) {
        applied.push({ key: row.key, from: before, to: value });
      }
    });

    publish();
    return effective;
  }

  /*
   * Отдаёт эффективный конфиг всей игре. Кейсы лежат в нём по ссылке на
   * тот же массив, что и в PG.CASES, поэтому правка цены флагом видна и
   * магазину, и экономике без всякой синхронизации.
   */
  function publish() {
    PG.BALANCE = effective;
    if (PG.Economy && typeof PG.Economy.setBalance === 'function') {
      PG.Economy.setBalance(effective);
    }
  }

  /* Единая точка чтения: по имени флага либо по пути в конфиге. */
  function getFlag(key, fallback) {
    if (!effective) initLocal();
    var row = byKey[key];
    var value = row ? getPath(effective, row.path) : getPath(effective, key);
    if (value === undefined || value === null) return fallback;
    return value;
  }

  /* Дефолты в формате SDK: плоский объект строк. */
  function defaultFlags() {
    if (!effective) initLocal();
    var out = {};
    var src = PG.BALANCE_DEFAULTS || effective;
    schema.forEach(function (row) {
      var v = getPath(src, row.path);
      if (v === undefined || v === null) return;
      out[row.key] = Array.isArray(v) ? v.join(',') : String(v);
    });
    return out;
  }

  function report() {
    return {
      source: applied.length ? 'remote' : 'local',
      keys: schema.length,
      applied: applied.slice(),
      received: Object.keys(remoteRaw).length
    };
  }

  PG.Config = {
    initLocal: initLocal,
    applyRemote: applyRemote,
    getFlag: getFlag,
    defaultFlags: defaultFlags,
    report: report,
    get config() { return effective || initLocal(); }
  };

  /* Дефолты запоминаем отдельно: applyRemote меняет effective на месте,
     а defaultFlags() обязан отдавать именно зашитые в билд значения. */
  PG.BALANCE_DEFAULTS = deepClone(PG.BALANCE);
  PG.BALANCE_DEFAULTS.cases = PG.CASES ? deepClone(PG.CASES.list) : [];

  initLocal();
})(typeof globalThis !== 'undefined' ? globalThis : this);
