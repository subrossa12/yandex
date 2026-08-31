using System;
using System.Collections.Generic;
using UnityEngine;

namespace Sniper.Ballistics
{
    /// <summary>
    /// Летящая пуля.
    ///
    /// Считает полёт тем же шагом, что и весь остальной проект, и
    /// попутно записывает траекторию. Запись нужна килл-каму: он не
    /// пересчитывает выстрел заново, а показывает ровно тот полёт,
    /// который случился, — иначе повтор расходился бы с попаданием.
    /// </summary>
    public sealed class Projectile : MonoBehaviour
    {
        public struct Result
        {
            public bool Hit;
            public RaycastHit Info;
            public float Distance;
            public float Time;
            public List<Vector3> Path;
        }

        private ShotParams _params;
        private BulletState _state;
        private Action<Result> _onDone;
        private readonly List<Vector3> _path = new List<Vector3>(256);
        private float _maxTime;
        private bool _done;

        public IReadOnlyList<Vector3> Path => _path;

        public static Projectile Fire(in ShotParams p, float maxTime, Action<Result> onDone)
        {
            var go = new GameObject("Bullet");
            var bullet = go.AddComponent<Projectile>();
            bullet._params = p;
            bullet._state = BallisticsSolver.Initial(p);
            bullet._onDone = onDone;
            bullet._maxTime = maxTime;
            bullet._path.Add(p.Origin);
            go.transform.position = p.Origin;
            return bullet;
        }

        private void FixedUpdate()
        {
            if (_done) return;

            var prev = _state.Position;
            _state = BallisticsSolver.Step(_state, _params, Time.fixedDeltaTime);
            var delta = _state.Position - prev;
            var dist = delta.magnitude;

            if (dist > 0.0001f &&
                Physics.SphereCast(prev, _params.Radius, delta / dist, out var hit, dist,
                                   _params.Mask, QueryTriggerInteraction.Ignore))
            {
                _path.Add(hit.point);
                Finish(true, hit, Vector3.Distance(_params.Origin, hit.point));
                return;
            }

            _path.Add(_state.Position);
            transform.position = _state.Position;

            if (_state.Time >= _maxTime)
            {
                Finish(false, default, Vector3.Distance(_params.Origin, _state.Position));
            }
        }

        private void Finish(bool hit, RaycastHit info, float distance)
        {
            _done = true;
            var cb = _onDone;
            _onDone = null;

            cb?.Invoke(new Result
            {
                Hit = hit,
                Info = info,
                Distance = distance,
                Time = _state.Time,
                Path = _path
            });

            // объект живёт ещё кадр: килл-кам успевает забрать траекторию
            Destroy(gameObject, 0.1f);
        }
    }
}
