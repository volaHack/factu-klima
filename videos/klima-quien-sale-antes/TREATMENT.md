# «¿Quién sale antes?» — tratamiento

## 0. Versión 2: plano secuencia y collage

La versión 1 contaba la historia con cortes (primer plano del presentador, plano general, mesa de Javier, móvil de
Lucía, cartel…). La 2 cuenta lo mismo **sin un solo corte**: todo el anuncio es una única toma dentro de un plató
que existe entero a la vez, y la cámara viaja por él.

- **El mundo.** El presentador tiene su marca a la izquierda; el concurso (atriles, puerta de SALIDA, marcador
  colgado del peine) ocupa el centro, que es exactamente el plano general de la versión 1; a la derecha hay una
  pantalla vertical gigante con marquesina de bombillas. Tres capas de profundidad: la pared se mueve al 60 %, el
  plató al 100 % y el público, delante, al 125 %. Eso da paralaje en cada movimiento.
- **El lenguaje de cámara.** *Empujón* (0,3–0,35 s) para entrar en Javier; *barrido* (0,35 s, con desenfoque de
  movimiento y un poco de inclinación) para cruzar a Lucía o al presentador; *vuelta al general* justo antes de
  cada veredicto. El zoom se interpola en escala logarítmica alrededor del punto fijo de los dos encuadres, de modo
  que cada movimiento se lee como un solo gesto. La cámara la lleva un operador: mientras se mueve, una mano que
  flota despacio; al llegar a un encuadre nuevo se pasa un pelo en la dirección en la que venía y se asienta
  (0,3 s); y en las pausas se queda **quieta del todo**, sin deriva ni temblor: en el móvil de Lucía (que es donde
  hay que leer), dentro del collage y en el cartel final. Son las pausas las que hacen que los golpes peguen; en el
  móvil Lucía también deja de botar.
- **Continuidad de verdad.** Lo que pasa en un plano sigue ahí en el siguiente. La torre de papeles que tiembla en
  el primer plano es la que se derrumba en el general. Los archivadores caen sobre Javier y siguen en el suelo hasta
  la noche. El monstruo-calendario se queda en el atril mordisqueando. El marcador baja del techo con el primer
  punto. La luz del plató cambia de color en cada prueba con un círculo que se abre desde el centro. El reloj de la
  puerta corre (09:00 → 15:00 cuando sale Lucía → 21:00 de noche).
- **El móvil de Lucía.** Ya no es otro plano: ella saca el móvil hacia la cámara, a su derecha, mientras la cámara
  se le acerca. La pantalla real del programa queda grande y su cara reacciona al lado.
- **Ronda extra = collage editorial.** La cámara barre hasta la pantalla gigante y se mete en ella. Dentro, la
  pantalla es un collage de papel con la gramática visual de darin-broll-skill: un campo de papel mostaza plano
  (sin degradados ni viñeta) con fibra de papel sin estucar; seis pantallas reales de Klimafacturas (TPV,
  presupuestos, factura electrónica, recordatorios de cobro, varias empresas y asistente con IA) impresas en
  semitono blanco y negro, con corte limpio, filete crema y sombra de papel suave; dos cartulinas de acento (teja
  bajo el TPV y verde petróleo bajo los presupuestos); tiras negras con el nombre de cada función, y un disco
  petróleo «y mucho más» con la voz. Se monta pieza a pieza desde el campo vacío, cada una con su gesto: el
  título entra deslizando cuando la cámara aterriza, el TPV cae desde arriba (más grande y con la sombra lejos
  mientras está en el aire), los presupuestos y las empresas entran por la derecha, la factura electrónica por la
  izquierda, recordatorios y asistente suben desde abajo y el disco se abre de golpe. Va a 12 fotogramas por
  segundo, como un stop-motion; cuando aterriza la última pieza, nada se mueve hasta que la cámara sale. Dos
  licencias que nos tomamos frente a la skill: lleva texto (las etiquetas; el anuncio tiene que nombrar las
  funciones) y usa pantallas reales (es el producto que se vende). Cada captura deja fuera su propio título, porque
  el título es la etiqueta. El semitono lo hace `halftone.py`: los grises de fondo pasan a trama a 45° de unos
  6 px en pantalla y la letra queda maciza, con un filo de papel limpio, para que se siga leyendo. Las capturas se
  hicieron en este equipo con el programa arrancado contra un Supabase simulado y datos inventados («Estudio
  Lucía», «Grupo Ribera SL»…); no se envió nada a ningún servicio ni a Hacienda.
- **Menos es más.** Sin confeti ni chispas (en la victoria basta el estallido y el «¡PERFECTO!»; el logo aterriza
  solo, sin fuegos). En el sonido, el collage suena a papel sobre papel (un chasquido seco con un golpe blando al
  aterrizar cada pieza, un roce para el título) en vez de un pitido por pieza, y todos los efectos comparten una
  misma sala (una respuesta al impulso de 0,9 s; los golpes grandes mandan más a la sala, los clics casi nada).
- **De dónde salen estas ideas.** El collage aplica el sistema visual de darin-broll-skill (licencia MIT). Lo de
  la cámara y el sonido sigue principios que describe la documentación de onetake (pausas quietas, asentamiento al
  llegar, sin confeti, una sola sala para los efectos), escritos desde cero en `main.js` y `mix.py`: onetake tiene
  licencia PolyForm Noncommercial, que no permite el uso comercial, así que de ella no se ha usado ni código, ni
  scripts, ni plantillas, ni sonidos.
- **El final ante el telón.** Los cinco trofeos salen del marcador y se funden en el logo; detrás cae un telón vino
  con flecos dorados, el público se sienta y los tres salen a saludar delante.
- **Voces.** Siguen las de Kokoro. Las de ElevenLabs quedaron bloqueadas: la cuenta gratuita se desactivó a mitad
  de la tanda y salieron 12 de 28 frases. Además, el audio del plan gratuito no tiene licencia comercial. Toda la
  cámara cuelga de la tabla de voces y de las claves de `CAM` en `timeline.js`, así que cambiar de voces es: generar,
  recolocar `VO` con las duraciones nuevas y mover las claves que toque.


Anuncio vertical (1080×1920, 24 fps, 53 s) de Klimafacturas en el estilo **Game Show Flat** de Lemo-Opuscar.
Voz y subtítulos en castellano. Público: autónomos y pymes de oficina (asesorías, consultoras, despachos,
distribuidoras), no hostelería.

## 1. Tres estructuras posibles

1. **El duelo por pruebas.** Un concurso de televisión: dos autónomos con el mismo trabajo, uno a mano y otra con
   Klimafacturas. Cinco pruebas = los cinco dolores reales (facturar, cobrar, gastos, trimestre, contabilidad).
   Cada prueba es llamada → acción → veredicto. Ronda extra con el resto del programa. Final: ella sale antes,
   él se pasa y también gana.
2. **Una sola ronda que se acelera.** Un día de Lucía como juego de ritmo: las tareas llegan en negras, luego en
   corcheas, luego en semicorcheas, y ella las despacha todas con el móvil. La aceleración es la trama.
3. **El marcador primero.** Se abre con el 5–0 y el «¡PERFECTO!» final y se cuenta hacia atrás cómo se ganó cada
   punto, como un boletín de notas.

**Elegida: la 1.** La comparación es la forma más clara de vender: quien mira se reconoce en Javier (el dolor) y ve
la salida en Lucía (el producto) cinco veces seguidas, con una función distinta en cada prueba. El duelo da
suspense, el marcador y los cinco huecos de trofeo dan sensación de progreso (se quiere ver el siguiente), y el
final tiene giro: el «rival» no queda humillado, se pasa. La 2 vende menos funciones con claridad; la 3 regala el
desenlace.

## 2. Logline y arco

Dos autónomos con el mismo trabajo compiten en un concurso por ver quién sale antes de la oficina; Lucía gana las
cinco pruebas con Klimafacturas y, cuando Javier se queda solo de noche, el presentador le presta el móvil.

- **Planteamiento (0–5 s):** el presentador grita a cámara; dos atriles; «¿QUIÉN SALE ANTES?»; campana.
- **Desarrollo (5–38 s):** cinco pruebas y una ronda extra.
- **Giro (38–44,5 s):** 5–0, Lucía se va por la puerta de SALIDA a las 15:00; silencio; Javier solo a las 21:00;
  el presentador sale por esa misma puerta con el móvil.
- **Final (44,5–53 s):** Javier pulsa y gana; los cinco trofeos se funden en el logo; «¿Y tú, a qué hora sales hoy?».

## 3. Gancho (los 3 primeros segundos)

1. **Ruptura de patrón con cara:** el primer fotograma es la cara del presentador gritando al micrófono, a pantalla
   completa, sobre un sol de rayos violeta, con el piloto rojo de «EN DIRECTO».
2. **Cambio visual en el primer segundo:** en 1,0 s la cámara salta atrás y aparecen los dos concursantes.
3. **Pregunta abierta en pantalla y en voz:** «¿QUIÉN SALE ANTES?» aterriza letra a letra en el segundo 2.
4. **Formato «A contra B»:** la gente elige bando en un segundo y se reconoce en uno de los dos.
5. **Recompensa rápida y promesa de más:** primer «¡PERFECTO!» en el segundo 9 y cinco huecos de trofeo que se llenan.
6. **Final que devuelve la pregunta:** «¿Y tú, a qué hora sales hoy?», que además invita a comentar.

## 4. Referencias (solo gramática)

- **Concursos de plató** (atriles con marcador, presentador con micrófono, público, rótulos): ritmo llamada-respuesta,
  cartel de prueba, veredicto de un vistazo. Ningún nombre, decorado, sintonía ni personaje de un programa real.
- **Juegos de ritmo y rótulos de variedades japoneses**: todo cae en la rejilla, veredicto grande e inclinado, fondos
  de rayas, puntos y soles.
- **Anuncios «a mano / con la app»**: la ventaja se enseña con la misma tarea a los dos lados. La única interfaz que
  sale es la de Klimafacturas, redibujada con sus colores y tipos reales (IBM Plex Sans, Fraunces, papel #FBF6F2,
  vino #B02A5C).

## 5. Reparto (un solo kit de muñeco de judía, en vector)

| Personaje | Color | Rasgos | Voz |
|---|---|---|---|
| **Presentador** | amarillo #FFD23F | esmoquin, pajarita, tupé, micrófono | Kokoro em_santa |
| **Lucía** | rosa #FF7EB0 | moño, gafas, americana vino | Kokoro ef_dora +1 st |
| **Javier** | celeste #6CCBF6 | corbata roja, pelo de punta, gotas de sudor | Kokoro em_alex +2 st |
| **Público** | caramelos variados | cabezas redondas | las tres voces apiladas |

## 6. Funciones que salen (todas comprobadas en el código del programa)

| Prueba | Javier | Lucía (pantalla real redibujada) | Veredicto |
|---|---|---|---|
| 1 · La factura | calculadora en «E»; la torre de papeles se le cae | Nueva factura → Emitir → FAC-2026-0042 con QR y sello Verifactu | ¡PERFECTO! |
| 2 · El cobro | «Hola… ¿me pagas ya?»; el cliente farfulla y cuelga | enlace de pago; aviso «Grupo Ribera ha pagado 1.210,00 € con Bizum»; Pagada | ¡COBRADA! |
| 3 · Los gastos | la caja de tickets tiembla; luego le estalla | foto del ticket; proveedor, base, IVA y total leídos de la foto; Guardado | ¡APUNTADO! |
| 4 · El trimestre | el calendario del día 20 se despierta y le muerde | «Para Hacienda este trimestre»: 303, 130 y «Apártalo ya 1.840,00 €» | ¡A TIEMPO! |
| 5 · La contabilidad | torre de archivadores que se le viene encima | libro diario (430/705/477 y 572/430), «Debe = Haber», «Gestoría García · solo lectura» | ¡CUADRADO! |
| Extra | — | TPV para tu tienda, Presupuestos, Factura electrónica, Recordatorios de cobro, Varias empresas, Asistente con IA | ¡Y ADEMÁS! |

Fuera: el banco conectado (está en «Próximamente») y cualquier precio o prueba gratis (no hay prueba gratuita). El
cierre dice «Sin permanencia», que es verdad.

## 7. Guion final (tiempo de entrada en segundos)

| t | Quién | Frase | Se lee en |
|---|---|---|---|
| 0,04 | Presentador | ¡Dos autónomos! ¡El mismo trabajo! | placa |
| 2,02 | Presentador | ¿Quién sale antes? | título |
| 3,25 | Presentador | ¡Primera prueba: una factura! | cartel de prueba |
| 5,10 | Javier | A ver… ¿cómo se hacía esto? | placa |
| 7,25 | Presentador | Con QR y Verifactu. | placa |
| 8,85 | Presentador | ¡Perfecto! | veredicto |
| 10,53 | Presentador | ¡Segunda prueba: cobrar! | cartel |
| 12,00 | Javier | Hola… ¿me pagas ya? | placa |
| 13,80 | Presentador | Pagan con tarjeta o con Bizum. | placa |
| 15,85 | Presentador | ¡Factura cobrada! | veredicto |
| 17,06 | Presentador | ¡Los gastos! | cartel |
| 17,95 | Presentador | Una foto, y el gasto se rellena solo. | placa |
| 20,35 | Presentador | ¡Apuntado! | veredicto |
| 21,55 | Presentador | ¡El trimestre! | cartel |
| 22,52 | Javier | ¿¡Ya es día 20!? | placa |
| 24,40 | Presentador | Sabe cuánto apartar para Hacienda. | placa |
| 26,35 | Presentador | ¡A tiempo! | veredicto |
| 27,55 | Presentador | ¡La contabilidad! | cartel |
| 28,70 | Presentador | Se hace sola, y su gestoría ya la tiene. | placa |
| 30,97 | Presentador | ¡Todo cuadrado! | veredicto |
| 32,05 | Presentador | ¡Y además: el TPV, presupuestos, factura electrónica… y mucho más! | pegatinas |
| 38,03 | Presentador | ¡5 a 0! ¡Lucía se va a casa! | placa |
| 40,62 | Lucía | ¡Hasta mañana! | placa |
| 42,47 | Presentador | Javier… ¿pruebas tú? | placa |
| 44,47 | Presentador | ¡Perfecto! | veredicto |
| 45,35 | Javier | ¡Anda! ¡Qué fácil! | placa |
| 47,55 | Presentador | ¡Klimafacturas! Factura, cobra… ¡y sal antes! | cartel final |
| 50,30 | Presentador | ¿Y tú? ¿A qué hora sales hoy? | cartel final |

## 8. Planos

| Tiempo | Plano | Movimiento | Por qué |
|---|---|---|---|
| 0–1 | Primerísimo plano del presentador | golpes de zoom en las sílabas fuertes | ruptura de patrón: una cara gritando a cámara |
| 1–5 | General de plató: dos atriles, público | frontal fijo; corte seco con destello | el duelo se entiende en un vistazo |
| por prueba | medio de Javier en su mesa | empuje lento | el dolor, en un gesto |
| por prueba | inserto del móvil de Lucía (entra desde abajo) | empuje lento; la manopla pulsa | la interfaz se tiene que leer |
| por prueba | general: veredicto y trofeo al hueco | golpe de zoom | recompensa y progreso |
| 10,5 y 21,5 | cartel de prueba a pantalla completa con el presentador | entra con rebote | cambia el ritmo dos veces |
| 32–38 | torre de pegatinas | caen una por corchea | escala: «todo esto también» |
| 38–41,5 | general: 5–0, Lucía sale por la puerta central | fijo | el premio es tiempo |
| 41,5–44 | general de noche, dos focos | casi inmóvil | el silencio antes del giro |
| 44–46,5 | medio de Javier con el móvil | golpe de zoom en el toque | el sonido más fuerte tras el silencio |
| 46,5–47,5 | **plano firma:** los cinco trofeos se funden en el logo | encogimiento a miniatura invertido | cinco soluciones = un programa |
| 47,5–53 | cartel final con los tres personajes | fijo | se lee la web y la pregunta |

## 9. Música y sonido (120 BPM, compás 0 en 1,0 s, I–vi–IV–V en Re mayor)

| Tramo | Sabor | Notas |
|---|---|---|
| 0–1 | solo la voz | sin redoble: «¡Dos autónomos!» limpio |
| 1–4,75 | groove de plató | platillo en el corte, redoble hacia la campana |
| 4,75–5 | **silencio** | medio tiempo antes de la campana |
| 5–10,5 | funk | bajo slap, metales a contratiempo |
| 10,5–17 | concurso | sintonía, marimba, bajo andante |
| 17–21,5 | electro | arpegio de onda cuadrada a semicorcheas |
| 21,5–27,5 | tensión (mayor) | sintonía, metales graves, redobles de toms |
| 27,5–32 | sueño | campanitas y colchón |
| 32–38 | premio | arpegios rápidos, cencerro, pips afinados de las pegatinas |
| 38–41,5 | pop | el tema del programa |
| 41,5–44,47 | **silencio** | solo el tic-tac del reloj y los pasos del presentador |
| 44,5–52 | pop un tono arriba | tutti; botón final en 52 |

Foley por acción: teclas de calculadora, «E» de error, toque del móvil, campanita y caja registradora del cobro,
farfulla del cliente y tono de colgado (425 Hz), traqueteo de la caja, obturador, ticks de los campos, gruñido y
mordisco del calendario, crujidos y alud de archivadores, campana de salida, golpe de veredicto y «ding» del
marcador, vuelo y llegada de cada trofeo (afinada por prueba), pasos, puerta, reloj, confeti. El público dice
«¡Ooooh!» y «¡Bieeen!» con las tres voces apiladas, más aplausos y murmullo.

Mezcla: cada bus con su limitador; niveles medios fijados respecto a la voz (música −4 dB, efectos −6, público −10)
y, bajo la voz, la música baja 11 dB más, los efectos 5 y el público 10. −14 LUFS, pico verdadero ≤ −1,5 dBTP.

## 10. Rótulos y subtítulos

- Fredoka 700 para el plató: blanco o amarillo con trazo de tinta por debajo del relleno y sombra dura.
- Los rótulos son los subtítulos: título, carteles de prueba y veredictos dicen lo que grita el presentador. Las
  frases explicativas y las de los personajes van en una placa crema abajo (y ≈ 1436–1540, dentro de la zona
  segura de Reels) con el punto del color de quien habla.
- Dentro del móvil, la tipografía del programa (IBM Plex Sans y Fraunces).
- Los veredictos se leen de un vistazo (STYLE.md §4) y no pasan por readcheck; todo lo demás sí.

## 11. Comprobaciones hechas

- Voz suelta: 28/28 frases transcritas con Whisper small local (asr.py).
- Voz dentro de la mezcla final: 28/28 (asr_final.py). Homófonos aceptados: «visum» = «Bizum» con seseo.
- Lectura: todos los rótulos pasan readcheck (lo justo es «Asistente con IA», 2,68 s de 2,43 s necesarios).
- Subtítulos: 20 entradas en el .srt, ninguna por debajo de 1,8 s (las frases cortas seguidas se unen).
- Sonoridad: −13,9 LUFS, pico verdadero −1,8 dBTP.
- Imagen: sin fotogramas negros ni congelados (blackdetect y freezedetect).
- «No es la demo otra vez»: la demo del estilo es la historia de la IA en horizontal con docenas de muñecos, abre
  con el reparto cayendo y una cuenta atrás, y cierra con un boletín de notas. Esta película difiere en estructura
  (duelo de dos), apertura (cara del presentador), plano firma (trofeos → logo), final (pregunta + los tres
  saludando) y formato (vertical con interfaz real). Comparten la rejilla y el kit del estilo, que es lo fijo.
