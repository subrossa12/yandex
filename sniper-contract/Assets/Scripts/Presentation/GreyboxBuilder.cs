using System.Collections.Generic;
using UnityEngine;
using Sniper.Missions;

namespace Sniper.Presentation
{
    /// <summary>
    /// Собирает сцену миссии из примитивов прямо в рантайме.
    ///
    /// Почему не сцены Unity: миссия — это данные, и она должна читаться
    /// в диффе, правиться текстом и приезжать флагом. Бинарная сцена не
    /// умеет ничего из этого. Плюс проект запускается из пустой сцены с
    /// одним компонентом — greybox играбелен раньше, чем появится первый
    /// ассет, ровно как того требует порядок работ.
    ///
    /// Когда ассеты появятся, здесь меняется одна функция: вместо
    /// GameObject.CreatePrimitive ставится префаб. Миссии при этом не
    /// трогаются вовсе.
    /// </summary>
    public sealed class GreyboxBuilder : MonoBehaviour
    {
        private readonly List<GameObject> _spawned = new List<GameObject>();

        public Actor[] Actors { get; private set; } = new Actor[0];
        public Hazard[] Hazards { get; private set; } = new Hazard[0];

        private static readonly Color GroundColor = new Color(0.24f, 0.25f, 0.22f);
        private static readonly Color BlockColor = new Color(0.42f, 0.42f, 0.44f);
        private static readonly Color CoverColor = new Color(0.32f, 0.34f, 0.36f);
        private static readonly Color TargetColor = new Color(0.72f, 0.28f, 0.24f);
        private static readonly Color GuardColor = new Color(0.55f, 0.45f, 0.28f);
        private static readonly Color CivilColor = new Color(0.30f, 0.55f, 0.62f);
        private static readonly Color HazardColor = new Color(0.85f, 0.70f, 0.20f);

        public void Clear()
        {
            foreach (var go in _spawned) if (go != null) Destroy(go);
            _spawned.Clear();
            Actors = new Actor[0];
            Hazards = new Hazard[0];
        }

        public void Build(MissionDefinition def)
        {
            Clear();
            BuildGround();
            ApplyTimeOfDay(def.timeOfDay);

            var actors = new List<Actor>();
            var hazards = new List<Hazard>();
            var rng = new System.Random(def.seed);

            foreach (var p in def.placements)
            {
                switch (p.kind)
                {
                    case "target":
                        actors.Add(SpawnActor(p, ActorKind.Target, TargetColor, rng, 1.6f));
                        break;
                    case "guard":
                        actors.Add(SpawnActor(p, ActorKind.Guard, GuardColor, rng, 1.1f));
                        break;
                    case "civilian":
                        actors.Add(SpawnActor(p, ActorKind.Civilian, CivilColor, rng, 1.0f));
                        break;
                    case "hazard":
                        hazards.Add(SpawnHazard(p));
                        break;
                    case "cover":
                        SpawnBox(p, CoverColor);
                        break;
                    default:
                        SpawnBox(p, BlockColor);
                        break;
                }
            }

            Actors = actors.ToArray();
            Hazards = hazards.ToArray();
        }

        private void BuildGround()
        {
            var ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
            ground.name = "Ground";
            ground.transform.localScale = new Vector3(120f, 1f, 120f);
            Paint(ground, GroundColor);
            Track(ground);
        }

        /// <summary>
        /// Время суток — это не только освещение, но и сложность: ночью
        /// цель хуже читается на фоне, и та же миссия ощущается иначе.
        /// Локация при этом переиспользуется, как и задумано.
        /// </summary>
        private void ApplyTimeOfDay(string time)
        {
            var light = FindObjectOfType<Light>();
            if (light == null)
            {
                var go = new GameObject("Sun");
                light = go.AddComponent<Light>();
                light.type = LightType.Directional;
                Track(go);
            }

            switch (time)
            {
                case "night":
                    light.color = new Color(0.55f, 0.62f, 0.85f);
                    light.intensity = 0.35f;
                    light.transform.rotation = Quaternion.Euler(28f, 200f, 0f);
                    RenderSettings.ambientLight = new Color(0.10f, 0.12f, 0.18f);
                    break;
                case "dusk":
                    light.color = new Color(1f, 0.72f, 0.48f);
                    light.intensity = 0.85f;
                    light.transform.rotation = Quaternion.Euler(12f, 140f, 0f);
                    RenderSettings.ambientLight = new Color(0.22f, 0.19f, 0.20f);
                    break;
                default:
                    light.color = new Color(1f, 0.96f, 0.88f);
                    light.intensity = 1.15f;
                    light.transform.rotation = Quaternion.Euler(52f, 40f, 0f);
                    RenderSettings.ambientLight = new Color(0.32f, 0.33f, 0.34f);
                    break;
            }
        }

        private GameObject SpawnBox(Placement p, Color color)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.transform.position = p.Position;
            go.transform.localScale = p.Scale;
            go.transform.rotation = Quaternion.Euler(0f, p.rot, 0f);
            Paint(go, color);
            Track(go);
            return go;
        }

        /// <summary>
        /// Человек на этапе greybox — капсула. Этого достаточно: если на
        /// капсулах стрелять неинтересно, ассеты этого не спасут.
        /// </summary>
        private Actor SpawnActor(Placement p, ActorKind kind, Color color, System.Random rng, float speed)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            go.name = kind.ToString();
            go.transform.position = p.Position;
            go.transform.localScale = new Vector3(0.6f, 0.9f, 0.6f);
            Paint(go, color);

            var actor = go.AddComponent<Actor>();
            actor.Kind = kind;

            // маршрут: короткая петля вокруг точки расстановки
            if (p.sx > 0.01f || p.sz > 0.01f)
            {
                var a = p.Position;
                var b = a + new Vector3(p.sx, 0f, p.sz);
                actor.SetRoute(new[] { a, b }, speed);
            }

            Track(go);
            return actor;
        }

        private Hazard SpawnHazard(Placement p)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = "Hazard";
            go.transform.position = p.Position;
            go.transform.localScale = p.Scale;
            Paint(go, HazardColor);

            var hazard = go.AddComponent<Hazard>();
            hazard.Radius = Mathf.Max(1.5f, p.sy);
            Track(go);
            return hazard;
        }

        private static void Paint(GameObject go, Color color)
        {
            var r = go.GetComponent<Renderer>();
            if (r == null) return;
            // Shader.Find по URP-имени: в билде шейдер должен лежать в
            // Always Included Shaders, иначе материал станет розовым
            var shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            var mat = new Material(shader) { color = color };
            r.sharedMaterial = mat;
        }

        private void Track(GameObject go) => _spawned.Add(go);
    }
}
