# Unity WebGL Art Gallery + Exhibition Site

Landing site, Google-allowlist admin CMS, catalog API (Vercel Blob), and a WebGL exhibition (`/exhibition`). Until a Unity WebGL build is copied into `web/public/unity/`, the exhibition runs a **Three.js** room that uses the same catalog and room-growth formula as Unity.

## Repo layout

| Path | Purpose |
|------|---------|
| `web/` | Next.js App Router (landing, admin, API, exhibition) |
| `unity/` | Unity 6 project (owned separately) |
| `scripts/copy-webgl.sh` | Copy a Unity WebGL export into `web/public/unity/` |

## Local development

```bash
cd web
cp .env.example .env.local
# fill AUTH_* and ADMIN_EMAILS (Blob token optional)
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Without `BLOB_READ_WRITE_TOKEN`, catalog and media are stored under `web/.data/` (gitignored).

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_SECRET` | yes | Auth.js session secret |
| `AUTH_GOOGLE_ID` | yes (admin) | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | yes (admin) | Google OAuth client secret |
| `ADMIN_EMAILS` | yes (admin) | Comma-separated allowlist, case-insensitive |
| `BLOB_READ_WRITE_TOKEN` | prod | Vercel Blob read/write token |
| `CATALOG_SIGNING_SECRET` | recommended | Signs draft preview tokens (falls back to `AUTH_SECRET`) |
| `AUTH_URL` | prod | Public site URL for Auth.js |

### Key routes

| Route | Description |
|-------|-------------|
| `/` | Landing poster + Enter exhibition |
| `/bio` | Bio / CV from settings |
| `/exhibition` | WebGL gallery (Unity if present, else Three.js) |
| `/admin/login` | Google OAuth |
| `/admin` | Dashboard |
| `/admin/artworks` | Artwork CRUD, reorder, publish, **Publish catalog** |
| `/admin/settings` | Poster, Instagram, email, bio (EN/RU/UK/HE) |
| `/admin/preview` | 2D schematic + draft iframe |
| `GET /api/catalog?catalog=live\|draft` | Catalog JSON (`draft` needs admin session or `token`) |

## Media limits

| Asset | Limit | Output |
|-------|-------|--------|
| Image upload | 8 MB raw | wall ≤1024px WebP, full ≤2048px WebP |
| Video upload | 80 MB | MP4 H.264; poster still on wall |
| Catalog | small JSON | `catalog-live.json` + `catalog-draft.json`; publish writes `catalog-v{n}.json` |

Uploads use a server-issued Blob token (direct client → Blob). Locally, multipart upload writes into `web/.data/`.

## Room growth (shared)

```
slotPitch = 3.0m
marginEnds = 2.0m
L = marginEnds*2 + ceil(N/2)*slotPitch   # N=0 → L0 = 4m
```

Works alternate left/right long walls. Admin schematic, Three.js stub, and Unity must match.

## Unity WebGL handoff

1. Export WebGL from Unity 6 (WebGL2, compression as configured in the Unity project).
2. Copy into the Next app:

```bash
./scripts/copy-webgl.sh /path/to/UnityWebGLBuild
```

This populates `web/public/unity/` (expects `Build/` among other export files).

3. Redeploy. `/exhibition` prefers Unity when `public/unity/Build` is available; otherwise the Three.js stub serves the same catalog.

## Deploy (Vercel)

1. Set **Root Directory** to `web`.
2. Add the env vars above.
3. **GitHub previews:** repo-root `package.json` workspaces + `vercel.json` (`npm install`, `npm run build --workspace=web`). **CLI from `web/`:** `web/vercel.json` with default commands.

```bash
cd web && npm run build
```
