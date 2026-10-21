# «Una sola toma»: reel de agencia (26 s, en bucle)

Un plató en miniatura de verdad, en 3D (three.js): mesa de roble con luz de atardecer que entra por una ventana, claqueta,
tira de película de 35 mm, doce fichas de dominó y un móvil. Una sola toma de cámara, sin cortes, explica las tres
reglas del plano secuencia y pide comentar «VÍDEO». Al final la cámara se mete en la pantalla del móvil, que enseña el
primer fotograma: el bucle no se nota.

Para que no parezca «hecho con IA», la imagen sale como de una cámara: render HDR, obturador de 180° (desenfoque de
movimiento), profundidad de campo según la distancia de enfoque (bokeh real del fondo), aberración cromática leve,
curva ACES, grano y viñeta. Las fichas caen con su geometría: cada una toca a la siguiente y nunca la atraviesa. La
cámara usa curvas monótonas: no frena en cada clave.

- `main.js`: la escena, la cámara, la cadena de imagen y los rótulos (`render(t)` es función pura de t).
- `mix.py`: piano de fieltro, pad y escobillas en re mayor; la claqueta y la última ficha caen en compás.
- `build.sh`: reconstruye el vídeo de cero. Motor de render: Lemo-Opuscar (MIT).
