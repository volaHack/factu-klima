#!/bin/sh
# Reconstruye «¿Quién sale antes?» de cero: sh build.sh
# Necesita la librería Lemo-Opuscar (LIB) con sus dependencias (setup.sh deps voice), el Whisper small de
# sherpa-onnx para las comprobaciones (ruta en asr.py) y, en este equipo, el Chromium de /opt/pw-browsers.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
LIB=${LIB:-/home/user/lemomo-ai/lemo-opuscar}
export LIB
export PLAYWRIGHT_CHROME=${PLAYWRIGHT_CHROME:-/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell}
[ -f "$LIB/core/render/video.mjs" ] || { echo "set LIB to the library folder"; exit 1; }
PY="$LIB/.venv/bin/python"
cd "$LIB"
$PY core/tts/tts.py "$HERE/lines.json" "$HERE/out/raw"                          # 1. voces con Kokoro
$PY "$HERE/voice.py"                                                             # 2. voz de cada personaje y bocas
$PY "$HERE/halftone.py"                                                          # 2b. recortes del collage en semitono
python3 "$HERE/asr.py"                                                           # 3. comprobación de cada frase (Whisper local)
node core/render/events.mjs "$HERE" --size 1080x1920                             # 4. línea de tiempo → events.json
node core/render/readcheck.mjs "$HERE" --size 1080x1920                          # 5. tiempo de lectura de cada rótulo
$PY "$HERE/subs.py"                                                              # 6. subtítulos .srt
$PY "$HERE/mix.py"                                                               # 7. partitura + efectos + público + voces
node core/render/video.mjs "$HERE" --fps 24 --workers 4 --size 1080x1920 --out "$HERE/out/video.mp4"   # 8. imagen
sh "$HERE/mux_local.sh" "$HERE/out/video.mp4" "$HERE/out/mix.wav" "$HERE/quien-sale-antes.mp4" 24 0  # 9. −14 LUFS
python3 "$HERE/asr_final.py" "$HERE/quien-sale-antes.mp4"                        # 10. la voz se entiende en la mezcla final
node core/render/still.mjs "$HERE" 2.78 --size 1080x1920 --out "$HERE/out/poster" && cp "$HERE/out/poster/t_2.78.jpg" "$HERE/poster.jpg"
