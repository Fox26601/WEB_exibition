using UnityEngine;

namespace Gallery.Room
{
    /// <summary>
    /// WebGL-safe material factory. Shader.Find often returns null for URP/Standard
    /// on player builds; fall back to a primitive's built-in material.
    /// </summary>
    public static class RuntimeMaterials
    {
        static Shader _cached;

        public static Material Create(Color color)
        {
            var shader = ResolveShader();
            var mat = new Material(shader);
            if (mat.HasProperty("_BaseColor"))
                mat.SetColor("_BaseColor", color);
            if (mat.HasProperty("_Color"))
                mat.SetColor("_Color", color);
            return mat;
        }

        static Shader ResolveShader()
        {
            if (_cached != null)
                return _cached;

            _cached =
                Shader.Find("Universal Render Pipeline/Lit")
                ?? Shader.Find("Universal Render Pipeline/Unlit")
                ?? Shader.Find("Standard")
                ?? Shader.Find("Unlit/Color")
                ?? Shader.Find("Unlit/Texture")
                ?? Shader.Find("Sprites/Default")
                ?? Shader.Find("UI/Default");

            if (_cached != null)
                return _cached;

            var tmp = GameObject.CreatePrimitive(PrimitiveType.Quad);
            var src = tmp.GetComponent<MeshRenderer>().sharedMaterial;
            _cached = src != null ? src.shader : null;
            Object.Destroy(tmp);

            if (_cached == null)
                throw new System.InvalidOperationException(
                    "RuntimeMaterials: no usable shader found for WebGL materials.");

            return _cached;
        }
    }
}
