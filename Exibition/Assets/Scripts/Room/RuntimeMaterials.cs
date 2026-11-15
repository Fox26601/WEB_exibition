using UnityEngine;

namespace Gallery.Room
{
    /// <summary>
    /// WebGL-safe material factory. WebGL builds use Built-in RP (see WebGLBuilder);
    /// Shader.Find(URP…) returns null there. Prefer Built-in Unlit/Standard, then
    /// steal a shader from a temporary primitive.
    /// </summary>
    public static class RuntimeMaterials
    {
        static Shader _solidShader;
        static Shader _texturedShader;

        public static Material Create(Color color)
        {
            var mat = new Material(ResolveSolidShader());
            ApplyColor(mat, color);
            return mat;
        }

        /// <summary>Material that can display a mainTexture / _BaseMap (artwork canvases).</summary>
        public static Material CreateTextured(Color color)
        {
            var mat = new Material(ResolveTexturedShader());
            ApplyColor(mat, color);
            return mat;
        }

        static void ApplyColor(Material mat, Color color)
        {
            if (mat.HasProperty("_BaseColor"))
                mat.SetColor("_BaseColor", color);
            if (mat.HasProperty("_Color"))
                mat.SetColor("_Color", color);
        }

        static Shader ResolveSolidShader()
        {
            if (_solidShader != null)
                return _solidShader;

            _solidShader =
                Shader.Find("Unlit/Color")
                ?? Shader.Find("Legacy Shaders/Diffuse")
                ?? Shader.Find("Standard")
                ?? Shader.Find("Sprites/Default")
                ?? Shader.Find("UI/Default")
                ?? Shader.Find("Universal Render Pipeline/Unlit")
                ?? Shader.Find("Universal Render Pipeline/Lit")
                ?? StealFromPrimitive();

            if (_solidShader == null)
                throw new System.InvalidOperationException(
                    "RuntimeMaterials: no usable solid shader for WebGL materials.");

            return _solidShader;
        }

        static Shader ResolveTexturedShader()
        {
            if (_texturedShader != null)
                return _texturedShader;

            _texturedShader =
                Shader.Find("Unlit/Texture")
                ?? Shader.Find("Unlit/Transparent")
                ?? Shader.Find("Standard")
                ?? Shader.Find("Sprites/Default")
                ?? Shader.Find("Universal Render Pipeline/Unlit")
                ?? Shader.Find("Universal Render Pipeline/Lit")
                ?? ResolveSolidShader();

            return _texturedShader;
        }

        static Shader StealFromPrimitive()
        {
            var tmp = GameObject.CreatePrimitive(PrimitiveType.Quad);
            var src = tmp.GetComponent<MeshRenderer>().sharedMaterial;
            var shader = src != null ? src.shader : null;
            Object.Destroy(tmp);
            return shader;
        }
    }
}
