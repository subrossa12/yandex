using System;
using System.Collections.Generic;
using UnityEngine;
using Sniper.Aiming;
using Sniper.Ballistics;
using Sniper.Presentation;

namespace Sniper.Missions
{
    public enum MissionOutcome { Running, Success, Failed }

    public enum FailReason { None, Bystander, Escaped, Spotted, OutOfAmmo }

    /// <summary>
    /// Ход одной миссии: выстрелы, провалы, челленджи, итог.
    ///
    /// Условия провала намеренно жёсткие и мгновенные — задет посторонний,
    /// цель ушла, обнаружили. Мягкие провалы («минус очки») в жанре, где
    /// решает один выстрел, не читаются вовсе.
    ///
    /// Челленджи считаются здесь же, а не отдельной системой: почти все
    /// они — про то, как именно прошёл выстрел, и разносить это по двум
    /// местам значит рассинхронизировать их при первой же правке.
    /// </summary>
    public sealed class MissionRunner : MonoBehaviour
    {
        [Serializable]
        public struct Report
        {
            public MissionOutcome Outcome;
            public FailReason Reason;
            public bool OneShot;
            public bool InTime;
            public bool ByHazard;
            public bool Undetected;
            public float BestRange;
            public float Elapsed;
            public int Shots;

            public int Stars
            {
                get
                {
                    if (Outcome != MissionOutcome.Success) return 0;
                    var s = 0;
                    if (OneShot) s++;
                    if (InTime) s++;
                    if (ByHazard || Undetected) s++;
                    return Mathf.Clamp(s, 1, 3);   // прошёл — минимум одна
                }
            }
        }

        public MissionDefinition Definition { get; private set; }
        public MissionOutcome Outcome { get; private set; } = MissionOutcome.Running;
        public Report Result { get; private set; }

        public event Action<Report> OnFinished;
        public event Action<Projectile.Result, ShotParams> OnShotResolved;

        private ScopeController _scope;
        private Actor[] _actors;
        private Hazard[] _hazards;
        private float _elapsed;
        private int _shots;
        private int _ammo;
        private float _bestRange;
        private bool _alerted;
        private float _alertTimer;
        private bool _hazardUsed;

        public int AmmoLeft => _ammo;
        public float Elapsed => _elapsed;
        public bool Alerted => _alerted;

        public void Begin(MissionDefinition def, ScopeController scope, Actor[] actors, Hazard[] hazards, int ammo)
        {
            Definition = def;
            _scope = scope;
            _actors = actors;
            _hazards = hazards;
            _ammo = ammo;
            _elapsed = 0f;
            _shots = 0;
            _bestRange = 0f;
            _alerted = false;
            _hazardUsed = false;
            Outcome = MissionOutcome.Running;

            _scope.OnShot += HandleShot;
            _scope.InputEnabled = true;

            Platform.Metrica.Goal(Platform.Metrica.MissionStarted(def.id));
            Platform.GamePlatform.GameplayStart();
        }

        private void OnDestroy()
        {
            if (_scope != null) _scope.OnShot -= HandleShot;
        }

        private void Update()
        {
            if (Outcome != MissionOutcome.Running) return;
            _elapsed += Time.deltaTime;

            // после тревоги у игрока есть окно, потом цель уходит
            if (_alerted)
            {
                _alertTimer -= Time.deltaTime;
                if (_alertTimer <= 0f) Fail(FailReason.Escaped);
            }
        }

        private void HandleShot(Projectile.Result result, ShotParams shot)
        {
            if (Outcome != MissionOutcome.Running) return;

            _shots++;
            _ammo--;
            OnShotResolved?.Invoke(result, shot);

            if (!result.Hit)
            {
                RaiseAlert();
                CheckAmmo();
                return;
            }

            if (result.Distance > _bestRange) _bestRange = result.Distance;

            var hazard = result.Info.collider.GetComponentInParent<Hazard>();
            if (hazard != null)
            {
                var killed = hazard.Trigger(_actors, out var bystander);
                if (bystander) { Fail(FailReason.Bystander); return; }
                if (killed) { _hazardUsed = true; Succeed(); return; }
                RaiseAlert();
                CheckAmmo();
                return;
            }

            var actor = result.Info.collider.GetComponentInParent<Actor>();
            if (actor == null)
            {
                RaiseAlert();
                CheckAmmo();
                return;
            }

            switch (actor.Kind)
            {
                case ActorKind.Civilian:
                    actor.Hit();
                    Fail(FailReason.Bystander);
                    return;

                case ActorKind.Target:
                    actor.Hit();
                    Succeed();
                    return;

                case ActorKind.Guard:
                    actor.Hit();
                    RaiseAlert();      // охранника снять можно, но это шум
                    CheckAmmo();
                    return;

                default:
                    RaiseAlert();
                    CheckAmmo();
                    return;
            }
        }

        private void CheckAmmo()
        {
            if (_ammo <= 0) Fail(FailReason.OutOfAmmo);
        }

        /// <summary>
        /// Промах или лишний выстрел поднимают тревогу. С глушителем
        /// окно до ухода цели заметно шире — в этом и смысл модуля.
        /// </summary>
        private void RaiseAlert()
        {
            if (_alerted) return;
            _alerted = true;

            var window = Definition.guardAlertSeconds > 0
                ? Definition.guardAlertSeconds
                : Core.Flags.Num("mission.alertSeconds", 9f);

            if (Core.Game.State != null && Core.Game.State.HasModule("suppressor"))
            {
                window *= Core.Flags.Num("modules.suppressor.alertScale", 2.2f);
            }
            _alertTimer = window;
        }

        private void Succeed()
        {
            var limit = Definition.TimeLimitWithFlags();
            Result = new Report
            {
                Outcome = MissionOutcome.Success,
                Reason = FailReason.None,
                OneShot = _shots <= 1,
                InTime = limit <= 0f || _elapsed <= limit,
                ByHazard = _hazardUsed,
                Undetected = !_alerted,
                BestRange = _bestRange,
                Elapsed = _elapsed,
                Shots = _shots
            };
            Finish();
        }

        private void Fail(FailReason reason)
        {
            Result = new Report
            {
                Outcome = MissionOutcome.Failed,
                Reason = reason,
                BestRange = _bestRange,
                Elapsed = _elapsed,
                Shots = _shots
            };
            Platform.Metrica.Goal(
                Platform.Metrica.MissionFailed(Definition.id, reason.ToString().ToLowerInvariant()));
            Finish();
        }

        private void Finish()
        {
            Outcome = Result.Outcome;
            _scope.InputEnabled = false;
            Platform.GamePlatform.GameplayStop();

            if (Result.Outcome == MissionOutcome.Success && Result.Stars >= 3)
            {
                Platform.Metrica.Goal(Platform.Metrica.MissionThreeStars(Definition.id));
            }

            OnFinished?.Invoke(Result);
        }

        /// <summary>
        /// Второй шанс за рекламу: перезапуск с последнего выстрела.
        /// Строго бонус — миссия обязана проходиться и без него
        /// (п. 4.5.2), поэтому здесь возвращается только состояние
        /// провала, а не выдаётся победа.
        /// </summary>
        public void GrantSecondChance(int extraAmmo)
        {
            if (Outcome != MissionOutcome.Failed) return;
            if (Result.Reason == FailReason.Bystander) return;   // задел постороннего — не отматывается

            Outcome = MissionOutcome.Running;
            _ammo = Mathf.Max(1, extraAmmo);
            _alerted = false;
            _scope.InputEnabled = true;
            Platform.GamePlatform.GameplayStart();
        }
    }
}
