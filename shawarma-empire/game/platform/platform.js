/*
 * platform.js — единственное место, где игра знает про Яндекс SDK.
 * Без SDK (открыли index.html локально) всё работает на localStorage:
 * реклама превращается в мгновенную «награду без ролика» для отладки,
 * магазин прячется, серверное время берётся системное.
 *
 * Все вызовы SDK обёрнуты в try/catch и feature-detection: если платформа
 * изменит сигнатуру, игра не упадёт, а деградирует до локального режима.
 */
(function (root) {
  'use strict';

  var SE = (root.SE = root.SE || {});

  var LS_KEY = 'shawarma_empire_save_v1';
  var CLOUD_KEY = 'save';

  var ysdk = null;
  var player = null;
  var payments = null;
  var leaderboards = null;
  var safeStorage = null;

  var state = {
    ready: false,
    isYandex: false,
    lang: 'ru',
    cloudSave: false,
    paymentsReady: false,
    flagsLoaded: false,
    catalog: [],
    /* сюда app.js вешает паузу/возобновление на время рекламы */
    onPause: null,
    onResume: null
  };

  var saveTimer = null;
  var pendingData = null;
  var lastCloudWrite = 0;
  var lastInterstitial = 0;
  var startedAt = Date.now();
  var adInProgress = false;

  /* ---------------------------------------------------------------- *
   * Инициализация
   * ---------------------------------------------------------------- */
  function init(options) {
    options = options || {};
    state.onPause = options.onPause || null;
    state.onResume = options.onResume || null;
    state.onAccountChanged = options.onAccountChanged || null;

    detectBrowserLang();

    if (typeof root.YaGames === 'undefined' || !root.YaGames || typeof root.YaGames.init !== 'function') {
      /* локальный запуск — SDK нет, это нормальный режим разработки */
      state.ready = true;
      return Promise.resolve(state);
    }

    return root.YaGames.init()
      .then(function (sdk) {
        ysdk = sdk;
        state.isYandex = true;
        readEnvironment();
        return initStorage().then(initPlayer);
      })
      .then(fetchFlags)
      .then(function () {
        /* платежи и лидерборды не критичны: подключаем молча */
        initPayments();
        initLeaderboards();
        bindPlatformEvents();
        state.ready = true;
        return state;
      })
      .catch(function () {
        /* SDK не поднялся — играем локально, без облака */
        ysdk = null;
        state.isYandex = false;
        state.ready = true;
        return state;
      });
  }

  /*
   * Игра русскоязычная: русский — язык по умолчанию всегда, включая
   * запуск без SDK. Другой язык включается только если платформа явно
   * его сообщила (или игрок выбрал его в настройках). Язык браузера
   * намеренно не спрашиваем: на тестовой машине с английской локалью
   * игра иначе показывалась бы англоязычной.
   */
  function detectBrowserLang() {
    state.lang = 'ru';
  }

  /*
   * Поддерживаются три языка: RU (по умолчанию), TR и EN. Турецкий —
   * рекомендация платформы: это её второй по величине рынок. Всё
   * остальное падает в EN.
   */
  function normalizeLang(raw) {
    var l = String(raw || '').slice(0, 2).toLowerCase();
    if (l === 'ru') return 'ru';
    if (l === 'tr') return 'tr';
    return 'en';
  }

  function readEnvironment() {
    try {
      var l = ysdk.environment && ysdk.environment.i18n && ysdk.environment.i18n.lang;
      if (l) state.lang = normalizeLang(l);
    } catch (e) { /* остаётся русский */ }
  }

  /* ---------------------------------------------------------------- *
   * Удалённая конфигурация (флаги)
   *
   * Запрашивается ровно один раз на старте и никогда по ходу игры:
   * баланс не должен меняться под игроком посреди сессии.
   *
   * Три вещи, которые здесь важнее самих флагов:
   *   1. запрос идёт с таймаутом — зависшая сеть не должна держать
   *      загрузку игры;
   *   2. любой отказ проглатывается: игра уже работает на дефолтах,
   *      зашитых в билд;
   *   3. дефолты уходят в запрос, чтобы платформа вернула их же для
   *      ключей, не заданных в Консоли.
   * ---------------------------------------------------------------- */
  function fetchFlags() {
    var Config = SE.Config;
    if (!Config) return Promise.resolve(null);
    if (!ysdk || typeof ysdk.getFlags !== 'function') return Promise.resolve(null);

    var timeoutMs = (SE.BALANCE.remoteConfig && SE.BALANCE.remoteConfig.timeoutMs) || 3000;

    var request;
    try {
      request = ysdk.getFlags({ defaultFlags: Config.defaultFlags() });
    } catch (e) {
      return Promise.resolve(null);
    }
    if (!request || typeof request.then !== 'function') return Promise.resolve(null);

    var timer = new Promise(function (resolve) {
      root.setTimeout(function () { resolve(null); }, timeoutMs);
    });

    return Promise.race([request.catch(function () { return null; }), timer])
      .then(function (flags) {
        if (!flags) return null;
        state.flagsLoaded = true;
        Config.applyRemote(flags);
        return flags;
      })
      .catch(function () { return null; });
  }

  function initPlayer() {
    if (!ysdk || typeof ysdk.getPlayer !== 'function') return Promise.resolve();
    return ysdk.getPlayer()
      .then(function (p) {
        player = p;
        state.cloudSave = !!(p && typeof p.setData === 'function' && typeof p.getData === 'function');
      })
      .catch(function () {
        player = null;
        state.cloudSave = false;
      });
  }

  /*
   * Хранилище для локальных сохранений. На iOS localStorage может
   * сбрасываться, поэтому SDK отдаёт устойчивый safeStorage с тем же
   * интерфейсом. Для игр, загруженных архивом, SDK подменяет localStorage
   * сам, но явный вызов ничего не стоит и страхует на случай перехода
   * на собственный домен.
   */
  function initStorage() {
    if (!ysdk || typeof ysdk.getStorage !== 'function') return Promise.resolve();
    return ysdk.getStorage()
      .then(function (s) { if (s) safeStorage = s; })
      .catch(function () { /* остаётся обычный localStorage */ });
  }

  function storage() {
    return safeStorage || root.localStorage;
  }

  function initPayments() {
    if (!ysdk || typeof ysdk.getPayments !== 'function') return;
    try {
      ysdk.getPayments({ signed: false })
        .then(function (p) {
          payments = p;
          return payments.getCatalog();
        })
        .then(function (catalog) {
          state.catalog = catalog || [];
          state.paymentsReady = state.catalog.length > 0;
          /* необработанные покупки разбирает app.js: только он знает,
             какой товар расходуемый, а какой постоянный (п. 1.13.1) */
        })
        .catch(function () {
          payments = null;
          state.paymentsReady = false;
        });
    } catch (e) {
      payments = null;
    }
  }

  /*
   * Актуальный путь — ysdk.leaderboards. Инициализация через
   * ysdk.getLeaderboards() в документации помечена как устаревшая,
   * поэтому она осталась только запасным вариантом.
   */
  function initLeaderboards() {
    if (!ysdk) return;
    if (ysdk.leaderboards) {
      leaderboards = ysdk.leaderboards;
      return;
    }
    if (typeof ysdk.getLeaderboards !== 'function') return;
    try {
      ysdk.getLeaderboards()
        .then(function (lb) { leaderboards = lb; })
        .catch(function () { leaderboards = null; });
    } catch (e) { leaderboards = null; }
  }

  /* Часть методов лидерборда требует авторизации — спрашиваем платформу. */
  function methodAvailable(name) {
    if (!ysdk || typeof ysdk.isAvailableMethod !== 'function') return Promise.resolve(true);
    try {
      return ysdk.isAvailableMethod(name)
        .then(function (v) { return !!v; })
        .catch(function () { return false; });
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  /*
   * п. 1.19.4. Имена событий паузы — обычные строки, а не значения из
   * ysdk.EVENTS (там лежат только EXIT, HISTORY_BACK и диалог выбора
   * аккаунта). Это критично: платформа сама показывает полноэкранную
   * рекламу на старте каждой игры, и у неё нет колбэков — узнать о ней
   * можно только из game_api_pause.
   */
  function bindPlatformEvents() {
    if (!ysdk || typeof ysdk.on !== 'function') return;

    try {
      ysdk.on('game_api_pause', function () {
        if (state.onPause) state.onPause();
      });
      ysdk.on('game_api_resume', function () {
        if (state.onResume) state.onResume();
      });
    } catch (e) { /* старая версия SDK без этих событий */ }

    /*
     * Когда гость авторизуется, платформа сама показывает диалог выбора
     * прогресса. После его закрытия объект игрока и данные надо
     * перезапросить — выбор мог смениться на другой аккаунт.
     */
    try {
      var events = ysdk.EVENTS || {};
      if (events.ACCOUNT_SELECTION_DIALOG_CLOSED) {
        ysdk.on(events.ACCOUNT_SELECTION_DIALOG_CLOSED, function () {
          initPlayer().then(function () {
            if (state.onAccountChanged) state.onAccountChanged();
          });
        });
      }
    } catch (e) { /* не критично */ }
  }

  /* Игра готова принимать ввод — обязательный вызов (п. 1.19.2). */
  function ready() {
    if (!ysdk) return;
    try {
      if (ysdk.features && ysdk.features.LoadingAPI && ysdk.features.LoadingAPI.ready) {
        ysdk.features.LoadingAPI.ready();
      }
    } catch (e) { /* нечего делать */ }
  }

  /*
   * Активный геймплей — помогает платформе не показывать рекламу поверх
   * игры. Сюда же повешено управление sticky-баннером: если оно включено
   * флагом, баннер прячется на время активной игры и возвращается в
   * паузах. По умолчанию обе функции — no-op, баннером распоряжается
   * Консоль.
   */
  function gameplayStart() {
    try {
      if (ysdk && ysdk.features && ysdk.features.GameplayAPI) ysdk.features.GameplayAPI.start();
    } catch (e) { /* не критично */ }
    hideBanner();
  }

  function gameplayStop() {
    try {
      if (ysdk && ysdk.features && ysdk.features.GameplayAPI) ysdk.features.GameplayAPI.stop();
    } catch (e) { /* не критично */ }
    showBanner();
  }

  /* ---------------------------------------------------------------- *
   * Время. Только серверное — иначе игроки крутят системные часы.
   * ---------------------------------------------------------------- */
  function serverTimeMs() {
    if (ysdk && typeof ysdk.serverTime === 'function') {
      try {
        var t = ysdk.serverTime();
        if (typeof t === 'number' && isFinite(t) && t > 0) return t;
      } catch (e) { /* падаем на системное */ }
    }
    return Date.now();
  }

  /* ---------------------------------------------------------------- *
   * Сохранения: localStorage всегда + облако с дебаунсом
   * ---------------------------------------------------------------- */
  function saveLocal(data) {
    try {
      storage().setItem(LS_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;   // приватный режим или переполнение — не беда
    }
  }

  function loadLocal() {
    try {
      var raw = storage().getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveCloud(data) {
    if (!player || !state.cloudSave) return Promise.resolve(false);
    try {
      var payload = {};
      payload[CLOUD_KEY] = data;
      lastCloudWrite = Date.now();
      return player.setData(payload, true)
        .then(function () { return true; })
        .catch(function () { return false; });
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  function loadCloud() {
    if (!player || !state.cloudSave) return Promise.resolve(null);
    try {
      return player.getData([CLOUD_KEY])
        .then(function (d) { return (d && d[CLOUD_KEY]) ? d[CLOUD_KEY] : null; })
        .catch(function () { return null; });
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  /*
   * Сохраняем сразу после действия игрока: локально мгновенно (F5 ничего
   * не теряет), в облако — не чаще раза в N секунд.
   */
  function save(data, immediate) {
    pendingData = data;
    saveLocal(data);

    if (immediate) return flush();

    if (!saveTimer) {
      /* ждём ровно столько, сколько осталось до конца окна дебаунса */
      var since = Date.now() - lastCloudWrite;
      var wait = Math.max(0, SE.BALANCE.save.cloudDebounceMs - since);
      saveTimer = root.setTimeout(function () {
        saveTimer = null;
        if (pendingData) saveCloud(pendingData);
      }, wait);
    }
    return Promise.resolve(true);
  }

  /* Принудительная запись: перед рекламой и при сворачивании вкладки. */
  function flush() {
    if (saveTimer) {
      root.clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (!pendingData) return Promise.resolve(false);
    saveLocal(pendingData);
    return saveCloud(pendingData);
  }

  /*
   * Грузим оба источника и берём более «продвинутый»: lifetimeEarned
   * монотонно растёт, поэтому это честный критерий свежести.
   */
  function load() {
    var local = loadLocal();
    return loadCloud().then(function (cloud) {
      if (!cloud) return local;
      if (!local) return cloud;
      var lc = num(cloud.lifetimeEarned), ll = num(local.lifetimeEarned);
      if (lc > ll) return cloud;
      if (ll > lc) return local;
      return num(cloud.savedAt) >= num(local.savedAt) ? cloud : local;
    });
  }

  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : 0; }

  /* ---------------------------------------------------------------- *
   * Реклама
   * ---------------------------------------------------------------- */
  /*
   * Показ рекламы прерывает геймплей — значит, по разделу «Геймплей»
   * (п. 1.19.3) нужно закрыть разметку методом stop() и открыть заново
   * после закрытия ролика.
   */
  function pauseForAd() {
    adInProgress = true;
    gameplayStop();
    if (state.onPause) { try { state.onPause(); } catch (e) { /* ignore */ } }
  }

  function resumeAfterAd() {
    adInProgress = false;
    gameplayStart();
    if (state.onResume) { try { state.onResume(); } catch (e) { /* ignore */ } }
  }

  /*
   * Rewarded. Награда выдаётся ТОЛЬКО в onRewarded — onClose приходит и
   * при отмене просмотра.
   */
  function showRewarded(cb) {
    cb = cb || {};
    var rewarded = false;

    if (!ysdk || !ysdk.adv || typeof ysdk.adv.showRewardedVideo !== 'function') {
      /* локальная отладка: выдаём награду сразу, чтобы гонять механику */
      if (!state.isYandex) {
        if (cb.onRewarded) cb.onRewarded();
        if (cb.onClose) cb.onClose();
        return;
      }
      if (cb.onError) cb.onError(new Error('no-adv'));
      return;
    }

    flush();
    pauseForAd();
    try {
      ysdk.adv.showRewardedVideo({
        callbacks: {
          onOpen: function () { /* пауза уже стоит */ },
          onRewarded: function () {
            rewarded = true;
            if (cb.onRewarded) cb.onRewarded();
          },
          onClose: function () {
            resumeAfterAd();
            if (cb.onClose) cb.onClose(rewarded);
          },
          onError: function (e) {
            resumeAfterAd();
            if (cb.onError) cb.onError(e);
          }
        }
      });
    } catch (e) {
      resumeAfterAd();
      if (cb.onError) cb.onError(e);
    }
  }

  /* Есть ли вообще куда показывать rewarded (локально — заглушка). */
  function rewardedAvailable() {
    if (!state.isYandex) return true;
    return !!(ysdk && ysdk.adv && typeof ysdk.adv.showRewardedVideo === 'function');
  }

  /*
   * Interstitial. Только в логических паузах и никогда по таймеру —
   * случайные клики РСЯ считает фродом.
   */
  function canShowInterstitial(noAdsPurchased) {
    if (noAdsPurchased) return false;
    if (!ysdk || !ysdk.adv || typeof ysdk.adv.showFullscreenAdv !== 'function') return false;
    if (adInProgress) return false;
    var cfg = SE.BALANCE.interstitial;
    if (Date.now() - startedAt < cfg.skipFirstSessionMs) return false;
    if (Date.now() - lastInterstitial < cfg.minGapMs) return false;
    return true;
  }

  function showInterstitial(opts) {
    opts = opts || {};
    if (!canShowInterstitial(opts.noAds)) {
      if (opts.onDone) opts.onDone(false);
      return;
    }
    lastInterstitial = Date.now();
    flush();
    pauseForAd();
    try {
      ysdk.adv.showFullscreenAdv({
        callbacks: {
          onClose: function (wasShown) {
            resumeAfterAd();
            if (opts.onDone) opts.onDone(!!wasShown);
          },
          onError: function () {
            resumeAfterAd();
            if (opts.onDone) opts.onDone(false);
          }
        }
      });
    } catch (e) {
      resumeAfterAd();
      if (opts.onDone) opts.onDone(false);
    }
  }

  /* ---------------------------------------------------------------- *
   * Покупки
   * ---------------------------------------------------------------- */
  function catalog() {
    return state.catalog || [];
  }

  /*
   * Цена товара. По п. 1.13.2 и 1.13.4 стоимость показывается цифрами
   * и с портальной валютой, причём и число, и иконка валюты берутся
   * из SDK — своих значений мы не придумываем. Если товара нет в
   * каталоге Консоли, возвращаем null: такой товар игре показывать
   * нельзя (п. 1.13.6).
   */
  function priceOf(id) {
    var found = null;
    (state.catalog || []).forEach(function (p) {
      if (p.id === id) found = p;
    });
    if (!found) return null;

    var value = found.priceValue || '';
    var label = found.price || '';
    if (!value && !label) return null;

    return {
      value: String(value),
      label: label,
      currencyImage: (typeof found.getPriceCurrencyImage === 'function')
        ? found.getPriceCurrencyImage('medium') : ''
    };
  }

  /*
   * Покупка НЕ консумируется автоматически. Порядок из документации:
   * сначала выдать купленное и сохранить прогресс, и только потом гасить
   * токен — после consumePurchase покупка исчезает безвозвратно.
   *
   * Гасить нужно только расходуемые товары. Постоянные (отключение
   * рекламы, множитель навсегда) должны оставаться в getPurchases():
   * именно оттуда они восстанавливаются на любом устройстве.
   */
  function purchase(id) {
    if (!payments) return Promise.reject(new Error('no-payments'));
    return payments.purchase({ id: id });
  }

  function consume(token) {
    if (!payments || !token || typeof payments.consumePurchase !== 'function') return Promise.resolve();
    return payments.consumePurchase(token).catch(function () {
      /* не удалось — попробуем при следующем запуске игры */
    });
  }

  /* Список покупок игрока в виде [{ id, token }]. */
  function getPurchases() {
    if (!payments || typeof payments.getPurchases !== 'function') return Promise.resolve([]);
    return payments.getPurchases()
      .then(function (list) {
        return (list || []).map(function (p) {
          return { id: p.productID || p.id, token: p.purchaseToken };
        });
      })
      .catch(function () { return []; });
  }

  /* ---------------------------------------------------------------- *
   * Лидерборд и оценка игры
   * ---------------------------------------------------------------- */
  var lastScoreAt = 0;

  /*
   * Запись результата доступна только авторизованным игрокам, поэтому
   * сначала спрашиваем платформу. Лимит платформы — один вызов в секунду,
   * свой предохранитель стоит с запасом.
   */
  function submitScore(name, score) {
    if (!leaderboards) return;
    var v = Math.floor(score);
    if (!isFinite(v) || v <= 0) return;
    if (v > 9e15) v = 9e15;               // не выходим за точность целых в JS

    var now = Date.now();
    if (now - lastScoreAt < 2000) return;
    lastScoreAt = now;

    methodAvailable('leaderboards.setScore').then(function (ok) {
      if (!ok) return;                    // гость в таблицу не попадает
      try {
        if (typeof leaderboards.setScore === 'function') {
          leaderboards.setScore(name, v);
        } else if (typeof leaderboards.setLeaderboardScore === 'function') {
          leaderboards.setLeaderboardScore(name, v);   // устаревший путь
        }
      } catch (e) { /* лидерборд может быть не заведён в Консоли */ }
    });
  }

  /*
   * Авторизация (п. 1.2 и 1.2.1). Игра полностью играбельна без неё:
   * вход предлагается только кнопкой и только гостю, а UI рядом с
   * кнопкой объясняет, что даёт аккаунт. Никаких сторонних сервисов —
   * только Яндекс ID через SDK.
   */
  /*
   * player.getMode() в документации помечен как устаревший и будет удалён,
   * актуальная проверка — player.isAuthorized(). Старый путь оставлен
   * запасным на случай более ранней версии SDK.
   */
  function isAuthorized() {
    if (!player) return false;
    try {
      if (typeof player.isAuthorized === 'function') return !!player.isAuthorized();
      if (typeof player.getMode === 'function') return player.getMode() !== 'lite';
    } catch (e) { /* считаем гостем */ }
    return false;
  }

  function isGuest() {
    return state.isYandex && !isAuthorized();
  }

  function requestAuth() {
    if (!ysdk || !ysdk.auth || typeof ysdk.auth.openAuthDialog !== 'function') {
      return Promise.resolve(false);
    }
    return ysdk.auth.openAuthDialog()
      .then(function () { return initPlayer(); })
      .then(function () { return !isGuest(); })
      .catch(function () { return false; });   // игрок передумал — это нормально
  }

  /*
   * Таблица лидеров. Возвращает нормализованный список или null, если
   * лидерборд не заведён в Консоли — тогда UI просто ничего не рисует.
   */
  function loadLeaderboard(name, limit) {
    if (!leaderboards) return Promise.resolve(null);
    var fn = leaderboards.getEntries || leaderboards.getLeaderboardEntries;
    if (typeof fn !== 'function') return Promise.resolve(null);

    /* quantityTop не больше 20, quantityAround — от 1 до 10 */
    return fn.call(leaderboards, name, {
      quantityTop: Math.min(20, limit || 10),
      includeUser: true,
      quantityAround: 2
    })
      .then(function (res) {
        if (!res || !res.entries) return null;
        var mine = res.userRank || 0;
        return res.entries.map(function (e) {
          var p = e.player || {};
          return {
            rank: e.rank,
            score: e.score,
            name: p.publicName || '',
            isUser: mine > 0 && e.rank === mine
          };
        });
      })
      .catch(function () { return null; });
  }

  /* ---------------------------------------------------------------- *
   * Player Stats — числовые показатели игрока
   *
   * Отдельный от setData канал ровно для чисел: платформа умеет
   * инкрементировать их атомарно и не гоняет ради этого весь сейв.
   * Сам прогресс всё равно живёт в setData: stats — это витрина, а не
   * источник правды, и терять их не страшно.
   * ---------------------------------------------------------------- */
  function setStats(values) {
    if (!player || typeof player.setStats !== 'function' || !values) return Promise.resolve(false);
    /* платформа принимает только конечные числа — чистим на входе */
    var clean = {};
    Object.keys(values).forEach(function (k) {
      var v = values[k];
      if (typeof v === 'number' && isFinite(v)) clean[k] = Math.floor(v);
    });
    if (!Object.keys(clean).length) return Promise.resolve(false);

    try {
      return player.setStats(clean)
        .then(function () { return true; })
        .catch(function () { return false; });
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  function getStats(keys) {
    if (!player || typeof player.getStats !== 'function') return Promise.resolve(null);
    try {
      return player.getStats(keys).catch(function () { return null; });
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  /* ---------------------------------------------------------------- *
   * Ярлык игры на рабочем столе
   *
   * Диалог нативный, показывать его можно не всегда и не всем — поэтому
   * сначала обязательная проверка доступности. Предлагаем не новичку, а
   * игроку, который уже вернулся: решает про это app.js.
   * ---------------------------------------------------------------- */
  function canShowShortcutPrompt() {
    if (!ysdk || !ysdk.shortcut || typeof ysdk.shortcut.canShowPrompt !== 'function') {
      return Promise.resolve(false);
    }
    try {
      return ysdk.shortcut.canShowPrompt()
        .then(function (r) { return !!(r && r.canShow); })
        .catch(function () { return false; });
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  function showShortcutPrompt() {
    if (!ysdk || !ysdk.shortcut || typeof ysdk.shortcut.showPrompt !== 'function') {
      return Promise.resolve(false);
    }
    try {
      return ysdk.shortcut.showPrompt()
        .then(function (r) { return !!(r && r.outcome === 'accepted'); })
        .catch(function () { return false; });   // отказ игрока — норма
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  /* ---------------------------------------------------------------- *
   * Sticky-баннер
   *
   * Включается в Консоли, а не отсюда, и по умолчанию висит всю сессию.
   * Эти две функции — заложенная возможность прятать его на время
   * активной игры; включается она флагом banner.manageFromCode и по
   * умолчанию выключена.
   * ---------------------------------------------------------------- */
  function bannerManaged() {
    var b = SE.BALANCE.banner;
    return !!(b && b.manageFromCode && b.hideInGameplay);
  }

  function showBanner() {
    if (!bannerManaged()) return;
    try {
      if (ysdk && ysdk.adv && typeof ysdk.adv.showBannerAdv === 'function') ysdk.adv.showBannerAdv();
    } catch (e) { /* баннера может не быть вовсе */ }
  }

  function hideBanner() {
    if (!bannerManaged()) return;
    try {
      if (ysdk && ysdk.adv && typeof ysdk.adv.hideBannerAdv === 'function') ysdk.adv.hideBannerAdv();
    } catch (e) { /* баннера может не быть вовсе */ }
  }

  function canReview() {
    if (!ysdk || !ysdk.feedback || typeof ysdk.feedback.canReview !== 'function') return Promise.resolve(false);
    return ysdk.feedback.canReview()
      .then(function (r) { return !!(r && r.value); })
      .catch(function () { return false; });
  }

  function requestReview() {
    if (!ysdk || !ysdk.feedback || typeof ysdk.feedback.requestReview !== 'function') return Promise.resolve(false);
    return ysdk.feedback.requestReview()
      .then(function (r) { return !!(r && r.feedbackSent); })
      .catch(function () { return false; });
  }

  SE.Platform = {
    init: init,
    ready: ready,
    gameplayStart: gameplayStart,
    gameplayStop: gameplayStop,
    state: state,
    get lang() { return state.lang; },
    get isYandex() { return state.isYandex; },
    serverTimeMs: serverTimeMs,
    save: save,
    load: load,
    flush: flush,
    showRewarded: showRewarded,
    rewardedAvailable: rewardedAvailable,
    showInterstitial: showInterstitial,
    canShowInterstitial: canShowInterstitial,
    catalog: catalog,
    priceOf: priceOf,
    purchase: purchase,
    consume: consume,
    getPurchases: getPurchases,
    get paymentsReady() { return state.paymentsReady; },
    isGuest: isGuest,
    requestAuth: requestAuth,
    submitScore: submitScore,
    loadLeaderboard: loadLeaderboard,
    canReview: canReview,
    requestReview: requestReview,
    setStats: setStats,
    getStats: getStats,
    canShowShortcutPrompt: canShowShortcutPrompt,
    showShortcutPrompt: showShortcutPrompt,
    showBanner: showBanner,
    hideBanner: hideBanner,
    get flagsLoaded() { return state.flagsLoaded; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
