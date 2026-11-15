using Gallery.Catalog;
using Gallery.Player;
using Gallery.UI;
using UnityEngine;
using UnityEngine.UI;

namespace Gallery.Entrance
{
    /// <summary>
    /// Minecraft-map style booklet: pickup from pedestal, hold in hands, toggle with Q / JS.
    /// GameObject name must remain "BookletController" for SendMessage from HTML.
    /// </summary>
    public class BookletController : MonoBehaviour
    {
        const float PickupDistance = 2.4f;

        PlayerController _player;
        PedestalInteractable _pedestal;
        CatalogData _catalog;
        string _lang = "en";

        bool _owned;
        bool _open;
        int _pageIndex;

        Transform _heldMap;
        Canvas _mapCanvas;
        Text _titleText;
        Text _bodyText;
        Text _hintText;
        GameObject _pagePanel;

        public bool IsOwned => _owned;
        public bool IsOpen => _open;

        public void Initialize(PlayerController player)
        {
            _player = player;
            EnsureHeldVisual();
            EnsureUi();
            SetOpen(false);
            SetOwned(false);
        }

        public void Bind(CatalogData catalog, PedestalInteractable pedestal, string lang)
        {
            _catalog = catalog;
            _pedestal = pedestal;
            _lang = CatalogLoader.NormalizeLang(lang);
            _pageIndex = 0;
            RefreshPageText();
        }

        public void SetLanguage(string lang)
        {
            _lang = CatalogLoader.NormalizeLang(lang);
            RefreshPageText();
        }

        /// <summary>JS → Unity: mobile Map button / postMessage gallery-toggle-booklet.</summary>
        public void OnJsToggleBooklet(string _unused)
        {
            ToggleOpen();
        }

        void Update()
        {
            if (_player == null) return;
            if (GalleryUIState.IsMediaOverlay) return;

            if (Input.GetKeyDown(KeyCode.Q))
                ToggleOpen();

            if (!_owned && _pedestal != null && !_pedestal.IsTaken)
            {
                var dist = Vector3.Distance(
                    new Vector3(_player.transform.position.x, 0f, _player.transform.position.z),
                    new Vector3(_pedestal.transform.position.x, 0f, _pedestal.transform.position.z));
                var looking = false;
                if (_player.PlayerCamera != null)
                {
                    var ray = _player.PlayerCamera.ViewportPointToRay(new Vector3(0.5f, 0.5f, 0f));
                    if (Physics.Raycast(ray, out var hit, PickupDistance + 0.5f) &&
                        hit.collider != null &&
                        hit.collider.GetComponentInParent<PedestalInteractable>() == _pedestal)
                    {
                        looking = true;
                    }
                }

                if (dist <= PickupDistance && (looking || Input.GetKeyDown(KeyCode.E)))
                {
                    if (Input.GetMouseButtonDown(0) || Input.GetKeyDown(KeyCode.E) || looking && Input.GetKeyDown(KeyCode.F))
                        TryPickup();
                }

                // Proximity + click without needing perfect look.
                if (dist <= 1.35f && Input.GetMouseButtonDown(0))
                    TryPickup();
            }

            if (_owned && _open && _pagePanel != null && _pagePanel.activeSelf)
            {
                if (Input.GetKeyDown(KeyCode.LeftArrow) || Input.GetKeyDown(KeyCode.A))
                    TurnPage(-1);
                if (Input.GetKeyDown(KeyCode.RightArrow) || Input.GetKeyDown(KeyCode.D))
                    TurnPage(1);
            }

            UpdateHeldPose();
            UpdateHint();
        }

        public void TryPickup()
        {
            if (_owned || _pedestal == null) return;
            _pedestal.MarkTaken();
            SetOwned(true);
            SetOpen(true);
        }

        public void ToggleOpen()
        {
            if (!_owned)
            {
                // Allow toggle only after pickup; still accept JS to hint.
                UpdateHint();
                return;
            }

            SetOpen(!_open);
        }

        public void CloseBooklet()
        {
            SetOpen(false);
        }

        void SetOwned(bool owned)
        {
            _owned = owned;
            if (_heldMap != null)
                _heldMap.gameObject.SetActive(owned);
        }

        void SetOpen(bool open)
        {
            _open = open && _owned;
            if (_pagePanel != null)
                _pagePanel.SetActive(_open);

            if (_open)
            {
                RefreshPageText();
                GalleryUIState.Set(GalleryLayer.Booklet);
            }
            else
            {
                GalleryUIState.ClearIf(GalleryLayer.Booklet);
            }
        }

        void TurnPage(int delta)
        {
            var pages = _catalog?.settings?.entrance?.booklet;
            if (pages == null || pages.Length == 0) return;
            _pageIndex = (_pageIndex + delta + pages.Length) % pages.Length;
            RefreshPageText();
        }

        void RefreshPageText()
        {
            var pages = _catalog?.settings?.entrance?.booklet;
            if (_titleText == null || _bodyText == null) return;
            if (pages == null || pages.Length == 0)
            {
                _titleText.text = "Exhibition";
                _bodyText.text = "No booklet pages yet.";
                return;
            }

            _pageIndex = Mathf.Clamp(_pageIndex, 0, pages.Length - 1);
            var page = pages[_pageIndex];
            _titleText.text = page?.title != null ? page.title.Get(_lang) : page?.key;
            _bodyText.text = page?.body != null ? page.body.Get(_lang) : "";
            if (_hintText != null)
                _hintText.text = $"{_pageIndex + 1}/{pages.Length}  ← →";
        }

        void UpdateHint()
        {
            if (_hintText == null) return;
            if (!_owned)
            {
                _hintText.text = "Take booklet at pedestal";
                return;
            }

            if (!_open)
                _hintText.text = "Q / Map — open booklet";
        }

        void UpdateHeldPose()
        {
            if (_heldMap == null || _player == null || _player.PlayerCamera == null) return;
            if (!_owned) return;

            var cam = _player.PlayerCamera.transform;
            // Lowered map in hands when closed; raised when open (still visible under UI).
            var local = _open
                ? new Vector3(0.22f, -0.18f, 0.55f)
                : new Vector3(0.28f, -0.32f, 0.45f);
            _heldMap.position = cam.TransformPoint(local);
            _heldMap.rotation = cam.rotation * Quaternion.Euler(_open ? 65f : 78f, -12f, 8f);
        }

        void EnsureHeldVisual()
        {
            if (_heldMap != null) return;
            var go = GameObject.CreatePrimitive(PrimitiveType.Quad);
            go.name = "HeldBookletMap";
            go.transform.SetParent(transform, false);
            go.transform.localScale = new Vector3(0.55f, 0.4f, 1f);
            Object.Destroy(go.GetComponent<Collider>());
            var mat = Room.RuntimeMaterials.Create(new Color(0.82f, 0.74f, 0.55f));
            go.GetComponent<MeshRenderer>().sharedMaterial = mat;
            _heldMap = go.transform;
            _heldMap.gameObject.SetActive(false);
        }

        void EnsureUi()
        {
            if (_mapCanvas != null) return;

            var canvasGo = new GameObject("BookletUICanvas");
            canvasGo.transform.SetParent(transform, false);
            _mapCanvas = canvasGo.AddComponent<Canvas>();
            _mapCanvas.renderMode = RenderMode.ScreenSpaceOverlay;
            _mapCanvas.sortingOrder = 40;
            canvasGo.AddComponent<CanvasScaler>().uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            canvasGo.AddComponent<GraphicRaycaster>();

            _hintText = CreateText(canvasGo.transform, "BookletHint", 14, TextAnchor.LowerCenter,
                new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 18f), new Vector2(480f, 28f));

            _pagePanel = CreatePanel("BookletPanel", canvasGo.transform,
                new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f),
                new Vector2(0f, 20f), new Vector2(460f, 360f)).gameObject;
            _pagePanel.GetComponent<Image>().color = new Color(0.86f, 0.80f, 0.62f, 0.96f);

            _titleText = CreateText(_pagePanel.transform, "BookletTitle", 22, TextAnchor.UpperCenter,
                new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -28f), new Vector2(400f, 40f));
            _titleText.color = new Color(0.15f, 0.12f, 0.08f);

            _bodyText = CreateText(_pagePanel.transform, "BookletBody", 16, TextAnchor.UpperLeft,
                new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, -10f), new Vector2(400f, 220f));
            _bodyText.color = new Color(0.18f, 0.15f, 0.1f);
            _bodyText.horizontalOverflow = HorizontalWrapMode.Wrap;
            _bodyText.verticalOverflow = VerticalWrapMode.Overflow;

            var prev = CreateButton(_pagePanel.transform, "◀", new Vector2(-150f, -150f), () => TurnPage(-1));
            prev.GetComponent<RectTransform>().sizeDelta = new Vector2(64f, 32f);
            var next = CreateButton(_pagePanel.transform, "▶", new Vector2(150f, -150f), () => TurnPage(1));
            next.GetComponent<RectTransform>().sizeDelta = new Vector2(64f, 32f);
            var close = CreateButton(_pagePanel.transform, "Close", new Vector2(0f, -150f), () => SetOpen(false));
            close.GetComponent<RectTransform>().sizeDelta = new Vector2(100f, 32f);

            _pagePanel.SetActive(false);
        }

        static Image CreatePanel(string name, Transform parent, Vector2 anchorMin, Vector2 anchorMax,
            Vector2 anchoredPos, Vector2 size)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            var rt = go.AddComponent<RectTransform>();
            rt.anchorMin = anchorMin;
            rt.anchorMax = anchorMax;
            rt.pivot = new Vector2(0.5f, 0.5f);
            rt.anchoredPosition = anchoredPos;
            rt.sizeDelta = size;
            return go.AddComponent<Image>();
        }

        static Text CreateText(Transform parent, string name, int size, TextAnchor anchor,
            Vector2 anchorMin, Vector2 anchorMax, Vector2 anchoredPos, Vector2 sizeDelta)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            var rt = go.AddComponent<RectTransform>();
            rt.anchorMin = anchorMin;
            rt.anchorMax = anchorMax;
            rt.pivot = new Vector2(0.5f, 0.5f);
            rt.anchoredPosition = anchoredPos;
            rt.sizeDelta = sizeDelta;
            var text = go.AddComponent<Text>();
            text.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            if (text.font == null)
                text.font = Resources.GetBuiltinResource<Font>("Arial.ttf");
            text.fontSize = size;
            text.alignment = anchor;
            text.color = Color.white;
            text.raycastTarget = false;
            return text;
        }

        static Button CreateButton(Transform parent, string label, Vector2 anchoredPos,
            UnityEngine.Events.UnityAction onClick)
        {
            var go = new GameObject("Btn_" + label);
            go.transform.SetParent(parent, false);
            var rt = go.AddComponent<RectTransform>();
            rt.sizeDelta = new Vector2(100f, 36f);
            rt.anchoredPosition = anchoredPos;
            var img = go.AddComponent<Image>();
            img.color = new Color(0.25f, 0.2f, 0.14f, 0.9f);
            var btn = go.AddComponent<Button>();
            btn.targetGraphic = img;
            btn.onClick.AddListener(onClick);
            var t = CreateText(go.transform, "Label", 14, TextAnchor.MiddleCenter,
                new Vector2(0f, 0f), new Vector2(1f, 1f), Vector2.zero, Vector2.zero);
            t.text = label;
            t.raycastTarget = false;
            return btn;
        }
    }
}
