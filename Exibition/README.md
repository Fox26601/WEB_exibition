# Exibition (Unity Hub project)

Procedural WebGL art gallery. Open this folder in **Unity Hub** with Editor **6000.3.8f1** (folder name stays `Exibition`).

## Open in Hub

1. Unity Hub → **Open** → select  
   `/Users/mymac/Documents/GitHub/WEB_exibition/Exibition`  
   (or the `Exibition` folder inside this repo).
2. Use Editor **6000.3.8f1** (project `ProjectVersion.txt` matches).
3. Wait for import / script compile.
4. Open **Assets/Scenes/Gallery.unity** (also listed first in Build Settings).
5. Press **Play**.

`GalleryBootstrap` auto-creates room, player, catalog loader, and UI if missing. Offline Play loads **Assets/StreamingAssets/catalog.json** when `http://localhost:3000/api/catalog` is down.

## Play controls (Editor)

| Input | Action |
|-------|--------|
| WASD / arrows | Move |
| Mouse click + drag | Look (pointer lock); Esc unlocks |
| Click artwork | Select |
| Double-click image | Fullscreen image (HTML overlay in WebGL; logged in Editor) |
| Headphones marker / video | Open video overlay (WebGL) |
| E / Info | Show artwork text |
| Locale buttons | EN / RU / UK / HE |

## Project layout

| Path | Role |
|------|------|
| `Assets/Scripts/` | Gallery C# (`RoomBuilder`, `ArtworkSpawner`, `PlayerController`, `InteractionRaycaster`, `MediaBridge`, `CatalogLoader`, `LocaleUI`, `QualityTier`, `GalleryBootstrap`) |
| `Assets/Scripts/Room/StarSkybox.cs` | Procedural night sky (runtime cubemap + combined star mesh; no third-party sky texture) |
| `Assets/Plugins/WebGL/MediaBridge.jslib` | HTML image/video overlays for WebGL |
| `Assets/StreamingAssets/catalog.json` | Sample catalog for offline Editor Play |
| `Assets/Scenes/Gallery.unity` | Playable scene |
| `Assets/Editor/GallerySceneSetup.cs` | Menu **Gallery → Ensure Gallery Scene** |
| `ProjectSettings/WebGLPlayerSettings.md` | WebGL export checklist |

Render pipeline: **URP** (Unity 6 template, package `com.unity.render-pipelines.universal`). Input: **Both** (Input Manager + Input System) so legacy WASD and the New Input System package coexist.

## WebGL handoff (later)

1. File → Build Settings → WebGL → Switch Platform.
2. Apply settings from `ProjectSettings/WebGLPlayerSettings.md`.
3. Build to e.g. `Exibition/Builds/WebGL/`.
4. From repo root:

```bash
./scripts/copy-webgl.sh Exibition/Builds/WebGL
```

Copies into `web/public/unity/` for the Next.js `/exhibition` page.

## Batch compile (optional)

```bash
"/Applications/Unity/Hub/Editor/6000.3.8f1/Unity.app/Contents/MacOS/Unity" \
  -batchmode -nographics -quit \
  -projectPath "/Users/mymac/Documents/GitHub/WEB_exibition/Exibition" \
  -executeMethod Gallery.EditorTools.BatchCompileCheck.Run \
  -logFile -
```

Exit `0` means scripts compiled without failure.
