using System.Collections.Generic;
using UnityEngine;

namespace Sniper.Platform
{
    /// <summary>
    /// Цели Яндекс Метрики.
    ///
    /// Без них воронка непрозрачна: непонятно, на какой миссии игроки
    /// отваливаются, какой оффер не дожимается и какая винтовка не
    /// открывается никогда.
    ///
    /// Пока номер счётчика пуст (а в билде он пуст), наружу не уходит
    /// ничего — цели просто копятся в журнале. Журнал открыт наружу
    /// специально: по нему автотест проверяет, что события вообще
    /// снимаются, не поднимая настоящий счётчик.
    /// </summary>
    public static class Metrica
    {
        private static string _counterId = string.Empty;
        private static readonly List<string> Journal = new List<string>();

        public static bool Active => !string.IsNullOrEmpty(_counterId);

        public static void Init(string counterId)
        {
            _counterId = counterId ?? string.Empty;
            if (!Active)
            {
                Debug.Log("Метрика: номер счётчика не задан — внешних запросов не будет");
            }
        }

        public static void Goal(string id)
        {
            if (string.IsNullOrEmpty(id)) return;

            Journal.Add(id);
            if (Journal.Count > 200) Journal.RemoveAt(0);

            if (!Active) return;
#if YG2
            YG.YG2.MetricaGoal(id);
#endif
        }

        /// <summary>Последние снятые цели — для отладки и автотестов.</summary>
        public static IReadOnlyList<string> Recent => Journal;

        // Имена целей собраны здесь, чтобы их же завести в интерфейсе
        // Метрики и не разойтись в написании.
        public static string MissionStarted(string id) => "mission_started_" + id;
        public static string MissionFailed(string id, string reason) => $"mission_failed_{id}_{reason}";
        public static string MissionThreeStars(string id) => "mission_3stars_" + id;
        public static string RifleUnlocked(string id) => "rifle_unlocked_" + id;
        public static string Purchased(string id) => "iap_purchased_" + id;
    }
}
