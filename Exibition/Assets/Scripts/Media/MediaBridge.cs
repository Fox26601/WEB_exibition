using System.Runtime.InteropServices;
using Gallery.UI;
using UnityEngine;
using UnityEngine.UI;

namespace Gallery.Media
{
    /// <summary>
    /// C# ↔ JS bridge for HTML image/video overlays outside the Unity WASM heap.
    /// Editor / non-WebGL uses an in-Unity fallback overlay so Esc/Close work in Play Mode.
    /// Pauses timeScale while an overlay is open; resume on close.
    /// </summary>
    public class MediaBridge : MonoBehaviour
    {
        public static bool OverlayOpen { get; private set; }

        float _savedTimeScale = 1f;
        static MediaBridge _instance;
        GalleryLayer _overlayLayer = GalleryLayer.None;

        GameObject _fallbackRoot;
        Text _fallbackLabel;

        public static MediaBridge Instance => _instance;

        void Awake()
        {
            _instance = this;
        }

        void OnDestroy()
        {
            if (_instance == this)
                _instance = null;
            if (OverlayOpen)
                ResumeFromOverlay();
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
            // Editor / standalone: handled by ShowFallback.
        }

        static void MediaBridge_OpenVideo(string url, string poster)
        {
            // Editor / standalone: handled by ShowFallback.
        }

        static void MediaBridge_Close()
        {
            // Editor / standalone: handled by HideFallback.
        }
#endif

        public void OpenImage(string url)
        {
            if (string.IsNullOrEmpty(url)) return;
            PauseForOverlay(GalleryLayer.Image);
#if UNITY_WEBGL && !UNITY_EDITOR
            MediaBridge_OpenImage(url);
#else
            ShowFallback(false, url, null);
#endif
        }

        public void OpenVideo(string url, string poster)
        {
            if (string.IsNullOrEmpty(url)) return;
            PauseForOverlay(GalleryLayer.Video);
#if UNITY_WEBGL && !UNITY_EDITOR
            MediaBridge_OpenVideo(url, poster ?? "");
#else
            // Autoplay only after the open gesture (this call is that gesture).
            ShowFallback(true, url, poster);
#endif
        }

        public void CloseOverlay()
        {
            if (!OverlayOpen)
            {
                HideFallback();
                return;
            }
#if UNITY_WEBGL && !UNITY_EDITOR
            MediaBridge_Close();
#endif
            ResumeFromOverlay();
        }

        void PauseForOverlay(GalleryLayer layer)
        {
            if (!OverlayOpen)
                _savedTimeScale = Time.timeScale <= 0f ? 1f : Time.timeScale;
            OverlayOpen = true;
            _overlayLayer = layer;
            Time.timeScale = 0f;
            GalleryUIState.Set(layer);
        }

        void ResumeFromOverlay()
        {
            OverlayOpen = false;
            Time.timeScale = _savedTimeScale > 0f ? _savedTimeScale : 1f;
            if (_overlayLayer == GalleryLayer.Image || _overlayLayer == GalleryLayer.Video)
                GalleryUIState.ClearIf(_overlayLayer);
            _overlayLayer = GalleryLayer.None;
            HideFallback();
        }

        /// <summary>
        /// Called from JavaScript when the HTML overlay is dismissed.
        /// GameObject name must remain "MediaBridge" (or match SendMessage target).
        /// </summary>
        public void OnJsOverlayClosed()
        {
            ResumeFromOverlay();
        }

        void ShowFallback(bool video, string url, string poster)
        {
            EnsureFallback();
            _fallbackRoot.SetActive(true);
            if (_fallbackLabel != null)
            {
                _fallbackLabel.text = video
                    ? "Video\n" + url + "\n\nEsc / Close to dismiss"
                    : "Image\n" + url + "\n\nEsc / double-click / Close";
            }
        }

        void HideFallback()
        {
            if (_fallbackRoot != null)
                _fallbackRoot.SetActive(false);
        }

        void EnsureFallback()
        {
            if (_fallbackRoot != null) return;

            _fallbackRoot = new GameObject("MediaFallbackOverlay");
            _fallbackRoot.transform.SetParent(transform, false);
            var canvas = _fallbackRoot.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 1000;
            _fallbackRoot.AddComponent<CanvasScaler>().uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            _fallbackRoot.AddComponent<GraphicRaycaster>();

            var bgGo = new GameObject("Dim");
            bgGo.transform.SetParent(_fallbackRoot.transform, false);
            var bgRt = bgGo.AddComponent<RectTransform>();
            bgRt.anchorMin = Vector2.zero;
            bgRt.anchorMax = Vector2.one;
            bgRt.offsetMin = Vector2.zero;
            bgRt.offsetMax = Vector2.zero;
            var bg = bgGo.AddComponent<Image>();
            bg.color = new Color(0f, 0f, 0f, 0.92f);

            var labelGo = new GameObject("Label");
            labelGo.transform.SetParent(_fallbackRoot.transform, false);
            var labelRt = labelGo.AddComponent<RectTransform>();
            labelRt.anchorMin = new Vector2(0.1f, 0.2f);
            labelRt.anchorMax = new Vector2(0.9f, 0.8f);
            labelRt.offsetMin = Vector2.zero;
            labelRt.offsetMax = Vector2.zero;
            _fallbackLabel = labelGo.AddComponent<Text>();
            _fallbackLabel.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            if (_fallbackLabel.font == null)
                _fallbackLabel.font = Resources.GetBuiltinResource<Font>("Arial.ttf");
            _fallbackLabel.fontSize = 18;
            _fallbackLabel.alignment = TextAnchor.MiddleCenter;
            _fallbackLabel.color = Color.white;
            _fallbackLabel.raycastTarget = false;

            var closeGo = new GameObject("Btn_Close");
            closeGo.transform.SetParent(_fallbackRoot.transform, false);
            var closeRt = closeGo.AddComponent<RectTransform>();
            closeRt.anchorMin = new Vector2(1f, 1f);
            closeRt.anchorMax = new Vector2(1f, 1f);
            closeRt.pivot = new Vector2(1f, 1f);
            closeRt.anchoredPosition = new Vector2(-16f, -16f);
            closeRt.sizeDelta = new Vector2(100f, 36f);
            var closeImg = closeGo.AddComponent<Image>();
            closeImg.color = new Color(0.2f, 0.2f, 0.22f, 0.95f);
            var closeBtn = closeGo.AddComponent<Button>();
            closeBtn.targetGraphic = closeImg;
            closeBtn.onClick.AddListener(CloseOverlay);

            var closeLabelGo = new GameObject("Label");
            closeLabelGo.transform.SetParent(closeGo.transform, false);
            var closeLabelRt = closeLabelGo.AddComponent<RectTransform>();
            closeLabelRt.anchorMin = Vector2.zero;
            closeLabelRt.anchorMax = Vector2.one;
            closeLabelRt.offsetMin = Vector2.zero;
            closeLabelRt.offsetMax = Vector2.zero;
            var closeLabel = closeLabelGo.AddComponent<Text>();
            closeLabel.font = _fallbackLabel.font;
            closeLabel.fontSize = 14;
            closeLabel.alignment = TextAnchor.MiddleCenter;
            closeLabel.color = Color.white;
            closeLabel.text = "Close";
            closeLabel.raycastTarget = false;

            _fallbackRoot.SetActive(false);
        }

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
