/*
 * metrica.js — счётчик Яндекс Метрики и цели на ключевые события.
 *
 * Без целей воронка непрозрачна: непонятно, где именно игрок отваливается —
 * на первом менеджере, перед первым престижем или на «затыке» посреди забега.
 *
 * Важное про внешние запросы: пока номер счётчика пуст (а в билде он пуст),
 * модуль не грузит ничего и никуда не ходит — все вызовы goal() просто
 * копятся в локальном журнале. Ровно один внешний адрес появляется, только
 * если номер счётчика задан в data/balance.js или флагом metrica.counterId,
 * и ведёт он на саму Метрику, а не на сторонний сервис.
 */
(function (root) {
  'use strict';

  var SE = (root.SE = root.SE || {});

  var COUNTER_SRC = 'https://mc.yandex.ru/metrika/tag.js';

  var counterId = 0;
  var active = false;
  var fired = {};        // цели, которые шлём один раз за сессию
  var journal = [];      // последние события — для отладки и автотестов

  /*
   * Стандартный сниппет Метрики: создаёт очередь ym() и подгружает тег.
   * Вызовы до загрузки скрипта не теряются — очередь разбирается потом.
   */
  function injectCounter() {
    if (root.ym) return true;
    try {
      root.ym = root.ym || function () { (root.ym.a = root.ym.a || []).push(arguments); };
      root.ym.l = 1 * new Date();

      var doc = root.document;
      var s = doc.createElement('script');
      s.async = 1;
      s.src = COUNTER_SRC;
      var first = doc.getElementsByTagName('script')[0];
      if (first && first.parentNode) first.parentNode.insertBefore(s, first);
      else doc.head.appendChild(s);
      return true;
    } catch (e) {
      return false;
    }
  }

  /*
   * id приходит из конфига (а значит, может приехать и флагом).
   * Пустой или нечисловой id — штатная ситуация: счётчик просто не
   * подключается, игра работает как обычно.
   */
  function init(id) {
    counterId = parseInt(id, 10);
    if (!counterId || !isFinite(counterId) || counterId <= 0) {
      active = false;
      return false;
    }
    if (!injectCounter()) {
      active = false;
      return false;
    }
    try {
      root.ym(counterId, 'init', {
        /* игре не нужны карта кликов и вебвизор: это лишний трафик
           и лишние данные, цели — единственное, что здесь считается */
        clickmap: false,
        trackLinks: false,
        accurateTrackBounce: true,
        webvisor: false,
        defer: true
      });
      root.ym(counterId, 'hit', '/');
      active = true;
    } catch (e) {
      active = false;
    }
    return active;
  }

  /*
   * Цель. Имя — из фиксированного набора в GOALS плюс динамические
   * суффиксы (id оффера, id товара). params не обязателен.
   */
  function goal(name, params) {
    if (!name) return;
    journal.push({ name: name, params: params || null, at: Date.now() });
    if (journal.length > 100) journal.shift();
    if (!active) return;
    try {
      if (params) root.ym(counterId, 'reachGoal', name, params);
      else root.ym(counterId, 'reachGoal', name);
    } catch (e) { /* аналитика никогда не должна ронять игру */ }
  }

  /* Цель, которая имеет смысл один раз за сессию (first_manager_bought). */
  function goalOnce(name, params) {
    if (fired[name]) return;
    fired[name] = true;
    goal(name, params);
  }

  /* Параметры визита: сколько звёзд, сколько престижей, платил ли. */
  function userParams(obj) {
    if (!active || !obj) return;
    try { root.ym(counterId, 'userParams', obj); } catch (e) { /* ignore */ }
  }

  /* Имена целей собраны здесь, чтобы их же завести в интерфейсе Метрики. */
  var GOALS = {
    firstManager: 'first_manager_bought',
    prestige: 'prestige_done',
    offlineClaimed: 'offline_income_claimed',
    wallHit: 'wall_hit',
    rvShown: function (offer) { return 'rv_shown_' + offer; },
    rvRewarded: function (offer) { return 'rv_rewarded_' + offer; },
    iap: function (product) { return 'iap_purchased_' + product; }
  };

  SE.Metrica = {
    init: init,
    goal: goal,
    goalOnce: goalOnce,
    userParams: userParams,
    GOALS: GOALS,
    get active() { return active; },
    /* журнал открыт наружу: автотесты проверяют, что цели вообще шлются,
       не поднимая при этом настоящий счётчик */
    journal: function () { return journal.slice(); }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
