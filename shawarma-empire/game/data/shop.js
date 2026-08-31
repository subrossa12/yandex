/*
 * shop.js — конфиг внутриигровых покупок.
 * id должен совпадать с ID товара в Консоли разработчика Яндекс Игр.
 * Цена, валюта и иконка цены подтягиваются из SDK автоматически (п. 1.13.2),
 * здесь их указывать не нужно.
 *
 * Пока каталог из SDK не пришёл (Консоль не настроена) — вкладка скрыта.
 *
 * permanent решает, как обрабатывается покупка:
 *   true  — постоянный товар. НЕ консумируется: остаётся в getPurchases()
 *           и оттуда восстанавливается на любом устройстве.
 *   false — расходуемый. Выдаётся, сохраняется и сразу гасится
 *           методом consumePurchase().
 */
(function (root) {
  'use strict';

  var SHOP = {
    /* Порядок в списке = порядок здесь */
    products: [
      {
        id: 'noads',
        icon: '🚫',
        titleKey: 'shop.noAds',
        descKey: 'shop.noAdsDesc',
        effect: 'noAds',
        permanent: true
      },
      {
        id: 'x2forever',
        icon: '✖️',
        titleKey: 'shop.x2',
        descKey: 'shop.x2Desc',
        effect: 'permaX2',
        permanent: true
      },
      {
        id: 'offline8h',
        icon: '🌙',
        titleKey: 'shop.offline',
        descKey: 'shop.offlineDesc',
        effect: 'offlineExtended',
        permanent: true
      },
      {
        id: 'starterpack',
        icon: '🎁',
        titleKey: 'shop.starter',
        descKey: 'shop.starterDesc',
        effect: 'starterPack',
        permanent: false,
        /* показывается только со второй сессии и только один раз */
        showFromSession: 2,
        oncePerAccount: true,
        /* сколько денег даёт: секунд текущего дохода, но не меньше минимума */
        grantSeconds: 900,
        grantMin: 5000,
        boostMs: 10 * 60 * 1000
      }
    ]
  };

  root.SE = root.SE || {};
  root.SE.SHOP = SHOP;
})(typeof globalThis !== 'undefined' ? globalThis : this);
