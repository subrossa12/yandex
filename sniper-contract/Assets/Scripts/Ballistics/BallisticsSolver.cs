using UnityEngine;

namespace Sniper.Ballistics
{
    /// <summary>Параметры выстрела. Всё, что нужно, чтобы его повторить.</summary>
    public struct ShotParams
    {
        public Vector3 Origin;
        public Vector3 Direction;
        public float MuzzleSpeed;     // м/с
        public float Drag;            // квадратичное сопротивление
        public Vector3 Wind;          // вектор ветра, м/с
        public float Gravity;         // положительное число, м/с²
        public float Radius;          // радиус пули для трассировки
        public LayerMask Mask;
    }

    /// <summary>Состояние пули в полёте.</summary>
    public struct BulletState
    {
        public Vector3 Position;
        public Vector3 Velocity;
        public float Time;
    }

    /// <summary>
    /// Баллистика. Чистая математика, ни одного MonoBehaviour.
    ///
    /// Одной этой функцией шага пользуются трое: живой выстрел, килл-кам
    /// и подсказка упреждения в прицеле. Это не экономия кода, а
    /// требование к игре: если килл-кам считает по своей формуле, он
    /// покажет не тот полёт, который был, и игрок перестанет верить
    /// собственным попаданиям.
    ///
    /// Пуля — настоящий снаряд, а не мгновенный рейкаст: у неё есть
    /// время полёта, падение и снос ветром. Без этого весь жанр
    /// рассыпается — стрелять становится нечем, кроме как в упор.
    /// </summary>
    public static class BallisticsSolver
    {
        /// <summary>
        /// Один шаг интегрирования. Сопротивление считается по скорости
        /// ОТНОСИТЕЛЬНО воздуха, поэтому ветер сносит пулю сам собой, а не
        /// приписывается отдельным слагаемым «на глаз».
        /// </summary>
        public static BulletState Step(BulletState s, in ShotParams p, float dt)
        {
            var relative = s.Velocity - p.Wind;
            var speed = relative.magnitude;

            var accel = Vector3.down * p.Gravity;
            if (speed > 0.001f) accel -= relative.normalized * (p.Drag * speed * speed);

            // полушаговая схема: при шаге физики 1/50 с и скорости под
            // 900 м/с простой Эйлер заметно завышает дальность
            var halfV = s.Velocity + accel * (dt * 0.5f);
            s.Position += halfV * dt;
            s.Velocity += accel * dt;
            s.Time += dt;
            return s;
        }

        public static BulletState Initial(in ShotParams p)
        {
            return new BulletState
            {
                Position = p.Origin,
                Velocity = p.Direction.normalized * p.MuzzleSpeed,
                Time = 0f
            };
        }

        /// <summary>
        /// Прогон до попадания или до истечения времени.
        /// Проверка столкновений — сферой по отрезку между шагами: пуля
        /// за шаг пролетает метры, и обычная проверка точки пролетела бы
        /// сквозь стену.
        /// </summary>
        public static bool Trace(in ShotParams p, float maxTime, float dt, out RaycastHit hit, out BulletState end)
        {
            var s = Initial(p);
            hit = default;

            while (s.Time < maxTime)
            {
                var prev = s.Position;
                s = Step(s, p, dt);
                var delta = s.Position - prev;
                var dist = delta.magnitude;

                if (dist > 0.0001f &&
                    Physics.SphereCast(prev, p.Radius, delta / dist, out hit, dist, p.Mask,
                                       QueryTriggerInteraction.Ignore))
                {
                    end = s;
                    end.Position = hit.point;
                    return true;
                }
            }

            end = s;
            return false;
        }

        /// <summary>
        /// Падение пули на заданной дальности, в метрах.
        /// Используется дальномером: с ним игрок видит поправку, без него
        /// оценивает на глаз — в этом и есть ценность улучшения.
        /// </summary>
        public static float DropAtRange(in ShotParams p, float range, float dt = 0.01f)
        {
            if (p.MuzzleSpeed <= 0f || range <= 0f) return 0f;
            var s = Initial(p);
            var flat = new Vector3(p.Direction.x, 0f, p.Direction.z).normalized;
            var travelled = 0f;

            while (travelled < range && s.Time < 12f)
            {
                var prev = s.Position;
                s = Step(s, p, dt);
                travelled += Vector3.Dot(s.Position - prev, flat);
            }

            var straight = p.Origin + p.Direction.normalized * range;
            return straight.y - s.Position.y;
        }

        /// <summary>Снос ветром на дальности, в метрах вбок.</summary>
        public static float DriftAtRange(in ShotParams p, float range, float dt = 0.01f)
        {
            var noWind = p;
            noWind.Wind = Vector3.zero;

            var withWind = SimulateTo(p, range, dt);
            var without = SimulateTo(noWind, range, dt);

            var side = Vector3.Cross(Vector3.up, p.Direction).normalized;
            return Vector3.Dot(withWind - without, side);
        }

        private static Vector3 SimulateTo(in ShotParams p, float range, float dt)
        {
            if (p.MuzzleSpeed <= 0f) return p.Origin;
            var s = Initial(p);
            var flat = new Vector3(p.Direction.x, 0f, p.Direction.z).normalized;
            var travelled = 0f;

            while (travelled < range && s.Time < 12f)
            {
                var prev = s.Position;
                s = Step(s, p, dt);
                travelled += Vector3.Dot(s.Position - prev, flat);
            }
            return s.Position;
        }

        /// <summary>Время полёта до цели — для подсказки на движущейся цели.</summary>
        public static float TimeOfFlight(in ShotParams p, float range, float dt = 0.01f)
        {
            var s = Initial(p);
            var flat = new Vector3(p.Direction.x, 0f, p.Direction.z).normalized;
            var travelled = 0f;

            while (travelled < range && s.Time < 12f)
            {
                var prev = s.Position;
                s = Step(s, p, dt);
                travelled += Vector3.Dot(s.Position - prev, flat);
            }
            return s.Time;
        }
    }
}
