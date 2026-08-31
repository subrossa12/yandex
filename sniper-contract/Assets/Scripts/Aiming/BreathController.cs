using UnityEngine;

namespace Sniper.Aiming
{
    /// <summary>
    /// Дыхание и его задержка.
    ///
    /// Дрожание прицела — это не помеха, а таймер: игрок видит, что окно
    /// для выстрела ограничено, и решает, стрелять сейчас или ждать.
    /// Поэтому задержка дыхания расходуется быстро, а восстанавливается
    /// медленно — иначе её просто держали бы всю миссию и механики бы не
    /// было.
    ///
    /// Колебание складывается из двух синусов с несоизмеримыми частотами:
    /// один синус даёт заметно механическое движение по кругу.
    /// </summary>
    public sealed class BreathController : MonoBehaviour
    {
        [SerializeField] private float _amplitude = 0.55f;

        private float _stamina = 1f;
        private float _phase;
        private bool _holding;

        /// <summary>Остаток задержки, 0..1 — рисуется полосой в прицеле.</summary>
        public float Stamina => _stamina;

        public bool Holding => _holding && _stamina > 0f;

        /// <summary>Текущее смещение прицела в градусах.</summary>
        public Vector2 Sway { get; private set; }

        private float Drain => Core.Flags.Num("breath.drainPerSecond", 0.34f);
        private float Regen => Core.Flags.Num("breath.regenPerSecond", 0.16f);
        private float HoldFactor => Core.Flags.Num("breath.holdFactor", 0.12f);

        public void SetHold(bool on) => _holding = on;

        /// <summary>Сброс между миссиями: усталость не переносится.</summary>
        public void ResetBreath()
        {
            _stamina = 1f;
            _holding = false;
            _phase = 0f;
        }

        /// <summary>
        /// zoom сжимает колебание в кадре, но не в градусах: на большой
        /// кратности та же дрожь выглядит сильнее, и это правильно.
        /// </summary>
        public void Tick(float dt, float steadiness)
        {
            if (Holding)
            {
                _stamina = Mathf.Max(0f, _stamina - Drain * dt);
            }
            else
            {
                _stamina = Mathf.Min(1f, _stamina + Regen * dt);
            }

            _phase += dt;

            var scale = _amplitude / Mathf.Max(0.2f, steadiness);
            if (Holding) scale *= HoldFactor;

            // при пустой задержке дыхание срывается: амплитуда временно выше
            if (_holding && _stamina <= 0f) scale *= 2.2f;

            Sway = new Vector2(
                Mathf.Sin(_phase * 1.7f) * 0.6f + Mathf.Sin(_phase * 0.61f) * 0.4f,
                Mathf.Sin(_phase * 1.13f) * 0.5f + Mathf.Sin(_phase * 0.37f) * 0.5f
            ) * scale;
        }
    }
}
