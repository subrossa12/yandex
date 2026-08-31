/*
 * promo-shots.js — готовит скриншоты для карточки игры.
 *   node tools/promo-shots.js
 *
 * Игра портретная, а в Консоли для десктопа выбирается альбомная
 * ориентация. Если просто снять окно браузера, игровое поле займёт
 * около трети кадра, а п. 5.1.1.2 требует, чтобы геймплей занимал
 * не меньше 70% изображения.
 *
 * Поэтому кадры собираются так: сначала снимаются реальные игровые
 * экраны в портрете с тройной плотностью пикселей (чтобы не мылились),
 * затем три экрана выкладываются в альбомный кадр 1920×1080. Геймплей
 * занимает около 72% площади, остальное — фон игры.
 *
 * Результат: docs/promo/*.png
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const GAME = 'file://' + path.join(__dirname, '..', 'game', 'index.html');
const OUT = path.join(__dirname, '..', 'docs', 'promo');
const PANELS = path.join(OUT, 'panels');

const SAVE_KEY = 'shawarma_empire_save_v1';
const IDS = ['stall', 'cafe', 'bakery', 'pizzeria', 'sushi', 'burger', 'restaurant', 'foodcourt', 'network'];

/* Состояние сети на разных этапах игры. */
function save(levels, opts) {
  opts = opts || {};
  const now = Date.now() - (opts.awayMs || 0);
  return {
    v: 1,
    money: opts.money || 5.2e6,
    runEarned: opts.lifetime || 4.2e11,
    lifetimeEarned: opts.lifetime || 4.2e11,
    stars: opts.stars === undefined ? 15 : opts.stars,
    starsBase: opts.stars === undefined ? 15 : opts.stars,
    prestiges: opts.prestiges === undefined ? 1 : opts.prestiges,
    businesses: IDS.map((id) => ({
      id,
      level: levels[id] || 0,
      hasManager: !!levels[id] && (opts.allManagers || levels[id] > 30),
      progressMs: Math.random() * 900,
      running: true,
      upgrades: (levels[id] || 0) >= 50 ? { [id + '_u1']: true, [id + '_u2']: true } : {}
    })),
    globalUpgrades: { g1: true, g2: true },
    boosts: { speedRemainMs: opts.boostMs || 0, discountReady: false, prestigeBonus: 0 },
    cooldowns: { speed: 0, cash: 0, discount: 0 },
    purchases: { noAds: false, permaX2: false, offlineExtended: false, starterPack: false },
    buyMode: opts.buyMode || 10,
    playedMs: 45 * 60 * 1000,
    taps: 260,
    flags: { sessions: 3 },
    stateTime: now,
    savedAt: now
  };
}

const LATE = { stall: 210, cafe: 120, bakery: 105, pizzeria: 96, sushi: 84, burger: 71, restaurant: 58, foodcourt: 44, network: 27 };
const MID = { stall: 128, cafe: 74, bakery: 63, pizzeria: 51, sushi: 38, burger: 22, restaurant: 7 };

/* Какие экраны снимаем в портрете. */
const PORTRAITS = [
  { name: 'late', save: save(LATE, { allManagers: true, money: 1.09e7 }), tab: 'biz' },
  { name: 'mid', save: save(MID, { money: 5.2e6 }), tab: 'biz' },
  { name: 'early', save: null, tab: 'biz' },
  { name: 'upgrades', save: save(LATE, { allManagers: true, money: 8.4e9 }), tab: 'upgrades' },
  { name: 'prestige', save: save(LATE, { allManagers: true }), tab: 'prestige' },
  { name: 'boosts', save: save(LATE, { allManagers: true, boostMs: 195000 }), tab: 'boosts' },
  { name: 'offline', save: save(LATE, { allManagers: true, awayMs: 95 * 60 * 1000 }), tab: 'biz', modal: true }
];

/* Из каких троек собираются альбомные кадры. */
const SHEETS = [
  { name: '1-progression', panels: ['early', 'mid', 'late'] },
  { name: '2-systems', panels: ['upgrades', 'prestige', 'boosts'] },
  { name: '3-offline', panels: ['offline', 'late', 'upgrades'] }
];

async function capturePortraits(browser) {
  for (const shot of PORTRAITS) {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,        // без этого при увеличении кадр мылится
      hasTouch: true,
      isMobile: true
    });

    await page.addInitScript(([key, data]) => {
      try {
        if (data) localStorage.setItem(key, JSON.stringify(data));
        else localStorage.removeItem(key);
      } catch (e) { /* ignore */ }
    }, [SAVE_KEY, shot.save]);

    await page.goto(GAME);
    await page.waitForSelector('#loader[hidden]', { state: 'attached', timeout: 8000 });
    await page.waitForTimeout(700);

    if (!shot.modal && (await page.locator('#modal').isVisible())) {
      await page.locator('.modal__buttons .btn').last().click();
      await page.waitForTimeout(300);
    }
    if (shot.tab !== 'biz') {
      await page.locator(`.tabbtn[data-tab="${shot.tab}"]`).click();
      await page.waitForTimeout(500);
    }
    /* немного «живого» прогресса на полосах */
    await page.waitForTimeout(600);

    await page.screenshot({ path: path.join(PANELS, shot.name + '.png') });
    console.log('  портрет: ' + shot.name);
    await page.close();
  }
}

/* Альбомный кадр: три игровых экрана на фоне игры. */
function sheetHtml(files) {
  const imgs = files.map((f) => `<img src="${f}">`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 1920px; height: 1080px; overflow: hidden;
      background: radial-gradient(120% 90% at 50% 0%, #2f2117 0%, #17110d 70%);
      display: flex; align-items: center; justify-content: center; gap: 24px;
    }
    img {
      height: 1040px; width: auto; display: block;
      border-radius: 20px;
      border: 1px solid rgba(255, 200, 150, 0.18);
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
    }
  </style></head><body>${imgs}</body></html>`;
}

async function composeSheets(browser) {
  for (const sheet of SHEETS) {
    const files = sheet.panels.map((p) => 'file://' + path.join(PANELS, p + '.png'));
    const html = sheetHtml(files);
    const file = path.join(OUT, '_sheet.html');
    fs.writeFileSync(file, html);

    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto('file://' + file);
    await page.waitForTimeout(400);

    /* доля площади, занятая геймплеем — она должна быть больше 70% */
    const share = await page.evaluate(() => {
      let area = 0;
      document.querySelectorAll('img').forEach((n) => {
        const r = n.getBoundingClientRect();
        area += r.width * r.height;
      });
      return area / (window.innerWidth * window.innerHeight);
    });

    const out = path.join(OUT, sheet.name + '.png');
    await page.screenshot({ path: out });
    const pct = (share * 100).toFixed(1);
    console.log(`  альбомный: ${sheet.name}.png — геймплей ${pct}% ${share >= 0.7 ? '✓' : '✗ МЕНЬШЕ 70%'}`);
    await page.close();
    fs.unlinkSync(file);
  }
}

async function run() {
  fs.mkdirSync(PANELS, { recursive: true });
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  console.log('\n== Портретные экраны (390×844 @3x) ==');
  await capturePortraits(browser);

  console.log('\n== Альбомные кадры 1920×1080 ==');
  await composeSheets(browser);

  await browser.close();
  console.log('\nГотово: docs/promo/');
  console.log('  *.png в корне — альбомные, для десктопных скриншотов;');
  console.log('  panels/*.png — портретные, для мобильных.\n');
}

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
