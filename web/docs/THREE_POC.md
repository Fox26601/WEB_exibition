# Three.js exhibition viewer

`/exhibition` uses **Three.js by default**. Unity WebGL is legacy: visitors opt in with `?renderer=unity` or `NEXT_PUBLIC_GALLERY_RENDERER=unity`. Admin 3D build (`mode=admin-build`) still uses Unity when `public/unity/Build` is present.

## Try locally

```bash
cd web
npm install
npm run dev
```

| URL | Renderer |
| --- | --- |
| http://localhost:3000/exhibition | **Three.js** (default) |
| http://localhost:3000/exhibition?renderer=unity | Unity (when wasm present) |
| http://localhost:3000/exhibition?catalog=draft&token=… | Three + draft catalog |

### Environment

```bash
# Optional explicit default (app already defaults to three without this)
NEXT_PUBLIC_GALLERY_RENDERER=three npm run dev
```

**Production (webgalerey.app):** set `NEXT_PUBLIC_GALLERY_RENDERER=three` on Vercel to document intent; behavior matches the built-in default. Use `unity` only for emergency rollback while Three admin mode is unfinished.

## Module layout

- `src/lib/gallery-renderer.ts` — unity vs three switch
- `src/lib/gallery-three/` — layout floors/walls, placements, sky, legacy corridor
- `src/components/exhibition/gallery-scene-3d.tsx` — visitor scene + controls

Shared geometry (unchanged): `layout-geometry.ts`, `room-overlap-clip.ts`, `polygon-floor.ts`, `placement-eval.ts`.

## Sky asset

CC0 **Cozy Sky Night** 2K equirectangular panorama:

- `public/sky/cozy-sky-night_2k.png`
- `public/sky/LICENSE-cozy-sky-night.txt`

## Performance notes

- `devicePixelRatio` capped at 2
- Simple `MeshStandardMaterial` (no post-processing)
- Fan / ear-clip floor meshes per room

## Bundle vs Unity (rough)

| Asset | Approx. size |
| --- | --- |
| Unity WebGL (`WebGL.wasm` + data) | ~50 MB download |
| `three` npm package (minified) | ~0.6 MB |
| This sky PNG | ~1.2 MB |
| Exhibition JS chunk (Three path, built) | ~2–4 MB gzip (depends on code-splitting) |

Visitor memory: Three avoids loading the ~50 MB wasm heap; expect tens of MB lower on typical mobile browsers.