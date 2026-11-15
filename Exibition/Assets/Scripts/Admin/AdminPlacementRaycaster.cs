using Gallery.Room;
using UnityEngine;

namespace Gallery.Admin
{
    /// <summary>
    /// Raycast helpers for admin palette drag: mesh colliders first, analytic fallback.
    /// </summary>
    public static class AdminPlacementRaycaster
    {
        const float MaxDistance = 250f;
        const float FloorY = 0f;

        public static bool TryResolvePlacementPoint(
            Camera camera,
            RoomBuilder room,
            Vector2 screenPx,
            bool overCanvas,
            string kind,
            out Vector3 point,
            out Vector3 normal)
        {
            point = default;
            normal = Vector3.up;

            if (!overCanvas || camera == null)
                return false;

            var ray = camera.ScreenPointToRay(new Vector3(screenPx.x, screenPx.y, 0f));
            if (Physics.Raycast(ray, out var hit, MaxDistance))
            {
                point = hit.point;
                normal = hit.normal.sqrMagnitude > 0.01f ? hit.normal : Vector3.up;
                return true;
            }

            var floor = new Plane(Vector3.up, new Vector3(0f, FloorY, 0f));
            if (!floor.Raycast(ray, out var enter))
                return false;

            point = ray.GetPoint(enter);
            normal = Vector3.up;

            var painting =
                string.Equals(kind, "painting", System.StringComparison.OrdinalIgnoreCase);
            if (painting && room != null && room.UsingLayout)
            {
                if (TryClosestWallPoint(room, point, out var wallPoint, out var wallNormal))
                {
                    point = wallPoint;
                    normal = wallNormal;
                }
            }

            return true;
        }

        static bool TryClosestWallPoint(
            RoomBuilder room,
            Vector3 near,
            out Vector3 point,
            out Vector3 normal)
        {
            point = near;
            normal = Vector3.forward;
            var layout = room.ActiveLayout;
            if (layout?.rooms == null) return false;

            var bestDist = float.MaxValue;
            var found = false;
            Vector3 best = near;
            Vector3 bestNormal = Vector3.forward;

            foreach (var roomData in layout.rooms)
            {
                if (roomData == null || string.IsNullOrEmpty(roomData.id)) continue;
                if (!room.TryGetRoomVertices(roomData.id, out var verts) || verts == null || verts.Length < 2)
                    continue;

                for (var i = 0; i < verts.Length; i++)
                {
                    var a = verts[i];
                    var b = verts[(i + 1) % verts.Length];
                    var ab = b - a;
                    var len = ab.magnitude;
                    if (len < 0.05f) continue;
                    var t = Mathf.Clamp01(Vector3.Dot(near - a, ab) / (len * len));
                    var onEdge = a + ab * t;
                    var dist = Vector3.Distance(
                        new Vector3(near.x, 0f, near.z),
                        new Vector3(onEdge.x, 0f, onEdge.z));
                    if (dist >= bestDist || dist > 2.5f) continue;

                    bestDist = dist;
                    var edgeFlat = new Vector3(ab.x, 0f, ab.z).normalized;
                    bestNormal = new Vector3(-edgeFlat.z, 0f, edgeFlat.x);
                    best = onEdge + bestNormal * 0.08f;
                    best.y = 1.2f;
                    found = true;
                }
            }

            if (!found) return false;
            point = best;
            normal = bestNormal;
            return true;
        }
    }
}