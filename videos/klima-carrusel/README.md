# Carrusel «30 cosas que odias de llevar un negocio»

Ocho láminas de 1080×1350 para Instagram que son una sola imagen panorámica: el raíl rosa, la chispa y las tarjetas
cruzan de una lámina a la siguiente, así que deslizar se siente como seguir una toma (carrusel continuo). Los textos
salen de `data.js`, los mismos 30 del reel «¿Cuántas te pasan?».

- `main.js`: pinta la panorámica entera y enseña la lámina `?s=0…7`.
- `laminas/`: las ocho láminas en JPEG, listas para publicar.

Para regenerarlas: `node core/render/still.mjs <esta carpeta> 0 --q "s=N" --size 1080x1350` con Lemo-Opuscar, una vez
por lámina.
