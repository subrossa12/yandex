using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Sniper.Core
{
    /// <summary>
    /// Минимальный разбор JSON — ровно столько, сколько нужно слою флагов.
    ///
    /// Зачем свой, когда есть JsonUtility: тот умеет только раскладывать
    /// JSON по полям заранее описанного класса. Здесь же задача обратная —
    /// превратить произвольное дерево настроек в плоские строковые пары
    /// вида "ballistics.bulletSpeed" -> "870", потому что удалённая
    /// конфигурация оперирует именно плоскими ключами.
    ///
    /// Разбор нестрогий: на битом файле возвращается то, что успело
    /// разобраться, а не исключение. Конфиг не то место, где стоит ронять
    /// игру на старте.
    /// </summary>
    public static class MiniJson
    {
        public static Dictionary<string, string> FlattenToStrings(string json)
        {
            var result = new Dictionary<string, string>(StringComparer.Ordinal);
            try
            {
                var parser = new Parser(json);
                var root = parser.ParseValue();
                Flatten(string.Empty, root, result);
            }
            catch (Exception e)
            {
                UnityEngine.Debug.LogWarning("MiniJson: конфиг разобран частично — " + e.Message);
            }
            return result;
        }

        private static void Flatten(string prefix, object node, IDictionary<string, string> into)
        {
            switch (node)
            {
                case Dictionary<string, object> map:
                    foreach (var kv in map)
                    {
                        var key = prefix.Length == 0 ? kv.Key : prefix + "." + kv.Key;
                        Flatten(key, kv.Value, into);
                    }
                    break;

                case List<object> list:
                    // массивы сводим в строку через запятую: так их удобно
                    // задавать флагом одной строкой
                    var parts = new List<string>(list.Count);
                    foreach (var item in list) parts.Add(Scalar(item));
                    into[prefix] = string.Join(",", parts);
                    break;

                default:
                    if (prefix.Length > 0) into[prefix] = Scalar(node);
                    break;
            }
        }

        private static string Scalar(object v)
        {
            switch (v)
            {
                case null: return string.Empty;
                case bool b: return b ? "true" : "false";
                case double d: return d.ToString("R", CultureInfo.InvariantCulture);
                default: return Convert.ToString(v, CultureInfo.InvariantCulture);
            }
        }

        private sealed class Parser
        {
            private readonly string _s;
            private int _i;

            public Parser(string s) { _s = s ?? string.Empty; }

            public object ParseValue()
            {
                SkipWhite();
                if (_i >= _s.Length) return null;

                switch (_s[_i])
                {
                    case '{': return ParseObject();
                    case '[': return ParseArray();
                    case '"': return ParseString();
                    case 't': _i += 4; return true;
                    case 'f': _i += 5; return false;
                    case 'n': _i += 4; return null;
                    default: return ParseNumber();
                }
            }

            private Dictionary<string, object> ParseObject()
            {
                var map = new Dictionary<string, object>(StringComparer.Ordinal);
                _i++;                                   // {
                while (true)
                {
                    SkipWhite();
                    if (_i >= _s.Length) break;
                    if (_s[_i] == '}') { _i++; break; }
                    if (_s[_i] == ',') { _i++; continue; }

                    var key = ParseString();
                    SkipWhite();
                    if (_i < _s.Length && _s[_i] == ':') _i++;
                    map[key] = ParseValue();
                }
                return map;
            }

            private List<object> ParseArray()
            {
                var list = new List<object>();
                _i++;                                   // [
                while (true)
                {
                    SkipWhite();
                    if (_i >= _s.Length) break;
                    if (_s[_i] == ']') { _i++; break; }
                    if (_s[_i] == ',') { _i++; continue; }
                    list.Add(ParseValue());
                }
                return list;
            }

            private string ParseString()
            {
                SkipWhite();
                if (_i >= _s.Length || _s[_i] != '"') return string.Empty;

                var sb = new StringBuilder();
                _i++;                                   // "
                while (_i < _s.Length)
                {
                    var c = _s[_i++];
                    if (c == '"') break;
                    if (c != '\\') { sb.Append(c); continue; }

                    if (_i >= _s.Length) break;
                    var esc = _s[_i++];
                    switch (esc)
                    {
                        case 'n': sb.Append('\n'); break;
                        case 't': sb.Append('\t'); break;
                        case 'r': sb.Append('\r'); break;
                        case 'u':
                            if (_i + 4 <= _s.Length &&
                                int.TryParse(_s.Substring(_i, 4), NumberStyles.HexNumber,
                                             CultureInfo.InvariantCulture, out var code))
                            {
                                sb.Append((char)code);
                                _i += 4;
                            }
                            break;
                        default: sb.Append(esc); break;
                    }
                }
                return sb.ToString();
            }

            private object ParseNumber()
            {
                var start = _i;
                while (_i < _s.Length && "+-.eE0123456789".IndexOf(_s[_i]) >= 0) _i++;
                var text = _s.Substring(start, _i - start);
                return double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var d)
                    ? (object)d
                    : null;
            }

            private void SkipWhite()
            {
                while (_i < _s.Length && char.IsWhiteSpace(_s[_i])) _i++;

                // комментарии в конфиге удобны, а стандарт их не знает —
                // пропускаем, чтобы balance.json можно было пояснять
                if (_i + 1 < _s.Length && _s[_i] == '/' && _s[_i + 1] == '/')
                {
                    while (_i < _s.Length && _s[_i] != '\n') _i++;
                    SkipWhite();
                }
            }
        }
    }
}
