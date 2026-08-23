'use client';

import React, { useState } from 'react';
import { Plus, Trash2, Percent, ChevronDown, ChevronUp } from 'lucide-react';
import { InvoiceLineItem, CompanySettings, Product, Lote } from '@/lib/types';
import { unidadesTotales } from '@/lib/documentos';
import { formatCurrency } from '@/lib/utils';
import { recalcularLinea, lineaVacia, getPrecioProductoParaCliente } from '@/lib/documentos';
import { lotesDisponibles } from '@/lib/lotes';
import { vocabularioDe, conPlural } from '@/lib/vocabulario';
import TaxRateSlider from '@/components/ui/TaxRateSlider';

export interface ColumnaPersonalizada {
  clave: string;
  cabecera: string;
}

interface LineasDocumentoProps {
  lineItems: InvoiceLineItem[];
  onChange: (lines: InvoiceLineItem[]) => void;
  products: Product[];
  settings: CompanySettings;
  tarifaId?: string;
  defaultDiscounts?: [number, number, number];
  columnasCustom?: ColumnaPersonalizada[];
  /** Sin esto, el título lo pone el oficio de la empresa (ver `vocabularioDe`). */
  titulo?: string;
  /**
   * Los lotes de los productos que se controlan por lotes. Ausente o vacío =
   * ninguna línea enseña selector de lote, que es lo que corresponde a quien
   * no tiene el módulo encendido.
   */
  lotes?: Lote[];
}

export default function LineasDocumento({
  lineItems,
  onChange,
  products,
  settings,
  tarifaId,
  defaultDiscounts,
  columnasCustom = [],
  titulo,
  lotes = [],
}: LineasDocumentoProps) {
  const [showExtraDiscounts, setShowExtraDiscounts] = useState(false);
  // Las palabras de este oficio. Un distribuidor cuenta bultos y unidades;
  // un psicólogo, sesiones. Ver src/lib/vocabulario.ts.
  const voz = vocabularioDe(settings.sector);

  const handleProductSelect = (index: number, productId: string) => {
    const product = products.find(p => p.id === productId);
    const updated = [...lineItems];
    if (product) {
      const resolvedPrice = getPrecioProductoParaCliente(product, tarifaId, settings.tarifas);
      const d1 = updated[index].discountPercent || defaultDiscounts?.[0] || 0;
      const d2 = updated[index].discountPercent2 || defaultDiscounts?.[1] || 0;
      const d3 = updated[index].discountPercent3 || defaultDiscounts?.[2] || 0;

      updated[index] = recalcularLinea({
        ...updated[index],
        productId: product.id,
        productName: product.name,
        productRef: product.ref,
        unitPrice: resolvedPrice,
        unit: product.unit,
        taxRate: product.defaultTaxRate,
        // Las unidades por bulto vienen de la ficha del producto: se ponen
        // una vez y no hay que teclearlas en cada factura.
        unitsPerPackage: product.unitsPerPackage,
        // El lote de la línea anterior era del producto anterior: cambiar de
        // producto sin limpiarlo dejaría una venta de leche marcada con el
        // lote del yogur.
        loteId: undefined,
        loteCodigo: undefined,
        discountPercent: d1,
        discountPercent2: d2,
        discountPercent3: d3,
      });
    } else {
      updated[index] = recalcularLinea({
        ...updated[index],
        productId: '',
        productName: '',
        productRef: '',
        unitPrice: 0,
      });
    }
    onChange(updated);
  };

  const handleLineChange = (index: number, field: keyof InvoiceLineItem, value: unknown) => {
    const updated = [...lineItems];
    updated[index] = recalcularLinea({
      ...updated[index],
      [field]: value,
    });
    onChange(updated);
  };

  const handleCustomColChange = (index: number, clave: string, valor: string) => {
    const updated = [...lineItems];
    const item = updated[index];
    const customCols = { ...(item.customCols ?? {}), [clave]: valor };
    updated[index] = { ...item, customCols };
    onChange(updated);
  };

  const addLine = () => {
    const nueva = lineaVacia(settings);
    if (defaultDiscounts) {
      nueva.discountPercent = defaultDiscounts[0] || 0;
      nueva.discountPercent2 = defaultDiscounts[1] || 0;
      nueva.discountPercent3 = defaultDiscounts[2] || 0;
    }
    onChange([...lineItems, recalcularLinea(nueva)]);
  };

  const removeLine = (index: number) => {
    if (lineItems.length <= 1) return;
    onChange(lineItems.filter((_, i) => i !== index));
  };

  // Lo que se descarga del camión: doce cajas de veinticuatro son 288
  // botellas, y ese es el número que se comprueba contra el albarán.
  const totalUnidades = unidadesTotales(lineItems);
  const totalBultos = lineItems.reduce((s, l) => s + l.quantity, 0);
  const hasAnyExtraDiscount = lineItems.some(l => (l.discountPercent2 && l.discountPercent2 > 0) || (l.discountPercent3 && l.discountPercent3 > 0));

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <h3 className="card-title" style={{ margin: 0 }}>{titulo ?? voz.titulo}</h3>
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={() => setShowExtraDiscounts(!showExtraDiscounts)}
          style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <Percent size={13} />
          {showExtraDiscounts || hasAnyExtraDiscount ? 'Ocultar Dto. 2 y 3 en línea' : 'Mostrar hasta 3 dtos. en cascada'}
          {showExtraDiscounts || hasAnyExtraDiscount ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Una ficha por línea, no una rejilla de nueve columnas.
          
          Con los tres descuentos abiertos salían nueve columnas apretadas y
          había que ir contando cabeceras hacia arriba para saber qué era cada
          casilla. Cada campo lleva ahora su rótulo al lado, así que se lee sin
          buscar, y los campos se reparten solos cuando la pantalla es
          estrecha en vez de quedarse en una tira ilegible. */}
      <div className="lineas-doc">
        {lineItems.map((line, index) => {
          const uds = line.unitsPerPackage && line.unitsPerPackage > 0 ? line.unitsPerPackage : 0;
          return (
            <div className="lineas-doc-ficha" key={line.id}>
              <div className="lineas-doc-cabeza">
                <select
                  className="lineas-doc-producto"
                  value={line.productId}
                  onChange={e => handleProductSelect(index, e.target.value)}
                  aria-label={`Producto de la línea ${index + 1}`}
                >
                  <option value="">Seleccionar producto</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      [{p.ref}] {p.name} {p.supplierRef ? `(Ref Prov: ${p.supplierRef})` : ''}
                    </option>
                  ))}
                </select>
                <div className="lineas-doc-importe">{formatCurrency(line.subtotal)}</div>
                <button
                  type="button"
                  className="line-item-delete"
                  onClick={() => removeLine(index)}
                  disabled={lineItems.length <= 1}
                  aria-label={`Quitar la línea ${index + 1}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="lineas-doc-campos">
                <label className="lineas-doc-campo">
                  <span>{voz.cantidad}</span>
                  <input
                    type="number" min={0} step={0.01} value={line.quantity}
                    onChange={e => handleLineChange(index, 'quantity', parseFloat(e.target.value) || 0)}
                  />
                </label>

                {/* Unidades por bulto. Se hereda del producto y sólo se toca
                    cuando esta entrega viene en otro formato.

                    Sólo en los oficios que agrupan mercancía: preguntarle
                    «¿cuántas unidades por caja?» a quien factura sesiones de
                    fisioterapia no es que sobre, es que le hace dudar de si
                    tiene que rellenarlo. */}
                {voz.usaBultos && (
                  <label className="lineas-doc-campo">
                    <span title={`${voz.contenido[1]} por ${voz.bulto[0]}`}>{voz.bultoCorto}</span>
                    <input
                      type="number" min={0} step={1} placeholder="—"
                      value={line.unitsPerPackage || ''}
                      onChange={e => handleLineChange(index, 'unitsPerPackage', parseFloat(e.target.value) || 0)}
                    />
                  </label>
                )}

                {/* Sólo si el producto de esta línea tiene lotes con
                    existencias: para el resto de líneas —y para quien no
                    tiene el módulo encendido— no aparece nada. */}
                {lotesDisponibles(lotes, line.productId).length > 0 && (
                  <label className="lineas-doc-campo lineas-doc-campo--ancho">
                    <span>Lote</span>
                    <select
                      value={line.loteId ?? ''}
                      onChange={e => {
                        const lote = lotes.find(l => l.id === e.target.value);
                        handleLineChange(index, 'loteId', lote?.id);
                        handleLineChange(index, 'loteCodigo', lote?.codigo);
                      }}
                    >
                      <option value="">— Elegir lote —</option>
                      {lotesDisponibles(lotes, line.productId).map(l => (
                        <option key={l.id} value={l.id}>
                          {l.codigo} {l.fechaCaducidad ? `· cad. ${l.fechaCaducidad}` : ''} ({l.cantidadDisponible} disp.)
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <label className="lineas-doc-campo">
                  <span>Precio ud.</span>
                  <input
                    type="number" min={0} step={0.01} value={line.unitPrice}
                    onChange={e => handleLineChange(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                  />
                </label>

                <div className="lineas-doc-campo lineas-doc-campo--impuesto">
                  <span>{settings.igicEnabled ? 'IGIC' : 'IVA'}</span>
                  <TaxRateSlider compact value={line.taxRate} onChange={v => handleLineChange(index, 'taxRate', v)} />
                </div>

                <label className="lineas-doc-campo">
                  <span>Dto. %</span>
                  <input
                    type="number" min={0} max={100} step={0.5} placeholder="0"
                    value={line.discountPercent || ''}
                    onChange={e => handleLineChange(index, 'discountPercent', parseFloat(e.target.value) || 0)}
                  />
                </label>

                {(showExtraDiscounts || hasAnyExtraDiscount) && (
                  <>
                    <label className="lineas-doc-campo">
                      <span>Dto. 2 %</span>
                      <input
                        type="number" min={0} max={100} step={0.5} placeholder="0"
                        value={line.discountPercent2 || ''}
                        onChange={e => handleLineChange(index, 'discountPercent2', parseFloat(e.target.value) || 0)}
                      />
                    </label>
                    <label className="lineas-doc-campo">
                      <span>Dto. 3 %</span>
                      <input
                        type="number" min={0} max={100} step={0.5} placeholder="0"
                        value={line.discountPercent3 || ''}
                        onChange={e => handleLineChange(index, 'discountPercent3', parseFloat(e.target.value) || 0)}
                      />
                    </label>
                  </>
                )}

                {columnasCustom.map(col => (
                  <label className="lineas-doc-campo lineas-doc-campo--ancho" key={col.clave}>
                    <span>{col.cabecera}</span>
                    <input
                      value={line.customCols?.[col.clave] ?? ''}
                      onChange={e => handleCustomColChange(index, col.clave, e.target.value)}
                    />
                  </label>
                ))}
              </div>

              {/* Lo que de verdad se descarga del camión, dicho aquí para no
                  tener que multiplicarlo de cabeza. */}
              {voz.usaBultos && uds > 0 && (
                <p className="lineas-doc-pie">
                  {line.quantity} × {uds} = <strong>{line.quantity * uds}</strong> {voz.contenido[1]}
                </p>
              )}
            </div>
          );
        })}

        <div className="lineas-doc-suma">
          <button type="button" className="btn btn-ghost btn-sm" onClick={addLine}>
            <Plus size={14} /> Añadir {voz.linea}
          </button>
          {voz.usaBultos && totalUnidades > 0 && (
            <span className="lineas-doc-total-uds">
              {conPlural(totalBultos, voz.bulto)}
              {' · '}
              <strong>{totalUnidades}</strong> {voz.contenido[1]} en total
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
