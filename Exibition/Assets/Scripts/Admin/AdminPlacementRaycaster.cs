using Gallery.Room;
using UnityEngine;

namespace Gallery.Admin
{
    /// <summary>
    /// Raycast helpers for admin palette drag: analytic wall snap for paintings; physics for sculptures.
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
            out Vector3 normal,
            out WallSnapResult wallSnap,
            out bool snapValid)
        {
            point = default;
            normal = Vector3.up;
            wallSnap = default;
            snapValid = false;

            if (!overCanvas || camera == null)
                return false;

            var ray = camera.ScreenPointToRay(new Vector3(screenPx.x, screenPx.y, 0f));
            var painting =
                string.Equals(kind, "painting", System.StringComparison.OrdinalIgnoreCase);

            if (painting)
            {
                var plane = new Plane(Vector3.up, new Vector3(0f, FloorY, 0f));
                if (!plane.Raycast(ray, out var enter))
                    return false;
                var hitXZ = ray.GetPoint(enter);
                if (WallSnapUtility.TrySnapPainting(room, hitXZ, out wallSnap))
                {
                    point = wallSnap.position;
                    normal = wallSnap.inwardNormal;
                    snapValid = true;
                    return true;
                }

                return false;
            }

            if (Physics.Raycast(ray, out var hit, MaxDistance))
            {
                point = hit.point;
                normal = hit.normal.sqrMagnitude > 0.01f ? hit.normal : Vector3.up;
                snapValid = true;
                return true;
            }

            var floor = new Plane(Vector3.up, new Vector3(0f, FloorY, 0f));
            if (!floor.Raycast(ray, out enter))
                return false;

            point = ray.GetPoint(enter);
            normal = Vector3.up;
            snapValid = room != null && room.UsingLayout;
            return true;
        }
    }
}