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
        Renderer _ghostRenderer;
        AdminDragMessage _activeDrag;
        ArtworkPlacementData _pendingPlacement;
        bool _snapValid;
        bool _dragging;
        bool _useExternalPointer;
        bool _externalOverCanvas;
        Vector2 _externalScreen;
        Vector2 _pointerDown;
        bool _awaitingClickPick;
        const float ClickPickThresholdPixels = 8f;

        static readonly Color GhostValid = new Color(0.2f, 0.85f, 0.35f, 0.65f);
        static readonly Color GhostInvalid = new Color(0.92f, 0.28f, 0.22f, 0.72f);

        public static bool BlocksCameraInput { get; private set; }

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
            FixLegacyPaintingPlacements();
            RefreshSpawned();
            Emit();
        }

        void FixLegacyPaintingPlacements()
        {
            if (_room == null || !_room.UsingLayout) return;
            var changed = false;
            for (var i = 0; i < _placements.Count; i++)
            {
                var p = _placements[i];
                if (p == null || string.IsNullOrEmpty(p.roomId)) continue;
                if (string.Equals(p.kind, "sculpture", System.StringComparison.OrdinalIgnoreCase))
                    continue;
                if (!WallSnapUtility.TryGetPaintingPose(_room, p, out var pos, out var rot))
                    continue;
                if (!WallSnapUtility.TrySnapPainting(_room, pos, out var snap))
                    continue;
                if (snap.roomId == p.roomId && snap.wallEdgeIndex == p.wallEdgeIndex &&
                    Mathf.Approximately(snap.tAlongEdge, p.tAlongEdge) &&
                    Mathf.Approximately(snap.yaw, p.yaw))
                    continue;
                p.roomId = snap.roomId;
                p.wallEdgeIndex = snap.wallEdgeIndex;
                p.tAlongEdge = snap.tAlongEdge;
                p.yaw = snap.yaw;
                p.kind = "painting";
                _placements[i] = p;
                changed = true;
            }

            if (changed)
                Emit();
        }

        public void BeginDrag(AdminDragMessage msg)
        {
            if (msg == null || string.IsNullOrEmpty(msg.artworkId))
                return;
            _activeDrag = msg;
            _pendingPlacement = null;
            _snapValid = false;
            _dragging = true;
            BlocksCameraInput = true;
            _useExternalPointer = true;
            EnsureGhost(msg);
            ApplyExternalPointer(msg);
            UpdateGhostFromRay();
        }

        public void DragMove(AdminDragMoveMessage msg)
        {
            if (!_dragging || msg == null) return;
            _useExternalPointer = true;
            ApplyExternalPointer(msg);
            UpdateGhostFromRay();
        }

        void ApplyExternalPointer(AdminDragMessage msg)
        {
            if (msg == null) return;
            _externalOverCanvas = msg.overCanvas;
            _externalScreen = ResolveScreenPixels(msg.screenX, msg.screenY, msg.normU, msg.normV);
        }

        void ApplyExternalPointer(AdminDragMoveMessage msg)
        {
            if (msg == null) return;
            _externalOverCanvas = msg.overCanvas;
            _externalScreen = ResolveScreenPixels(msg.screenX, msg.screenY, msg.normU, msg.normV);
        }

        static Vector2 ResolveScreenPixels(float screenX, float screenY, float normU, float normV)
        {
            if (screenX > 0f || screenY > 0f)
                return new Vector2(screenX, screenY);
            return new Vector2(normU * Screen.width, normV * Screen.height);
        }

        public void EndDrag(AdminEndDragMessage msg)
        {
            if (!_dragging || msg == null) return;
            var rejected = false;
            _dragging = false;
            _useExternalPointer = false;

            if (msg.commit && _activeDrag != null)
            {
                if (_pendingPlacement != null && _snapValid)
                {
                    _pendingPlacement.artworkId = _activeDrag.artworkId;
                    if (string.Equals(_pendingPlacement.kind, "painting", System.StringComparison.OrdinalIgnoreCase))
                        _pendingPlacement.frameId = string.IsNullOrEmpty(_activeDrag.frameId)
                            ? "wood"
                            : _activeDrag.frameId;
                    if (string.Equals(_pendingPlacement.kind, "sculpture", System.StringComparison.OrdinalIgnoreCase))
                    {
                        _pendingPlacement.frameId = "none";
                    }

                    _placements.RemoveAll(p => p.artworkId == _activeDrag.artworkId);
                    _placements.Add(_pendingPlacement);
                    RefreshSpawned();
                    Emit();
                }
                else
                    rejected = true;
            }

            if (_ghost != null)
                Destroy(_ghost);
            _ghost = null;
            _ghostRenderer = null;
            _activeDrag = null;
            _pendingPlacement = null;
            BlocksCameraInput = false;

            if (rejected)
                _bridge?.EmitDragRejected("no_snap");
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
                BlocksCameraInput = true;
                return;
            }

            if (_camera == null || _dragging) return;

            if (Input.GetMouseButtonDown(0) && !Input.GetKey(KeyCode.Space))
            {
                _pointerDown = Input.mousePosition;
                _awaitingClickPick = true;
            }

            if (_awaitingClickPick && Input.GetMouseButton(0))
            {
                var moved = ((Vector2)Input.mousePosition - _pointerDown).sqrMagnitude;
                if (moved > ClickPickThresholdPixels * ClickPickThresholdPixels)
                    _awaitingClickPick = false;
            }

            if (Input.GetMouseButtonUp(0) && _awaitingClickPick)
            {
                _awaitingClickPick = false;
                var moved = ((Vector2)Input.mousePosition - _pointerDown).sqrMagnitude;
                if (moved <= ClickPickThresholdPixels * ClickPickThresholdPixels)
                    TryPickExistingArtwork();
            }
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
            BlocksCameraInput = true;
            _useExternalPointer = false;
            EnsureGhost(_activeDrag);
            UpdateGhostFromRay();
        }

        void UpdateGhostFromRay()
        {
            if (_ghost == null || _camera == null) return;

            if (_useExternalPointer && !_externalOverCanvas)
            {
                _ghost.SetActive(false);
                _snapValid = false;
                return;
            }

            _ghost.SetActive(true);
            var screen = _useExternalPointer ? _externalScreen : (Vector2)Input.mousePosition;
            var kind = _activeDrag?.kind ?? "painting";
            if (!AdminPlacementRaycaster.TryResolvePlacementPoint(
                    _camera,
                    _room,
                    screen,
                    !_useExternalPointer || _externalOverCanvas,
                    kind,
                    out var point,
                    out var normal,
                    out var wallSnap,
                    out _snapValid))
            {
                _snapValid = false;
                _pendingPlacement = null;
                SetGhostColor(GhostInvalid);
                return;
            }

            _ghost.transform.position = point;
            if (string.Equals(kind, "painting", System.StringComparison.OrdinalIgnoreCase))
            {
                if (normal.sqrMagnitude < 0.01f)
                    normal = Vector3.forward;
                _ghost.transform.rotation = Quaternion.LookRotation(-normal, Vector3.up);
                if (_snapValid)
                {
                    _pendingPlacement = new ArtworkPlacementData
                    {
                        kind = "painting",
                        roomId = wallSnap.roomId,
                        wallEdgeIndex = wallSnap.wallEdgeIndex,
                        tAlongEdge = wallSnap.tAlongEdge,
                        yaw = wallSnap.yaw,
                        frameId = _activeDrag?.frameId ?? "wood",
                    };
                }
            }
            else if (_snapValid)
            {
                _pendingPlacement = new ArtworkPlacementData
                {
                    kind = "sculpture",
                    floorX = point.x,
                    floorZ = point.z,
                    yaw = 0f,
                    roomId = FindRoomAt(point),
                    frameId = "none",
                };
            }

            SetGhostColor(_snapValid ? GhostValid : GhostInvalid);
        }

        void SetGhostColor(Color c)
        {
            if (_ghostRenderer == null) return;
            if (_ghostRenderer.sharedMaterial != null)
                _ghostRenderer.sharedMaterial.color = c;
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
            _ghostRenderer = _ghost.GetComponent<Renderer>();
            if (_ghostRenderer != null)
                _ghostRenderer.sharedMaterial = RuntimeMaterials.Create(GhostValid);

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