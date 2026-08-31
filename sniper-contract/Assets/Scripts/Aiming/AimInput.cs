using UnityEngine;

namespace Sniper.Aiming
{
    /// <summary>
    /// Ввод: мышь на десктопе, жесты на телефоне.
    ///
    /// Половина аудитории платформы играет с телефона, поэтому тач здесь
    /// не «поддержка», а основной путь: свайп — поворот прицела, пинч —
    /// кратность, тап — выстрел, удержание двумя пальцами — задержка
    /// дыхания.
    ///
    /// Горячих клавиш, которые перехватывает браузер или система, нет
    /// намеренно (п. 1.6.2.6): только мышь, колесо и Shift.
    /// </summary>
    public sealed class AimInput : MonoBehaviour
    {
        public struct Frame
        {
            public Vector2 Look;      // градусы за кадр
            public float Zoom;        // шаги кратности
            public bool Fire;
            public bool Hold;         // задержка дыхания
        }

        private Vector2 _lastTouch;
        private float _lastPinch;
        private bool _dragging;

        private float MouseSens => Core.Flags.Num("input.mouseSensitivity", 0.13f);
        private float TouchSens => Core.Flags.Num("input.touchSensitivity", 0.09f);

        public Frame Read(bool inputEnabled)
        {
            var frame = new Frame();
            if (!inputEnabled) return frame;

            if (Input.touchCount > 0) ReadTouch(ref frame);
            else ReadMouse(ref frame);

            return frame;
        }

        private void ReadMouse(ref Frame frame)
        {
            _dragging = false;
            frame.Look = new Vector2(Input.GetAxisRaw("Mouse X"), Input.GetAxisRaw("Mouse Y")) * MouseSens;
            frame.Zoom = Input.mouseScrollDelta.y;
            frame.Fire = Input.GetMouseButtonDown(0);
            frame.Hold = Input.GetKey(KeyCode.LeftShift) || Input.GetKey(KeyCode.RightShift);
        }

        private void ReadTouch(ref Frame frame)
        {
            // два пальца: кратность щипком и задержка дыхания
            if (Input.touchCount >= 2)
            {
                var a = Input.GetTouch(0);
                var b = Input.GetTouch(1);
                var pinch = Vector2.Distance(a.position, b.position);

                if (a.phase == TouchPhase.Began || b.phase == TouchPhase.Began) _lastPinch = pinch;
                frame.Zoom = (pinch - _lastPinch) * 0.01f;
                _lastPinch = pinch;

                frame.Hold = true;
                _dragging = false;
                return;
            }

            var t = Input.GetTouch(0);
            switch (t.phase)
            {
                case TouchPhase.Began:
                    _lastTouch = t.position;
                    _dragging = false;
                    break;

                case TouchPhase.Moved:
                    var delta = t.position - _lastTouch;
                    _lastTouch = t.position;
                    frame.Look = delta * TouchSens;
                    // сдвиг дальше порога — это прицеливание, а не выстрел
                    if (delta.sqrMagnitude > 16f) _dragging = true;
                    break;

                case TouchPhase.Ended:
                    // тап без заметного сдвига — выстрел
                    if (!_dragging && t.tapCount > 0) frame.Fire = true;
                    _dragging = false;
                    break;
            }
        }
    }
}
