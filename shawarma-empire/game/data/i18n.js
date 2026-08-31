/*
 * i18n.js — словарь RU + EN + TR. Язык берётся из SDK, по умолчанию RU.
 * Турецкий — рекомендация платформы: это её второй рынок после России.
 * Плейсхолдеры вида {x} подставляются вторым аргументом t().
 *
 * Тон текстов рассчитан на взрослого игрока: 49% аудитории платформы —
 * это 35–44 года, ещё 20% — 55+. Никакого подросткового сленга.
 */
(function (root) {
  'use strict';

  var DICT = {
    ru: {
      /* точки */
      'biz.stall': 'Ларёк с шаурмой',
      'biz.cafe': 'Кафе на углу',
      'biz.bakery': 'Пекарня',
      'biz.pizzeria': 'Пиццерия',
      'biz.sushi': 'Суши-бар',
      'biz.burger': 'Бургерная',
      'biz.restaurant': 'Ресторан',
      'biz.foodcourt': 'Фудкорт',
      'biz.network': 'Сеть по стране',

      /* вкладки */
      'tab.biz': 'Точки',
      'tab.upgrades': 'Апгрейды',
      'tab.boosts': 'Бонусы',
      'tab.prestige': 'Престиж',
      'tab.shop': 'Магазин',

      /* шапка */
      'hud.perSec': '{v} / сек',

      /* карточка точки */
      'card.level': 'ур. {n}',
      'card.buy': 'Купить',
      'card.managerOwned': 'Работает сам',
      'card.managerHired': 'Менеджер нанят: «{name}»',
      'card.tapToStart': 'Нажми 👆',
      'card.unlock': 'Открыть за {cost}',
      'card.nextSpeed': 'Ускорение ×2 на {n} ур.',
      'card.speedMax': 'Максимальная скорость',
      'card.speedUp': 'Ускорение ×2: «{name}»',
      'card.nextUp': 'Дальше откроются',

      /* режим покупки */
      'buy.mode': 'Покупать:',
      'buy.max': 'макс',

      /* апгрейды */
      'up.business': '«{name}»: доход {mult}',
      'up.global': 'Доход всей сети {mult}',
      'up.empty': 'Пока нечего улучшать. Поднимай уровни точек — апгрейды откроются.',
      'up.locked': 'Откроется на {n} уровне точки «{name}»',
      'up.buy': 'Купить',
      'up.soon': 'Скоро',

      /* бонусы за рекламу */
      'ads.hint': 'Всё здесь — по желанию. Игра полностью проходится без рекламы.',
      'ads.watch': 'Смотреть рекламу',
      'ads.speed': 'Ускорение ×3 на 4 мин',
      'ads.speedDesc': 'Весь доход втрое на 4 минуты',
      'ads.cash': 'Мгновенная выручка',
      'ads.cashDesc': 'Доход за 30 минут сразу: {v}',
      'ads.discount': 'Скидка 50%',
      'ads.discountDesc': 'Половина цены на следующую покупку',
      'ads.needIncome': 'Нужен хоть какой-то доход в секунду',
      'ads.noAds': 'Реклама недоступна',
      'ads.failed': 'Реклама не загрузилась. Попробуй позже.',
      'ads.rewarded': 'Награда получена!',

      /* офлайн */
      'offline.title': 'Пока тебя не было',
      'offline.body': 'Сеть работала {time} и заработала',
      'offline.claim': 'Забрать',
      /* на кнопке рекламы всегда написано, что это реклама и что за неё дают */
      'offline.claimX2': 'Смотреть рекламу: забрать ×2',
      'offline.capped': 'Достигнут предел в {cap}.',
      'offline.cappedShop': 'Достигнут предел в {cap}. Расширить можно в магазине.',

      /* престиж */
      'prestige.title': 'Продать сеть',
      'prestige.desc': 'Ты продаёшь всё и начинаешь заново — но звёзды остаются навсегда и увеличивают весь доход.',
      'prestige.gain': 'Получишь звёзд: {n}',
      'prestige.multNow': 'Множитель сейчас',
      'prestige.multAfter': 'Станет',
      'prestige.starsTotal': 'Всего звёзд',
      'prestige.soldTotal': 'Продано сетей',
      'prestige.ready': 'Сеть готова к продаже',
      'prestige.locked': 'Нужно заработать ещё {v}',
      'prestige.button': 'Продать сеть',
      'prestige.confirm': 'Точно продать? Все точки, менеджеры и апгрейды сбросятся.',
      'prestige.confirmYes': 'Да, продаём',
      'prestige.cancel': 'Отмена',
      'prestige.adBonus': 'Смотреть рекламу: +20% звёзд',
      'prestige.adBonusActive': 'Бонус +20% активен',
      'prestige.done': 'Сеть продана! Получено звёзд: {n}',

      /* лидерборд */
      'lb.title': 'Лидеры по выручке',
      'lb.player': 'Игрок',
      'lb.note': 'Учитывается суммарная выручка за все продажи сети.',
      'lb.authWhy': 'С аккаунтом Яндекса прогресс сохранится в облаке и будет доступен на любом устройстве, а ваш результат попадёт в таблицу.',
      'lb.authBtn': 'Войти с Яндекс ID',

      /* магазин */
      'shop.unavailable': 'Магазин временно недоступен',
      'shop.owned': 'Куплено',
      'shop.buy': 'Купить',
      'shop.restore': 'Восстановить покупки',
      'shop.thanks': 'Спасибо за поддержку!',
      'shop.noAds': 'Убрать рекламу',
      'shop.noAdsDesc': 'Больше никаких полноэкранных роликов. Бонусы за просмотр остаются по желанию.',
      'shop.x2': '×2 к доходу навсегда',
      'shop.x2Desc': 'Удваивает весь доход сети до конца времён',
      'shop.offline': 'Офлайн 8 часов',
      'shop.offlineDesc': 'Сеть копит доход 8 часов вместо 2',
      'shop.starter': 'Стартовый набор',
      'shop.starterDesc': 'Деньги на быстрый старт и ускорение ×3 на 10 минут',

      /* настройки */
      'set.title': 'Настройки',
      'set.sound': 'Звук',
      'set.on': 'вкл',
      'set.off': 'выкл',
      'set.pause': 'Пауза',
      'set.resume': 'Продолжить',
      'set.lang': 'Язык',
      'set.close': 'Закрыть',
      'set.stats': 'Статистика',
      'set.statTotal': 'Заработано всего',
      'set.statTaps': 'Нажатий',
      'set.statTime': 'В игре',
      'set.howto': 'Как играть',
      'set.howtoBody': 'Нажимай на точку, чтобы приготовить заказ и получить деньги. Покупай уровни — доход растёт. Купи менеджера — точка работает сама. На 25, 50, 100 и 200 уровне точка ускоряется вдвое. Когда упрёшься в потолок — продай сеть за звёзды: они навсегда умножают весь доход.',

      /* пауза */
      'pause.title': 'Пауза',
      'pause.body': 'Сеть подождёт.',

      /* туториал */
      'tut.tap': 'Нажми на ларёк 👆',
      'tut.manager': 'Возьми менеджера — точка будет работать сама',

      /* прочее */
      'title': 'Шаурма Империя',
      'loading': 'Разогреваем гриль…',
      'newBiz': 'Открыта новая точка: {name}!',
      'review.ask': 'Нравится игра? Поставь оценку — это помогает.',
      'review.yes': 'Оценить',
      'review.no': 'Потом'
    },

    en: {
      'biz.stall': 'Shawarma Stall',
      'biz.cafe': 'Corner Cafe',
      'biz.bakery': 'Bakery',
      'biz.pizzeria': 'Pizzeria',
      'biz.sushi': 'Sushi Bar',
      'biz.burger': 'Burger Joint',
      'biz.restaurant': 'Restaurant',
      'biz.foodcourt': 'Food Court',
      'biz.network': 'Nationwide Chain',

      'tab.biz': 'Spots',
      'tab.upgrades': 'Upgrades',
      'tab.boosts': 'Bonuses',
      'tab.prestige': 'Prestige',
      'tab.shop': 'Shop',

      'hud.perSec': '{v} / sec',

      'card.level': 'lvl {n}',
      'card.buy': 'Buy',
      'card.managerOwned': 'Runs itself',
      'card.managerHired': 'Manager hired: {name}',
      'card.tapToStart': 'Tap 👆',
      'card.unlock': 'Unlock for {cost}',
      'card.nextSpeed': '×2 speed at level {n}',
      'card.speedMax': 'Top speed reached',
      'card.speedUp': '{name} is twice as fast now!',
      'card.nextUp': 'Coming up next',

      'buy.mode': 'Buy:',
      'buy.max': 'max',

      'up.business': '{name} income {mult}',
      'up.global': 'All income {mult}',
      'up.empty': 'Nothing to upgrade yet. Level up your spots to unlock upgrades.',
      'up.locked': 'Unlocks at level {n} of {name}',
      'up.buy': 'Buy',
      'up.soon': 'Soon',

      'ads.hint': 'Everything here is optional. The game is fully playable without ads.',
      'ads.watch': 'Watch ad',
      'ads.speed': '×3 speed for 4 min',
      'ads.speedDesc': 'Triples all income for 4 minutes',
      'ads.cash': 'Instant cash',
      'ads.cashDesc': '30 minutes of income at once: {v}',
      'ads.discount': '50% discount',
      'ads.discountDesc': 'Half price on your next purchase',
      'ads.needIncome': 'You need some income per second first',
      'ads.noAds': 'Ads are not available',
      'ads.failed': 'The ad failed to load. Try again later.',
      'ads.rewarded': 'Reward granted!',

      'offline.title': 'While you were away',
      'offline.body': 'Your chain worked for {time} and earned',
      'offline.claim': 'Collect',
      'offline.claimX2': 'Watch ad: collect ×2',
      'offline.capped': 'Capped at {cap}.',
      'offline.cappedShop': 'Capped at {cap}. You can extend it in the shop.',

      'prestige.title': 'Sell the chain',
      'prestige.desc': 'You sell everything and start over — but stars stay forever and boost all income.',
      'prestige.gain': 'Stars you get: {n}',
      'prestige.multNow': 'Multiplier now',
      'prestige.multAfter': 'Will become',
      'prestige.starsTotal': 'Stars total',
      'prestige.soldTotal': 'Chains sold',
      'prestige.ready': 'Ready to sell',
      'prestige.locked': 'Earn {v} more',
      'prestige.button': 'Sell the chain',
      'prestige.confirm': 'Sell for real? All spots, managers and upgrades reset.',
      'prestige.confirmYes': 'Yes, sell it',
      'prestige.cancel': 'Cancel',
      'prestige.adBonus': 'Watch ad: +20% stars',
      'prestige.adBonusActive': '+20% bonus is active',
      'prestige.done': 'Chain sold! Stars earned: {n}',

      'lb.title': 'Top by revenue',
      'lb.player': 'Player',
      'lb.note': 'Total revenue across all chain sales.',
      'lb.authWhy': 'With a Yandex account your progress is stored in the cloud and available on any device, and your result joins the board.',
      'lb.authBtn': 'Sign in with Yandex ID',

      'shop.unavailable': 'The shop is temporarily unavailable',
      'shop.owned': 'Owned',
      'shop.buy': 'Buy',
      'shop.restore': 'Restore purchases',
      'shop.thanks': 'Thanks for the support!',
      'shop.noAds': 'Remove ads',
      'shop.noAdsDesc': 'No more fullscreen ads. Optional reward ads stay available.',
      'shop.x2': '×2 income forever',
      'shop.x2Desc': 'Doubles all income of your chain permanently',
      'shop.offline': '8-hour offline',
      'shop.offlineDesc': 'Your chain banks income for 8 hours instead of 2',
      'shop.starter': 'Starter pack',
      'shop.starterDesc': 'Cash for a fast start plus ×3 speed for 10 minutes',

      'set.title': 'Settings',
      'set.sound': 'Sound',
      'set.on': 'on',
      'set.off': 'off',
      'set.pause': 'Pause',
      'set.resume': 'Resume',
      'set.lang': 'Language',
      'set.close': 'Close',
      'set.stats': 'Stats',
      'set.statTotal': 'Total earned',
      'set.statTaps': 'Taps',
      'set.statTime': 'Play time',
      'set.howto': 'How to play',
      'set.howtoBody': 'Tap a spot to cook an order and earn money. Buy levels to raise income. Hire a manager and the spot runs itself. At levels 25, 50, 100 and 200 a spot doubles its speed. When progress slows down, sell the chain for stars — they multiply all income forever.',

      'pause.title': 'Paused',
      'pause.body': 'The chain will wait.',

      'tut.tap': 'Tap the stall 👆',
      'tut.manager': 'Hire a manager so the spot runs itself',

      'title': 'Shawarma Empire',
      'loading': 'Heating up the grill…',
      'newBiz': 'New spot unlocked: {name}!',
      'review.ask': 'Enjoying the game? A rating really helps.',
      'review.yes': 'Rate it',
      'review.no': 'Later'
    },

    tr: {
      'biz.stall': 'Dürüm Büfesi',
      'biz.cafe': 'Köşe Kafe',
      'biz.bakery': 'Fırın',
      'biz.pizzeria': 'Pizzacı',
      'biz.sushi': 'Suşi Bar',
      'biz.burger': 'Burgerci',
      'biz.restaurant': 'Restoran',
      'biz.foodcourt': 'Yemek Katı',
      'biz.network': 'Ülke Geneli Zincir',

      'tab.biz': 'Noktalar',
      'tab.upgrades': 'Yükseltmeler',
      'tab.boosts': 'Bonuslar',
      'tab.prestige': 'Prestij',
      'tab.shop': 'Mağaza',

      'hud.perSec': '{v} / sn',

      'card.level': 'sv. {n}',
      'card.buy': 'Satın al',
      'card.managerOwned': 'Kendi çalışıyor',
      'card.managerHired': 'Müdür işe alındı: {name}',
      'card.tapToStart': 'Dokun 👆',
      'card.unlock': '{cost} karşılığında aç',
      'card.nextSpeed': '{n}. seviyede ×2 hız',
      'card.speedMax': 'Azami hıza ulaşıldı',
      'card.speedUp': '{name} iki kat hızlandı!',
      'card.nextUp': 'Sırada açılacaklar',

      'buy.mode': 'Alım:',
      'buy.max': 'maks',

      'up.business': '{name} geliri {mult}',
      'up.global': 'Tüm zincirin geliri {mult}',
      'up.empty': 'Şimdilik yükseltilecek bir şey yok. Noktaların seviyesini yükselt, yükseltmeler açılır.',
      'up.locked': '{name} noktasının {n}. seviyesinde açılır',
      'up.buy': 'Satın al',
      'up.soon': 'Yakında',

      'ads.hint': 'Buradaki her şey isteğe bağlı. Oyun reklamsız da baştan sona oynanır.',
      'ads.watch': 'Reklam izle',
      'ads.speed': '4 dakika ×3 hız',
      'ads.speedDesc': '4 dakika boyunca tüm gelir üç katına çıkar',
      'ads.cash': 'Anında gelir',
      'ads.cashDesc': '30 dakikalık gelir tek seferde: {v}',
      'ads.discount': '%50 indirim',
      'ads.discountDesc': 'Sonraki alımda yarı fiyat',
      'ads.needIncome': 'Önce saniyelik bir gelirin olmalı',
      'ads.noAds': 'Reklam kullanılamıyor',
      'ads.failed': 'Reklam yüklenemedi. Daha sonra dene.',
      'ads.rewarded': 'Ödül alındı!',

      'offline.title': 'Sen yokken',
      'offline.body': 'Zincirin {time} çalıştı ve kazandı',
      'offline.claim': 'Al',
      'offline.claimX2': 'Reklam izle: ×2 al',
      'offline.capped': '{cap} sınırına ulaşıldı.',
      'offline.cappedShop': '{cap} sınırına ulaşıldı. Mağazadan genişletebilirsin.',

      'prestige.title': 'Zinciri sat',
      'prestige.desc': 'Her şeyi satıp baştan başlıyorsun — ama yıldızlar kalıcı olarak kalıyor ve tüm geliri artırıyor.',
      'prestige.gain': 'Kazanacağın yıldız: {n}',
      'prestige.multNow': 'Şu anki çarpan',
      'prestige.multAfter': 'Olacak',
      'prestige.starsTotal': 'Toplam yıldız',
      'prestige.soldTotal': 'Satılan zincir',
      'prestige.ready': 'Zincir satışa hazır',
      'prestige.locked': '{v} daha kazan',
      'prestige.button': 'Zinciri sat',
      'prestige.confirm': 'Gerçekten satılsın mı? Tüm noktalar, müdürler ve yükseltmeler sıfırlanır.',
      'prestige.confirmYes': 'Evet, satalım',
      'prestige.cancel': 'Vazgeç',
      'prestige.adBonus': 'Reklam izle: +%20 yıldız',
      'prestige.adBonusActive': '+%20 bonus etkin',
      'prestige.done': 'Zincir satıldı! Kazanılan yıldız: {n}',

      'lb.title': 'Gelire göre liderler',
      'lb.player': 'Oyuncu',
      'lb.note': 'Tüm zincir satışlarının toplam geliri sayılır.',
      'lb.authWhy': 'Yandex hesabıyla ilerlemen bulutta saklanır, her cihazdan açılır ve sonucun tabloya girer.',
      'lb.authBtn': 'Yandex ID ile gir',

      'shop.unavailable': 'Mağaza şu anda kullanılamıyor',
      'shop.owned': 'Alındı',
      'shop.buy': 'Satın al',
      'shop.restore': 'Alımları geri yükle',
      'shop.thanks': 'Desteğin için teşekkürler!',
      'shop.noAds': 'Reklamları kaldır',
      'shop.noAdsDesc': 'Artık tam ekran reklam yok. İsteğe bağlı ödüllü reklamlar kalır.',
      'shop.x2': 'Sonsuza dek ×2 gelir',
      'shop.x2Desc': 'Zincirinin tüm gelirini kalıcı olarak ikiye katlar',
      'shop.offline': '8 saat çevrimdışı',
      'shop.offlineDesc': 'Zincirin 2 saat yerine 8 saat gelir biriktirir',
      'shop.starter': 'Başlangıç paketi',
      'shop.starterDesc': 'Hızlı başlangıç için para ve 10 dakika ×3 hız',

      'set.title': 'Ayarlar',
      'set.sound': 'Ses',
      'set.on': 'açık',
      'set.off': 'kapalı',
      'set.pause': 'Duraklat',
      'set.resume': 'Devam et',
      'set.lang': 'Dil',
      'set.close': 'Kapat',
      'set.stats': 'İstatistik',
      'set.statTotal': 'Toplam kazanç',
      'set.statTaps': 'Dokunuş',
      'set.statTime': 'Oyun süresi',
      'set.howto': 'Nasıl oynanır',
      'set.howtoBody': 'Sipariş hazırlayıp para kazanmak için noktaya dokun. Seviye satın al, gelir artsın. Müdür tut, nokta kendi kendine çalışsın. 25, 50, 100 ve 200. seviyelerde nokta iki kat hızlanır. İlerleme yavaşladığında zinciri yıldız karşılığında sat: yıldızlar tüm geliri kalıcı olarak çarpar.',

      'pause.title': 'Duraklatıldı',
      'pause.body': 'Zincir bekler.',

      'tut.tap': 'Büfeye dokun 👆',
      'tut.manager': 'Müdür tut, nokta kendi kendine çalışsın',

      'title': 'Dürüm İmparatorluğu',
      'loading': 'Izgara ısınıyor…',
      'newBiz': 'Yeni nokta açıldı: {name}!',
      'review.ask': 'Oyunu beğendin mi? Puan vermen gerçekten yardımcı olur.',
      'review.yes': 'Puan ver',
      'review.no': 'Sonra'
    }
  };

  var lang = 'ru';

  function setLang(l) {
    lang = DICT[l] ? l : 'ru';
    if (root.SE && root.SE.Format) root.SE.Format.setLang(lang);
    return lang;
  }

  function getLang() { return lang; }

  function t(key, vars) {
    var table = DICT[lang] || DICT.ru;
    var s = table[key];
    if (s === undefined) s = DICT.ru[key];
    if (s === undefined) return key;
    if (!vars) return s;
    return s.replace(/\{(\w+)\}/g, function (m, name) {
      return vars[name] !== undefined ? vars[name] : m;
    });
  }

  root.SE = root.SE || {};
  root.SE.I18N = { t: t, setLang: setLang, getLang: getLang, has: function (l) { return !!DICT[l]; } };
})(typeof globalThis !== 'undefined' ? globalThis : this);
