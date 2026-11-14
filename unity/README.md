# Unity 6 WebGL Gallery

Procedural art gallery for the exhibition site. Cloud CI cannot export WebGL — open this folder in **Unity 6 LTS**, then build.

## What runs at play time

`GalleryBootstrap` (auto or scene object) loads `GET /api/catalog` (`?catalog=live|draft`, `?lang=`, draft `?token=`), builds the room, spawns frames, and wires player + HTML media overlays.

| Script | Role |
|--------|------|
| `RoomBuilder` | W=8, H=3.2; `L = marginEnds*2 + ceil(N/2)*slotPitch` (slotPitch=3, marginEnds=2); N=0 → L0 |
| `ArtworkSpawner` | Alternate L/R walls; placeholder → `urlWall`/`urlPoster` (max 4 concurrent); unload distant |
| `PlayerController` | Desktop WASD + pointer-lock look; mobile joystick + look drag; HTML joystick via `MediaBridge` |
| `InteractionRaycaster` | Tap select; double-tap image fullscreen; headphones/video → video; E / Info → text |
| `MediaBridge` + `.jslib` | `openImage` / `openVideo` / close; `timeScale=0` while overlay; `playsInline` video in DOM |
| `CatalogLoader` | Live/draft catalog from query + origin `/api/catalog` |
| `LocaleUI` | EN / RU / UK / HE titles & text |
| `QualityTier` | Mobile: render scale 0.6–0.75, shadows off |

Primitives + runtime materials only (no external art packs).

## Catalog contract

Shared with the Next.js app. Unity ignores `published: false`. Wall images should be ≤1024px; video never decoded inside Unity — poster on wall, playback in HTML.

## Open in Editor

1. Unity Hub → Open → select this `unity/` folder (Editor **6000.x**).
2. Let it generate `.meta` files / import.
3. Open `Assets/Scenes/Gallery.unity` (bootstrap also auto-spawns if missing).
4. Enter Play Mode (Editor uses `http://localhost:3000` for catalog).

## WebGL export (required for `/exhibition`)

1. **File → Build Settings → WebGL → Switch Platform**.
2. Apply settings in `ProjectSettings/WebGLPlayerSettings.md` (WebGL2, memory, Brotli/Gzip, strip, **Exception Support: None**, IL2CPP).
3. Build to a temp folder (e.g. `unity/Builds/WebGL/`).
4. Copy into the site:

```bash
./scripts/copy-webgl.sh unity/Builds/WebGL
```

Target: `web/public/unity/` (served by Next at `/unity/...`).

5. Confirm `/exhibition` embeds the player and that `MediaBridge` GameObject name stays `MediaBridge` so JS `SendMessage` can resume Unity.

## Mobile budget (reminders)

- Max 4 concurrent texture downloads; unload &gt;2 slot-pairs from camera.
- No full video textures in WASM.
- Quality tier lowers scale and disables shadows on mobile.

## Dependencies on web

- Public API: `GET /api/catalog`
- Exhibition page should expose HTML chrome (lang / exit / optional joysticks) calling into Unity via `SendMessage('MediaBridge', 'JsSetMove'|'JsAddLook', 'x,y')` when using HTML controls.
