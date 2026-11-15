using UnityEngine;
using UnityEngine.Rendering;

namespace Gallery.Room
{
    /// <summary>
    /// Night sky via camera clear + mesh star field above the skylight.
    /// Mesh stars avoid relying on Skybox/Cubemap or textured quads (often stripped/dim on WebGL).
    /// </summary>
    public static class StarSkybox
    {
        const int StarCount = 120;
        static GameObject _root;
        static Material _starMat;

        public static void Apply(Camera camera)
        {
            var night = new Color(0.012f, 0.018f, 0.045f);

            var skyShader = Shader.Find("Skybox/Cubemap");
            if (skyShader != null)
            {
                // Optional cubemap; mesh stars remain the visible skylight signal.
                var mat = new Material(skyShader);
                var cube = BuildCubemap();
                if (mat.HasProperty("_Tex")) mat.SetTexture("_Tex", cube);
                if (mat.HasProperty("_Exposure")) mat.SetFloat("_Exposure", 1.0f);
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

            _root = new GameObject("MeshStarField");
            if (_starMat == null)
                _starMat = RuntimeMaterials.Create(new Color(0.95f, 0.95f, 1f));

            var rng = new System.Random(20261115);
            for (var i = 0; i < StarCount; i++)
            {
                var star = GameObject.CreatePrimitive(PrimitiveType.Cube);
                star.name = "Star_" + i;
                star.transform.SetParent(_root.transform, false);
                Object.Destroy(star.GetComponent<Collider>());

                var x = (float)(rng.NextDouble() * 70.0 - 35.0);
                var z = (float)(rng.NextDouble() * 80.0 + 2.0);
                var y = 12f + (float)rng.NextDouble() * 10f;
                star.transform.position = new Vector3(x, y, z);

                var s = 0.06f + (float)rng.NextDouble() * 0.1f;
                if (rng.NextDouble() < 0.12)
                    s *= 1.8f; // a few brighter/larger stars
                star.transform.localScale = Vector3.one * s;
                star.GetComponent<MeshRenderer>().sharedMaterial = _starMat;
            }
        }

        static Cubemap BuildCubemap()
        {
            const int size = 128;
            var cube = new Cubemap(size, TextureFormat.RGB24, false);
            for (var face = 0; face < 6; face++)
            {
                var pixels = new Color[size * size];
                var night = new Color(0.01f, 0.015f, 0.04f);
                for (var i = 0; i < pixels.Length; i++)
                    pixels[i] = night;
                var rng = new System.Random(900 + face * 17);
                for (var s = 0; s < 80; s++)
                {
                    var x = rng.Next(size);
                    var y = rng.Next(size);
                    var v = 0.75f + (float)rng.NextDouble() * 0.25f;
                    pixels[y * size + x] = new Color(v, v, v);
                }

                cube.SetPixels(pixels, (CubemapFace)face);
            }

            cube.Apply(false, true);
            return cube;
        }
    }
}
