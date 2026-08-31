using System;
using System.Collections.Generic;
using System.Globalization;
using UnityEngine;

namespace Sniper.Core
{
    /// <summary>
    /// Единая точка чтения настроек баланса.
    ///
    /// Схема та же, что и в остальных проектах: локальные дефолты зашиты
    /// в билд, поверх них ложатся флаги удалённой конфигурации, а
    /// остальной код не знает, откуда пришло значение.
    ///
    ///   Resources/balance.json  ->  дефолты, работают всегда
    ///          | перекрываются
    ///   модуль Flags плагина    ->  один запрос на старте
    ///          |
    ///   эффективный конфиг      ->  Flags.Num / Flags.Bool / Flags.Str
    ///
    /// Игра обязана полностью работать на дефолтах: у игрока может не
    /// быть сети, флаги могут не приехать, значение может прийти
    /// мусорным. Каждый из этих случаев здесь штатный, а не ошибка.
    /// </summary>
    public static class Flags
    {
        private static readonly Dictionary<string, string> Values =
            new Dictionary<string, string>(StringComparer.Ordinal);

        private static readonly Dictionary<string, string> Defaults =
            new Dictionary<string, string>(StringComparer.Ordinal);

        private static bool _loaded;
        private static int _appliedRemote;

        /// <summary>Сколько удалённых значений реально перекрыло дефолты.</summary>
        public static int AppliedRemote => _appliedRemote;

        /// <summary>Приехала ли удалённая конфигурация вообще.</summary>
        public static bool RemoteLoaded { get; private set; }

        /// <summary>
        /// Загружает локальные дефолты. Вызывается до любого обращения к
        /// сети: если флаги не приедут, игра уже полностью настроена.
        /// </summary>
        public static void LoadDefaults()
        {
            if (_loaded) return;
            _loaded = true;

            var asset = Resources.Load<TextAsset>("balance");
            if (asset == null)
            {
                Debug.LogError("Flags: не найден Resources/balance.json — игра пойдёт на встроенных значениях");
                return;
            }

            foreach (var pair in MiniJson.FlattenToStrings(asset.text))
            {
                Defaults[pair.Key] = pair.Value;
                Values[pair.Key] = pair.Value;
            }
        }

        /// <summary>
        /// Накатывает удалённые значения. Неизвестные ключи игнорируются,
        /// мусорные отбрасываются поштучно: один плохой флаг не должен
        /// ронять весь конфиг.
        /// </summary>
        public static void ApplyRemote(IDictionary<string, string> remote)
        {
            if (remote == null) return;
            RemoteLoaded = true;

            foreach (var kv in remote)
            {
                if (!Defaults.ContainsKey(kv.Key)) continue;      // чужой ключ
                if (string.IsNullOrEmpty(kv.Value)) continue;
                if (!IsSane(kv.Key, kv.Value)) continue;

                if (Values[kv.Key] != kv.Value)
                {
                    Values[kv.Key] = kv.Value;
                    _appliedRemote++;
                }
            }
        }

        /// <summary>
        /// Дефолты в том виде, в каком их ждёт модуль Flags: платформа
        /// вернёт их же для ключей, не заданных в Консоли.
        /// </summary>
        public static Dictionary<string, string> DefaultsForRequest()
        {
            LoadDefaults();
            return new Dictionary<string, string>(Defaults, StringComparer.Ordinal);
        }

        public static float Num(string key, float fallback)
        {
            LoadDefaults();
            if (Values.TryGetValue(key, out var raw) &&
                float.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out var v) &&
                !float.IsNaN(v) && !float.IsInfinity(v))
            {
                return v;
            }
            return fallback;
        }

        public static int Int(string key, int fallback)
        {
            return Mathf.RoundToInt(Num(key, fallback));
        }

        public static bool Bool(string key, bool fallback)
        {
            LoadDefaults();
            if (!Values.TryGetValue(key, out var raw)) return fallback;
            if (raw == "1" || raw.Equals("true", StringComparison.OrdinalIgnoreCase)) return true;
            if (raw == "0" || raw.Equals("false", StringComparison.OrdinalIgnoreCase)) return false;
            return fallback;
        }

        public static string Str(string key, string fallback)
        {
            LoadDefaults();
            return Values.TryGetValue(key, out var raw) && raw.Length > 0 ? raw : fallback;
        }

        /// <summary>
        /// Санитарная проверка. Отрицательная скорость пули или нулевое
        /// время полёта ломают игру наглухо, поэтому такие значения не
        /// принимаются, каким бы ни был флаг.
        /// </summary>
        private static bool IsSane(string key, string raw)
        {
            if (raw.Equals("true", StringComparison.OrdinalIgnoreCase) ||
                raw.Equals("false", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            if (!float.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out var v))
            {
                // строковые флаги (идентификаторы) пропускаем как есть
                return !key.Contains("speed") && !key.Contains("time") && !key.Contains("reward");
            }

            if (float.IsNaN(v) || float.IsInfinity(v)) return false;

            if (key.EndsWith("Speed") || key.EndsWith("Ms") || key.EndsWith("Seconds") ||
                key.EndsWith("Reward") || key.EndsWith("Price") || key.EndsWith("Capacity"))
            {
                return v > 0f;
            }

            if (key.Contains("chance") || key.Contains("Chance")) return v >= 0f && v <= 1f;
            return v >= 0f;
        }
    }
}
