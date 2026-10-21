# ¿Quién sale antes? (plano secuencia): proyecto del vídeo

Anuncio de Klimafacturas para Instagram (1080×1920, 24 fps, 53 s), versión 2. Un concurso de televisión contado en
una sola toma, sin cortes, con una ronda extra en collage editorial de papel. Está hecho con la librería
Lemo-Opuscar, estilo «Game Show Flat». Todo es código: imagen en Canvas 2D, música y efectos sintetizados, y voces
generadas por línea con Kokoro.

- `TREATMENT.md`: historia, pruebas, cámara, collage y sonido. La sección 0 cuenta lo nuevo de la versión 2.
- `lines.json`: guion. Por cada línea: id, quién habla, texto, subtítulo y voz.
- `timeline.js`: la única fuente de verdad del tiempo. Contiene las voces (`VO`), las pruebas, las claves de cámara
  (`CAM`) y los momentos clave.
- `main.js`: el plató entero, la cámara (encuadres, la mano del operador, el asentamiento al llegar, las pausas
  quietas) y los eventos de sonido.
- `collage.js`: la pantalla gigante y el collage de la ronda extra. `halftone.py`: pasa las capturas de
  `collage/*.png` a semitono, en `collage/ht/`.
- `kit.js`, `chars.js`, `ui.js`: formas y rótulos, personajes y la interfaz del programa que se ve en el móvil.
- `voice.py`: procesado de las voces y bocas. `asr.py` y `asr_final.py`: comprobación con Whisper (cada frase sola
  y dentro de la mezcla final). `mix.py`: partitura, efectos, público, sala y mezcla. `subs.py`: subtítulos .srt.
  `mux_local.sh`: montaje final a −14 LUFS.
- `build.sh`: reconstruye todo.

No se suben los archivos que se regeneran: el vídeo, la mezcla, las pistas sueltas y los fotogramas de revisión.

## Seguir en una sesión nueva (cambiar las voces a ElevenLabs)

1. Copia esta carpeta fuera del repo (por ejemplo a `~/klima-plano`). Después clona la librería y prepárala:
   `git clone --depth 1 https://github.com/lemomo-ai/lemo-opuscar ~/lemomo-ai/lemo-opuscar`, y crea su `.venv`
   con `requirements.txt` y `requirements-voice.txt`. El navegador de Playwright está bloqueado en estos equipos,
   así que usa `PLAYWRIGHT_CHROME=/opt/pw-browsers/chromium_headless_shell-*/chrome-linux/headless_shell`.
2. Genera cada línea de `lines.json` con ElevenLabs y guárdala como `out/raw/<id>.wav`. Lanza las peticiones de dos
   en dos: más a la vez chocan con el límite de peticiones. Hace falta un plan con licencia comercial (Starter o
   superior); el audio del plan gratuito no se puede usar en un anuncio. Después ejecuta `voice.py` (procesado y
   bocas) y `asr.py` (comprobación).
3. Las duraciones cambian. Reajusta `VO` en `timeline.js` para que no se pisen las frases y mueve las claves de
   `CAM` que toque: la cámara va atada a esos tiempos. Después pasa `readcheck`.
4. Ejecuta `sh build.sh` con `LIB` apuntando a la librería, saltándote el paso 1 (las voces de Kokoro), que
   sobrescribiría `out/raw`.
