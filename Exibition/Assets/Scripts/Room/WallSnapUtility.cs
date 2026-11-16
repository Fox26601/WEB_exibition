using System;
using Gallery.Catalog;
using UnityEngine;

namespace Gallery.Room
{
    public struct WallSnapResult
    {
        public bool valid;
        public string roomId;
        public int wallEdgeIndex;
        public float tAlongEdge;
        public float yaw;
        public Vector3 position;
        public Vector3 inwardNormal;
        public Vector3 alongEdge;
    }

    /// <summary>
    /// Shared wall snap math (matches web layout-geometry.ts).
    /// </summary>
    public static class WallSnapUtility
    {
        public const float MaxSnapDistance = 3f;
        public const float WallInset = 0.08f;
        public const float DefaultWallHeightT = 0.55f;

        public static float PaintingHeightFromPlacement(ArtworkPlacementData placement)
        {
            var t = placement != null && placement.wallHeightT > 0f
                ? placement.wallHeightT
                : DefaultWallHeightT;
            t = Mathf.Clamp(t, 0.12f, 0.92f);
            return RoomBuilder.Height * t;
        }

        public const float PaintingHeight = RoomBuilder.Height * DefaultWallHeightT;

        public static bool TrySnapPaintingFromRay(
            Camera camera,
            RoomBuilder room,
            Ray ray,
            out WallSnapResult result)
        {
            result = default;
            if (room == null || !room.UsingLayout || room.ActiveLayout?.rooms == null)
                return false;

            var bestDist = float.MaxValue;
            WallSnapResult best = default;

            foreach (var roomData in room.ActiveLayout.rooms)
            {
                if (roomData == null || string.IsNullOrEmpty(roomData.id)) continue;
                if (roomData.id == LayoutEntranceIds.EntranceRoomId) continue;
                if (!room.TryGetRoomVertices(roomData.id, out var verts) || verts == null || verts.Length < 2)
                    continue;

                if (!TryRoomCentroid(verts, out var centroid))
                    continue;

                for (var i = 0; i < verts.Length; i++)
                {
                    var a = verts[i];
                    var b = verts[(i + 1) % verts.Length];
                    if (!TrySnapPointOnWallEdge(ray, a, b, out var candidate))
                        continue;
                    if (!TryDistPointToSegmentXZ(candidate, a, b, out var dist, out var t, out var onEdge))
                        continue;
                    if (dist >= bestDist || dist > MaxSnapDistance)
                        continue;

                    var inward = InwardNormal(a, b, centroid);
                    var yaw = Mathf.Atan2(inward.x, inward.z) * Mathf.Rad2Deg;
                    bestDist = dist;
                    best = new WallSnapResult
                    {
                        valid = true,
                        roomId = roomData.id,
                        wallEdgeIndex = i,
                        tAlongEdge = t,
                        yaw = yaw,
                        alongEdge = onEdge,
                        inwardNormal = inward,
                        position = onEdge + inward * WallInset + Vector3.up * PaintingHeight,
                    };
                }
            }

            if (best.valid)
            {
                result = best;
                return true;
            }

            var floor = new Plane(Vector3.up, Vector3.zero);
            if (!floor.Raycast(ray, out var enter))
                return false;
            return TrySnapPainting(room, ray.GetPoint(enter), out result);
        }

        static bool TrySnapPointOnWallEdge(
            Ray ray,
            Vector3 a,
            Vector3 b,
            out Vector3 snapPoint)
        {
            snapPoint = default;
            var edge = b - a;
            var flat = new Vector3(edge.x, 0f, edge.z);
            if (flat.sqrMagnitude < 1e-6f) return false;
            flat.Normalize();
            var wallNormal = Vector3.Cross(Vector3.up, flat).normalized;

            if (TryRayHitVerticalWallPlane(ray, a, b, wallNormal, out snapPoint) &&
                TryDistPointToSegmentXZ(snapPoint, a, b, out var dist, out _, out _) &&
                dist <= MaxSnapDistance)
                return true;

            if (TryRayHitVerticalWallPlane(ray, a, b, -wallNormal, out snapPoint) &&
                TryDistPointToSegmentXZ(snapPoint, a, b, out dist, out _, out _) &&
                dist <= MaxSnapDistance)
                return true;

            if (TryClosestPointRaySegmentXZ(ray, a, b, out snapPoint, out dist) && dist <= MaxSnapDistance)
                return true;

            return false;
        }

        static bool TryRayHitVerticalWallPlane(
            Ray ray,
            Vector3 a,
            Vector3 b,
            Vector3 planeNormal,
            out Vector3 hit)
        {
            hit = default;
            var mid = (a + b) * 0.5f;
            var denom = Vector3.Dot(ray.direction, planeNormal);
            if (Mathf.Abs(denom) < 1e-5f) return false;
            var t = Vector3.Dot(mid - ray.origin, planeNormal) / denom;
            if (t < 0f || t > 500f) return false;
            hit = ray.GetPoint(t);
            return true;
        }

        static bool TryClosestPointRaySegmentXZ(
            Ray ray,
            Vector3 a,
            Vector3 b,
            out Vector3 pointOnWall,
            out float distXZ)
        {
            pointOnWall = a;
            distXZ = float.MaxValue;
            var a2 = new Vector2(a.x, a.z);
            var b2 = new Vector2(b.x, b.z);
            var o2 = new Vector2(ray.origin.x, ray.origin.z);
            var d2 = new Vector2(ray.direction.x, ray.direction.z);
            if (d2.sqrMagnitude < 1e-8f) return false;
            d2.Normalize();

            var bestDist = float.MaxValue;
            var bestOnSeg = a;
            const int samples = 24;
            for (var i = 0; i <= samples; i++)
            {
                var segT = i / (float)samples;
                var seg = Vector2.Lerp(a2, b2, segT);
                if (!TryDistPointToRay2D(o2, d2, seg, out var rayT, out var dist))
                    continue;
                if (rayT < 0f || dist >= bestDist || dist > MaxSnapDistance) continue;
                bestDist = dist;
                bestOnSeg = Vector3.Lerp(a, b, segT);
            }

            if (bestDist >= MaxSnapDistance) return false;
            pointOnWall = bestOnSeg;
            distXZ = bestDist;
            return true;
        }

        static bool TryDistPointToRay2D(
            Vector2 rayOrigin,
            Vector2 rayDir,
            Vector2 point,
            out float rayT,
            out float dist)
        {
            rayT = Vector2.Dot(point - rayOrigin, rayDir);
            var closest = rayOrigin + rayDir * rayT;
            dist = Vector2.Distance(point, closest);
            return true;
        }

        public static bool TrySnapPainting(RoomBuilder room, Vector3 worldPoint, out WallSnapResult result)
        {
            result = default;
            if (room == null || !room.UsingLayout || room.ActiveLayout?.rooms == null)
                return false;

            var bestDist = float.MaxValue;
            WallSnapResult best = default;

            foreach (var roomData in room.ActiveLayout.rooms)
            {
                if (roomData == null || string.IsNullOrEmpty(roomData.id)) continue;
                if (roomData.id == LayoutEntranceIds.EntranceRoomId) continue;
                if (!room.TryGetRoomVertices(roomData.id, out var verts) || verts == null || verts.Length < 2)
                    continue;

                if (!TryRoomCentroid(verts, out var centroid))
                    continue;

                for (var i = 0; i < verts.Length; i++)
                {
                    var a = verts[i];
                    var b = verts[(i + 1) % verts.Length];
                    if (!TryDistPointToSegmentXZ(worldPoint, a, b, out var dist, out var t, out var onEdge))
                        continue;
                    if (dist >= bestDist || dist > MaxSnapDistance)
                        continue;

                    var inward = InwardNormal(a, b, centroid);
                    var yaw = Mathf.Atan2(inward.x, inward.z) * Mathf.Rad2Deg;
                    bestDist = dist;
                    best = new WallSnapResult
                    {
                        valid = true,
                        roomId = roomData.id,
                        wallEdgeIndex = i,
                        tAlongEdge = t,
                        yaw = yaw,
                        alongEdge = onEdge,
                        inwardNormal = inward,
                        position = onEdge + inward * WallInset + Vector3.up * PaintingHeight,
                    };
                }
            }

            if (!best.valid)
                return false;
            result = best;
            return true;
        }

        public static bool TryGetPaintingPose(
            RoomBuilder room,
            ArtworkPlacementData placement,
            out Vector3 position,
            out Quaternion rotation)
        {
            position = Vector3.zero;
            rotation = Quaternion.identity;
            if (placement == null || string.IsNullOrEmpty(placement.roomId))
                return false;
            if (!room.TryGetRoomVertices(placement.roomId, out var verts) || verts == null || verts.Length < 2)
                return false;

            var i = ((placement.wallEdgeIndex % verts.Length) + verts.Length) % verts.Length;
            var a = verts[i];
            var b = verts[(i + 1) % verts.Length];
            if (!TryRoomCentroid(verts, out var centroid))
                centroid = (a + b) * 0.5f;

            var t = Mathf.Clamp01(placement.tAlongEdge);
            var along = Vector3.Lerp(a, b, t);
            var inward = InwardNormal(a, b, centroid);
            var hangY = PaintingHeightFromPlacement(placement);
            position = along + inward * WallInset + Vector3.up * hangY;
            var yaw = placement.yaw;
            if (Mathf.Approximately(yaw, 0f))
                yaw = Mathf.Atan2(inward.x, inward.z) * Mathf.Rad2Deg;
            rotation = Quaternion.Euler(0f, yaw, 0f);
            return true;
        }

        public static Vector3 InwardNormal(Vector3 a, Vector3 b, Vector3 roomCentroid)
        {
            var edge = b - a;
            var flat = new Vector3(edge.x, 0f, edge.z);
            if (flat.sqrMagnitude < 1e-6f)
                return Vector3.forward;
            flat.Normalize();
            var n = new Vector3(-flat.z, 0f, flat.x);
            var mid = (a + b) * 0.5f;
            var toCenter = roomCentroid - mid;
            toCenter.y = 0f;
            if (Vector3.Dot(n, toCenter) < 0f)
                n = -n;
            return n.normalized;
        }

        public static bool TryRoomCentroid(Vector3[] verts, out Vector3 centroid)
        {
            centroid = Vector3.zero;
            if (verts == null || verts.Length == 0) return false;
            for (var i = 0; i < verts.Length; i++)
                centroid += verts[i];
            centroid /= verts.Length;
            centroid.y = 0f;
            return true;
        }

        static bool TryDistPointToSegmentXZ(
            Vector3 p,
            Vector3 a,
            Vector3 b,
            out float dist,
            out float t,
            out Vector3 onEdge)
        {
            dist = float.MaxValue;
            t = 0f;
            onEdge = a;
            var ab = b - a;
            var lenSq = ab.x * ab.x + ab.z * ab.z;
            if (lenSq < 1e-6f) return false;
            t = Mathf.Clamp01(
                ((p.x - a.x) * ab.x + (p.z - a.z) * ab.z) / lenSq);
            onEdge = a + ab * t;
            var dx = p.x - onEdge.x;
            var dz = p.z - onEdge.z;
            dist = Mathf.Sqrt(dx * dx + dz * dz);
            return true;
        }
    }
}