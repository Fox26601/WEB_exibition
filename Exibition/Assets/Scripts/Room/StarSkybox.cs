using UnityEngine;
using UnityEngine.Rendering;

namespace Gallery.Room
{
    /// <summary>
    /// Static night sky: Grab3D Cozy Sky Night (CC0) equirectangular panorama via Skybox/Panoramic.
    /// Texture: Assets/Resources/Sky/cozy-sky-night_2k.png — license Assets/Sky/LICENSE-cozy-sky-night.txt
    /// </summary>
    public static class StarSkybox
    {
        const string PanoramaResourcePath = "Sky/cozy-sky-night_2k";
        static Material _skyMaterial;

        public static void Apply(Camera camera)
        {
            var night = new Color(0.012f, 0.018f, 0.045f);
            var shader = Shader.Find("Skybox/Panoramic");

            if (shader != null)
            {
                var panorama = Resources.Load<Texture2D>(PanoramaResourcePath);
                if (panorama != null)
                {
                    if (_skyMaterial == null)
                        _skyMaterial = new Material(shader);

                    _skyMaterial.SetTexture("_MainTex", panorama);
                    if (_skyMaterial.HasProperty("_Mapping"))
                        _skyMaterial.SetFloat("_Mapping", 1f);
                    if (_skyMaterial.HasProperty("_ImageType"))
                        _skyMaterial.SetFloat("_ImageType", 0f);
                    if (_skyMaterial.HasProperty("_Exposure"))
                        _skyMaterial.SetFloat("_Exposure", 1f);
                    if (_skyMaterial.HasProperty("_Tint"))
                        _skyMaterial.SetColor("_Tint", new Color(0.92f, 0.94f, 1f, 1f));

                    RenderSettings.skybox = _skyMaterial;
                    if (camera != null)
                    {
                        camera.clearFlags = CameraClearFlags.Skybox;
                        camera.backgroundColor = night;
                    }
                }
                else
                {
                    Debug.LogWarning("StarSkybox: missing Resources/" + PanoramaResourcePath + ".");
                    ApplySolidFallback(camera, night);
                }
            }
            else
            {
                Debug.LogWarning("StarSkybox: Skybox/Panoramic shader not found.");
                ApplySolidFallback(camera, night);
            }

            if (camera != null)
                camera.farClipPlane = Mathf.Max(camera.farClipPlane, 250f);

            RenderSettings.ambientMode = AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.55f, 0.57f, 0.64f);
        }

        static void ApplySolidFallback(Camera camera, Color night)
        {
            if (camera == null)
                return;
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = night;
        }
    }
}