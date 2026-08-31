/*
 * format.js — форматирование чисел и времени. Локаль переключается на лету.
 */
(function (root) {
  'use strict';

  var SE = (root.SE = root.SE || {});

  var SUFFIX = {
    ru: ['', ' тыс', ' млн', ' млрд', ' трлн', ' квдр', ' квнт', ' скст', ' септ', ' окт', ' нон', ' дец'],
    en: ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'],
    tr: ['', ' bin', ' mn', ' mlr', ' trl', ' kat', ' ken', ' sks', ' sep', ' okt', ' non', ' des']
  };

  var lang = 'ru';

  function setLang(l) { lang = SUFFIX[l] ? l : 'ru'; }

  /* Деньги: 1 234 -> «1.23 тыс», 5e9 -> «5.00 млрд». */
  function money(n) {
    if (!isFinite(n)) return '∞';
    if (n < 0) return '-' + money(-n);
    if (n < 1000) return String(Math.floor(n));

    var tier = Math.floor(Math.log10(n) / 3);
    var list = SUFFIX[lang];
    if (tier >= list.length) {
      return n.toExponential(2).replace('e+', '·10^');
    }
    var scaled = n / Math.pow(1000, tier);
    var digits = scaled < 10 ? 2 : (scaled < 100 ? 1 : 0);
    return trimZeros(scaled.toFixed(digits)) + list[tier];
  }

  function trimZeros(s) {
    if (s.indexOf('.') < 0) return s;
    return s.replace(/\.?0+$/, '');
  }

  /* Деньги с символом валюты (внутриигровой, не реальный). */
  function cash(n) {
    return money(n) + ' ₽';
  }

  /* Свой паддинг вместо padStart: не полагаемся на свежесть вебвью. */
  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  /* «1:23» или «2 ч 15 мин» для длинных промежутков. */
  function duration(ms) {
    var sec = Math.max(0, Math.round(ms / 1000));
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    if (h > 0) {
      if (lang === 'ru') return h + ' ч ' + m + ' мин';
      if (lang === 'tr') return h + ' sa ' + m + ' dk';
      return h + 'h ' + m + 'm';
    }
    if (m > 0) return m + ':' + pad2(s);
    if (lang === 'ru') return s + ' с';
    if (lang === 'tr') return s + ' sn';
    return s + 's';
  }

  /* Короткий таймер для кулдаунов: «4:05». */
  function timer(ms) {
    var sec = Math.max(0, Math.ceil(ms / 1000));
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ':' + pad2(s);
  }

  function multiplier(x) {
    if (x >= 100) return '×' + Math.round(x);
    if (x >= 10) return '×' + x.toFixed(1).replace(/\.0$/, '');
    return '×' + x.toFixed(2).replace(/\.?0+$/, '');
  }

  function percent(x) {
    return Math.round(x * 100) + '%';
  }

  SE.Format = {
    setLang: setLang,
    money: money,
    cash: cash,
    duration: duration,
    timer: timer,
    multiplier: multiplier,
    percent: percent
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
