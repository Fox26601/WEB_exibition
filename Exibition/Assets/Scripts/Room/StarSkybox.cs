using UnityEngine;
using UnityEngine.Rendering;

namespace Gallery.Room
{
    /// <summary>
    /// Procedural night sky: cubemap backdrop + combined mesh star field (single draw call).
    /// Star distribution and cubemap noise are generated at runtime (no external texture license).
    /// </summary>
    public static class StarSkybox
    {
        const int StarCount = 420;
        const int CubemapSize = 256;
        static GameObject _root;
        static Material _starMat;

        public static void Apply(Camera camera)
        {
            var night = new Color(0.012f, 0.018f, 0.045f);

            var skyShader = Shader.Find("Skybox/Cubemap");
            if (skyShader != null)
            {
                var mat = new Material(skyShader);
                var cube = BuildCubemap();
                if (mat.HasProperty("_Tex")) mat.SetTexture("_Tex", cube);
                if (mat.HasProperty("_Exposure")) mat.SetFloat("_Exposure", 1.05f);
                if (mat.HasProperty("_Tint")) mat.SetColor("_Tint", new Color(0.85f, 0.88f, 1f, 1f));
                RenderSettings.skybox = mat;
                if (camera != null)
                {
                    camera.clearFlags = CameraClearFlags.Skybox;
                    camera.backgroundColor = night;
                }
            }
            else if (camera != null)
            {
                camera.clearFlags = CameraClearFlags.SolidColor;
                camera.backgroundColor = night;
            }

            if (camera != null)
                camera.farClipPlane = Mathf.Max(camera.farClipPlane, 250f);

            RenderSettings.ambientMode = AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.55f, 0.57f, 0.64f);
            EnsureMeshStars();
        }

        static void EnsureMeshStars()
        {
            if (_root != null)
            {
                _root.SetActive(true);
                return;
            }

            if (_starMat == null)
                _starMat = RuntimeMaterials.Create(new Color(0.95f, 0.95f, 1f));

            _root = new GameObject("MeshStarField");
            var filter = _root.AddComponent<MeshFilter>();
            var renderer = _root.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = _starMat;
            filter.sharedMesh = BuildStarMesh();
        }

        static Mesh BuildStarMesh()
        {
            var rng = new System.Random(20261117);
            var verts = new Vector3[StarCount * 8];
            var tris = new int[StarCount * 36];

            for (var i = 0; i < StarCount; i++)
            {
                var x = (float)(rng.NextDouble() * 90.0 - 45.0);
                var z = (float)(rng.NextDouble() * 100.0 + 2.0);
                var y = 11f + (float)rng.NextDouble() * 14f;
                var center = new Vector3(x, y, z);
                var s = 0.04f + (float)rng.NextDouble() * 0.08f;
                if (rng.NextDouble() < 0.14)
                    s *= 2.1f;
                if (rng.NextDouble() < 0.04)
                    s *= 1.6f;

                var hs = s * 0.5f;
                var baseIdx = i * 8;
                verts[baseIdx + 0] = center + new Vector3(-hs, -hs, -hs);
                verts[baseIdx + 1] = center + new Vector3(hs, -hs, -hs);
                verts[baseIdx + 2] = center + new Vector3(hs, -hs, hs);
                verts[baseIdx + 3] = center + new Vector3(-hs, -hs, hs);
                verts[baseIdx + 4] = center + new Vector3(-hs, hs, -hs);
                verts[baseIdx + 5] = center + new Vector3(hs, hs, -hs);
                verts[baseIdx + 6] = center + new Vector3(hs, hs, hs);
                verts[baseIdx + 7] = center + new Vector3(-hs, hs, hs);

                var triBase = i * 36;
                AddCubeTriangles(tris, triBase, baseIdx);
            }

            var mesh = new Mesh { name = "StarInstances" };
            mesh.vertices = verts;
            mesh.triangles = tris;
            mesh.RecalculateBounds();
            mesh.UploadMeshData(true);
            return mesh;
        }

        static void AddCubeTriangles(int[] tris, int triBase, int vertBase)
        {
            tris[triBase + 0] = vertBase + 0;
            tris[triBase + 1] = vertBase + 2;
            tris[triBase + 2] = vertBase + 1;
            tris[triBase + 3] = vertBase + 0;
            tris[triBase + 4] = vertBase + 3;
            tris[triBase + 5] = vertBase + 2;
            tris[triBase + 6] = vertBase + 4;
            tris[triBase + 7] = vertBase + 5;
            tris[triBase + 8] = vertBase + 6;
            tris[triBase + 9] = vertBase + 4;
            tris[triBase + 10] = vertBase + 6;
            tris[triBase + 11] = vertBase + 7;
            tris[triBase + 12] = vertBase + 0;
            tris[triBase + 13] = vertBase + 1;
            tris[triBase + 14] = vertBase + 5;
            tris[triBase + 15] = vertBase + 0;
            tris[triBase + 16] = vertBase + 5;
            tris[triBase + 17] = vertBase + 4;
            tris[triBase + 18] = vertBase + 2;
            tris[triBase + 19] = vertBase + 3;
            tris[triBase + 20] = vertBase + 7;
            tris[triBase + 21] = vertBase + 2;
            tris[triBase + 22] = vertBase + 7;
            tris[triBase + 23] = vertBase + 6;
            tris[triBase + 24] = vertBase + 1;
            tris[triBase + 25] = vertBase + 2;
            tris[triBase + 26] = vertBase + 6;
            tris[triBase + 27] = vertBase + 1;
            tris[triBase + 28] = vertBase + 6;
            tris[triBase + 29] = vertBase + 5;
            tris[triBase + 30] = vertBase + 3;
            tris[triBase + 31] = vertBase + 0;
            tris[triBase + 32] = vertBase + 4;
            tris[triBase + 33] = vertBase + 3;
            tris[triBase + 34] = vertBase + 4;
            tris[triBase + 35] = vertBase + 7;
        }

        static Cubemap BuildCubemap()
        {
            var cube = new Cubemap(CubemapSize, TextureFormat.RGB24, false);
            var night = new Color(0.008f, 0.012f, 0.035f);
            var rng = new System.Random(1337);

            for (var face = 0; face < 6; face++)
            {
                var pixels = new Color[CubemapSize * CubemapSize];
                for (var i = 0; i < pixels.Length; i++)
                    pixels[i] = night;

                PaintMilkyWayBand(pixels, CubemapSize, face, rng);
                for (var s = 0; s < 280; s++)
                {
                    var x = rng.Next(CubemapSize);
                    var y = rng.Next(CubemapSize);
                    var roll = (float)rng.NextDouble();
                    var v = roll < 0.08f
                        ? 0.95f + (float)rng.NextDouble() * 0.05f
                        : 0.55f + (float)rng.NextDouble() * 0.4f;
                    var tint = roll < 0.12f
                        ? new Color(v, v * 0.92f, v * 0.82f)
                        : new Color(v, v, Mathf.Min(1f, v + 0.08f));
                    pixels[y * CubemapSize + x] = tint;
                }

                cube.SetPixels(pixels, (CubemapFace)face);
            }

            cube.Apply(false, true);
            return cube;
        }

        static void PaintMilkyWayBand(Color[] pixels, int size, int face, System.Random rng)
        {
            if (face == 4)
            {
                for (var y = 0; y < size; y++)
                for (var x = 0; x < size; x++)
                {
                    var u = (x / (float)size) * 2f - 1f;
                    var v = (y / (float)size) * 2f - 1f;
                    var band = Mathf.Exp(-Mathf.Pow(v * 1.35f - 0.15f, 2f) * 6.5f);
                    var dust = 0.04f + 0.03f * Mathf.PerlinNoise(u * 3.1f + 0.2f, v * 4.7f);
                    var c = new Color(0.02f + band * dust, 0.03f + band * dust * 1.1f, 0.06f + band * 0.14f);
                    var idx = y * size + x;
                    pixels[idx] = Color.Lerp(pixels[idx], c, band * 0.65f);
                }
            }

            for (var s = 0; s < 18; s++)
            {
                var x = rng.Next(size);
                var y = rng.Next(size);
                var radius = 1 + rng.Next(3);
                var glow = 0.18f + (float)rng.NextDouble() * 0.22f;
                for (var dy = -radius; dy <= radius; dy++)
                for (var dx = -radius; dx <= radius; dx++)
                {
                    var px = x + dx;
                    var py = y + dy;
                    if (px < 0 || py < 0 || px >= size || py >= size) continue;
                    var dist = Mathf.Sqrt(dx * dx + dy * dy);
                    if (dist > radius) continue;
                    var falloff = 1f - dist / (radius + 0.6f);
                    var idx = py * size + px;
                    pixels[idx] = Color.Lerp(
                        pixels[idx],
                        new Color(0.55f, 0.58f, 0.75f) * glow,
                        falloff * 0.35f);
                }
            }
        }
    }
}