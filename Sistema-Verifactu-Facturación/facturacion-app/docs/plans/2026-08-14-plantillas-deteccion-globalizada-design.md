# Diseno - Plantillas de factura: deteccion globalizada, columnas personalizadas y reordenado (2026-08-14)

## Origen

Tras el ciclo anterior (plantillas con campos manuales, tabla adaptativa, cliente
ocasional), el usuario pidio el "resultado perfecto" para el flujo de plantillas:

1. **Eliminar los datos del PDF de muestra** y poder **reemplazar todos los datos
   aunque las casillas difieran** (hoy, un dato detectado sin clave no se borra y
   el numero/cliente de la muestra se cuela en todas las facturas).
2. **Deteccion globalizada**: las facturas varian mucho (cajas de pago fuera de
   la tabla, precios unitarios, formas de pago, desglose de impuestos...). Todo
   lo que se detecte debe pedirse como dato en `/facturas/nueva` para rellenar la
   tabla sin complicaciones.
3. **Columnas de la tabla reordenables** arrastrando (arriba/abajo) ademas de
   repartir el ancho con los separadores, "que funcione perfecto".

## Acuerdo de alcance (2026-08-14)

- **Deteccion por reglas + catalogo extenso** (sin IA): corregir los fallos
  encontrados en el diagnostico y ampliar diccionarios, con tests de regresion
  sobre los PDFs reales del usuario.
- **Columnas personalizadas editables**: una columna del PDF sin clave conocida
  se asigna a `custom_col_N`, se puede editar por linea en `/facturas/nueva` y
  en el editor de facturas. Requiere ampliar `InvoiceLineItem`.
- **Limpieza en blanco por defecto**: toda caja detectada como dato se limpia
  del calco; solo lo marcado explicitamente como "Texto fijo" se conserva.
- PDFs de prueba: `C:/Users/volit/Downloads/Sucamosa 4 - 26003239.pdf`
  (factura de supermercado con IGIC, pagos fuera de tabla, tablas multicolumna)
  y `C:/Users/volit/Downloads/modelo-de-factura.pdf` (modelo oficial con
  campos vacios y retenciones).

## Diagnostico (evidencia sobre los 2 PDFs)

Se ejecuto la deteccion real (`extraerPagina` + `detectar`, shims de Node en
`__detect2.test.ts`, temporal) sobre ambos PDFs. Fallos encontrados:

| # | Fallo | PDF | Evidencia |
| --- | --- | --- | --- |
| A | La tabla se detecta **sin lineas de ejemplo** (critico) | ambos | `buscarMarco` toma el borde inferior de la cabecera como pie de la tabla: Sucamosa `fin=80.1` (1a fila en y=89), modelo `fin=111.5` (filas en y=124/139.7). El guard `fin-inicio<4` no lo rechaza. En modelo la raya real del pie (y~145) queda a 33.5mm -> supera `SALTO_MAXIMO=26`. |
| B | Toma la **etiqueta de al lado como valor** | ambos | `doc_fecha="CLIENTE"`, `total_impuestos="CAJAS"` (Sucamosa); `doc_numero="POBLACION DEL CLIENTE:"`, `doc_fecha="N.I.F./C.I.F DEL CLIENTE:"`, `total_impuestos="RETENCIONES"` (modelo). El vecino se acepta sin verificar que tenga forma de dato; en cabeceras de 2 lineas el dato esta debajo, y en plantillas el campo esta vacio. |
| C | **N.o de documento mal detectado** | Sucamosa | `doc_numero="35510"` (el CP del cliente) en vez de `26 / 26003239`, que quedo sin asignar. |
| D | **Nombres truncados / bloques mal repartidos** | Sucamosa | `empresa_nombre="ROGAR"` (falta "DISTRIBUCIONES", tomado como direccion); `cliente_nombre="SUCAMOSA 4"` (falta "DISTRIBUCIONES"). Salto vertical de 4.8mm entre lineas del nombre supera la tolerancia de agrupacion. |
| E | **Datos de pago no detectados** | Sucamosa | `Detalle de Pagos: 30 Dias (Relacion Mensual) / 169,78 / ORIGINAL` -> nada: ni forma de pago, ni vencimiento, ni "ORIGINAL". |
| F | Columnas **SIN clave** en la tabla | ambos | Sucamosa: `CAJ. U/C UDES. RECIO` -> 4 columnas sin clave (RECIO deberia ser precio). Modelo: `CODIGO SIG` no mapea a `ref`. |
| G | **Dato de muestra sin clave no se borra** | ambos | `zonasABorrar` filtra `c.clave` (analisis.ts:71-72): un dato sin asignar (el n.o de documento, los importes sueltos, etc.) sobrevive al calco y se imprime en todas las facturas. |

## 1. Tabla: corregir "sin lineas de ejemplo"

### 1.1 `buscarMarco` (deteccion.ts)

El borde inferior de la fila de cabecera (banda gris en Sucamosa, borde de celda
en modelo) se confunde con el pie de la tabla. Regla nueva:

- Si `debajo[0]` esta **pegado a la cabecera** (`debajo[0] - abajo(cabecera) < 3mm`)
  y **no hay mas rayas** en los siguientes ~40mm, es la raya de la cabecera ->
  devolver `null` (tabla sin marco; la altura la fija el texto).
- Si hay mas rayas a distancia razonable (<= `SALTO_MAXIMO`), son filas/el pie
  reales -> usar el marco con normalidad.
- El guard existente `fin - inicio < 4` se mantiene.

Esto arregla ambos PDFs: Sucamosa y modelo pasan a capturar sus filas por texto.

### 1.2 Fin de tabla sin marco: ampliar `RE_FIN_DE_TABLA`

Con el marco descartado, el cuerpo de la tabla en Sucamosa llega hasta el
desglose de impuestos. Ampliar `RE_FIN_DE_TABLA` con `impuesto`, `igic`, `cuota`,
`base imp` para cortar ahi (la fila "IMPUESTO BASE IMP. % CUOTA CAJAS
SUBTOTAL:" corta la tabla; el bloque I.G.I.C. no entra en las lineas).

### 1.3 Continuacion de celda de descripcion ("GRS 14 UNDS")

Una linea suelta debajo de una fila, en la franja x de la descripcion, sin forma
de dato, es la continuacion de la celda anterior (no una fila nueva). Se ignora
para el recuento de filas pero no debe romper la captura.

## 2. Asociacion etiqueta -> valor fiable

La heuristica "texto a la derecha de la etiqueta" debe validar el vecino:

1. **El vecino debe tener forma de dato compatible** con la clave: fecha -> parece
   fecha; importe -> parece importe; numero de documento -> parece numero/ocupa
   posicion de cabecera. Si la etiqueta pide `doc_numero` y el vecino es
   `CLIENTE` (una etiqueta), se rechaza.
2. **Si el vecino es a su vez una etiqueta conocida** (normalizar y comparar
   contra `ETIQUETAS`/`RE_ROTULO_*`), nunca es el valor.
3. **Si a la derecha no hay valor valido, mirar la linea siguiente** en la misma
   columna (cabeceras de 2 lineas: FECHA encima, dato debajo).
4. Si tampoco -> sin asignar + aviso "El dato no se ha encontrado; asignalo en
   la lista de campos".

## 3. Catalogo globalizado

### 3.1 Tipos de documento y serie

- `doc_tipo`: `FACTURA VENTA`, `FACTURA`, `ALBARAN`, `TICKET`, `PRESUPUESTO`,
  `RECTIFICATIVA`, `FACTURA RECTIFICATIVA` (la fila que encabeza la cabecera de
  columnas "FACTURA VENTA | FECHA | CLIENTE").
- Reconocer la **cabecera de documento de varias columnas** (Sucamosa): una fila
  de etiquetas (FACTURA VENTA / FECHA / CLIENTE) y debajo la fila de valores
  (26/26003239 / 12/08/2026 / 4300000092). Cada valor se asigna a la etiqueta
  de su columna. Prioridad alta sobre "parece numero en cabecera" (arregla el
  fallo C y descarta el CP como numero de documento).

### 3.2 Formas de pago, vencimiento y estado (fallo E)

- Catalogo de formas de pago: `CONTADO`, `30 DIAS`, `TRANSFERENCIA`,
  `DOMICILIACION`, `TARJETA`, `EFECTIVO`, `RECIBO`, `VENTA A CREDITO`,
  `RELACION MENSUAL`, con variantes (`N dias`, `a N dias`).
- `doc_forma_pago`: el texto al lado de "Detalle de Pagos" / "Forma de pago"
  que coincida con el catalogo -> se guarda la frase legible
  ("30 Dias (Relacion Mensual)").
- `doc_vencimiento`: una forma "N Dias" en zona de pagos -> vencimiento relativo
  (se rellena con la frase; si el documento tiene fecha de vencimiento real, la
  ganadora es la fecha).
- `doc_estado`: `ORIGINAL`, `DUPLICADO`, `COPIA` (palabra en zona de totales/pagos).

### 3.3 Cabeceras de columna (fallo F)

- Anadir a `CABECERAS_COLUMNA`: `recio|rec\.?` -> `precio` (RECIO truncado de
  PRECIO); `sig` -> `ref` ("CODIGO SIG"); `caj\.?|cajas|uds\.?|u/c` -> quedan sin
  clave conocida (-> columna personalizada, seccion 4). No forzar claves
  erroneas: si dos columnas mapearian a `cantidad`/`precio`, la duplicada pasa
  a personalizada.

### 3.4 Bloques de direccion (fallo D)

En `agruparBloques`/asignacion de emisor/cliente:

- **Continuacion de nombre**: una linea sin palabras de direccion/ciudad,
  pegada verticalmente (tolerancia ampliada) y en la misma columna que el
  nombre -> forma parte del nombre. (Sucamosa: "ROGAR" + "DISTRIBUCIONES";
  "SUCAMOSA 4" + "DISTRIBUCIONES".)
- La primera linea con keyword de direccion (calle, c/, avda, poligono...) es la
  direccion; el nombre nunca es "DISTRIBUCIONES" si hay otra linea que sea la
  direccion real.
- Poblacion = linea CP+ciudad (ya funciona: "35000 LAS PALMAS").
- Reglas nuevas solo si no rompen los tests existentes de deteccion.

## 4. Columnas personalizadas (`custom_col_N`)

### 4.1 Modelo de datos

- `types.ts`: `InvoiceLineItem.customCols?: Record<string, string>` (claves
  `custom_col_N`, valores en texto).
- `storage.ts`: `buildInvRow` y `mapLineItemFromDb` pasan `custom_cols` de cada
  linea (jsonb; sin migracion de esquema, vive dentro de la columna de lineas).

### 4.2 Contrato (contrato.ts)

- `clavesValidas()` acepta cualquier clave `custom_col_\d+`.
- Helper `esColumnaPersonalizada(clave)` y, en el selector, las opciones
  `custom_col_N` se generan dinamicamente.

### 4.3 Editor (RevisorPlantilla.tsx)

- En el selector "Contenido de la columna" se anade la opcion
  "- Columna personalizada -": genera `custom_col_<n>` (n siguiente libre) y la
  cabecera editable mantiene el rotulo del PDF.
- La columna personalizada se comporta como el resto: ancho por separador,
  alineacion, reordenado y borrado.
- `__columnas` ya persiste la clave; `columnasDePlantilla` (plantilla.ts:523) ya
  la lee. `generar.ts` ya usa `linea[columna]` -> sin cambios.

### 4.4 Formulario de factura (`/facturas/nueva` y editar)

- Por cada columna de la plantilla con clave `custom_col_*`, la fila de lineas
  muestra un `<input>` extra con el rotulo de la columna como placeholder.
- Estado en `linea.customCols` (inicializado vacio al crear lineas desde
  productos; precargado al editar).
- `datos.ts` (`construirDatos`): `lineas[i][clave] = linea.customCols?.[clave] ?? ''`.
- Los albaranes comparten `InvoiceLineItem` -> heredan el soporte.

## 5. Reordenado de columnas + reparto de ancho

### 5.1 Reordenado en el panel "Columnas de las lineas"

- Cada fila del panel gana un asidero de arrastre que reordena `tabla.columnas`
  con **HTML5 drag & drop nativo** (sin libreria nueva; el repo no usa una y
  native DnD es suficiente y accesible).
- Botones subir/bajar alternativos para accesibilidad.
- Al reordenar se usa la funcion `recolocar` existente: las columnas vuelven a
  ser contiguas desde `tabla.x` manteniendo el ancho de cada una en su nueva
  posicion (los separadores del canvas se dibujan desde `x`/`ancho`, asi que
  el lienzo refleja el orden al instante).

### 5.2 Reparto de ancho "perfecto"

- Ancho minimo por columna (~6mm) en el arrastre del separador del canvas: no
  dejar colapsar una columna a 0.
- Tooltip en cada separador con el ancho en mm (izquierda/derecha).
- Doble clic en un separador: reparte a partes iguales el ancho entre las dos
  columnas vecinas.

## 6. Limpieza "en blanco por defecto"

- `zonasABorrar` (analisis.ts:70): borrar todo campo detectado como dato aunque
  no tenga clave: `!c.fijo && (c.clave || pareceDato(c.valorOriginal ?? ''))`.
- Los "Texto fijo" marcados por el usuario se conservan tal cual.
- Efecto: el n.o de documento, importes sueltos y demas datos sin asignar
  desaparecen del calco (fallo G); si el usuario luego asigna la clave en el
  revisor, se rellenan con el dato real.
- Anadir aviso cuando queden campos borrados sin clave: "Hay X datos borrados
  sin asignar; si quieres que se rellenen, asignalos en la lista de campos."

## 7. Tests de regresion sobre los PDFs reales

El test temporal `__detect2.test.ts` se mantiene durante la implementacion y se
evalua con criterios de aceptacion por PDF (los PDFs no se suben al repo; el
test salta si no existen en `~/Downloads`):

- **Sucamosa**: tabla con filas detectadas (>= 10) y columnas
  ref=CODIGO, descripcion, precio=RECIO, impuesto_pct=IGIC, importe_total=TOTAL;
  `doc_numero`="26 / 26003239"; `doc_fecha`="12/08/2026";
  `doc_forma_pago` incluye "30 Dias"; `doc_estado`="ORIGINAL"; `doc_tipo`=
  "FACTURA VENTA"; `empresa_nombre`="ROGAR DISTRIBUCIONES";
  `cliente_nombre`="SUCAMOSA 4 DISTRIBUCIONES"; `cliente_nif`="B35045590".
- **modelo**: tabla con las 2 filas de ejemplo; columnas cantidad, descripcion,
  precio, importe; "CODIGO SIG" -> `ref` o personalizada; y **ningun** valor de
  `doc_*` debe ser una etiqueta ("POBLACION DEL CLIENTE:", etc.).
- Ambos: el calco no debe contener ningun dato de muestra sin asignar (se borra).

## Fuera de alcance (este ciclo)

- Deteccion por IA.
- Imagenes, marcas de agua, firma electronica, QR Veri*Factu.
- Restauracion de la tabla desde una plantilla guardada (el revisor siempre
  parte de un PDF subido; `columnasDePlantilla` ya lee las claves guardadas).
- Soporte de albaranes en `BotonDescargarPdf` (heredan el soporte de columnas,
  pero no se trabajan los documentos de albaran en este ciclo).

## Archivos afectados

| Archivo | Cambio |
| --- | --- |
| `src/lib/plantillas/deteccion.ts` | `buscarMarco`, `RE_FIN_DE_TABLA`, asociacion etiqueta-valor, catalogo (tipos/pagos/vencimiento/estado/cabeceras), bloques de direccion |
| `src/lib/plantillas/analisis.ts` | `zonasABorrar` (borrar datos sin clave) + aviso |
| `src/lib/plantillas/contrato.ts` | `clavesValidas` acepta `custom_col_*`, helper `esColumnaPersonalizada` |
| `src/lib/plantillas/datos.ts` | rellenar columnas personalizadas por linea |
| `src/components/plantillas/RevisorPlantilla.tsx` | opcion columna personalizada, reordenado por arrastre, anchos minimos y tooltips |
| `src/lib/types.ts` | `InvoiceLineItem.customCols` |
| `src/lib/storage.ts` | pasar `custom_cols` en `buildInvRow`/`mapLineItemFromDb` |
| `src/app/(app)/facturas/nueva/page.tsx` | inputs de columnas personalizadas por linea |
| `src/app/(app)/facturas/[id]/editar/page.tsx` | precarga de columnas personalizadas |
| `src/lib/plantillas/deteccion.test.ts` | tests de nuevos catalogos y reglas |
| `src/lib/plantillas/__detect2.test.ts` | temporal: regresion sobre los PDFs reales (se borra al terminar) |
