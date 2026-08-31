/*
 * metrica.js — цели Яндекс Метрики.
 *
 * Без целей воронка непрозрачна: непонятно, где игрок отваливается —
 * на первом менеджере, перед первым престижем или на «затыке» посреди
 * забега.
 *
 * ВАЖНО, ПОЧЕМУ ЗДЕСЬ НЕТ ЗАГРУЗКИ СЧЁТЧИКА.
 *
 * Раньше модуль сам создавал тег счётчика и вставлял его в страницу,
 * подтягивая код с внешнего адреса. Ровно такое сочетание — создание
 * тега скрипта, чужой домен и вставка в документ — антивирусы считают
 * признаком подмены скрипта, и архив с игрой начинал отмечаться как
 * заражённый. Срабатывание ложное, но объяснять его каждому игроку
 * невозможно, а проверять архив будут все.
 *
 * Поэтому счётчик подключается штатно — сниппетом в index.html, когда
 * номер уже есть (как это и делается на любом сайте). Модуль лишь
 * пользуется тем, что на странице уже лежит:
 *
 *   есть window.ym и задан номер  ->  цели уходят в Метрику
 *   нет                           ->  цели копятся в журнале
 *
 * Побочный, но важный эффект: в билде не остаётся ни одного внешнего
 * адреса вообще. Это ровно то, чего требует чеклист модерации, и теперь
 * это проверяется сборкой без исключений.
 */
(function (root) {
  'use strict';

  var SE = (root.SE = root.SE || {});

  var counterId = 0;
  var fired = {};        // цели, которые шлём один раз за сессию
  var journal = [];      // последние события — для отладки и автотестов

  /* Счётчик реально работает: и номер задан, и тег на странице есть. */
  function active() {
    return counterId > 0 && typeof root.ym === 'function';
  }

  /*
   * Номер приходит из конфига, а значит, может приехать и флагом.
   * Пустой номер — штатная ситуация, а не ошибка: игра работает как
   * обычно, просто события никуда не уходят.
   */
  function init(id) {
    counterId = parseInt(id, 10);
    if (!counterId || !isFinite(counterId) || counterId <= 0) {
      counterId = 0;
      return false;
    }

    if (typeof root.ym !== 'function') {
      /* номер есть, а сниппета в index.html нет — конфигурация неполная,
         и об этом лучше сказать сразу, чем месяц ждать пустых отчётов */
      if (root.console && root.console.warn) {
        root.console.warn('Метрика: номер счётчика задан, но тег не подключён в index.html');
      }
      return false;
    }

    try {
      root.ym(counterId, 'hit', '/');
    } catch (e) { /* аналитика не должна ронять игру */ }
    return true;
  }

  /*
   * Цель. Имя — из набора GOALS плюс динамические суффиксы
   * (id оффера, id товара). params не обязателен.
   */
  function goal(name, params) {
    if (!name) return;

    journal.push({ name: name, params: params || null, at: Date.now() });
    if (journal.length > 100) journal.shift();

    if (!active()) return;
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
    if (!active() || !obj) return;
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
    get active() { return active(); },
    /* журнал открыт наружу: автотесты проверяют, что цели вообще шлются,
       не поднимая при этом настоящий счётчик */
    journal: function () { return journal.slice(); }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
