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

  /*
   * Скругление углов многоугольника.
   *
   * Это не косметика. Многоугольник с острыми углами читается как
   * деталь конструктора: у настоящей вещи нет ни одного идеально
   * острого ребра — везде фаска или радиус. Одна эта функция превращает
   * набор плашек в предмет, и применяется она сразу ко всем моделям,
   * поэтому геометрию править не пришлось.
   *
   * Радиус срезается по половине короткой стороны: иначе на узких
   * деталях (планка, прорезь) дуги наложились бы друг на друга и контур
   * вывернулся бы наизнанку.
   */
  function roundedPath(pts, radius) {
    var len = pts.length;
    if (len < 3) return '';
    var d = '';

    for (var i = 0; i < len; i++) {
      var prev = pts[(i - 1 + len) % len];
      var cur = pts[i];
      var next = pts[(i + 1) % len];

      var d1x = prev[0] - cur[0], d1y = prev[1] - cur[1];
      var d2x = next[0] - cur[0], d2y = next[1] - cur[1];
      var l1 = Math.sqrt(d1x * d1x + d1y * d1y) || 1;
      var l2 = Math.sqrt(d2x * d2x + d2y * d2y) || 1;

      var r = Math.min(radius, l1 / 2, l2 / 2);
      var p1x = cur[0] + d1x / l1 * r, p1y = cur[1] + d1y / l1 * r;
      var p2x = cur[0] + d2x / l2 * r, p2y = cur[1] + d2y / l2 * r;

      d += (i === 0 ? 'M' : 'L') + n(p1x) + ' ' + n(p1y) +
        'Q' + n(cur[0]) + ' ' + n(cur[1]) + ' ' + n(p2x) + ' ' + n(p2y);
    }
    return d + 'Z';
  }

  /*
   * Готовые пути модели. Геометрия задана кривыми прямо в weapons.js;
   * старая форма записи (список вершин) тоже поддерживается — тогда углы
   * скругляются на лету.
   */
  function pathsOf(weapon) {
    if (weapon.paths) return weapon.paths;
    weapon.paths = weapon.parts.map(function (part) {
      return {
        role: part.role,
        d: part.d || roundedPath(part.pts, part.r !== undefined ? part.r : 2.6)
      };
    });
    return weapon.paths;
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

    /*
     * Камуфляж. Настоящий камуфляж — это не «кружочки на фоне»:
     * пятна вытянуты, перекрываются и различаются по тону слабо, из-за
     * чего рисунок читается как единое покрытие, а не как горошек.
     * Поэтому здесь ломаные многоугольники, а не эллипсы, приплюснутые
     * по вертикали, и всего два основных тона плюс редкий третий.
     */
    camo: function (uid, c, v, rnd) {
      var id = uid + 'p';
      var size = 46 * v.scale;
      var body = '<rect width="' + n(size) + '" height="' + n(size) + '" fill="' + c[1] + '"/>';
      var count = Math.round(9 * v.density);

      function blob(cx, cy, scale, col) {
        var steps = 7 + Math.floor(rnd() * 3);
        var pts = [];
        for (var k = 0; k < steps; k++) {
          var a = (k / steps) * Math.PI * 2;
          var rr = size * scale * (0.55 + rnd() * 0.75);
          pts.push(n(cx + Math.cos(a) * rr * 1.5) + ',' + n(cy + Math.sin(a) * rr * 0.62));
        }
        return '<polygon points="' + pts.join(' ') + '" fill="' + col + '"/>';
      }

      for (var i = 0; i < count; i++) {
        var cx = rnd() * size, cy = rnd() * size;
        var scale = 0.09 + rnd() * 0.09;
        var pick = rnd();
        var col = pick < 0.45 ? c[0] : (pick < 0.85 ? c[2] : c[3]);
        /* тот же контур повторяем по краям тайла, иначе шов виден */
        [[0, 0], [-size, 0], [0, -size], [-size, -size]].forEach(function (o) {
          body += blob(cx + o[0], cy + o[1], scale, col);
        });
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

    /*
     * Крап. Раньше это были «просто брызги» — россыпь одинаковых
     * кружков, которая читалась как горошек. Теперь основа не плоская,
     * а с переходом, крап мелкий и сгущается пятнами: так выглядит
     * напылённое покрытие, а не конфетти.
     */
    splatter: function (uid, c, v, rnd) {
      var id = uid + 'p';
      var size = 40 * v.scale;
      var body = '<rect width="' + n(size) + '" height="' + n(size) + '" fill="' + c[1] + '"/>';

      /* три сгущения на тайл — крап никогда не ложится равномерно */
      var clusters = 3;
      for (var k = 0; k < clusters; k++) {
        var hx = rnd() * size, hy = rnd() * size;
        var col = k === 0 ? c[0] : (k === 1 ? c[2] : c[3]);
        var count = Math.round((14 + rnd() * 10) * v.density);
        for (var i = 0; i < count; i++) {
          /* гауссоподобный разброс вокруг центра сгущения */
          var dx = (rnd() + rnd() + rnd() - 1.5) * size * 0.34;
          var dy = (rnd() + rnd() + rnd() - 1.5) * size * 0.34;
          var r = size * (0.008 + Math.pow(rnd(), 2.6) * 0.05);
          body += '<circle cx="' + n(hx + dx) + '" cy="' + n(hy + dy) + '" r="' + n(r) +
            '" fill="' + col + '" opacity="' + n(0.35 + rnd() * 0.5) + '"/>';
        }
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
  function wearLayer(uid, skinPaths, float, rnd, detail, traced) {
    if (float < 0.03) return '';

    var clip = uid + 'w';
    var out = '<clipPath id="' + clip + '">' + skinPaths.join('') + '</clipPath>';
    var body = '';

    /*
     * 1. края. Обводка изнутри контура — «облез по граням». Держим её
     * сдержанной: при высокой непрозрачности предмет превращается в
     * мультяшный контур и весь силуэт теряется.
     */
    if (!traced) {
      var edge = Math.min(0.26, float * 0.34);
      body += '<g opacity="' + n(edge) + '">' +
        skinPaths.map(function (p) {
          return p.replace('/>', ' fill="none" stroke="#b0aa9e" stroke-width="' + n(0.8 + float * 2.2) + '"/>');
        }).join('') + '</g>';
    }

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
    if (float > 0.34) {
      /* вуаль намеренно слабая: при сильной убитый предмет становится
         серым, и вся палитра, по которой игрок читает редкость, пропадает */
      body += '<rect width="' + VIEW.w + '" height="' + VIEW.h + '" fill="#6a655c" opacity="' +
        n(Math.min(0.18, (float - 0.34) * 0.3)) + '"/>';
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
     * Контур на каждой детали — не украшение. Без него плоские фигуры
     * сливаются и с фоном витрины, и друг с другом: предмет читается
     * как набор плашек, а не как вещь. Двойная тёмная линия на стыке
     * деталей заодно работает как расшивка панелей.
     */
    /*
     * Обведённые с рисунка модели ведут себя иначе, чем нарисованные
     * координатами. У них контур и тени УЖЕ есть — это отдельные тёмные
     * области (role: ink). Если добавить им ещё и свою обводку с бевелом
     * на каждую из полусотни деталей, предмет превращается в кашу из
     * кантов. Поэтому у обведённых моделей объём один на весь силуэт.
     */
    var traced = !!weapon.traced;
    var outline = traced ? '' : ' stroke="' + metal.outline + '" stroke-width="2" stroke-linejoin="round"';
    var thin = ' stroke="' + metal.outline + '" stroke-width="0.9" stroke-linejoin="round"';

    /*
     * Бевел — вторая половина того же приёма. Каждая деталь получает
     * свой градиент «свет сверху, тень снизу», и деталь перестаёт быть
     * плоской заливкой. Градиент один на всю страницу: он задан в долях
     * собственных габаритов элемента (objectBoundingBox), поэтому
     * подстраивается под каждую деталь сам, и держать по градиенту на
     * предмет не нужно.
     */
    var bevel = ' fill="url(#pgBevel)"';

    pathsOf(weapon).forEach(function (part) {
      var p = '<path d="' + part.d + '"';
      if (part.role !== 'cut') allPaths.push(p + '/>');

      /*
       * Обведённая модель устроена иначе, чем нарисованная: сначала
       * идёт силуэт целиком — его и красит паттерн, — а поверх ложится
       * светотень с исходного рисунка. Отдельными цветами детали не
       * заливаются: скин обязан перекрашивать вещь целиком, а от
       * рисунка нужна не палитра, а расшивка, тени и блики.
       */
      if (part.role === 'silhouette') {
        bodyParts.push(p + ' fill="' + pat.fill + '"/>');
        skinPaths.push(p + '/>');
        return;
      }
      if (part.role === 'ink') {
        bodyParts.push(p + ' fill="#05070a" opacity="0.82"/>');
        return;
      }
      if (part.role === 'shade') {
        bodyParts.push(p + ' fill="#05070a" opacity="0.36"/>');
        return;
      }
      if (part.role === 'light') {
        bodyParts.push(p + ' fill="#ffffff" opacity="0.26"/>');
        return;
      }

      if (part.role === 'cut') {
        /* вырез: перфорация, окно, отверстие под палец. Тень внутрь даёт
           ощущение толщины материала, без неё дырка выглядит наклейкой */
        bodyParts.push(p + ' fill="' + metal.outline + '"' + thin + '/>');
        bodyParts.push(p + ' fill="url(#pgHole)"/>');
        return;
      }

      if (part.role === 'skin') {
        bodyParts.push(p + ' fill="' + pat.fill + '"' + outline + '/>');
        skinPaths.push(p + '/>');
        /* однотонный паттерн получает свою окантовку изнутри контура */
        if (pat.stroke) {
          bodyParts.push(p + ' fill="none" stroke="' + pat.stroke +
            '" stroke-width="' + pat.strokeWidth + '"/>');
        }
      } else if (part.role === 'metal') {
        bodyParts.push(p + ' fill="' + metal.base + '"' + outline + '/>');
      } else {
        bodyParts.push(p + ' fill="' + metal.light + '"' + outline + '/>');
      }
      if (!traced) bodyParts.push(p + bevel + '/>');
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

    var wear = wearLayer(uid, skinPaths, skin.float, rnd, detail, traced);

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
      '<stop offset="0" stop-color="#ffffff" stop-opacity="0.12"/>' +
      '<stop offset="0.4" stop-color="#ffffff" stop-opacity="0"/>' +
      '<stop offset="1" stop-color="#000000" stop-opacity="0.26"/></linearGradient>';
    defs += shade;

    var volume = '<clipPath id="' + uid + 'v">' + allPaths.join('') + '</clipPath>' +
      '<g clip-path="url(#' + uid + 'v)"><rect x="' + n(box0.x) + '" y="' + n(box0.y) +
      '" width="' + n(box0.w) + '" height="' + n(box0.h) +
      '" fill="url(#' + uid + 's)"/></g>' +
      /* полировка: узкий блик по верхней трети окрашенных деталей */
      '<clipPath id="' + uid + 'gl">' + skinPaths.join('') + '</clipPath>' +
      '<g clip-path="url(#' + uid + 'gl)"><rect x="' + n(box0.x) + '" y="' + n(box0.y) +
      '" width="' + n(box0.w) + '" height="' + n(box0.h) + '" fill="url(#pgGloss)"/></g>';

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
    return '<svg id="pgDefs" width="0" height="0" aria-hidden="true" focusable="false"><defs>' +

      /* зерно износа: один фильтр на всю игру, а не по одному на предмет */
      '<filter id="pgGrain" x="0" y="0" width="100%" height="100%">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="7" result="n"/>' +
      '<feColorMatrix in="n" type="matrix" values="0 0 0 0 0.72  0 0 0 0 0.70  0 0 0 0 0.64  0 0 0 0.7 0"/>' +
      '</filter>' +

      /*
       * Бевел детали. Задан в долях габаритов элемента, поэтому один и
       * тот же градиент даёт правильный объём и длинному стволу, и
       * маленькой мушке. Верхняя кромка — блик, нижняя треть — тень,
       * между ними тонкая тёмная линия: так на вектор ложится ощущение
       * фаски, ради которого обычно рисуют по три слоя вручную.
       */
      '<linearGradient id="pgBevel" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#ffffff" stop-opacity="0.24"/>' +
      '<stop offset="0.16" stop-color="#ffffff" stop-opacity="0.24"/>' +
      '<stop offset="0.16" stop-color="#ffffff" stop-opacity="0.08"/>' +
      '<stop offset="0.4" stop-color="#ffffff" stop-opacity="0.08"/>' +
      '<stop offset="0.36" stop-color="#000000" stop-opacity="0"/>' +
      '<stop offset="0.68" stop-color="#000000" stop-opacity="0"/>' +
      '<stop offset="0.68" stop-color="#000000" stop-opacity="0.2"/>' +
      '<stop offset="0.88" stop-color="#000000" stop-opacity="0.2"/>' +
      '<stop offset="0.88" stop-color="#000000" stop-opacity="0.45"/>' +
      '<stop offset="1" stop-color="#000000" stop-opacity="0.45"/>' +
      '</linearGradient>' +

      /* подсветка нижней кромки выреза: материал имеет толщину */
      '<linearGradient id="pgHole" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#000000" stop-opacity="0.55"/>' +
      '<stop offset="0.6" stop-color="#000000" stop-opacity="0"/>' +
      '<stop offset="1" stop-color="#ffffff" stop-opacity="0.18"/>' +
      '</linearGradient>' +

      /* мягкий блик вдоль корпуса — «полировка», добавляется поверх */
      '<linearGradient id="pgGloss" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0.06" stop-color="#ffffff" stop-opacity="0"/>' +
      '<stop offset="0.2" stop-color="#ffffff" stop-opacity="0.22"/>' +
      '<stop offset="0.32" stop-color="#ffffff" stop-opacity="0"/>' +
      '</linearGradient>' +

      '</defs></svg>';
  }

  PG.SkinRender = {
    svg: svg,
    pageDefs: pageDefs,
    patterns: PATTERNS
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
