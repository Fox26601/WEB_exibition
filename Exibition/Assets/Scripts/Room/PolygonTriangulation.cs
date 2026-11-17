using System.Collections.Generic;
using UnityEngine;

namespace Gallery.Room
{
    /// <summary>Ear-clipping triangulation for simple polygons in the XZ plane (y ignored).</summary>
    static class PolygonTriangulation
    {
        public static bool TryTriangulateXZ(Vector3[] verts, out int[] triangles)
        {
            triangles = null;
            if (verts == null || verts.Length < 3)
                return false;

            if (verts.Length >= 3 && verts.Length <= 12 && IsSimpleConvexXZ(verts) &&
                TryFanConvex(verts, out triangles))
                return true;

            var n = verts.Length;
            var indices = new List<int>(n);
            for (var i = 0; i < n; i++)
                indices.Add(i);

            var area = SignedArea(verts);
            if (Mathf.Approximately(area, 0f))
                return false;

            var clockwise = area < 0f;
            var tris = new List<int>(Mathf.Max(0, (n - 2) * 3));
            var guard = n * n;

            while (indices.Count > 2 && guard-- > 0)
            {
                var clipped = false;
                for (var i = 0; i < indices.Count; i++)
                {
                    var i0 = indices[(i + indices.Count - 1) % indices.Count];
                    var i1 = indices[i];
                    var i2 = indices[(i + 1) % indices.Count];
                    if (!IsEar(verts, indices, i0, i1, i2, clockwise))
                        continue;

                    tris.Add(i0);
                    tris.Add(i1);
                    tris.Add(i2);
                    indices.RemoveAt(i);
                    clipped = true;
                    break;
                }

                if (!clipped)
                    return false;
            }

            if (tris.Count < 3)
                return false;

            triangles = tris.ToArray();
            EnsureNormalsFaceUp(verts, triangles);
            return true;
        }

        /// <summary>Fan from vertex 0 — safe for gallery primitives (triangle–hex).</summary>
        static bool TryFanConvex(Vector3[] verts, out int[] triangles)
        {
            triangles = null;
            if (verts == null || verts.Length < 3)
                return false;

            var area = SignedArea(verts);
            if (Mathf.Approximately(area, 0f))
                return false;

            var tris = new int[(verts.Length - 2) * 3];
            var ti = 0;
            for (var i = 1; i < verts.Length - 1; i++)
            {
                tris[ti++] = 0;
                tris[ti++] = i;
                tris[ti++] = i + 1;
            }

            triangles = tris;
            if (area < 0f)
                FlipWinding(triangles);
            return true;
        }

        public static void EnsureNormalsFaceUp(Vector3[] verts, int[] triangles)
        {
            if (verts == null || triangles == null || triangles.Length < 3)
                return;

            var i0 = triangles[0];
            var i1 = triangles[1];
            var i2 = triangles[2];
            if (i0 < 0 || i1 < 0 || i2 < 0 ||
                i0 >= verts.Length || i1 >= verts.Length || i2 >= verts.Length)
                return;

            var cross = CrossXZ(verts[i0], verts[i1], verts[i2]);
            if (cross < 0f)
                FlipWinding(triangles);
        }

        static void FlipWinding(int[] triangles)
        {
            for (var i = 0; i + 2 < triangles.Length; i += 3)
            {
                var tmp = triangles[i + 1];
                triangles[i + 1] = triangles[i + 2];
                triangles[i + 2] = tmp;
            }
        }

        static float CrossXZ(Vector3 a, Vector3 b, Vector3 c)
        {
            return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
        }

        static float SignedArea(Vector3[] verts)
        {
            var a = 0f;
            for (var i = 0; i < verts.Length; i++)
            {
                var j = (i + 1) % verts.Length;
                a += verts[i].x * verts[j].z - verts[j].x * verts[i].z;
            }

            return a * 0.5f;
        }

        static bool IsEar(Vector3[] verts, List<int> indices, int i0, int i1, int i2, bool clockwise)
        {
            var a = verts[i0];
            var b = verts[i1];
            var c = verts[i2];
            if (!IsConvex(a, b, c, clockwise))
                return false;

            for (var k = 0; k < indices.Count; k++)
            {
                var pi = indices[k];
                if (pi == i0 || pi == i1 || pi == i2)
                    continue;
                if (PointInTriangleXZ(verts[pi], a, b, c))
                    return false;
            }

            return true;
        }

        static bool IsConvex(Vector3 a, Vector3 b, Vector3 c, bool clockwise)
        {
            var cross = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
            return clockwise ? cross < 1e-5f : cross > -1e-5f;
        }

        static bool PointInTriangleXZ(Vector3 p, Vector3 a, Vector3 b, Vector3 c)
        {
            var d1 = Sign(p, a, b);
            var d2 = Sign(p, b, c);
            var d3 = Sign(p, c, a);
            var hasNeg = d1 < 0f || d2 < 0f || d3 < 0f;
            var hasPos = d1 > 0f || d2 > 0f || d3 > 0f;
            return !(hasNeg && hasPos);
        }

        static float Sign(Vector3 p, Vector3 a, Vector3 b)
        {
            return (p.x - b.x) * (a.z - b.z) - (a.x - b.x) * (p.z - b.z);
        }

        /// <summary>Axis-aligned bounds in XZ for fallback floor quads.</summary>
        public static bool TryComputeAabbXZ(Vector3[] verts, out float minX, out float maxX, out float minZ, out float maxZ)
        {
            minX = maxX = minZ = maxZ = 0f;
            if (verts == null || verts.Length < 3)
                return false;

            minX = maxX = verts[0].x;
            minZ = maxZ = verts[0].z;
            for (var i = 1; i < verts.Length; i++)
            {
                minX = Mathf.Min(minX, verts[i].x);
                maxX = Mathf.Max(maxX, verts[i].x);
                minZ = Mathf.Min(minZ, verts[i].z);
                maxZ = Mathf.Max(maxZ, verts[i].z);
            }

            return maxX - minX > 1e-4f && maxZ - minZ > 1e-4f;
        }

        static bool IsSimpleConvexXZ(Vector3[] verts)
        {
            if (verts == null || verts.Length < 3)
                return false;

            var area = SignedArea(verts);
            if (Mathf.Approximately(area, 0f))
                return false;

            var clockwise = area < 0f;
            for (var i = 0; i < verts.Length; i++)
            {
                var a = verts[i];
                var b = verts[(i + 1) % verts.Length];
                var c = verts[(i + 2) % verts.Length];
                if (!IsConvex(a, b, c, clockwise))
                    return false;
            }

            return true;
        }
    }
}