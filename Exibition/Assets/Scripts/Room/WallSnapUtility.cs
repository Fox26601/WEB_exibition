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
        public const float PaintingHeight = RoomBuilder.Height * 0.55f;

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
            position = along + inward * WallInset + Vector3.up * PaintingHeight;
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