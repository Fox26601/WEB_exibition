using UnityEngine;

namespace Gallery.Room
{
    /// <summary>
    /// Builds a rectangular gallery from primitives.
    /// Fixed W=8, H=3.2; length grows with artwork count:
    /// L = marginEnds*2 + ceil(N/2)*slotPitch. Empty N → L0 (= marginEnds*2).
    /// </summary>
    public class RoomBuilder : MonoBehaviour
    {
        public const float Width = 8f;
        public const float Height = 3.2f;
        public const float SlotPitch = 3f;
        public const float MarginEnds = 2f;

        [SerializeField] Color floorColor = new Color(0.82f, 0.80f, 0.76f);
        [SerializeField] Color wallColor = new Color(0.93f, 0.92f, 0.89f);
        [SerializeField] Color ceilingColor = new Color(0.96f, 0.96f, 0.95f);

        Transform _root;
        float _length = L0;

        public float Length => _length;
        public static float L0 => MarginEnds * 2f;

        public static float ComputeLength(int artworkCount)
        {
            if (artworkCount <= 0)
                return L0;

            var pairs = Mathf.CeilToInt(artworkCount / 2f);
            return MarginEnds * 2f + pairs * SlotPitch;
        }

        /// <summary>
        /// Wall index 0 = left (-X), 1 = right (+X). Z along the long axis.
        /// </summary>
        public static void GetSlotPose(int index, float length, out Vector3 position, out Quaternion rotation, out int wall)
        {
            wall = index % 2;
            var pair = index / 2;
            var z = MarginEnds + pair * SlotPitch + SlotPitch * 0.5f;
            z = Mathf.Clamp(z, MarginEnds, Mathf.Max(MarginEnds, length - MarginEnds));

            var y = Height * 0.55f;
            if (wall == 0)
            {
                position = new Vector3(-Width * 0.5f + 0.06f, y, z);
                rotation = Quaternion.Euler(0f, 90f, 0f);
            }
            else
            {
                position = new Vector3(Width * 0.5f - 0.06f, y, z);
                rotation = Quaternion.Euler(0f, -90f, 0f);
            }
        }

        public void Build(int artworkCount)
        {
            _length = ComputeLength(artworkCount);
            Clear();

            _root = new GameObject("Room").transform;
            _root.SetParent(transform, false);

            CreateBox("Floor", new Vector3(0f, -0.05f, _length * 0.5f), new Vector3(Width, 0.1f, _length), floorColor);
            CreateBox("Ceiling", new Vector3(0f, Height + 0.05f, _length * 0.5f), new Vector3(Width, 0.1f, _length), ceilingColor);
            CreateBox("WallLeft", new Vector3(-Width * 0.5f, Height * 0.5f, _length * 0.5f), new Vector3(0.12f, Height, _length), wallColor);
            CreateBox("WallRight", new Vector3(Width * 0.5f, Height * 0.5f, _length * 0.5f), new Vector3(0.12f, Height, _length), wallColor);
            CreateBox("WallNear", new Vector3(0f, Height * 0.5f, 0f), new Vector3(Width, Height, 0.12f), wallColor);
            CreateBox("WallFar", new Vector3(0f, Height * 0.5f, _length), new Vector3(Width, Height, 0.12f), wallColor);

            // Simple door portal opening on near wall (visual cue only).
            CreateBox("DoorPortal", new Vector3(0f, 1.1f, -0.02f), new Vector3(1.2f, 2.2f, 0.08f), new Color(0.25f, 0.25f, 0.28f));
        }

        void Clear()
        {
            if (_root != null)
                Destroy(_root.gameObject);
        }

        void CreateBox(string name, Vector3 localPos, Vector3 scale, Color color)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = name;
            go.transform.SetParent(_root, false);
            go.transform.localPosition = localPos;
            go.transform.localScale = scale;

            var renderer = go.GetComponent<MeshRenderer>();
            renderer.sharedMaterial = CreateMaterial(color);

            // Floor needs collider for character; walls too for blocking.
            // Ceiling collider optional — keep for consistency.
        }

        static Material CreateMaterial(Color color) => RuntimeMaterials.Create(color);
    }
}
