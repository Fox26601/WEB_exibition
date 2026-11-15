using System.Collections.Generic;
using Gallery.Catalog;
using UnityEngine;

namespace Gallery.Room
{
    /// <summary>
    /// Builds gallery geometry. Empty layout → legacy rect L/R corridor.
    /// Non-empty layout → polygon rooms with mid-edge doorway cuts.
    /// </summary>
    public class RoomBuilder : MonoBehaviour
    {
        public const float Width = 8f;
        public const float Height = 3.2f;
        public const float SlotPitch = 3f;
        public const float MarginEnds = 2f;
        public const float WallThickness = 0.12f;

        [SerializeField] Color floorColor = new Color(0.82f, 0.80f, 0.76f);
        [SerializeField] Color wallColor = new Color(0.93f, 0.92f, 0.89f);
        [SerializeField] Color ceilingColor = new Color(0.96f, 0.96f, 0.95f);

        Transform _root;
        float _length = L0;
        readonly Dictionary<string, Vector3[]> _roomVerts = new Dictionary<string, Vector3[]>();
        GalleryLayoutData _layout;

        public float Length => _length;
        public static float L0 => MarginEnds * 2f;
        public GalleryLayoutData ActiveLayout => _layout;
        public bool UsingLayout => _layout != null && _layout.HasRooms;

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
            _layout = null;
            _roomVerts.Clear();
            _length = ComputeLength(artworkCount);
            Clear();

            _root = new GameObject("Room").transform;
            _root.SetParent(transform, false);
            BuildRectCorridor(_length);
        }

        public void BuildFromCatalog(CatalogData catalog)
        {
            if (catalog?.layout != null && catalog.layout.HasRooms)
            {
                BuildFromLayout(catalog.layout);
                return;
            }

            var n = 0;
            if (catalog?.artworks != null)
            {
                for (var i = 0; i < catalog.artworks.Length; i++)
                {
                    var a = catalog.artworks[i];
                    if (a == null) continue;
                    if (a.ArtworkType == ArtworkType.Model) continue;
                    n++;
                }
            }

            Build(n);
        }

        public void BuildFromLayout(GalleryLayoutData layout)
        {
            _layout = layout;
            _roomVerts.Clear();
            Clear();

            _root = new GameObject("LayoutRooms").transform;
            _root.SetParent(transform, false);

            float minX = float.PositiveInfinity, maxX = float.NegativeInfinity;
            float minZ = float.PositiveInfinity, maxZ = float.NegativeInfinity;

            foreach (var room in layout.rooms)
            {
                if (room == null) continue;
                var verts = ResolveRoomVertices(room);
                _roomVerts[room.id ?? ""] = verts;
                for (var i = 0; i < verts.Length; i++)
                {
                    minX = Mathf.Min(minX, verts[i].x);
                    maxX = Mathf.Max(maxX, verts[i].x);
                    minZ = Mathf.Min(minZ, verts[i].z);
                    maxZ = Mathf.Max(maxZ, verts[i].z);
                }

                BuildPolygonRoom(room, verts, layout);
            }

            if (float.IsInfinity(minZ) || float.IsInfinity(maxZ))
            {
                _length = L0;
            }
            else
            {
                _length = Mathf.Max(L0, maxZ - minZ + 2f);
            }
        }

        public bool TryGetRoomVertices(string roomId, out Vector3[] verts)
        {
            return _roomVerts.TryGetValue(roomId ?? "", out verts);
        }

        public bool TryGetPaintingPose(ArtworkPlacementData placement, out Vector3 position, out Quaternion rotation)
        {
            position = Vector3.zero;
            rotation = Quaternion.identity;
            if (placement == null || string.IsNullOrEmpty(placement.roomId))
                return false;
            if (!_roomVerts.TryGetValue(placement.roomId, out var verts) || verts == null || verts.Length < 2)
                return false;

            var i = ((placement.wallEdgeIndex % verts.Length) + verts.Length) % verts.Length;
            var a = verts[i];
            var b = verts[(i + 1) % verts.Length];
            var t = Mathf.Clamp01(placement.tAlongEdge);
            var along = Vector3.Lerp(a, b, t);
            var edge = b - a;
            var normal = new Vector3(-edge.z, 0f, edge.x).normalized;
            // Face inward (flip normal); inset slightly from wall.
            position = along - normal * 0.08f + Vector3.up * (Height * 0.55f);
            var yaw = placement.yaw;
            if (Mathf.Approximately(yaw, 0f))
                yaw = Mathf.Atan2(-normal.x, -normal.z) * Mathf.Rad2Deg;
            rotation = Quaternion.Euler(0f, yaw, 0f);
            return true;
        }

        public bool TryGetSculpturePose(ArtworkPlacementData placement, out Vector3 position, out Quaternion rotation)
        {
            position = Vector3.zero;
            rotation = Quaternion.identity;
            if (placement == null)
                return false;
            position = new Vector3(placement.floorX, 0f, placement.floorZ);
            rotation = Quaternion.Euler(0f, placement.yaw, 0f);
            return true;
        }

        void BuildRectCorridor(float length)
        {
            CreateBox("Floor", new Vector3(0f, -0.05f, length * 0.5f), new Vector3(Width, 0.1f, length), floorColor);
            var rim = 0.55f;
            var openW = Mathf.Max(1f, Width - rim * 2f);
            var openL = Mathf.Max(1f, length - rim * 2f);
            var ceilY = Height + 0.05f;
            CreateBox("CeilNear", new Vector3(0f, ceilY, rim * 0.5f), new Vector3(Width, 0.1f, rim), ceilingColor);
            CreateBox("CeilFar", new Vector3(0f, ceilY, length - rim * 0.5f), new Vector3(Width, 0.1f, rim), ceilingColor);
            CreateBox("CeilLeft", new Vector3(-Width * 0.5f + rim * 0.5f, ceilY, length * 0.5f), new Vector3(rim, 0.1f, openL), ceilingColor);
            CreateBox("CeilRight", new Vector3(Width * 0.5f - rim * 0.5f, ceilY, length * 0.5f), new Vector3(rim, 0.1f, openL), ceilingColor);
            CreateBox("WallLeft", new Vector3(-Width * 0.5f, Height * 0.5f, length * 0.5f), new Vector3(WallThickness, Height, length), wallColor);
            CreateBox("WallRight", new Vector3(Width * 0.5f, Height * 0.5f, length * 0.5f), new Vector3(WallThickness, Height, length), wallColor);
            CreateBox("WallNear", new Vector3(0f, Height * 0.5f, 0f), new Vector3(Width, Height, WallThickness), wallColor);
            CreateBox("WallFar", new Vector3(0f, Height * 0.5f, length), new Vector3(Width, Height, WallThickness), wallColor);
            CreateBox("DoorPortal", new Vector3(0f, 1.1f, -0.02f), new Vector3(1.2f, 2.2f, 0.08f), new Color(0.25f, 0.25f, 0.28f));
        }

        void BuildPolygonRoom(GalleryRoomData room, Vector3[] verts, GalleryLayoutData layout)
        {
            var roomRoot = new GameObject(string.IsNullOrEmpty(room.id) ? "Room" : $"Room_{room.id}").transform;
            roomRoot.SetParent(_root, false);

            var centroid = Vector3.zero;
            for (var i = 0; i < verts.Length; i++)
                centroid += verts[i];
            centroid /= Mathf.Max(1, verts.Length);

            // Approximate floor as overlapping thin boxes from centroid to each edge.
            for (var i = 0; i < verts.Length; i++)
            {
                var a = verts[i];
                var b = verts[(i + 1) % verts.Length];
                var mid = (a + b) * 0.5f;
                var edge = b - a;
                var edgeLen = edge.magnitude;
                var toMid = mid - centroid;
                var depth = toMid.magnitude + 0.05f;
                var yaw = Mathf.Atan2(toMid.x, toMid.z) * Mathf.Rad2Deg;
                var floor = GameObject.CreatePrimitive(PrimitiveType.Cube);
                floor.name = $"FloorSeg_{i}";
                floor.transform.SetParent(roomRoot, false);
                floor.transform.position = new Vector3(centroid.x, -0.05f, centroid.z) +
                                          Quaternion.Euler(0f, yaw, 0f) * new Vector3(0f, 0f, depth * 0.5f);
                floor.transform.rotation = Quaternion.Euler(0f, yaw, 0f);
                floor.transform.localScale = new Vector3(Mathf.Max(edgeLen, 0.2f), 0.1f, depth);
                floor.GetComponent<MeshRenderer>().sharedMaterial = CreateMaterial(floorColor);
            }

            for (var i = 0; i < verts.Length; i++)
            {
                var a = verts[i];
                var b = verts[(i + 1) % verts.Length];
                var doorway = FindDoorwayWidth(layout, room.id, i);
                BuildWallSegment(roomRoot, a, b, i, doorway);
            }

            // Simple ceiling rim over centroid.
            var span = 0f;
            for (var i = 0; i < verts.Length; i++)
                span = Mathf.Max(span, Vector3.Distance(centroid, verts[i]));
            CreateBoxUnder(roomRoot, "Ceil", new Vector3(centroid.x, Height + 0.05f, centroid.z),
                new Vector3(span * 1.6f, 0.08f, span * 1.6f), ceilingColor);
        }

        float FindDoorwayWidth(GalleryLayoutData layout, string roomId, int edgeIndex)
        {
            if (layout?.connections == null) return 0f;
            for (var i = 0; i < layout.connections.Length; i++)
            {
                var c = layout.connections[i];
                if (c == null) continue;
                if (c.roomA == roomId && c.edgeA == edgeIndex)
                    return Mathf.Max(0.9f, c.doorwayWidth);
                if (c.roomB == roomId && c.edgeB == edgeIndex)
                    return Mathf.Max(0.9f, c.doorwayWidth);
            }

            return 0f;
        }

        void BuildWallSegment(Transform parent, Vector3 a, Vector3 b, int edgeIndex, float doorwayWidth)
        {
            var mid = (a + b) * 0.5f;
            var edge = b - a;
            var len = edge.magnitude;
            var yaw = Mathf.Atan2(edge.x, edge.z) * Mathf.Rad2Deg;

            if (doorwayWidth <= 0.01f || doorwayWidth >= len - 0.2f)
            {
                CreateOrientedWall(parent, $"Wall_{edgeIndex}", mid, len, yaw);
                return;
            }

            var halfDoor = doorwayWidth * 0.5f;
            var halfRemain = (len - doorwayWidth) * 0.5f;
            if (halfRemain < 0.05f)
            {
                // Almost fully open — leave a lintel only.
                CreateOrientedWall(parent, $"Lintel_{edgeIndex}",
                    mid + Vector3.up * (Height * 0.5f + 0.55f), len, yaw, 0.9f, Height - 2.2f);
                return;
            }

            var dir = edge.normalized;
            var leftMid = mid - dir * (halfDoor + halfRemain * 0.5f);
            var rightMid = mid + dir * (halfDoor + halfRemain * 0.5f);
            CreateOrientedWall(parent, $"Wall_{edgeIndex}_L", leftMid, halfRemain, yaw);
            CreateOrientedWall(parent, $"Wall_{edgeIndex}_R", rightMid, halfRemain, yaw);
            CreateOrientedWall(parent, $"Lintel_{edgeIndex}",
                mid + Vector3.up * (2.2f + (Height - 2.2f) * 0.5f), doorwayWidth, yaw, doorwayWidth, Height - 2.2f);
        }

        void CreateOrientedWall(Transform parent, string name, Vector3 mid, float length, float yaw,
            float overrideLength = -1f, float overrideHeight = -1f)
        {
            var h = overrideHeight > 0f ? overrideHeight : Height;
            var l = overrideLength > 0f ? overrideLength : length;
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = name;
            go.transform.SetParent(parent, false);
            // mid.y may carry lintel elevation; otherwise center on wall height.
            var y = mid.y > 0.01f ? mid.y : h * 0.5f;
            go.transform.position = new Vector3(mid.x, y, mid.z);
            go.transform.rotation = Quaternion.Euler(0f, yaw, 0f);
            go.transform.localScale = new Vector3(WallThickness, h, Mathf.Max(0.05f, l));
            go.GetComponent<MeshRenderer>().sharedMaterial = CreateMaterial(wallColor);
        }

        void CreateBoxUnder(Transform parent, string name, Vector3 localPos, Vector3 scale, Color color)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = name;
            go.transform.SetParent(parent, false);
            go.transform.position = localPos;
            go.transform.localScale = scale;
            go.GetComponent<MeshRenderer>().sharedMaterial = CreateMaterial(color);
        }

        public static Vector3[] ResolveRoomVertices(GalleryRoomData room)
        {
            if (room.vertices != null && room.vertices.Length >= 3)
            {
                var arr = new Vector3[room.vertices.Length];
                for (var i = 0; i < room.vertices.Length; i++)
                    arr[i] = new Vector3(room.vertices[i].x, 0f, room.vertices[i].z);
                return arr;
            }

            var local = ShapeLocal(room.shape);
            var t = room.transform ?? new RoomTransformData();
            var sx = t.scaleX <= 0.01f ? 1f : t.scaleX;
            var sz = t.scaleZ <= 0.01f ? 1f : t.scaleZ;
            var rad = t.rotation * Mathf.Deg2Rad;
            var c = Mathf.Cos(rad);
            var s = Mathf.Sin(rad);
            var world = new Vector3[local.Length];
            for (var i = 0; i < local.Length; i++)
            {
                var lx = local[i].x * sx;
                var lz = local[i].z * sz;
                world[i] = new Vector3(t.x + lx * c - lz * s, 0f, t.z + lx * s + lz * c);
            }

            return world;
        }

        static Vector3[] ShapeLocal(string shape)
        {
            var n = 4;
            var start = Mathf.PI / 4f;
            if (string.Equals(shape, "triangle", System.StringComparison.OrdinalIgnoreCase))
            {
                n = 3;
                start = -Mathf.PI / 2f;
            }
            else if (string.Equals(shape, "pentagon", System.StringComparison.OrdinalIgnoreCase))
            {
                n = 5;
                start = 0f;
            }
            else if (string.Equals(shape, "hexagon", System.StringComparison.OrdinalIgnoreCase))
            {
                n = 6;
                start = 0f;
            }
            else if (string.Equals(shape, "square", System.StringComparison.OrdinalIgnoreCase))
            {
                n = 4;
                start = Mathf.PI / 4f;
            }

            var verts = new Vector3[n];
            for (var i = 0; i < n; i++)
            {
                var a = start + (i * 2f * Mathf.PI) / n;
                verts[i] = new Vector3(Mathf.Cos(a), 0f, Mathf.Sin(a));
            }

            return verts;
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
        }

        static Material CreateMaterial(Color color) => RuntimeMaterials.Create(color);
    }
}
