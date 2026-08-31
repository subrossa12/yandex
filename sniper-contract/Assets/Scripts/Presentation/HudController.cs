using UnityEngine;
using Sniper.Aiming;
using Sniper.Ballistics;
using Sniper.Core;
using Sniper.Localization;
using Sniper.Missions;

namespace Sniper.Presentation
{
    /// <summary>
    /// Интерфейс: прицел, приборы, экраны контрактов и итогов.
    ///
    /// Нарисован на IMGUI, а не на uGUI. Это осознанный выбор для этапа
    /// greybox: интерфейс здесь — данные, а не префабы, его видно в
    /// диффе и он не требует ни одного бинарного ассета. Когда дойдёт до
    /// оформления, вёрстка переедет на uGUI, а логика экранов останется
    /// та же.
    ///
    /// Всё раскладывается от размера экрана: половина аудитории играет с
    /// телефона, и ничего не должно ни наезжать, ни обрезаться (п. 1.6.2.3).
    /// </summary>
    public sealed class HudController : MonoBehaviour
    {
        private enum Screen { Contracts, Mission, Result, Loadout }

        private Game _game;
        private ScopeController _scope;
        private BreathController _breath;
        private Wind _wind;
        private MissionRunner _runner;

        private Screen _screen = Screen.Contracts;
        private MissionRunner.Report _report;
        private Vector2 _scroll;
        private bool _intel;

        private GUIStyle _label, _big, _button, _panel;
        private bool _stylesReady;

        public void Bind(Game game, ScopeController scope, BreathController breath,
                         Wind wind, MissionRunner runner)
        {
            _game = game;
            _scope = scope;
            _breath = breath;
            _wind = wind;
            _runner = runner;
        }

        public void ShowContracts() { _screen = Screen.Contracts; _intel = false; }
        public void ShowMission() { _screen = Screen.Mission; }
        public void ShowLoadout() { _screen = Screen.Loadout; }
        public void EnableIntel() { _intel = true; }
        public void Refresh() { }

        public void ShowResult(MissionRunner.Report report)
        {
            _report = report;
            _screen = Screen.Result;
        }

        private void EnsureStyles()
        {
            if (_stylesReady) return;
            _stylesReady = true;

            var scale = Mathf.Max(1f, UnityEngine.Screen.height / 720f);

            _label = new GUIStyle(GUI.skin.label)
            {
                fontSize = Mathf.RoundToInt(16 * scale),
                normal = { textColor = new Color(0.88f, 0.9f, 0.92f) }
            };
            _big = new GUIStyle(_label) { fontSize = Mathf.RoundToInt(28 * scale), fontStyle = FontStyle.Bold };
            _button = new GUIStyle(GUI.skin.button) { fontSize = Mathf.RoundToInt(18 * scale) };
            _panel = new GUIStyle(GUI.skin.box);
        }

        private void OnGUI()
        {
            EnsureStyles();
            switch (_screen)
            {
                case Screen.Mission: DrawMission(); break;
                case Screen.Result: DrawResult(); break;
                case Screen.Loadout: DrawLoadout(); break;
                default: DrawContracts(); break;
            }
        }

        // ------------------------------------------------------------ //

        private void DrawMission()
        {
            var w = UnityEngine.Screen.width;
            var h = UnityEngine.Screen.height;

            DrawReticle(w, h);

            // приборы прижаты не к самому краю: у краёв висит sticky-баннер,
            // и критичные показания под ним теряться не должны
            var pad = Mathf.RoundToInt(h * 0.06f);
            GUILayout.BeginArea(new Rect(pad, pad, w * 0.34f, h * 0.4f));

            var range = _scope.RangeToTarget;
            GUILayout.Label($"{Loc.T("hud.range")}: " +
                            (range < 0 ? "—"
                             : _scope.HasRangefinder ? $"{range:0} м"
                             : Loc.T("hud.noRangefinder")), _label);

            GUILayout.Label($"{Loc.T("hud.wind")}: {_wind.Strength:0.0} м/с  {WindArrow()}", _label);

            if (_scope.HasRangefinder && range > 0f)
            {
                GUILayout.Label($"{Loc.T("hud.drop")}: {_scope.DropHint:0.0} м", _label);
                GUILayout.Label($"{Loc.T("hud.drift")}: {_scope.DriftHint:+0.0;-0.0} м", _label);
            }

            GUILayout.Label($"{Loc.T("hud.ammo")}: {_runner.AmmoLeft}", _label);
            GUILayout.Label($"×{_scope.CurrentZoom:0}", _label);

            if (_runner.Alerted)
            {
                var prev = GUI.color;
                GUI.color = new Color(1f, 0.45f, 0.35f);
                GUILayout.Label(Loc.T("hud.alert"), _big);
                GUI.color = prev;
            }

            GUILayout.EndArea();

            DrawBreathBar(w, h);
        }

        private string WindArrow()
        {
            var d = Mathf.Repeat(_wind.Degrees, 360f);
            if (d < 22.5f || d >= 337.5f) return "↑";
            if (d < 67.5f) return "↗";
            if (d < 112.5f) return "→";
            if (d < 157.5f) return "↘";
            if (d < 202.5f) return "↓";
            if (d < 247.5f) return "↙";
            if (d < 292.5f) return "←";
            return "↖";
        }

        /// <summary>
        /// Сетка прицела. Деления не декоративные: по ним и берут
        /// поправку, когда дальномера ещё нет.
        /// </summary>
        private void DrawReticle(float w, float h)
        {
            var cx = w * 0.5f;
            var cy = h * 0.5f;
            var unit = h * 0.045f;
            var color = new Color(0.05f, 0.07f, 0.06f, 0.9f);

            Line(cx - unit * 5f, cy, unit * 3.6f, 1.5f, color);
            Line(cx + unit * 1.4f, cy, unit * 3.6f, 1.5f, color);
            VLine(cx, cy - unit * 5f, unit * 3.6f, 1.5f, color);

            for (var i = 1; i <= 5; i++)
            {
                var y = cy + unit * i;
                var half = i % 2 == 0 ? unit * 0.34f : unit * 0.18f;
                Line(cx - half, y, half * 2f, 1.5f, color);
            }

            // подсветка целей за рекламу — только бонус и только на миссию
            if (!_intel) return;
            var prev = GUI.color;
            GUI.color = new Color(1f, 0.85f, 0.3f, 0.85f);
            GUI.Label(new Rect(cx + unit, cy - unit * 1.6f, 240f, 30f), "•", _label);
            GUI.color = prev;
        }

        private void DrawBreathBar(float w, float h)
        {
            var barW = w * 0.26f;
            var barH = Mathf.Max(6f, h * 0.012f);
            var x = (w - barW) * 0.5f;
            var y = h * 0.88f;

            GUI.color = new Color(0f, 0f, 0f, 0.45f);
            GUI.DrawTexture(new Rect(x, y, barW, barH), Texture2D.whiteTexture);

            GUI.color = _breath.Holding
                ? new Color(0.95f, 0.75f, 0.25f)
                : new Color(0.55f, 0.78f, 0.9f);
            GUI.DrawTexture(new Rect(x, y, barW * _breath.Stamina, barH), Texture2D.whiteTexture);
            GUI.color = Color.white;
        }

        private static void Line(float x, float y, float len, float thick, Color c)
        {
            GUI.color = c;
            GUI.DrawTexture(new Rect(x, y - thick * 0.5f, len, thick), Texture2D.whiteTexture);
            GUI.color = Color.white;
        }

        private static void VLine(float x, float y, float len, float thick, Color c)
        {
            GUI.color = c;
            GUI.DrawTexture(new Rect(x - thick * 0.5f, y, thick, len), Texture2D.whiteTexture);
            GUI.color = Color.white;
        }

        // ------------------------------------------------------------ //

        private void DrawContracts()
        {
            var w = UnityEngine.Screen.width;
            var h = UnityEngine.Screen.height;
            var area = new Rect(w * 0.08f, h * 0.06f, w * 0.84f, h * 0.88f);

            GUILayout.BeginArea(area, _panel);
            GUILayout.Label(Loc.T("menu.contracts"), _big);
            GUILayout.Label($"★ {Game.State.TotalStars()}    ⬢ {Game.State.Currency}", _label);
            GUILayout.Space(8f);

            _scroll = GUILayout.BeginScrollView(_scroll);
            foreach (var m in MissionLibrary.All)
            {
                var unlocked = MissionLibrary.IsUnlocked(m, Game.State);
                var stars = Game.State.StarsFor(m.id);

                GUILayout.BeginHorizontal();
                GUILayout.Label($"{m.id}  {new string('★', stars)}{new string('·', 3 - stars)}", _label,
                                GUILayout.Width(w * 0.34f));

                if (!unlocked)
                {
                    var need = Core.Flags.Int($"missions.{m.id}.starsRequired", 0);
                    GUILayout.Label(Loc.T("menu.locked", need), _label);
                }
                else if (GUILayout.Button(Loc.T("menu.start"), _button, GUILayout.Width(w * 0.2f)))
                {
                    _game.StartMission(m);
                }
                GUILayout.EndHorizontal();
            }
            GUILayout.EndScrollView();

            if (GUILayout.Button(Loc.T("menu.loadout"), _button)) ShowLoadout();
            GUILayout.Label(Loc.T("how.body"), _label);
            GUILayout.EndArea();
        }

        private void DrawLoadout()
        {
            var w = UnityEngine.Screen.width;
            var h = UnityEngine.Screen.height;
            GUILayout.BeginArea(new Rect(w * 0.08f, h * 0.06f, w * 0.84f, h * 0.88f), _panel);
            GUILayout.Label(Loc.T("menu.loadout"), _big);
            GUILayout.Label($"⬢ {Game.State.Currency}", _label);

            _scroll = GUILayout.BeginScrollView(_scroll);

            foreach (var id in Progression.Loadout.AllRifles())
            {
                var owned = Game.State.HasRifle(id);
                var price = Progression.RifleStats.Load(id).Price;

                GUILayout.BeginHorizontal();
                GUILayout.Label(id, _label, GUILayout.Width(w * 0.3f));

                if (!owned)
                {
                    if (GUILayout.Button($"{Loc.T("shop.buy")} {price}", _button, GUILayout.Width(w * 0.24f)) &&
                        Game.State.Currency >= price)
                    {
                        Game.State.Currency -= price;
                        Game.State.OwnedRifles.Add(id);
                        Platform.Metrica.Goal(Platform.Metrica.RifleUnlocked(id));
                        _game.MarkDirty();
                        _game.Save(true);
                    }
                }
                else if (Game.State.EquippedRifle == id)
                {
                    GUILayout.Label(Loc.T("shop.owned"), _label);
                }
                else if (GUILayout.Button(Loc.T("shop.equip"), _button, GUILayout.Width(w * 0.24f)))
                {
                    Game.State.EquippedRifle = id;
                    _game.MarkDirty();
                }
                GUILayout.EndHorizontal();
            }

            GUILayout.Space(10f);

            foreach (var id in Progression.Loadout.AllModules())
            {
                var owned = Game.State.HasModule(id);
                var price = Progression.Loadout.ModulePrice(id);

                GUILayout.BeginHorizontal();
                GUILayout.Label(id, _label, GUILayout.Width(w * 0.3f));
                if (owned) GUILayout.Label(Loc.T("shop.owned"), _label);
                else if (GUILayout.Button($"{Loc.T("shop.buy")} {price}", _button, GUILayout.Width(w * 0.24f)) &&
                         Game.State.Currency >= price)
                {
                    Game.State.Currency -= price;
                    Game.State.OwnedModules.Add(id);
                    _game.MarkDirty();
                    _game.Save(true);
                }
                GUILayout.EndHorizontal();
            }

            GUILayout.EndScrollView();
            if (GUILayout.Button(Loc.T("menu.contracts"), _button)) ShowContracts();
            GUILayout.EndArea();
        }

        private void DrawResult()
        {
            var w = UnityEngine.Screen.width;
            var h = UnityEngine.Screen.height;
            GUILayout.BeginArea(new Rect(w * 0.18f, h * 0.2f, w * 0.64f, h * 0.6f), _panel);

            var ok = _report.Outcome == MissionOutcome.Success;
            GUILayout.Label(Loc.T(ok ? "result.success" : "result.failed"), _big);

            if (ok)
            {
                GUILayout.Label(new string('★', _report.Stars), _big);
                if (_report.OneShot) GUILayout.Label("✓ " + Loc.T("ch.oneShot"), _label);
                if (_report.InTime) GUILayout.Label("✓ " + Loc.T("ch.inTime"), _label);
                if (_report.ByHazard) GUILayout.Label("✓ " + Loc.T("ch.hazard"), _label);
                if (_report.Undetected) GUILayout.Label("✓ " + Loc.T("ch.quiet"), _label);

                var reward = _runner.Definition.RewardWithFlags();
                GUILayout.Label(Loc.T("result.reward", reward), _label);

                if (Platform.GamePlatform.AdsAvailable &&
                    GUILayout.Button("🎬 " + Loc.T("ad.double"), _button))
                {
                    _game.OfferDoubleReward(reward);
                }
            }
            else
            {
                GUILayout.Label(Loc.T(FailKey(_report.Reason)), _label);

                if (Platform.GamePlatform.AdsAvailable &&
                    _report.Reason != FailReason.Bystander &&
                    GUILayout.Button("🎬 " + Loc.T("ad.secondChance"), _button))
                {
                    _game.OfferSecondChance();
                }
            }

            GUILayout.Label(Loc.T("ad.optional"), _label);
            if (GUILayout.Button(Loc.T("result.menu"), _button)) _game.LeaveResult();
            GUILayout.EndArea();
        }

        private static string FailKey(FailReason reason)
        {
            switch (reason)
            {
                case FailReason.Bystander: return "fail.bystander";
                case FailReason.Escaped: return "fail.escaped";
                case FailReason.Spotted: return "fail.spotted";
                default: return "fail.ammo";
            }
        }
    }
}
