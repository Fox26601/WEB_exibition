using Gallery.Media;
using Gallery.Room;
using Gallery.UI;
using UnityEngine;

namespace Gallery.Player
{
    /// <summary>
    /// Click/tap selects artwork; double-click/tap opens fullscreen image;
    /// headphones / video slot opens video; E or Info opens localized text.
    /// </summary>
    public class InteractionRaycaster : MonoBehaviour
    {
        [SerializeField] float maxDistance = 8f;
        [SerializeField] float doubleTapSeconds = 0.35f;

        PlayerController _player;
        LocaleUI _locale;
        MediaBridge _media;
        ArtworkView _selected;
        float _lastSelectTime = -10f;
        int _lastSelectIndex = -1;

        public ArtworkView Selected => _selected;

        public void Initialize(PlayerController player, LocaleUI locale, MediaBridge media)
        {
            _player = player;
            _locale = locale;
            _media = media;
        }

        void Update()
        {
            if (MediaBridge.OverlayOpen)
            {
                if (Input.GetKeyDown(KeyCode.Escape))
                    _media?.CloseOverlay();
                return;
            }

            if (_player != null && _player.InputBlocked)
                return;

            if (Input.GetKeyDown(KeyCode.E))
                OpenInfoForSelected();

            if (Input.GetMouseButtonDown(0))
                HandlePointer(Input.mousePosition, false);

            for (var i = 0; i < Input.touchCount; i++)
            {
                var t = Input.GetTouch(i);
                if (t.phase == TouchPhase.Began)
                    HandlePointer(t.position, true);
            }
        }

        void HandlePointer(Vector2 screenPos, bool isTouch)
        {
            if (UnityEngine.EventSystems.EventSystem.current != null)
            {
                if (isTouch)
                {
                    for (var i = 0; i < Input.touchCount; i++)
                    {
                        if (UnityEngine.EventSystems.EventSystem.current.IsPointerOverGameObject(Input.GetTouch(i).fingerId))
                            return;
                    }
                }
                else if (UnityEngine.EventSystems.EventSystem.current.IsPointerOverGameObject())
                {
                    return;
                }
            }

            var cam = _player != null ? _player.PlayerCamera : Camera.main;
            if (cam == null) return;

            var ray = cam.ScreenPointToRay(screenPos);
            if (!Physics.Raycast(ray, out var hit, maxDistance))
                return;

            var view = hit.collider.GetComponentInParent<ArtworkView>();
            if (view == null)
                return;

            var now = Time.unscaledTime;
            var isDouble = view.Index == _lastSelectIndex && (now - _lastSelectTime) <= doubleTapSeconds;

            _selected = view;
            _lastSelectIndex = view.Index;
            _lastSelectTime = now;
            _locale?.ShowSelection(view);

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

        public void OpenInfoForSelected()
        {
            if (_selected == null) return;
            _locale?.OpenTextPanel(_selected);
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
            _player?.UnlockPointer();
            _media?.OpenImage(url);
        }

        void OpenVideo(ArtworkView view)
        {
            var url = view.Entry.urlVideo;
            if (string.IsNullOrEmpty(url)) return;
            var poster = !string.IsNullOrEmpty(view.Entry.urlPoster) ? view.Entry.urlPoster : view.Entry.urlWall;
            _player?.UnlockPointer();
            _media?.OpenVideo(url, poster ?? "");
        }
    }
}
