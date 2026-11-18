# Three.js exhibition viewer

`/exhibition` uses **Three.js** only.

## Try locally

```bash
cd web
npm install
npm run dev
```

| URL | Renderer |
| --- | --- |
| http://localhost:3000/exhibition | Three.js |
| http://localhost:3000/exhibition?catalog=draft&token=… | Three + draft catalog |

## Module layout

- `src/lib/gallery-renderer.ts` — Three-only resolver (legacy query/env ignored)
- `src/lib/gallery-three/` — layout floors/walls, placements, sky, foyer
- `src/components/exhibition/gallery-scene-3d.tsx` — visitor scene + controls

Shared geometry: `layout-geometry.ts`, `room-overlap-clip.ts`, `polygon-floor.ts`, `placement-eval.ts`.

## Sky asset

CC0 **Cozy Sky Night** 2K equirectangular panorama:

- `public/sky/cozy-sky-night_2k.png`
- `public/sky/LICENSE-cozy-sky-night.txt`

## Performance notes

- `devicePixelRatio` capped at 2
- Simple `MeshStandardMaterial` (no post-processing)
- Fan / ear-clip floor meshes per room
- Exhibition JS chunk (built) typically ~2–4 MB gzip depending on code-splitting
