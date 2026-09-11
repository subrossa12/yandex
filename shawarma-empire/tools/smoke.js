/*
 * smoke.js — прогон игры в реальном Chromium.
 *   node tools/smoke.js [--shots]
 *
 * Проверяет то, что требует модерация Яндекса:
 *  - ноль ошибок и предупреждений в консоли
 *  - нет горизонтального скролла страницы ни на одном размере окна
 *  - ничего не вылезает за пределы экрана
 *  - тап/покупка/менеджер/вкладки реально работают
 *  - прогресс переживает перезагрузку страницы
 */
'use strict';

const path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const GAME = 'file://' + path.join(__dirname, '..', 'game', 'index.html');
const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = path.join(__dirname, '..', 'docs', 'shots');

const SIZES = [
  { name: 'phone-portrait', width: 390, height: 844 },
  { name: 'phone-small', width: 320, height: 568 },
  { name: 'phone-landscape', width: 844, height: 390 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'desktop-tall', width: 900, height: 1400 },
  { name: 'desktop-narrow', width: 760, height: 1000 },
  { name: 'desktop-wide', width: 1920, height: 1080 }
];

const problems = [];
function fail(msg) { problems.push(msg); console.log('  ✗ ' + msg); }
function ok(msg) { console.log('  ✓ ' + msg); }

async function makePage(browser, size) {
  /*
   * Телефонные размеры эмулируем с тачем: иначе Chromium репортит
   * pointer: fine, срабатывают десктопные правила вёрстки и мы меряем
   * совсем не то, что увидит игрок на телефоне.
   */
  const page = await browser.newPage({
    viewport: { width: size.width, height: size.height },
    hasTouch: /^phone/.test(size.name),
    isMobile: /^phone/.test(size.name)
  });
  const errors = [];
  /* Локально нет только /sdk.js — на платформе он есть, это ожидаемо.
     Фильтруем по URL из location(), в тексте сообщения адреса нет. */
  const expected = (url) => /\/sdk\.js$/.test(url || '');

  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    const loc = m.location() || {};
    if (expected(loc.url)) return;
    errors.push(`[${m.type()}] ${m.text()} @ ${loc.url || '?'}`);
  });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  page.on('requestfailed', (r) => {
    if (!expected(r.url())) errors.push('[requestfailed] ' + r.url());
  });
  return { page, errors };
}

/* Ищем элементы, вылезающие за пределы окна. */
async function checkOverflow(page, size) {
  return page.evaluate((vw) => {
    const bad = [];
    const scrollX = document.documentElement.scrollWidth > document.documentElement.clientWidth;
    document.querySelectorAll('.card, .row, .btn, .tabbtn, .hud, .buymode, .modal__box').forEach((n) => {
      if (n.offsetParent === null) return;
      const r = n.getBoundingClientRect();
      if (r.width === 0) return;
      if (r.left < -1 || r.right > vw + 1) {
        bad.push(`${n.className.split(' ')[0]} (${Math.round(r.left)}..${Math.round(r.right)})`);
      }
    });
    return { scrollX, bad: bad.slice(0, 5) };
  }, size.width);
}

/*
 * Сейв «на 45-й минуте»: 7 точек, менеджеры, апгрейды, один престиж.
 * Заодно проверяет Economy.migrate на реальной структуре.
 */
function richSave(ageMs, allOpen) {
  const now = Date.now() - (ageMs || 0);
  const lv = allOpen
    ? { stall: 210, cafe: 120, bakery: 105, pizzeria: 96, sushi: 84, burger: 71, restaurant: 58, foodcourt: 44, network: 27 }
    : { stall: 128, cafe: 74, bakery: 63, pizzeria: 51, sushi: 38, burger: 22, restaurant: 7 };
  const ids = ['stall', 'cafe', 'bakery', 'pizzeria', 'sushi', 'burger', 'restaurant', 'foodcourt', 'network'];
  return {
    v: 1,
    money: 5.2e6,
    /* 15 звёзд «стоят» 1e11 заработка, к 4.2e11 накапливается ещё 15 —
       ровно порог престижа, иначе фикстура противоречит формуле */
    runEarned: 3.2e11,
    lifetimeEarned: 4.2e11,
    stars: 15,
    starsBase: 15,
    prestiges: 1,
    businesses: ids.map((id) => ({
      id,
      level: lv[id] || 0,
      hasManager: allOpen || ['stall', 'cafe', 'bakery', 'pizzeria', 'sushi'].indexOf(id) >= 0,
      progressMs: 0,
      running: true,
      upgrades: (lv[id] || 0) >= 50
        ? { [id + '_u1']: true, [id + '_u2']: true }
        : ((lv[id] || 0) >= 20 ? { [id + '_u1']: true } : {})
    })),
    globalUpgrades: { g1: true, g2: true },
    boosts: { speedRemainMs: 0, discountReady: false, prestigeBonus: 0 },
    cooldowns: { speed: 0, cash: 0, discount: 0 },
    purchases: { noAds: false, permaX2: false, offlineExtended: false, starterPack: false },
    buyMode: 10,
    playedMs: 45 * 60 * 1000,
    taps: 260,
    flags: { sessions: 3 },
    stateTime: now,
    savedAt: now
  };
}

/*
 * Сейв нужно записать ДО того, как отработают скрипты страницы: при обычном
 * reload игра успевает сохраниться по pagehide и затирает подсунутое.
 */
async function openWithSave(browser, save, size) {
  const { page, errors } = await makePage(browser, size || SIZES[0]);
  await page.addInitScript((s) => {
    try { localStorage.setItem('shawarma_empire_save_v1', JSON.stringify(s)); } catch (e) { /* ignore */ }
  }, save);
  await page.goto(GAME);
  await page.waitForSelector('#loader[hidden]', { state: 'attached', timeout: 8000 });
  return { page, errors };
}

async function richStateChecks(browser) {
  /* 4a. развитая сеть без офлайна */
  const { page, errors } = await openWithSave(browser, richSave(0));
  await page.waitForTimeout(600);

  const stars = await page.locator('#starsChip').isVisible();
  if (!stars) fail('чип звёзд не показан при stars > 0');
  else ok('звёзды и множитель показаны: ' + (await page.locator('#starsValue').textContent()).trim());

  const rate = (await page.locator('#rate').textContent()).trim();
  if (/^0 ₽/.test(rate)) fail('доход в секунду нулевой при пяти менеджерах');
  else ok('доход идёт сам: ' + rate);

  if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'rich-biz.png') });

  for (const tab of ['upgrades', 'boosts', 'prestige']) {
    await page.locator(`.tabbtn[data-tab="${tab}"]`).click();
    await page.waitForTimeout(400);
    const rows = await page.locator(`#tab-${tab} .row, #tab-${tab} .panel`).count();
    if (!rows) fail(`вкладка ${tab} пустая на развитом сейве`);
    if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'rich-' + tab + '.png') });
  }
  ok('вкладки апгрейдов, бонусов и престижа наполнены');

  if (errors.length) errors.slice(0, 5).forEach((e) => fail('консоль: ' + e));
  await page.close();

  /* 4b. возврат после полутора часов отсутствия */
  const { page: off, errors: offErr } = await openWithSave(browser, richSave(90 * 60 * 1000));
  await off.waitForTimeout(700);

  const modalVisible = await off.locator('#modal').isVisible();
  if (!modalVisible) {
    fail('экран офлайн-дохода не показался после 90 минут отсутствия');
  } else {
    const title = (await off.locator('.modal__title').textContent()).trim();
    const amount = (await off.locator('.modal__big').textContent()).trim();
    ok(`офлайн-экран: «${title}» ${amount}`);
    const adBtn = off.locator('.modal__buttons .btn--ad');
    if (!(await adBtn.count())) fail('нет кнопки «Забрать ×2» с пометкой рекламы');
    else ok('кнопка ×2 за рекламу на месте');
    if (SHOTS) await off.screenshot({ path: path.join(SHOT_DIR, 'offline.png') });

    /* клик мимо окна не должен съесть награду */
    await off.locator('#modal').click({ position: { x: 5, y: 5 } });
    await off.waitForTimeout(200);
    if (!(await off.locator('#modal').isVisible())) {
      fail('окно офлайн-дохода закрылось кликом мимо — награда потеряна');
    } else {
      ok('окно офлайн-дохода не закрывается кликом мимо');
    }

    const moneyBefore = (await off.locator('#money').textContent()).trim();
    await off.locator('.modal__buttons .btn').last().click();
    await off.waitForTimeout(300);
    const moneyAfter = (await off.locator('#money').textContent()).trim();
    if (moneyBefore === moneyAfter) fail('офлайн-доход не зачислен по кнопке «Забрать»');
    else ok(`офлайн-доход зачислен: ${moneyBefore} → ${moneyAfter}`);
    if (await off.locator('#modal').isVisible()) fail('окно офлайна не закрылось');
  }

  /* 4c. престиж доступен и выполняется */
  await off.locator('.tabbtn[data-tab="prestige"]').click();
  await off.waitForTimeout(400);
  const prestigeBtn = off.locator('#prestigeBox .btn--danger');
  if (!(await prestigeBtn.count())) {
    fail('престиж недоступен при 4.2e11 заработка (ожидался доступным)');
  } else {
    await prestigeBtn.click();
    await off.waitForTimeout(250);
    await off.locator('.modal__buttons .btn--danger').click();
    await off.waitForTimeout(600);
    const after = (await off.locator('#starsValue').textContent()).trim();
    const lvl = (await off.locator('.card').first().locator('.card__level').textContent()).trim();
    if (!/1$/.test(lvl)) fail('после престижа точки не сбросились: ' + lvl);
    else ok('престиж выполнен, сеть сброшена, звёзд стало ' + after);
    if (SHOTS) await off.screenshot({ path: path.join(SHOT_DIR, 'after-prestige.png') });
  }

  if (offErr.length) offErr.slice(0, 5).forEach((e) => fail('консоль: ' + e));
  else ok('в консоли чисто');

  await off.close();
}

/*
 * п. 1.10.4: основной игровой экран не требует прокрутки — все нужные
 * элементы видны сразу. Худший случай: открыты все девять точек.
 */
async function noScrollChecks(browser) {
  const sizes = [
    { name: 'phone-portrait', width: 390, height: 844 },
    { name: 'phone-tall', width: 412, height: 915 },
    { name: 'phone-compact', width: 360, height: 740 }
  ];

  for (const size of sizes) {
    const { page, errors } = await openWithSave(browser, richSave(0, true), size);
    await page.waitForTimeout(700);

    const res = await page.evaluate(() => {
      const screen = document.getElementById('tab-biz');
      const list = document.getElementById('bizList');
      const visible = Array.prototype.filter.call(
        document.querySelectorAll('.card'), (c) => c.offsetParent !== null
      ).length;
      return {
        visible,
        needsScroll: screen.scrollHeight > screen.clientHeight + 1,
        overflow: list.scrollHeight - screen.clientHeight
      };
    });

    if (res.visible !== 9) {
      fail(`${size.name}: показано ${res.visible} точек из 9`);
    } else if (res.needsScroll) {
      fail(`${size.name}: главный экран требует прокрутки (не влезает ${res.overflow}px)`);
    } else {
      ok(`${size.name}: все 9 точек видны без прокрутки`);
    }

    if (errors.length) errors.slice(0, 3).forEach((e) => fail(`${size.name} консоль: ${e}`));
    if (SHOTS && size.name === 'phone-portrait') {
      await page.screenshot({ path: path.join(SHOT_DIR, 'all-open.png') });
    }
    await page.close();
  }

  /* в начале игры видны только открытая точка и следующая как цель */
  const { page: fresh } = await makePage(browser, sizes[0]);
  await fresh.addInitScript(() => { try { localStorage.clear(); } catch (e) { /* ignore */ } });
  await fresh.goto(GAME);
  await fresh.waitForSelector('#loader[hidden]', { state: 'attached', timeout: 8000 });
  await fresh.waitForTimeout(500);
  const startCards = await fresh.locator('.card:visible').count();
  if (startCards !== 2) fail(`в начале игры видно ${startCards} карточек, ожидалось 2`);
  else ok('в начале игры видны только ларёк и следующая точка');

  /* свободное место занимает анонс — экран не выглядит пустым (п. 1.15) */
  if (!(await fresh.locator('#nextUp').isVisible())) {
    fail('анонс следующих точек не показан при двух открытых');
  } else {
    const names = (await fresh.locator('.nextup__list').textContent()).trim();
    ok('свободное место занял анонс: ' + names);
  }
  await fresh.close();
}

/*
 * Заглушка SDK. Нужна ровно для двух вещей: проверить, что удалённая
 * конфигурация реально перекрывает дефолты, и что язык приезжает с
 * платформы. Всё остальное отвечает «не умею» — платформенные функции
 * не обязаны быть доступны, и игра обязана это переживать.
 */
function fakeSdk() {
  return function (cfg) {
    window.YaGames = {
      init: () => Promise.resolve({
        environment: { i18n: { lang: cfg.lang } },
        getFlags: () => Promise.resolve(cfg.flags),
        getPlayer: () => Promise.reject(new Error('guest')),
        getPayments: () => Promise.reject(new Error('no payments')),
        features: {
          LoadingAPI: { ready() {} },
          GameplayAPI: { start() {}, stop() {} }
        },
        adv: { showRewardedVideo() {}, showFullscreenAdv() {} },
        serverTime: () => Date.now(),
        isAvailableMethod: () => Promise.resolve(false),
        on() {}
      })
    };
  };
}

/*
 * п. «игра работает при недоступной удалённой конфигурации» + слой флагов.
 */
async function flagChecks(browser) {
  const flags = {
    'prestige.factor': '300',          // валидное число — должно примениться
    'offline.capMs': '10800000',       // три часа вместо двух
    'prestige.divisor': 'не-число',    // мусор — должен быть отброшен
    'biz.stall.costGrowth': '-5',      // бессмыслица — тоже отброшена
    'unknown.key': '42'                // чужой ключ — игнорируется
  };

  const { page, errors } = await makePage(browser, SIZES[0]);
  await page.addInitScript(fakeSdk(), { flags: flags, lang: 'tr' });
  await page.goto(GAME);
  await page.waitForSelector('#loader[hidden]', { state: 'attached', timeout: 8000 });
  await page.waitForTimeout(400);

  const res = await page.evaluate(() => ({
    factor: SE.BALANCE.prestige.factor,
    divisor: SE.BALANCE.prestige.divisor,
    cap: SE.BALANCE.offline.capMs,
    growth: SE.BALANCE.businesses[0].costGrowth,
    report: SE.Config.report(),
    /* ядро обязано увидеть новое значение, а не только объект баланса */
    starsAt1e13: SE.Economy.totalStarsFor(1e13)
  }));

  if (res.factor !== 300) fail('флаг prestige.factor не применился: ' + res.factor);
  else if (res.cap !== 10800000) fail('флаг offline.capMs не применился: ' + res.cap);
  else ok(`флаги перекрыли дефолты: factor ${res.factor}, офлайн-кап ${res.cap / 3600000} ч`);

  if (res.divisor !== 1e13) fail('мусорный флаг перезаписал дефолт: divisor = ' + res.divisor);
  else if (res.growth !== 1.07) fail('бессмысленный флаг перезаписал дефолт: costGrowth = ' + res.growth);
  else ok('мусорные и бессмысленные значения отброшены, дефолты уцелели');

  if (res.starsAt1e13 !== 300) fail('ядро считает по старому балансу: ' + res.starsAt1e13);
  else ok('экономика пересчиталась под новые флаги');

  if (res.report.source !== 'remote') fail('слой флагов не считает конфигурацию удалённой');
  else ok(`слой флагов: ${res.report.keys} ключей, применено ${res.report.applied.length}`);

  const trTab = (await page.locator('.tabbtn[data-tab="biz"] .tabbtn__label').textContent()).trim();
  if (trTab !== 'Noktalar') fail('турецкая локализация не включилась из SDK: ' + trTab);
  else ok('язык берётся из SDK: интерфейс турецкий');

  if (errors.length) errors.slice(0, 5).forEach((e) => fail('консоль: ' + e));
  await page.close();

  /* Отдельно: SDK есть, а флаги не приезжают вовсе — игра обязана
     подняться на дефолтах и не ждать сеть. */
  const { page: broken, errors: brokenErr } = await makePage(browser, SIZES[0]);
  await broken.addInitScript(() => {
    window.YaGames = {
      init: () => Promise.resolve({
        environment: { i18n: { lang: 'ru' } },
        /* самый неприятный случай: промис, который никогда не решится */
        getFlags: () => new Promise(() => {}),
        getPlayer: () => Promise.reject(new Error('guest')),
        getPayments: () => Promise.reject(new Error('no payments')),
        features: { LoadingAPI: { ready() {} }, GameplayAPI: { start() {}, stop() {} } },
        adv: { showRewardedVideo() {}, showFullscreenAdv() {} },
        serverTime: () => Date.now(),
        isAvailableMethod: () => Promise.resolve(false),
        on() {}
      })
    };
  });
  await broken.goto(GAME);
  await broken.waitForSelector('#loader[hidden]', { state: 'attached', timeout: 9000 })
    .catch(() => fail('игра не запустилась, пока висел запрос флагов'));
  const fallback = await broken.evaluate(() => SE.BALANCE.prestige.factor);
  if (fallback !== 150) fail('после отвала флагов баланс не тот: ' + fallback);
  else ok('зависший запрос флагов не мешает игре: работаем на дефолтах');
  if (brokenErr.length) brokenErr.slice(0, 3).forEach((e) => fail('консоль: ' + e));
  await broken.close();
}

/*
 * Цели Метрики. Счётчик в билде не задан, поэтому наружу ничего не
 * уходит — проверяем журнал: цели обязаны сниматься даже тогда, когда
 * счётчик выключен, иначе включение номера ничего не даст.
 */
async function metricaChecks(browser) {
  const { page, errors } = await makePage(browser, SIZES[0]);
  await page.addInitScript(() => { try { localStorage.clear(); } catch (e) { /* ignore */ } });
  await page.goto(GAME);
  await page.waitForSelector('#loader[hidden]', { state: 'attached', timeout: 8000 });

  const active = await page.evaluate(() => SE.Metrica.active);
  if (active) fail('счётчик Метрики активен, хотя номер в билде пустой');
  else ok('без номера счётчика Метрика не грузится и наружу не ходит');

  await page.locator('.tabbtn[data-tab="boosts"]').click();
  await page.waitForTimeout(200);
  const adBtn = page.locator('#adsList .btn--ad').first();
  if (await adBtn.count()) {
    await adBtn.click();
    await page.waitForTimeout(300);
  }

  const goals = await page.evaluate(() => SE.Metrica.journal().map((g) => g.name));

  const shown = goals.filter((g) => /^rv_shown_/.test(g));
  const rewarded = goals.filter((g) => /^rv_rewarded_/.test(g));
  if (!shown.length) fail('цель rv_shown_* не снялась при показе rewarded');
  else if (!rewarded.length) fail('цель rv_rewarded_* не снялась при выданной награде');
  else ok(`цели рекламы снимаются: ${shown[0]} → ${rewarded[0]}`);

  if (errors.length) errors.slice(0, 3).forEach((e) => fail('консоль: ' + e));
  await page.close();
}

/*
 * Таблица лидеров (п. 8.2.2).
 *
 * Модерация отклонила игру именно здесь: в карточке таблица обещана, а
 * найти её в игре было нельзя. Причин было две — таблица лежала внизу
 * вкладки «Престиж» и рисовалась только тогда, когда платформа вернула
 * хотя бы одну строку. Оба состояния, при которых её не видел никто
 * (пустая таблица и вовсе недоступная), проверяются здесь отдельно.
 */
async function leaderboardChecks(browser) {
  /* --- 1. Локальный запуск: SDK нет вообще --- */
  const { page, errors } = await makePage(browser, SIZES[0]);
  await page.goto(GAME);
  await page.waitForSelector('#loader[hidden]', { state: 'attached', timeout: 8000 });

  const tabBtn = page.locator('.tabbtn[data-tab="lb"]');
  if (!(await tabBtn.isVisible())) {
    fail('вкладки с таблицей лидеров нет в нижней панели');
  } else {
    ok('вкладка «Рейтинг» видна с первой секунды');
  }

  await tabBtn.click();
  await page.waitForTimeout(400);

  const local = await page.evaluate(() => {
    const box = document.getElementById('lbBox');
    return { visible: !!box && box.children.length > 0, text: box ? box.textContent : '' };
  });
  if (!local.visible) fail('вкладка рейтинга пустая без SDK');
  else if (!/Таблица лидеров|Лидеры/.test(local.text)) fail('на вкладке рейтинга нет заголовка таблицы');
  else if (!/Ваш результат/.test(local.text)) fail('свой результат не показан без SDK');
  else ok('без SDK рейтинг всё равно осмысленный: заголовок и свой результат');

  if (errors.length) errors.slice(0, 3).forEach((e) => fail('консоль: ' + e));
  await page.close();

  /*
   * --- 2. Таблица заведена в Консоли, но пустая ---
   * Ровно то состояние, в котором игру видит модератор в день подачи.
   */
  const { page: empty, errors: emptyErr } = await makePage(browser, SIZES[0]);
  await empty.addInitScript(lbSdk(), { entries: [] });
  await empty.goto(GAME);
  await empty.waitForSelector('#loader[hidden]', { state: 'attached', timeout: 8000 });
  await empty.locator('.tabbtn[data-tab="lb"]').click();
  await empty.waitForTimeout(600);

  const emptyText = await empty.locator('#lbBox').textContent();
  if (!/пока никого/.test(emptyText)) {
    fail('пустая таблица лидеров не показывается — именно на этом отклонила модерация');
  } else {
    ok('пустая таблица видна и объясняет, как в неё попасть');
  }
  if (emptyErr.length) emptyErr.slice(0, 3).forEach((e) => fail('консоль: ' + e));
  await empty.close();

  /* --- 3. В таблице есть строки --- */
  const { page: full, errors: fullErr } = await makePage(browser, SIZES[0]);
  await full.addInitScript(lbSdk(), {
    entries: [
      { rank: 1, score: 8.4e12, player: { publicName: 'Шаурмастер' } },
      { rank: 2, score: 3.1e12, player: { publicName: 'Донер' } },
      { rank: 3, score: 9.7e11, player: { publicName: '' } }
    ],
    userRank: 2
  });
  await full.goto(GAME);
  await full.waitForSelector('#loader[hidden]', { state: 'attached', timeout: 8000 });

  /* Немного заработать: нулевой результат в таблицу и не должен уходить. */
  const fullTap = full.locator('.card').first().locator('.card__tap');
  for (let i = 0; i < 3; i++) { await fullTap.click(); await full.waitForTimeout(1050); }

  await full.locator('.tabbtn[data-tab="lb"]').click();
  await full.waitForTimeout(600);

  const rows = await full.locator('#lbBox .statrow').count();
  const meRow = await full.locator('#lbBox .statrow--me').count();
  const text = await full.locator('#lbBox').textContent();
  if (rows < 3) fail(`в таблице отрисовано строк: ${rows}, ожидалось минимум 3`);
  else if (!meRow) fail('своя строка в таблице не подсвечена');
  else if (!/Шаурмастер/.test(text)) fail('имена игроков не попали в таблицу');
  else ok(`таблица рисует строки платформы: ${rows} шт., своя подсвечена`);

  /* Результат обязан уходить на платформу при открытии вкладки, иначе в
     таблице не окажется тех, кто ещё не продавал сеть. */
  const sent = await full.evaluate(() => window.__lbScores || []);
  if (!sent.length) fail('при открытии рейтинга результат не отправлен на платформу');
  else if (sent[0].name !== 'total') fail('результат ушёл не в ту таблицу: ' + sent[0].name);
  else ok('результат отправляется в таблицу «total» при открытии вкладки');

  if (fullErr.length) fullErr.slice(0, 3).forEach((e) => fail('консоль: ' + e));
  await full.close();
}

/*
 * Заглушка SDK с работающими лидербордами: отдаёт заданные строки и
 * записывает всё, что игра пытается отправить.
 */
function lbSdk() {
  return function (cfg) {
    window.__lbScores = [];
    window.YaGames = {
      init: () => Promise.resolve({
        environment: { i18n: { lang: 'ru' } },
        getFlags: () => Promise.resolve({}),
        getPlayer: () => Promise.resolve({
          isAuthorized: () => true,
          getData: () => Promise.resolve({}),
          setData: () => Promise.resolve(),
          getStats: () => Promise.resolve({}),
          setStats: () => Promise.resolve()
        }),
        getPayments: () => Promise.reject(new Error('no payments')),
        leaderboards: {
          getEntries: () => Promise.resolve({
            entries: cfg.entries,
            userRank: cfg.userRank || 0
          }),
          setScore: (name, score) => { window.__lbScores.push({ name, score }); }
        },
        features: { LoadingAPI: { ready() {} }, GameplayAPI: { start() {}, stop() {} } },
        adv: { showRewardedVideo() {}, showFullscreenAdv() {} },
        serverTime: () => Date.now(),
        isAvailableMethod: () => Promise.resolve(true),
        on() {}
      })
    };
  };
}

async function run() {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  console.log('\n== 1. Загрузка и базовые механики (390×844) ==');
  const { page, errors } = await makePage(browser, SIZES[0]);
  await page.goto(GAME);
  await page.waitForSelector('#loader[hidden]', { state: 'attached', timeout: 8000 });
  ok('игра запустилась, заставка убрана');

  /* Игра русскоязычная: локаль браузера здесь en-US, но интерфейс
     обязан быть русским — язык берётся только из SDK либо из настроек. */
  const ruTab = (await page.locator('.tabbtn[data-tab="biz"] .tabbtn__label').textContent()).trim();
  const ruTitle = await page.title();
  if (ruTab !== 'Точки') fail('интерфейс не на русском по умолчанию: ' + ruTab);
  else if (ruTitle !== 'Шаурма Империя: симулятор бизнеса') fail('заголовок не на русском: ' + ruTitle);
  else ok('интерфейс на русском по умолчанию при английской локали браузера');

  /* тап по первой точке: цикл длится секунду, поэтому и ждём столько же */
  const tap = page.locator('.card').first().locator('.card__tap');
  for (let i = 0; i < 7; i++) { await tap.click(); await page.waitForTimeout(1050); }
  const moneyText = await page.locator('#money').textContent();
  if (moneyText.trim() === '0 ₽') fail('тапы не приносят денег: ' + moneyText);
  else ok('тап приносит деньги: ' + moneyText.trim());

  /* покупка уровня */
  const buyBtn = page.locator('.card').first().locator('.btn--buy');
  await buyBtn.click();
  /* значения перерисовываются не каждый кадр — ждём условие, а не таймаут */
  const lvlNode = page.locator('.card').first().locator('.card__level');
  await lvlNode.filter({ hasText: /(lvl|ур\.)\s*[2-9]/ }).waitFor({ timeout: 3000 })
    .catch(() => { /* ниже разберём по тексту */ });
  const lvl = (await lvlNode.textContent()).trim();
  if (!/[2-9]/.test(lvl)) fail('уровень не вырос после покупки: ' + lvl);
  else ok('покупка уровня работает: ' + lvl);

  /* вкладки */
  for (const tabId of ['upgrades', 'boosts', 'prestige', 'lb', 'biz']) {
    await page.locator(`.tabbtn[data-tab="${tabId}"]`).click();
    await page.waitForTimeout(150);
    const visible = await page.locator(`#tab-${tabId}`).isVisible();
    if (!visible) fail('вкладка не открылась: ' + tabId);
  }
  ok('все вкладки открываются');

  /* реклама-заглушка выдаёт награду (локальный режим) */
  await page.locator('.tabbtn[data-tab="boosts"]').click();
  await page.waitForTimeout(200);
  const adBtn = page.locator('#adsList .btn--ad').first();
  if (await adBtn.count()) {
    await adBtn.click();
    await page.waitForTimeout(300);
    const boost = await page.locator('#boostBar').isVisible();
    if (!boost) fail('буст за рекламу не применился');
    else ok('rewarded-награда применяется');
  }

  /* настройки, пауза, звук */
  await page.locator('#btnSettings').click();
  await page.waitForTimeout(200);
  if (!(await page.locator('#modal').isVisible())) fail('настройки не открылись');
  else ok('окно настроек открывается');
  await page.locator('.modal__buttons .btn').last().click();
  await page.waitForTimeout(150);

  await page.locator('#btnSound').click();
  const muted = await page.locator('#btnSound').textContent();
  if (muted.trim() !== '🔇') fail('кнопка звука не переключается');
  else ok('звук отключается');
  await page.locator('#btnSound').click();

  /* сохранение переживает F5 */
  await page.locator('.tabbtn[data-tab="biz"]').click();
  await page.waitForTimeout(1500);
  const before = (await page.locator('.card').first().locator('.card__level').textContent()).trim();
  await page.reload();
  await page.waitForSelector('#loader[hidden]', { state: 'attached', timeout: 8000 });
  await page.waitForTimeout(400);
  const after = (await page.locator('.card').first().locator('.card__level').textContent()).trim();
  if (before !== after) fail(`прогресс потерян при F5: было ${before}, стало ${after}`);
  else ok('прогресс переживает перезагрузку: ' + after);

  if (errors.length) {
    errors.slice(0, 8).forEach((e) => fail('консоль: ' + e));
  } else {
    ok('в консоли чисто');
  }

  console.log('\n== 2. Вёрстка на разных экранах ==');
  for (const size of SIZES) {
    const { page: p, errors: errs } = await makePage(browser, size);
    await p.goto(GAME);
    await p.waitForSelector('#loader[hidden]', { state: 'attached', timeout: 8000 });
    await p.waitForTimeout(300);

    const res = await checkOverflow(p, size);
    if (res.scrollX) fail(`${size.name}: появился горизонтальный скролл страницы`);
    if (res.bad.length) fail(`${size.name}: элементы вылезают — ${res.bad.join(', ')}`);
    if (!res.scrollX && !res.bad.length) ok(`${size.name}: вёрстка в порядке`);

    /* п. 1.6.2.2: соотношение сторон активного поля не хуже 1:2
       п. 1.6.2.1: поле дотягивается до края хотя бы по одной оси */
    const box = await p.locator('#game').boundingBox();
    const ratio = Math.max(box.width, box.height) / Math.min(box.width, box.height);
    const touchesEdge = box.width >= size.width - 1 || box.height >= size.height - 1;
    if (size.name.startsWith('desktop')) {
      if (ratio > 2.001) {
        fail(`${size.name}: поле ${Math.round(box.width)}×${Math.round(box.height)}, соотношение ${ratio.toFixed(2)} > 2`);
      } else if (!touchesEdge) {
        fail(`${size.name}: поле ${Math.round(box.width)}×${Math.round(box.height)} не дотягивается до края окна ${size.width}×${size.height}`);
      } else {
        ok(`${size.name}: поле ${Math.round(box.width)}×${Math.round(box.height)}, соотношение ${ratio.toFixed(2)}, до края дотянуто`);
      }
    }

    if (errs.length) errs.slice(0, 3).forEach((e) => fail(`${size.name} консоль: ${e}`));

    if (SHOTS) {
      await p.screenshot({ path: path.join(SHOT_DIR, size.name + '.png') });
    }
    await p.close();
  }

  console.log('\n== 3. Английская локализация ==');
  const { page: en, errors: enErr } = await makePage(browser, SIZES[0]);
  await en.goto(GAME);
  await en.waitForSelector('#loader[hidden]', { state: 'attached', timeout: 8000 });
  await en.evaluate(() => localStorage.clear());
  await en.locator('#btnSettings').click();
  await en.waitForTimeout(200);
  await en.locator('.segmented__btn').last().click();
  await en.waitForTimeout(300);
  const enTab = await en.locator('.tabbtn[data-tab="biz"] .tabbtn__label').textContent();
  if (enTab.trim() !== 'Spots') fail('переключение на EN не сработало: ' + enTab);
  else ok('английская локализация включается');

  /* без каталога из SDK магазин обязан оставаться скрытым, в том числе
     после пересборки интерфейса при смене языка */
  if (await en.locator('.tabbtn[data-tab="shop"]').isVisible()) {
    fail('вкладка «Магазин» видна без каталога из SDK');
  } else {
    ok('магазин скрыт, пока Консоль не настроена');
  }
  if (SHOTS) await en.screenshot({ path: path.join(SHOT_DIR, 'en.png') });
  if (enErr.length) enErr.slice(0, 3).forEach((e) => fail('EN консоль: ' + e));
  await en.close();

  console.log('\n== 4. Развитая сеть, офлайн-доход и престиж ==');
  await richStateChecks(browser);

  console.log('\n== 5. Главный экран без прокрутки (п. 1.10.4) ==');
  await noScrollChecks(browser);

  console.log('\n== 6. Удалённая конфигурация и язык из SDK ==');
  await flagChecks(browser);

  console.log('\n== 7. Цели Метрики ==');
  await metricaChecks(browser);

  console.log('\n== 8. Таблица лидеров (п. 8.2.2) ==');
  await leaderboardChecks(browser);

  await browser.close();

  console.log('\n== ИТОГ ==');
  if (problems.length) {
    console.log(`  ПРОБЛЕМ: ${problems.length}`);
    process.exitCode = 1;
  } else {
    console.log('  всё чисто');
  }
}

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
