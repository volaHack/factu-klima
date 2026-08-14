# Backlog — ERP Verifactu (facturación + compras + almacén + cobros)

Fecha: 2026-08-14. Origen: lista de requisitos aportada por el usuario.

Estado de cada bloque: `existe` / `parcial` / `nuevo`. Antes de implementar un
bloque se escribe su plan en `docs/plans/` siguiendo el flujo habitual.

---

## 1. Ficha de cliente

| Requisito | Estado |
|---|---|
| Forma de pago del cliente | `existe` (`Client.defaultPaymentMethod`) |
| Tarifa del cliente (qué tarifa tiene) | `nuevo` |
| Vendedor suyo en la ficha del cliente | `nuevo` |
| Descuento del cliente (3 en línea) | `nuevo` |
| Relación de documentos del cliente (facturas entre fechas xx/xx/xxxx y xx/xx/xxxx) | `nuevo` |

## 2. Producto

| Requisito | Estado |
|---|---|
| Código de barras | `existe` (`Product.barcode`) |
| Referencia del proveedor | `nuevo` |
| Varios precios unitarios (tarifas) | `nuevo` |
| Precio de última compra | `nuevo` |
| Precio medio de compra | `nuevo` |
| Guardar en la línea de venta no solo el precio de venta sino el coste que tiene el producto en ese momento | `nuevo` |
| Rentabilidad por producto, por familia o de todos los productos juntos | `nuevo` |
| Histórico de producto con extracto | `nuevo` |

## 3. Documentos y flujo

Flujo: `presupuesto → pedido → albarán → factura → factura rectificativa`.

| Requisito | Estado |
|---|---|
| Presupuestos (clientes) | `nuevo` |
| Pedidos (clientes) | `nuevo` |
| Albaranes de venta | `existe` |
| Facturas | `existe` |
| Facturas rectificativas | `nuevo` |
| Albaranes de compra (proveedores) | `nuevo` |
| Pedidos a proveedores | `nuevo` |
| Facturas de compra a proveedores | `nuevo` |
| Rectificativas a proveedores | `nuevo` |
| Proveedores: todo menos presupuesto | `nuevo` |
| Conversión presupuesto → albarán | `nuevo` |
| Presupuesto y pedido NO descuentan stock | `nuevo` |
| Pendiente de recibir (proveedor) y pendiente de entregar (clientes) | `nuevo` |
| Número de serie de los documentos | `existe` (por empresa) |
| Vendedores: cada uno tiene su serie | `nuevo` |
| Descuentos: 3 en línea de documento + 3 al final de documento | `nuevo` |
| Descuento en la ficha del cliente (3 en línea) | `nuevo` |

## 4. Almacenes y stock

| Requisito | Estado |
|---|---|
| Varios almacenes y varias localizaciones | `nuevo` |
| Opción de un solo almacén, stock por almacén | `nuevo` |
| El vendedor puede tener su almacén o ninguno | `nuevo` |
| Traspaso entre almacenes | `nuevo` |
| Regularizaciones de mercancía | `nuevo` |
| Entradas y salidas del almacén | `nuevo` |
| Listado de inventario por almacén o todos juntos (listado de stock) | `nuevo` |

## 5. Cobros y pagos

| Requisito | Estado |
|---|---|
| Apartado Cobros y Pagos: cobrar facturas a clientes y pagar a proveedores | `nuevo` |
| El cobro es un documento más con fecha, serie y número, y refleja lo que te ha pagado | `nuevo` |

## 6. Fiscalidad

| Requisito | Estado |
|---|---|
| Porcentaje de IGIC decimal | `parcial` (tasas configurables `igicRates: number[]`; falta validar selector y Verifactu/impresión con 2 decimales en el tipo) |

## 7. Costes

- Precio medio ponderado (confirmado por el usuario):

  `PM_nuevo = (stock × PM_actual + cantidad_entrada × precio_entrada) / (stock + cantidad_entrada)`

- Regla de negocio importante: el usuario **no introduce las facturas de compra
  antes que las de venta**. El programa debe poder calcular a posteriori el
  precio medio y los costes que ya se guardaron en las ventas realizadas
  (recalcular sobre el histórico).

- Ejemplo validado (coste + rentabilidad): PM = 11 €, se venden 100 uds →
  coste guardado 1.100 €; venta de 2.000 € → rentabilidad 900 €.

---

## Criterios de diseño transversales

- Las tarifas/precios múltiples deben convivir con el modelo actual de
  `Product.unitPrice` sin romper TPV ni plantillas.
- Serie por vendedor: generalizar el patrón actual de series por empresa
  (`invoiceSeries`, `tpvSeries`, `albaranSeries`…) a un modelo por entidad.
- Los documentos de un flujo (presupuesto → … → rectificativa) deben poder
  referenciarse entre sí como ya hacen albarán ↔ factura (`invoiceId`).
