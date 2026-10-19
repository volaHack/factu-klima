#!/bin/sh
# Reconstruye «La cadena» de cero: sh build.sh
# Necesita la librería Lemo-Opuscar (LIB) con su .venv y, en este equipo, el Chromium de /opt/pw-browsers.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
LIB=${LIB:-/home/user/lemomo-ai/lemo-opuscar}
export PLAYWRIGHT_CHROME=${PLAYWRIGHT_CHROME:-/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell}
[ -f "$LIB/core/render/video.mjs" ] || { echo "set LIB to the library folder"; exit 1; }
PY="$LIB/.venv/bin/python"
python3 "$HERE/cadena.py"                                                            # 1. la cadena con SHA-256 de verdad
cd "$LIB"
node core/render/events.mjs "$HERE" --size 1080x1920                                # 2. golpes → events.json
node core/render/readcheck.mjs "$HERE" --size 1080x1920                             # 3. tiempo de lectura de cada rótulo
$PY "$HERE/mix.py"                                                                   # 4. música, efectos y sala
node core/render/video.mjs "$HERE" --fps 30 --workers 4 --size 1080x1920 --out "$HERE/out/video.mp4"   # 5. imagen
sh "$HERE/mux_local.sh" "$HERE/out/video.mp4" "$HERE/out/mix.wav" "$HERE/la-cadena.mp4" 30 0         # 6. −14 LUFS
