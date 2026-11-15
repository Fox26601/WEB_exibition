using UnityEngine;
using UnityEngine.Rendering;

namespace Gallery.Room
{
    /// <summary>
    /// Night sky: Skybox/Cubemap when available, plus an overhead star plane visible
    /// through the gallery skylight (mobile-safe, no post stack).
    /// </summary>
    public static class StarSkybox
    {
        const int FaceSize = 256;
        const int StarsPerFace = 180;

        static Material _skyMat;
        static Cubemap _cube;
        static Texture2D _planeTex;
        static GameObject _starPlane;

        public static void Apply(Camera camera)
        {
            var night = new Color(0.015f, 0.02f, 0.05f);

            if (TryApplyCubemapSkybox())
            {
                if (camera != null)
                {
                    camera.clearFlags = CameraClearFlags.Skybox;
                    camera.backgroundColor = night;
                    camera.farClipPlane = Mathf.Max(camera.farClipPlane, 250f);
                }
            }
            else if (camera != null)
            {
                camera.clearFlags = CameraClearFlags.SolidColor;
                camera.backgroundColor = night;
                camera.farClipPlane = Mathf.Max(camera.farClipPlane, 250f);
            }

            RenderSettings.ambientMode = AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.55f, 0.57f, 0.64f);
            EnsureStarPlane();
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
                    _skyMat.SetFloat("_Exposure", 1.1f);
            }

            RenderSettings.skybox = _skyMat;
            return true;
        }

        static void EnsureStarPlane()
        {
            if (_starPlane != null)
            {
                _starPlane.SetActive(true);
                return;
            }

            _starPlane = GameObject.CreatePrimitive(PrimitiveType.Quad);
            _starPlane.name = "StarSkylightPlane";
            Object.Destroy(_starPlane.GetComponent<Collider>());
            // Face downward above the room so the skylight shows stars.
            _starPlane.transform.position = new Vector3(0f, 18f, 20f);
            _starPlane.transform.rotation = Quaternion.Euler(90f, 0f, 0f);
            _starPlane.transform.localScale = new Vector3(90f, 90f, 1f);

            if (_planeTex == null)
                _planeTex = BuildPlaneTexture();

            var mat = RuntimeMaterials.CreateTextured(Color.white);
            mat.mainTexture = _planeTex;
            if (mat.HasProperty("_MainTex"))
                mat.SetTexture("_MainTex", _planeTex);
            if (mat.HasProperty("_Color"))
                mat.SetColor("_Color", Color.white);
            if (mat.HasProperty("_BaseColor"))
                mat.SetColor("_BaseColor", Color.white);
            _starPlane.GetComponent<MeshRenderer>().material = mat;
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

        static Texture2D BuildPlaneTexture()
        {
            const int size = 512;
            var tex = new Texture2D(size, size, TextureFormat.RGB24, false);
            tex.SetPixels(PaintStars(7777, size));
            tex.Apply(false, true);
            tex.wrapMode = TextureWrapMode.Repeat;
            tex.filterMode = FilterMode.Bilinear;
            return tex;
        }

        static Color[] PaintStars(int seed, int size)
        {
            var pixels = new Color[size * size];
            var night = new Color(0.01f, 0.015f, 0.04f);
            for (var i = 0; i < pixels.Length; i++)
                pixels[i] = night;

            var rng = new System.Random(seed);
            var count = Mathf.Max(StarsPerFace, size);
            for (var s = 0; s < count; s++)
            {
                var x = rng.Next(size);
                var y = rng.Next(size);
                var v = 0.7f + (float)rng.NextDouble() * 0.3f;
                pixels[y * size + x] = new Color(v, v, Mathf.Min(1f, v + 0.15f));
                if (x + 1 < size)
                    pixels[y * size + x + 1] = new Color(v * 0.75f, v * 0.75f, v * 0.8f);
                if (y + 1 < size)
                    pixels[(y + 1) * size + x] = new Color(v * 0.6f, v * 0.6f, v * 0.7f);
            }

            return pixels;
        }
    }
}
