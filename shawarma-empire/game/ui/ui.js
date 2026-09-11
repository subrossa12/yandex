/*
 * ui.js — весь рендер. Логику не трогает: только читает состояние и
 * дёргает колбэки из ctx.actions.
 *
 * Принцип: DOM карточек строится один раз, дальше в цикле обновляются
 * только изменившиеся значения (кэш last*), чтобы не жечь батарею.
 */
(function (root) {
  'use strict';

  var SE = (root.SE = root.SE || {});
  var doc = root.document;

  var t, F, Economy;
  var ctx = null;
  var els = {};
  var cards = {};
  var currentTab = 'biz';
  var lastFullRefresh = 0;
  var modalStack = [];

  function $(id) { return doc.getElementById(id); }

  function el(tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  /* ---------------------------------------------------------------- *
   * Инициализация
   * ---------------------------------------------------------------- */
  function init(context) {
    ctx = context;
    t = SE.I18N.t;
    F = SE.Format;
    Economy = SE.Economy;

    els = {
      game: $('game'),
      money: $('money'),
      rate: $('rate'),
      starsChip: $('starsChip'),
      starsValue: $('starsValue'),
      btnSound: $('btnSound'),
      btnSettings: $('btnSettings'),
      boostBar: $('boostBar'),
      bizList: $('bizList'),
      nextUp: $('nextUp'),
      upList: $('upList'),
      adsList: $('adsList'),
      prestigeBox: $('prestigeBox'),
      lbBox: $('lbBox'),
      shopList: $('shopList'),
      buyMode: $('buyMode'),
      tabbar: $('tabbar'),
      modal: $('modal'),
      modalBox: $('modalBox'),
      fx: $('fx'),
      loader: $('loader')
    };

    buildTabbar();
    buildBuyMode();
    buildBusinessCards();
    bindStaticHandlers();
    applyStaticTexts();
    setTab('biz');
  }

  function bindStaticHandlers() {
    els.btnSound.addEventListener('click', function () {
      ctx.actions.toggleSound();
      refreshSoundButton();
    });
    els.btnSettings.addEventListener('click', function () { openSettings(); });
    els.modal.addEventListener('click', function (e) {
      /* окна с наградой закрываются только кнопкой: клик мимо не должен
         съедать офлайн-доход */
      var top = modalStack[modalStack.length - 1];
      if (top && top.dismissible === false) return;
      if (e.target === els.modal) closeModal();
    });
  }

  function applyStaticTexts() {
    doc.title = t('title');
    doc.documentElement.lang = SE.I18N.getLang();
    refreshSoundButton();
  }

  function refreshSoundButton() {
    var muted = SE.Sound.isMuted();
    els.btnSound.textContent = muted ? '🔇' : '🔊';
    els.btnSound.setAttribute('aria-label', t('set.sound') + ': ' + t(muted ? 'set.off' : 'set.on'));
  }

  /* ---------------------------------------------------------------- *
   * Вкладки
   * ---------------------------------------------------------------- */
  var TABS = [
    { id: 'biz', icon: '🏪', key: 'tab.biz' },
    { id: 'upgrades', icon: '⚡', key: 'tab.upgrades' },
    { id: 'boosts', icon: '🎬', key: 'tab.boosts' },
    { id: 'prestige', icon: '⭐', key: 'tab.prestige' },
    { id: 'lb', icon: '🏆', key: 'tab.lb' },
    { id: 'shop', icon: '🛒', key: 'tab.shop' }
  ];

  /* Магазин скрыт, пока каталог не пришёл из SDK. Состояние переживает
     пересборку таббара при смене языка. */
  var shopVisible = false;

  function buildTabbar() {
    els.tabbar.innerHTML = '';
    TABS.forEach(function (tab) {
      var b = el('button', 'tabbtn');
      b.type = 'button';
      b.dataset.tab = tab.id;
      if (tab.id === 'shop') b.hidden = !shopVisible;
      b.appendChild(el('span', 'tabbtn__icon', tab.icon));
      b.appendChild(el('span', 'tabbtn__label', t(tab.key)));
      b.appendChild(el('span', 'tabbtn__dot'));
      b.addEventListener('click', function () { setTab(tab.id); });
      els.tabbar.appendChild(b);
    });
  }

  function setTab(id) {
    currentTab = id;
    TABS.forEach(function (tab) {
      var section = $('tab-' + tab.id);
      if (section) section.hidden = (tab.id !== id);
    });
    Array.prototype.forEach.call(els.tabbar.children, function (b) {
      b.classList.toggle('is-active', b.dataset.tab === id);
    });
    els.buyMode.hidden = (id !== 'biz');
    lastValues = 0;              // не ждать четверти секунды после переключения
    renderTabContent(true);
    if (ctx && ctx.actions.onTab) ctx.actions.onTab(id);
  }

  function setShopVisible(visible) {
    shopVisible = !!visible;
    var btn = els.tabbar.querySelector('[data-tab="shop"]');
    if (btn) btn.hidden = !shopVisible;
    if (!shopVisible && currentTab === 'shop') setTab('biz');
  }

  /* ---------------------------------------------------------------- *
   * Режим покупки
   * ---------------------------------------------------------------- */
  function buildBuyMode() {
    els.buyMode.innerHTML = '';
    els.buyMode.appendChild(el('span', 'buymode__label', t('buy.mode')));
    [1, 10, 100, 'max'].forEach(function (mode) {
      var b = el('button', 'buymode__btn');
      b.type = 'button';
      b.dataset.mode = String(mode);
      b.textContent = mode === 'max' ? t('buy.max') : ('×' + mode);
      b.addEventListener('click', function () {
        ctx.actions.setBuyMode(mode);
        refreshBuyMode();
      });
      els.buyMode.appendChild(b);
    });
    refreshBuyMode();
  }

  function refreshBuyMode() {
    var st = ctx.getState();
    Array.prototype.forEach.call(els.buyMode.querySelectorAll('.buymode__btn'), function (b) {
      b.classList.toggle('is-active', b.dataset.mode === String(st.buyMode));
    });
  }

  /* ---------------------------------------------------------------- *
   * Карточки точек
   * ---------------------------------------------------------------- */
  function buildBusinessCards() {
    els.bizList.innerHTML = '';
    lastNextUp = null;
    cards = {};
    var st = ctx.getState();

    st.businesses.forEach(function (biz) {
      var def = Economy.getDef(biz.id);
      var card = el('div', 'card');
      card.dataset.id = biz.id;

      var tapBtn = el('button', 'card__tap');
      tapBtn.type = 'button';
      tapBtn.setAttribute('aria-label', t('biz.' + biz.id));
      var icon = el('span', 'card__icon', def.icon);
      tapBtn.appendChild(icon);
      var badge = el('span', 'card__badge');
      tapBtn.appendChild(badge);
      tapBtn.addEventListener('click', function (e) {
        e.preventDefault();
        ctx.actions.tap(biz.id, tapBtn);
      });

      var body = el('div', 'card__body');

      var top = el('div', 'card__row');
      var name = el('span', 'card__name', t('biz.' + biz.id));
      top.appendChild(name);

      /* уровень — во второй строке рядом с полосой: иначе длинные
         названия вроде «Ларёк с шаурмой» обрезаются многоточием */
      var barRow = el('div', 'card__barrow');
      var bar = el('div', 'card__bar');
      var fill = el('div', 'card__fill');
      var barText = el('span', 'card__bartext', '');
      bar.appendChild(fill);
      bar.appendChild(barText);
      var level = el('span', 'card__level', '');
      barRow.appendChild(bar);
      barRow.appendChild(level);

      var buyBtn = el('button', 'btn btn--buy');
      buyBtn.type = 'button';
      var buyTitle = el('span', 'btn__title', t('card.buy'));
      var buyCost = el('span', 'btn__cost', '');
      buyBtn.appendChild(buyTitle);
      buyBtn.appendChild(buyCost);
      buyBtn.addEventListener('click', function () { ctx.actions.buyLevels(biz.id, buyBtn); });

      var mgrBtn = el('button', 'btn btn--mgr');
      mgrBtn.type = 'button';
      var mgrTitle = el('span', 'btn__title', '👤');
      var mgrCost = el('span', 'btn__cost', '');
      mgrBtn.appendChild(mgrTitle);
      mgrBtn.appendChild(mgrCost);
      mgrBtn.addEventListener('click', function () { ctx.actions.buyManager(biz.id, mgrBtn); });

      body.appendChild(top);
      body.appendChild(barRow);

      /* кнопки сбоку, а не под полосой: так карточка ниже и все девять
         точек помещаются на экран без прокрутки (п. 1.10.4) */
      card.appendChild(tapBtn);
      card.appendChild(body);
      card.appendChild(buyBtn);
      card.appendChild(mgrBtn);
      els.bizList.appendChild(card);

      cards[biz.id] = {
        root: card, tapBtn: tapBtn, icon: icon, badge: badge,
        name: name, level: level, fill: fill, barText: barText,
        buyBtn: buyBtn, buyTitle: buyTitle, buyCost: buyCost,
        mgrBtn: mgrBtn, mgrTitle: mgrTitle, mgrCost: mgrCost,
        last: {}
      };
    });

    /* анонс живёт внутри списка и должен пережить его пересборку */
    els.bizList.appendChild(els.nextUp);
  }

  function setText(node, cacheObj, key, value) {
    if (cacheObj[key] === value) return;
    cacheObj[key] = value;
    node.textContent = value;
  }

  /*
   * Каждый кадр двигается только полоса прогресса: она одна и меняется
   * непрерывно. Всё остальное (цены, уровни, доступность кнопок) —
   * четыре раза в секунду, иначе на телефоне зря греется процессор.
   */
  function updateBusinessProgress() {
    var st = ctx.getState();
    st.businesses.forEach(function (biz) {
      var c = cards[biz.id];
      if (!c || c.last.locked !== false || biz.level <= 0) return;
      var ratio = biz.running ? Math.min(1, biz.progressMs / Economy.cycleMs(st, biz)) : 0;
      var pct = Math.round(ratio * 200);          // шаг 0.5% — глазу хватает
      if (c.last.pct === pct) return;
      c.last.pct = pct;
      c.fill.style.transform = 'scaleX(' + ratio + ')';
    });
  }

  /* Сколько ещё не открытых точек показывать в анонсе под списком. */
  var NEXT_UP_MAX = 4;
  /* При скольких карточках на экране анонс ещё помещается. */
  var NEXT_UP_UNTIL = 5;

  function updateNextUp(st, visibleCards) {
    var show = visibleCards > 0 && visibleCards <= NEXT_UP_UNTIL;
    var names = [];
    if (show) {
      st.businesses.forEach(function (biz) {
        if (names.length >= NEXT_UP_MAX) return;
        if (Economy.isUnlocked(st, biz.id)) return;
        names.push(Economy.getDef(biz.id).icon + ' ' + t('biz.' + biz.id));
      });
    }
    var text = names.join('   ·   ');
    if (lastNextUp === text) return;
    lastNextUp = text;

    if (!text) {
      els.nextUp.hidden = true;
      return;
    }
    els.nextUp.innerHTML = '';
    els.nextUp.appendChild(el('span', 'nextup__title', t('card.nextUp')));
    els.nextUp.appendChild(el('span', 'nextup__list', text));
    els.nextUp.hidden = false;
  }

  var lastNextUp = null;

  function updateBusinessCards() {
    var st = ctx.getState();
    var visibleCards = 0;

    st.businesses.forEach(function (biz) {
      var c = cards[biz.id];
      if (!c) return;
      var def = Economy.getDef(biz.id);
      var unlocked = Economy.isUnlocked(st, biz.id);
      var owned = biz.level > 0;

      /*
       * Ещё не открытые точки не показываем вовсе: на главном экране
       * должно быть видно только то, с чем игрок может что-то сделать
       * (п. 1.10.4). Следующая по очереди точка видна как цель — её
       * уже можно купить.
       */
      if (!unlocked) {
        if (c.last.locked !== true) {
          c.root.hidden = true;
          c.last.locked = true;
        }
        return;
      }
      if (c.last.locked !== false) {
        c.root.hidden = false;
        c.last.locked = false;
      }

      c.root.classList.toggle('is-new', !owned);

      c.root.classList.toggle('is-running', !!biz.running && owned);
      c.root.classList.toggle('is-idle', owned && !biz.running && !biz.hasManager);

      setText(c.level, c.last, 'level', owned ? t('card.level', { n: biz.level }) : '');

      /* текст на полосе: доход за цикл или подсказка «нажми» */
      var barLabel;
      if (!owned) barLabel = t('card.unlock', { cost: F.cash(Economy.levelCost(st, biz, 1)) });
      else if (!biz.hasManager && !biz.running) barLabel = t('card.tapToStart');
      else barLabel = '+' + F.cash(Economy.revenuePerCycle(st, biz));
      setText(c.barText, c.last, 'barText', barLabel);

      /* кнопка покупки уровней */
      var count = owned ? Economy.buyCount(st, biz) : 1;
      var cost = Economy.levelCost(st, biz, count);
      var affordable = st.money >= cost;
      setText(c.buyTitle, c.last, 'buyTitle', owned ? (t('card.buy') + ' ×' + count) : t('card.buy'));
      setText(c.buyCost, c.last, 'buyCost', F.cash(cost));
      if (c.last.buyOk !== affordable) {
        c.last.buyOk = affordable;
        c.buyBtn.classList.toggle('is-off', !affordable);
      }

      /* кнопка менеджера */
      var showMgr = owned && !biz.hasManager;
      if (c.last.showMgr !== showMgr) {
        c.last.showMgr = showMgr;
        c.mgrBtn.hidden = !showMgr;
        c.root.classList.toggle('has-manager', biz.hasManager);
      }
      if (showMgr) {
        var mCost = Economy.managerCost(st, biz.id);
        setText(c.mgrCost, c.last, 'mgrCost', F.cash(mCost));
        var mOk = st.money >= mCost;
        if (c.last.mgrOk !== mOk) {
          c.last.mgrOk = mOk;
          c.mgrBtn.classList.toggle('is-off', !mOk);
        }
      }

      visibleCards++;

      /* значок ускорения на иконке: до какого уровня осталось разогнаться */
      var next = Economy.nextMilestone(biz.level);
      var badge = owned ? (next ? ('⚡' + next) : '⚡max') : '';
      setText(c.badge, c.last, 'badge', badge);
      if (badge) {
        c.badge.title = next ? t('card.nextSpeed', { n: next }) : t('card.speedMax');
      }
      if (owned && def) c.tapBtn.disabled = biz.hasManager;
    });

    updateNextUp(st, visibleCards);
  }

  /* ---------------------------------------------------------------- *
   * HUD
   * ---------------------------------------------------------------- */
  var hudCache = {};

  /* Деньги — каждый кадр, остальное реже: пересчёт множителей не бесплатный. */
  function updateMoney() {
    setText(els.money, hudCache, 'money', F.cash(ctx.getState().money));
  }

  function updateHud() {
    var st = ctx.getState();
    updateMoney();
    setText(els.rate, hudCache, 'rate', t('hud.perSec', { v: F.cash(Economy.incomePerSecond(st)) }));

    var hasStars = st.stars > 0;
    if (hudCache.hasStars !== hasStars) {
      hudCache.hasStars = hasStars;
      els.starsChip.hidden = !hasStars;
    }
    if (hasStars) {
      setText(els.starsValue, hudCache, 'stars', st.stars + ' · ' + F.multiplier(Economy.starMultiplier(st)));
    }
    updateBoostBar(st);
    updateTabDots(st);
  }

  function updateBoostBar(st) {
    var parts = [];
    if (st.boosts.speedRemainMs > 0) {
      parts.push('⚡ ×' + SE.BALANCE.ads.speed.mult + ' · ' + F.timer(st.boosts.speedRemainMs));
    }
    if (st.boosts.discountReady) {
      parts.push('🏷️ −' + F.percent(SE.BALANCE.ads.discount.off));
    }
    var text = parts.join('   ');
    if (hudCache.boost === text) return;
    hudCache.boost = text;
    els.boostBar.textContent = text;
    els.boostBar.hidden = !text;
  }

  function updateTabDots(st) {
    var dots = {
      upgrades: Economy.availableUpgrades(st).some(function (u) { return st.money >= u.cost; }),
      boosts: anyAdReady(st),
      prestige: Economy.canPrestige(st),
      shop: false,
      biz: false
    };
    Array.prototype.forEach.call(els.tabbar.children, function (b) {
      var on = !!dots[b.dataset.tab];
      if (b.dataset.dot === String(on)) return;
      b.dataset.dot = String(on);
      b.classList.toggle('has-dot', on);
    });
  }

  function anyAdReady(st) {
    if (!ctx.actions.adsAvailable()) return false;
    return Economy.adReady(st, 'speed') ||
      (Economy.adReady(st, 'cash') && Economy.incomePerSecond(st) > 0) ||
      Economy.adReady(st, 'discount');
  }

  /* ---------------------------------------------------------------- *
   * Вкладка «Апгрейды»
   * ---------------------------------------------------------------- */
  function renderUpgrades() {
    var st = ctx.getState();
    var list = Economy.availableUpgrades(st);
    var box = els.upList;
    box.innerHTML = '';

    if (!list.length) {
      box.appendChild(emptyNote(t('up.empty')));
    }

    list.forEach(function (u) {
      var row = el('div', 'row');
      row.appendChild(el('span', 'row__icon', u.icon || '⚡'));

      var mid = el('div', 'row__mid');
      var title = u.kind === 'global'
        ? t('up.global', { mult: F.multiplier(u.mult) })
        : t('up.business', { name: t('biz.' + u.business), mult: F.multiplier(u.mult) });
      mid.appendChild(el('div', 'row__title', title));
      mid.appendChild(el('div', 'row__sub', F.cash(u.cost)));
      row.appendChild(mid);

      var btn = el('button', 'btn btn--primary', t('up.buy'));
      btn.type = 'button';
      if (st.money < u.cost) btn.classList.add('is-off');
      btn.addEventListener('click', function () {
        ctx.actions.buyUpgrade(u.id, btn);
        renderUpgrades();
      });
      row.appendChild(btn);
      box.appendChild(row);
    });

    /* что откроется дальше — чтобы была видимая цель */
    Economy.lockedUpgrades(st).forEach(function (u) {
      var row = el('div', 'row is-dim');
      row.appendChild(el('span', 'row__icon', '🔒'));
      var mid = el('div', 'row__mid');
      mid.appendChild(el('div', 'row__title', t('up.business', {
        name: t('biz.' + u.business), mult: F.multiplier(u.mult)
      })));
      mid.appendChild(el('div', 'row__sub', t('up.locked', { n: u.reqLevel, name: t('biz.' + u.business) })));
      row.appendChild(mid);
      row.appendChild(el('span', 'row__tag', t('up.soon')));
      box.appendChild(row);
    });
  }

  function emptyNote(text) {
    return el('p', 'note', text);
  }

  /* ---------------------------------------------------------------- *
   * Вкладка «Бонусы» (rewarded)
   * ---------------------------------------------------------------- */
  function renderAds() {
    var st = ctx.getState();
    var box = els.adsList;
    box.innerHTML = '';
    box.appendChild(emptyNote(t('ads.hint')));

    if (!ctx.actions.adsAvailable()) {
      box.appendChild(emptyNote(t('ads.noAds')));
      return;
    }

    var offers = [
      {
        key: 'speed', icon: SE.BALANCE.ads.speed.icon,
        title: t('ads.speed'), desc: t('ads.speedDesc'),
        active: st.boosts.speedRemainMs > 0 ? st.boosts.speedRemainMs : 0
      },
      {
        key: 'cash', icon: SE.BALANCE.ads.cash.icon,
        title: t('ads.cash'), desc: t('ads.cashDesc', { v: F.cash(Economy.instantCashAmount(st)) }),
        disabled: Economy.incomePerSecond(st) <= 0,
        disabledText: t('ads.needIncome')
      },
      {
        key: 'discount', icon: SE.BALANCE.ads.discount.icon,
        title: t('ads.discount'), desc: t('ads.discountDesc'),
        active: st.boosts.discountReady ? -1 : 0
      }
    ];

    offers.forEach(function (o) {
      var row = el('div', 'row row--offer');
      row.appendChild(el('span', 'row__icon', o.icon));

      var mid = el('div', 'row__mid');
      mid.appendChild(el('div', 'row__title', o.title));
      mid.appendChild(el('div', 'row__sub', o.disabled ? o.disabledText : o.desc));
      row.appendChild(mid);

      var cd = st.cooldowns[o.key] || 0;
      var btn = el('button', 'btn btn--ad');
      btn.type = 'button';

      if (o.active) {
        btn.textContent = o.active === -1 ? '✓' : F.timer(o.active);
        btn.classList.add('is-off');
        btn.disabled = true;
      } else if (cd > 0) {
        btn.textContent = F.timer(cd);
        btn.classList.add('is-off');
        btn.disabled = true;
        btn.dataset.cooldown = o.key;
      } else if (o.disabled) {
        btn.textContent = '🎬';
        btn.classList.add('is-off');
        btn.disabled = true;
      } else {
        /* явно сообщаем, что это реклама и что именно за неё дают (п. 4.5.1) */
        btn.innerHTML = '';
        btn.appendChild(el('span', 'btn__ad', '🎬'));
        btn.appendChild(el('span', 'btn__title', t('ads.watch')));
        btn.addEventListener('click', function () {
          ctx.actions.watchAd(o.key, function () { renderAds(); });
        });
      }
      row.appendChild(btn);
      box.appendChild(row);
    });
  }

  /* Кулдауны тикают — обновляем только цифры на кнопках. */
  function updateAdTimers() {
    var st = ctx.getState();
    var nodes = els.adsList.querySelectorAll('[data-cooldown]');
    var needRebuild = false;
    Array.prototype.forEach.call(nodes, function (btn) {
      var left = st.cooldowns[btn.dataset.cooldown] || 0;
      if (left <= 0) needRebuild = true;
      else btn.textContent = F.timer(left);
    });
    if (needRebuild) renderAds();
  }

  /* ---------------------------------------------------------------- *
   * Вкладка «Престиж»
   * ---------------------------------------------------------------- */
  function renderPrestige() {
    var st = ctx.getState();
    var box = els.prestigeBox;
    box.innerHTML = '';

    var head = el('div', 'panel');
    head.appendChild(el('h2', 'panel__title', '⭐ ' + t('prestige.title')));
    head.appendChild(el('p', 'panel__text', t('prestige.desc')));
    box.appendChild(head);

    var can = Economy.canPrestige(st);
    var gain = Economy.pendingStars(st);
    var progress = Economy.prestigeProgress(st);

    var stats = el('div', 'panel');
    stats.appendChild(statRow(t('prestige.multNow'), F.multiplier(Economy.starMultiplier(st))));
    stats.appendChild(statRow(t('prestige.starsTotal'), String(st.stars)));
    if (st.prestiges > 0) stats.appendChild(statRow(t('prestige.soldTotal'), String(st.prestiges)));
    box.appendChild(stats);

    var bar = el('div', 'progress');
    var pf = el('div', 'progress__fill');
    pf.style.transform = 'scaleX(' + progress.ratio + ')';
    bar.appendChild(pf);
    bar.appendChild(el('span', 'progress__text',
      can ? t('prestige.ready')
          : t('prestige.locked', { v: F.cash(Math.max(0, progress.need - progress.have)) })));
    box.appendChild(bar);

    /* Цель видна всегда: сколько звёзд и какой множитель будет. */
    var preview = can ? gain : Economy.requiredStars(st);
    var goals = el('div', 'panel');
    goals.appendChild(statRow(t('prestige.gain', { n: preview }), ''));
    goals.appendChild(statRow(t('prestige.multAfter'), F.multiplier(multiplierForStars(st.stars + preview))));
    box.appendChild(goals);

    if (can) {
      /* бонус за рекламу — до подтверждения престижа */
      if (ctx.actions.adsAvailable()) {
        var adBtn = el('button', 'btn btn--ad btn--wide');
        adBtn.type = 'button';
        if (st.boosts.prestigeBonus > 0) {
          adBtn.textContent = '✓ ' + t('prestige.adBonusActive');
          adBtn.classList.add('is-off');
          adBtn.disabled = true;
        } else {
          adBtn.appendChild(el('span', 'btn__ad', '🎬'));
          adBtn.appendChild(el('span', 'btn__title', t('prestige.adBonus')));
          adBtn.addEventListener('click', function () {
            ctx.actions.watchAd('prestige', function () { renderPrestige(); });
          });
        }
        box.appendChild(adBtn);
      }

      var go = el('button', 'btn btn--danger btn--wide', t('prestige.button'));
      go.type = 'button';
      go.addEventListener('click', confirmPrestige);
      box.appendChild(go);
    }
  }

  /* Множитель от звёзд по той же формуле, что и в экономике. */
  function multiplierForStars(stars) {
    if (stars <= 0) return 1;
    var p = SE.BALANCE.prestige;
    var e = p.starExponent;
    return 1 + ((e && e !== 1) ? Math.pow(stars, e) : stars) * p.bonusPerStar;
  }

  /* ---------------------------------------------------------------- *
   * Вкладка «Рейтинг» — таблица лидеров по суммарной выручке
   *
   * ПОЧЕМУ ЭТО ОТДЕЛЬНАЯ ВКЛАДКА И ПОЧЕМУ ОНА РИСУЕТСЯ ВСЕГДА.
   *
   * Раньше таблица жила внизу вкладки «Престиж» и появлялась только
   * тогда, когда платформа вернула хотя бы одну строку. Совпали два
   * условия — и таблицы не видел никто: до первой продажи сети в ней
   * пусто, а свежезаведённая в Консоли таблица пуста по определению.
   * Модерация справедливо написала, что таблицы лидеров в игре нет
   * (п. 8.2.2: тексты обязаны отражать реальную механику).
   *
   * Теперь иначе. Вкладка есть в нижней панели с первой секунды, а
   * панель внутри рисуется при любом ответе платформы: свой результат
   * игра знает сама и показывает его всегда, а список сверху появляется
   * ровно настолько, насколько его отдаёт SDK. Пусто, гость, нет связи,
   * таблица ещё не заведена — экран всё равно осмысленный, и обещание
   * из карточки игры выполняется.
   * ---------------------------------------------------------------- */
  var lbCache = { at: 0, rows: null, pending: false, loaded: false };
  var lbMineValue = null;      // ячейка со своим результатом — её обновляем точечно

  function renderLb() {
    var box = els.lbBox;
    if (!box) return;
    box.innerHTML = '';
    lbMineValue = null;

    var st = ctx.getState();
    var now = Date.now();

    /* Подтягиваем список не чаще раза в минуту: чаще платформа и не даёт. */
    if (!lbCache.pending && (now - lbCache.at > 60000)) {
      lbCache.pending = true;
      ctx.actions.loadLeaderboard().then(function (rows) {
        lbCache = { at: Date.now(), rows: rows, pending: false, loaded: true };
        if (currentTab === 'lb') renderLb();
      });
    }

    var panel = el('div', 'panel');
    panel.appendChild(el('h2', 'panel__title', '🏆 ' + t('lb.title')));
    panel.appendChild(el('p', 'panel__text', t('lb.note')));

    var rows = lbCache.rows;

    if (rows && rows.length) {
      rows.forEach(function (r) {
        var row = el('div', 'statrow' + (r.isUser ? ' statrow--me' : ''));
        row.appendChild(el('span', 'statrow__label', r.rank + '. ' + (r.name || t('lb.player'))));
        row.appendChild(el('span', 'statrow__value', F.cash(r.score)));
        panel.appendChild(row);
      });
    } else if (!lbCache.loaded) {
      panel.appendChild(el('p', 'note', t('lb.loading')));
    } else if (rows) {
      panel.appendChild(el('p', 'note', t('lb.empty')));
    } else {
      /* SDK не отдал список: офлайн-запуск, гостевой режим или таблица
         ещё не заведена в Консоли. Свой результат это не отменяет. */
      panel.appendChild(el('p', 'note', t('lb.offline')));
    }
    box.appendChild(panel);

    /*
     * Свой результат — отдельной панелью и всегда. Это та же величина,
     * которая уходит в таблицу (суммарная выручка за всё время), поэтому
     * игрок видит, с чем именно он сравнивается.
     */
    var mine = el('div', 'panel');
    mine.appendChild(el('h3', 'panel__title', t('lb.mine')));
    var mineRow = statRow(t('lb.mineTotal'), F.cash(st.lifetimeEarned || 0));
    lbMineValue = mineRow.lastChild;
    mine.appendChild(mineRow);
    mine.appendChild(statRow(t('lb.mineSold'), String(st.prestiges || 0)));
    box.appendChild(mine);

    /*
     * Предложение войти показываем только гостю и только как кнопку,
     * рядом — что именно даёт аккаунт (п. 1.2.1). Отказаться можно
     * просто не нажимая: игра от этого никак не ограничена.
     */
    if (ctx.actions.isGuest()) {
      var auth = el('div', 'panel');
      auth.appendChild(el('p', 'note', t('lb.authWhy')));
      var btn = el('button', 'btn btn--primary btn--wide', t('lb.authBtn'));
      btn.type = 'button';
      btn.addEventListener('click', function () {
        ctx.actions.requestAuth(function () {
          lbCache = { at: 0, rows: null, pending: false, loaded: false };
          renderLb();
        });
      });
      auth.appendChild(btn);
      box.appendChild(auth);
    }
  }

  function statRow(label, value) {
    var r = el('div', 'statrow');
    r.appendChild(el('span', 'statrow__label', label));
    if (value) r.appendChild(el('span', 'statrow__value', value));
    return r;
  }

  function confirmPrestige() {
    var st = ctx.getState();
    showModal({
      title: t('prestige.title'),
      body: [
        el('p', 'modal__text', t('prestige.confirm')),
        el('p', 'modal__big', '⭐ ' + Economy.pendingStars(st))
      ],
      buttons: [
        { text: t('prestige.cancel'), cls: 'btn--ghost', action: closeModal },
        {
          text: t('prestige.confirmYes'), cls: 'btn--danger', action: function () {
            closeModal();
            ctx.actions.doPrestige();
          }
        }
      ]
    });
  }

  /* ---------------------------------------------------------------- *
   * Вкладка «Магазин»
   * ---------------------------------------------------------------- */
  function renderShop() {
    var box = els.shopList;
    box.innerHTML = '';
    var st = ctx.getState();
    var products = ctx.actions.shopProducts();

    if (!products.length) {
      box.appendChild(emptyNote(t('shop.unavailable')));
      return;
    }

    products.forEach(function (p) {
      var row = el('div', 'row');
      row.appendChild(el('span', 'row__icon', p.icon));

      var mid = el('div', 'row__mid');
      mid.appendChild(el('div', 'row__title', t(p.titleKey)));
      mid.appendChild(el('div', 'row__sub', t(p.descKey)));
      row.appendChild(mid);

      if (p.owned) {
        row.appendChild(el('span', 'row__tag', t('shop.owned')));
      } else {
        var btn = el('button', 'btn btn--primary btn--price');
        btn.type = 'button';
        /* стоимость цифрами + иконка портальной валюты из SDK
           (п. 1.13.2 и 1.13.4) */
        if (p.priceValue) {
          btn.appendChild(el('span', 'btn__title', p.priceValue));
          if (p.currencyImage) {
            var img = doc.createElement('img');
            img.className = 'btn__currency';
            img.src = p.currencyImage;
            img.alt = '';
            btn.appendChild(img);
          }
        } else {
          btn.appendChild(el('span', 'btn__title', p.priceLabel));
        }
        btn.addEventListener('click', function () { ctx.actions.purchase(p.id, btn); });
        row.appendChild(btn);
      }
      box.appendChild(row);
    });

    var restore = el('button', 'btn btn--ghost btn--wide', t('shop.restore'));
    restore.type = 'button';
    restore.addEventListener('click', function () { ctx.actions.restorePurchases(); });
    box.appendChild(restore);
  }

  /* ---------------------------------------------------------------- *
   * Модалки
   * ---------------------------------------------------------------- */
  function showModal(cfg) {
    var box = els.modalBox;
    box.innerHTML = '';

    if (cfg.title) box.appendChild(el('h2', 'modal__title', cfg.title));
    (cfg.body || []).forEach(function (node) {
      box.appendChild(typeof node === 'string' ? el('p', 'modal__text', node) : node);
    });

    var row = el('div', 'modal__buttons');
    (cfg.buttons || []).forEach(function (b) {
      var btn = el('button', 'btn ' + (b.cls || 'btn--primary'));
      btn.type = 'button';
      if (b.icon) btn.appendChild(el('span', 'btn__ad', b.icon));
      btn.appendChild(el('span', 'btn__title', b.text));
      btn.addEventListener('click', function () { b.action(btn); });
      row.appendChild(btn);
    });
    box.appendChild(row);

    els.modal.hidden = false;
    els.modal.classList.add('is-open');
    modalStack.push(cfg);
    if (cfg.onOpen) cfg.onOpen(box);
    return box;
  }

  function closeModal() {
    modalStack.pop();
    els.modal.classList.remove('is-open');
    els.modal.hidden = true;
    els.modalBox.innerHTML = '';
  }

  function isModalOpen() { return !els.modal.hidden; }

  /* ---------------------------------------------------------------- *
   * Настройки
   * ---------------------------------------------------------------- */
  function openSettings() {
    var st = ctx.getState();
    var body = [];

    var soundRow = toggleRow(t('set.sound'), !SE.Sound.isMuted(), function (btn) {
      ctx.actions.toggleSound();
      btn.textContent = SE.Sound.isMuted() ? t('set.off') : t('set.on');
      btn.classList.toggle('is-off', SE.Sound.isMuted());
      refreshSoundButton();
    });
    body.push(soundRow);

    var langRow = el('div', 'statrow');
    langRow.appendChild(el('span', 'statrow__label', t('set.lang')));
    var langBox = el('div', 'segmented');
    [['ru', 'RU'], ['tr', 'TR'], ['en', 'EN']].forEach(function (pair) {
      var b = el('button', 'segmented__btn', pair[1]);
      b.type = 'button';
      if (SE.I18N.getLang() === pair[0]) b.classList.add('is-active');
      b.addEventListener('click', function () {
        ctx.actions.setLang(pair[0]);
        closeModal();
        openSettings();
      });
      langBox.appendChild(b);
    });
    langRow.appendChild(langBox);
    body.push(langRow);

    body.push(el('h3', 'modal__sub', t('set.stats')));
    body.push(statRow(t('set.statTotal'), F.cash(st.lifetimeEarned)));
    body.push(statRow(t('set.statTaps'), String(st.taps)));
    body.push(statRow(t('set.statTime'), F.duration(st.playedMs)));

    body.push(el('h3', 'modal__sub', t('set.howto')));
    body.push(el('p', 'modal__text', t('set.howtoBody')));

    showModal({
      title: t('set.title'),
      body: body,
      buttons: [
        { text: t('set.pause'), cls: 'btn--ghost', action: function () { closeModal(); ctx.actions.pause(); } },
        { text: t('set.close'), cls: 'btn--primary', action: closeModal }
      ]
    });
  }

  function toggleRow(label, on, onClick) {
    var r = el('div', 'statrow');
    r.appendChild(el('span', 'statrow__label', label));
    var btn = el('button', 'btn btn--small', on ? t('set.on') : t('set.off'));
    btn.type = 'button';
    if (!on) btn.classList.add('is-off');
    btn.addEventListener('click', function () { onClick(btn); });
    r.appendChild(btn);
    return r;
  }

  function openPause(onResume) {
    showModal({
      title: '⏸ ' + t('pause.title'),
      body: [t('pause.body')],
      buttons: [{
        text: t('set.resume'), cls: 'btn--primary', action: function () {
          closeModal();
          onResume();
        }
      }]
    });
  }

  /* ---------------------------------------------------------------- *
   * Эффекты
   * ---------------------------------------------------------------- */
  var floatCount = 0;

  function floatText(anchor, text, cls) {
    if (floatCount > 12) return;          // не засоряем экран
    /* карточка на скрытой вкладке даёт нулевой rect — цифра улетела бы в угол */
    if (anchor && anchor.offsetParent === null) return;
    var rect = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null;
    var n = el('div', 'float ' + (cls || ''), text);
    if (rect) {
      n.style.left = (rect.left + rect.width / 2) + 'px';
      n.style.top = (rect.top + rect.height / 4) + 'px';
    } else {
      n.style.left = '50%';
      n.style.top = '30%';
    }
    els.fx.appendChild(n);
    floatCount++;
    root.setTimeout(function () {
      if (n.parentNode) n.parentNode.removeChild(n);
      floatCount--;
    }, 900);
  }

  function pulse(node) {
    if (!node) return;
    node.classList.remove('pulse');
    /* перезапуск анимации */
    void node.offsetWidth;
    node.classList.add('pulse');
  }

  function toast(text) {
    var n = el('div', 'toast', text);
    els.fx.appendChild(n);
    root.setTimeout(function () {
      n.classList.add('is-out');
      root.setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 300);
    }, 2200);
  }

  function hideLoader() {
    if (!els.loader) return;
    els.loader.classList.add('is-hidden');
    root.setTimeout(function () { if (els.loader) els.loader.hidden = true; }, 400);
  }

  /* ---------------------------------------------------------------- *
   * Общий цикл рендера
   * ---------------------------------------------------------------- */
  function renderTabContent(force) {
    if (currentTab === 'upgrades') renderUpgrades();
    else if (currentTab === 'boosts') renderAds();
    else if (currentTab === 'prestige') renderPrestige();
    else if (currentTab === 'lb') renderLb();
    else if (currentTab === 'shop') renderShop();
    if (force) lastFullRefresh = 0;
  }

  var lastValues = 0;

  function render(nowMs) {
    /* непрерывное — каждый кадр */
    updateMoney();
    if (currentTab === 'biz') updateBusinessProgress();

    /* пересчёт цен и множителей — 4 раза в секунду */
    if (nowMs - lastValues >= 250) {
      lastValues = nowMs;
      updateHud();
      if (currentTab === 'biz') updateBusinessCards();
    }

    /* списки на других вкладках — раз в секунду: цены и кулдауны */
    if (currentTab !== 'biz' && nowMs - lastFullRefresh > 1000) {
      lastFullRefresh = nowMs;
      if (currentTab === 'boosts') updateAdTimers();
      else if (currentTab === 'upgrades') renderUpgrades();
      else if (currentTab === 'prestige') renderPrestige();
      /*
       * Рейтинг целиком не пересобираем: на нём есть кнопка входа, а
       * пересборка DOM под пальцем съедает нажатие. Обновляем только
       * свой результат — единственное, что здесь меняется само.
       */
      else if (currentTab === 'lb' && lbMineValue) {
        lbMineValue.textContent = F.cash(ctx.getState().lifetimeEarned || 0);
      }
    }
  }

  /* Полная пересборка: смена языка или престиж. */
  function rebuild() {
    applyStaticTexts();
    buildTabbar();
    buildBuyMode();
    buildBusinessCards();
    hudCache = {};
    Object.keys(cards).forEach(function (k) { cards[k].last = {}; });
    setTab(currentTab);
  }

  SE.UI = {
    init: init,
    render: render,
    rebuild: rebuild,
    setTab: setTab,
    setShopVisible: setShopVisible,
    refreshBuyMode: refreshBuyMode,
    renderTabContent: renderTabContent,
    showModal: showModal,
    closeModal: closeModal,
    isModalOpen: isModalOpen,
    openPause: openPause,
    floatText: floatText,
    pulse: pulse,
    toast: toast,
    hideLoader: hideLoader,
    cardOf: function (id) { return cards[id]; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
