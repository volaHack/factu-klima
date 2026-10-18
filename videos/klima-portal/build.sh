#!/bin/sh
# Reconstruye «El portal del martes» de cero: sh build.sh
# Necesita la librería Lemo-Opuscar (LIB) con sus dependencias (setup.sh deps voice) y, en este equipo,
# el Chromium de /opt/pw-browsers porque la descarga del navegador de Playwright está bloqueada.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
LIB=${LIB:-/home/user/lemomo-ai/lemo-opuscar}
export LIB
export PLAYWRIGHT_CHROME=${PLAYWRIGHT_CHROME:-/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell}
[ -f "$LIB/core/render/video.mjs" ] || { echo "set LIB to the library folder"; exit 1; }
PY="$LIB/.venv/bin/python"
cd "$LIB"
$PY core/tts/tts.py "$HERE/lines.json" "$HERE/out/raw"                         # 1. voces con Kokoro
$PY "$HERE/voice.py"                                                            # 2. voz de cada personaje y labios
python3 "$HERE/asr.py"                                                          # 3. comprobación con Whisper (local)
node core/render/events.mjs "$HERE" --size 1080x1920                            # 4. línea de tiempo → events.json
$PY "$HERE/music/score.py"                                                      # 5. partitura sintetizada
$PY "$HERE/mix.py"                                                              # 6. voces + foley + ambiente + música
$PY "$HERE/subs.py"                                                             # 7. subtítulos .srt
node core/render/video.mjs "$HERE" --fps 24 --workers 4 --size 1080x1920 --out "$HERE/out/video.mp4"   # 8. imagen
sh "$HERE/mux_local.sh" "$HERE/out/video.mp4" "$HERE/out/mix.wav" "$HERE/klima-portal.mp4" 24 0           # 9. mezcla final a −14 LUFS
node core/render/still.mjs "$HERE" 3.4 --size 1080x1920 --out "$HERE/out/poster" && cp "$HERE/out/poster/t_3.4.jpg" "$HERE/poster.jpg"
