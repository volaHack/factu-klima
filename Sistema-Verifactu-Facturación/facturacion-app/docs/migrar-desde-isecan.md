# Pasar una empresa de ISECAN a Klimafacturas

ISECAN «exporta a Excel» cada tabla como un **texto separado por tabuladores** en Windows-1252, con extensión
`.xls`, una primera línea `Consulta1` y los importes entre comillas con el euro (`"1,79 €"`). El importador
(`/importar`) lo lee tal cual desde octubre de 2026: no hace falta abrirlo en Excel ni convertirlo.

Las facturas antiguas **no** se pasan como facturas (ver la cabecera de `src/lib/importar/importar.ts`): se
quedan emitidas en ISECAN. Lo que sí se trae es su **historial de consulta**; ver «El histórico» al final.

## Qué tabla va a dónde

| Tabla de ISECAN | En Klimafacturas | Cómo |
|---|---|---|
| Familias | Categorías de producto (`company_settings.custom_categories`) | Una categoría `custom_isecan_<Codigo>` por familia. La 0 («Sin Definir») es la categoría `otros`. |
| Artículos | Productos | `/importar`. La columna de familia (el número) se enlaza sola con `custom_isecan_<n>`. |
| Clientes | Contactos | `/importar`. El código (cuenta `430…`) va al campo **Código** del cliente. |
| Tarifas | Tarifas (`company_settings.tarifas`) | Una tarifa por `idTarifa`, con id `isecan_<n>`. |
| Precios | Precio de cada producto en cada tarifa (`products.tarifa_prices`) | Uno por artículo y tarifa. Ver abajo. |
| PreciosClientes | Precios especiales del cliente (`clients.precios_especiales`) | Por artículo: precio fijo y/o descuento. |
| PreciosClientes2 | Descuentos por familia del cliente (`clients.descuentos_familia`) | Por familia: descuento. |
| FormasPago | Forma de pago de cada cliente | Ver la tabla de abajo. |

## Columnas que no se usan

- `Registro`, `Check`, `Numero_Serie`, `CRC` (en todas las tablas): control interno de ISECAN.
- Familias: `Margen` y `Observaciones` (vacías en lo visto hasta ahora).
- FormasPago: `Cuenta` (570 caja, 572 bancos, 555 partidas pendientes) y `SII` (clave de medio de cobro: 1
  transferencia, 2 cheque, 3 no se cobra, 4 otros, 5 domiciliación). Klimafacturas las pone solo.

## Valores que conviene saber

- **Booleanos**: ISECAN guarda Sí como `-1` y No como `0` (en FormasPago, `Pagare` vale `-1` sólo en «Pagaré»).
  Por eso un `Activo = 0` en PreciosClientes se lee como **apagado**: se importa con `activo: false` y se
  enciende desde la ficha del cliente (botón «Encender las … apagadas») cuando la empresa confirma que siguen
  en vigor.
- **Precios con 0 €**: en `Precios`, un 0 en una tarifa es «sin precio en esa tarifa» (el artículo se cobra a su
  precio base). En `PreciosClientes`, precio 0 con descuento es «sólo descuento» sobre la tarifa del cliente.
- **Códigos raros** en `Precios` (`*`, `+`, `**`, `0`, `DIF PRECIOS PORTE`): artículos genéricos (varios, portes,
  diferencias de precio). Se miran con la tabla de artículos antes de crearlos.
- La tarifa con el precio más alto suele ser la general (PVP); la más baja, presente en casi todos los artículos,
  puede ser el **coste**: confirmarlo con la empresa antes de usarla como tarifa de venta.

## Trampas de la exportación

- **Observaciones partidas**: cada línea de un campo largo sale en una fila aparte, en la misma columna, con el
  resto vacío y sin `Registro`. El importador las vuelve a unir a la ficha de arriba (`unirFilasPartidas`).
  Ahí suelen venir las condiciones de cobro («30 dias relacion mensual», «Fecha Cobro Fact.: 20») y la
  sucursal, que coincide con el `Nombre_Comercial`.
- **Marcas internas** en las observaciones: `[O=n]` (y su errata `[0=n]`) no aportan nada. `[NC]`, `[RC]` y
  `[P=…]` no están documentadas: se dejan en la nota tal cual.
- **«Borrado en el Programa Anterior»** en las observaciones de un artículo: viene de la migración anterior a
  ISECAN. Sin precio ni existencias, no merece la pena pasarlo.
- **Códigos de barras** guardados como número: salen en notación científica (`8,4125E+12`) y ya no se pueden
  recuperar. Hay que volver a exportar esa columna como texto. Los que salen bien se comprueban con su dígito
  de control; los UPC de 11 cifras han perdido el 0 inicial.
- **Códigos postales** guardados como número: los de provincias que empiezan por 0 salen con 4 cifras
  (`8025` → `08025`).
- **Tipos de IGIC** antiguos en artículos dados de baja: el 6,5 % y el 13,5 % de 2019 hoy son el 7 % y el 15 %.
  Los que la empresa usa (por ejemplo 5, 15 o 20) se ponen en Ajustes → tipos de IGIC para que salgan en las
  facturas.
- **Mismo NIF en varias fichas**: son tiendas de una misma cadena. Se agrupan en *Grupos y cadenas*.
- **Pseudo-artículos** «RETENCION n %»: en Klimafacturas la retención se aplica con el módulo de IRPF.

## Formas de pago

Klimafacturas tiene seis: transferencia, efectivo, domiciliación, pagaré, tarjeta y Bizum.

| ISECAN | Klimafacturas |
|---|---|
| Efectivo | efectivo |
| Tarjeta | tarjeta |
| Transferencia, Abono Transferencia | transferencia |
| Pagaré, Abono Pagaré | pagaré |
| Domiciliación Bancaria | domiciliación |
| 30 Días (Relación Mensual) | transferencia a 30 días |
| TRANSFERENCIA 60 DIAS | transferencia a 60 días |
| Crédito, Cheque, Vale, Concurso Acreedores | preguntar a la empresa |
| Devolución, Cobro, Pago, Cambio Inicial, Entrada Anterior, NO COBRO | movimientos de caja: no se pasan |

## Cómo se aplican los precios especiales

`condicionesDeVenta` (`src/lib/documentos.ts`) al elegir el artículo en una venta. Manda lo más concreto:

1. Precio especial del cliente para el artículo (sustituye a la tarifa y a los descuentos de su ficha).
2. Descuento del cliente para el artículo, sobre su tarifa.
3. Descuento del cliente para la familia del artículo, sobre su tarifa.
4. Su tarifa y los descuentos de su ficha.

## El histórico (Cabeceras, Bases, Pagos, Relaciones)

Estas cuatro tablas son los documentos ya emitidos en ISECAN: **solo cabeceras**, sin líneas de artículo. No
pueden entrar en `invoices`: el trigger de Veri*Factu les crearía un registro pendiente de enviar a la AEAT,
contarían en los modelos y en la contabilidad, y no se podrían borrar. Van a `historico_documentos`
(migración 068), que solo se consulta: en la ficha de cada cliente o proveedor sale «Historial en ISECAN» con
las facturas por año, la última factura, lo que quedó sin facturar y la lista de documentos.

| Tabla de ISECAN | En `historico_documentos` |
|---|---|
| Cabeceras | Un documento por fila, según `Tipo` (ver `Tipos.txt`): 13 factura de venta, 12 albarán de venta, 10 pedido de venta, 8 factura de compra, 7 albarán de compra. El resto (entradas y salidas de almacén, regularizaciones, inventarios) no se pasa. |
| Bases | `bases`: base y cuota por tipo de IGIC. La suma cuadra con `Impuestos` y `Total` de la cabecera. |
| Pagos | `forma_pago`: la descripción de su `idFormaPago` en FormasPago. Es la forma de pago del documento, **no** un cobro: ISECAN deja `Pagado` a cero, así que de aquí no se sabe qué está cobrado. |
| Relaciones | `pasa_a`: el documento posterior (`Tipo_D2` → `Tipo_D1`). Un albarán sin nada no llegó a facturarse. |

- De los pedidos solo se pasan los que no llegaron a nada: los demás ya están en su factura.
- `[FI=dd/mm/aaaa]` en Observaciones es una marca interna de ISECAN y se quita.
- `idProveedorCliente` es el código del contacto: se enlaza con la ficha por el campo **Código**.

