'use client';

import { useState } from 'react';
import { Check, Copy, CreditCard, Loader2, Printer } from 'lucide-react';

/** Pagar con tarjeta: crea el pago en el servidor y lleva a Stripe. */
export function BotonPagar({ token, facturaId, importe, grande = false }: { token: string; facturaId: string; importe: string; grande?: boolean }) {
  const [cargando, setCargando] = useState(false);
  const [fallo, setFallo] = useState('');

  const pagar = async () => {
    setCargando(true);
    setFallo('');
    try {
      const r = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: facturaId, portalToken: token }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.url) throw new Error(d.error || 'No se ha podido iniciar el pago.');
      window.location.href = d.url;
    } catch (e) {
      setFallo(e instanceof Error ? e.message : 'No se ha podido iniciar el pago.');
      setCargando(false);
    }
  };

  return (
    <span className="portal-pagar">
      <button type="button" className={`btn btn-primary ${grande ? '' : 'btn-sm'}`} onClick={pagar} disabled={cargando}>
        {cargando ? <Loader2 size={15} className="spin" /> : <CreditCard size={15} />} Pagar {importe}
      </button>
      {fallo && <small role="alert" className="portal-fallo">{fallo}</small>}
    </span>
  );
}

/** Copia un dato (el IBAN, el concepto) con un toque. */
export function BotonCopiar({ texto, etiqueta }: { texto: string; etiqueta: string }) {
  const [hecho, setHecho] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={async () => {
        try { await navigator.clipboard.writeText(texto); setHecho(true); setTimeout(() => setHecho(false), 1800); } catch { /* sin portapapeles */ }
      }}
      aria-label={`Copiar ${etiqueta}`}
    >
      {hecho ? <Check size={14} /> : <Copy size={14} />} {hecho ? 'Copiado' : 'Copiar'}
    </button>
  );
}

export function BotonImprimir() {
  return (
    <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.print()}>
      <Printer size={15} /> Imprimir o guardar en PDF
    </button>
  );
}
