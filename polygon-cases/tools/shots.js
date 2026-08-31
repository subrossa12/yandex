/*
 * shots.js — снимки полигона генератора.
 *   node tools/shots.js
 *
 * Отдельный инструмент, а не часть smoke.js: смотреть на скины нужно
 * глазами и часто, а прогонять ради этого весь тест — долго.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const OUT = path.join(__dirname, '..', 'docs', 'shots');
const PAGE = 'file://' + path.join(__dirname, 'gallery.html');

async function run() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(PAGE);
  await page.waitForSelector('.item', { timeout: 10000 });
  await page.waitForTimeout(300);

  const stat = await page.locator('#stat').textContent();
  console.log('сетка 200 предметов:', stat.trim());

  await page.screenshot({ path: path.join(OUT, 'gallery-grid.png') });

  /* крупный показ: там включается зерно на износе */
  await page.locator('#toggleBig').click();
  await page.waitForTimeout(400);
  const bigStat = await page.locator('#stat').textContent();
  console.log('крупно (с зерном):    ', bigStat.trim());
  await page.screenshot({ path: path.join(OUT, 'gallery-big.png') });

  /* разброс износа на одном дизайне */
  await page.locator('#toggleWear').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'gallery-wear.png') });

  /* только реликты — самый дорогой пул */
  await page.locator('#toggleWear').click();
  await page.selectOption('#filter', '5');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'gallery-relic.png') });

  await page.selectOption('#filter', '0');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'gallery-standard.png') });

  await browser.close();

  if (errors.length) {
    console.log('\nОШИБКИ В КОНСОЛИ:');
    errors.slice(0, 10).forEach((e) => console.log('  ' + e));
    process.exitCode = 1;
  } else {
    console.log('\nконсоль чистая, снимки в docs/shots/');
  }
}

run().catch((e) => { console.error(e); process.exitCode = 1; });
