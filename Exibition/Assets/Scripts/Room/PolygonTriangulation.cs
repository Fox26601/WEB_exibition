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
            return true;
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
    }
}