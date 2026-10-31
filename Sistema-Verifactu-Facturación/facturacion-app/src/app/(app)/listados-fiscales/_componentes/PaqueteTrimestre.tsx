'use client';

/**
 * «PREPARAR PAQUETE DEL TRIMESTRE»
 *
 * Lo que la gestoría pide cada trimestre, de un toque: facturas emitidas,
 * recibidas, gastos, resumen del impuesto y cobros, cada cosa en su CSV y
 * con el nombre de la empresa y el trimestre delante. Se descargan uno
 * detrás de otro; si el navegador frena alguno (algunos preguntan antes de
 * bajar varios a la vez), cada fichero tiene además su propio botón.
 * Los ficheros los arma lib/paqueteGestoria; aquí sólo se eligen y se bajan.
 */

import { useState } from 'react';
import { Package, Download, Loader2, FileSpreadsheet } from 'lucide-react';
import { getCobrosPagos, getGastos, getInvoices } from '@/lib/storage';
import { descargar, type FicheroExportado } from '@/lib/exportar';
import { prepararPaquete, trimestrePropuesto, type ContenidoPaquete } from '@/lib/paqueteGestoria';
import type { CompanySettings } from '@/lib/types';
import type { Trimestre } from '@/lib/fiscal/tipos';
import { useToast } from '@/hooks/useToast';

const TRIMESTRES: Trimestre[] = [1, 2, 3, 4];
const pausa = (ms: number) => new Promise(r => setTimeout(r, ms));

export default function PaqueteTrimestre({ empresa, ejercicios }: { empresa: CompanySettings; ejercicios: number[] }) {
  const { success, error: toastError } = useToast();
  const propuesto = trimestrePropuesto();
  const [ejercicio, setEjercicio] = useState(propuesto.ejercicio);
  const [trimestre, setTrimestre] = useState<Trimestre>(propuesto.trimestre);
  const [preparando, setPreparando] = useState(false);
  const [paquete, setPaquete] = useState<(ContenidoPaquete & { periodo: string }) | null>(null);
  const anos = [...new Set([...ejercicios, propuesto.ejercicio])].sort((a, b) => b - a);

  const preparar = async () => {
    setPreparando(true);
    try {
      const [facturas, gastos, cobros] = await Promise.all([getInvoices(), getGastos(), getCobrosPagos({ tipo: 'cobro' })]);
      const p = prepararPaquete({ empresa, facturas, gastos, cobros }, { ejercicio, trimestre });
      setPaquete({ ...p, periodo: `${trimestre}T ${ejercicio}` });
      for (const f of p.ficheros) {
        descargar(f);
        // Un respiro entre uno y otro: de golpe, más de uno se pierde.
        await pausa(400);
      }
      success('Paquete preparado', `${p.ficheros.length} ficheros del ${trimestre}T ${ejercicio} en tus descargas.`);
    } catch (e) {
      toastError('No se ha podido preparar el paquete', e instanceof Error ? e.message : '');
    } finally {
      setPreparando(false);
    }
  };

  const cuantos = (f: FicheroExportado): string | null => {
    if (!paquete) return null;
    if (f.nombre.endsWith('_facturas_emitidas.csv')) return `${paquete.emitidas} ${paquete.emitidas === 1 ? 'factura' : 'facturas'}`;
    if (f.nombre.endsWith('_facturas_recibidas.csv')) return `${paquete.recibidas} ${paquete.recibidas === 1 ? 'factura' : 'facturas'}`;
    if (f.nombre.endsWith('_gastos.csv')) return `${paquete.gastos} ${paquete.gastos === 1 ? 'gasto' : 'gastos'}`;
    if (f.nombre.endsWith('_cobros.csv')) return `${paquete.cobros} ${paquete.cobros === 1 ? 'cobro' : 'cobros'}`;
    return 'Repercutido, soportado y resultado';
  };

  return (
    <section className="lf-seccion paquete-gestoria" aria-labelledby="paquete-titulo">
      <h2 id="paquete-titulo"><Package size={18} /> Para tu gestoría</h2>
      <div className="paquete-gestoria-caja">
        <p className="paquete-gestoria-texto">
          Facturas emitidas, recibidas, gastos, el resumen de {empresa.igicEnabled ? 'IGIC' : 'IVA'} y los cobros del
          trimestre, en CSV que se abren con Excel. No es un fichero para la Sede: es lo que le mandas a tu gestoría.
        </p>
        <div className="paquete-gestoria-controles">
          <label>
            Trimestre
            <select value={trimestre} onChange={e => { setTrimestre(Number(e.target.value) as Trimestre); setPaquete(null); }}>
              {TRIMESTRES.map(t => <option key={t} value={t}>{t}.º</option>)}
            </select>
          </label>
          <label>
            Año
            <select value={ejercicio} onChange={e => { setEjercicio(Number(e.target.value)); setPaquete(null); }}>
              {anos.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <button type="button" className="btn btn-primary" onClick={() => void preparar()} disabled={preparando}>
            {preparando ? <Loader2 size={16} className="spin" /> : <Download size={16} />}
            Preparar paquete del trimestre
          </button>
        </div>

        {paquete && (
          <ul className="paquete-gestoria-ficheros" aria-label={`Ficheros del ${paquete.periodo}`}>
            {paquete.ficheros.map(f => (
              <li key={f.nombre}>
                <FileSpreadsheet size={16} aria-hidden="true" />
                <span className="paquete-gestoria-nombre">
                  <strong className="mono">{f.nombre}</strong>
                  <small>{cuantos(f)}</small>
                </span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => descargar(f)} aria-label={`Descargar otra vez ${f.nombre}`}>
                  <Download size={14} /> Bajar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
