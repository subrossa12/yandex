/*
 * art.js — иконка и обложка для карточки игры.
 *
 * ЗАЧЕМ ЭТО В РЕПОЗИТОРИИ.
 *
 * Модерация запросила подтверждение прав на материалы (п. 3.5). Сам билд
 * подтверждать нечего: в нём 13 файлов, все — код этого проекта, ни одной
 * картинки, ни звука, ни шрифта (звук синтезируется WebAudio, иконки в
 * интерфейсе — системные эмодзи, которые рисует шрифт устройства, а не мы).
 *
 * Оставались иконка и обложка: единственное, чего в репозитории не было,
 * и единственное, что могло приехать со стороны. Теперь они рисуются
 * здесь — геометрическими примитивами, без трассировки чужих картинок,
 * без стоков, без нейросетевых генераций. Исходник — этот файл, история
 * правок — в git. Это и есть подтверждение авторства: картинку можно
 * пересобрать из кода и посмотреть, из чего она состоит.
 *
 *   node tools/art.js   ->  docs/art/icon-512.png, docs/art/cover-800x470.png
 *                           + .svg-исходники рядом
 *
 * Требования к материалам: иконка 512x512, обложка 800x470, без рамок и
 * скруглений (п. 8.3.3), без текста и элементов интерфейса (п. 8.3.4),
 * не скриншот игры (п. 5.6).
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.resolve(__dirname, '..', 'docs', 'art');

/* Палитра игры — та же, что в css/main.css. */
const C = {
  bgDeep: '#17110d',
  bgWarm: '#3a2413',
  accent: '#ff9f45',
  accentLight: '#ffc978',
  breadLight: '#f7dcaa',
  bread: '#e8bd7a',
  breadDark: '#c28f4c',
  breadEdge: '#9d6c33',
  paper: '#f4eee1',
  paperShade: '#d9d0bd',
  paperLine: '#c7bca6',
  meat: '#b2602c',
  meatDark: '#8d4620',
  salad: '#6aa844',
  saladDark: '#4d8130',
  tomato: '#d9452f',
  onion: '#efdcef',
  sauce: '#f6e3a4'
};

/*
 * Шаурма. Рисуется один раз и переиспользуется в обоих материалах:
 * иконка и обложка обязаны выглядеть как одна вещь, а не как два разных
 * рисунка. Размер задаётся масштабом снаружи, поэтому внутри координаты
 * фиксированные: свёрток вписан в квадрат 240x340 с началом в (0,0).
 */
function shawarma(idSuffix) {
  const s = idSuffix;
  return `
  <defs>
    <linearGradient id="bread${s}" x1="0" y1="0" x2="1" y2="0.3">
      <stop offset="0"    stop-color="${C.breadLight}"/>
      <stop offset="0.42" stop-color="${C.bread}"/>
      <stop offset="1"    stop-color="${C.breadDark}"/>
    </linearGradient>
    <linearGradient id="paper${s}" x1="0" y1="0" x2="1" y2="0.25">
      <stop offset="0"    stop-color="#fffaf0"/>
      <stop offset="0.5"  stop-color="${C.paper}"/>
      <stop offset="1"    stop-color="${C.paperShade}"/>
    </linearGradient>
    <clipPath id="body${s}">
      <path d="M 42 50 C 42 20, 76 6, 120 6 C 164 6, 198 20, 198 50
               C 192 142, 180 222, 170 288 C 166 316, 146 336, 120 336
               C 94 336, 74 316, 70 288 C 60 222, 48 142, 42 50 Z"/>
    </clipPath>
  </defs>

  <!-- корпус свёртка -->
  <path d="M 42 50 C 42 20, 76 6, 120 6 C 164 6, 198 20, 198 50
           C 192 142, 180 222, 170 288 C 166 316, 146 336, 120 336
           C 94 336, 74 316, 70 288 C 60 222, 48 142, 42 50 Z"
        fill="url(#bread${s})"/>

  <g clip-path="url(#body${s})">
    <!-- мягкая тень по правому краю: свёрток круглый, а не плоский -->
    <path d="M 148 0 L 214 0 L 186 344 L 128 344 Z" fill="${C.breadEdge}" opacity="0.3"/>
    <!-- блик слева -->
    <path d="M 66 44 C 74 134, 80 232, 88 338 L 58 338 L 40 60 Z"
          fill="#fff3d6" opacity="0.36"/>

    <!-- следы гриля: короткие дуги поперёк, а не полоски по линейке -->
    <g stroke="${C.breadEdge}" stroke-width="5" stroke-linecap="round" fill="none" opacity="0.3">
      <path d="M 54 116 C 82 106, 140 106, 188 118"/>
      <path d="M 58 164 C 84 154, 138 154, 182 166"/>
      <path d="M 63 212 C 88 203, 134 203, 176 214"/>
    </g>

    <!-- начинка в открытом верхе -->
    <ellipse cx="120" cy="46" rx="80" ry="40" fill="${C.meatDark}"/>
    <ellipse cx="120" cy="40" rx="76" ry="34" fill="${C.meat}"/>
    <path d="M 46 36 C 66 14, 98 10, 118 22 C 136 33, 128 56, 106 58
             C 78 61, 52 50, 46 36 Z" fill="${C.salad}"/>
    <path d="M 52 38 C 70 24, 94 22, 110 30" stroke="${C.saladDark}"
          stroke-width="4" fill="none" stroke-linecap="round"/>
    <circle cx="160" cy="34" r="22" fill="${C.tomato}"/>
    <circle cx="160" cy="34" r="12" fill="#ea6a52" opacity="0.72"/>
    <path d="M 116 12 C 134 4, 156 8, 166 18" stroke="${C.onion}"
          stroke-width="8" fill="none" stroke-linecap="round" opacity="0.9"/>
    <path d="M 70 16 C 90 6, 110 8, 122 16" stroke="${C.sauce}"
          stroke-width="7" fill="none" stroke-linecap="round" opacity="0.95"/>
    <ellipse cx="92" cy="56" rx="17" ry="10" fill="${C.meatDark}" opacity="0.8"/>
    <ellipse cx="146" cy="60" rx="18" ry="11" fill="${C.meatDark}" opacity="0.6"/>

    <!-- бумага: диагональный край, как её и заворачивают -->
    <path d="M 30 214 L 210 182 L 210 348 L 30 348 Z" fill="url(#paper${s})"/>
    <path d="M 30 214 L 210 182 L 210 196 L 30 228 Z" fill="${C.paperLine}" opacity="0.6"/>
    <g stroke="${C.paperLine}" stroke-width="3" fill="none" opacity="0.5">
      <path d="M 66 222 L 84 344"/>
      <path d="M 120 214 L 122 346"/>
      <path d="M 176 204 L 160 344"/>
    </g>
    <!-- складка: без неё бумага читается плоским прямоугольником -->
    <path d="M 122 216 L 142 344 L 152 344 L 130 214 Z" fill="#ffffff" opacity="0.55"/>
  </g>

  <!-- контур: он собирает форму, без него всё расплывается -->
  <path d="M 42 50 C 42 20, 76 6, 120 6 C 164 6, 198 20, 198 50
           C 192 142, 180 222, 170 288 C 166 316, 146 336, 120 336
           C 94 336, 74 316, 70 288 C 60 222, 48 142, 42 50 Z"
        fill="none" stroke="${C.breadEdge}" stroke-width="6" opacity="0.65"/>`;
}

/* Иконка 512x512: один крупный объект по центру, ничего лишнего. */
function iconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="0.5" cy="0.4" r="0.8">
      <stop offset="0"    stop-color="#48280f"/>
      <stop offset="0.5"  stop-color="#241609"/>
      <stop offset="1"    stop-color="#0f0a06"/>
    </radialGradient>
    <radialGradient id="glow" cx="0.5" cy="0.44" r="0.42">
      <stop offset="0"   stop-color="${C.accent}" stop-opacity="0.5"/>
      <stop offset="0.6" stop-color="${C.accent}" stop-opacity="0.16"/>
      <stop offset="1"   stop-color="${C.accent}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="shadow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#000000" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="512" height="512" fill="url(#bg)"/>
  <rect width="512" height="512" fill="url(#glow)"/>

  <!-- тёплые кольца: заполняют углы и не спорят с главным объектом -->
  <g fill="none" stroke="${C.accentLight}" stroke-width="6" opacity="0.1">
    <circle cx="58"  cy="80"  r="38"/>
    <circle cx="452" cy="418" r="46"/>
  </g>

  <ellipse cx="256" cy="464" rx="146" ry="32" fill="url(#shadow)"/>

  <!-- свёрток занимает почти всю высоту: иконку смотрят размером с ноготь -->
  <g transform="translate(106, 36) scale(1.25) rotate(-6, 120, 171)">
    ${shawarma('I')}
  </g>
</svg>`;
}

/*
 * Обложка 800x470: объект слева, справа воздух — платформа накладывает
 * название игры сама, и текст не должен лечь на рисунок.
 */
function coverSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="470" viewBox="0 0 800 470">
  <defs>
    <linearGradient id="cbg" x1="0" y1="0" x2="1" y2="0.6">
      <stop offset="0"   stop-color="#4d2c14"/>
      <stop offset="0.45" stop-color="${C.bgWarm}"/>
      <stop offset="1"   stop-color="${C.bgDeep}"/>
    </linearGradient>
    <radialGradient id="cglow" cx="0.28" cy="0.5" r="0.55">
      <stop offset="0" stop-color="${C.accent}" stop-opacity="0.4"/>
      <stop offset="1" stop-color="${C.accent}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="cshadow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#000000" stop-opacity="0.5"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="coin" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0"   stop-color="#ffd98a"/>
      <stop offset="0.5" stop-color="${C.accent}"/>
      <stop offset="1"   stop-color="#c9722a"/>
    </linearGradient>
  </defs>

  <rect width="800" height="470" fill="url(#cbg)"/>
  <rect width="800" height="470" fill="url(#cglow)"/>

  <!--
    Силуэты точек сети: от ларька слева до высотки справа. Рост читается
    без единой буквы — это и есть сюжет игры. Полоса держится низко:
    платформа накладывает название сверху, и верх кадра обязан остаться
    свободным, иначе текст ляжет на рисунок.
  -->
  <g>
    <g fill="#120c07" opacity="0.62">
      <rect x="360" y="374" width="58"  height="62"/>
      <rect x="428" y="352" width="66"  height="84"/>
      <rect x="504" y="330" width="62"  height="106"/>
      <rect x="576" y="306" width="70"  height="130"/>
      <rect x="656" y="282" width="74"  height="154"/>
      <rect x="740" y="256" width="72"  height="180"/>
    </g>
    <!-- окна: тёплый свет, иначе силуэты читаются просто пятнами -->
    <g fill="${C.accentLight}" opacity="0.5">
      <rect x="374" y="390" width="11" height="11"/> <rect x="394" y="390" width="11" height="11"/>
      <rect x="374" y="412" width="11" height="11"/>
      <rect x="442" y="368" width="11" height="11"/> <rect x="464" y="368" width="11" height="11"/>
      <rect x="442" y="392" width="11" height="11"/> <rect x="464" y="392" width="11" height="11"/>
      <rect x="518" y="346" width="11" height="11"/> <rect x="540" y="346" width="11" height="11"/>
      <rect x="518" y="372" width="11" height="11"/> <rect x="540" y="372" width="11" height="11"/>
      <rect x="518" y="398" width="11" height="11"/>
      <rect x="590" y="322" width="11" height="11"/> <rect x="614" y="322" width="11" height="11"/>
      <rect x="590" y="350" width="11" height="11"/> <rect x="614" y="350" width="11" height="11"/>
      <rect x="590" y="378" width="11" height="11"/> <rect x="614" y="378" width="11" height="11"/>
      <rect x="670" y="298" width="11" height="11"/> <rect x="696" y="298" width="11" height="11"/>
      <rect x="670" y="328" width="11" height="11"/> <rect x="696" y="328" width="11" height="11"/>
      <rect x="670" y="358" width="11" height="11"/> <rect x="696" y="358" width="11" height="11"/>
      <rect x="670" y="388" width="11" height="11"/>
      <rect x="754" y="272" width="11" height="11"/> <rect x="782" y="272" width="11" height="11"/>
      <rect x="754" y="304" width="11" height="11"/> <rect x="782" y="304" width="11" height="11"/>
      <rect x="754" y="336" width="11" height="11"/> <rect x="782" y="336" width="11" height="11"/>
      <rect x="754" y="368" width="11" height="11"/> <rect x="782" y="368" width="11" height="11"/>
    </g>
  </g>

  <!-- монеты дугой от свёртка вверх: подсказывают направление роста -->
  <g opacity="0.92">
    <ellipse cx="318" cy="238" rx="25" ry="25" fill="url(#coin)"/>
    <ellipse cx="318" cy="232" rx="25" ry="25" fill="url(#coin)"/>
    <ellipse cx="318" cy="232" rx="14" ry="14" fill="#ffe4a8" opacity="0.5"/>
    <ellipse cx="366" cy="182" rx="18" ry="18" fill="url(#coin)"/>
    <ellipse cx="366" cy="177" rx="18" ry="18" fill="url(#coin)"/>
    <ellipse cx="366" cy="177" rx="10" ry="10" fill="#ffe4a8" opacity="0.45"/>
    <ellipse cx="404" cy="140" rx="12" ry="12" fill="url(#coin)" opacity="0.8"/>
  </g>

  <ellipse cx="196" cy="438" rx="132" ry="28" fill="url(#cshadow)"/>

  <g transform="translate(76, 44) scale(1.1) rotate(-6, 120, 171)">
    ${shawarma('C')}
  </g>
</svg>`;
}

async function render(browser, svg, w, h, file) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style>${svg}`
  );
  await page.waitForTimeout(150);
  await page.screenshot({ path: file, omitBackground: false });
  await page.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  const icon = iconSvg();
  const cover = coverSvg();
  fs.writeFileSync(path.join(OUT, 'icon-512.svg'), icon);
  fs.writeFileSync(path.join(OUT, 'cover-800x470.svg'), cover);

  await render(browser, icon, 512, 512, path.join(OUT, 'icon-512.png'));
  await render(browser, cover, 800, 470, path.join(OUT, 'cover-800x470.png'));

  await browser.close();
  console.log('готово:');
  console.log('  ' + path.join(OUT, 'icon-512.png'));
  console.log('  ' + path.join(OUT, 'cover-800x470.png'));
})();
