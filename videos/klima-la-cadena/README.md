# La cadena: proyecto del vídeo

Reel de Klimafacturas para Instagram (1080×1920, 30 fps, 32 s). No lleva voz: lo cuentan los rótulos, la música y los
efectos, así que se entiende igual sin sonido. Es una sola toma, sin cortes, sobre la idea de la portada de la web:
cada factura sale sellada con su huella SHA-256 y encadenada a la anterior, así que ya no se puede tocar. Todo es
código: la imagen en Canvas 2D, y la música y los efectos sintetizados. Los fotogramas, los eventos, el control de
lectura y el montaje salen de las herramientas de Lemo-Opuscar (MIT).

- `TREATMENT.md`: las tres ideas y la elegida, la hoja de ritmo, la cámara, el aspecto y el sonido.
- `cadena.py`: calcula las huellas de las cinco facturas con SHA-256 de verdad, con el mismo esquema que la cinta de
  la web, y las guarda en `chain.json`.
- `timeline.js`: la única fuente de verdad del tiempo. Contiene los golpes (`T`), las claves de cámara (`CAM`) y los
  rótulos (`CAPTIONS`).
- `world.js`: el mundo, colocado sobre la K del logo (la cadena es el asta, y las tarjetas van en el brazo y la
  pierna), y los encuadres de cámara.
- `main.js`: la toma entera. Tiene la cámara (la mano del operador, el asentamiento al llegar y las pausas quietas),
  el obturador real (cada fotograma en movimiento es la media de varios instantes), el orden de dibujo y los eventos
  de sonido.
- `paper.js`: el papel térmico, las facturas, la huella, el sello de lacre y el cabezal de la impresora.
- `cards.js`: las tarjetas de cobro con Bizum, contabilidad y Hacienda.
- `fx.js`: las ondas de choque, los contadores que ruedan, el fallo de señal, el rebobinado y la chispa.
- `lib.js`: curvas, muelles y texto.
- `mix.py`: la música, los efectos, la sala y la mezcla. Lleva un limitador de pico real y deja la mezcla a −14 LUFS.
  Con `MIX_DIAG=1` dice dónde están los picos y cuánto pesa cada bus; con `MIX_STEMS=1` guarda las pistas sueltas.
- `mux_local.sh`: el montaje final.
- `build.sh`: reconstruye todo.
- `fonts/`: IBM Plex Sans, IBM Plex Mono y Fraunces, con sus licencias OFL.
- `img/`: la foto de la portada y el logotipo.
- `poster.jpg`: la portada del reel (el fotograma de 0,42 s).

No se suben los archivos que se regeneran: el vídeo, la mezcla y los fotogramas de revisión.

## Reconstruirlo

1. Copia esta carpeta fuera del repo, porque `build.sh` deja el vídeo y la mezcla dentro de ella. Después clona la
   librería: `git clone --depth 1 https://github.com/lemomo-ai/lemo-opuscar /home/user/lemomo-ai/lemo-opuscar`. Crea
   su `.venv` con `requirements.txt`; la mezcla solo necesita numpy, scipy y soundfile.
2. Ejecuta `sh build.sh`. Hace la cadena, los eventos, el control de lectura, la mezcla, la imagen y el montaje, y deja
   el vídeo en `la-cadena.mp4`. Si la librería está en otra carpeta, pásala con `LIB=…`. El navegador de Playwright
   está bloqueado en estos equipos, así que `build.sh` usa el Chromium de `/opt/pw-browsers`; si cambia su versión,
   pásalo con `PLAYWRIGHT_CHROME=…`.

Para cambiar un tiempo, toca `timeline.js` y vuelve a ejecutar `build.sh`: la cámara, los rótulos y los sonidos van
atados a esos tiempos. El control de lectura avisa si algún rótulo no dura lo bastante para leerlo.
