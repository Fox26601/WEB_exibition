using Gallery.Catalog;
using Gallery.Player;
using Gallery.Room;
using UnityEngine;
using UnityEngine.UI;

namespace Gallery.UI
{
    /// <summary>
    /// Language chrome EN/RU/UK/HE and artwork title/text panel from catalog strings.
    /// Info panel toggles via E / Info button; Close and Esc also dismiss.
    /// </summary>
    public class LocaleUI : MonoBehaviour
    {
        public static readonly string[] Languages = { "en", "ru", "uk", "he" };

        string _lang = "en";
        ArtworkView _selected;
        CatalogData _catalog;
        InteractionRaycaster _raycaster;

        Canvas _canvas;
        Text _titleText;
        Text _bodyText;
        GameObject _panel;
        GameObject _infoButton;
        Text _langLabel;

        public string CurrentLang => _lang;
        public bool IsInfoOpen => _panel != null && _panel.activeSelf;
        public ArtworkView Selected => _selected;

        public void Initialize(string initialLang, InteractionRaycaster raycaster)
        {
            _lang = CatalogLoader.NormalizeLang(initialLang);
            _raycaster = raycaster;
            EnsureUi();
            RefreshLangLabel();
            CloseInfo();
        }

        public void BindCatalog(CatalogData catalog)
        {
            _catalog = catalog;
        }

        public void SetLanguage(string lang)
        {
            _lang = CatalogLoader.NormalizeLang(lang);
            PlayerPrefs.SetString("gallery.lang", _lang);
            RefreshLangLabel();
            if (_selected != null)
                RefreshSelectionChrome(_selected);
            if (IsInfoOpen && _selected != null)
                ApplyPanelText(_selected);
        }

        public void ShowSelection(ArtworkView view)
        {
            if (_selected != null && _selected != view)
                _selected.SetSelected(false);

            _selected = view;
            EnsureUi();

            if (view == null)
            {
                if (_titleText != null) _titleText.text = "";
                if (_infoButton != null) _infoButton.SetActive(false);
                if (IsInfoOpen)
                    CloseInfo();
                return;
            }

            view.SetSelected(true);
            RefreshSelectionChrome(view);

            // Info open + select another artwork → swap panel content, keep open.
            if (IsInfoOpen)
                ApplyPanelText(view);
        }

        public void ClearSelection()
        {
            ShowSelection(null);
        }

        public void ToggleInfo()
        {
            if (_selected == null)
                return;

            if (IsInfoOpen)
                CloseInfo();
            else
                OpenTextPanel(_selected);
        }

        public void OpenTextPanel(ArtworkView view)
        {
            if (view == null) return;
            if (GalleryUIState.IsMediaOverlay)
                return;

            _selected = view;
            EnsureUi();
            ApplyPanelText(view);
            SetPanelVisible(true);
        }

        public void CloseInfo()
        {
            SetPanelVisible(false);
        }

        void ApplyPanelText(ArtworkView view)
        {
            if (view == null) return;
            if (_titleText != null)
                _titleText.text = view.Entry.title != null ? view.Entry.title.Get(_lang) : "";
            if (_bodyText != null)
                _bodyText.text = view.Entry.text != null ? view.Entry.text.Get(_lang) : "";
        }

        void RefreshSelectionChrome(ArtworkView view)
        {
            if (_titleText != null)
                _titleText.text = view.Entry.title != null ? view.Entry.title.Get(_lang) : "";
            if (_infoButton != null)
                _infoButton.SetActive(true);
        }

        void EnsureUi()
        {
            if (_canvas != null) return;

            var canvasGo = new GameObject("LocaleUICanvas");
            canvasGo.transform.SetParent(transform, false);
            _canvas = canvasGo.AddComponent<Canvas>();
            _canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvasGo.AddComponent<CanvasScaler>().uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            canvasGo.AddComponent<GraphicRaycaster>();

            var langRow = CreatePanel("LangRow", canvasGo.transform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f),
                new Vector2(0f, -24f), new Vector2(420f, 40f));
            var langs = Languages;
            for (var i = 0; i < langs.Length; i++)
            {
                var code = langs[i];
                var btn = CreateButton(langRow.transform, code.ToUpperInvariant(), new Vector2(-150f + i * 100f, 0f),
                    () => SetLanguage(code));
                btn.GetComponent<RectTransform>().sizeDelta = new Vector2(88f, 32f);
            }

            _langLabel = CreateText(canvasGo.transform, "LangHint", 14, TextAnchor.UpperLeft,
                new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(12f, -12f), new Vector2(200f, 28f));

            _titleText = CreateText(canvasGo.transform, "Title", 18, TextAnchor.LowerCenter,
                new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 72f), new Vector2(700f, 36f));

            _infoButton = CreateButton(canvasGo.transform, "Info", new Vector2(0f, 36f), () =>
            {
                _raycaster?.ToggleInfoForSelected();
            }).gameObject;
            _infoButton.GetComponent<RectTransform>().anchorMin = new Vector2(0.5f, 0f);
            _infoButton.GetComponent<RectTransform>().anchorMax = new Vector2(0.5f, 0f);
            _infoButton.GetComponent<RectTransform>().anchoredPosition = new Vector2(0f, 36f);
            _infoButton.SetActive(false);

            _panel = CreatePanel("TextPanel", canvasGo.transform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f),
                Vector2.zero, new Vector2(520f, 320f)).gameObject;
            var panelBg = _panel.GetComponent<Image>();
            panelBg.color = new Color(0.08f, 0.08f, 0.1f, 0.92f);

            _bodyText = CreateText(_panel.transform, "Body", 16, TextAnchor.UpperLeft,
                new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, -12f), new Vector2(480f, 240f));
            _bodyText.horizontalOverflow = HorizontalWrapMode.Wrap;
            _bodyText.verticalOverflow = VerticalWrapMode.Overflow;

            var close = CreateButton(_panel.transform, "Close", new Vector2(0f, -130f), CloseInfo);
            close.GetComponent<RectTransform>().sizeDelta = new Vector2(120f, 36f);

            BuildJoystick();
        }

        void BuildJoystick()
        {
            if (!Application.isMobilePlatform) return;

            var stickRoot = CreatePanel("Joystick", _canvas.transform, new Vector2(0f, 0f), new Vector2(0f, 0f),
                new Vector2(96f, 96f), new Vector2(140f, 140f));
            stickRoot.color = new Color(1f, 1f, 1f, 0.12f);

            var knob = CreatePanel("Knob", stickRoot.transform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f),
                Vector2.zero, new Vector2(56f, 56f));
            knob.color = new Color(1f, 1f, 1f, 0.35f);

            var handler = stickRoot.gameObject.AddComponent<JoystickHandler>();
            handler.Init(knob.rectTransform, FindFirstObjectByType<PlayerController>());
        }

        void SetPanelVisible(bool visible)
        {
            if (_panel != null)
                _panel.SetActive(visible);

            if (visible)
                GalleryUIState.Set(GalleryLayer.Info);
            else
                GalleryUIState.ClearIf(GalleryLayer.Info);
        }

        void RefreshLangLabel()
        {
            if (_langLabel != null)
                _langLabel.text = "Lang: " + _lang.ToUpperInvariant();
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
            var img = go.AddComponent<Image>();
            img.color = new Color(0f, 0f, 0f, 0.35f);
            return img;
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

        static Button CreateButton(Transform parent, string label, Vector2 anchoredPos, UnityEngine.Events.UnityAction onClick)
        {
            var go = new GameObject("Btn_" + label);
            go.transform.SetParent(parent, false);
            var rt = go.AddComponent<RectTransform>();
            rt.sizeDelta = new Vector2(100f, 36f);
            rt.anchoredPosition = anchoredPos;
            var img = go.AddComponent<Image>();
            img.color = new Color(0.15f, 0.15f, 0.18f, 0.85f);
            var btn = go.AddComponent<Button>();
            btn.targetGraphic = img;
            btn.onClick.AddListener(onClick);

            var t = CreateText(go.transform, "Label", 14, TextAnchor.MiddleCenter,
                new Vector2(0f, 0f), new Vector2(1f, 1f), Vector2.zero, Vector2.zero);
            t.text = label;
            t.raycastTarget = false;
            return btn;
        }

        class JoystickHandler : MonoBehaviour, UnityEngine.EventSystems.IDragHandler,
            UnityEngine.EventSystems.IPointerUpHandler, UnityEngine.EventSystems.IPointerDownHandler
        {
            RectTransform _knob;
            PlayerController _player;
            float _radius = 50f;

            public void Init(RectTransform knob, PlayerController player)
            {
                _knob = knob;
                _player = player;
            }

            public void OnPointerDown(UnityEngine.EventSystems.PointerEventData eventData) => OnDrag(eventData);

            public void OnDrag(UnityEngine.EventSystems.PointerEventData eventData)
            {
                var rt = (RectTransform)transform;
                if (!RectTransformUtility.ScreenPointToLocalPointInRectangle(rt, eventData.position,
                        eventData.pressEventCamera, out var local))
                    return;

                local = Vector2.ClampMagnitude(local, _radius);
                if (_knob != null) _knob.anchoredPosition = local;
                var v = local / _radius;
                _player?.SetUiMove(v.x, v.y);
            }

            public void OnPointerUp(UnityEngine.EventSystems.PointerEventData eventData)
            {
                if (_knob != null) _knob.anchoredPosition = Vector2.zero;
                _player?.SetUiMove(0f, 0f);
            }
        }
    }
}
