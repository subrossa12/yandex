using UnityEngine;
using Sniper.Ballistics;

namespace Sniper.Aiming
{
    /// <summary>
    /// Прицел: поворот, кратность, дальномер и выстрел.
    ///
    /// Стрелок стоит на месте — вращается только голова. Это не
    /// упрощение, а жанр: вся игра про то, чтобы прочитать сцену через
    /// прицел, а не про перемещение.
    ///
    /// Дальномер — разблокируемое улучшение. Без него дистанция и
    /// поправка не показываются, и целиться приходится на глаз; в этом
    /// вся ценность апгрейда, поэтому подсказку нельзя показывать
    /// «просто так».
    /// </summary>
    [RequireComponent(typeof(AimInput))]
    public sealed class ScopeController : MonoBehaviour
    {
        [SerializeField] private Camera _camera;
        [SerializeField] private BreathController _breath;
        [SerializeField] private Wind _wind;

        private AimInput _input;
        private float _yaw;
        private float _pitch;
        private int _zoomIndex;
        private float _cooldown;

        private float[] _zoomLevels = { 1f, 4f, 8f };
        private bool _hasRangefinder;
        private Progression.RifleStats _rifle;

        public bool InputEnabled { get; set; } = true;
        public float CurrentZoom => _zoomLevels[Mathf.Clamp(_zoomIndex, 0, _zoomLevels.Length - 1)];
        public bool HasRangefinder => _hasRangefinder;

        /// <summary>Дистанция до того, во что смотрит прицел. -1, если небо.</summary>
        public float RangeToTarget { get; private set; } = -1f;

        /// <summary>Поправка на падение и снос — считается той же баллистикой.</summary>
        public float DropHint { get; private set; }
        public float DriftHint { get; private set; }

        public System.Action<Projectile.Result, ShotParams> OnShot;

        private void Awake()
        {
            _input = GetComponent<AimInput>();
            if (_camera == null) _camera = Camera.main;
        }

        public void Configure(Progression.RifleStats rifle, bool rangefinder, float[] zoomLevels)
        {
            _rifle = rifle;
            _hasRangefinder = rangefinder;
            if (zoomLevels != null && zoomLevels.Length > 0) _zoomLevels = zoomLevels;
            _zoomIndex = 0;
            ApplyZoom();
        }

        public void LookAt(Vector3 forward)
        {
            var e = Quaternion.LookRotation(forward, Vector3.up).eulerAngles;
            _yaw = e.y;
            _pitch = e.x > 180f ? e.x - 360f : e.x;
        }

        private void Update()
        {
            // до первой миссии винтовка не настроена: считать по нулевой
            // скорости пули бессмысленно, а прогон баллистики на ней
            // крутился бы до предела по времени полёта каждый кадр
            if (_rifle.MuzzleSpeed <= 0f) return;

            if (_cooldown > 0f) _cooldown -= Time.deltaTime;

            var frame = _input.Read(InputEnabled);

            _breath.SetHold(frame.Hold);
            _breath.Tick(Time.deltaTime, _rifle.Steadiness);

            // на большой кратности та же дельта ввода даёт меньший поворот:
            // иначе прицелиться на 8× физически невозможно
            var zoomScale = 1f / CurrentZoom;
            _yaw += frame.Look.x * zoomScale;
            _pitch = Mathf.Clamp(_pitch - frame.Look.y * zoomScale, -35f, 35f);

            if (Mathf.Abs(frame.Zoom) > 0.01f)
            {
                _zoomIndex = Mathf.Clamp(_zoomIndex + (frame.Zoom > 0 ? 1 : -1), 0, _zoomLevels.Length - 1);
                ApplyZoom();
            }

            var sway = _breath.Sway;
            _camera.transform.rotation = Quaternion.Euler(_pitch + sway.y, _yaw + sway.x, 0f);

            UpdateRange();

            if (frame.Fire && _cooldown <= 0f && InputEnabled) Fire();
        }

        private void ApplyZoom()
        {
            var baseFov = Core.Flags.Num("scope.baseFov", 58f);
            _camera.fieldOfView = baseFov / CurrentZoom;
        }

        private void UpdateRange()
        {
            var ray = new Ray(_camera.transform.position, _camera.transform.forward);
            if (Physics.Raycast(ray, out var hit, 3000f, ~0, QueryTriggerInteraction.Ignore))
            {
                RangeToTarget = hit.distance;
                if (_hasRangefinder)
                {
                    var p = BuildShot();
                    DropHint = BallisticsSolver.DropAtRange(p, hit.distance);
                    DriftHint = BallisticsSolver.DriftAtRange(p, hit.distance);
                }
            }
            else
            {
                RangeToTarget = -1f;
                DropHint = 0f;
                DriftHint = 0f;
            }
        }

        private ShotParams BuildShot()
        {
            return new ShotParams
            {
                Origin = _camera.transform.position,
                Direction = _camera.transform.forward,
                MuzzleSpeed = _rifle.MuzzleSpeed,
                Drag = Core.Flags.Num("ballistics.drag", 0.00019f),
                Gravity = Core.Flags.Num("ballistics.gravity", 9.81f),
                Wind = _wind != null ? _wind.Vector : Vector3.zero,
                Radius = Core.Flags.Num("ballistics.bulletRadius", 0.05f),
                Mask = ~0
            };
        }

        private void Fire()
        {
            _cooldown = _rifle.CycleSeconds;
            var p = BuildShot();
            Projectile.Fire(p, Core.Flags.Num("ballistics.maxFlightSeconds", 8f),
                            r => OnShot?.Invoke(r, p));
        }
    }
}
