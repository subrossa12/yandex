#if YG2
using System;
using System.Collections.Generic;
using UnityEngine;
using YG;

namespace Sniper.Platform
{
    /// <summary>
    /// Единственный файл во всём проекте, который знает про плагин.
    ///
    /// Так сделано намеренно. Сигнатуры плагина меняются от версии к
    /// версии, и когда они поменяются, чинить надо будет один файл, а не
    /// полсотни вызовов по всему коду. Список используемых символов
    /// плагина вынесен в docs/plugin-api.md — по нему их и сверяют с
    /// документацией при обновлении.
    ///
    /// Компилируется только при определённом символе YG2, который
    /// добавляет сам плагин. Без плагина проект собирается и играется
    /// на LocalBackend — это не сломанное состояние, а рабочий режим
    /// разработки.
    /// </summary>
    public sealed class YandexBackend : IPlatformBackend
    {
        private Action<bool> _purchaseCallback;

        public string Language
        {
            get
            {
                var lang = YG2.envir.language;
                if (string.IsNullOrEmpty(lang)) return "ru";
                lang = lang.ToLowerInvariant();
                if (lang.StartsWith("ru")) return "ru";
                if (lang.StartsWith("tr")) return "tr";
                return "en";
            }
        }

        public bool IsAuthorized => YG2.player.auth;
        public bool AdsAvailable => true;

        public void Init(Action onDone)
        {
            // Флаги запрашиваются один раз на старте и никогда по ходу
            // игры: баланс не должен меняться под игроком посреди миссии.
            try
            {
                var remote = new Dictionary<string, string>(StringComparer.Ordinal);
                foreach (var kv in YG2.remoteConfig) remote[kv.Key] = kv.Value;
                Core.Flags.ApplyRemote(remote);
            }
            catch (Exception e)
            {
                // конфигурация не приехала — играем на дефолтах, это штатно
                Debug.LogWarning("Флаги не применены, работаем на дефолтах: " + e.Message);
            }

            Metrica.Init(Core.Flags.Str("metrica.counterId", string.Empty));
            onDone?.Invoke();
        }

        public void LoadingReady() => YG2.GameReadyAPI();
        public void GameplayStart() => YG2.GameplayStart();
        public void GameplayStop() => YG2.GameplayStop();

        public long ServerTimeMs() => YG2.serverTime;

        public void Save(string json, bool immediate)
        {
            YG2.saves.payload = json;
            if (immediate) YG2.SaveProgress();
            else YG2.SetDefaultSaves();     // отложенная запись плагина
        }

        public void Load(Action<string> onLoaded) => onLoaded?.Invoke(YG2.saves.payload);

        public void Flush() => YG2.SaveProgress();

        public void ShowRewarded(string offerId, Action onRewarded, Action onClose)
        {
            // Перед показом обязателен флаш прогресса и снятие разметки
            // геймплея: ролик прерывает игру (п. 1.19.3, п. 4.7).
            YG2.SaveProgress();
            YG2.GameplayStop();

            var rewarded = false;
            YG2.RewardedAdvShow(offerId, () =>
            {
                rewarded = true;
                onRewarded?.Invoke();
            });

            YG2.onCloseRewardedAdv = () =>
            {
                YG2.GameplayStart();
                onClose?.Invoke();
                if (!rewarded) Debug.Log("Ролик закрыт без награды — это нормальный сценарий");
            };
        }

        public void ShowInterstitial(Action onClose)
        {
            YG2.SaveProgress();
            YG2.GameplayStop();
            YG2.InterstitialAdvShow();
            YG2.onCloseInterAdv = () =>
            {
                YG2.GameplayStart();
                onClose?.Invoke();
            };
        }

        public void ShowBanner() => YG2.StickyAdActivity(true);
        public void HideBanner() => YG2.StickyAdActivity(false);

        public void SubmitScore(string board, long score)
        {
            // Не выходим за точность целых: у плагина int, а суммарный
            // счёт за все контракты вырасти выше может.
            var value = score > int.MaxValue ? int.MaxValue : (int)score;
            YG2.SetLeaderboard(board, value);
        }

        public void RequestAuth(Action<bool> done)
        {
            YG2.OpenAuthDialog();
            YG2.onGetSDKData = () => done?.Invoke(YG2.player.auth);
        }

        public void Purchase(string productId, Action<bool> done)
        {
            _purchaseCallback = done;
            YG2.onPurchaseSuccess = id =>
            {
                var cb = _purchaseCallback;
                _purchaseCallback = null;
                cb?.Invoke(id == productId);
            };
            YG2.onPurchaseFailed = id =>
            {
                var cb = _purchaseCallback;
                _purchaseCallback = null;
                cb?.Invoke(false);            // игрок отменил — нормальный сценарий
            };
            YG2.BuyPayments(productId);
        }

        public void RestorePurchases(Action<List<string>> done)
        {
            var owned = new List<string>();
            try
            {
                foreach (var p in YG2.purchases) owned.Add(p.id);
            }
            catch (Exception e)
            {
                Debug.LogWarning("Список покупок недоступен: " + e.Message);
            }
            done?.Invoke(owned);
        }

        public void CanReview(Action<bool> done) => done?.Invoke(YG2.reviewCanShow);
        public void RequestReview() => YG2.ReviewShow();

        public void CanShowShortcut(Action<bool> done) => done?.Invoke(YG2.promptCanShow);

        public void ShowShortcut(Action<bool> done)
        {
            YG2.PromptShow();
            done?.Invoke(true);
        }
    }
}
#endif
