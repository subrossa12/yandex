/*
 * config.js — единая точка чтения настроек игры.
 *
 * Зачем: баланс идла крутится неделями по метрикам. Если каждое число
 * зашито в билд, любая правка — это новая сборка и новая модерация.
 * Поэтому все настраиваемые числа проходят через этот слой:
 *
 *   локальные дефолты (data/balance.js)  ←  зашиты в билд, работают всегда
 *          ↓ перекрываются
 *   удалённая конфигурация (флаги SDK)   ←  один запрос на старте
 *          ↓
 *   эффективный баланс                   ←  его и видит вся остальная игра
 *
 * Игра обязана полностью работать на локальных дефолтах: у игрока может
 * не быть сети (метро), флаги могут не приехать, значение может прийти
 * мусорным. Каждый из этих случаев здесь — штатный, а не ошибка.
 *
 * Остальной код не знает, откуда пришло значение: он читает либо
 * SE.BALANCE (это уже эффективный баланс), либо Config.getFlag(key).
 */
(function (root) {
  'use strict';

  var SE = (root.SE = root.SE || {});

  /* ------------------------------------------------------------------ *
   * СХЕМА ФЛАГОВ
   *
   * Каждая запись — одно число, которое можно крутить из Консоли, не
   * пересобирая игру. path — куда значение ложится в балансе, key — имя
   * флага в удалённой конфигурации, type — как парсить строку из SDK.
   *
   * Сегмент `[]` разворачивается по массиву, `$id` в ключе подставляется
   * из поля id элемента. Так одна строка схемы даёт девять флагов —
   * по одному на точку.
   * ------------------------------------------------------------------ */
  var SCHEMA_SRC = [
    /* точки: темп открытия сети и доходность */
    { path: 'businesses[].baseCost', key: 'biz.$id.baseCost', type: 'num' },
    { path: 'businesses[].costGrowth', key: 'biz.$id.costGrowth', type: 'num' },
    { path: 'businesses[].baseRevenue', key: 'biz.$id.baseRevenue', type: 'num' },
    { path: 'businesses[].baseCycleMs', key: 'biz.$id.baseCycleMs', type: 'num' },
    { path: 'businesses[].managerCost', key: 'biz.$id.managerCost', type: 'num' },

    /* пороги ускорения: «25,50,100,200» */
    { path: 'speedMilestones', key: 'speedMilestones', type: 'nums' },

    /* апгрейды дохода */
    { path: 'perBusinessUpgrades[].reqLevel', key: 'up.$suffix.reqLevel', type: 'int' },
    { path: 'perBusinessUpgrades[].mult', key: 'up.$suffix.mult', type: 'num' },
    { path: 'perBusinessUpgrades[].costFactor', key: 'up.$suffix.costFactor', type: 'num' },
    { path: 'globalUpgrades[].mult', key: 'gup.$id.mult', type: 'num' },
    { path: 'globalUpgrades[].cost', key: 'gup.$id.cost', type: 'num' },
    { path: 'globalUpgrades[].reqTotalLevels', key: 'gup.$id.reqTotalLevels', type: 'int' },

    /* престиж — главная ручка длины забега */
    { path: 'prestige.factor', key: 'prestige.factor', type: 'num' },
    { path: 'prestige.divisor', key: 'prestige.divisor', type: 'num' },
    { path: 'prestige.minStars', key: 'prestige.minStars', type: 'int' },
    { path: 'prestige.minStarsRatio', key: 'prestige.minStarsRatio', type: 'num' },
    { path: 'prestige.bonusPerStar', key: 'prestige.bonusPerStar', type: 'num' },
    { path: 'prestige.starExponent', key: 'prestige.starExponent', type: 'num' },
    { path: 'prestige.adBonus', key: 'prestige.adBonus', type: 'num' },

    /* офлайн-доход */
    { path: 'offline.capMs', key: 'offline.capMs', type: 'num' },
    { path: 'offline.capMsExtended', key: 'offline.capMsExtended', type: 'num' },
    { path: 'offline.minMs', key: 'offline.minMs', type: 'num' },
    { path: 'offline.rate', key: 'offline.rate', type: 'num' },

    /* кулдауны и сила рекламных офферов */
    { path: 'ads.speed.mult', key: 'ads.speed.mult', type: 'num' },
    { path: 'ads.speed.durationMs', key: 'ads.speed.durationMs', type: 'num' },
    { path: 'ads.speed.cooldownMs', key: 'ads.speed.cooldownMs', type: 'num' },
    { path: 'ads.cash.seconds', key: 'ads.cash.seconds', type: 'num' },
    { path: 'ads.cash.cooldownMs', key: 'ads.cash.cooldownMs', type: 'num' },
    { path: 'ads.discount.off', key: 'ads.discount.off', type: 'num' },
    { path: 'ads.discount.cooldownMs', key: 'ads.discount.cooldownMs', type: 'num' },
    { path: 'ads.offline.mult', key: 'ads.offline.mult', type: 'num' },
    { path: 'ads.offline.cooldownMs', key: 'ads.offline.cooldownMs', type: 'num' },
    { path: 'ads.prestige.bonus', key: 'ads.prestige.bonus', type: 'num' },
    { path: 'ads.prestige.cooldownMs', key: 'ads.prestige.cooldownMs', type: 'num' },

    /* межстраничная реклама */
    { path: 'interstitial.onPrestige', key: 'interstitial.onPrestige', type: 'bool' },
    { path: 'interstitial.onBusinessUnlock', key: 'interstitial.onBusinessUnlock', type: 'bool' },
    { path: 'interstitial.minGapMs', key: 'interstitial.minGapMs', type: 'num' },
    { path: 'interstitial.skipFirstSessionMs', key: 'interstitial.skipFirstSessionMs', type: 'num' },

    /* sticky-баннер: включается в Консоли, но прятать его в геймплее
       можно и из кода — рубильник лежит здесь и по умолчанию выключен */
    { path: 'banner.manageFromCode', key: 'banner.manageFromCode', type: 'bool' },
    { path: 'banner.hideInGameplay', key: 'banner.hideInGameplay', type: 'bool' },

    /* сохранения */
    { path: 'save.cloudDebounceMs', key: 'save.cloudDebounceMs', type: 'num' },

    /* подсказки новичку */
    { path: 'tutorial.tapHintMs', key: 'tutorial.tapHintMs', type: 'num' },
    { path: 'tutorial.managerHintMoney', key: 'tutorial.managerHintMoney', type: 'num' },

    /* аналитика и ярлык */
    { path: 'metrica.counterId', key: 'metrica.counterId', type: 'str' },
    { path: 'metrica.wallHitMs', key: 'metrica.wallHitMs', type: 'num' },
    { path: 'shortcut.fromSession', key: 'shortcut.fromSession', type: 'int' },
    { path: 'shortcut.delayMs', key: 'shortcut.delayMs', type: 'num' }
  ];

  var schema = [];        // развёрнутая схема: [{ key, path, type }]
  var byKey = {};
  var effective = null;   // эффективный баланс
  var remoteRaw = {};     // что реально пришло из SDK
  var applied = [];       // какие флаги реально перекрыли дефолт

  /* ------------------------------------------------------------------ *
   * Доступ по пути вида 'ads.speed.cooldownMs' и 'businesses.3.baseCost'
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

  /* Разворачивает `businesses[].baseCost` в девять конкретных путей. */
  function expandSchema(balance) {
    var out = [];
    SCHEMA_SRC.forEach(function (row) {
      var mark = row.path.indexOf('[]');
      if (mark < 0) {
        out.push({ key: row.key, path: row.path, type: row.type });
        return;
      }
      var arrPath = row.path.slice(0, mark);
      var tail = row.path.slice(mark + 2).replace(/^\./, '');
      var arr = getPath(balance, arrPath);
      if (!arr || !arr.length) return;
      arr.forEach(function (item, i) {
        var key = row.key
          .replace('$id', String(item.id || i))
          .replace('$suffix', String(item.suffix || item.id || i));
        out.push({ key: key, path: arrPath + '.' + i + (tail ? '.' + tail : ''), type: row.type });
      });
    });
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Парсинг значений. Флаги приезжают строками — и приезжать могут
   * какими угодно. Мусор молча отбрасывается: остаётся локальный дефолт.
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
      var list = s.split(/[,;\s]+/).map(function (x) { return parseFloat(x); });
      if (!list.length || list.some(function (x) { return !isFinite(x); })) return undefined;
      return list;
    }

    var n = parseFloat(s);
    if (!isFinite(n)) return undefined;
    return type === 'int' ? Math.round(n) : n;
  }

  /* Санитарная проверка: отрицательные цены и нулевые делители ломают
     экономику наглухо, поэтому такие значения не принимаем. */
  function isSane(path, value) {
    if (typeof value === 'boolean' || typeof value === 'string') return true;
    if (Array.isArray(value)) return value.every(function (v) { return v > 0; });
    if (!isFinite(value)) return false;
    if (/costGrowth$/.test(path)) return value > 1 && value < 5;
    if (/divisor$/.test(path)) return value > 0;
    if (/(Ms|Cost|Revenue|cost|mult|factor|seconds)$/i.test(path)) return value > 0;
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

  /*
   * Готовит слой к работе на одних локальных дефолтах. Вызывается до
   * любого запроса в сеть: если флаги не приедут, игра уже работает.
   */
  function initLocal() {
    effective = deepClone(SE.BALANCE);
    schema = expandSchema(effective);
    byKey = {};
    schema.forEach(function (row) { byKey[row.key] = row; });
    applied = [];
    remoteRaw = {};
    publish();
    return effective;
  }

  /*
   * Накатывает удалённые значения поверх дефолтов. remote — плоский
   * объект { 'prestige.factor': '180', ... } ровно в том виде, в каком
   * его отдаёт SDK. Неизвестные ключи игнорируются, мусорные значения
   * отбрасываются по одному: один плохой флаг не роняет весь конфиг.
   */
  function applyRemote(remote) {
    if (!effective) initLocal();
    if (!remote || typeof remote !== 'object') return effective;

    remoteRaw = remote;
    schema.forEach(function (row) {
      if (!Object.prototype.hasOwnProperty.call(remote, row.key)) return;
      var value = parseValue(remote[row.key], row.type);
      if (value === undefined) return;
      if (!isSane(row.path, value)) return;
      var before = getPath(effective, row.path);
      if (before === value) return;
      if (setPath(effective, row.path, value)) {
        applied.push({ key: row.key, from: before, to: value });
      }
    });

    publish();
    return effective;
  }

  /* Отдаёт эффективный баланс всей игре. */
  function publish() {
    SE.BALANCE = effective;
    if (SE.Economy && typeof SE.Economy.setBalance === 'function') {
      SE.Economy.setBalance(effective);
    }
  }

  /*
   * Единая точка чтения. Работает и по имени флага ('prestige.factor'),
   * и по пути в балансе ('offline.capMs') — для большинства настроек это
   * одно и то же. Вызывающий не знает и не должен знать, пришло значение
   * из билда или из Консоли.
   */
  function getFlag(key, fallback) {
    if (!effective) initLocal();
    var row = byKey[key];
    var value = row ? getPath(effective, row.path) : getPath(effective, key);
    if (value === undefined || value === null) return fallback;
    return value;
  }

  /*
   * Дефолты в том формате, которого ждёт SDK: плоский объект строк.
   * Передаются в запрос флагов, чтобы платформа вернула их же, если
   * значение в Консоли не задано.
   */
  function defaultFlags() {
    if (!effective) initLocal();
    var out = {};
    schema.forEach(function (row) {
      var v = getPath(SE.BALANCE_DEFAULTS || effective, row.path);
      if (v === undefined || v === null) return;
      out[row.key] = Array.isArray(v) ? v.join(',') : String(v);
    });
    return out;
  }

  /* Диагностика: что реально перекрылось. Пригодится в отладке и тестах. */
  function report() {
    return {
      source: applied.length ? 'remote' : 'local',
      keys: schema.length,
      applied: applied.slice(),
      received: Object.keys(remoteRaw).length
    };
  }

  SE.Config = {
    initLocal: initLocal,
    applyRemote: applyRemote,
    getFlag: getFlag,
    defaultFlags: defaultFlags,
    report: report,
    get balance() { return effective || initLocal(); }
  };

  /* Дефолты запоминаем отдельно: applyRemote меняет effective на месте,
     а defaultFlags() обязан отдавать именно зашитые в билд значения. */
  SE.BALANCE_DEFAULTS = deepClone(SE.BALANCE);

  initLocal();
})(typeof globalThis !== 'undefined' ? globalThis : this);
