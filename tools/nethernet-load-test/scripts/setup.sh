#!/usr/bin/env bash
set -euo pipefail

BEDBOO_COMMIT='254bfcc4d05ddad767ac95e6208f6e1942dea8f3'
TOOL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BEDBOO_ROOT="$TOOL_ROOT/.runtime/bedboo"
PACKAGE_ROOT="$BEDBOO_ROOT/.supercores-tools/nethernet-load-test"

node -e "const n=+process.versions.node.split('.')[0]; if(n<24) process.exit(1)" || {
  echo 'Node.js 24 or newer is required.' >&2
  exit 1
}

mkdir -p "$TOOL_ROOT/.runtime"
if [[ ! -d "$BEDBOO_ROOT/.git" ]]; then
  git clone https://github.com/LiteLDev/bedboo.git "$BEDBOO_ROOT"
fi
git -C "$BEDBOO_ROOT" fetch --depth 1 origin "$BEDBOO_COMMIT"
git -C "$BEDBOO_ROOT" checkout --detach "$BEDBOO_COMMIT"
mkdir -p "$PACKAGE_ROOT"
find "$PACKAGE_ROOT" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
tar -C "$TOOL_ROOT" --exclude='.runtime' --exclude='config.json' -cf - . | tar -C "$PACKAGE_ROOT" -xf -
(cd "$BEDBOO_ROOT" && npx --yes pnpm@12.14.0 install --frozen-lockfile)
echo "Prepared pinned bedboo runtime at $BEDBOO_ROOT"
