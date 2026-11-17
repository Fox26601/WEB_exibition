using System.Collections.Generic;
using Gallery.Catalog;
using UnityEngine;

namespace Gallery.Room
{
    /// <summary>
    /// When 2D room polygons overlap, omit wall spans whose midpoints fall inside other rooms.
    /// </summary>
    public static class RoomOverlapClip
    {
        const float Eps = 1e-5f;
        /// <summary>Drop sub-spans shorter than ~one wall shell (avoids overlap-clip micro-sliver flicker).</summary>
        public const float MinSpan = 0.12f;
        const float BoundaryTol = 0.035f;

        public struct WallSpan
        {
            public float t0;
            public float t1;
        }

        public struct OverlapRoom
        {
            public string id;
            public Vector3[] verts;
        }

        public static List<OverlapRoom> BuildOverlapRooms(GalleryLayoutData layout)
        {
            var list = new List<OverlapRoom>();
            if (layout?.rooms == null) return list;
            foreach (var room in layout.rooms)
            {
                if (room == null || string.IsNullOrEmpty(room.id)) continue;
                list.Add(new OverlapRoom
                {
                    id = room.id,
                    verts = RoomBuilder.ResolveRoomVertices(room),
                });
            }

            return list;
        }

        public static List<WallSpan> WallSpansForEdge(List<OverlapRoom> rooms, string roomId, int edgeIndex)
        {
            var room = FindRoom(rooms, roomId);
            if (room.verts == null || room.verts.Length < 3) return new List<WallSpan>();

            var a = room.verts[edgeIndex];
            var b = room.verts[(edgeIndex + 1) % room.verts.Length];
            var splits = CollectSplits(rooms, roomId, edgeIndex, a, b);
            var spans = new List<WallSpan>();

            for (var i = 0; i < splits.Count - 1; i++)
            {
                var t0 = splits[i];
                var t1 = splits[i + 1];
                var len = Vector3.Distance(a, b);
                if ((t1 - t0) * len < MinSpan) continue;
                if (MidInsideOther(rooms, roomId, a, b, t0, t1)) continue;
                if (IsDuplicateCoplanarWall(rooms, roomId, a, b, t0, t1)) continue;
                spans.Add(new WallSpan { t0 = t0, t1 = t1 });
            }

            return spans;
        }

        /// <summary>
        /// Keep all floor triangles whose centroid lies inside the owner's polygon.
        /// Overlap does not clip floor (matches web admin 2D preview — every room keeps a full fill).
        /// </summary>
        public static bool ShouldKeepFloorTriangle(List<OverlapRoom> rooms, string ownerId, Vector3 centroid)
        {
            var owner = FindRoom(rooms, ownerId);
            if (owner.verts == null || owner.verts.Length < 3) return true;
            var p = new Vector2(centroid.x, centroid.z);
            return PointInPolygon(p, owner.verts);
        }

        static OverlapRoom FindRoom(List<OverlapRoom> rooms, string roomId)
        {
            for (var i = 0; i < rooms.Count; i++)
            {
                if (rooms[i].id == roomId) return rooms[i];
            }

            return default;
        }

        static List<float> CollectSplits(List<OverlapRoom> rooms, string roomId, int edgeIndex, Vector3 a, Vector3 b)
        {
            var ts = new List<float> { 0f, 1f };
            for (var r = 0; r < rooms.Count; r++)
            {
                var other = rooms[r];
                if (other.id == roomId || other.verts == null) continue;
                for (var j = 0; j < other.verts.Length; j++)
                {
                    var c = other.verts[j];
                    var d = other.verts[(j + 1) % other.verts.Length];
                    if (TrySegIntersect(a, b, c, d, out var t))
                        AddSplit(ts, t);
                }
            }

            ts.Sort();
            return ts;
        }

        static void AddSplit(List<float> ts, float t)
        {
            for (var i = 0; i < ts.Count; i++)
            {
                if (Mathf.Abs(ts[i] - t) < Eps) return;
            }

            ts.Add(Mathf.Clamp01(t));
        }

        static bool TrySegIntersect(Vector3 a, Vector3 b, Vector3 c, Vector3 d, out float t)
        {
            t = 0f;
            var dx1 = b.x - a.x;
            var dz1 = b.z - a.z;
            var dx2 = d.x - c.x;
            var dz2 = d.z - c.z;
            var cross = dx1 * dz2 - dz1 * dx2;
            if (Mathf.Abs(cross) < Eps) return false;

            var qdx = c.x - a.x;
            var qdz = c.z - a.z;
            var tt = (qdx * dz2 - qdz * dx2) / cross;
            var u = (qdx * dz1 - qdz * dx1) / cross;
            if (tt < -Eps || tt > 1f + Eps || u < -Eps || u > 1f + Eps) return false;
            t = Mathf.Clamp01(tt);
            return true;
        }

        static bool MidInsideOther(List<OverlapRoom> rooms, string ownerId, Vector3 a, Vector3 b, float t0, float t1)
        {
            var t = (t0 + t1) * 0.5f;
            var mid = Vector3.Lerp(a, b, t);
            var p = new Vector2(mid.x, mid.z);
            for (var i = 0; i < rooms.Count; i++)
            {
                var other = rooms[i];
                if (other.id == ownerId) continue;
                if (!PointInPolygon(p, other.verts)) continue;
                if (PointOnPolygonBoundary(p, other.verts)) continue;
                return true;
            }

            return false;
        }

        static bool PointOnPolygonBoundary(Vector2 p, Vector3[] verts)
        {
            if (verts == null || verts.Length < 2) return false;
            for (var i = 0; i < verts.Length; i++)
            {
                var c = verts[i];
                var d = verts[(i + 1) % verts.Length];
                var edge = new Vector2(d.x - c.x, d.z - c.z);
                var edgeLen = edge.magnitude;
                if (edgeLen < Eps) continue;
                var edgeDir = edge / edgeLen;
                if (!PointOnCollinearEdge(p, edgeDir, c, d)) continue;
                return true;
            }

            return false;
        }

        /// <summary>
        /// Adjacent rooms sharing a collinear edge each emit a wall; keep only the lexicographically lower room id.
        /// </summary>
        static bool IsDuplicateCoplanarWall(
            List<OverlapRoom> rooms,
            string roomId,
            Vector3 a,
            Vector3 b,
            float t0,
            float t1)
        {
            var t = (t0 + t1) * 0.5f;
            var mid = Vector3.Lerp(a, b, t);
            var p = new Vector2(mid.x, mid.z);
            var ab = new Vector2(b.x - a.x, b.z - a.z);
            var abLen = ab.magnitude;
            if (abLen < Eps) return false;
            var abDir = ab / abLen;

            for (var i = 0; i < rooms.Count; i++)
            {
                var other = rooms[i];
                if (other.id == roomId || other.verts == null) continue;
                if (string.CompareOrdinal(other.id, roomId) >= 0) continue;
                if (PointInPolygon(p, other.verts)) continue;

                for (var j = 0; j < other.verts.Length; j++)
                {
                    var c = other.verts[j];
                    var d = other.verts[(j + 1) % other.verts.Length];
                    if (!PointOnCollinearEdge(p, abDir, c, d)) continue;
                    return true;
                }
            }

            return false;
        }

        static bool PointOnCollinearEdge(Vector2 p, Vector2 edgeDir, Vector3 c, Vector3 d)
        {
            var c2 = new Vector2(c.x, c.z);
            var d2 = new Vector2(d.x, d.z);
            var cd = d2 - c2;
            var cdLen = cd.magnitude;
            if (cdLen < Eps) return false;
            var cdDir = cd / cdLen;
            var cross = edgeDir.x * cdDir.y - edgeDir.y * cdDir.x;
            if (Mathf.Abs(cross) > 0.02f) return false;

            var toP = p - c2;
            var perp = Mathf.Abs(toP.x * cdDir.y - toP.y * cdDir.x);
            if (perp > BoundaryTol) return false;

            var u = Vector2.Dot(toP, cdDir);
            return u >= -BoundaryTol && u <= cdLen + BoundaryTol;
        }

        public static bool PointInPolygon(Vector2 p, Vector3[] verts)
        {
            if (verts == null || verts.Length < 3) return false;
            var inside = false;
            for (int i = 0, j = verts.Length - 1; i < verts.Length; j = i++)
            {
                var xi = verts[i].x;
                var zi = verts[i].z;
                var xj = verts[j].x;
                var zj = verts[j].z;
                var intersect = zi > p.y != zj > p.y &&
                                p.x < (xj - xi) * (p.y - zi) / (zj - zi + Eps) + xi;
                if (intersect) inside = !inside;
            }

            return inside;
        }
    }
}