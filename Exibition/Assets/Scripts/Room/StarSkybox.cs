using UnityEngine;
using UnityEngine.Rendering;

namespace Gallery.Room
{
    /// <summary>
    /// Subtle procedural star night sky. Prefers Skybox/Cubemap; falls back to an inverted
    /// unlit sphere so stars still read through the gallery skylight on stripped WebGL builds.
    /// </summary>
    public static class StarSkybox
    {
        const int FaceSize = 256;
        const int StarsPerFace = 160;

        static Material _skyMat;
        static Cubemap _cube;
        static Texture2D _domeTex;
        static GameObject _dome;

        public static void Apply(Camera camera)
        {
            if (TryApplyCubemapSkybox())
            {
                if (camera != null)
                {
                    camera.clearFlags = CameraClearFlags.Skybox;
                    camera.backgroundColor = new Color(0.02f, 0.03f, 0.06f);
                    camera.farClipPlane = Mathf.Max(camera.farClipPlane, 200f);
                }

                RenderSettings.ambientMode = AmbientMode.Flat;
                RenderSettings.ambientLight = new Color(0.55f, 0.57f, 0.64f);
                EnsureDome(false);
                return;
            }

            // Cubemap shader missing — solid clear + star dome mesh.
            if (camera != null)
            {
                camera.clearFlags = CameraClearFlags.SolidColor;
                camera.backgroundColor = new Color(0.015f, 0.02f, 0.05f);
                camera.farClipPlane = Mathf.Max(camera.farClipPlane, 200f);
            }

            RenderSettings.ambientMode = AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.55f, 0.57f, 0.64f);
            EnsureDome(true);
        }

        static bool TryApplyCubemapSkybox()
        {
            var shader = Shader.Find("Skybox/Cubemap");
            if (shader == null)
                return false;

            if (_skyMat == null)
            {
                _cube = BuildCubemap();
                _skyMat = new Material(shader);
                if (_skyMat.HasProperty("_Tex"))
                    _skyMat.SetTexture("_Tex", _cube);
                else
                    _skyMat.SetTexture("_MainTex", _cube);
                if (_skyMat.HasProperty("_Exposure"))
                    _skyMat.SetFloat("_Exposure", 1.05f);
            }

            RenderSettings.skybox = _skyMat;
            return true;
        }

        static void EnsureDome(bool enabled)
        {
            if (!enabled)
            {
                if (_dome != null)
                    _dome.SetActive(false);
                return;
            }

            if (_dome != null)
            {
                _dome.SetActive(true);
                return;
            }

            _dome = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            _dome.name = "StarDome";
            Object.Destroy(_dome.GetComponent<Collider>());
            _dome.transform.position = Vector3.zero;
            _dome.transform.localScale = Vector3.one * 120f;

            // Invert normals via negative scale so we see stars from inside.
            _dome.transform.localScale = new Vector3(-120f, 120f, 120f);

            var mat = RuntimeMaterials.CreateTextured(Color.white);
            if (_domeTex == null)
                _domeTex = BuildDomeTexture();
            mat.mainTexture = _domeTex;
            if (mat.HasProperty("_MainTex"))
                mat.SetTexture("_MainTex", _domeTex);
            mat.color = Color.white;
            if (mat.HasProperty("_Color"))
                mat.SetColor("_Color", Color.white);
            if (mat.HasProperty("_BaseColor"))
                mat.SetColor("_BaseColor", Color.white);

            _dome.GetComponent<MeshRenderer>().material = mat;
        }

        static Cubemap BuildCubemap()
        {
            var cube = new Cubemap(FaceSize, TextureFormat.RGB24, false);
            for (var face = 0; face < 6; face++)
                cube.SetPixels(PaintStars(1000 + face * 97, FaceSize), (CubemapFace)face);
            cube.Apply(false, true);
            cube.wrapMode = TextureWrapMode.Clamp;
            cube.filterMode = FilterMode.Bilinear;
            return cube;
        }

        static Texture2D BuildDomeTexture()
        {
            const int size = 512;
            var tex = new Texture2D(size, size, TextureFormat.RGB24, false);
            tex.SetPixels(PaintStars(4242, size));
            tex.Apply(false, true);
            tex.wrapMode = TextureWrapMode.Repeat;
            tex.filterMode = FilterMode.Bilinear;
            return tex;
        }

        static Color[] PaintStars(int seed, int size)
        {
            var pixels = new Color[size * size];
            var night = new Color(0.012f, 0.016f, 0.045f);
            for (var i = 0; i < pixels.Length; i++)
                pixels[i] = night;

            var rng = new System.Random(seed);
            var count = Mathf.Max(StarsPerFace, size);
            for (var s = 0; s < count; s++)
            {
                var x = rng.Next(size);
                var y = rng.Next(size);
                var v = 0.65f + (float)rng.NextDouble() * 0.35f;
                pixels[y * size + x] = new Color(v, v, Mathf.Min(1f, v + 0.12f));

                if (rng.NextDouble() < 0.35 && x + 1 < size && y + 1 < size)
                {
                    var dim = v * 0.7f;
                    pixels[y * size + x + 1] = new Color(dim, dim, dim);
                    pixels[(y + 1) * size + x] = new Color(dim * 0.85f, dim * 0.85f, dim * 0.9f);
                }
            }

            return pixels;
        }
    }
}
