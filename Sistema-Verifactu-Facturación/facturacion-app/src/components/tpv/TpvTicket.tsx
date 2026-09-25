import { useEffect, useMemo, useRef, useState } from 'react';
import { Printer, Plus, Mail, MessageCircle, CloudOff, CheckCircle2 } from 'lucide-react';
import TpvDialogo from './TpvDialogo';
import { Invoice, CompanySettings } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { getTaxLabel } from '@/lib/constants';
import { generarQrVerifactu, validarDatosQr } from '@/lib/verifactu/qr';
import { LEYENDA_LARGA, ROTULO_QR } from '@/lib/verifactu/qrFactura';
import { guardarAjustesImpresion, imprimirTicket, leerAjustesImpresion, type AjustesImpresion, type Papel } from '@/lib/tpv/impresion';

interface TpvTicketProps {
  invoice: Invoice;
  settings: CompanySettings;
  cashGiven?: number;
  onNewSale: () => void;
  onClose?: () => void;
  /** Recién cobrada (no una reimpresión): si el equipo lo tiene puesto, se imprime sola. */
  recienCobrada?: boolean;
}

/** La hora de la venta; vacía si no se sabe (antes salía «Invalid Date»). */
function horaDeVenta(creada?: string): string {
  const d = creada ? new Date(creada) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
}

export default function TpvTicket({ invoice, settings, cashGiven, onNewSale, onClose, recienCobrada }: TpvTicketProps) {
  // Redondeado a céntimos y sin negativos: 58,31 − 58,31 daba «-0,00 €» en el ticket.
  const change = cashGiven != null ? Math.max(0, Math.round((cashGiven - invoice.total) * 100) / 100) : undefined;
  const ticketRef = useRef<HTMLDivElement>(null);
  // La impresora es de este equipo: se lee al montar (en el servidor no hay localStorage).
  const [impresion, setImpresion] = useState<AjustesImpresion | null>(null);
  useEffect(() => { queueMicrotask(() => setImpresion(leerAjustesImpresion())); }, []);
  const cambiarImpresion = (a: AjustesImpresion) => { setImpresion(a); guardarAjustesImpresion(a); };
  const imprimir = () => { if (ticketRef.current) void imprimirTicket(ticketRef.current, impresion?.papel); };

  /**
   * EL QR TRIBUTARIO DEL TICKET
   *
   * Un ticket de mostrador es una factura simplificada (art. 7 del RD
   * 1619/2012), y una factura simplificada es una factura: lleva el mismo QR
   * que la ordinaria, con el mismo rótulo encima y la misma frase debajo. Este
   * ticket se imprimía sin ninguno de los tres.
   *
   * No hace falta ninguna conexión con la AEAT para tenerlo: se compone con
   * los cuatro datos que el propio ticket ya enseña. Si a la empresa le falta
   * el NIF no se pinta nada en vez de imprimir un código que llevaría a
   * ninguna parte. Sin conexión SÍ lleva QR: el ticket va en la serie propia
   * de la caja con su número definitivo (`serieDelDispositivo`), el mismo
   * que se registrará al sincronizar.
   */
  const datosQr = useMemo(() => ({
    nifEmisor: settings.nif || '',
    numeroFactura: invoice.number,
    fechaEmision: invoice.issueDate,
    importeTotal: invoice.total,
  }), [settings.nif, invoice.number, invoice.issueDate, invoice.total]);

  const sePuedeCodificar = validarDatosQr(datosQr).length === 0;

  const [qr, setQr] = useState('');
  useEffect(() => {
    if (!sePuedeCodificar) return;
    let vivo = true;
    generarQrVerifactu(datosQr).then(imagen => { if (vivo) setQr(imagen); }).catch(() => { /* sin QR antes que con uno roto */ });
    return () => { vivo = false; };
  }, [sePuedeCodificar, datosQr]);

  // Imprimir al cobrar: una sola vez, y cuando el QR ya está (o no va a estar).
  const yaImpreso = useRef(false);
  const qrListo = !sePuedeCodificar || !!qr;
  useEffect(() => {
    if (!recienCobrada || !impresion?.alCobrar || !qrListo || yaImpreso.current || !ticketRef.current) return;
    yaImpreso.current = true;
    void imprimirTicket(ticketRef.current, impresion.papel);
  }, [recienCobrada, impresion, qrListo]);

  const getTicketTextSummary = () => {
    const header = `${settings.tradeName || settings.businessName}\nTicket N.º ${invoice.number}\nFecha: ${formatDate(invoice.issueDate)}\n------------------------\n`;
    const lines = invoice.lineItems.map(li => `${li.quantity}x ${li.productName}: ${formatCurrency(li.total)}`).join('\n');
    const footer = `\n------------------------\nTOTAL: ${formatCurrency(invoice.total)}\nGracias por su compra.`;
    return encodeURIComponent(header + lines + footer);
  };

  const shareWhatsApp = () => {
    const text = getTicketTextSummary();
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const shareEmail = () => {
    const text = getTicketTextSummary();
    window.open(`mailto:?subject=${encodeURIComponent(`Ticket de compra ${invoice.number}`)}&body=${text}`, '_blank');
  };

  const metodo = ({ efectivo: 'Efectivo', tarjeta: 'Tarjeta', bizum: 'Bizum' } as Record<string, string>)[String(invoice.paymentMethod)] ?? 'Cobrado';
  const hayCambio = change != null && change > 0.004;

  return (
    <TpvDialogo
      titulo="Venta cobrada"
      subtitulo={<>{invoice.number} · {metodo} · {formatCurrency(invoice.total)}</>}
      icono={<CheckCircle2 size={22} />}
      tono="exito"
      ancho="md"
      onClose={onClose || onNewSale}
      className="tpvt"
      accion={invoice.numberTemporary ? (
        <span className="tpvt-offline" title="Emitido sin conexión: se registra en Hacienda al volver la red">
          <CloudOff size={13} /> Sin conexión
        </span>
      ) : undefined}
      pie={
        <>
          <button type="button" className="tpvd-boton tpvt-compartir" onClick={shareWhatsApp} title="Enviar por WhatsApp">
            <MessageCircle size={17} /> <span>WhatsApp</span>
          </button>
          <button type="button" className="tpvd-boton tpvt-compartir" onClick={shareEmail} title="Enviar por correo">
            <Mail size={17} /> <span>Email</span>
          </button>
          <button type="button" className="tpvd-boton" onClick={imprimir}>
            <Printer size={17} /> Imprimir
          </button>
          <button type="button" className="tpvd-boton tpvd-boton--principal tpvt-nueva" onClick={onNewSale} data-autofocus>
            <Plus size={18} /> Nueva venta
          </button>
        </>
      }
    >
      {/* Lo primero que mira el cajero: cuánto tiene que devolver. */}
      {hayCambio && (
        <div className="tpvt-cambio" role="status">
          <span>Devuelve</span>
          <strong>{formatCurrency(change!)}</strong>
          <small>Entregado {formatCurrency(cashGiven!)} · Total {formatCurrency(invoice.total)}</small>
        </div>
      )}

        <div className="tpv-ticket-print-area">
          <div className="tpv-ticket" ref={ticketRef}>
            {/* Al principio del ticket, antes de nada: es donde la
                especificación de la AEAT lo pide en formato vertical. */}
            {sePuedeCodificar && qr && (
              <div className="tpv-ticket-qr">
                <span className="tpv-ticket-qr-rotulo">{ROTULO_QR}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="Código QR para verificar esta factura en la sede electrónica de la AEAT" />
                <span className="tpv-ticket-qr-leyenda">{LEYENDA_LARGA}</span>
              </div>
            )}
            <div className="tpv-ticket-header">
              <strong>{settings.tradeName || settings.businessName}</strong>
              <span>{settings.nif}</span>
              <span>{settings.address}, {settings.city}</span>
            </div>
            <div className="tpv-ticket-meta">
              <span>{invoice.number}</span>
              <span>{formatDate(invoice.issueDate)} {horaDeVenta(invoice.createdAt)}</span>
            </div>
            <div className="tpv-ticket-divider" />
            <table className="tpv-ticket-lines">
              <tbody>
                {invoice.lineItems.map(li => (
                  <tr key={li.id}>
                    <td>{li.quantity}× {li.productName}</td>
                    <td>{formatCurrency(li.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="tpv-ticket-divider" />
            <div className="tpv-ticket-totals">
              <div><span>Subtotal</span><span>{formatCurrency(invoice.subtotal)}</span></div>
              {invoice.taxBreakdown.map(tb => (
                <div key={tb.rate}><span>{getTaxLabel(settings)} {tb.rate}%</span><span>{formatCurrency(tb.amount)}</span></div>
              ))}
              <div className="tpv-ticket-total-final"><span>TOTAL</span><span>{formatCurrency(invoice.total)}</span></div>
              {cashGiven != null && (
                <>
                  <div><span>Entregado</span><span>{formatCurrency(cashGiven)}</span></div>
                  <div><span>Cambio</span><span>{formatCurrency(change ?? 0)}</span></div>
                </>
              )}
            </div>
            <div className="tpv-ticket-divider" />
            <p className="tpv-ticket-footer">
              Factura simplificada · Sellada SHA-256
              {invoice.verifactu?.chainedHash ? ` · ${invoice.verifactu.chainedHash.slice(0, 16)}…` : ''}
            </p>
          </div>
        </div>

        {impresion && (
          <div className="tpvt-impresora">
            <label>
              Papel de este equipo
              <select value={impresion.papel} onChange={e => cambiarImpresion({ ...impresion, papel: e.target.value as Papel })}>
                <option value="80">Ticket 80 mm</option>
                <option value="58">Ticket 58 mm</option>
                <option value="a4">Folio A4</option>
              </select>
            </label>
            <label className="tpvt-impresora-auto">
              <input type="checkbox" checked={impresion.alCobrar} onChange={e => cambiarImpresion({ ...impresion, alCobrar: e.target.checked })} />
              Imprimir solo al cobrar
            </label>
          </div>
        )}

    </TpvDialogo>
  );
}
