using System;
using System.Collections.Generic;
using UnityEngine;

namespace Sniper.Core
{
    /// <summary>
    /// Всё сохраняемое состояние игрока в одном сериализуемом объекте.
    ///
    /// Плоские списки вместо словарей — не стилистика, а требование
    /// JsonUtility: словари он не умеет. Зато сейв читается глазами и
    /// переживает смену версии без миграций.
    /// </summary>
    [Serializable]
    public sealed class GameState
    {
        public int Version = 1;
        public int Currency;
        public int Sessions;

        /// <summary>Звёзды по миссиям: "m01:3". Ключи те же, что в missions.json.</summary>
        public List<string> MissionStars = new List<string>();

        public List<string> OwnedRifles = new List<string>();
        public List<string> OwnedModules = new List<string>();
        public string EquippedRifle = "vega";

        /// <summary>Лучшее попадание по дальности — уходит в лидерборд.</summary>
        public int BestRangeMeters;
        public long TotalScore;

        /// <summary>Ежедневный контракт: день по серверному времени.</summary>
        public long DailyDay;
        public bool DailyDone;

        /// <summary>Разовые события: подсказки, оценка игры, ярлык.</summary>
        public List<string> Flags = new List<string>();

        // ------------------------------------------------------------ //

        public static GameState CreateNew()
        {
            var s = new GameState();
            s.Currency = Core.Flags.Int("start.currency", 0);
            s.OwnedRifles.Add("vega");
            s.EquippedRifle = "vega";
            return s;
        }

        public static GameState FromJson(string json)
        {
            if (string.IsNullOrEmpty(json)) return CreateNew();
            try
            {
                var s = JsonUtility.FromJson<GameState>(json);
                if (s == null) return CreateNew();
                s.Normalize();
                return s;
            }
            catch (Exception e)
            {
                Debug.LogWarning("Сейв не разобран, начинаем заново: " + e.Message);
                return CreateNew();
            }
        }

        public string ToJson() => JsonUtility.ToJson(this);

        /// <summary>
        /// Чистка после загрузки. Сейв мог прийти из другой версии, где
        /// винтовки назывались иначе, — пустая экипировка сломала бы
        /// запуск миссии, поэтому чинится молча.
        /// </summary>
        private void Normalize()
        {
            MissionStars ??= new List<string>();
            OwnedRifles ??= new List<string>();
            OwnedModules ??= new List<string>();
            Flags ??= new List<string>();

            if (OwnedRifles.Count == 0) OwnedRifles.Add("vega");
            if (string.IsNullOrEmpty(EquippedRifle) || !OwnedRifles.Contains(EquippedRifle))
            {
                EquippedRifle = OwnedRifles[0];
            }

            Currency = Mathf.Max(0, Currency);
            BestRangeMeters = Mathf.Max(0, BestRangeMeters);
            if (TotalScore < 0) TotalScore = 0;
        }

        // ------------------------------------------------------------ //

        public int StarsFor(string missionId)
        {
            var prefix = missionId + ":";
            foreach (var entry in MissionStars)
            {
                if (entry.StartsWith(prefix, StringComparison.Ordinal) &&
                    int.TryParse(entry.Substring(prefix.Length), out var v))
                {
                    return v;
                }
            }
            return 0;
        }

        /// <summary>Звёзды только растут: переигровка хуже прошлой не отнимает.</summary>
        public void SetStars(string missionId, int stars)
        {
            stars = Mathf.Clamp(stars, 0, 3);
            if (stars <= StarsFor(missionId)) return;

            var prefix = missionId + ":";
            MissionStars.RemoveAll(e => e.StartsWith(prefix, StringComparison.Ordinal));
            MissionStars.Add(prefix + stars);
        }

        public int TotalStars()
        {
            var sum = 0;
            foreach (var entry in MissionStars)
            {
                var i = entry.IndexOf(':');
                if (i > 0 && int.TryParse(entry.Substring(i + 1), out var v)) sum += v;
            }
            return sum;
        }

        public bool HasRifle(string id) => OwnedRifles.Contains(id);
        public bool HasModule(string id) => OwnedModules.Contains(id);

        public bool HasFlag(string id) => Flags.Contains(id);
        public void SetFlag(string id) { if (!Flags.Contains(id)) Flags.Add(id); }
    }
}
