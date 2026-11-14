#!/usr/bin/env bash
# Copy a Unity WebGL build into web/public/unity for Next.js static hosting.
set -euo pipefail

SRC="${1:-}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/web/public/unity"

if [[ -z "$SRC" || ! -d "$SRC" ]]; then
  echo "Usage: $0 <path-to-unity-webgl-build-folder>"
  echo "Example: $0 unity/Builds/WebGL"
  exit 1
fi

mkdir -p "$DEST"
rsync -a --delete \
  --exclude 'README.md' \
  "$SRC"/ "$DEST"/

# Keep the placeholder README if the build did not include one.
if [[ ! -f "$DEST/README.md" ]]; then
  cat > "$DEST/README.md" <<'EOF'
# Unity WebGL build output

Place Unity WebGL export files here (`index.html`, `Build/`, `TemplateData/`).
See `unity/README.md` for Player Settings and export steps.
EOF
fi

echo "Copied WebGL build → web/public/unity/"
ls -la "$DEST"
