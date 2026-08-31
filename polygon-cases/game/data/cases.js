/*
 * cases.js — кейсы и их коллекции.
 *
 * Коллекция не перечислена руками, а выводится из сида кейса. Причина
 * та же, что и у самих скинов: контента должно быть много, а весить он
 * должен ноль. Семь кейсов по семнадцать предметов — это 119 скинов,
 * которые заняли бы килобайты таблиц и всё равно устарели бы при первой
 * же правке генератора.
 *
 * Что задаётся руками — это то, что генератор вывести не может:
 * цена кейса, ценность его коллекции, тема (какие классы оружия и какие
 * палитры в нём встречаются) и раскладка по редкостям.
 *
 * Кейсы различаются НЕ шансами, а ценностью коллекции. Шансы у всех
 * одинаковые, и это осознанно: игроку не нужно сравнивать семь таблиц
 * вероятностей, правило одно — дороже кейс, дороже содержимое.
 */
(function (root) {
  'use strict';

  var PG = (root.PG = root.PG || {});

  /*
   * Раскладка коллекции по редкостям. Четырнадцать предметов основного
   * состава плюс три реликта отдельным пулом: реликт не входит в зачёт
   * коллекции, иначе собрать её было бы нереально.
   */
  var LAYOUT = { 0: 5, 1: 4, 2: 3, 3: 1, 4: 1 };
  var RELICS = 3;

  var CASES = [
    {
      id: 'start', icon: '📦', seed: 1017,
      price: 750, valueScale: 0.5,
      theme: {
        classes: ['pistol', 'smg', 'shotgun', 'rifle'],
        palettes: ['steel', 'olive', 'slate', 'ash', 'sand', 'teal', 'cobalt', 'arctic', 'crimson', 'neon', 'glacier']
      }
    },
    {
      id: 'frost', icon: '❄️', seed: 2029,
      price: 1420, valueScale: 1.2,
      theme: {
        classes: ['smg', 'rifle', 'sniper', 'pistol'],
        palettes: ['steel', 'slate', 'ash', 'teal', 'cobalt', 'arctic', 'indigo', 'glacier', 'mono']
      }
    },
    {
      id: 'dust', icon: '🏜️', seed: 3041,
      price: 3990, valueScale: 3,
      theme: {
        classes: ['rifle', 'shotgun', 'pistol', 'smg'],
        palettes: ['sand', 'rust', 'clay', 'olive', 'amber', 'wine', 'magma', 'solar', 'gilded']
      }
    },
    {
      id: 'night', icon: '🌒', seed: 4057,
      price: 9940, valueScale: 8,
      theme: {
        classes: ['sniper', 'smg', 'pistol', 'rifle'],
        palettes: ['ash', 'slate', 'plum', 'indigo', 'cobalt', 'royal', 'mono', 'venom']
      }
    },
    {
      id: 'reagent', icon: '🧪', seed: 5081,
      price: 23800, valueScale: 20,
      theme: {
        classes: ['rifle', 'smg', 'shotgun', 'sniper'],
        palettes: ['moss', 'olive', 'jade', 'teal', 'toxic', 'verdant', 'venom', 'prism']
      }
    },
    {
      id: 'furnace', icon: '🔥', seed: 6091,
      price: 80100, valueScale: 55,
      theme: {
        classes: ['shotgun', 'rifle', 'pistol', 'sniper'],
        palettes: ['rust', 'clay', 'wine', 'amber', 'crimson', 'magma', 'inferno', 'ember', 'solar']
      }
    },
    {
      id: 'prism', icon: '💠', seed: 7103,
      price: 234100, valueScale: 150,
      theme: {
        classes: ['sniper', 'rifle', 'smg', 'pistol'],
        palettes: ['teal', 'cobalt', 'plum', 'arctic', 'indigo', 'neon', 'royal', 'prism', 'glacier', 'venom']
      }
    }
  ];

  var built = {};

  /*
   * Коллекция кейса: список описаний скинов с их редкостью.
   * Сид каждого предмета выводится из сида кейса и порядкового номера,
   * поэтому коллекция одинакова у всех игроков и во всех сессиях —
   * это обязательное свойство, иначе прогресс коллекций рассыплется.
   */
  function collection(caseId) {
    if (built[caseId]) return built[caseId];

    var def = byId(caseId);
    if (!def) return [];

    var out = [];
    var index = 0;

    Object.keys(LAYOUT).forEach(function (rarityKey) {
      var rarity = parseInt(rarityKey, 10);
      for (var i = 0; i < LAYOUT[rarityKey]; i++) {
        out.push({
          seed: def.seed * 1000 + index,
          rarity: rarity,
          caseId: def.id,
          index: index
        });
        index++;
      }
    });

    /* реликты — отдельный хвост, вне зачёта коллекции */
    for (var r = 0; r < RELICS; r++) {
      out.push({
        seed: def.seed * 1000 + 900 + r,
        rarity: 5,
        caseId: def.id,
        index: 900 + r,
        relic: true
      });
    }

    built[caseId] = out;
    return out;
  }

  /* Предметы коллекции конкретной редкости — из них и выбирается дроп. */
  function byRarity(caseId, rarity) {
    return collection(caseId).filter(function (e) { return e.rarity === rarity; });
  }

  /* Сколько предметов идёт в зачёт коллекции (реликты не считаются). */
  function collectionSize(caseId) {
    return collection(caseId).filter(function (e) { return !e.relic; }).length;
  }

  function byId(id) {
    for (var i = 0; i < CASES.length; i++) if (CASES[i].id === id) return CASES[i];
    return null;
  }

  /*
   * Запись коллекции по номеру. Это единственный источник правды о
   * редкости предмета: сид задаёт внешность, а какой редкостью предмет
   * лежит в кейсе — решает раскладка коллекции, и вывести её из сида
   * нельзя. Поэтому в инвентаре у предмета хранится номер записи.
   */
  function entry(caseId, index) {
    var list = collection(caseId);
    for (var i = 0; i < list.length; i++) if (list[i].index === index) return list[i];
    return null;
  }

  /* Запасной путь для старых сейвов, где номера ещё не было. */
  function entryBySeed(caseId, seed) {
    var list = collection(caseId);
    for (var i = 0; i < list.length; i++) if (list[i].seed === seed) return list[i];
    return null;
  }

  /* Кеш сбрасывается, если флаги поменяли состав кейсов. */
  function reset() { built = {}; }

  PG.CASES = {
    list: CASES,
    byId: byId,
    collection: collection,
    entry: entry,
    entryBySeed: entryBySeed,
    byRarity: byRarity,
    collectionSize: collectionSize,
    layout: LAYOUT,
    relics: RELICS,
    reset: reset
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
