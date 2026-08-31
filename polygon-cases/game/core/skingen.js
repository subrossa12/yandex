/*
 * skingen.js — генератор скинов. Ядро всего проекта.
 *
 * Скин не рисуется художником, а выводится из сида: силуэт оружия,
 * паттерн, палитра, износ и название — детерминированные функции одного
 * числа. Отсюда следует всё остальное: нулевой вес ассетов, бесконечный
 * контент и то, что в сейве лежат только сиды, а не картинки.
 *
 * Главное свойство, которое нельзя нарушать: один и тот же сид всегда
 * даёт один и тот же скин. Поэтому порядок обращений к ГПСЧ здесь
 * фиксирован — вставка нового вызова в середину функции переименует и
 * перекрасит все уже выпавшие предметы во всех сейвах.
 *
 * Модуль не знает про DOM: он возвращает описание, а рисует skinrender.js.
 */
(function (root) {
  'use strict';

  var PG = (root.PG = root.PG || {});

  /* ------------------------------------------------------------------ *
   * Шкалы. Обе — наши собственные, а не заимствованные термины.
   * ------------------------------------------------------------------ */
  var RARITIES = ['standard', 'improved', 'rare', 'elite', 'legend', 'relic'];

  /*
   * Степени состояния. Границы неравномерные: «Потёртое» — самая широкая
   * полоса, потому что именно туда попадает большинство предметов, а
   * крайние состояния должны быть заметным событием.
   */
  var WEAR = [
    { id: 'pristine', max: 0.08 },
    { id: 'mint', max: 0.18 },
    { id: 'worn', max: 0.40 },
    { id: 'battered', max: 0.62 },
    { id: 'ruined', max: 1.01 }
  ];

  var PATTERNS = ['gradient', 'camo', 'stripes', 'hydro', 'splatter', 'geo', 'metallic', 'solid', 'fade', 'circuit'];

  /*
   * Вес паттерна по редкости. Дешёвые скины — простые заливки, дорогие —
   * сложные узоры. Это ещё один канал, по которому игрок угадывает
   * ценность предмета, не читая подпись.
   */
  var PATTERN_WEIGHTS = {
    /*            grad camo strp hydr splt  geo  metl  sold fade circ */
    0: [3, 4, 3, 1, 1, 1, 1, 5, 3, 1],
    1: [4, 4, 4, 2, 2, 2, 2, 3, 3, 2],
    2: [4, 3, 3, 3, 3, 3, 3, 2, 3, 3],
    3: [3, 2, 3, 4, 3, 4, 4, 1, 3, 4],
    4: [3, 1, 2, 4, 3, 5, 5, 1, 2, 5],
    5: [2, 1, 2, 4, 3, 5, 6, 1, 2, 5]
  };

  /*
   * Диапазоны float у конкретного дизайна. У части скинов идеальное
   * состояние физически недостижимо, у части — наоборот, не бывает
   * убитого. Это то, ради чего вообще имеет смысл коллекционировать:
   * «Идеальное» у скина с нижней границей 0.10 не существует в природе.
   */
  var FLOAT_RANGES = [
    [0.00, 1.00], [0.00, 1.00], [0.00, 0.80], [0.00, 0.62],
    [0.06, 1.00], [0.10, 0.80], [0.00, 0.45], [0.14, 1.00]
  ];

  function clamp01(v) {
    return v < 0 ? 0 : (v > 1 ? 1 : v);
  }

  /* Взвешенный выбор индекса. */
  function pickWeighted(rnd, weights) {
    var total = 0, i;
    for (i = 0; i < weights.length; i++) total += weights[i];
    var r = rnd() * total;
    for (i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return weights.length - 1;
  }

  /*
   * Треугольное распределение: среднее вероятнее краёв. Крайние значения
   * float должны быть редкой находкой, а не рутиной, — при равномерном
   * распределении «почти идеальный» предмет выпадал бы каждый десятый раз
   * и ничего не стоил бы.
   */
  function triangular(rnd) {
    return (rnd() + rnd()) / 2;
  }

  function wearOf(float) {
    for (var i = 0; i < WEAR.length; i++) {
      if (float < WEAR[i].max) return WEAR[i].id;
    }
    return WEAR[WEAR.length - 1].id;
  }

  function wearIndex(float) {
    for (var i = 0; i < WEAR.length; i++) {
      if (float < WEAR[i].max) return i;
    }
    return WEAR.length - 1;
  }

  /* ------------------------------------------------------------------ *
   * Генерация
   * ------------------------------------------------------------------ */

  /*
   * generateSkin(seed, opts) — дизайн скина по сиду.
   *
   * opts (всё необязательно):
   *   rarity   — задать редкость снаружи. Нужно коллекциям: таблица дропа
   *              знает редкость раньше, чем выбран конкретный предмет.
   *   classes  — ограничить классы оружия (тема кейса).
   *   palettes — ограничить палитры (тема кейса).
   *   float    — подставить float конкретного экземпляра. Без него
   *              float выводится из сида: у дизайна есть «свой» float,
   *              и функция остаётся чистой функцией одного аргумента,
   *              как того требует детерминизм.
   *   lang     — язык названия.
   */
  function generateSkin(seed, opts) {
    opts = opts || {};
    var rnd = PG.RNG.make(seed);

    /* 1. редкость */
    var rarity = (typeof opts.rarity === 'number')
      ? opts.rarity
      : pickWeighted(rnd, [50, 26, 14, 6, 3, 1]);
    if (rarity < 0) rarity = 0;
    if (rarity > 5) rarity = 5;

    /* 2. оружие. Реликт — всегда ближний бой: это его определение. */
    var pool;
    if (rarity === 5) {
      pool = PG.WEAPONS.byClass('relic');
    } else {
      var allowed = opts.classes && opts.classes.length ? opts.classes : PG.WEAPONS.classes;
      pool = PG.WEAPONS.list.filter(function (w) {
        return w.cls !== 'relic' && allowed.indexOf(w.cls) >= 0;
      });
      if (!pool.length) pool = PG.WEAPONS.list.filter(function (w) { return w.cls !== 'relic'; });
    }
    var weapon = pool[rnd.int(pool.length)];

    /* 3. паттерн */
    var patternId = PATTERNS[pickWeighted(rnd, PATTERN_WEIGHTS[rarity])];

    /* 4. палитра */
    var palettes = PG.PALETTES.forRarity(rarity);
    if (opts.palettes && opts.palettes.length) {
      var themed = palettes.filter(function (p) { return opts.palettes.indexOf(p.id) >= 0; });
      if (themed.length) palettes = themed;
    }
    var palette = palettes[rnd.int(palettes.length)];

    /* 5. вариации отрисовки: угол, масштаб, сдвиг узора */
    var variant = {
      angle: Math.round(rnd.range(0, 360)),
      scale: rnd.range(0.7, 1.5),
      shift: rnd.range(0, 1),
      flip: rnd.chance(0.5),
      density: rnd.range(0.6, 1.4)
    };

    /* 6. диапазон float дизайна и сам float */
    var range = FLOAT_RANGES[rnd.int(FLOAT_RANGES.length)];
    var float = (typeof opts.float === 'number')
      ? clamp01(opts.float)
      : clamp01(range[0] + triangular(rnd) * (range[1] - range[0]));

    /* 7. редкий модификатор — счётчик на корпусе */
    var hasCounter = (typeof opts.hasCounter === 'boolean')
      ? opts.hasCounter
      : rnd.chance(0.08);

    /* 8. название. Индексы тянем всегда, даже если язык сменится: иначе
       смена языка сдвинула бы всю последовательность ГПСЧ. */
    var size = PG.NAMING.size;
    var adjIdx = rnd.int(size);
    var nounIdx = rnd.int(size);

    return {
      seed: seed,
      weaponId: weapon.id,
      cls: weapon.cls,
      patternId: patternId,
      paletteId: palette.id,
      rarity: rarity,
      rarityId: RARITIES[rarity],
      float: float,
      floatRange: range,
      wear: wearOf(float),
      wearIndex: wearIndex(float),
      hasCounter: hasCounter,
      variant: variant,
      nameIndex: [adjIdx, nounIdx],
      name: PG.NAMING.build(opts.lang || 'ru', adjIdx, nounIdx)
    };
  }

  /*
   * Экземпляр из инвентаря: дизайн берём из сида, float — из предмета.
   * Именно поэтому в сейве достаточно { seed, float }.
   */
  function describe(item, lang) {
    return generateSkin(item.seed, {
      float: item.float,
      hasCounter: item.counter > 0,
      lang: lang
    });
  }

  /* Название на другом языке без пересборки всего дизайна. */
  function nameFor(skin, lang) {
    return PG.NAMING.build(lang, skin.nameIndex[0], skin.nameIndex[1]);
  }

  PG.SkinGen = {
    generateSkin: generateSkin,
    describe: describe,
    nameFor: nameFor,
    wearOf: wearOf,
    wearIndex: wearIndex,
    triangular: triangular,
    RARITIES: RARITIES,
    WEAR: WEAR,
    PATTERNS: PATTERNS,
    FLOAT_RANGES: FLOAT_RANGES
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
