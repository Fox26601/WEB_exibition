using Gallery.Catalog;
using UnityEngine;

namespace Gallery.Room
{
    /// <summary>
    /// Frame + canvas quad (+ headphones marker for video slots).
    /// </summary>
    public class ArtworkView : MonoBehaviour
    {
        public ArtworkEntry Entry { get; private set; }
        public int Index { get; private set; }
        public bool IsVideo => Entry != null && Entry.ArtworkType == ArtworkType.Video;
        public bool HasTexture { get; private set; }

        MeshRenderer _canvasRenderer;
        Material _canvasMaterial;
        Texture2D _loadedTexture;
        GameObject _headphones;
        MeshRenderer _frameRenderer;
        bool _selected;

        static Material s_frameMat;
        static readonly Color FrameColor = new Color(0.42f, 0.32f, 0.22f);
        static readonly Color SelectedFrameColor = new Color(0.85f, 0.72f, 0.28f);

        public void Setup(ArtworkEntry entry, int index)
        {
            Entry = entry;
            Index = index;
            BuildVisuals();
        }

        void BuildVisuals()
        {
            // Backing plate (thin) + separate canvas in front to avoid WebGL z-fighting.
            var frame = GameObject.CreatePrimitive(PrimitiveType.Cube);
            frame.name = "Frame";
            frame.transform.SetParent(transform, false);
            frame.transform.localPosition = new Vector3(0f, 0f, 0.01f);
            frame.transform.localScale = new Vector3(1.78f, 1.28f, 0.04f);
            _frameRenderer = frame.GetComponent<MeshRenderer>();
            _frameRenderer.sharedMaterial = new Material(FrameMaterial());
            ApplyFrameColor();
            var frameCol = frame.GetComponent<Collider>();
            frameCol.isTrigger = false;

            // Thick enough cube to survive WebGL depth precision at gallery distance.
            var canvas = GameObject.CreatePrimitive(PrimitiveType.Cube);
            canvas.name = "Canvas";
            canvas.transform.SetParent(transform, false);
            canvas.transform.localPosition = new Vector3(0f, 0f, -0.14f);
            canvas.transform.localScale = new Vector3(1.5f, 1.0f, 0.12f);
            Object.Destroy(canvas.GetComponent<Collider>());

            _canvasRenderer = canvas.GetComponent<MeshRenderer>();
            // Solid Unlit color first (always visible), then bind wall texture when present.
            var placeholderTint = Color.HSVToRGB((Index * 0.19f + 0.08f) % 1f, 0.35f, 0.75f);
            _canvasMaterial = RuntimeMaterials.Create(placeholderTint);
            _canvasRenderer.material = _canvasMaterial;
            ApplyPlaceholder();

            if (IsVideo)
            {
                _headphones = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                _headphones.name = "Headphones";
                _headphones.transform.SetParent(transform, false);
                _headphones.transform.localPosition = new Vector3(0.85f, -0.35f, -0.08f);
                _headphones.transform.localScale = Vector3.one * 0.22f;
                _headphones.GetComponent<MeshRenderer>().sharedMaterial = FrameMaterial();
            }

            // Forward hit target identity.
            var hit = gameObject.AddComponent<BoxCollider>();
            hit.size = new Vector3(1.7f, 1.2f, 0.2f);
            hit.center = Vector3.zero;
        }

        public void ApplyTexture(Texture2D texture)
        {
            if (_canvasMaterial == null) return;

            if (_loadedTexture != null && _loadedTexture != texture)
            {
                Destroy(_loadedTexture);
                _loadedTexture = null;
            }

            _loadedTexture = texture;
            HasTexture = texture != null;

            if (texture == null)
            {
                ApplyPlaceholder();
                return;
            }

            BindTexture(texture);
            SetColor(Color.white);
        }

        public void UnloadTexture()
        {
            if (_loadedTexture != null)
            {
                Destroy(_loadedTexture);
                _loadedTexture = null;
            }

            HasTexture = false;
            ApplyPlaceholder();
        }

        void ApplyPlaceholder()
        {
            if (_canvasMaterial == null) return;
            // Prefer a textured material when the shader exists; otherwise keep solid tint.
            var textured = RuntimeMaterials.CreateTextured(Color.white);
            var placeholder = MakeEmbeddedPlaceholder(Entry, Index);
            _loadedTexture = placeholder;
            _canvasMaterial = textured;
            if (_canvasRenderer != null)
                _canvasRenderer.material = _canvasMaterial;
            BindTexture(placeholder);
            SetColor(Color.white);
            HasTexture = false;
        }

        void BindTexture(Texture texture)
        {
            if (_canvasMaterial == null) return;
            _canvasMaterial.mainTexture = texture;
            if (_canvasMaterial.HasProperty("_MainTex"))
                _canvasMaterial.SetTexture("_MainTex", texture);
            if (_canvasMaterial.HasProperty("_BaseMap"))
                _canvasMaterial.SetTexture("_BaseMap", texture);
            // If the active shader ignores maps, keep a non-frame tint so the plate stays visible.
            if (!_canvasMaterial.HasProperty("_MainTex") && !_canvasMaterial.HasProperty("_BaseMap"))
            {
                var tint = Color.HSVToRGB((Index * 0.19f + 0.08f) % 1f, 0.4f, 0.8f);
                SetColor(tint);
            }
        }

        public void SetSelected(bool selected)
        {
            _selected = selected;
            ApplyFrameColor();
        }

        void ApplyFrameColor()
        {
            if (_frameRenderer == null || _frameRenderer.sharedMaterial == null) return;
            var c = _selected ? SelectedFrameColor : FrameColor;
            var mat = _frameRenderer.sharedMaterial;
            if (mat.HasProperty("_BaseColor"))
                mat.SetColor("_BaseColor", c);
            if (mat.HasProperty("_Color"))
                mat.SetColor("_Color", c);
        }

        void SetColor(Color c)
        {
            if (_canvasMaterial == null) return;
            if (_canvasMaterial.HasProperty("_BaseColor"))
                _canvasMaterial.SetColor("_BaseColor", c);
            if (_canvasMaterial.HasProperty("_Color"))
                _canvasMaterial.SetColor("_Color", c);
        }

        static Material FrameMaterial()
        {
            if (s_frameMat != null) return s_frameMat;
            s_frameMat = RuntimeMaterials.Create(FrameColor);
            return s_frameMat;
        }

        /// <summary>
        /// Procedural wall card used when catalog URLs are empty (seed / offline).
        /// </summary>
        public static Texture2D MakeEmbeddedPlaceholder(ArtworkEntry entry, int index)
        {
            const int w = 256;
            const int h = 192;
            var tex = new Texture2D(w, h, TextureFormat.RGB24, false);
            var hue = (index * 0.19f + 0.08f) % 1f;
            var a = Color.HSVToRGB(hue, 0.28f, 0.62f);
            var b = Color.HSVToRGB(hue, 0.18f, 0.42f);
            var border = new Color(0.12f, 0.11f, 0.1f);
            var pixels = new Color[w * h];
            for (var y = 0; y < h; y++)
            {
                for (var x = 0; x < w; x++)
                {
                    if (x < 8 || y < 8 || x >= w - 8 || y >= h - 8)
                        pixels[y * w + x] = border;
                    else if (((x / 24) + (y / 24)) % 2 == 0)
                        pixels[y * w + x] = a;
                    else
                        pixels[y * w + x] = b;
                }
            }

            tex.SetPixels(pixels);
            tex.Apply(false, true);
            tex.name = "Placeholder_" + (entry != null ? entry.id : index.ToString());
            return tex;
        }
    }
}
