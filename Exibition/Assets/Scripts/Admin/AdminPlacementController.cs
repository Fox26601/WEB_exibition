using System.Collections.Generic;
using Gallery.Catalog;
using Gallery.Room;
using UnityEngine;

namespace Gallery.Admin
{
    public class AdminPlacementController : MonoBehaviour
    {
        readonly List<ArtworkPlacementData> _placements = new List<ArtworkPlacementData>();

        RoomBuilder _room;
        ArtworkSpawner _spawner;
        CatalogData _catalog;
        WebAdminBridge _bridge;
        Camera _camera;

        GameObject _ghost;
        AdminDragMessage _activeDrag;
        bool _dragging;
        bool _useExternalPointer;
        Vector2 _externalScreen;

        public void Initialize(
            RoomBuilder room,
            ArtworkSpawner spawner,
            CatalogData catalog,
            WebAdminBridge bridge,
            Camera camera)
        {
            _room = room;
            _spawner = spawner;
            _catalog = catalog;
            _bridge = bridge;
            _camera = camera;
        }

        public void ApplyLayout(GalleryLayoutData layout)
        {
            if (layout?.placements == null)
                return;
            _placements.Clear();
            _placements.AddRange(layout.placements);
            RefreshSpawned();
            Emit();
        }

        public void BeginDrag(AdminDragMessage msg)
        {
            if (msg == null || string.IsNullOrEmpty(msg.artworkId))
                return;
            _activeDrag = msg;
            _dragging = true;
            _useExternalPointer = true;
            EnsureGhost(msg);
        }

        public void DragMove(AdminDragMoveMessage msg)
        {
            if (!_dragging || msg == null) return;
            _useExternalPointer = true;
            _externalScreen = new Vector2(msg.screenX, msg.screenY);
            UpdateGhostFromRay();
        }

        public void EndDrag(AdminEndDragMessage msg)
        {
            if (!_dragging || msg == null) return;
            _dragging = false;
            _useExternalPointer = false;
            if (msg.commit && _ghost != null && _activeDrag != null)
            {
                TryCommitPlacement(_activeDrag, _ghost.transform.position);
            }

            if (_ghost != null)
                Destroy(_ghost);
            _ghost = null;
            _activeDrag = null;
        }

        public void Remove(string artworkId)
        {
            if (string.IsNullOrEmpty(artworkId)) return;
            _placements.RemoveAll(p => p.artworkId == artworkId);
            RefreshSpawned();
            Emit();
        }

        public void SetFrame(AdminFrameMessage msg)
        {
            if (msg == null || string.IsNullOrEmpty(msg.artworkId)) return;
            for (var i = 0; i < _placements.Count; i++)
            {
                if (_placements[i].artworkId != msg.artworkId) continue;
                _placements[i].frameId = msg.frameId;
                RefreshSpawned();
                Emit();
                return;
            }
        }

        void Update()
        {
            if (_dragging && _ghost != null && _camera != null)
            {
                if (!_useExternalPointer)
                    UpdateGhostFromRay();
                return;
            }

            if (_camera == null || _dragging) return;
            if (!Input.GetMouseButtonDown(0)) return;
            if (Input.GetKey(KeyCode.Space) || Input.GetKey(KeyCode.LeftShift) || Input.GetKey(KeyCode.RightShift))
                return;

            TryPickExistingArtwork();
        }

        void TryPickExistingArtwork()
        {
            var ray = _camera.ScreenPointToRay(Input.mousePosition);
            if (!Physics.Raycast(ray, out var hit, 250f))
                return;

            var view = hit.collider.GetComponentInParent<ArtworkView>();
            if (view?.Entry == null || string.IsNullOrEmpty(view.Entry.id))
                return;

            _activeDrag = new AdminDragMessage
            {
                artworkId = view.Entry.id,
                kind = view.IsSculpture ? "sculpture" : "painting",
                frameId = view.FrameId,
            };
            _dragging = true;
            _useExternalPointer = false;
            EnsureGhost(_activeDrag);
            UpdateGhostFromRay();
        }

        void UpdateGhostFromRay()
        {
            if (_ghost == null || _camera == null) return;
            var screen = _useExternalPointer ? _externalScreen : (Vector2)Input.mousePosition;
            var ray = _camera.ScreenPointToRay(new Vector3(screen.x, screen.y, 0f));
            if (!Physics.Raycast(ray, out var hit, 250f))
                return;

            _ghost.transform.position = hit.point;
            if (_activeDrag != null &&
                string.Equals(_activeDrag.kind, "painting", System.StringComparison.OrdinalIgnoreCase))
            {
                var normal = hit.normal;
                if (normal.sqrMagnitude < 0.01f)
                    normal = Vector3.forward;
                _ghost.transform.rotation = Quaternion.LookRotation(-normal, Vector3.up);
            }
        }

        void TryCommitPlacement(AdminDragMessage drag, Vector3 hitPoint)
        {
            if (_room == null || !_room.UsingLayout || _room.ActiveLayout == null)
                return;

            var placement = new ArtworkPlacementData
            {
                artworkId = drag.artworkId,
                frameId = string.IsNullOrEmpty(drag.frameId) ? "wood" : drag.frameId,
            };

            var sculpture = string.Equals(drag.kind, "sculpture", System.StringComparison.OrdinalIgnoreCase);
            if (sculpture)
            {
                placement.kind = "sculpture";
                placement.floorX = hitPoint.x;
                placement.floorZ = hitPoint.z;
                placement.yaw = 0f;
                placement.roomId = FindRoomAt(hitPoint);
            }
            else
            {
                if (!TryWallPlacement(hitPoint, out var wallPlacement))
                    return;
                placement = wallPlacement;
                placement.artworkId = drag.artworkId;
                placement.frameId = string.IsNullOrEmpty(drag.frameId) ? "wood" : drag.frameId;
                placement.kind = "painting";
            }

            if (sculpture)
            {
                placement.artworkId = drag.artworkId;
                placement.frameId = "none";
            }

            _placements.RemoveAll(p => p.artworkId == drag.artworkId);
            _placements.Add(placement);
            RefreshSpawned();
            Emit();
        }

        bool TryWallPlacement(Vector3 hitPoint, out ArtworkPlacementData placement)
        {
            placement = null;
            var layout = _room.ActiveLayout;
            if (layout?.rooms == null) return false;

            var bestDist = float.MaxValue;
            ArtworkPlacementData best = null;

            foreach (var room in layout.rooms)
            {
                if (room == null || string.IsNullOrEmpty(room.id)) continue;
                if (!_room.TryGetRoomVertices(room.id, out var verts) || verts == null || verts.Length < 2)
                    continue;

                for (var i = 0; i < verts.Length; i++)
                {
                    var a = verts[i];
                    var b = verts[(i + 1) % verts.Length];
                    var ab = b - a;
                    var len = ab.magnitude;
                    if (len < 0.05f) continue;
                    var t = Mathf.Clamp01(Vector3.Dot(hitPoint - a, ab) / (len * len));
                    var onEdge = a + ab * t;
                    var dist = Vector3.Distance(new Vector3(hitPoint.x, 0f, hitPoint.z),
                        new Vector3(onEdge.x, 0f, onEdge.z));
                    if (dist < bestDist && dist < 1.5f)
                    {
                        bestDist = dist;
                        var edgeFlat = new Vector3(ab.x, 0f, ab.z).normalized;
                        var normal = new Vector3(-edgeFlat.z, 0f, edgeFlat.x);
                        var yaw = Mathf.Atan2(-normal.x, -normal.z) * Mathf.Rad2Deg;
                        best = new ArtworkPlacementData
                        {
                            kind = "painting",
                            roomId = room.id,
                            wallEdgeIndex = i,
                            tAlongEdge = t,
                            yaw = yaw,
                        };
                    }
                }
            }

            if (best == null) return false;
            placement = best;
            return true;
        }

        string FindRoomAt(Vector3 p)
        {
            var layout = _room.ActiveLayout;
            if (layout?.rooms == null) return "";
            foreach (var room in layout.rooms)
            {
                if (room == null || string.IsNullOrEmpty(room.id)) continue;
                if (!_room.TryGetRoomVertices(room.id, out var verts) || verts == null || verts.Length < 3)
                    continue;
                if (PointInPoly(p, verts))
                    return room.id;
            }

            return layout.rooms.Length > 0 ? layout.rooms[0].id : "";
        }

        static bool PointInPoly(Vector3 p, Vector3[] verts)
        {
            var inside = false;
            for (int i = 0, j = verts.Length - 1; i < verts.Length; j = i++)
            {
                var xi = verts[i].x;
                var zi = verts[i].z;
                var xj = verts[j].x;
                var zj = verts[j].z;
                var intersect = zi > p.z != zj > p.z &&
                                p.x < (xj - xi) * (p.z - zi) / (zj - zi + 1e-6f) + xi;
                if (intersect) inside = !inside;
            }

            return inside;
        }

        void EnsureGhost(AdminDragMessage drag)
        {
            if (_ghost != null) Destroy(_ghost);
            _ghost = GameObject.CreatePrimitive(
                string.Equals(drag.kind, "sculpture", System.StringComparison.OrdinalIgnoreCase)
                    ? PrimitiveType.Cylinder
                    : PrimitiveType.Cube);
            _ghost.name = "AdminGhost";
            var col = _ghost.GetComponent<Collider>();
            if (col != null) Destroy(col);
            var r = _ghost.GetComponent<Renderer>();
            if (r != null)
            {
                var c = new Color(0.2f, 0.85f, 0.35f, 0.65f);
                r.sharedMaterial = RuntimeMaterials.Create(c);
            }

            _ghost.transform.localScale = string.Equals(drag.kind, "sculpture", System.StringComparison.OrdinalIgnoreCase)
                ? new Vector3(0.6f, 0.35f, 0.6f)
                : new Vector3(0.9f, 0.7f, 0.05f);
        }

        void RefreshSpawned()
        {
            if (_catalog == null || _spawner == null) return;
            if (_catalog.layout == null)
                _catalog.layout = new GalleryLayoutData();
            _catalog.layout.placements = _placements.ToArray();
            _spawner.Spawn(_catalog);
        }

        void Emit()
        {
            _bridge?.EmitPlacements(_placements.ToArray());
        }
    }
}