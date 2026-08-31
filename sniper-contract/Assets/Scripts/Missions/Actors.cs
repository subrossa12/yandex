using UnityEngine;

namespace Sniper.Missions
{
    /// <summary>Во что попала пуля. От этого зависит исход выстрела.</summary>
    public enum ActorKind
    {
        Target,      // цель контракта
        Guard,       // охрана: заметит и поднимет тревогу
        Civilian,    // посторонний: попадание — немедленный провал
        Hazard,      // объект окружения: трос, баллон, вывеска
        Scenery
    }

    /// <summary>
    /// Живой объект миссии.
    ///
    /// Ходит по точкам маршрута: неподвижная цель превращает снайперский
    /// симулятор в тир, а движение заставляет считать упреждение — ради
    /// него и нужна честная скорость пули.
    /// </summary>
    public sealed class Actor : MonoBehaviour
    {
        public ActorKind Kind = ActorKind.Scenery;
        public bool Down { get; private set; }

        private Vector3[] _route;
        private float _speed;
        private int _leg;
        private float _t;

        public void SetRoute(Vector3[] route, float speed)
        {
            _route = route;
            _speed = speed;
            if (route != null && route.Length > 0) transform.position = route[0];
        }

        private void Update()
        {
            if (Down || _route == null || _route.Length < 2) return;

            var from = _route[_leg];
            var to = _route[(_leg + 1) % _route.Length];
            var length = Vector3.Distance(from, to);
            if (length < 0.01f) { _leg = (_leg + 1) % _route.Length; return; }

            _t += Time.deltaTime * _speed / length;
            if (_t >= 1f)
            {
                _t = 0f;
                _leg = (_leg + 1) % _route.Length;
            }
            transform.position = Vector3.Lerp(from, to, _t);
        }

        /// <summary>
        /// Попадание. Крови нет намеренно: вспышка, звук, объект падает.
        /// Этого достаточно, чтобы выстрел читался, и это то, что можно
        /// показать на витрине каталога.
        /// </summary>
        public void Hit()
        {
            if (Down) return;
            Down = true;
            transform.rotation = Quaternion.Euler(90f, transform.eulerAngles.y, 0f);
            transform.position -= Vector3.up * 0.4f;
        }
    }

    /// <summary>
    /// «Несчастный случай»: объект окружения, который убивает цель сам.
    ///
    /// Самая цепляющая механика жанра — попасть не в цель, а в трос над
    /// ней. Поэтому объектов таких в каждой миссии минимум два, и
    /// срабатывание у них честное: радиус поражения проверяется по
    /// реальным позициям в момент попадания.
    /// </summary>
    public sealed class Hazard : MonoBehaviour
    {
        public float Radius = 3.5f;
        public bool Used { get; private set; }

        /// <summary>Кого зацепило. Возвращает true, если задета цель.</summary>
        public bool Trigger(Actor[] actors, out bool hitBystander)
        {
            hitBystander = false;
            var killedTarget = false;
            if (Used) return false;
            Used = true;

            foreach (var a in actors)
            {
                if (a == null || a.Down) continue;
                if (Vector3.Distance(a.transform.position, transform.position) > Radius) continue;

                a.Hit();
                if (a.Kind == ActorKind.Target) killedTarget = true;
                if (a.Kind == ActorKind.Civilian) hitBystander = true;
            }
            return killedTarget;
        }
    }
}
