# ¿Cuántas te pasan?: proyecto del vídeo

Reel de Klimafacturas para Instagram (1080×1920, 30 fps, 62 s). No lleva voz: lo cuentan las tarjetas, los rótulos, la
música y los efectos. Es una sola toma, sin cortes: treinta dolores de cabeza de quien lleva un negocio, en seis
capítulos de cinco, y cada uno resuelto por una función que el programa tiene de verdad. Al final las 30 tarjetas vuelan
y forman el logo. Todo es código: la imagen en Canvas 2D, y la música y los efectos sintetizados. Los fotogramas, los
eventos, el control de lectura y el montaje salen de las herramientas de Lemo-Opuscar (MIT).

- `TREATMENT.md`: la idea, el mundo, la hoja de ritmo, los 30 con de dónde sale cada solución, la cámara, el aspecto y
  el sonido.
- `data.js`: los 30 dolores y sus soluciones, por capítulos. Para cambiar un texto, se cambia aquí.
- `timeline.js`: la única fuente de verdad del tiempo. Contiene cuándo empieza cada capítulo, cuándo se ordena y gira
  cada tarjeta, los golpes (`T`), las claves de cámara (`CAM`) y los rótulos (`CAPTIONS`).
- `world.js`: el tablero (seis bloques girados), dónde cae cada tarjeta, el logo que forman al final y los encuadres.
- `cards.js`: las tarjetas (cara del dolor, cara de la solución y su trozo del logo), el giro con perspectiva y el
  contrato que se rompe.
- `pieces.js`: los golpes de cada capítulo: el tampón de «PAGADA», el lacre, las hojas del buzón y las etiquetas.
- `main.js`: la toma entera. Tiene la cámara (la mano del operador, el salto entre bloques, el asentamiento al llegar y
  las pausas quietas), el obturador real, la chispa, el contador, el gancho y el cierre, y los eventos de sonido.
- `lib.js` y `fx.js`: curvas, muelles, texto, ondas de choque, fichas de cartel, fallo de señal y la chispa.
- `mix.py`: la música (120 BPM, mi menor que acaba en sol mayor), los efectos, la sala y la mezcla a −14 LUFS.
- `mux_local.sh`: el montaje final. `build.sh`: reconstruye todo.
- `fonts/`: IBM Plex Sans e IBM Plex Mono, con sus licencias OFL.
- `poster.jpg`: la portada del reel.

No se suben los archivos que se regeneran: el vídeo, la mezcla y los fotogramas de revisión.

## Reconstruirlo

1. Copia esta carpeta fuera del repo, porque `build.sh` deja el vídeo y la mezcla dentro de ella. Después clona la
   librería: `git clone --depth 1 https://github.com/lemomo-ai/lemo-opuscar /home/user/lemomo-ai/lemo-opuscar`. Crea
   su `.venv` con `requirements.txt`; la mezcla solo necesita numpy, scipy y soundfile.
2. Ejecuta `sh build.sh`. Hace los eventos, el control de lectura, la mezcla, la imagen y el montaje, y deja el vídeo en
   `cuantas-te-pasan.mp4`. Si la librería está en otra carpeta, pásala con `LIB=…`. El navegador de Playwright está
   bloqueado en estos equipos, así que `build.sh` usa el Chromium de `/opt/pw-browsers`; si cambia su versión, pásalo
   con `PLAYWRIGHT_CHROME=…`.

Si cambias un texto en `data.js`, vuelve a pasar `build.sh`: el control de lectura avisa si alguno no se ve el tiempo
suficiente para leerlo.
