/*
 * app.js — связывает экономику, UI и платформу.
 * Здесь живут: игровой цикл, сохранения, офлайн-доход, реклама, покупки.
 */
(function (root) {
  'use strict';

  var SE = root.SE;
  var doc = root.document;
  var Economy = SE.Economy;
  var Platform = SE.Platform;
  var Sound = SE.Sound;
  var UI = SE.UI;
  var t = SE.I18N.t;
  var F = SE.Format;
  var Config = SE.Config;
  var Metrica = SE.Metrica;
  /* B — эффективный баланс: дефолты из билда, поверх которых легли флаги.
     Config меняет его на месте, поэтому ссылка остаётся актуальной. */
  var B = SE.BALANCE;

  var LEADERBOARD = 'total';

  var state = null;
  var lastFrame = 0;
  /*
   * stateTime — серверное время, которому соответствует текущее состояние.
   * Растёт вместе с симуляцией и пересинхронизируется при возврате в игру.
   * Именно от него считается офлайн-доход, поэтому обычный автосейв в
   * свёрнутой вкладке его не двигает и время «в отсутствии» не теряется.
   */
  var stateTime = 0;
  var pendingOffline = 0;
  var running = false;
  var paused = false;          // ручная пауза игрока
  var hidden = false;          // вкладка свёрнута
  var adPause = false;         // показывается реклама
  var sessionReviewAsked = false;
  var sessionShortcutAsked = false;
  var ownedProducts = {};
  /* «затык»: сколько подряд игрок не может позволить себе даже самую
     дешёвую покупку. Это и есть момент, когда воронка ломается. */
  var stallMs = 0;
  var wallCooldownMs = 0;

  /* ---------------------------------------------------------------- *
   * Старт
   * ---------------------------------------------------------------- */
  function boot() {
    Platform.init({
      onPause: function () { adPause = true; Sound.suspend(); },
      onResume: function () { adPause = false; Sound.resume(); catchUp(); },
      onAccountChanged: reloadAfterAccountChange
    })
      .then(function () {
        SE.I18N.setLang(Platform.lang);
        F.setLang(SE.I18N.getLang());
        /* флаги к этому моменту уже применены (или не приехали —
           тогда работают дефолты), поэтому номер счётчика читаем
           через ту же единую точку, что и весь остальной баланс */
        Metrica.init(Config.getFlag('metrica.counterId', ''));
        return Platform.load();
      })
      .then(function (saved) {
        applySave(saved);
        startGame();
      })
      .catch(function () {
        /* даже при полном отказе платформы игра должна запуститься */
        applySave(null);
        startGame();
      });
  }

  function applySave(saved) {
    state = Economy.migrate(saved);
    state.flags = state.flags || {};
    state.flags.sessions = (state.flags.sessions || 0) + 1;

    /* язык из сейва имеет приоритет над языком платформы: игрок его выбрал сам */
    if (state.flags.lang && SE.I18N.has(state.flags.lang)) {
      SE.I18N.setLang(state.flags.lang);
      F.setLang(state.flags.lang);
    }
    if (state.flags.muted) Sound.setMuted(true);

    /* восстанавливаем купленные товары */
    ownedProducts = {};
    Object.keys(state.purchases).forEach(function (k) {
      if (state.purchases[k]) ownedProducts[k] = true;
    });

    var now = Platform.serverTimeMs();
    var prev = saved && typeof saved.stateTime === 'number' ? saved.stateTime
      : (saved && typeof saved.savedAt === 'number' ? saved.savedAt : 0);
    stateTime = now;
    if (prev > 0 && now > prev) pendingOffline = now - prev;
  }

  function startGame() {
    UI.init({
      getState: function () { return state; },
      actions: actions
    });
    UI.setShopVisible(false);
    UI.hideLoader();

    bindLifecycle();
    running = true;
    lastFrame = root.performance ? root.performance.now() : Date.now();
    root.requestAnimationFrame(frame);

    /* игрок реально может играть — обязательный вызов (п. 1.19.2) */
    Platform.ready();
    Platform.gameplayStart();

    if (pendingOffline > 0) showOffline(pendingOffline);
    pendingOffline = 0;

    maybeShowShop();
    scheduleHints();
    maybeOfferShortcut();
    pushStats();
    Metrica.userParams({
      stars: state.stars,
      prestiges: state.prestiges,
      sessions: state.flags.sessions || 1
    });
    save();
  }

  /* ---------------------------------------------------------------- *
   * Игровой цикл
   * ---------------------------------------------------------------- */
  function frame(now) {
    if (!running) return;
    root.requestAnimationFrame(frame);

    var dt = now - lastFrame;
    lastFrame = now;
    if (dt < 0) dt = 0;

    /*
     * Кадры могут не приходить и без visibilitychange — например, окно
     * перекрыли другим. Большой разрыв закрываем по серверному времени,
     * а не считаем как обычный такт.
     */
    if (dt > 2000) {
      if (!isFrozen()) catchUp();
      UI.render(now);
      return;
    }

    if (!isFrozen()) {
      var res = Economy.tick(state, dt);
      stateTime += dt;
      trackWall(dt);
      if (res.earned > 0) onEarned(res);
    }
    UI.render(now);
  }

  /*
   * Ловит «затык» — состояние, когда игрок больше минуты не может
   * позволить себе вообще ничего. Это и есть точка, где он либо смотрит
   * рекламу, либо уходит; без этой цели в Метрике непонятно, на каком
   * месте забега ломается воронка.
   *
   * Цель шлётся не чаще раза в пять минут: затык может тянуться долго,
   * а интересен факт, а не каждая его секунда.
   */
  function trackWall(dt) {
    if (wallCooldownMs > 0) wallCooldownMs = Math.max(0, wallCooldownMs - dt);

    var cheapest = Economy.cheapestNextCost(state);
    if (!isFinite(cheapest) || state.money >= cheapest) {
      stallMs = 0;
      return;
    }

    stallMs += dt;
    var threshold = Config.getFlag('metrica.wallHitMs', 60000);
    if (stallMs < threshold || wallCooldownMs > 0) return;

    wallCooldownMs = 5 * 60 * 1000;
    stallMs = 0;
    Metrica.goal(Metrica.GOALS.wallHit, {
      spots: state.unlockedCount,
      stars: state.stars,
      prestiges: state.prestiges
    });
  }

  function isFrozen() {
    return paused || hidden || adPause;
  }

  function num(v) {
    return (typeof v === 'number' && isFinite(v)) ? v : 0;
  }

  function onEarned(res) {
    /* всплывающие цифры только на активной вкладке и только для тапов */
    res.completed.forEach(function (c) {
      var biz = Economy.getBusiness(state, c.id);
      if (!biz || biz.hasManager) return;
      var card = UI.cardOf(c.id);
      if (card) {
        UI.floatText(card.tapBtn, '+' + F.cash(c.gain), 'float--coin');
        Sound.coin();
      }
    });
  }

  /* Догоняет время, пропущенное на паузе/рекламе/в свёрнутой вкладке. */
  function catchUp() {
    var now = Platform.serverTimeMs();
    var elapsed = now - stateTime;
    stateTime = now;
    lastFrame = root.performance ? root.performance.now() : Date.now();
    if (elapsed <= 0) return;

    if (elapsed >= B.offline.minMs) showOffline(elapsed);
    else Economy.tick(state, elapsed);
  }

  /*
   * Платформа сама показывает диалог выбора прогресса, когда гость входит
   * в аккаунт. После его закрытия сохранение могло смениться — перечитываем
   * и берём то, где заработано больше.
   */
  function reloadAfterAccountChange() {
    if (!state) return;
    Platform.load().then(function (saved) {
      if (!saved || num(saved.lifetimeEarned) <= state.lifetimeEarned) {
        save(true);            // в облаке пусто или старее — заливаем своё
        return;
      }
      applySave(saved);
      UI.rebuild();
      if (pendingOffline > 0) {
        showOffline(pendingOffline);
        pendingOffline = 0;
      }
      save(true);
    });
  }

  /* ---------------------------------------------------------------- *
   * Офлайн-доход
   * ---------------------------------------------------------------- */
  function showOffline(elapsedMs) {
    var res = Economy.offlineEarnings(state, elapsedMs);
    if (res.amount <= 0) return;

    var body = [
      makeText(t('offline.body', { time: F.duration(res.ms) })),
      makeBig('+' + F.cash(res.amount))
    ];

    /* про магазин упоминаем, только если он реально доступен —
       иначе текст ссылается на скрытую вкладку */
    if (res.capped) {
      var capKey = (Platform.paymentsReady && !state.purchases.offlineExtended)
        ? 'offline.cappedShop' : 'offline.capped';
      body.push(makeNote(t(capKey, { cap: F.duration(res.cap) })));
    }

    function claimOffline(amount) {
      Economy.applyOffline(state, amount);
      Metrica.goal(Metrica.GOALS.offlineClaimed, { minutes: Math.round(res.ms / 60000) });
      save(true);
    }

    var buttons = [{
      text: t('offline.claim'), cls: 'btn--primary', action: function () {
        UI.closeModal();
        claimOffline(res.amount);
        Sound.reward();
      }
    }];

    if (adsAvailable()) {
      buttons.unshift({
        text: t('offline.claimX2'), cls: 'btn--ad', icon: '🎬', action: function () {
          UI.closeModal();
          showRewarded('offline', {
            onRewarded: function () {
              claimOffline(res.amount * B.ads.offline.mult);
              Sound.reward();
              UI.toast(t('ads.rewarded'));
            },
            onClose: function (rewarded) {
              /* ролик закрыли — базовую награду всё равно отдаём */
              if (!rewarded) claimOffline(res.amount);
            },
            onError: function () {
              claimOffline(res.amount);
              UI.toast(t('ads.failed'));
            }
          });
        }
      });
    }

    UI.showModal({
      title: '🌙 ' + t('offline.title'),
      body: body,
      buttons: buttons,
      dismissible: false      // награду забирают кнопкой, а не кликом мимо
    });
  }

  function makeText(s) {
    var p = doc.createElement('p');
    p.className = 'modal__text';
    p.textContent = s;
    return p;
  }

  function makeBig(s) {
    var p = doc.createElement('p');
    p.className = 'modal__big';
    p.textContent = s;
    return p;
  }

  function makeNote(s) {
    var p = doc.createElement('p');
    p.className = 'note';
    p.textContent = s;
    return p;
  }

  /* ---------------------------------------------------------------- *
   * Действия игрока
   * ---------------------------------------------------------------- */
  var actions = {
    tap: function (id, node) {
      Sound.unlock();
      if (Economy.tap(state, id)) {
        Sound.tap();
        UI.pulse(node);
      }
    },

    buyLevels: function (id, node) {
      var biz = Economy.getBusiness(state, id);
      var count = biz.level > 0 ? Economy.buyCount(state, biz) : 1;
      var speedBefore = Economy.milestonesReached(biz.level);
      var res = Economy.buyLevels(state, id, count);
      if (!res) { Sound.denied(); return; }

      Sound.buy();
      UI.pulse(node);
      if (res.unlockedNew) onBusinessUnlocked(id);
      /* порог скорости — главный «рывок» в идле, его надо заметить */
      else if (Economy.milestonesReached(biz.level) > speedBefore) {
        Sound.unlockBiz();
        UI.toast('⚡ ' + t('card.speedUp', { name: t('biz.' + id) }));
      }
      save();
    },

    buyManager: function (id, node) {
      if (!Economy.buyManager(state, id)) { Sound.denied(); return; }
      Sound.buy();
      UI.pulse(node);
      UI.toast('👤 ' + t('card.managerHired', { name: t('biz.' + id) }));
      /* первый менеджер — момент, когда игра начинает играть сама.
         Кто до него не дошёл, тот не понял игру вовсе. */
      if (!state.flags.firstManager) {
        state.flags.firstManager = true;
        Metrica.goal(Metrica.GOALS.firstManager, { spot: id });
      }
      save();
    },

    buyUpgrade: function (id, node) {
      if (!Economy.buyUpgrade(state, id)) { Sound.denied(); return; }
      Sound.buy();
      UI.pulse(node);
      save();
    },

    setBuyMode: function (mode) {
      state.buyMode = mode;
      save();
    },

    watchAd: function (key, done) {
      if (!adsAvailable()) return;
      showRewarded(key, {
        onRewarded: function () { grantAdReward(key); },
        onClose: function () { if (done) done(); },
        onError: function () { UI.toast(t('ads.failed')); if (done) done(); }
      });
    },

    doPrestige: function () {
      var res = Economy.doPrestige(state);
      if (!res) return;

      Sound.prestige();
      Platform.submitScore(LEADERBOARD, state.lifetimeEarned);
      pushStats();
      save(true);
      UI.rebuild();
      UI.setTab('biz');
      UI.toast(t('prestige.done', { n: res.stars }));
      Metrica.goal(Metrica.GOALS.prestige, { n: state.prestiges, stars: state.stars });

      /* логическая пауза — уместное место для полноэкранной рекламы */
      Platform.showInterstitial({
        noAds: !!state.purchases.noAds,
        onDone: function () { askReviewOnce(); }
      });
    },

    toggleSound: function () {
      Sound.setMuted(!Sound.isMuted());
      state.flags.muted = Sound.isMuted();
      save();
    },

    pause: function () {
      paused = true;
      Sound.suspend();
      Platform.gameplayStop();
      Platform.flush();
      UI.openPause(function () {
        paused = false;
        Sound.resume();
        Platform.gameplayStart();
        catchUp();
      });
    },

    setLang: function (lang) {
      SE.I18N.setLang(lang);
      F.setLang(lang);
      state.flags.lang = lang;
      UI.rebuild();
      save();
    },

    /*
     * Результат отправляем при открытии рейтинга. Раньше он уходил только
     * при продаже сети — и тот, кто до престижа не дошёл, в таблице не
     * появлялся вообще, хотя выручка у него уже была. Платформа сама
     * ограничивает частоту записи, плюс свой предохранитель в submitScore.
     */
    onTab: function (id) {
      if (id === 'lb') Platform.submitScore(LEADERBOARD, state.lifetimeEarned);
    },

    adsAvailable: adsAvailable,
    loadLeaderboard: function () { return Platform.loadLeaderboard(LEADERBOARD, 10); },
    isGuest: function () { return Platform.isGuest(); },

    requestAuth: function (done) {
      Platform.requestAuth().then(function (authorized) {
        if (!authorized) {
          if (done) done(false);
          return;
        }
        /*
         * В облаке аккаунта уже может лежать более продвинутый прогресс
         * с другого устройства — перечитываем и берём лучшее. Иначе вход
         * затёр бы чужой прогресс прогрессом гостя (п. 1.13.3).
         */
        reloadAfterAccountChange();
        Platform.submitScore(LEADERBOARD, state.lifetimeEarned);
        if (done) done(true);
      });
    },
    shopProducts: shopProducts,
    purchase: purchase,
    restorePurchases: restorePurchases
  };

  /*
   * Единственная точка показа rewarded в игре. Здесь же снимаются обе
   * половины воронки ролика: сколько раз оффер запустили и сколько раз
   * досмотрели до награды. Разрыв между ними — это либо неинтересный
   * оффер, либо проблема с наливом рекламы.
   */
  function showRewarded(offerId, cbs) {
    cbs = cbs || {};
    Metrica.goal(Metrica.GOALS.rvShown(offerId));
    Platform.showRewarded({
      onRewarded: function () {
        Metrica.goal(Metrica.GOALS.rvRewarded(offerId));
        if (cbs.onRewarded) cbs.onRewarded();
      },
      onClose: function (rewarded) { if (cbs.onClose) cbs.onClose(rewarded); },
      onError: function (e) { if (cbs.onError) cbs.onError(e); }
    });
  }

  function grantAdReward(key) {
    if (key === 'speed') {
      Economy.grantSpeedBoost(state);
      UI.toast('⚡ ' + t('ads.speed'));
    } else if (key === 'cash') {
      var amount = Economy.grantInstantCash(state);
      UI.toast('💰 +' + F.cash(amount));
    } else if (key === 'discount') {
      Economy.grantDiscount(state);
      UI.toast('🏷️ ' + t('ads.discount'));
    } else if (key === 'prestige') {
      Economy.grantPrestigeBonus(state);
      UI.toast('⭐ ' + t('prestige.adBonusActive'));
    }
    Sound.reward();
    save(true);
  }

  function onBusinessUnlocked(id) {
    Sound.unlockBiz();
    UI.toast(t('newBiz', { name: t('biz.' + id) }));
    /* вторая логическая пауза для interstitial */
    Platform.showInterstitial({ noAds: !!state.purchases.noAds });
  }

  /*
   * Rewarded остаётся доступным даже после покупки «убрать рекламу»:
   * это бонус по желанию, а не навязанный показ. Локально (без SDK)
   * заглушка выдаёт награду сразу — чтобы можно было гонять механику.
   */
  function adsAvailable() {
    return Platform.rewardedAvailable();
  }

  /* ---------------------------------------------------------------- *
   * Магазин
   * ---------------------------------------------------------------- */
  /*
   * Список товаров строится по пересечению конфига и каталога из SDK:
   * товар без цены в Консоли в игре не показывается вовсе (п. 1.13.6),
   * а цена всегда приходит из SDK, а не из нашего кода (п. 1.13.2).
   */
  function shopProducts() {
    if (!Platform.paymentsReady) return [];
    var session = state.flags.sessions || 1;
    var out = [];

    SE.SHOP.products.forEach(function (p) {
      if (p.showFromSession && session < p.showFromSession) return;
      if (p.oncePerAccount && state.purchases[p.effect]) return;

      var price = Platform.priceOf(p.id);
      if (!price) return;      // в Консоли товара нет или он неактивен

      out.push({
        id: p.id, icon: p.icon, titleKey: p.titleKey, descKey: p.descKey,
        priceValue: price.value,
        priceLabel: price.label,
        currencyImage: price.currencyImage,
        owned: !!(p.permanent && state.purchases[p.effect])
      });
    });
    return out;
  }

  function maybeShowShop() {
    /* вкладка появляется, только когда каталог реально пришёл из SDK */
    var tries = 0;
    var timer = root.setInterval(function () {
      tries++;
      if (Platform.paymentsReady) {
        UI.setShopVisible(true);
        UI.renderTabContent(true);
        /* обязательная проверка необработанных покупок при запуске */
        restorePurchases();
        root.clearInterval(timer);
      } else if (tries > 20) {
        root.clearInterval(timer);
      }
    }, 500);
  }

  function findProduct(id) {
    var def = null;
    SE.SHOP.products.forEach(function (p) { if (p.id === id) def = p; });
    return def;
  }

  /*
   * Порядок важен: сначала выдаём купленное и сохраняем прогресс, и только
   * потом гасим токен — после консумирования покупка исчезает навсегда.
   * Постоянные товары не гасим вовсе: они остаются в getPurchases() и
   * оттуда восстанавливаются на любом устройстве.
   */
  function purchase(id, node) {
    var def = findProduct(id);
    if (!def) return;

    Platform.purchase(id)
      .then(function (p) {
        applyProduct(def);
        save(true);
        Sound.reward();
        Metrica.goal(Metrica.GOALS.iap(id));
        UI.toast(t('shop.thanks'));
        UI.renderTabContent(true);
        if (!def.permanent && p && p.purchaseToken) Platform.consume(p.purchaseToken);
      })
      .catch(function () {
        /* игрок отменил оплату — молчим, это нормальный сценарий */
        if (node) node.blur();
      });
  }

  function applyProduct(def) {
    if (def.effect === 'starterPack') {
      var amount = Math.max(def.grantMin, Economy.incomePerSecond(state) * def.grantSeconds);
      Economy.addMoney(state, amount);
      state.boosts.speedRemainMs = Math.max(state.boosts.speedRemainMs, def.boostMs);
      state.purchases.starterPack = true;
    } else {
      state.purchases[def.effect] = true;
    }
    ownedProducts[def.effect] = true;
  }

  /*
   * Разбор покупок игрока. Вызывается при старте и по кнопке
   * «Восстановить покупки»: постоянные товары возвращает в игру,
   * расходуемые выдаёт и гасит (п. 1.13.1).
   */
  function restorePurchases() {
    return Platform.getPurchases().then(function (list) {
      var toConsume = [];

      (list || []).forEach(function (item) {
        var def = findProduct(item.id);
        if (!def) return;
        applyProduct(def);
        if (!def.permanent && item.token) toConsume.push(item.token);
      });

      if (list && list.length) {
        save(true);
        UI.renderTabContent(true);
      }
      /* гасим только после того, как выданное сохранено */
      toConsume.forEach(function (token) { Platform.consume(token); });
    });
  }

  /* ---------------------------------------------------------------- *
   * Оценка игры — только после позитивного события, один раз за сессию
   * ---------------------------------------------------------------- */
  function askReviewOnce() {
    if (sessionReviewAsked) return;
    if (state.prestiges < 1) return;
    sessionReviewAsked = true;

    Platform.canReview().then(function (can) {
      if (!can) return;
      UI.showModal({
        title: '⭐',
        body: [makeText(t('review.ask'))],
        buttons: [
          { text: t('review.no'), cls: 'btn--ghost', action: UI.closeModal },
          {
            text: t('review.yes'), cls: 'btn--primary', action: function () {
              UI.closeModal();
              Platform.requestReview();
            }
          }
        ]
      });
    });
  }

  /* ---------------------------------------------------------------- *
   * Ярлык игры на рабочем столе
   *
   * Предлагаем не новичку, а тому, кто уже вернулся: на третьей сессии
   * и не в первую минуту. Диалог нативный, его доступность обязательно
   * проверяется заранее. Отказ запоминаем — навязываться второй раз
   * после явного «нет» смысла нет.
   * ---------------------------------------------------------------- */
  function maybeOfferShortcut() {
    if (sessionShortcutAsked) return;
    if (state.flags.shortcutDone) return;

    var fromSession = Config.getFlag('shortcut.fromSession', 3);
    if ((state.flags.sessions || 1) < fromSession) return;
    if ((state.flags.shortcutAsks || 0) >= 2) return;

    sessionShortcutAsked = true;
    root.setTimeout(function () {
      if (isFrozen()) return;
      Platform.canShowShortcutPrompt().then(function (can) {
        if (!can) return;
        state.flags.shortcutAsks = (state.flags.shortcutAsks || 0) + 1;
        save();
        Platform.showShortcutPrompt().then(function (accepted) {
          if (accepted) {
            state.flags.shortcutDone = true;
            save(true);
          }
        });
      });
    }, Config.getFlag('shortcut.delayMs', 45000));
  }

  /* ---------------------------------------------------------------- *
   * Player Stats — числовая витрина игрока на стороне платформы
   * ---------------------------------------------------------------- */
  var lastStatsAt = 0;

  function pushStats() {
    if (!state) return;
    var now = Date.now();
    if (now - lastStatsAt < 30000) return;
    lastStatsAt = now;

    Platform.setStats({
      stars: state.stars,
      prestiges: state.prestiges,
      spots: state.unlockedCount,
      /* заработок за всё время не влезает в точность целых при длинной
         игре — режем по безопасной границе, это витрина, а не баланс */
      lifetime: Math.min(state.lifetimeEarned, 9e15)
    });
  }

  /* ---------------------------------------------------------------- *
   * Подсказки новичку
   * ---------------------------------------------------------------- */
  function scheduleHints() {
    if (state.taps === 0 && state.lifetimeEarned === 0) {
      root.setTimeout(function () {
        if (state.taps === 0) UI.toast(t('tut.tap'));
      }, B.tutorial.tapHintMs);
    }
    var hintTimer = root.setInterval(function () {
      if (!state.businesses[0]) return root.clearInterval(hintTimer);
      var first = state.businesses[0];
      if (!first.hasManager && state.money >= B.tutorial.managerHintMoney && !state.flags.hintManager) {
        state.flags.hintManager = true;
        UI.toast(t('tut.manager'));
        root.clearInterval(hintTimer);
      }
      if (first.hasManager) root.clearInterval(hintTimer);
    }, 3000);
  }

  /* ---------------------------------------------------------------- *
   * Сохранение
   * ---------------------------------------------------------------- */
  function save(immediate) {
    if (!state) return;
    state.savedAt = Platform.serverTimeMs();
    state.stateTime = stateTime;
    Platform.save(state, !!immediate);
  }

  /* ---------------------------------------------------------------- *
   * Жизненный цикл вкладки
   * ---------------------------------------------------------------- */
  function bindLifecycle() {
    doc.addEventListener('visibilitychange', function () {
      if (doc.hidden) {
        hidden = true;
        Sound.suspend();
        Platform.gameplayStop();
        save(true);                 // обязательный флаш (п. 1.9)
        Platform.submitScore(LEADERBOARD, state.lifetimeEarned);
        pushStats();
      } else {
        hidden = false;
        if (!paused) {
          Sound.resume();
          Platform.gameplayStart();
        }
        catchUp();
      }
    });

    root.addEventListener('pagehide', function () { save(true); });

    /*
     * п. 1.3: звук останавливается при потере фокуса. Модерация проверяет
     * и сворачивание окна браузера, а оно не везде даёт visibilitychange —
     * поэтому глушим и по blur. Сам геймплей при этом не замораживаем:
     * это идл, доход должен продолжать капать.
     */
    root.addEventListener('blur', function () {
      Sound.suspend();
      Platform.flush();
    });

    root.addEventListener('focus', function () {
      if (!paused && !hidden && !adPause) Sound.resume();
    });

    /* п. 1.6.1.8 и 1.6.2.7: ни лонгтап, ни правая кнопка не должны
       открывать контекстное меню поверх игрового поля */
    doc.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    /* периодический автосейв — страховка от закрытия без событий */
    root.setInterval(function () { save(); }, 15000);
  }

  /* ---------------------------------------------------------------- */
  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
