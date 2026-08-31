using System.Collections;
using UnityEngine;
using Sniper.Aiming;
using Sniper.Ballistics;
using Sniper.Missions;
using Sniper.Platform;
using Sniper.Presentation;
using Sniper.Progression;

namespace Sniper.Core
{
    /// <summary>
    /// Точка входа и весь поток игры.
    ///
    /// Единственный компонент, который нужно положить на пустую сцену:
    /// всё остальное он создаёт сам. Так проект запускается сразу после
    /// клонирования, без сборки сцены руками и без бинарных ассетов,
    /// которые нельзя прочитать в диффе.
    ///
    /// Порядок старта важен и переставлять его нельзя:
    ///   1. дефолты флагов — игра настроена ещё до всякой сети;
    ///   2. платформа и удалённая конфигурация — с таймаутом внутри;
    ///   3. загрузка сейва;
    ///   4. сцена и HUD;
    ///   5. только теперь LoadingAPI.ready() — игрок реально может играть.
    /// Вызвать ready() раньше — значит соврать платформе и получить отказ
    /// модерации (п. 1.19.2).
    /// </summary>
    public sealed class Game : MonoBehaviour
    {
        public static Game Instance { get; private set; }
        public static GameState State { get; private set; }

        private ScopeController _scope;
        private BreathController _breath;
        private Wind _wind;
        private GreyboxBuilder _builder;
        private KillCam _killCam;
        private HudController _hud;
        private MissionRunner _runner;
        private Camera _camera;

        private float _saveTimer;
        private bool _dirty;

        private void Awake()
        {
            Instance = this;
            Application.targetFrameRate = 60;
            Flags.LoadDefaults();
        }

        private IEnumerator Start()
        {
            var ready = false;
            GamePlatform.Init(() => ready = true);

            // ждём платформу, но не бесконечно: если инициализация
            // подвисла, играем на дефолтах — это штатный режим
            var deadline = Time.realtimeSinceStartup + Flags.Num("boot.platformTimeout", 4f);
            while (!ready && Time.realtimeSinceStartup < deadline) yield return null;

            Localization.Loc.SetLanguage(GamePlatform.Language);

            var loaded = false;
            GamePlatform.Load(json =>
            {
                State = GameState.FromJson(json);
                loaded = true;
            });

            deadline = Time.realtimeSinceStartup + Flags.Num("boot.saveTimeout", 4f);
            while (!loaded && Time.realtimeSinceStartup < deadline) yield return null;
            if (State == null) State = GameState.CreateNew();

            State.Sessions++;
            BuildRig();

            RestorePurchases();

            // игрок реально может начать играть — обязательный вызов
            GamePlatform.LoadingReady();
            _hud.ShowContracts();

            MarkDirty();
            StartCoroutine(MaybeOfferShortcut());
        }

        private void BuildRig()
        {
            var camGo = new GameObject("ScopeCamera");
            _camera = camGo.AddComponent<Camera>();
            _camera.nearClipPlane = 0.05f;
            _camera.farClipPlane = 4000f;
            camGo.AddComponent<AudioListener>();

            var rig = new GameObject("Rig");
            _breath = rig.AddComponent<BreathController>();
            _wind = rig.AddComponent<Wind>();
            rig.AddComponent<AimInput>();
            _scope = rig.AddComponent<ScopeController>();

            // ссылки проставляются кодом: инспектор здесь не участвует,
            // потому что сцена собирается в рантайме
            SetPrivate(_scope, "_camera", _camera);
            SetPrivate(_scope, "_breath", _breath);
            SetPrivate(_scope, "_wind", _wind);

            _builder = rig.AddComponent<GreyboxBuilder>();
            _killCam = rig.AddComponent<KillCam>();
            SetPrivate(_killCam, "_camera", _camera);

            _runner = rig.AddComponent<MissionRunner>();
            _hud = rig.AddComponent<HudController>();
            _hud.Bind(this, _scope, _breath, _wind, _runner);
        }

        private static void SetPrivate(object target, string field, object value)
        {
            var f = target.GetType().GetField(field,
                System.Reflection.BindingFlags.Instance |
                System.Reflection.BindingFlags.NonPublic);
            f?.SetValue(target, value);
        }

        // ------------------------------------------------------------ //
        // Миссия
        // ------------------------------------------------------------ //

        public void StartMission(MissionDefinition def)
        {
            _builder.Build(def);
            Wind.Roll(_wind, def.seed, def.windScale);

            var stats = Loadout.Apply(RifleStats.Load(State.EquippedRifle), State);
            _scope.Configure(stats, State.HasModule("rangefinder"),
                             Loadout.ZoomLevels(State.HasModule("scope8")));

            _camera.transform.position = def.ShooterPosition;
            _scope.LookAt(def.ShooterForward);
            _breath.ResetBreath();

            _runner.OnFinished -= HandleMissionFinished;
            _runner.OnShotResolved -= HandleShot;
            _runner.OnFinished += HandleMissionFinished;
            _runner.OnShotResolved += HandleShot;

            _runner.Begin(def, _scope, _builder.Actors, _builder.Hazards, stats.Capacity);
            _hud.ShowMission();
            GamePlatform.HideBanner();
        }

        private void HandleShot(Projectile.Result result, ShotParams shot)
        {
            if (!result.Hit) return;

            var hazard = result.Info.collider.GetComponentInParent<Hazard>() != null;
            if (!_killCam.ShouldPlay(result.Distance, hazard, _runner.AmmoLeft <= 0)) return;

            _scope.InputEnabled = false;
            _killCam.Play(result.Path, () =>
            {
                if (_runner.Outcome == MissionOutcome.Running) _scope.InputEnabled = true;
            });
        }

        private void HandleMissionFinished(MissionRunner.Report report)
        {
            GamePlatform.ShowBanner();

            if (report.Outcome == MissionOutcome.Success)
            {
                var reward = _runner.Definition.RewardWithFlags();
                var bonus = Flags.Int("mission.starBonus", 60) * report.Stars;
                State.Currency += reward + bonus;
                State.TotalScore += reward + bonus;
                State.SetStars(_runner.Definition.id, report.Stars);

                var range = Mathf.RoundToInt(report.BestRange);
                if (range > State.BestRangeMeters) State.BestRangeMeters = range;

                GamePlatform.SubmitScore(Flags.Str("leaderboard.total", "total"), State.TotalScore);
                GamePlatform.SubmitScore(Flags.Str("leaderboard.range", "range"), State.BestRangeMeters);

                if (report.Stars >= 3) StartCoroutine(AskReviewOnce());
            }

            MarkDirty();
            Save(true);
            _hud.ShowResult(report);
        }

        /// <summary>
        /// Итог миссии — логическая пауза, единственное место для
        /// полноэкранной рекламы. Во время прицеливания её нет и быть не
        /// может: случайный клик РСЯ считает фродом.
        /// </summary>
        public void LeaveResult()
        {
            GamePlatform.ShowInterstitial(() => _hud.ShowContracts());
        }

        // ------------------------------------------------------------ //
        // Рекламные офферы. Все — бонус сверху, ни один не является
        // условием прохождения (п. 4.5.2).
        // ------------------------------------------------------------ //

        public void OfferSecondChance()
        {
            GamePlatform.ShowRewarded("second_chance", () =>
            {
                _runner.GrantSecondChance(Flags.Int("ads.secondChanceAmmo", 1));
                _hud.ShowMission();
            });
        }

        public void OfferDoubleReward(int baseReward)
        {
            GamePlatform.ShowRewarded("double_reward", () =>
            {
                State.Currency += baseReward;
                State.TotalScore += baseReward;
                MarkDirty();
                Save(true);
                _hud.Refresh();
            });
        }

        public void OfferIntel()
        {
            GamePlatform.ShowRewarded("intel", () => _hud.EnableIntel());
        }

        // ------------------------------------------------------------ //
        // Сохранение
        // ------------------------------------------------------------ //

        public void MarkDirty() => _dirty = true;

        public void Save(bool immediate)
        {
            if (State == null) return;
            GamePlatform.Save(State.ToJson(), immediate);
            _dirty = false;
        }

        private void Update()
        {
            if (!_dirty) return;
            _saveTimer += Time.unscaledDeltaTime;
            if (_saveTimer < Flags.Num("save.debounceSeconds", 6f)) return;
            _saveTimer = 0f;
            Save(false);
        }

        private void OnApplicationPause(bool paused)
        {
            if (paused) Save(true);
        }

        private void OnApplicationFocus(bool focus)
        {
            // п. 1.3: звук замолкает при потере фокуса
            AudioListener.pause = !focus;
            if (!focus) Save(true);
        }

        private void OnApplicationQuit() => Save(true);

        // ------------------------------------------------------------ //

        private void RestorePurchases()
        {
            GamePlatform.RestorePurchases(owned =>
            {
                if (owned == null) return;
                foreach (var id in owned)
                {
                    if (id == "noads") State.SetFlag("noads");
                    else if (id.StartsWith("rifle_")) State.OwnedRifles.Add(id.Substring(6));
                    else if (id.StartsWith("module_")) State.OwnedModules.Add(id.Substring(7));
                }
                MarkDirty();
            });
        }

        /// <summary>Оценка — только после позитивного события и один раз за сессию.</summary>
        private IEnumerator AskReviewOnce()
        {
            if (State.HasFlag("reviewAsked")) yield break;
            State.SetFlag("reviewAsked");
            yield return new WaitForSecondsRealtime(1.5f);
            GamePlatform.CanReview(can => { if (can) GamePlatform.RequestReview(); });
        }

        /// <summary>Ярлык — не новичку, а тому, кто уже вернулся.</summary>
        private IEnumerator MaybeOfferShortcut()
        {
            if (State.Sessions < Flags.Int("shortcut.fromSession", 3)) yield break;
            if (State.HasFlag("shortcutDone")) yield break;

            yield return new WaitForSecondsRealtime(Flags.Num("shortcut.delaySeconds", 60f));
            GamePlatform.CanShowShortcut(can =>
            {
                if (!can) return;
                GamePlatform.ShowShortcut(ok =>
                {
                    if (!ok) return;
                    State.SetFlag("shortcutDone");
                    MarkDirty();
                });
            });
        }
    }
}
