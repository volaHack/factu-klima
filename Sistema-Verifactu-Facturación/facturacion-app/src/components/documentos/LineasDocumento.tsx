'use client';

import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Percent, ChevronDown, ChevronUp, AlertTriangle, Tag, History } from 'lucide-react';
import { InvoiceLineItem, CompanySettings, Product, Lote, Client, Invoice } from '@/lib/types';
import { aLineaPorUnidades, cajasTotales, conCajas, conUdsCaja, conUnidades, explicarLinea, unidadesTotales, vaPorUnidades } from '@/lib/cajas';
import { tipoGeneral, tipoImpositivoRaro } from '@/lib/validation/lineas';
import { formatCurrency, formatDate } from '@/lib/utils';
import { getInvoices } from '@/lib/storage';
import { recalcularLinea, lineaVacia, condicionesDeVenta, condicionesDeCompra, preciosAnteriores, type PrecioAnterior } from '@/lib/documentos';
import { lotesDisponibles } from '@/lib/lotes';
import { vocabularioDe, conPlural } from '@/lib/vocabulario';
import TaxRateSlider from '@/components/ui/TaxRateSlider';
import BuscadorProducto from '@/components/productos/BuscadorProducto';

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
  /**
   * Las condiciones del cliente (precios especiales y descuentos por familia,
   * migración 067). Sólo en documentos de VENTA: en una compra la ficha es la
   * del proveedor y sus precios no son los nuestros.
   */
  cliente?: Pick<Client, 'preciosEspeciales' | 'descuentosFamilia'> | null;
  columnasCustom?: ColumnaPersonalizada[];
  /** Sin esto, el título lo pone el oficio de la empresa (ver `vocabularioDe`). */
  titulo?: string;
  /**
   * Los lotes de los productos que se controlan por lotes. Ausente o vacío =
   * ninguna línea enseña selector de lote, que es lo que corresponde a quien
   * no tiene el módulo encendido.
   */
  lotes?: Lote[];
  /** En una compra la línea toma el precio y el impuesto de compra de la ficha. */
  sentido?: 'venta' | 'compra';
  /**
   * La ficha del cliente o proveedor del documento: con ella cada línea
   * sugiere el precio que se le puso la última vez.
   */
  clienteId?: string | null;
  /** El documento que se edita, para no sugerir su propio precio. */
  documentoId?: string;
}

export default function LineasDocumento({
  lineItems,
  onChange,
  products,
  settings,
  tarifaId,
  defaultDiscounts,
  cliente,
  columnasCustom = [],
  titulo,
  lotes = [],
  sentido = 'venta',
  clienteId,
  documentoId,
}: LineasDocumentoProps) {
  const [showExtraDiscounts, setShowExtraDiscounts] = useState(false);
  // Las palabras de este oficio. Un distribuidor cuenta bultos y unidades;
  // un psicólogo, sesiones. Ver src/lib/vocabulario.ts.
  const voz = vocabularioDe(settings.sector);

  /**
   * Las casillas propias de cada línea.
   *
   * Manda la plantilla activa cuando trae columnas: son las que se
   * imprimen, y pedir unas y sacar otras dejaría huecos en el PDF. Cuando
   * no trae ninguna —una plantilla lisa, o ninguna todavía— se usan las
   * del oficio, para que un abogado tenga su expediente y un taller sus
   * horas de mano de obra desde el primer documento, sin esperar a
   * diseñar el impreso.
   */
  const columnas = columnasCustom.length > 0 ? columnasCustom : voz.columnasOficio;

  // CAJ. / U/C / UDES. en los oficios que venden por cajas (ver lib/cajas.ts).
  // Las casillas propias que la plantilla tuviera para cajas o U/C ya no se
  // piden aparte: son estas.
  const porCajas = voz.usaBultos;
  const columnasPropias = porCajas
    ? columnas.filter(c => !/^(caj|cajas|bultos?|u ?\/ ?c|uds?\.? ?\/ ?caja)\.?$/i.test(c.cabecera.trim()))
    : columnas;

  // Un borrador de antes (cantidad = cajas, precio por caja) se pasa a
  // unidades al abrirlo, sin cambiar lo que cuesta cada línea.
  const hayLineasDeAntes = porCajas && lineItems.some(l => !vaPorUnidades(l));
  useEffect(() => {
    if (hayLineasDeAntes) onChange(lineItems.map(l => (vaPorUnidades(l) ? l : recalcularLinea(aLineaPorUnidades(l)))));
  }, [hayLineasDeAntes, lineItems, onChange]);

  // Los documentos anteriores, para sugerir el último precio (vienen de la
  // copia de este dispositivo: no cuesta nada pedirlos).
  const [anteriores, setAnteriores] = useState<Invoice[]>([]);
  useEffect(() => {
    let vivo = true;
    getInvoices().then(d => { if (vivo) setAnteriores(d); }).catch(() => {});
    return () => { vivo = false; };
  }, []);

  /** Lo que se sugiere en la línea: lo último a esta ficha o, si no, lo último a cualquiera. */
  const sugerencia = (line: InvoiceLineItem): { p: PrecioAnterior; deEste: boolean } | null => {
    if (!line.productId) return null;
    const { cliente: deEste, ultimo } = preciosAnteriores(anteriores, line.productId, { clienteId, sentido, excluirId: documentoId });
    const p = deEste ?? ultimo;
    if (!p) return null;
    const igual = Math.abs(p.unitPrice - line.unitPrice) < 0.00005
      && p.descuentos[0] === (line.discountPercent || 0)
      && p.descuentos[1] === (line.discountPercent2 || 0)
      && p.descuentos[2] === (line.discountPercent3 || 0);
    return igual ? null : { p, deEste: !!deEste };
  };

  const aplicarPrecio = (index: number, p: PrecioAnterior) => cambiarLinea(index, l => ({
    ...l,
    unitPrice: p.unitPrice,
    discountPercent: p.descuentos[0],
    discountPercent2: p.descuentos[1],
    discountPercent3: p.descuentos[2],
  }));

  const NOMBRE_TIPO: Record<string, string> = { factura: 'factura', albaran: 'albarán', pedido: 'pedido', presupuesto: 'presupuesto' };

  const cambiarLinea = (index: number, cambio: (l: InvoiceLineItem) => InvoiceLineItem) => {
    const updated = [...lineItems];
    updated[index] = recalcularLinea(cambio(updated[index]));
    onChange(updated);
  };

  const handleProductSelect = (index: number, productId: string) => {
    const product = products.find(p => p.id === productId);
    const updated = [...lineItems];
    if (product) {
      // Precio y descuentos con las condiciones del cliente: su precio
      // especial, el descuento del artículo o el de la familia, y si no hay
      // nada de eso, su tarifa y los descuentos de su ficha (documentos.ts).
      // En una compra: el precio de compra de la ficha, sin las tarifas ni
      // los descuentos, que son los de nuestros clientes.
      const compra = sentido === 'compra' ? condicionesDeCompra(product) : null;
      const cond = compra
        ? { unitPrice: compra.unitPrice, descuentos: [0, 0, 0] }
        : condicionesDeVenta(product, { tarifaId, tarifas: settings.tarifas, defaultDiscounts, cliente });
      const [d1, d2, d3] = cond.descuentos;

      updated[index] = recalcularLinea({
        ...updated[index],
        productId: product.id,
        productName: product.name,
        productRef: product.ref,
        unitPrice: cond.unitPrice,
        unit: product.unit,
        taxRate: compra ? compra.taxRate : product.defaultTaxRate,
        // Las unidades por bulto vienen de la ficha del producto: se ponen
        // una vez y no hay que teclearlas en cada factura.
        unitsPerPackage: product.unitsPerPackage,
        // Por cajas: una caja de entrada si el producto tiene U/C (las
        // unidades salen solas); si no, unidades sueltas.
        ...(porCajas
          ? (product.unitsPerPackage && product.unitsPerPackage > 0
            ? { cajas: 1, quantity: product.unitsPerPackage }
            : { cajas: 0, quantity: updated[index].quantity > 0 ? updated[index].quantity : 1 })
          : {}),
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

  /** Qué condición de este cliente toca a este artículo, dicho en una frase. */
  const condicionEspecial = (productId: string): string | null => {
    const product = products.find(p => p.id === productId);
    if (!product) return null;
    const cond = condicionesDeVenta(product, { tarifaId, tarifas: settings.tarifas, defaultDiscounts, cliente });
    const pct = (n: number) => `${n.toLocaleString('es-ES')} %`;
    if (cond.origen === 'precio_especial') {
      return `Precio especial de este cliente: ${formatCurrency(cond.unitPrice)}${cond.descuentos[0] ? ` con un ${pct(cond.descuentos[0])} de descuento` : ''}`;
    }
    if (cond.origen === 'descuento_articulo') return `Este cliente tiene un ${pct(cond.descuentos[0])} de descuento en este artículo`;
    if (cond.origen === 'descuento_familia') return `Este cliente tiene un ${pct(cond.descuentos[0])} de descuento en esta familia`;
    return null;
  };

  const removeLine = (index: number) => {
    if (lineItems.length <= 1) return;
    onChange(lineItems.filter((_, i) => i !== index));
  };

  // Lo que se descarga del camión: doce cajas de veinticuatro son 288
  // botellas, y ese es el número que se comprueba contra el albarán.
  const totalUnidades = unidadesTotales(lineItems);
  const totalCajas = cajasTotales(lineItems);
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
          return (
            <div className="lineas-doc-ficha" key={line.id}>
              <div className="lineas-doc-cabeza">
                <BuscadorProducto
                  className="lineas-doc-producto"
                  products={products}
                  value={line.productId}
                  onSelect={id => handleProductSelect(index, id)}
                  ariaLabel={`${voz.linea} de la línea ${index + 1}`}
                  placeholder={`Buscar ${voz.linea}: referencia, nombre o código`}
                />
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
                {porCajas ? (
                  <>
                    {/* CAJ.: cajas completas. Se puede dejar en blanco y
                        escribir sólo las unidades (una venta suelta). */}
                    <label className="lineas-doc-campo">
                      <span title="Cajas completas">CAJ.</span>
                      <input
                        type="number" min={0} step={1} placeholder="—"
                        value={line.cajas ? line.cajas : ''}
                        onChange={e => cambiarLinea(index, l => conCajas(l, parseFloat(e.target.value) || 0))}
                        aria-label={`Cajas de la línea ${index + 1}`}
                      />
                    </label>
                    {/* U/C: viene de la ficha del producto; sólo se toca si
                        esta entrega viene en otro formato. */}
                    <label className={`lineas-doc-campo${(line.cajas ?? 0) > 0 && !(line.unitsPerPackage && line.unitsPerPackage > 0) ? ' lineas-doc-campo--error' : ''}`}>
                      <span title="Unidades que trae cada caja">U/C</span>
                      <input
                        type="number" min={0} step={1} placeholder="—"
                        value={line.unitsPerPackage || ''}
                        onChange={e => cambiarLinea(index, l => conUdsCaja(l, parseFloat(e.target.value) || 0))}
                        aria-label={`Unidades por caja de la línea ${index + 1}`}
                      />
                    </label>
                    {/* UDES.: lo que se cobra. Sale de CAJ. × U/C, pero se
                        puede escribir a mano (sueltas, o sólo unidades). */}
                    <label className="lineas-doc-campo">
                      <span title="Unidades en total (lo que se cobra)">UDES.</span>
                      <input
                        type="number" min={0} step={1}
                        value={line.quantity}
                        onChange={e => cambiarLinea(index, l => conUnidades(l, parseFloat(e.target.value) || 0))}
                        aria-label={`Unidades de la línea ${index + 1}`}
                      />
                    </label>
                  </>
                ) : (
                  <label className="lineas-doc-campo">
                    <span>{voz.cantidad}</span>
                    <input
                      type="number" min={0} step={0.01} value={line.quantity}
                      onChange={e => handleLineChange(index, 'quantity', parseFloat(e.target.value) || 0)}
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
                  <span title={porCajas ? 'Precio de cada unidad' : undefined}>{porCajas ? 'Precio/ud.' : 'Precio ud.'}</span>
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

                {columnasPropias.map(col => (
                  <label className="lineas-doc-campo lineas-doc-campo--ancho" key={col.clave}>
                    <span>{col.cabecera}</span>
                    <input
                      value={line.customCols?.[col.clave] ?? ''}
                      onChange={e => handleCustomColChange(index, col.clave, e.target.value)}
                    />
                  </label>
                ))}
              </div>

              {/* Si a este cliente se le cobra este artículo distinto, se dice:
                  quien hace el albarán ve por qué el precio no es el de la
                  tarifa, y si lo cambia a mano lo hace sabiéndolo. */}
              {line.productId && cliente && condicionEspecial(line.productId) && (
                <p className="lineas-doc-pie"><Tag size={12} aria-hidden /> {condicionEspecial(line.productId)}</p>
              )}

              {/* El precio de la última vez, a un toque: a este cliente (o
                  proveedor) si ya se le puso; si no, la última venta o
                  compra a cualquiera. Solo si es distinto del de la línea. */}
              {(() => {
                const s = sugerencia(line);
                if (!s) return null;
                const dtos = s.p.descuentos.filter(d => d > 0).map(d => `−${String(d).replace('.', ',')} %`).join(' ');
                const quien = s.deEste
                  ? (sentido === 'compra' ? 'Última compra a este proveedor' : 'Último precio a este cliente')
                  : (sentido === 'compra' ? 'Última compra' : 'Última venta');
                return (
                  <p className="lineas-doc-pie lineas-doc-sugerencia">
                    <History size={12} aria-hidden />
                    <span>
                      {quien}: <strong>{formatCurrency(s.p.unitPrice)}</strong>{dtos && ` ${dtos}`}
                      {' · '}{NOMBRE_TIPO[s.p.tipo] ?? s.p.tipo} {s.p.numero} del {formatDate(s.p.fecha)}
                      {!s.deEste && s.p.tercero ? ` (${s.p.tercero})` : ''}
                    </span>
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => aplicarPrecio(index, s.p)}>
                      Usar este precio
                    </button>
                  </p>
                );
              })()}

              {/* Lo que de verdad se descarga del camión, dicho aquí para no
                  tener que multiplicarlo de cabeza. */}
              {porCajas && explicarLinea(line) && (
                <p className="lineas-doc-pie">{explicarLinea(line)}</p>
              )}
              {porCajas && (line.cajas ?? 0) > 0 && !(line.unitsPerPackage && line.unitsPerPackage > 0) && (
                <p className="lineas-doc-aviso" role="alert">
                  <AlertTriangle size={13} /> Pon cuántas unidades trae cada caja (U/C) para calcular las unidades.
                </p>
              )}
              {line.productId && tipoImpositivoRaro(line.taxRate, settings) && (
                <p className="lineas-doc-aviso" role="alert">
                  <AlertTriangle size={13} /> {tipoImpositivoRaro(line.taxRate, settings)}{' '}
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => handleLineChange(index, 'taxRate', tipoGeneral(settings))}>
                    Usar el {tipoGeneral(settings)} %
                  </button>
                </p>
              )}
            </div>
          );
        })}

        <div className="lineas-doc-suma">
          <button type="button" className="btn btn-ghost btn-sm" onClick={addLine}>
            <Plus size={14} /> Añadir {voz.linea}
          </button>
          {porCajas && totalUnidades > 0 && (
            <span className="lineas-doc-total-uds">
              {totalCajas > 0 && <>{conPlural(totalCajas, ['caja', 'cajas'])}{' · '}</>}
              <strong>{totalUnidades}</strong> {voz.contenido[1]} en total
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
