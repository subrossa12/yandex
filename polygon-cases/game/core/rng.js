/*
 * rng.js — детерминированный генератор случайных чисел.
 *
 * Весь проект держится на одном свойстве: один и тот же сид всегда даёт
 * один и тот же скин. Иначе инвентарь развалится — в сейве лежат только
 * сиды, а картинка собирается заново при каждом запуске.
 *
 * Math.random() для этого не годится вовсе: его нельзя засеять.
 * Здесь mulberry32 — 32-битный ГПСЧ на четыре строки, быстрый и с
 * достаточно хорошим распределением для игровых нужд.
 */
(function (root) {
  'use strict';

  var PG = (root.PG = root.PG || {});

  /*
   * Хеш строки или числа в 32-битное состояние. Сид может быть любым:
   * числом дропа, строкой вида 'case:alpha:7', чем угодно.
   */
  function hash(seed) {
    if (typeof seed === 'number' && isFinite(seed)) {
      /* число прогоняем через тот же лавинный шаг, что и строку:
         соседние сиды должны давать непохожие скины */
      var x = seed >>> 0;
      x = Math.imul(x ^ (x >>> 16), 2246822507);
      x = Math.imul(x ^ (x >>> 13), 3266489909);
      return (x ^ (x >>> 16)) >>> 0;
    }
    var s = String(seed);
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  /* mulberry32: state -> [0,1) */
  function make(seed) {
    var a = hash(seed);

    function next() {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), 1 | t);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /* целое в [0, n) */
    next.int = function (n) {
      return Math.floor(next() * n);
    };

    /* число в [min, max) */
    next.range = function (min, max) {
      return min + next() * (max - min);
    };

    /* элемент массива */
    next.pick = function (arr) {
      return arr[Math.floor(next() * arr.length)];
    };

    /* с вероятностью p */
    next.chance = function (p) {
      return next() < p;
    };

    /* перемешивание на месте (Фишер — Йетс) */
    next.shuffle = function (arr) {
      for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(next() * (i + 1));
        var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    };

    return next;
  }

  PG.RNG = { make: make, hash: hash };
})(typeof globalThis !== 'undefined' ? globalThis : this);
