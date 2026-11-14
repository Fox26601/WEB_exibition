using UnityEngine;

namespace Gallery.Quality
{
    /// <summary>
    /// Mobile quality tier: lower render scale, no shadows.
    /// Desktop keeps higher scale and soft shadows when available.
    /// </summary>
    public static class QualityTier
    {
        public static bool IsMobileTier { get; private set; }
        public static float RenderScale { get; private set; } = 1f;

        public static void Apply()
        {
            IsMobileTier = DetectMobile();
            if (IsMobileTier)
                ApplyMobile();
            else
                ApplyDesktop();
        }

        static bool DetectMobile()
        {
            // Application.isMobilePlatform is reliable on WebGL.
            // Do not use Input.touchSupported — desktop Safari/Chrome often report true.
            if (Application.isMobilePlatform)
                return true;

            return SystemInfo.deviceType == DeviceType.Handheld;
        }

        static void ApplyMobile()
        {
            RenderScale = Screen.height >= 900 ? 0.75f : 0.6f;
            QualitySettings.shadows = ShadowQuality.Disable;
            QualitySettings.shadowDistance = 0f;
            QualitySettings.antiAliasing = 0;
            QualitySettings.anisotropicFiltering = AnisotropicFiltering.Disable;
            QualitySettings.vSyncCount = 0;
            Application.targetFrameRate = 60;

            // Avoid ScalableBufferManager on WebGL — it depends on CoreSRP/CoreCopy
            // blit shaders that are often unavailable and throw ArgumentNullException(shader).
            ApplyCameraFlags(allowHdr: false, allowMsaa: false);

            Debug.Log($"QualityTier: mobile scale={RenderScale}");
        }

        static void ApplyDesktop()
        {
            RenderScale = 1f;
            QualitySettings.shadows = ShadowQuality.HardOnly;
            QualitySettings.shadowDistance = 25f;
            QualitySettings.antiAliasing = 0;
            Application.targetFrameRate = -1;

            ApplyCameraFlags(allowHdr: false, allowMsaa: false);

            Debug.Log("QualityTier: desktop");
        }

        static void ApplyCameraFlags(bool allowHdr, bool allowMsaa)
        {
            var cams = Object.FindObjectsByType<Camera>(FindObjectsSortMode.None);
            foreach (var cam in cams)
            {
                cam.allowMSAA = allowMsaa;
                cam.allowHDR = allowHdr;
            }
        }
    }
}
