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

        [SerializeField] Color floorColor = new Color(0.52f, 0.53f, 0.55f);
        [SerializeField] Color wallColor = new Color(0.68f, 0.69f, 0.72f);

        Transform _root;
        float _length = L0;
        float _galleryStartZ;
        float _galleryEndZ = L0;
        float _layoutMinZ = float.NaN;
        readonly Dictionary<string, Vector3[]> _roomVerts = new Dictionary<string, Vector3[]>();
        GalleryLayoutData _layout;

        public float Length => _length;
        /// <summary>World Z where the exhibition arch / gallery threshold sits.</summary>
        public float GalleryStartZ => _galleryStartZ;
        public float GalleryEndZ => _galleryEndZ;
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
            _galleryStartZ = 0f;
            _length = ComputeLength(artworkCount);
            _galleryEndZ = _galleryStartZ + _length;
            Clear();

            _root = new GameObject("Room").transform;
            _root.SetParent(transform, false);
            BuildRectCorridor(_length, openNearDoorway: true);
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

            // First pass: resolve verts + bounds so entrance doorway can open at min-Z.
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
            }

            if (float.IsInfinity(minZ) || float.IsInfinity(maxZ))
            {
                _galleryStartZ = 0f;
                _galleryEndZ = L0;
                _layoutMinZ = 0f;
                _length = L0;
            }
            else
            {
                _galleryStartZ = minZ;
                _galleryEndZ = maxZ;
                _layoutMinZ = minZ;
                _length = Mathf.Max(L0, maxZ - minZ + 2f);
            }

            foreach (var room in layout.rooms)
            {
                if (room == null) continue;
                if (!_roomVerts.TryGetValue(room.id ?? "", out var verts)) continue;
                BuildPolygonRoom(room, verts, layout);
            }
        }

        public bool TryGetRoomVertices(string roomId, out Vector3[] verts)
        {
            return _roomVerts.TryGetValue(roomId ?? "", out verts);
        }

        public bool TryGetLayoutCenter(out Vector3 center)
        {
            center = Vector3.zero;
            if (_roomVerts.Count == 0)
                return false;

            var count = 0;
            foreach (var pair in _roomVerts)
            {
                var verts = pair.Value;
                if (verts == null) continue;
                for (var i = 0; i < verts.Length; i++)
                {
                    center += verts[i];
                    count++;
                }
            }

            if (count == 0) return false;
            center /= count;
            center.y = 0f;
            return true;
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

        void BuildRectCorridor(float length, bool openNearDoorway = false)
        {
            // Open-air: floor + walls only (no ceiling).
            CreateBox("Floor", new Vector3(0f, -0.05f, length * 0.5f), new Vector3(Width, 0.1f, length), floorColor);
            CreateBox("WallLeft", new Vector3(-Width * 0.5f, Height * 0.5f, length * 0.5f), new Vector3(WallThickness, Height, length), wallColor);
            CreateBox("WallRight", new Vector3(Width * 0.5f, Height * 0.5f, length * 0.5f), new Vector3(WallThickness, Height, length), wallColor);

            if (openNearDoorway)
            {
                // Doorway cut for entrance arch (matches EntranceBuilder.ArchWidth).
                const float doorW = 2.4f;
                var side = (Width - doorW) * 0.5f;
                if (side > 0.05f)
                {
                    CreateBox("WallNearL", new Vector3(-(doorW * 0.5f + side * 0.5f), Height * 0.5f, 0f),
                        new Vector3(side, Height, WallThickness), wallColor);
                    CreateBox("WallNearR", new Vector3(doorW * 0.5f + side * 0.5f, Height * 0.5f, 0f),
                        new Vector3(side, Height, WallThickness), wallColor);
                }

                var lintelH = Mathf.Max(0.2f, Height - 2.6f);
                CreateBox("WallNearLintel", new Vector3(0f, 2.6f + lintelH * 0.5f, 0f),
                    new Vector3(doorW, lintelH, WallThickness), wallColor);
            }
            else
            {
                CreateBox("WallNear", new Vector3(0f, Height * 0.5f, 0f), new Vector3(Width, Height, WallThickness), wallColor);
                CreateBox("DoorPortal", new Vector3(0f, 1.1f, -0.02f), new Vector3(1.2f, 2.2f, 0.08f), new Color(0.25f, 0.25f, 0.28f));
            }

            CreateBox("WallFar", new Vector3(0f, Height * 0.5f, length), new Vector3(Width, Height, WallThickness), wallColor);
        }

        void BuildPolygonRoom(GalleryRoomData room, Vector3[] verts, GalleryLayoutData layout)
        {
            var roomRoot = new GameObject(string.IsNullOrEmpty(room.id) ? "Room" : $"Room_{room.id}").transform;
            roomRoot.SetParent(_root, false);

            BuildPolygonFloor(roomRoot, verts);

            for (var i = 0; i < verts.Length; i++)
            {
                var a = verts[i];
                var b = verts[(i + 1) % verts.Length];
                var doorway = FindDoorwayWidth(layout, room.id, i);
                // When layout carries an entrance block, open only edges connected to __entrance
                // (not the legacy min-Z heuristic).
                if (doorway <= 0.01f && !layout.HasEntrance && IsEntranceEdge(a, b))
                    doorway = 2.4f;
                BuildWallSegment(roomRoot, a, b, i, doorway);
            }

        }

        void BuildPolygonFloor(Transform parent, Vector3[] verts)
        {
            if (!PolygonTriangulation.TryTriangulateXZ(verts, out var triangles))
            {
                // Fallback: thin box at centroid if triangulation fails.
                var c = Vector3.zero;
                for (var i = 0; i < verts.Length; i++) c += verts[i];
                c /= Mathf.Max(1, verts.Length);
                CreateBoxUnder(parent, "FloorFallback", new Vector3(c.x, -0.05f, c.z),
                    new Vector3(2f, 0.1f, 2f), floorColor);
                return;
            }

            var meshVerts = new Vector3[verts.Length];
            for (var i = 0; i < verts.Length; i++)
                meshVerts[i] = new Vector3(verts[i].x, -0.05f, verts[i].z);

            PolygonTriangulation.EnsureNormalsFaceUp(verts, triangles);

            var mesh = new Mesh { name = "RoomFloor" };
            mesh.vertices = meshVerts;
            mesh.triangles = triangles;
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();

            var floorGo = new GameObject("Floor");
            floorGo.transform.SetParent(parent, false);
            floorGo.AddComponent<MeshFilter>().sharedMesh = mesh;
            floorGo.AddComponent<MeshRenderer>().sharedMaterial = CreateMaterial(floorColor);
            var col = floorGo.AddComponent<MeshCollider>();
            col.convex = false;
            col.sharedMesh = mesh;
        }

        void CreateBoxUnder(Transform parent, string name, Vector3 worldPos, Vector3 scale, Color color)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = name;
            go.transform.SetParent(parent, false);
            go.transform.position = worldPos;
            go.transform.localScale = scale;
            go.GetComponent<MeshRenderer>().sharedMaterial = CreateMaterial(color);
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

        bool IsEntranceEdge(Vector3 a, Vector3 b)
        {
            if (float.IsNaN(_layoutMinZ)) return false;
            var midZ = (a.z + b.z) * 0.5f;
            if (midZ > _layoutMinZ + 0.35f) return false;
            var edge = b - a;
            // Prefer edges that run mostly along X (face ±Z).
            return Mathf.Abs(edge.x) >= Mathf.Abs(edge.z) * 0.6f;
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
