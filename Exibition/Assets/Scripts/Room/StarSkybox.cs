using UnityEngine;
using UnityEngine.Rendering;

namespace Gallery.Room
{
    /// <summary>
    /// Subtle procedural star night skybox. Cubemap faces are small (128²) for mobile WebGL.
    /// </summary>
    public static class StarSkybox
    {
        const int FaceSize = 128;
        const int StarsPerFace = 96;

        static Material _skyMat;
        static Cubemap _cube;

        public static void Apply(Camera camera)
        {
            if (_skyMat == null)
                _skyMat = BuildMaterial();

            if (_skyMat != null)
            {
                RenderSettings.skybox = _skyMat;
                RenderSettings.ambientMode = AmbientMode.Flat;
                RenderSettings.ambientLight = new Color(0.42f, 0.44f, 0.50f);
                if (camera != null)
                {
                    camera.clearFlags = CameraClearFlags.Skybox;
                    camera.backgroundColor = new Color(0.02f, 0.03f, 0.06f);
                }

                return;
            }

            // Shader missing: solid night clear still beats default sky.
            if (camera != null)
            {
                camera.clearFlags = CameraClearFlags.SolidColor;
                camera.backgroundColor = new Color(0.02f, 0.03f, 0.07f);
            }

            RenderSettings.ambientMode = AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.45f, 0.46f, 0.50f);
        }

        static Material BuildMaterial()
        {
            var shader = Shader.Find("Skybox/Cubemap");
            if (shader == null)
                return null;

            _cube = BuildCubemap();
            var mat = new Material(shader);
            if (mat.HasProperty("_Tex"))
                mat.SetTexture("_Tex", _cube);
            else
                mat.SetTexture("_MainTex", _cube);

            if (mat.HasProperty("_Exposure"))
                mat.SetFloat("_Exposure", 0.85f);
            if (mat.HasProperty("_Rotation"))
                mat.SetFloat("_Rotation", 0f);

            return mat;
        }

        static Cubemap BuildCubemap()
        {
            var cube = new Cubemap(FaceSize, TextureFormat.RGB24, false);
            for (var face = 0; face < 6; face++)
            {
                var pixels = PaintFace(1000 + face * 97);
                cube.SetPixels(pixels, (CubemapFace)face);
            }

            cube.Apply(false, true);
            cube.wrapMode = TextureWrapMode.Clamp;
            cube.filterMode = FilterMode.Bilinear;
            return cube;
        }

        static Color[] PaintFace(int seed)
        {
            var pixels = new Color[FaceSize * FaceSize];
            var night = new Color(0.015f, 0.02f, 0.05f);
            for (var i = 0; i < pixels.Length; i++)
                pixels[i] = night;

            var rng = new System.Random(seed);
            for (var s = 0; s < StarsPerFace; s++)
            {
                var x = rng.Next(FaceSize);
                var y = rng.Next(FaceSize);
                var v = 0.55f + (float)rng.NextDouble() * 0.45f;
                pixels[y * FaceSize + x] = new Color(v, v, Mathf.Min(1f, v + 0.08f));

                // Occasional 2-pixel star for a bit of presence without bloom.
                if (rng.NextDouble() < 0.25 && x + 1 < FaceSize)
                {
                    var dim = v * 0.65f;
                    pixels[y * FaceSize + x + 1] = new Color(dim, dim, dim);
                }
            }

            return pixels;
        }
    }
}
