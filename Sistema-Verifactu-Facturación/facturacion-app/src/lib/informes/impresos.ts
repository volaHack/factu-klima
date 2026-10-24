/**
 * LOS IMPRESOS SENCILLOS
 *
 * Los documentos se imprimen con el diseño de la empresa (plantillas). Esto
 * es para lo demás y para cuando aún no hay diseño:
 *
 *   · un documento (pedido, albarán, factura…) en una hoja limpia con su
 *     cabecera, sus líneas, el desglose de impuestos y los totales;
 *   · el recibo de un cobro, de un pago o de una entrega a cuenta;
 *   · el vale de una regularización de stock.
 *
 * Cada impreso es un trozo de HTML que empieza en hoja nueva: se juntan
 * todos los de una tanda y se imprimen de una vez.
 */

import type { Albaran, Client, CobroPago, CompanySettings, Invoice, RegularizacionStock } from '../types';
import { desgloseDe } from './listadosGenerales';

/** Todo lo que viene de los datos pasa por aquí antes de ir al HTML. */
export function esc(t: unknown): string {
  return String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

const eur = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0);
const num = (n: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3 }).format(n || 0);
const fecha = (f?: string) => (f ? f.split('-').reverse().join('/') : '');

export const CSS_IMPRESO = `
.impreso { page-break-after: always; break-after: page; font-size: 10px; }
.impreso:last-child { page-break-after: auto; break-after: auto; }
.impreso-cabeza { display: flex; justify-content: space-between; gap: 20px; border-bottom: 2px solid #1a1216; padding-bottom: 10px; margin-bottom: 12px; }
.impreso-empresa strong { font-size: 13px; display: block; }
.impreso-empresa span, .impreso-tercero span { display: block; color: #4a3a40; }
.impreso-titulo { text-align: right; }
.impreso-titulo h1 { margin: 0; font-size: 16px; letter-spacing: 0.02em; }
.impreso-titulo dl { margin: 6px 0 0; display: grid; grid-template-columns: auto auto; gap: 2px 10px; justify-content: end; }
.impreso-titulo dt { color: #6f5d63; } .impreso-titulo dd { margin: 0; font-weight: 600; }
.impreso-tercero { border: 1px solid rgba(26,18,22,.25); border-radius: 4px; padding: 8px 10px; margin-bottom: 12px; max-width: 60%; }
.impreso-tercero strong { font-size: 11.5px; display: block; }
.impreso table { width: 100%; border-collapse: collapse; }
.impreso th { text-align: left; font-size: 8px; text-transform: uppercase; letter-spacing: .04em; color: #4a3a40; border-bottom: 1px solid rgba(26,18,22,.35); padding: 5px 6px; }
.impreso td { padding: 5px 6px; border-bottom: 1px solid rgba(26,18,22,.12); vertical-align: top; }
.impreso .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.impreso-totales { display: flex; justify-content: flex-end; gap: 24px; margin-top: 12px; }
.impreso-totales table { width: auto; min-width: 260px; }
.impreso-totales .total td { font-weight: 700; font-size: 12px; border-top: 2px solid #1a1216; border-bottom: none; }
.impreso-notas { margin-top: 14px; color: #4a3a40; white-space: pre-wrap; }
.impreso-firma { margin-top: 40px; display: flex; gap: 40px; }
.impreso-firma div { flex: 1; border-top: 1px solid #1a1216; padding-top: 4px; color: #6f5d63; }
.impreso-importe { font-size: 20px; font-weight: 700; margin: 14px 0; }
`;

function cabeza(e: CompanySettings | null, titulo: string, datos: [string, string][]): string {
  const dir = e ? [e.address, [e.postalCode, e.city].filter(Boolean).join(' '), e.province].filter(Boolean).join(' · ') : '';
  return `<div class="impreso-cabeza">
  <div class="impreso-empresa"><strong>${esc(e?.businessName || e?.tradeName || '')}</strong>
    ${e?.nif ? `<span>NIF ${esc(e.nif)}</span>` : ''}${dir ? `<span>${esc(dir)}</span>` : ''}
    ${e?.phone || e?.email ? `<span>${esc([e?.phone, e?.email].filter(Boolean).join(' · '))}</span>` : ''}</div>
  <div class="impreso-titulo"><h1>${esc(titulo)}</h1><dl>${datos.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>
</div>`;
}

function tercero(nombre: string, nif?: string, c?: Client | null, rol = 'Cliente'): string {
  const dir = c ? [c.address, [c.postalCode, c.city].filter(Boolean).join(' '), c.province].filter(Boolean).join(' · ') : '';
  return `<div class="impreso-tercero"><span>${esc(rol)}</span><strong>${esc(nombre)}</strong>
  ${nif ? `<span>NIF ${esc(nif)}</span>` : ''}${dir ? `<span>${esc(dir)}</span>` : ''}</div>`;
}

const TITULO: Record<string, string> = {
  presupuesto: 'PRESUPUESTO', pedido: 'PEDIDO', albaran: 'ALBARÁN', factura: 'FACTURA', rectificativa: 'FACTURA RECTIFICATIVA',
};

/** Un documento con sus líneas, en hoja limpia. */
export function htmlDeDocumento(d: Invoice | Albaran, e: CompanySettings | null, c?: Client | null): string {
  const tipo = 'tipo' in d ? (d.tipo ?? 'factura') : 'albaran';
  const compra = 'sentido' in d && d.sentido === 'compra';
  const titulo = `${TITULO[tipo] ?? 'DOCUMENTO'}${compra ? ' DE COMPRA' : ''}`;
  const lineas = d.lineItems.map(l => {
    const dto = [l.discountPercent, l.discountPercent2, l.discountPercent3].filter(x => x).join('+');
    return `<tr><td>${esc(l.productRef)}</td><td>${esc(l.productName)}${l.loteCodigo ? `<br><small>Lote ${esc(l.loteCodigo)}</small>` : ''}</td>
      <td class="num">${num(l.quantity)}</td><td class="num">${eur(l.unitPrice)}</td><td class="num">${dto ? `${esc(dto)} %` : ''}</td>
      <td class="num">${num(l.taxRate)} %</td><td class="num">${eur(l.subtotal)}</td></tr>`;
  }).join('');
  const impuestos = 'taxBreakdown' in d ? desgloseDe(d as Invoice) : [];
  const vence = 'dueDate' in d && d.dueDate && tipo === 'factura' ? [['Vencimiento', fecha(d.dueDate)] as [string, string]] : [];
  return `<section class="impreso">
${cabeza(e, titulo, [['Número', d.number], ['Fecha', fecha(d.issueDate)], ...vence])}
${tercero(d.clientName, d.clientNif, c, compra ? 'Proveedor' : 'Cliente')}
<table><thead><tr><th>Ref.</th><th>Descripción</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Dto.</th><th class="num">Imp.</th><th class="num">Importe</th></tr></thead>
<tbody>${lineas || '<tr><td colspan="7">Sin líneas.</td></tr>'}</tbody></table>
<div class="impreso-totales">
  ${impuestos.length ? `<table><thead><tr><th>% Imp.</th><th class="num">Base</th><th class="num">Cuota</th></tr></thead><tbody>${impuestos.map(t => `<tr><td>${num(t.rate)} %</td><td class="num">${eur(t.base)}</td><td class="num">${eur(t.amount)}</td></tr>`).join('')}</tbody></table>` : ''}
  <table><tbody>
    <tr><td>Base imponible</td><td class="num">${eur(d.subtotal)}</td></tr>
    <tr><td>Impuestos</td><td class="num">${eur(d.totalTax)}</td></tr>
    <tr class="total"><td>TOTAL</td><td class="num">${eur(d.total)}</td></tr>
  </tbody></table>
</div>
${d.notes ? `<div class="impreso-notas">${esc(d.notes)}</div>` : ''}
${tipo === 'albaran' ? '<div class="impreso-firma"><div>Entregado por</div><div>Recibí conforme</div></div>' : ''}
</section>`;
}

/** El recibo de un cobro o un pago; con `soloACuenta`, de lo que queda a cuenta. */
export function htmlDeRecibo(m: CobroPago, e: CompanySettings | null, formaDePago: string, soloACuenta = false): string {
  const aplicado = m.desglose.reduce((s, d) => s + (d.importeAplicado || 0), 0);
  const importe = soloACuenta ? m.importeTotal - aplicado : m.importeTotal;
  const titulo = soloACuenta ? 'ENTREGA A CUENTA' : m.tipo === 'cobro' ? 'RECIBO DE COBRO' : 'JUSTIFICANTE DE PAGO';
  const frase = m.tipo === 'cobro'
    ? `Hemos recibido de ${esc(m.contraparteNombre)} la cantidad de`
    : `Hemos pagado a ${esc(m.contraparteNombre)} la cantidad de`;
  return `<section class="impreso">
${cabeza(e, titulo, [['Número', m.number], ['Fecha', fecha(m.fecha)], ['Forma de pago', formaDePago]])}
${tercero(m.contraparteNombre, m.contraparteNif, null, m.tipo === 'cobro' ? 'Cliente' : 'Proveedor')}
<p>${frase}</p>
<div class="impreso-importe">${eur(importe)}</div>
${m.desglose.length ? `<table><thead><tr><th>Aplicado a la factura</th><th class="num">Importe</th></tr></thead><tbody>${m.desglose.map(d => `<tr><td>${esc(d.invoiceNumber)}</td><td class="num">${eur(d.importeAplicado)}</td></tr>`).join('')}</tbody></table>` : ''}
${soloACuenta ? '<p class="impreso-notas">Importe a cuenta de futuras facturas.</p>' : ''}
${m.notas ? `<div class="impreso-notas">${esc(m.notas)}</div>` : ''}
<div class="impreso-firma"><div>Firma y sello</div><div>Conforme</div></div>
</section>`;
}

/** El vale de una regularización de stock. */
export function htmlDeRegularizacion(r: RegularizacionStock, e: CompanySettings | null): string {
  return `<section class="impreso">
${cabeza(e, 'REGULARIZACIÓN DE STOCK', [['Fecha', fecha(r.fecha)], ['Almacén', r.almacenNombre]])}
<table><thead><tr><th>Ref.</th><th>Artículo</th><th class="num">Había</th><th class="num">Contado</th><th class="num">Diferencia</th></tr></thead>
<tbody><tr><td>${esc(r.productRef)}</td><td>${esc(r.productName)}</td><td class="num">${num(r.stockTeorico)}</td><td class="num">${num(r.stockReal)}</td><td class="num">${num(r.diferencia)}</td></tr></tbody></table>
<div class="impreso-notas">Motivo: ${esc(r.motivo)}${r.notas ? `\n${esc(r.notas)}` : ''}</div>
<div class="impreso-firma"><div>Contado por</div><div>Revisado</div></div>
</section>`;
}
