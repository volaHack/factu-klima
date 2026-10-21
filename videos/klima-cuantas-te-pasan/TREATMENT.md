# «¿Cuántas te pasan?» — tratamiento

Reel vertical para Instagram (1080×1920, 30 fps, 62 s) de Klimafacturas. Sin voz: lo cuentan las tarjetas, los rótulos,
la música y los efectos, así que funciona igual con el sonido quitado. Una sola toma: la cámara nunca corta.

## Método

Sigue el mismo método que «La cadena»: una toma con cámara de operador, golpes que se arrastran de uno al siguiente,
pausas quietas, obturador real y sonido en una sola sala. Está **escrito desde cero**: onetake tiene licencia PolyForm
Noncommercial, que no permite el uso comercial, y esto es un anuncio, así que de onetake no se usa ni código, ni
scripts, ni plantillas, ni aspectos, ni sonidos. El motor de fotogramas, eventos, control de lectura y montaje es el de
Lemo-Opuscar (licencia MIT); la cámara, el obturador y los efectos vienen de «La cadena».

## 1. La idea

Treinta dolores de cabeza de quien lleva un negocio, y lo que hace Klimafacturas con cada uno. El gancho es un juego:
«30 cosas que odias de llevar un negocio. ¿Cuántas te pasan?». Quien lo ve cuenta las suyas mientras pasan, y al final
la pregunta vuelve («¿Cuántas te pasaban?») con la respuesta: «Ya ninguna». Es una lista, que es lo que más se guarda y
se comparte en Instagram, y deja una pregunta a la que se contesta con un número en los comentarios.

Cada solución es una función que el programa tiene hoy (sección 4). No se promete nada que esté en «Próximamente»: el
banco conectado por open banking, por ejemplo, no sale; sí sale la conciliación subiendo el extracto, que funciona.

## 2. El mundo

- **El tablero.** Seis bloques, uno por capítulo (Cobrar, Hacienda, Papeleo, Errores, Gestoría, Día a día), cada uno
  una pila de cinco tarjetas, un poco girados, como papeles clavados en una pared. La cámara gira con cada bloque para
  verlo derecho y salta de uno a otro en zigzag, separándose un poco a mitad de camino para que se vea que es el mismo
  tablero.
- **Las tarjetas.** Cara A: el dolor, en el papel térmico de la cinta de la web (con su raíl rosa en el margen), su número
  y una ✕. Cara B: la solución, en el rosa de la marca, con el dolor tachado encima y una ✓. Giran con perspectiva de
  verdad (se dibujan en franjas) y se levantan un poco al girar.
- **La chispa** del logo hace de dedo: toca cada ✕ y la tarjeta gira. Al final vuelve a su sitio en el logo.
- **El contador** de cartel (fichas que caen) cuenta las resueltas: de 00/30 a 30/30.
- **El final.** Las 30 tarjetas vuelan y forman el logo: cada capítulo es una columna y cada dolor una fila. La marca está
  hecha, literalmente, de los treinta problemas resueltos.

## 3. Hoja de ritmo (120 BPM; el compás 1 cae en 0,5 s; cada capítulo, cuatro compases)

| t | qué pasa | sonido |
|---|---|---|
| 0–0,5 | las 30 tarjetas caen desde arriba; «30 cosas que odias de llevar un negocio.» ya en pantalla (es la portada) | subida, revuelo de papel |
| 0,5 | **golpe**: aterrizan, desordenadas, formando el tablero | golpe grave, papel |
| 1,1 | «¿Cuántas te pasan?» y el contador a 00/30 | clac de ficha |
| 3,75–4,5 | la cámara se mete en el primer bloque | aire |
| 4,5–52,5 | seis capítulos de 8 s: llega la cámara; las cinco tarjetas se ponen derechas, una por pulso; tres pulsos después, la chispa las va tocando y cada una gira (el contador sube); un golpe propio; látigo al siguiente | una vuelta de acordes por capítulo; cada giro, una nota de un arpegio que sube |
| 8,5 | Cobrar: tampón de «PAGADA» | golpe y madera |
| 16,5 | Hacienda: cae el lacre de la web («Registro sellado · SHA-256 · Cadena íntegra») | golpe, campana |
| 23,5–25 | Papeleo: el visor y el flash de la foto del ticket; tres hojas (PDF, Excel, ticket) se las traga el buzón | obturador, aire |
| 28,4–28,9 | Errores llega con fallo de señal y las tarjetas en rojo; a los 32,5 un barrido verde lo comprueba todo | la música llega rota; barrido |
| 40,5 | Gestoría: el bloque se balancea como una balanza y se queda recto cuando encaja «DEBE = HABER» | crujido, clic |
| 46,2 | Día a día: el láser del lector pasa por «Colas en la caja» | pitido del TPV |
| 48,0 | **la 30 no gira: el contrato se rompe** y debajo está «Sin permanencia»; el contador llega a 30/30 | papel rasgado, campanas |
| 52,5–54,5 | **pausa quieta**: el tablero entero, resuelto; «¿Cuántas te pasaban?» | golpe grave y casi silencio |
| 54,5–56,3 | las 30 vuelan y forman el logo; «Ya ninguna.» | subida, clics de fichas |
| 56,5 | **logo**: se cierran los huecos y la chispa aterriza en su esquina | golpe, sol mayor |
| 57–62 | Klimafacturas · Cumple Verifactu · Sin permanencia · Crear cuenta · klimafacturas.com; quieto desde 59,6 | campanas y acorde final |

Cada texto pasa el control de lectura de Lemo-Opuscar (caracteres ÷ 15 + 1,5 s): el dolor se ve desde que llega la
cámara hasta que se va (unos 7 s, porque después de girar sigue tachado encima de la solución) y la solución, de 3,4 a
5,4 s.

## 4. Los 30, y de dónde sale cada solución

| nº | dolor | solución | en el programa |
|---|---|---|---|
| 1 | «Te pago la semana que viene.» | Recordatorios que salen solos | Recordatorios de cobro: uno por cliente, y se mandan solos cada mañana si el correo del servidor está configurado |
| 2 | Reclamar factura por factura | Un aviso por cliente, ya escrito | Recordatorios de cobro: el texto ya escrito con todas sus facturas; por correo o WhatsApp |
| 3 | No saber quién te debe | Quién debe y desde cuándo | Tesorería y cobros; «Para hoy» del Panel (facturas vencidas y desde cuándo) |
| 4 | «¿Me pasas el número de cuenta?» | Paga con tarjeta o Bizum | Cobro online: la factura sale con su enlace de pago (Stripe; Bizum, si está activado en la cuenta de Stripe) |
| 5 | Apuntar a mano lo que cobras | Se marca pagada sola | Cobro online: al pagar, la factura queda pagada |
| 6 | «¿Mi programa cumple Verifactu?» | Cumple Verifactu | Huella SHA-256 encadenada, QR de cotejo y envío a la AEAT |
| 7 | Miedo a una inspección | Todo sellado y encadenado | Registro inalterable; Integridad (informe descargable) |
| 8 | Gastarte el dinero del IVA | Cuánto apartar, al día | Ficha «Apartar para Hacienda» del Panel (estimación con 303/420 y 130) |
| 9 | Que se te pase el plazo | Aviso con los días que quedan | «Para hoy»: «Presentar el IVA del trimestre · quedan N días» |
| 10 | Hacer los modelos a mano | 303, 130, 347… preparados | Listados fiscales: 303, 130, 111, 347, 349, 390, 190, 131, 420, 415, 425 |
| 11 | Facturas en Word o Excel | Factura sellada en 2 minutos | La web: «La primera factura sellada te lleva dos minutos» |
| 12 | La misma factura cada mes | Facturas que se repiten solas | Facturas recurrentes («Repetir»: cada mes, trimestre o año) |
| 13 | Teclear otra vez el presupuesto | Presupuesto a factura, en un clic | Documentos: «Facturar» en un presupuesto (y en un albarán) |
| 14 | Tickets de gasto que se pierden | Una foto y se rellena solo | Gastos: la IA lee la foto del ticket y deja el gasto relleno para revisar |
| 15 | Facturas de proveedores por todas partes | Un buzón que las lee por ti | Bandeja de facturas de proveedores: PDF, fotos o reenviadas al correo del buzón |
| 16 | Un NIF mal escrito | NIF comprobado antes de emitir | Letra de control, coherencia NIF–nombre y consulta al censo de la AEAT |
| 17 | Un tipo de IVA que no existe | Te avisa en la propia línea | Aviso en la línea («Usar el 21 %» / «Usar el 7 %») y pregunta al emitir |
| 18 | Sumas que no cuadran | Cuadrado al céntimo | Cálculos del programa; informes fiscales cuadrados al céntimo |
| 19 | Saltos en la numeración | Numeración correlativa, sola | Series con el número siguiente automático |
| 20 | Una factura mal emitida | Rectificativa en un clic | «Rectificar» en el documento; Abonos y devoluciones |
| 21 | Llevar papeles a la gestoría | Tu gestoría entra y lo ve | Panel de la gestoría: entra con su cuenta y ve los libros en solo lectura (si la invitas) |
| 22 | Teclear facturas en la contabilidad | La contabilidad se hace sola | Contabilidad automática (PGC): un asiento por factura, gasto, cobro y venta |
| 23 | Cuadrar el banco a mano | Subes el extracto y lo empareja | Conciliación bancaria: extracto Norma 43 o CSV, cada movimiento con su pareja propuesta |
| 24 | Nóminas y préstamos, cada mes | Se apuntan solos | Apuntes periódicos (nóminas, amortizaciones, préstamos) |
| 25 | No saber si ganas dinero | Resumen del mes en tu correo | Resumen del mes por correo, el día 1, con gráficas |
| 26 | Se cae internet y no cobras | Sigues cobrando sin conexión | Modo sin conexión (base de datos local y cola de sincronización) |
| 27 | Colas en la caja | TPV con lector y atajos | TPV: lector de códigos, atajos F1–F5, ticket simplificado, arqueo |
| 28 | Cambiar de programa da pereza | Importas clientes y productos | Importar clientes o productos de otro programa |
| 29 | Empleados que tocan de más | Cada uno ve lo que le toca | Equipo: perfiles titular, empleado y cajero, cada uno con sus pantallas |
| 30 | Contratos con permanencia | Sin permanencia | Planes sin permanencia |

## 5. Cámara

Claves con curva: deriva lenta con la mano del operador dentro de cada capítulo, látigo con salto (la cámara se separa a
mitad de camino) entre bloques, y giro de cámara para ver cada bloque derecho. Al llegar se pasa un pelo y se asienta.
Pausas quietas de verdad en el tablero resuelto y en el cierre. Obturador real de 180° (de 1 a 13 muestras por
fotograma, según lo que se mueva).

## 6. Aspecto

- Fondo vino oscuro (#1b0910 → #3a1420) con brillo rosa y retícula de puntos con paralaje.
- Papel térmico #f8f1e9 con su trama y el raíl rosa; rosa de la marca #b02a5c para lo resuelto; tinta #1a1216.
- Tipografía: IBM Plex Sans en negrita para todo y Plex Mono para números y etiquetas. Sin la palabra suelta en cursiva
  rosa: la web la quitó como tic de plantilla, así que aquí el acento es de color (rosa = resuelto), no de fuente.
- Logo: el cuadrado tinta con la K papel y la chispa #c9407a, tal cual el SVG de la app.
- Zona segura de Instagram: nada importante por encima de 230 px ni por debajo de 1580 px; las tarjetas acaban en
  x ≈ 907, lejos de la columna de botones.

## 7. Sonido

Pista electrónica sintetizada a 120 BPM en mi menor (mi menor, do, sol, re: una vuelta por capítulo) que acaba en sol
mayor cuando se forma el logo. Cada tarjeta que gira toca una nota de un arpegio que sube (si, do, mi, sol, do): el sonido
de «resuelto». Efectos de pocos materiales (papel, madera, cristal, golpe grave, aire) en una misma sala. Errores entra
con la música troceada; antes del logo, casi silencio. Mezcla a −14 LUFS.

## 8. Notas

- Bizum en el enlace de pago: Stripe lo admite en España desde mayo de 2026 y el programa no fija los métodos de pago,
  así que sale si está activado en la cuenta de Stripe del negocio.
- «Cuánto apartar» es una estimación (lo dice la propia ficha).
- Las facturas, importes y nombres que se ven son de ejemplo.
