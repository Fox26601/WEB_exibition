# Unity WebGL export target

This folder is the static host path for the Unity 6 WebGL build (`/unity/...` on the Next.js site).

**Status:** no binary build in repo yet (Editor export required). Until files are copied here, `/exhibition` should show a fallback rather than a blank canvas.

## How to populate

1. Open `unity/` in Unity 6 LTS.
2. Build WebGL with settings from `unity/ProjectSettings/WebGLPlayerSettings.md`.
3. From repo root:

```bash
./scripts/copy-webgl.sh unity/Builds/WebGL
```

Expected contents after export: `index.html`, `Build/*.wasm` / `*.data` / `*.framework.js` / `*.loader.js`, `TemplateData/`.

Catalog at runtime: `GET /api/catalog` (see `CatalogLoader`). Media overlays: `MediaBridge.jslib`.
