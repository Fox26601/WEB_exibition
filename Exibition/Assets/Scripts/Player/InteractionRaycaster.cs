using Gallery.Media;
using Gallery.Room;
using Gallery.UI;
using UnityEngine;

namespace Gallery.Player
{
    /// <summary>
    /// Click/tap selects artwork; double-click/tap opens fullscreen image;
    /// headphones / video slot opens video; E or Info toggles localized text.
    /// </summary>
    public class InteractionRaycaster : MonoBehaviour
    {
        const float ToggleDebounceSeconds = 0.15f;

        [SerializeField] float maxDistance = 8f;
        [SerializeField] float doubleTapSeconds = 0.35f;

        PlayerController _player;
        LocaleUI _locale;
        MediaBridge _media;
        ArtworkView _selected;
        float _lastSelectTime = -10f;
        int _lastSelectIndex = -1;
        float _lastInfoToggleTime = -10f;
        float _lastOverlayPointerTime = -10f;

        public ArtworkView Selected => _selected;

        public void Initialize(PlayerController player, LocaleUI locale, MediaBridge media)
        {
            _player = player;
            _locale = locale;
            _media = media;
        }

        void Update()
        {
            if (Input.GetKeyDown(KeyCode.Escape))
            {
                HandleEscape();
                return;
            }

            if (GalleryUIState.IsMediaOverlay)
            {
                HandleOverlayPointer();
                return;
            }

            if (_player != null && _player.InputBlocked)
                return;

            if (Input.GetKeyDown(KeyCode.E))
                ToggleInfoForSelected();

            if (Input.GetMouseButtonDown(0))
                HandlePointer(Input.mousePosition, false);

            for (var i = 0; i < Input.touchCount; i++)
            {
                var t = Input.GetTouch(i);
                if (t.phase == TouchPhase.Began)
                    HandlePointer(t.position, true);
            }
        }

        void HandleEscape()
        {
            if (GalleryUIState.TryCloseTop(
                    () => _locale?.CloseInfo(),
                    () => _media?.CloseOverlay()))
            {
                return;
            }

            // No overlay: Esc clears selection, then unlocks pointer.
            if (_selected != null)
            {
                ClearSelection();
                return;
            }

            _player?.UnlockPointer();
        }

        void HandleOverlayPointer()
        {
            // Image overlay: Esc already handled; double-click/tap also closes.
            if (!GalleryUIState.IsImageOpen)
                return;

            var pressed = false;
            Vector2 pos = default;

            if (Input.GetMouseButtonDown(0))
            {
                pressed = true;
                pos = Input.mousePosition;
            }
            else
            {
                for (var i = 0; i < Input.touchCount; i++)
                {
                    var t = Input.GetTouch(i);
                    if (t.phase != TouchPhase.Began) continue;
                    pressed = true;
                    pos = t.position;
                    break;
                }
            }

            if (!pressed) return;

            var now = Time.unscaledTime;
            if (now - _lastOverlayPointerTime <= doubleTapSeconds)
            {
                _media?.CloseOverlay();
                _lastOverlayPointerTime = -10f;
            }
            else
            {
                _lastOverlayPointerTime = now;
            }
        }

        void HandlePointer(Vector2 screenPos, bool isTouch)
        {
            if (IsPointerOverUi(isTouch))
                return;

            var cam = _player != null ? _player.PlayerCamera : Camera.main;
            if (cam == null) return;

            var ray = cam.ScreenPointToRay(screenPos);
            if (!Physics.Raycast(ray, out var hit, maxDistance))
            {
                // Empty click / miss → deselect (closes info if open).
                ClearSelection();
                return;
            }

            var view = hit.collider.GetComponentInParent<ArtworkView>();
            if (view == null)
            {
                ClearSelection();
                return;
            }

            var now = Time.unscaledTime;
            var isDouble = view.Index == _lastSelectIndex && (now - _lastSelectTime) <= doubleTapSeconds;

            Select(view);
            _lastSelectIndex = view.Index;
            _lastSelectTime = now;

            if (view.IsVideo || hit.collider.gameObject.name == "Headphones")
            {
                OpenVideo(view);
                return;
            }

            if (isDouble)
            {
                OpenImage(view);
                _lastSelectTime = -10f;
            }
        }

        void Select(ArtworkView view)
        {
            _selected = view;
            _locale?.ShowSelection(view);
        }

        public void ClearSelection()
        {
            _selected = null;
            _lastSelectIndex = -1;
            _locale?.ClearSelection();
        }

        /// <summary>
        /// E / mobile Info: toggle info when Info is topmost or nothing is open.
        /// No-op with no selection; no-op while image/video is topmost.
        /// </summary>
        public void ToggleInfoForSelected()
        {
            if (GalleryUIState.IsMediaOverlay)
                return;

            var now = Time.unscaledTime;
            if (now - _lastInfoToggleTime < ToggleDebounceSeconds)
                return;
            _lastInfoToggleTime = now;

            if (_selected == null)
                return;

            if (GalleryUIState.IsInfoOpen || (_locale != null && _locale.IsInfoOpen))
            {
                _locale?.CloseInfo();
                return;
            }

            _locale?.OpenTextPanel(_selected);
            _player?.UnlockPointer();
        }

        public void OpenInfoForSelected()
        {
            ToggleInfoForSelected();
        }

        public void OpenSelectedImage()
        {
            if (_selected == null) return;
            OpenImage(_selected);
        }

        public void OpenSelectedVideo()
        {
            if (_selected == null || !_selected.IsVideo) return;
            OpenVideo(_selected);
        }

        void OpenImage(ArtworkView view)
        {
            var url = !string.IsNullOrEmpty(view.Entry.urlFull) ? view.Entry.urlFull : view.Entry.urlWall;
            if (string.IsNullOrEmpty(url)) return;
            _locale?.CloseInfo();
            _player?.UnlockPointer();
            _media?.OpenImage(url);
        }

        void OpenVideo(ArtworkView view)
        {
            var url = view.Entry.urlVideo;
            if (string.IsNullOrEmpty(url)) return;
            var poster = !string.IsNullOrEmpty(view.Entry.urlPoster) ? view.Entry.urlPoster : view.Entry.urlWall;
            _locale?.CloseInfo();
            _player?.UnlockPointer();
            _media?.OpenVideo(url, poster ?? "");
        }

        static bool IsPointerOverUi(bool isTouch)
        {
            if (UnityEngine.EventSystems.EventSystem.current == null)
                return false;

            if (isTouch)
            {
                for (var i = 0; i < Input.touchCount; i++)
                {
                    if (UnityEngine.EventSystems.EventSystem.current.IsPointerOverGameObject(Input.GetTouch(i).fingerId))
                        return true;
                }

                return false;
            }

            return UnityEngine.EventSystems.EventSystem.current.IsPointerOverGameObject();
        }
    }
}
