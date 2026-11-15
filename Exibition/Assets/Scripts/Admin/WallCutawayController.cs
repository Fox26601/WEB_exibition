using Gallery.Room;
using UnityEngine;

namespace Gallery.Admin
{
    /// <summary>
    /// Hides wall shells between camera and layout center (Sims-style cutaway).
    /// </summary>
    public class WallCutawayController : MonoBehaviour
    {
        Camera _camera;
        RoomBuilder _room;
        RoomWallSegment[] _segments;
        int _refreshCounter;

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
            if (!AdminBuildMode.Active || _camera == null)
                return;

            _refreshCounter++;
            if (_segments == null || _segments.Length == 0 || _refreshCounter % 30 == 0)
                RefreshSegmentList();
            if (_segments == null || _segments.Length == 0)
                return;

            var camPos = _camera.transform.position;
            if (!_room.TryGetLayoutCenter(out var layoutCenter))
                layoutCenter = Vector3.zero;

            var cam = new Vector3(camPos.x, 0f, camPos.z);
            var target = new Vector3(layoutCenter.x, 0f, layoutCenter.z);
            var toCenter = target - cam;
            var sightDist = toCenter.magnitude;
            if (sightDist < 0.5f)
                return;
            toCenter /= sightDist;

            for (var i = 0; i < _segments.Length; i++)
            {
                var seg = _segments[i];
                if (seg == null) continue;

                var mid = new Vector3(seg.segmentMid.x, 0f, seg.segmentMid.z);
                var toWall = mid - cam;
                var along = Vector3.Dot(toWall, toCenter);
                var cutaway = false;

                if (along > 0.25f && along < sightDist - 0.25f)
                {
                    var perp = toWall - toCenter * along;
                    var perpDist = perp.magnitude;
                    var halfLen = 1.2f;
                    if (seg.transform != null)
                        halfLen = Mathf.Max(0.75f, seg.transform.lossyScale.z * 0.5f);
                    cutaway = perpDist < halfLen + RoomBuilder.WallThickness;
                }

                var show = !cutaway;
                if (seg.exteriorRenderer != null)
                    seg.exteriorRenderer.enabled = show;
                if (seg.interiorRenderer != null)
                    seg.interiorRenderer.enabled = show;
            }
        }
    }
}