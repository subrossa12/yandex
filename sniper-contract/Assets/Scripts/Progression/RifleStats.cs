using System;
using System.Collections.Generic;
using UnityEngine;

namespace Sniper.Progression
{
    /// <summary>Характеристики винтовки. Все числа идут через флаги.</summary>
    [Serializable]
    public struct RifleStats
    {
        public string Id;
        public float MuzzleSpeed;     // м/с — определяет упреждение
        public float Steadiness;      // устойчивость: делит дрожание прицела
        public float CycleSeconds;    // перезарядка между выстрелами
        public int Capacity;
        public int Price;

        public static RifleStats Load(string id)
        {
            return new RifleStats
            {
                Id = id,
                MuzzleSpeed = Core.Flags.Num($"rifles.{id}.muzzleSpeed", 820f),
                Steadiness = Core.Flags.Num($"rifles.{id}.steadiness", 1f),
                CycleSeconds = Core.Flags.Num($"rifles.{id}.cycleSeconds", 1.6f),
                Capacity = Core.Flags.Int($"rifles.{id}.capacity", 5),
                Price = Core.Flags.Int($"rifles.{id}.price", 0)
            };
        }
    }

    /// <summary>
    /// Снаряжение игрока: винтовки и модули.
    ///
    /// Модули намеренно меняют не «урон», а то, как игрок читает сцену:
    /// дальномер показывает дистанцию и поправку, сошки уменьшают
    /// дрожание, глушитель даёт запас времени до тревоги. Прибавка к
    /// цифре урона в игре, где попадание решает всё, не ощущается вовсе.
    /// </summary>
    public static class Loadout
    {
        public static IEnumerable<string> AllRifles()
        {
            // идентификаторы читаются из конфига: состав можно менять
            // флагами, не пересобирая билд
            var list = Core.Flags.Str("rifles.order", "vega,korshun,sokol,berkut").Split(',');
            foreach (var id in list)
            {
                var trimmed = id.Trim();
                if (trimmed.Length > 0) yield return trimmed;
            }
        }

        public static IEnumerable<string> AllModules()
        {
            var list = Core.Flags.Str("modules.order", "rangefinder,bipod,suppressor,scope8").Split(',');
            foreach (var id in list)
            {
                var trimmed = id.Trim();
                if (trimmed.Length > 0) yield return trimmed;
            }
        }

        public static int ModulePrice(string id) => Core.Flags.Int($"modules.{id}.price", 400);

        /// <summary>Сколько звёзд нужно, чтобы товар вообще появился в списке.</summary>
        public static int RifleStarsRequired(string id) => Core.Flags.Int($"rifles.{id}.stars", 0);

        public static int ModuleStarsRequired(string id) => Core.Flags.Int($"modules.{id}.stars", 0);

        /// <summary>Кратности прицела: базовые или расширенные модулем.</summary>
        public static float[] ZoomLevels(bool hasScope8)
        {
            return hasScope8
                ? new[] { 1f, 4f, 8f, 12f }
                : new[] { 1f, 4f, 8f };
        }

        /// <summary>Сошки уменьшают дрожание — учитываются в устойчивости.</summary>
        public static RifleStats Apply(RifleStats stats, Core.GameState state)
        {
            if (state.HasModule("bipod"))
            {
                stats.Steadiness *= Core.Flags.Num("modules.bipod.steadiness", 1.7f);
            }
            return stats;
        }
    }
}
