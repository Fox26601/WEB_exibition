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

        static Material s_placeholder;
        static Material s_frameMat;

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
            frame.GetComponent<MeshRenderer>().sharedMaterial = FrameMaterial();
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
                _canvasMaterial.mainTexture = null;
                if (_canvasMaterial.HasProperty("_BaseMap"))
                    _canvasMaterial.SetTexture("_BaseMap", null);
                SetColor(new Color(0.75f, 0.75f, 0.72f));
            }
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
            s_placeholder = CreateMat(new Color(0.75f, 0.75f, 0.72f));
            return s_placeholder;
        }

        static Material FrameMaterial()
        {
            if (s_frameMat != null) return s_frameMat;
            s_frameMat = CreateMat(new Color(0.18f, 0.16f, 0.14f));
            return s_frameMat;
        }

        static Material CreateMat(Color color)
        {
            var shader = Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null)
                shader = Shader.Find("Standard");
            if (shader == null)
                shader = Shader.Find("Unlit/Color");
            var mat = new Material(shader);
            if (mat.HasProperty("_BaseColor"))
                mat.SetColor("_BaseColor", color);
            if (mat.HasProperty("_Color"))
                mat.SetColor("_Color", color);
            return mat;
        }
    }
}
