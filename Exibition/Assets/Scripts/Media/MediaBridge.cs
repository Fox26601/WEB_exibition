using System.Runtime.InteropServices;
using UnityEngine;

namespace Gallery.Media
{
    /// <summary>
    /// C# ↔ JS bridge for HTML image/video overlays outside the Unity WASM heap.
    /// Pauses timeScale while an overlay is open; resume on close.
    /// </summary>
    public class MediaBridge : MonoBehaviour
    {
        public static bool OverlayOpen { get; private set; }

        float _savedTimeScale = 1f;
        static MediaBridge _instance;

        public static MediaBridge Instance => _instance;

        void Awake()
        {
            _instance = this;
        }

        void OnDestroy()
        {
            if (_instance == this)
                _instance = null;
        }

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")]
        static extern void MediaBridge_OpenImage(string url);

        [DllImport("__Internal")]
        static extern void MediaBridge_OpenVideo(string url, string poster);

        [DllImport("__Internal")]
        static extern void MediaBridge_Close();
#else
        static void MediaBridge_OpenImage(string url)
        {
            Debug.Log($"[MediaBridge] openImage {url}");
        }

        static void MediaBridge_OpenVideo(string url, string poster)
        {
            Debug.Log($"[MediaBridge] openVideo {url} poster={poster}");
        }

        static void MediaBridge_Close()
        {
            Debug.Log("[MediaBridge] close");
        }
#endif

        public void OpenImage(string url)
        {
            if (string.IsNullOrEmpty(url)) return;
            PauseForOverlay();
            MediaBridge_OpenImage(url);
        }

        public void OpenVideo(string url, string poster)
        {
            if (string.IsNullOrEmpty(url)) return;
            PauseForOverlay();
            MediaBridge_OpenVideo(url, poster ?? "");
        }

        public void CloseOverlay()
        {
            MediaBridge_Close();
            ResumeFromOverlay();
        }

        void PauseForOverlay()
        {
            if (!OverlayOpen)
                _savedTimeScale = Time.timeScale <= 0f ? 1f : Time.timeScale;
            OverlayOpen = true;
            Time.timeScale = 0f;
        }

        void ResumeFromOverlay()
        {
            OverlayOpen = false;
            Time.timeScale = _savedTimeScale > 0f ? _savedTimeScale : 1f;
        }

        /// <summary>
        /// Called from JavaScript when the HTML overlay is dismissed.
        /// GameObject name must remain "MediaBridge" (or match SendMessage target).
        /// </summary>
        public void OnJsOverlayClosed()
        {
            ResumeFromOverlay();
        }

        // Optional HTML joystick hooks → PlayerController
        public void JsSetMove(string csv)
        {
            if (string.IsNullOrEmpty(csv)) return;
            var parts = csv.Split(',');
            if (parts.Length < 2) return;
            if (!float.TryParse(parts[0], System.Globalization.NumberStyles.Float,
                    System.Globalization.CultureInfo.InvariantCulture, out var x)) return;
            if (!float.TryParse(parts[1], System.Globalization.NumberStyles.Float,
                    System.Globalization.CultureInfo.InvariantCulture, out var y)) return;

            var player = FindFirstObjectByType<Player.PlayerController>();
            player?.SetHtmlMove(x, y);
        }

        public void JsAddLook(string csv)
        {
            if (string.IsNullOrEmpty(csv)) return;
            var parts = csv.Split(',');
            if (parts.Length < 2) return;
            if (!float.TryParse(parts[0], System.Globalization.NumberStyles.Float,
                    System.Globalization.CultureInfo.InvariantCulture, out var x)) return;
            if (!float.TryParse(parts[1], System.Globalization.NumberStyles.Float,
                    System.Globalization.CultureInfo.InvariantCulture, out var y)) return;

            var player = FindFirstObjectByType<Player.PlayerController>();
            player?.AddHtmlLook(x, y);
        }
    }
}
