# Что сверить с документацией PluginYG2

Игровой код не знает про плагин: все обращения к нему собраны в одном
файле — `Assets/Scripts/Platform/YandexBackend.cs`. Сделано это ровно
ради этой страницы: при обновлении плагина сверять надо один короткий
список, а не весь проект.

Документация: https://max-games.ru/plugin-yg/doc/

Файл компилируется только при определённом символе `YG2` — его добавляет
сам плагин. Пока плагина нет, проект собирается на `LocalBackend`, и это
рабочее состояние, а не поломка.

## Используемые символы

| Что делаем | Символ плагина | Модуль |
|---|---|---|
| Готовность игры | `YG2.GameReadyAPI()` | базовый |
| Разметка геймплея | `YG2.GameplayStart()`, `YG2.GameplayStop()` | базовый |
| Язык | `YG2.envir.language` | Envir / Language |
| Авторизация | `YG2.player.auth`, `YG2.OpenAuthDialog()` | Authorization |
| Серверное время | `YG2.serverTime` | Server Time |
| Сохранения | `YG2.saves`, `YG2.SaveProgress()` | Storage |
| Rewarded | `YG2.RewardedAdvShow(id, cb)`, `YG2.onCloseRewardedAdv` | Advertisement |
| Interstitial | `YG2.InterstitialAdvShow()`, `YG2.onCloseInterAdv` | Advertisement |
| Sticky-баннер | `YG2.StickyAdActivity(bool)` | Advertisement |
| Лидерборд | `YG2.SetLeaderboard(name, score)` | Leaderboards |
| Покупки | `YG2.BuyPayments(id)`, `YG2.onPurchaseSuccess`, `YG2.onPurchaseFailed`, `YG2.purchases` | Payments |
| Оценка игры | `YG2.reviewCanShow`, `YG2.ReviewShow()` | Review |
| Ярлык | `YG2.promptCanShow`, `YG2.PromptShow()` | базовый |
| Флаги | `YG2.remoteConfig` | Flags |
| Метрика | `YG2.MetricaGoal(id)` | Metrica |

## Обязательное к проверке

1. **Поле сейва.** Код кладёт JSON в `YG2.saves.payload`. Плагин требует
   унаследовать свой класс сейвов — поле `payload` типа `string` надо
   в нём объявить, иначе не скомпилируется.
2. **Колбэки закрытия рекламы.** В коде они присваиваются как поля
   (`YG2.onCloseRewardedAdv = ...`). Если в вашей версии это события
   (`+=`), поменять на подписку и не забыть отписку.
3. **Тип счёта лидерборда.** Код режет `long` до `int` перед отправкой.
   Если плагин принимает `long`, ограничение можно снять.
4. **`YG2.purchases`.** Проверить, что у элемента есть поле `id`.

## Модули, которые надо включить

Advertisement, Storage (+ Player Stats), Leaderboards, Authorization,
Payments, Envir, Language, Flags, Server Time, Review, Metrica.

Неиспользуемые модули включать не надо: код отключённых в билд не
попадает, а вес билда — главный технический риск проекта.
