using UnityEngine;

namespace Sniper.Ballistics
{
    /// <summary>
    /// Ветер миссии.
    ///
    /// Постоянен внутри миссии и меняется между ними — так игрок может
    /// пристреляться первым выстрелом и применить поправку вторым. Если
    /// ветер гулял бы в реальном времени, попадание на дальней дистанции
    /// стало бы лотереей, а не навыком.
    ///
    /// Лёгкое дыхание порывов всё же есть, но малой амплитуды: оно даёт
    /// живость индикатору, не ломая пристрелку.
    /// </summary>
    public sealed class Wind : MonoBehaviour
    {
        [SerializeField] private float _baseStrength = 3.5f;
        [SerializeField] private float _degrees;

        private float _gustPhase;
        private float _gustAmount;

        /// <summary>Текущий вектор ветра, м/с.</summary>
        public Vector3 Vector { get; private set; }

        /// <summary>Сила в м/с — для индикатора.</summary>
        public float Strength => Vector.magnitude;

        /// <summary>Направление в градусах — для стрелки индикатора.</summary>
        public float Degrees => _degrees;

        public void Configure(float strength, float degrees)
        {
            _baseStrength = Mathf.Clamp(strength, 0f, Core.Flags.Num("wind.maxStrength", 12f));
            _degrees = degrees;
            _gustAmount = Core.Flags.Num("wind.gust", 0.12f);
            Recompute();
        }

        private void Awake()
        {
            _gustAmount = Core.Flags.Num("wind.gust", 0.12f);
            Recompute();
        }

        private void Update()
        {
            if (_gustAmount <= 0f) return;
            _gustPhase += Time.deltaTime * 0.35f;
            Recompute();
        }

        private void Recompute()
        {
            var gust = 1f + Mathf.Sin(_gustPhase) * _gustAmount;
            var rad = _degrees * Mathf.Deg2Rad;
            Vector = new Vector3(Mathf.Sin(rad), 0f, Mathf.Cos(rad)) * (_baseStrength * gust);
        }

        /// <summary>
        /// Ветер под конкретную миссию. Детерминирован от её номера:
        /// одна и та же миссия обязана давать один и тот же ветер, иначе
        /// челлендж «с одного выстрела» превращается в рулетку.
        /// </summary>
        public static void Roll(Wind wind, int missionSeed, float strengthScale)
        {
            var rng = new System.Random(missionSeed);
            var max = Core.Flags.Num("wind.maxStrength", 12f) * strengthScale;
            var strength = (float)(rng.NextDouble() * max);
            var degrees = (float)(rng.NextDouble() * 360.0);
            wind.Configure(strength, degrees);
        }
    }
}
