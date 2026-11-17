#if UNITY_EDITOR
using Gallery.Catalog;
using Gallery.Room;
using UnityEditor;
using UnityEngine;

namespace Gallery.EditorTools
{
    static class PolygonTriangulationEditorTests
    {
        [MenuItem("Gallery/Tests/Polygon Floor Triangulation")]
        static void Run()
        {
            var failures = 0;
            TryRoom("triangle", 0f, 1f, 1f, ref failures);
            TryRoom("square", 0f, 3.2f, 3.2f, ref failures);
            TryRoom("pentagon", 40f, 2.4f, 1.8f, ref failures);
            TryRoom("hexagon", 15f, 2.8f, 2.8f, ref failures);
            TryRoom("hexagon", 210f, -2.8f, 2.2f, ref failures);

            if (failures == 0)
                Debug.Log("PolygonTriangulationEditorTests: all cases passed.");
            else
                Debug.LogError($"PolygonTriangulationEditorTests: {failures} case(s) failed.");
        }

        static void TryRoom(string shape, float yaw, float sx, float sz, ref int failures)
        {
            var room = new GalleryRoomData
            {
                id = shape,
                shape = shape,
                transform = new RoomTransformData
                {
                    x = 3f,
                    z = 5f,
                    rotation = yaw,
                    scaleX = sx,
                    scaleZ = sz,
                },
            };

            var verts = RoomBuilder.ResolveRoomVertices(room);
            if (!PolygonTriangulation.TryTriangulateXZ(verts, out var tris))
            {
                failures++;
                Debug.LogError($"Triangulation failed: {shape} yaw={yaw} scale=({sx},{sz})");
                return;
            }

            if (tris == null || tris.Length < 3)
            {
                failures++;
                Debug.LogError($"Empty triangles: {shape}");
                return;
            }

            PolygonTriangulation.EnsureNormalsFaceUp(verts, tris);
            var i0 = tris[0];
            var i1 = tris[1];
            var i2 = tris[2];
            var cross = (verts[i1].x - verts[i0].x) * (verts[i2].z - verts[i0].z)
                        - (verts[i1].z - verts[i0].z) * (verts[i2].x - verts[i0].x);
            if (cross <= 0f)
            {
                failures++;
                Debug.LogError($"Winding not +Y for {shape} (cross={cross})");
            }
        }
    }
}
#endif