using Gallery.Catalog;
using UnityEngine;

namespace Gallery.Room
{
    /// <summary>
    /// Frame + canvas quad (+ headphones for video). Sculptures use procedural stubs;
    /// modelUrl is kept for a future runtime GLB loader (rebuild on Mac).
    /// </summary>
    public class ArtworkView : MonoBehaviour
    {
        public ArtworkEntry Entry { get; private set; }
        public int Index { get; private set; }
        public string FrameId { get; private set; } = "wood";
        public bool IsSculpture { get; private set; }
        public bool IsVideo => Entry != null && Entry.ArtworkType == ArtworkType.Video;
        public bool HasTexture { get; private set; }

        MeshRenderer _canvasRenderer;
        Material _canvasMaterial;
        Texture2D _loadedTexture;
        GameObject _headphones;
        MeshRenderer _frameRenderer;
        bool _selected;

        static Material s_frameMat;

        public void Setup(ArtworkEntry entry, int index, string frameId = null, bool sculpture = false)
        {
            Entry = entry;
            Index = index;
            FrameId = string.IsNullOrEmpty(frameId)
                ? (entry != null && !string.IsNullOrEmpty(entry.frameId) ? entry.frameId : "wood")
                : frameId;
            IsSculpture = sculpture || (entry != null && entry.ArtworkType == ArtworkType.Model);
            if (IsSculpture)
                BuildSculpture();
            else
                BuildVisuals();
        }

        void BuildSculpture()
        {
            // Procedural low-poly stand-in until glTFast (or similar) is wired on Mac rebuild.
            var body = GameObject.CreatePrimitive(PrimitiveType.Cube);
            body.name = "SculptureStub";
            body.transform.SetParent(transform, false);
            var id = Entry != null ? Entry.id : "";
            if (id.Contains("obelisk"))
            {
                body.transform.localPosition = new Vector3(0f, 0.7f, 0f);
                body.transform.localScale = new Vector3(0.28f, 1.4f, 0.28f);
            }
            else if (id.Contains("plinth"))
            {
                body.transform.localPosition = new Vector3(0f, 0.18f, 0f);
                body.transform.localScale = new Vector3(1f, 0.35f, 1f);
            }
            else
            {
                body.transform.localPosition = new Vector3(0f, 0.3f, 0f);
                body.transform.localScale = new Vector3(0.55f, 0.6f, 0.55f);
            }

            var tint = Color.HSVToRGB((Index * 0.17f + 0.35f) % 1f, 0.25f, 0.72f);
            body.GetComponent<MeshRenderer>().sharedMaterial = RuntimeMaterials.Create(tint);

            var hit = gameObject.AddComponent<BoxCollider>();
            hit.size = new Vector3(0.8f, 1.4f, 0.8f);
            hit.center = new Vector3(0f, 0.7f, 0f);

            if (Entry != null && !string.IsNullOrEmpty(Entry.modelUrl))
            {
                var holder = gameObject.AddComponent<SculptureModelRef>();
                holder.modelUrl = Entry.modelUrl;
            }
        }

        void BuildVisuals()
        {
            var frameScale = FrameScale(FrameId);
            var frame = GameObject.CreatePrimitive(PrimitiveType.Cube);
            frame.name = "Frame";
            frame.transform.SetParent(transform, false);
            frame.transform.localPosition = Vector3.zero;
            frame.transform.localScale = frameScale;
            _frameRenderer = frame.GetComponent<MeshRenderer>();
            _frameRenderer.sharedMaterial = new Material(FrameMaterial());
            ApplyFrameColor();
            var frameCol = frame.GetComponent<Collider>();
            frameCol.isTrigger = false;

            if (FrameId != "none")
            {
                var canvas = GameObject.CreatePrimitive(PrimitiveType.Cube);
                canvas.name = "Canvas";
                canvas.transform.SetParent(transform, false);
                canvas.transform.localPosition = new Vector3(0f, 0f, frameScale.z * 0.5f + 0.02f);
                canvas.transform.localScale = new Vector3(
                    Mathf.Max(0.2f, frameScale.x - 0.28f),
                    Mathf.Max(0.2f, frameScale.y - 0.28f),
                    0.08f);
                Object.Destroy(canvas.GetComponent<Collider>());

                _canvasRenderer = canvas.GetComponent<MeshRenderer>();
                ApplyPlaceholder();
            }
            else
            {
                var canvas = GameObject.CreatePrimitive(PrimitiveType.Cube);
                canvas.name = "Canvas";
                canvas.transform.SetParent(transform, false);
                canvas.transform.localPosition = new Vector3(0f, 0f, 0.02f);
                canvas.transform.localScale = new Vector3(1.5f, 1.0f, 0.04f);
                Object.Destroy(canvas.GetComponent<Collider>());
                _canvasRenderer = canvas.GetComponent<MeshRenderer>();
                ApplyPlaceholder();
                if (_frameRenderer != null)
                    _frameRenderer.enabled = false;
            }

            if (IsVideo)
            {
                _headphones = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                _headphones.name = "Headphones";
                _headphones.transform.SetParent(transform, false);
                _headphones.transform.localPosition = new Vector3(0.85f, -0.35f, 0.08f);
                _headphones.transform.localScale = Vector3.one * 0.22f;
                _headphones.GetComponent<MeshRenderer>().sharedMaterial = FrameMaterial();
            }

            var hit = gameObject.AddComponent<BoxCollider>();
            hit.size = new Vector3(1.7f, 1.2f, 0.2f);
            hit.center = Vector3.zero;
        }

        static Vector3 FrameScale(string frameId)
        {
            switch ((frameId ?? "wood").ToLowerInvariant())
            {
                case "thin": return new Vector3(1.65f, 1.15f, 0.03f);
                case "metal": return new Vector3(1.72f, 1.22f, 0.04f);
                case "ornate": return new Vector3(1.95f, 1.45f, 0.08f);
                case "none": return new Vector3(1.5f, 1.0f, 0.02f);
                default: return new Vector3(1.78f, 1.28f, 0.05f); // wood
            }
        }

        static Color FrameColorFor(string frameId, bool selected)
        {
            if (selected) return new Color(0.85f, 0.72f, 0.28f);
            switch ((frameId ?? "wood").ToLowerInvariant())
            {
                case "thin": return new Color(0.55f, 0.55f, 0.52f);
                case "metal": return new Color(0.62f, 0.64f, 0.68f);
                case "ornate": return new Color(0.55f, 0.38f, 0.18f);
                case "none": return new Color(0.2f, 0.2f, 0.2f);
                default: return new Color(0.42f, 0.32f, 0.22f);
            }
        }

        public void ApplyTexture(Texture2D texture)
        {
            if (_canvasRenderer == null) return;

            if (texture == null)
            {
                ApplyPlaceholder();
                return;
            }

            if (_loadedTexture != null && _loadedTexture != texture)
            {
                Destroy(_loadedTexture);
                _loadedTexture = null;
            }

            _loadedTexture = texture;
            HasTexture = true;

            var texShader = Shader.Find("Unlit/Texture") ?? Shader.Find("Unlit/Transparent");
            if (texShader != null)
            {
                _canvasMaterial = new Material(texShader);
                _canvasMaterial.mainTexture = texture;
                if (_canvasMaterial.HasProperty("_MainTex"))
                    _canvasMaterial.SetTexture("_MainTex", texture);
                if (_canvasMaterial.HasProperty("_Color"))
                    _canvasMaterial.SetColor("_Color", Color.white);
                _canvasRenderer.material = _canvasMaterial;
            }
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
            if (_canvasRenderer == null) return;
            if (_loadedTexture != null)
            {
                Destroy(_loadedTexture);
                _loadedTexture = null;
            }

            var tint = Color.HSVToRGB((Index * 0.19f + 0.08f) % 1f, 0.45f, 0.82f);
            _canvasMaterial = RuntimeMaterials.Create(tint);
            _canvasRenderer.material = _canvasMaterial;
            HasTexture = false;
        }

        public void SetSelected(bool selected)
        {
            _selected = selected;
            ApplyFrameColor();
        }

        void ApplyFrameColor()
        {
            if (_frameRenderer == null || _frameRenderer.sharedMaterial == null) return;
            var c = FrameColorFor(FrameId, _selected);
            var mat = _frameRenderer.sharedMaterial;
            if (mat.HasProperty("_BaseColor"))
                mat.SetColor("_BaseColor", c);
            if (mat.HasProperty("_Color"))
                mat.SetColor("_Color", c);
        }

        static Material FrameMaterial()
        {
            if (s_frameMat != null) return s_frameMat;
            s_frameMat = RuntimeMaterials.Create(FrameColorFor("wood", false));
            return s_frameMat;
        }

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

    /// <summary>
    /// Holds remote GLB URL until a runtime loader is available in the WebGL build.
    /// </summary>
    public class SculptureModelRef : MonoBehaviour
    {
        public string modelUrl;
    }
}
