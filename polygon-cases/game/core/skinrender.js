/*
 * skinrender.js — сборка SVG предмета из описания, которое вернул skingen.
 *
 * Один предмет — один <svg>, собранный из четырёх слоёв:
 *
 *   силуэт  →  заливка паттерном  →  износ  →  окантовка редкости
 *
 * Ключевое решение: паттерн живёт в системе координат самого SVG
 * (userSpaceOnUse), а не внутри каждой детали. Поэтому узор течёт через
 * приклад, корпус и цевьё непрерывно, как настоящее покрытие, — и при
 * этом порядок отрисовки деталей сохраняется как есть, без хитрых
 * группировок.
 *
 * Растровых изображений нет ни одного, весь визуал — разметка.
 */
(function (root) {
  'use strict';

  var PG = (root.PG = root.PG || {});

  var VIEW = PG.WEAPONS.view;

  /* ------------------------------------------------------------------ *
   * Мелкие помощники разметки
   * ------------------------------------------------------------------ */
  function pointsOf(pts) {
    var out = [];
    for (var i = 0; i < pts.length; i++) out.push(pts[i][0] + ',' + pts[i][1]);
    return out.join(' ');
  }

  function n(v) {
    return Math.round(v * 100) / 100;
  }

  /* Угол в координаты градиента по диагонали кадра. */
  function gradientVector(angle) {
    var rad = angle * Math.PI / 180;
    var cx = VIEW.w / 2, cy = VIEW.h / 2;
    var r = Math.max(VIEW.w, VIEW.h) * 0.6;
    return {
      x1: n(cx - Math.cos(rad) * r), y1: n(cy - Math.sin(rad) * r),
      x2: n(cx + Math.cos(rad) * r), y2: n(cy + Math.sin(rad) * r)
    };
  }

  function linear(id, angle, stops) {
    var v = gradientVector(angle);
    var body = stops.map(function (s) {
      return '<stop offset="' + s[0] + '" stop-color="' + s[1] + '"/>';
    }).join('');
    return '<linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" ' +
      'x1="' + v.x1 + '" y1="' + v.y1 + '" x2="' + v.x2 + '" y2="' + v.y2 + '">' +
      body + '</linearGradient>';
  }

  function tile(id, size, angle, body) {
    return '<pattern id="' + id + '" patternUnits="userSpaceOnUse" ' +
      'width="' + n(size) + '" height="' + n(size) + '" ' +
      'patternTransform="rotate(' + n(angle) + ')">' + body + '</pattern>';
  }

  /* ------------------------------------------------------------------ *
   * ПАТТЕРНЫ
   *
   * Каждый — функция (uid, c, v, rnd) -> { defs, fill, stroke? }, где
   * c — четыре цвета палитры (тень, база, свет, акцент),
   * v — вариации из skingen (угол, масштаб, плотность),
   * rnd — детерминированный ГПСЧ этого скина.
   * ------------------------------------------------------------------ */
  var PATTERNS = {

    /* Плавный переход в три цвета — самый спокойный вариант. */
    gradient: function (uid, c, v) {
      var id = uid + 'g';
      return {
        defs: linear(id, v.angle, [[0, c[0]], [0.5, c[1]], [1, c[2]]]),
        fill: 'url(#' + id + ')'
      };
    },

    /* Резкая двухцветная граница: половина корпуса одна, половина другая. */
    fade: function (uid, c, v) {
      var id = uid + 'g';
      var edge = 0.34 + v.shift * 0.3;
      return {
        defs: linear(id, v.angle, [
          [0, c[1]], [edge - 0.02, c[1]], [edge, c[0]],
          [edge + 0.24, c[0]], [edge + 0.26, c[2]], [1, c[2]]
        ]),
        fill: 'url(#' + id + ')'
      };
    },

    /* Металлик: полосы разной светлоты и один яркий блик. */
    metallic: function (uid, c, v) {
      var id = uid + 'g';
      var hl = 0.3 + v.shift * 0.4;
      return {
        defs: linear(id, v.angle, [
          [0, c[0]], [0.18, c[1]], [0.3, c[0]], [0.42, c[2]],
          [hl, c[3]], [Math.min(0.98, hl + 0.05), c[2]],
          [0.78, c[1]], [0.9, c[0]], [1, c[2]]
        ]),
        fill: 'url(#' + id + ')'
      };
    },

    /* Однотонный с окантовкой — минимализм, чаще всего у дешёвых скинов. */
    solid: function (uid, c, v) {
      var id = uid + 'g';
      return {
        defs: linear(id, v.angle, [[0, c[1]], [1, c[0]]]),
        fill: 'url(#' + id + ')',
        stroke: c[3],
        strokeWidth: 1.2
      };
    },

    /* Диагональные полосы переменной ширины. */
    stripes: function (uid, c, v, rnd) {
      var id = uid + 'p';
      var size = 26 * v.scale;
      var body = '<rect width="' + n(size) + '" height="' + n(size) + '" fill="' + c[1] + '"/>';
      var y = 0;
      while (y < size) {
        var h = size * (0.08 + rnd() * 0.18);
        var col = rnd() < 0.3 ? c[3] : (rnd() < 0.5 ? c[0] : c[2]);
        body += '<rect y="' + n(y) + '" width="' + n(size) + '" height="' + n(h) + '" fill="' + col + '"/>';
        y += h + size * (0.06 + rnd() * 0.14);
      }
      return { defs: tile(id, size, v.angle, body), fill: 'url(#' + id + ')' };
    },

    /* Камуфляж пятнами: скруглённые кляксы в три цвета. */
    camo: function (uid, c, v, rnd) {
      var id = uid + 'p';
      var size = 44 * v.scale;
      var body = '<rect width="' + n(size) + '" height="' + n(size) + '" fill="' + c[1] + '"/>';
      var count = Math.round(7 * v.density);
      for (var i = 0; i < count; i++) {
        var cx = rnd() * size, cy = rnd() * size;
        var rx = size * (0.1 + rnd() * 0.16), ry = size * (0.08 + rnd() * 0.14);
        var col = i % 3 === 0 ? c[0] : (i % 3 === 1 ? c[2] : c[3]);
        /* дублируем пятно по краям тайла, чтобы шов не читался */
        body += '<ellipse cx="' + n(cx) + '" cy="' + n(cy) + '" rx="' + n(rx) + '" ry="' + n(ry) +
          '" fill="' + col + '" transform="rotate(' + n(rnd() * 90) + ' ' + n(cx) + ' ' + n(cy) + ')"/>';
        body += '<ellipse cx="' + n(cx - size) + '" cy="' + n(cy) + '" rx="' + n(rx) + '" ry="' + n(ry) + '" fill="' + col + '"/>';
        body += '<ellipse cx="' + n(cx) + '" cy="' + n(cy - size) + '" rx="' + n(rx) + '" ry="' + n(ry) + '" fill="' + col + '"/>';
      }
      return { defs: tile(id, size, 0, body), fill: 'url(#' + id + ')' };
    },

    /* Гидрография: искажённая сетка, как плёночное покрытие. */
    hydro: function (uid, c, v, rnd) {
      var id = uid + 'p';
      var size = 30 * v.scale;
      var body = '<rect width="' + n(size) + '" height="' + n(size) + '" fill="' + c[1] + '"/>';
      var step = size / 3;
      for (var i = 0; i <= 3; i++) {
        var off = i * step;
        var w1 = (rnd() - 0.5) * step * 0.9;
        var w2 = (rnd() - 0.5) * step * 0.9;
        body += '<path d="M' + n(off) + ' 0 Q' + n(off + w1) + ' ' + n(size / 2) + ' ' + n(off + w2) + ' ' + n(size) +
          '" fill="none" stroke="' + (i % 2 ? c[2] : c[0]) + '" stroke-width="' + n(size * 0.09) + '"/>';
        body += '<path d="M0 ' + n(off) + ' Q' + n(size / 2) + ' ' + n(off + w2) + ' ' + n(size) + ' ' + n(off + w1) +
          '" fill="none" stroke="' + (i % 2 ? c[0] : c[3]) + '" stroke-width="' + n(size * 0.06) + '" opacity="0.75"/>';
      }
      return { defs: tile(id, size, v.angle * 0.2, body), fill: 'url(#' + id + ')' };
    },

    /* Брызги: круги разного радиуса, редкие крупные и много мелких. */
    splatter: function (uid, c, v, rnd) {
      var id = uid + 'p';
      var size = 36 * v.scale;
      var body = '<rect width="' + n(size) + '" height="' + n(size) + '" fill="' + c[0] + '"/>';
      var count = Math.round(26 * v.density);
      for (var i = 0; i < count; i++) {
        var r = size * (0.015 + Math.pow(rnd(), 3) * 0.16);
        var col = rnd() < 0.25 ? c[3] : (rnd() < 0.5 ? c[2] : c[1]);
        body += '<circle cx="' + n(rnd() * size) + '" cy="' + n(rnd() * size) + '" r="' + n(r) +
          '" fill="' + col + '" opacity="' + n(0.55 + rnd() * 0.45) + '"/>';
      }
      return { defs: tile(id, size, 0, body), fill: 'url(#' + id + ')' };
    },

    /* Геометрия: треугольная мозаика. */
    geo: function (uid, c, v, rnd) {
      var id = uid + 'p';
      var size = 24 * v.scale;
      var h = size / 2;
      var body = '<rect width="' + n(size) + '" height="' + n(size) + '" fill="' + c[1] + '"/>';
      var quads = [
        [[0, 0], [h, 0], [0, h]], [[h, 0], [size, 0], [size, h]],
        [[0, h], [h, size], [0, size]], [[size, h], [size, size], [h, size]],
        [[h, 0], [size, h], [h, size], [0, h]]
      ];
      quads.forEach(function (q) {
        var pick = rnd();
        var col = pick < 0.25 ? c[0] : (pick < 0.55 ? c[2] : (pick < 0.75 ? c[3] : c[1]));
        body += '<polygon points="' + pointsOf(q) + '" fill="' + col + '"/>';
      });
      return { defs: tile(id, size, v.angle, body), fill: 'url(#' + id + ')' };
    },

    /* Техно-трассы: ортогональные дорожки с узлами. Тема «ПОЛИГОНА». */
    circuit: function (uid, c, v, rnd) {
      var id = uid + 'p';
      var size = 34 * v.scale;
      var body = '<rect width="' + n(size) + '" height="' + n(size) + '" fill="' + c[0] + '"/>';
      var lines = Math.round(5 * v.density);
      for (var i = 0; i < lines; i++) {
        var x = rnd() * size, y = rnd() * size;
        var len = size * (0.3 + rnd() * 0.6);
        var horiz = rnd() < 0.5;
        var col = rnd() < 0.35 ? c[3] : c[2];
        var w = size * 0.045;
        if (horiz) {
          body += '<path d="M' + n(x) + ' ' + n(y) + ' h' + n(len) + ' v' + n(len * 0.4) +
            '" fill="none" stroke="' + col + '" stroke-width="' + n(w) + '"/>';
          body += '<circle cx="' + n(x + len) + '" cy="' + n(y + len * 0.4) + '" r="' + n(w * 1.6) + '" fill="' + col + '"/>';
        } else {
          body += '<path d="M' + n(x) + ' ' + n(y) + ' v' + n(len) + ' h' + n(len * 0.4) +
            '" fill="none" stroke="' + col + '" stroke-width="' + n(w) + '"/>';
          body += '<circle cx="' + n(x) + '" cy="' + n(y) + '" r="' + n(w * 1.6) + '" fill="' + col + '"/>';
        }
      }
      body += '<rect width="' + n(size) + '" height="' + n(size) + '" fill="' + c[1] + '" opacity="0.25"/>';
      return { defs: tile(id, size, v.angle, body), fill: 'url(#' + id + ')' };
    }
  };

  /* ------------------------------------------------------------------ *
   * ИЗНОС
   *
   * float управляет тремя вещами сразу, и все три нужны: по отдельности
   * ни одна не читается как «потёртая вещь».
   *   1. потёртости по краям деталей — обводка изнутри контура;
   *   2. царапины — короткие штрихи, чем выше float, тем их больше;
   *   3. выцветание — общая серая вуаль поверх покрытия.
   * ------------------------------------------------------------------ */
  function wearLayer(uid, skinPaths, float, rnd, detail) {
    if (float < 0.03) return '';

    var clip = uid + 'w';
    var out = '<clipPath id="' + clip + '">' + skinPaths.join('') + '</clipPath>';
    var body = '';

    /*
     * 1. края. Обводка изнутри контура — «облез по граням». Держим её
     * сдержанной: при высокой непрозрачности предмет превращается в
     * мультяшный контур и весь силуэт теряется.
     */
    var edge = Math.min(0.4, float * 0.55);
    body += '<g opacity="' + n(edge) + '">' +
      skinPaths.map(function (p) {
        return p.replace('/>', ' fill="none" stroke="#b0aa9e" stroke-width="' + n(0.8 + float * 2.2) + '"/>');
      }).join('') + '</g>';

    /* 2. царапины */
    var count = Math.round(float * 46);
    var scratches = '';
    for (var i = 0; i < count; i++) {
      var x = rnd() * VIEW.w, y = rnd() * VIEW.h;
      var len = 3 + rnd() * 16 * float;
      var a = (rnd() - 0.5) * 0.9;
      scratches += '<line x1="' + n(x) + '" y1="' + n(y) + '" x2="' + n(x + len) + '" y2="' + n(y + len * a) +
        '" stroke="#d8d2c6" stroke-width="' + n(0.4 + rnd() * 0.7) + '" opacity="' + n(0.2 + rnd() * 0.5) + '"/>';
    }
    body += scratches;

    /* 3. выцветание */
    if (float > 0.3) {
      body += '<rect width="' + VIEW.w + '" height="' + VIEW.h + '" fill="#6a655c" opacity="' +
        n(Math.min(0.34, (float - 0.3) * 0.55)) + '"/>';
    }

    /*
     * 4. шум. Фильтр тяжёлый, поэтому в сетке инвентаря он выключен:
     * там предмет 120 px шириной и разница не видна, а двести
     * одновременных feTurbulence роняют кадр. В крупном показе — включаем.
     */
    if (detail && float > 0.12) {
      body += '<rect width="' + VIEW.w + '" height="' + VIEW.h + '" filter="url(#pgGrain)" opacity="' +
        n(Math.min(0.5, float * 0.7)) + '"/>';
    }

    return out + '<g clip-path="url(#' + clip + ')">' + body + '</g>';
  }

  /* ------------------------------------------------------------------ *
   * СБОРКА
   * ------------------------------------------------------------------ */

  /*
   * Разметка одного предмета. Возвращает строку: собирать innerHTML
   * пачкой ощутимо быстрее, чем создавать сотни узлов по одному, а
   * сетка инвентаря — это как раз сотни узлов.
   */
  function svg(skin, opts) {
    opts = opts || {};
    var detail = !!opts.detail;
    var weapon = PG.WEAPONS.byId(skin.weaponId);
    var palette = PG.PALETTES.byId(skin.paletteId);
    var metal = PG.PALETTES.metal;
    var c = palette.c;
    var v = skin.variant;

    /* отдельный поток случайностей для отрисовки: не сдвигает генерацию */
    var rnd = PG.RNG.make('draw:' + skin.seed);
    var uid = 'k' + (PG.RNG.hash(skin.seed) % 1000000).toString(36) + (opts.uid || '');

    var pat = (PATTERNS[skin.patternId] || PATTERNS.gradient)(uid, c, v, rnd);

    var box0 = weapon.box;
    var defs = pat.defs;
    var bodyParts = [];
    var skinPaths = [];    // только окрашиваемые детали — для износа
    var allPaths = [];     // все детали — для общего объёма

    /*
     * Контур на каждой детали — не украшение. Без него плоские
     * многоугольники сливаются и с фоном витрины, и друг с другом:
     * предмет читается как набор плашек, а не как вещь. Двойная тёмная
     * линия на стыке деталей заодно работает как расшивка панелей.
     */
    var outline = ' stroke="' + metal.outline + '" stroke-width="1.6" stroke-linejoin="round"';

    weapon.parts.forEach(function (part) {
      var pts = pointsOf(part.pts);
      allPaths.push('<polygon points="' + pts + '"/>');
      if (part.role === 'skin') {
        bodyParts.push('<polygon points="' + pts + '" fill="' + pat.fill + '"' + outline + '/>');
        skinPaths.push('<polygon points="' + pts + '"/>');
        /* однотонный паттерн получает свою окантовку изнутри контура */
        if (pat.stroke) {
          bodyParts.push('<polygon points="' + pts + '" fill="none" stroke="' + pat.stroke +
            '" stroke-width="' + pat.strokeWidth + '"/>');
        }
      } else if (part.role === 'metal') {
        bodyParts.push('<polygon points="' + pts + '" fill="' + metal.base + '"' + outline + '/>');
      } else {
        bodyParts.push('<polygon points="' + pts + '" fill="' + metal.light + '"' + outline + '/>');
      }
    });

    /* панельные линии: без них крупная плоскость читается как плашка */
    var lines = (weapon.lines || []).map(function (l) {
      return '<line x1="' + l[0][0] + '" y1="' + l[0][1] + '" x2="' + l[1][0] + '" y2="' + l[1][1] +
        '" stroke="' + metal.dark + '" stroke-width="0.9" opacity="0.5"/>';
    }).join('');

    /* счётчик — редкий модификатор, маленькая табличка на корпусе */
    var counter = '';
    if (skin.hasCounter) {
      counter = '<g opacity="0.9"><rect x="150" y="18" width="26" height="12" rx="2" fill="' + metal.dark +
        '" stroke="' + c[3] + '" stroke-width="0.8"/>' +
        '<rect x="153" y="21" width="20" height="6" fill="' + c[3] + '" opacity="0.75"/></g>';
    }

    var wear = wearLayer(uid, skinPaths, skin.float, rnd, detail);

    /*
     * Объём. Свет сверху, тень снизу — одна и та же схема для каждой
     * детали, поэтому предмет читается как цельная вещь под общим
     * освещением, а не как аппликация из плашек. Накладывается на все
     * детали разом, включая металл: если осветлить только окрашенные
     * части, ствол и магазин выпадут из объёма.
     *
     * Градиент по вертикали кадра (userSpaceOnUse), а не по каждой
     * детали: иначе у крышки ствольной коробки и у магазина были бы
     * свои независимые «верх» и «низ», и свет поехал бы.
     */
    var shade = '<linearGradient id="' + uid + 's" gradientUnits="userSpaceOnUse" ' +
      'x1="0" y1="' + n(box0.y) + '" x2="0" y2="' + n(box0.y + box0.h) + '">' +
      '<stop offset="0" stop-color="#ffffff" stop-opacity="0.22"/>' +
      '<stop offset="0.34" stop-color="#ffffff" stop-opacity="0.05"/>' +
      '<stop offset="0.62" stop-color="#000000" stop-opacity="0.1"/>' +
      '<stop offset="1" stop-color="#000000" stop-opacity="0.42"/></linearGradient>';
    defs += shade;

    var volume = '<clipPath id="' + uid + 'v">' + allPaths.join('') + '</clipPath>' +
      '<g clip-path="url(#' + uid + 'v)"><rect x="' + n(box0.x) + '" y="' + n(box0.y) +
      '" width="' + n(box0.w) + '" height="' + n(box0.h) +
      '" fill="url(#' + uid + 's)"/></g>';

    /* кадр по габаритам модели: пистолет и винтовка занимают карточку
       одинаково плотно, хотя нарисованы в общей системе координат */
    return '<svg class="skin" viewBox="' + n(box0.x) + ' ' + n(box0.y) + ' ' + n(box0.w) + ' ' + n(box0.h) + '" ' +
      'preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
      '<defs>' + defs + '</defs>' +
      bodyParts.join('') + volume + lines + counter + wear +
      '</svg>';
  }

  /*
   * Общие определения на страницу. Выносим отдельно, потому что фильтр
   * зерна один на всю игру: дублировать его в каждом предмете — значит
   * пересчитывать шум сотни раз вместо одного.
   */
  function pageDefs() {
    return '<svg id="pgDefs" width="0" height="0" aria-hidden="true" focusable="false">' +
      '<filter id="pgGrain" x="0" y="0" width="100%" height="100%">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="7" result="n"/>' +
      '<feColorMatrix in="n" type="matrix" values="0 0 0 0 0.72  0 0 0 0 0.70  0 0 0 0 0.64  0 0 0 0.7 0"/>' +
      '</filter></svg>';
  }

  PG.SkinRender = {
    svg: svg,
    pageDefs: pageDefs,
    patterns: PATTERNS
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
