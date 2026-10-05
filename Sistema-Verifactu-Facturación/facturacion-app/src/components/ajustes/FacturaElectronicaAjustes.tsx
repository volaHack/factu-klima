'use client';

import Link from 'next/link';
import { FileCode2, Info } from 'lucide-react';
import { leerConfigFe, obligatoriaDesde, type ConfigFacturaElectronica } from '@/lib/facturaElectronica/ambito';

/**
 * Ajustes de la factura electrónica entre empresas. El canal se queda en
 * modo de pruebas: el de la AEAT no se puede elegir hasta que esté
 * conectado y probado (ver lib/facturaElectronica/canal.ts).
 */
export default function FacturaElectronicaAjustes({ valor, onChange }: {
  valor: ConfigFacturaElectronica | undefined;
  onChange: (c: ConfigFacturaElectronica) => void;
}) {
  const cfg = leerConfigFe(valor);
  const cambiar = (parcial: Partial<ConfigFacturaElectronica>) => onChange({ ...cfg, ...parcial });
  const desde = obligatoriaDesde(cfg);

  const interruptor = (titulo: string, texto: string, activo: boolean, alCambiar: (v: boolean) => void) => (
    <div className="status-panel" style={{ marginTop: 'var(--space-3)', alignItems: 'center' }}>
      <div className="status-panel-body">
        <div className="status-panel-title">{titulo}</div>
        <p className="status-panel-text">{texto}</p>
      </div>
      <label className="toggle-switch">
        <input type="checkbox" checked={activo} onChange={e => alCambiar(e.target.checked)} />
        <span className="toggle-slider" />
      </label>
    </div>
  );

  return (
    <>
      <p className="settings-section-subtitle">
        Entre empresas y autónomos será obligatoria para ti desde <strong>{desde.texto}</strong> (Ley 18/2022, RD 238/2026 y Orden HAC/1028/2026).
        Se genera en UBL según la norma europea EN 16931, que es la que pide la solución pública de la AEAT.
      </p>

      {interruptor(
        'Facturo más de 8 millones de euros al año',
        'Las empresas grandes tienen un año menos de margen: obligatoria desde octubre de 2027.',
        !!cfg.volumenMas8M,
        v => cambiar({ volumenMas8M: v }),
      )}
      {interruptor(
        'Generarla sola al emitir',
        'Cada factura a una empresa o a un autónomo de España sale también como factura electrónica, sin pulsar nada. A los particulares y los tickets no les afecta.',
        cfg.automatica,
        v => cambiar({ automatica: v }),
      )}
      {interruptor(
        'Comunicar mis cobros',
        'Cuando una factura queda cobrada entera, se comunica el cobro. Para quien emite es voluntario; para quien recibe, comunicar el pago es obligatorio.',
        cfg.comunicarCobros,
        v => cambiar({ comunicarCobros: v }),
      )}

      <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
        <label className="form-label" htmlFor="fe-canal">Envío</label>
        <select id="fe-canal" className="form-select" value="simulado" disabled>
          <option value="simulado">Modo de pruebas: se genera, se valida y se guarda, sin enviar nada</option>
          <option value="spfe">Solución pública de la AEAT (cuando la AEAT abra el servicio)</option>
        </select>
        <p className="form-hint" style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          Nada sale del programa en modo de pruebas. El envío a la AEAT se activará cuando publique el servicio y se haya probado en su entorno de pruebas.
        </p>
      </div>

      <Link href="/factura-electronica" className="btn btn-secondary btn-sm" style={{ marginTop: 'var(--space-2)' }}>
        <FileCode2 size={14} /> Ver las facturas electrónicas
      </Link>
    </>
  );
}
