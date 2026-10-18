# El portal del martes: proyecto del vídeo

Promo de Klimafacturas para Instagram (1080×1920, 24 fps, unos 53 s). Está hecho con la skill Lemo-Opuscar,
estilo «Sci-Fi Sitcom Toon». Todo es código: imagen en Canvas 2D, música y efectos sintetizados, y voces generadas
por línea con Kokoro (de momento).

- `TREATMENT.md`: historia, planos, música y sonido; la sección 11 explica el gancho.
- `lines.json`: guion. Por cada línea: id, quién habla, texto, subtítulo con *palabras clave* y voz.
- `main.js`: línea de tiempo y planos. `VO` va en tiempo de historia; el gancho dura `OFF` s y los desplaza todos.
- `chars.js`: personajes. `worlds.js`: el bar, el portal y el papel. `toon.js`: motor de la librería, en vertical.
- `voice.py`: procesado de las voces y labios. `asr.py`: comprobación con Whisper. `music/score.py`: partitura.
  `mix.py`: mezcla. `subs.py`: subtítulos .srt. `mux_local.sh`: montaje final a −14 LUFS.
- `build.sh`: reconstruye todo.

## Seguir en una sesión nueva (cambiar las voces a ElevenLabs)

1. Copia esta carpeta fuera del repo (por ejemplo a `~/klima-portal`) y prepara la librería:
   `git clone --depth 1 https://github.com/lemomo-ai/lemo-opuscar ~/lemomo-ai/lemo-opuscar`. Después crea su
   `.venv` con `requirements.txt` y `requirements-voice.txt`. El navegador de Playwright está bloqueado en estos
   equipos, así que usa `PLAYWRIGHT_CHROME=/opt/pw-browsers/chromium_headless_shell-*/chrome-linux/headless_shell`.
2. Genera cada línea de `lines.json` con ElevenLabs (MCP) y guárdala como `out/raw/<id>.wav`. Después:
   `voice.py` (labios y procesado) y `asr.py` (comprobación; hace falta un Whisper local de sherpa-onnx).
3. Las duraciones cambian: reajusta `VO` y `HVO` en `main.js` para que no se pisen las frases. Los planos van
   atados a esos tiempos.
4. `sh build.sh` desde la librería, con `LIB` apuntando a ella.
