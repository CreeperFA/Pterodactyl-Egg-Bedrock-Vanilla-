#!/usr/bin/env bash
set -euo pipefail

TOOL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="${1:-$TOOL_ROOT/config.json}"
SCENARIO="${2:-}"
MODE="${3:-}"
RUNNER="$TOOL_ROOT/.runtime/bedboo/.supercores-tools/nethernet-load-test/src/cli.js"
[[ -f "$RUNNER" ]] || "$TOOL_ROOT/scripts/setup.sh"
args=("$RUNNER" --config "$(cd "$(dirname "$CONFIG")" && pwd)/$(basename "$CONFIG")")
if [[ "$SCENARIO" == 'suite' ]]; then args+=(--suite); elif [[ -n "$SCENARIO" ]]; then args+=(--scenario "$SCENARIO"); fi
[[ "$MODE" != '--check' ]] || args+=(--check)
node "${args[@]}"
