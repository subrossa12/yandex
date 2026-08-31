/*
 * balance.js — ВСЕ числа игры в одном месте.
 * Меняй значения здесь, код трогать не нужно.
 * Файл грузится обычным <script>, без модулей (чтобы работало по file://).
 */
(function (root) {
  'use strict';

  var MIN = 60 * 1000;
  var HOUR = 60 * MIN;

  var BALANCE = {
    version: 1,

    start: {
      money: 0,
      // первая точка выдаётся бесплатно, чтобы игрок сразу тапал
      freeFirstBusiness: true
    },

    /* ------------------------------------------------------------------ *
     * ТОЧКИ. Открываются по порядку: следующая видна, когда куплена
     * предыдущая. Цена N-го уровня: baseCost * costGrowth^level
     * Доход за цикл: baseRevenue * level * множители
     * ------------------------------------------------------------------ */
    businesses: [
      { id: 'stall',      icon: '🌯', baseCost: 4,            costGrowth: 1.07, baseRevenue: 1,             baseCycleMs: 1000,   managerCost: 1e3 },
      { id: 'cafe',       icon: '☕', baseCost: 60,           costGrowth: 1.15, baseRevenue: 60,            baseCycleMs: 3000,   managerCost: 1.5e4 },
      { id: 'bakery',     icon: '🥐', baseCost: 720,          costGrowth: 1.14, baseRevenue: 540,           baseCycleMs: 6000,   managerCost: 1e5 },
      { id: 'pizzeria',   icon: '🍕', baseCost: 8640,         costGrowth: 1.13, baseRevenue: 4320,          baseCycleMs: 12000,  managerCost: 5e5 },
      { id: 'sushi',      icon: '🍣', baseCost: 103680,       costGrowth: 1.12, baseRevenue: 51840,         baseCycleMs: 24000,  managerCost: 1.2e6 },
      { id: 'burger',     icon: '🍔', baseCost: 1866240,      costGrowth: 1.11, baseRevenue: 622080,        baseCycleMs: 48000,  managerCost: 2e7 },
      { id: 'restaurant', icon: '🍽️', baseCost: 29859840,     costGrowth: 1.10, baseRevenue: 7464960,       baseCycleMs: 96000,  managerCost: 3e8 },
      { id: 'foodcourt',  icon: '🏬', baseCost: 447897600,    costGrowth: 1.09, baseRevenue: 89579520,      baseCycleMs: 192000, managerCost: 4e9 },
      { id: 'network',    icon: '🚚', baseCost: 6449725440,   costGrowth: 1.08, baseRevenue: 1074954240,    baseCycleMs: 384000, managerCost: 5e10 }
    ],

    /* Пороги уровней: каждый делит длительность цикла пополам */
    speedMilestones: [25, 50, 100, 200],

    /* ------------------------------------------------------------------ *
     * АПГРЕЙДЫ ДОХОДА
     * perBusiness: множитель к доходу конкретной точки.
     *   cost = baseCost точки * costFactor
     * global: множитель ко всему.
     * ------------------------------------------------------------------ */
    perBusinessUpgrades: [
      { suffix: 'u1', reqLevel: 20,  mult: 2, costFactor: 900 },
      { suffix: 'u2', reqLevel: 50,  mult: 3, costFactor: 9000 },
      { suffix: 'u3', reqLevel: 100, mult: 2, costFactor: 120000 },
      { suffix: 'u4', reqLevel: 150, mult: 3, costFactor: 2500000 }
    ],

    globalUpgrades: [
      { id: 'g1', icon: '📣', mult: 2, cost: 2.5e5,  reqTotalLevels: 60 },
      { id: 'g2', icon: '🚛', mult: 2, cost: 4e7,    reqTotalLevels: 150 },
      { id: 'g3', icon: '🧊', mult: 2, cost: 6e9,    reqTotalLevels: 260 },
      { id: 'g4', icon: '🏆', mult: 2, cost: 8e11,   reqTotalLevels: 380 },
      { id: 'g5', icon: '📺', mult: 3, cost: 2e14,   reqTotalLevels: 520 },
      { id: 'g6', icon: '🛰️', mult: 3, cost: 5e16,   reqTotalLevels: 660 }
    ],

    /* ------------------------------------------------------------------ *
     * ПРЕСТИЖ («продать сеть» -> звёзды)
     * stars = floor(factor * sqrt(lifetimeEarned / divisor)) - уже полученные
     * Зависимость корневая: каждый следующий забег даёт меньше на единицу
     * заработка, поэтому престижи не обесцениваются.
     * ------------------------------------------------------------------ */
    prestige: {
      factor: 150,
      divisor: 1e13,
      /* престиж доступен, когда он даёт хотя бы столько звёзд */
      minStars: 15,
      /* ...но не меньше этой доли от уже имеющихся звёзд */
      minStarsRatio: 0,
      /* множитель = 1 + bonusPerStar * звёзды^starExponent
         Показатель < 1 гасит разгон: без него забеги на длинной
         дистанции схлопываются с 25 минут до пяти. */
      bonusPerStar: 0.07,
      starExponent: 0.8,
      /* реклама перед престижем */
      adBonus: 0.20
    },

    /* ------------------------------------------------------------------ *
     * ОФЛАЙН-ДОХОД
     * ------------------------------------------------------------------ */
    offline: {
      capMs: 2 * HOUR,
      capMsExtended: 8 * HOUR,   // покупается в магазине
      minMs: 60 * 1000,          // меньше минуты — экран не показываем
      /* доля от онлайн-темпа (только точки с менеджерами) */
      rate: 1.0
    },

    /* ------------------------------------------------------------------ *
     * РЕКЛАМНЫЕ ОФФЕРЫ (rewarded). Все — по кнопке, все — бонус сверху.
     * ------------------------------------------------------------------ */
    ads: {
      speed:    { id: 'speed',    icon: '⚡', mult: 3, durationMs: 4 * MIN,  cooldownMs: 10 * MIN },
      cash:     { id: 'cash',     icon: '💰', seconds: 30 * 60,             cooldownMs: 20 * MIN },
      discount: { id: 'discount', icon: '🏷️', off: 0.5,                     cooldownMs: 15 * MIN },
      offline:  { id: 'offline',  icon: '🌙', mult: 2,                      cooldownMs: 0 },
      prestige: { id: 'prestige', icon: '⭐', bonus: 0.20,                   cooldownMs: 0 }
    },

    /* Межстраничная реклама — только в логических паузах */
    interstitial: {
      onPrestige: true,
      onBusinessUnlock: true,
      minGapMs: 90 * 1000,          // свой предохранитель поверх платформенного
      skipFirstSessionMs: 3 * MIN   // не дёргать новичка в первые минуты
    },

    /* ------------------------------------------------------------------ *
     * STICKY-БАННЕР
     * Включается в Консоли, а не в коде, и по умолчанию висит всю сессию.
     * Возможность прятать его в геймплее заложена, но выключена: включать
     * её стоит только осознанно, флагом banner.manageFromCode.
     * ------------------------------------------------------------------ */
    banner: {
      manageFromCode: false,
      hideInGameplay: false
    },

    /* Дебаунс облачного сохранения */
    save: {
      cloudDebounceMs: 7000,
      localDebounceMs: 1000
    },

    /* Подсказки-туториал (показываются один раз) */
    tutorial: {
      tapHintMs: 2500,
      managerHintMoney: 900
    },

    /* ------------------------------------------------------------------ *
     * АНАЛИТИКА
     * counterId пустой: пока он пуст, счётчик не грузится и игра не делает
     * ни одного внешнего запроса. Номер счётчика подставляется сюда или
     * флагом metrica.counterId — тогда и подключается.
     * ------------------------------------------------------------------ */
    metrica: {
      counterId: '',
      /* «затык»: столько игрок не может позволить себе следующую покупку */
      wallHitMs: 60 * 1000
    },

    /* Предложение добавить ярлык игры на рабочий стол */
    shortcut: {
      fromSession: 3,          // не раньше третьей сессии
      delayMs: 45 * 1000       // и не в первую же секунду
    },

    /* Удалённая конфигурация */
    remoteConfig: {
      /* если флаги не приехали за это время — играем на дефолтах */
      timeoutMs: 3000
    }
  };

  root.SE = root.SE || {};
  root.SE.BALANCE = BALANCE;
})(typeof globalThis !== 'undefined' ? globalThis : this);
