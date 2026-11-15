using Gallery.Room;
using UnityEngine;

namespace Gallery.Admin
{
    /// <summary>
    /// Hides exterior wall shells between camera and room interior (Sims-style cutaway).
    /// </summary>
    public class WallCutawayController : MonoBehaviour
    {
        Camera _camera;
        RoomBuilder _room;
        RoomWallSegment[] _segments;

        public void Initialize(Camera camera, RoomBuilder room)
        {
            _camera = camera;
            _room = room;
            RefreshSegmentList();
        }

        public void RefreshSegmentList()
        {
            _segments = FindObjectsByType<RoomWallSegment>(FindObjectsSortMode.None);
        }

        void LateUpdate()
        {
            if (!AdminBuildMode.Active || _camera == null || _segments == null)
                return;

            var camPos = _camera.transform.position;
            var layoutCenter = Vector3.zero;
            var hasLayoutCenter = _room != null && _room.TryGetLayoutCenter(out layoutCenter);

            for (var i = 0; i < _segments.Length; i++)
            {
                var seg = _segments[i];
                if (seg == null) continue;

                var mid = seg.segmentMid;
                var n = seg.inwardNormal;
                if (n.sqrMagnitude < 0.01f) n = Vector3.forward;

                var toCam = camPos - mid;
                toCam.y *= 0.35f;
                if (toCam.sqrMagnitude < 1e-4f) toCam = Vector3.forward;
                toCam.Normalize();

                var camOutside = Vector3.Dot(toCam, n) < 0f;

                var blocksView = false;
                if (hasLayoutCenter)
                {
                    var toCenter = layoutCenter - camPos;
                    toCenter.y = 0f;
                    if (toCenter.sqrMagnitude > 0.1f)
                    {
                        var wallBetween = Vector3.Dot(toCenter.normalized, (mid - camPos).normalized) > 0.85f
                                          && Vector3.Dot(mid - camPos, toCenter) > 0f
                                          && camOutside;
                        blocksView = wallBetween;
                    }
                }
                else if (camOutside)
                {
                    blocksView = true;
                }

                if (seg.exteriorRenderer != null)
                    seg.exteriorRenderer.enabled = !blocksView;
                if (seg.interiorRenderer != null)
                    seg.interiorRenderer.enabled = true;
            }
        }
    }
}