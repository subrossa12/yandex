using System;
using System.Collections.Generic;

namespace Sniper.Platform
{
    /// <summary>
    /// Что фасад требует от платформы. Реализаций две: LocalBackend для
    /// редактора и YandexBackend для сборки с плагином.
    ///
    /// Интерфейс намеренно узкий. Всё, что можно решить на стороне игры —
    /// дебаунс отправки результата, кулдауны офферов, проверка
    /// авторизации перед лидербордом — решается в фасаде, а не здесь.
    /// Так обе реализации остаются короткими и одинаково себя ведут.
    /// </summary>
    public interface IPlatformBackend
    {
        string Language { get; }
        bool IsAuthorized { get; }
        bool AdsAvailable { get; }

        void Init(Action onDone);
        void LoadingReady();
        void GameplayStart();
        void GameplayStop();

        long ServerTimeMs();

        void Save(string json, bool immediate);
        void Load(Action<string> onLoaded);
        void Flush();

        void ShowRewarded(string offerId, Action onRewarded, Action onClose);
        void ShowInterstitial(Action onClose);
        void ShowBanner();
        void HideBanner();

        void SubmitScore(string board, long score);
        void RequestAuth(Action<bool> done);

        void Purchase(string productId, Action<bool> done);
        void RestorePurchases(Action<List<string>> done);

        void CanReview(Action<bool> done);
        void RequestReview();
        void CanShowShortcut(Action<bool> done);
        void ShowShortcut(Action<bool> done);
    }
}
