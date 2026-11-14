# WebGL Player Settings (apply in Unity 6 Editor)

Cloud agents cannot run the Unity Editor. After opening this project locally, set:

| Setting | Value |
|---------|--------|
| Platform | WebGL |
| Color Space | Linear (or Gamma if URP not configured) |
| Graphics APIs | **WebGL 2.0 only** (remove WebGL 1) |
| Memory size (initial) | 128–256 MB |
| Memory growth | Enabled, hard cap appropriate for mobile (~512–1024 MB max growth) |
| Compression Format | **Brotli** (fallback Gzip on hosts without Brotli) |
| Exception Support | **None** |
| Managed Stripping Level | High / Strip Engine Code enabled |
| Scripting Backend | IL2CPP |
| Multithreading | Off if iOS Safari is unstable |
| Name Files As Hashes | Optional (good for CDN cache) |
| Data caching | On |

Also: disable unused engine modules; keep URP Forward with no mobile post-stack; bake or use 1 directional + ambient.

See `../README.md` for export → `web/public/unity/` steps.
