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

        static Material s_placeholder;
        static Material s_frameMat;
        static readonly Color FrameColor = new Color(0.18f, 0.16f, 0.14f);
        static readonly Color SelectedFrameColor = new Color(0.85f, 0.72f, 0.28f);

        public void Setup(ArtworkEntry entry, int index)
        {
            Entry = entry;
            Index = index;
            BuildVisuals();
        }

        void BuildVisuals()
        {
            var frame = GameObject.CreatePrimitive(PrimitiveType.Cube);
            frame.name = "Frame";
            frame.transform.SetParent(transform, false);
            frame.transform.localPosition = Vector3.zero;
            frame.transform.localScale = new Vector3(1.7f, 1.2f, 0.06f);
            _frameRenderer = frame.GetComponent<MeshRenderer>();
            _frameRenderer.sharedMaterial = new Material(FrameMaterial());
            ApplyFrameColor();
            // Keep collider on frame for raycasts.
            var frameCol = frame.GetComponent<Collider>();
            frameCol.isTrigger = false;

            var canvas = GameObject.CreatePrimitive(PrimitiveType.Quad);
            canvas.name = "Canvas";
            canvas.transform.SetParent(transform, false);
            canvas.transform.localPosition = new Vector3(0f, 0f, -0.035f);
            canvas.transform.localScale = new Vector3(1.5f, 1.0f, 1f);
            Object.Destroy(canvas.GetComponent<Collider>());

            _canvasRenderer = canvas.GetComponent<MeshRenderer>();
            _canvasMaterial = new Material(PlaceholderMaterial());
            _canvasRenderer.sharedMaterial = _canvasMaterial;
            // Distinct placeholder so empty urlWall still reads as a hung work.
            // HasTexture stays false so streaming can replace when a URL exists.
            var placeholder = MakeEmbeddedPlaceholder(Entry, Index);
            _loadedTexture = placeholder;
            _canvasMaterial.mainTexture = placeholder;
            if (_canvasMaterial.HasProperty("_BaseMap"))
                _canvasMaterial.SetTexture("_BaseMap", placeholder);
            SetColor(Color.white);
            HasTexture = false;

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
                _canvasMaterial.mainTexture = null;
                if (_canvasMaterial.HasProperty("_BaseMap"))
                    _canvasMaterial.SetTexture("_BaseMap", null);
                SetColor(new Color(0.75f, 0.75f, 0.72f));
                return;
            }

            _canvasMaterial.mainTexture = texture;
            if (_canvasMaterial.HasProperty("_BaseMap"))
                _canvasMaterial.SetTexture("_BaseMap", texture);
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
            if (_canvasMaterial != null)
            {
                // Restore embedded placeholder so the slot stays visible.
                var placeholder = MakeEmbeddedPlaceholder(Entry, Index);
                _loadedTexture = placeholder;
                _canvasMaterial.mainTexture = placeholder;
                if (_canvasMaterial.HasProperty("_BaseMap"))
                    _canvasMaterial.SetTexture("_BaseMap", placeholder);
                SetColor(Color.white);
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

        static Material PlaceholderMaterial()
        {
            if (s_placeholder != null) return s_placeholder;
            s_placeholder = RuntimeMaterials.CreateTextured(new Color(0.75f, 0.75f, 0.72f));
            return s_placeholder;
        }

        static Material FrameMaterial()
        {
            if (s_frameMat != null) return s_frameMat;
            s_frameMat = RuntimeMaterials.Create(new Color(0.18f, 0.16f, 0.14f));
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
