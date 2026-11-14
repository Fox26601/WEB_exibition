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
            if (Application.isMobilePlatform)
                return true;

            // Touch-first small screens (foldables / tablets in desktop UA edge cases).
            if (Input.touchSupported && Mathf.Min(Screen.width, Screen.height) <= 900)
                return true;

            return false;
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

            try
            {
                ScalableBufferManager.ResizeBuffers(RenderScale, RenderScale);
            }
            catch
            {
                // ScalableBufferManager may be unavailable on some backends.
            }

            var cams = Object.FindObjectsByType<Camera>(FindObjectsSortMode.None);
            foreach (var cam in cams)
            {
                cam.allowMSAA = false;
                cam.allowHDR = false;
            }

            Debug.Log($"QualityTier: mobile scale={RenderScale}");
        }

        static void ApplyDesktop()
        {
            RenderScale = 1f;
            QualitySettings.shadows = ShadowQuality.HardOnly;
            QualitySettings.shadowDistance = 25f;
            QualitySettings.antiAliasing = 2;
            Application.targetFrameRate = -1;

            try
            {
                ScalableBufferManager.ResizeBuffers(1f, 1f);
            }
            catch
            {
            }

            Debug.Log("QualityTier: desktop");
        }
    }
}
