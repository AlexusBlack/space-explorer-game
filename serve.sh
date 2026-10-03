#!/usr/bin/env bash
# Launches a local static server for manual testing (no build step needed).
set -euo pipefail
PORT="${1:-8080}"
cd "$(dirname "${BASH_SOURCE[0]}")"
echo "Serving explorer-game at http://localhost:${PORT}"
python3 -m http.server "${PORT}"
