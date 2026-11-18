# Three.js exhibition POC (Phase 0)

Replace Unity WebGL on `/exhibition` with a lightweight Three.js viewer. Unity remains the default on `main` until cutover.

## Try locally

```bash
cd web
npm install
npm run dev
```

| URL | Renderer |
| --- | --- |
| http://localhost:3000/exhibition | Unity when `public/unity/Build` exists |
| http://localhost:3000/exhibition?renderer=three | Three.js (forced) |
| http://localhost:3000/exhibition?renderer=three&catalog=draft&token=… | Three + draft catalog |

### Environment (same as query flag)

```bash
NEXT_PUBLIC_GALLERY_RENDERER=three npm run dev
```

Set `NEXT_PUBLIC_GALLERY_RENDERER=three` on Vercel when you are ready for production cutover (Phase 3). Until then, use the query flag on preview deployments.

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
| This POC sky PNG | ~1.2 MB |
| Exhibition JS chunk (Three path, built) | ~2–4 MB gzip (depends on code-splitting) |

Visitor memory: Three avoids loading the ~50 MB wasm heap; expect tens of MB lower on typical mobile browsers.