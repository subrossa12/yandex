using System;
using System.Collections.Generic;
using UnityEngine;

namespace Sniper.Platform
{
    /// <summary>
    /// Фасад платформы. Весь игровой код обращается только сюда и ничего
    /// не знает ни про Яндекс, ни про плагин.
    ///
    /// Зачем прослойка, если плагин и так обёртка: во-первых, игра должна
    /// запускаться и играться в редакторе, где SDK нет вовсе; во-вторых,
    /// сигнатуры плагина меняются от версии к версии, и когда они
    /// поменяются, править надо одно место (YandexBackend), а не полсотни
    /// вызовов по всему проекту.
    ///
    /// Правило простое: ни одного using на плагин нигде, кроме
    /// YandexBackend.cs.
    /// </summary>
    public static class GamePlatform
    {
        private static IPlatformBackend _backend;

        public static bool IsReady { get; private set; }

        /// <summary>Язык интерфейса: ru / tr / en.</summary>
        public static string Language => _backend?.Language ?? "ru";

        public static bool IsAuthorized => _backend?.IsAuthorized ?? false;

        /// <summary>Реклама вообще доступна (в редакторе — заглушка).</summary>
        public static bool AdsAvailable => _backend?.AdsAvailable ?? false;

        /// <summary>
        /// Поднимает платформу и удалённую конфигурацию. Дефолты флагов
        /// загружаются ДО запроса: если запрос не вернётся, игра уже
        /// полностью настроена.
        /// </summary>
        public static void Init(Action onDone)
        {
            Core.Flags.LoadDefaults();

#if YG2
            _backend = new YandexBackend();
#else
            _backend = new LocalBackend();
#endif

            _backend.Init(() =>
            {
                IsReady = true;
                onDone?.Invoke();
            });
        }

        /// <summary>
        /// Игрок реально может начать играть. Без этого вызова модерация
        /// заворачивает (п. 1.19.2), поэтому дёргается он ровно один раз
        /// и ровно в тот момент, когда убран прелоадер.
        /// </summary>
        public static void LoadingReady() => _backend?.LoadingReady();

        /// <summary>Разметка активного геймплея — вход в миссию.</summary>
        public static void GameplayStart() => _backend?.GameplayStart();

        /// <summary>Разметка активного геймплея — выход, пауза, реклама.</summary>
        public static void GameplayStop() => _backend?.GameplayStop();

        /// <summary>
        /// Серверное время в миллисекундах. Ежедневный контракт считается
        /// только по нему: по системным часам его сбрасывали бы переводом
        /// времени на устройстве.
        /// </summary>
        public static long ServerTimeMs() =>
            _backend?.ServerTimeMs() ?? DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        public static void Save(string json, bool immediate) => _backend?.Save(json, immediate);

        public static void Load(Action<string> onLoaded)
        {
            if (_backend == null) { onLoaded?.Invoke(null); return; }
            _backend.Load(onLoaded);
        }

        /// <summary>Принудительная запись: перед рекламой и при сворачивании.</summary>
        public static void Flush() => _backend?.Flush();

        /// <summary>
        /// Rewarded. Награда выдаётся ТОЛЬКО в onRewarded: onClose
        /// приходит и когда игрок закрыл ролик, не досмотрев.
        /// </summary>
        public static void ShowRewarded(string offerId, Action onRewarded, Action onClose = null)
        {
            if (_backend == null) { onClose?.Invoke(); return; }
            Metrica.Goal("rv_shown_" + offerId);
            _backend.ShowRewarded(offerId,
                () =>
                {
                    Metrica.Goal("rv_rewarded_" + offerId);
                    onRewarded?.Invoke();
                },
                onClose);
        }

        /// <summary>
        /// Interstitial. Только в логических паузах — экран итогов миссии
        /// и возврат в меню контрактов. Никогда по таймеру и никогда во
        /// время прицеливания: случайный клик РСЯ считает фродом и режет
        /// доход по всей игре.
        /// </summary>
        public static void ShowInterstitial(Action onClose = null)
        {
            if (_backend == null) { onClose?.Invoke(); return; }
            _backend.ShowInterstitial(onClose);
        }

        /// <summary>
        /// Sticky-баннер включается в Консоли, не здесь. Эти два метода —
        /// заложенная возможность прятать его на время миссии; включается
        /// она флагом и по умолчанию выключена.
        /// </summary>
        public static void ShowBanner()
        {
            if (!Core.Flags.Bool("banner.manageFromCode", false)) return;
            _backend?.ShowBanner();
        }

        public static void HideBanner()
        {
            if (!Core.Flags.Bool("banner.manageFromCode", false)) return;
            if (!Core.Flags.Bool("banner.hideInGameplay", false)) return;
            _backend?.HideBanner();
        }

        /// <summary>
        /// Отправка результата. Только для авторизованных и не чаще раза
        /// в секунду — платформа отклоняет более частые запросы, поэтому
        /// дебаунс стоит здесь, а не на стороне вызывающего кода.
        /// </summary>
        private static float _lastScoreAt = -999f;

        public static void SubmitScore(string board, long score)
        {
            if (_backend == null || !_backend.IsAuthorized) return;
            if (score <= 0) return;
            if (Time.realtimeSinceStartup - _lastScoreAt < 1.2f) return;
            _lastScoreAt = Time.realtimeSinceStartup;
            _backend.SubmitScore(board, score);
        }

        public static void RequestAuth(Action<bool> done) => _backend?.RequestAuth(done);

        public static void Purchase(string productId, Action<bool> done) =>
            _backend?.Purchase(productId, done);

        /// <summary>
        /// Разбор покупок при старте. Постоянные товары возвращаются в
        /// игру, расходуемые выдаются и гасятся — на случай, если процесс
        /// прервался на прошлом запуске.
        /// </summary>
        public static void RestorePurchases(Action<List<string>> done) =>
            _backend?.RestorePurchases(done);

        public static void CanReview(Action<bool> done)
        {
            if (_backend == null) { done?.Invoke(false); return; }
            _backend.CanReview(done);
        }

        public static void RequestReview() => _backend?.RequestReview();

        public static void CanShowShortcut(Action<bool> done)
        {
            if (_backend == null) { done?.Invoke(false); return; }
            _backend.CanShowShortcut(done);
        }

        public static void ShowShortcut(Action<bool> done) => _backend?.ShowShortcut(done);
    }
}
