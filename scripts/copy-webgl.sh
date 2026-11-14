#!/usr/bin/env bash
# Copy a Unity WebGL export into web/public/unity for Next.js static serving.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/web/public/unity"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <path-to-unity-webgl-build-folder>"
  echo "Example: $0 ~/UnityBuilds/GalleryWebGL"
  exit 1
fi

SRC="$1"
if [[ ! -d "$SRC" ]]; then
  echo "Source folder not found: $SRC"
  exit 1
fi

mkdir -p "$DEST"
rsync -a --delete "$SRC"/ "$DEST"/

if [[ ! -d "$DEST/Build" ]]; then
  echo "Warning: $DEST/Build not found. Expected Unity WebGL layout with Build/ and TemplateData/."
fi

echo "Copied WebGL build to $DEST"
echo "Exhibition will prefer Unity when /unity/Build is present; otherwise Three.js stub is used."
