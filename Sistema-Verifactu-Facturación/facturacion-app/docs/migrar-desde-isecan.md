# Pasar una empresa de ISECAN a Klimafacturas

ISECAN «exporta a Excel» cada tabla como un **texto separado por tabuladores** en Windows-1252, con extensión
`.xls`, una primera línea `Consulta1` y los importes entre comillas con el euro (`"1,79 €"`). El importador
(`/importar`) lo lee tal cual desde octubre de 2026: no hace falta abrirlo en Excel ni convertirlo.

Las facturas antiguas **no** se pasan (ver la cabecera de `src/lib/importar/importar.ts`): se quedan en ISECAN.

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
