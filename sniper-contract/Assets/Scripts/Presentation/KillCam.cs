using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace Sniper.Presentation
{
    /// <summary>
    /// Килл-кам: повтор полёта пули на замедлении.
    ///
    /// Главный источник удовольствия в жанре и главный повод показать
    /// игру знакомым, поэтому он показывает не «похожий» полёт, а ровно
    /// тот, что случился: траектория берётся записанной у самой пули, а
    /// не пересчитывается заново. Пересчёт разошёлся бы с попаданием на
    /// длинной дистанции, и повтор врал бы.
    ///
    /// Запускается не на каждом выстреле, а только на тех, которые
    /// заслуживают показа: далеко, или через объект окружения, или
    /// последним патроном. Килл-кам на каждый промах — это просто
    /// задержка между попытками.
    /// </summary>
    public sealed class KillCam : MonoBehaviour
    {
        [SerializeField] private Camera _camera;

        public bool Playing { get; private set; }

        private float MinRange => Core.Flags.Num("killcam.minRange", 220f);
        private float SlowScale => Core.Flags.Num("killcam.timeScale", 0.22f);
        private float LeadIn => Core.Flags.Num("killcam.leadIn", 0.35f);

        public bool ShouldPlay(float distance, bool hazard, bool lastRound)
        {
            if (Playing) return false;
            return distance >= MinRange || hazard || lastRound;
        }

        public void Play(IReadOnlyList<Vector3> path, System.Action onDone)
        {
            if (path == null || path.Count < 2) { onDone?.Invoke(); return; }
            StartCoroutine(Run(path, onDone));
        }

        private IEnumerator Run(IReadOnlyList<Vector3> path, System.Action onDone)
        {
            Playing = true;

            var prevPos = _camera.transform.position;
            var prevRot = _camera.transform.rotation;
            var prevFov = _camera.fieldOfView;
            var prevScale = Time.timeScale;
            var prevFixed = Time.fixedDeltaTime;

            Time.timeScale = SlowScale;
            // шаг физики масштабируется вместе со временем, иначе
            // замедление превращается в рывки
            Time.fixedDeltaTime = prevFixed * SlowScale;
            _camera.fieldOfView = Core.Flags.Num("killcam.fov", 42f);

            // подлёт: камера идёт сбоку и чуть позади пули
            var travel = LeadIn;
            var t = 0f;
            var total = Mathf.Max(0.001f, Core.Flags.Num("killcam.durationSeconds", 2.2f));

            while (t < total)
            {
                t += Time.unscaledDeltaTime;
                var k = Mathf.Clamp01(t / total);

                var index = Mathf.Clamp(Mathf.RoundToInt(k * (path.Count - 1)), 0, path.Count - 1);
                var ahead = Mathf.Clamp(index + 3, 0, path.Count - 1);

                var pos = path[index];
                var dir = (path[ahead] - pos).sqrMagnitude > 0.001f
                    ? (path[ahead] - pos).normalized
                    : _camera.transform.forward;

                var side = Vector3.Cross(Vector3.up, dir).normalized;
                _camera.transform.position = pos - dir * 6f + side * 2.2f + Vector3.up * 1.1f;
                _camera.transform.rotation = Quaternion.LookRotation(dir + side * 0.12f, Vector3.up);

                travel += Time.unscaledDeltaTime;
                yield return null;
            }

            // короткая пауза на точке попадания — момент, ради которого всё
            yield return new WaitForSecondsRealtime(Core.Flags.Num("killcam.holdSeconds", 0.5f));

            Time.timeScale = prevScale;
            Time.fixedDeltaTime = prevFixed;
            _camera.transform.position = prevPos;
            _camera.transform.rotation = prevRot;
            _camera.fieldOfView = prevFov;

            Playing = false;
            onDone?.Invoke();
        }
    }
}
