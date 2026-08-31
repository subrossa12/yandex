using System;
using System.Collections.Generic;
using UnityEngine;

namespace Sniper.Platform
{
    /// <summary>
    /// Платформа для редактора и для сборки без плагина.
    ///
    /// Это не «заглушка ради компиляции», а рабочий режим разработки:
    /// прогресс сохраняется, реклама выдаёт награду сразу, покупки
    /// проходят. Именно в нём и правится геймплей — гонять WebGL-сборку
    /// ради каждой правки баллистики невозможно.
    ///
    /// Единственное, чего здесь нет и быть не может, — серверного
    /// времени. Берётся системное, и это ровно тот случай, ради которого
    /// в бою нужно серверное: локально часы можно крутить как угодно.
    /// </summary>
    public sealed class LocalBackend : IPlatformBackend
    {
        private const string SaveKey = "sniper_contract_save_v1";

        public string Language => "ru";
        public bool IsAuthorized => true;
        public bool AdsAvailable => true;

        public void Init(Action onDone)
        {
            Debug.Log("GamePlatform: локальный режим — SDK нет, прогресс в PlayerPrefs");
            onDone?.Invoke();
        }

        public void LoadingReady() { }
        public void GameplayStart() { }
        public void GameplayStop() { }

        public long ServerTimeMs() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        public void Save(string json, bool immediate)
        {
            PlayerPrefs.SetString(SaveKey, json);
            if (immediate) PlayerPrefs.Save();
        }

        public void Load(Action<string> onLoaded)
        {
            onLoaded?.Invoke(PlayerPrefs.HasKey(SaveKey) ? PlayerPrefs.GetString(SaveKey) : null);
        }

        public void Flush() => PlayerPrefs.Save();

        public void ShowRewarded(string offerId, Action onRewarded, Action onClose)
        {
            Debug.Log("GamePlatform: rewarded «" + offerId + "» — награда выдана сразу (локальный режим)");
            onRewarded?.Invoke();
            onClose?.Invoke();
        }

        public void ShowInterstitial(Action onClose)
        {
            Debug.Log("GamePlatform: interstitial пропущен (локальный режим)");
            onClose?.Invoke();
        }

        public void ShowBanner() { }
        public void HideBanner() { }

        public void SubmitScore(string board, long score)
        {
            Debug.Log($"GamePlatform: результат {score} в таблицу «{board}» (локальный режим)");
        }

        public void RequestAuth(Action<bool> done) => done?.Invoke(true);

        public void Purchase(string productId, Action<bool> done)
        {
            Debug.Log("GamePlatform: покупка «" + productId + "» проведена (локальный режим)");
            done?.Invoke(true);
        }

        public void RestorePurchases(Action<List<string>> done) => done?.Invoke(new List<string>());

        public void CanReview(Action<bool> done) => done?.Invoke(false);
        public void RequestReview() { }
        public void CanShowShortcut(Action<bool> done) => done?.Invoke(false);
        public void ShowShortcut(Action<bool> done) => done?.Invoke(false);
    }
}
