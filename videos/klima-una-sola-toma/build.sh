#!/bin/sh
# Reconstruye «Una sola toma» de cero: sh build.sh
# Necesita la librería Lemo-Opuscar (LIB) con su .venv, three.js (npm install) y, en este equipo, el Chromium de /opt/pw-browsers.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
LIB=${LIB:-/home/user/lemomo-ai/lemo-opuscar}
export PLAYWRIGHT_CHROME=${PLAYWRIGHT_CHROME:-/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell}
[ -f "$LIB/core/render/video.mjs" ] || { echo "set LIB to the library folder"; exit 1; }
[ -d "$HERE/node_modules/three" ] || (cd "$HERE" && npm install)
cd "$LIB"
node core/render/events.mjs "$HERE" --size 1080x1920                                         # 1. golpes → events.json
node core/render/readcheck.mjs "$HERE" --q "text=1" --size 1080x1920 --step .1               # 2. tiempo de lectura de cada rótulo
"$LIB/.venv/bin/python" "$HERE/mix.py"                                                       # 3. música, efectos y sala
node core/render/video.mjs "$HERE" --fps 30 --workers 2 --size 1080x1920 --out "$HERE/out/video.mp4"   # 4. imagen (3D: sin GPU, ~45 min; más de 2 navegadores se estorban)
sh "$HERE/mux_local.sh" "$HERE/out/video.mp4" "$HERE/out/mix.wav" "$HERE/una-sola-toma.mp4" 30 0      # 5. −14 LUFS
