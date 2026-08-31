using System;
using System.Collections.Generic;
using UnityEngine;

namespace Sniper.Missions
{
    /// <summary>Расстановка одного объекта в миссии.</summary>
    [Serializable]
    public struct Placement
    {
        public float x, y, z;
        public float sx, sy, sz;
        public float rot;
        public string kind;        // block | cover | target | guard | hazard | civilian

        public Vector3 Position => new Vector3(x, y, z);
        public Vector3 Scale => new Vector3(
            sx > 0 ? sx : 1f,
            sy > 0 ? sy : 1f,
            sz > 0 ? sz : 1f);
    }

    /// <summary>
    /// Контракт. Данные, а не сцена.
    ///
    /// Миссии описаны в JSON, а расстановку по ним собирает
    /// GreyboxBuilder прямо в рантайме. Так сделано специально: сцены
    /// Unity — бинарные файлы, их нельзя ни посмотреть в диффе, ни
    /// поправить текстом, а на этапе, когда баланс миссий крутится
    /// каждый день, это дороже любых удобств редактора.
    ///
    /// Когда появятся ассеты, builder начнёт ставить префабы вместо
    /// примитивов — сами миссии при этом не изменятся.
    /// </summary>
    [Serializable]
    public sealed class MissionDefinition
    {
        public string id;
        public string locationId;
        public int seed;
        public string timeOfDay;        // day | dusk | night
        public float windScale = 1f;

        public float shooterX, shooterY, shooterZ;
        public float shooterYaw;

        public int reward;
        public float timeLimitSeconds;  // для челленджа «за N секунд»
        public int guardAlertSeconds;   // сколько охрана «терпит» до тревоги

        public List<Placement> placements = new List<Placement>();

        public Vector3 ShooterPosition => new Vector3(shooterX, shooterY, shooterZ);

        public Vector3 ShooterForward =>
            Quaternion.Euler(0f, shooterYaw, 0f) * Vector3.forward;

        /// <summary>Награда с учётом флагов: цифры крутятся из Консоли.</summary>
        public int RewardWithFlags() =>
            Core.Flags.Int($"missions.{id}.reward", reward);

        public float TimeLimitWithFlags() =>
            Core.Flags.Num($"missions.{id}.timeLimit", timeLimitSeconds);
    }

    [Serializable]
    public sealed class MissionList
    {
        public List<MissionDefinition> missions = new List<MissionDefinition>();
    }

    /// <summary>Загрузка контрактов из Resources.</summary>
    public static class MissionLibrary
    {
        private static MissionList _list;

        public static List<MissionDefinition> All
        {
            get
            {
                if (_list != null) return _list.missions;

                var asset = Resources.Load<TextAsset>("missions");
                if (asset == null)
                {
                    Debug.LogError("Не найден Resources/missions.json");
                    _list = new MissionList();
                    return _list.missions;
                }

                _list = JsonUtility.FromJson<MissionList>(asset.text) ?? new MissionList();
                return _list.missions;
            }
        }

        public static MissionDefinition ById(string id)
        {
            foreach (var m in All) if (m.id == id) return m;
            return null;
        }

        /// <summary>
        /// Контракт открыт, если набрано достаточно звёзд. Порог — через
        /// флаги: если игроки массово застревают, его двигают из Консоли,
        /// а не новым билдом.
        /// </summary>
        public static bool IsUnlocked(MissionDefinition m, Core.GameState state)
        {
            var index = All.IndexOf(m);
            if (index <= 0) return true;
            var required = Core.Flags.Int($"missions.{m.id}.starsRequired", Mathf.Max(0, index - 1));
            return state.TotalStars() >= required;
        }
    }
}
