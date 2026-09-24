'use client';

/**
 * La pestaña «Apuntes» de la contabilidad: nóminas, amortizaciones,
 * préstamos y asientos sueltos. Ver lib/contabilidad/apuntes.ts.
 */

import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, X, Users, Building2, Landmark, PenLine } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { formatCurrency, generateId } from '@/lib/utils';
import { CUENTAS } from '@/lib/contabilidad/plan';
import {
  PERIODICIDADES, cuadroPrestamo, cuotaAmortizacion, cuotaPrestamo, fechasDe, importeDe, lineasAmortizacion,
  lineasNomina, normalizarCuenta, problemaDe, sumarMeses, type ApunteContable, type LineaApunte, type Periodicidad, type Plantilla,
} from '@/lib/contabilidad/apuntes';
import { borrarApunte, guardarApunte, MAX_EN_CUENTA, type AlmacenApuntes } from '@/lib/contabilidad/apuntesAlmacen';

const PLANTILLAS: { id: Plantilla; nombre: string; icono: typeof Users; ayuda: string }[] = [
  { id: 'nomina', nombre: 'Nómina', icono: Users, ayuda: 'Sueldo bruto, retención de IRPF y Seguridad Social. El neto sale del banco.' },
  { id: 'amortizacion', nombre: 'Amortización', icono: Building2, ayuda: 'Lo que pierde de valor cada periodo un bien que dura años: furgoneta, maquinaria, ordenadores.' },
  { id: 'prestamo', nombre: 'Préstamo', icono: Landmark, ayuda: 'Cuotas mensuales con su parte de capital y de intereses (sistema francés).' },
  { id: 'libre', nombre: 'Asiento libre', icono: PenLine, ayuda: 'Cualquier asiento, cuenta a cuenta. Tiene que cuadrar.' },
];

const hoy = () => new Date().toISOString().slice(0, 10);
const fecha = (iso: string) => iso.split('-').reverse().join('/');
const num = (v: string) => { const n = Number(v.replace(',', '.')); return Number.isFinite(n) ? n : 0; };

interface Borrador {
  apunte: ApunteContable;
  nomina: { bruto: string; irpf: string; ssTrabajador: string; ssEmpresa: string };
  amort: { cuota: string; valor: string; anios: string };
  prestamo: { principal: string; interes: string; meses: string; conIngreso: boolean };
  libres: { cuenta: string; debe: string; haber: string }[];
}

function borradorDe(a?: ApunteContable, plantilla: Plantilla = 'nomina'): Borrador {
  const ap: ApunteContable = a ?? { id: generateId(), concepto: '', plantilla, periodicidad: plantilla === 'libre' ? 'unico' : 'mes', fecha: hoy(), lineas: [] };
  const de = (c: string, lado: 'debe' | 'haber') => ap.lineas.find(l => l.cuenta === c)?.[lado] ?? 0;
  const ssTotal = de(CUENTAS.seguridadSocialAcreedora, 'haber');
  const ssEmp = de(CUENTAS.seguridadSocialEmpresa, 'debe');
  return {
    apunte: ap,
    nomina: {
      bruto: a ? String(de(CUENTAS.sueldos, 'debe')) : '', irpf: a ? String(de(CUENTAS.retencionesPracticadas, 'haber')) : '',
      ssTrabajador: a ? String(Math.round((ssTotal - ssEmp) * 100) / 100) : '', ssEmpresa: a ? String(ssEmp) : '',
    },
    amort: { cuota: a ? String(de(CUENTAS.amortizacionInmovilizado, 'debe')) : '', valor: '', anios: '' },
    prestamo: {
      principal: String(ap.prestamo?.principal ?? ''), interes: String(ap.prestamo?.interesAnual ?? ''),
      meses: String(ap.prestamo?.meses ?? ''), conIngreso: ap.prestamo?.conIngreso ?? true,
    },
    libres: ap.plantilla === 'libre' && ap.lineas.length
      ? ap.lineas.map(l => ({ cuenta: l.cuenta, debe: l.debe ? String(l.debe) : '', haber: l.haber ? String(l.haber) : '' }))
      : [{ cuenta: '', debe: '', haber: '' }, { cuenta: '', debe: '', haber: '' }],
  };
}

/** El apunte tal como quedaría con lo escrito en el formulario. */
function apunteDe(b: Borrador): ApunteContable {
  const a = { ...b.apunte };
  if (a.plantilla === 'nomina') {
    a.lineas = lineasNomina({ bruto: num(b.nomina.bruto), irpf: num(b.nomina.irpf), ssTrabajador: num(b.nomina.ssTrabajador), ssEmpresa: num(b.nomina.ssEmpresa) });
  } else if (a.plantilla === 'amortizacion') {
    a.lineas = lineasAmortizacion(num(b.amort.cuota));
  } else if (a.plantilla === 'prestamo') {
    a.periodicidad = 'mes';
    a.lineas = [];
    a.prestamo = { principal: num(b.prestamo.principal), interesAnual: num(b.prestamo.interes), meses: Math.round(num(b.prestamo.meses)), conIngreso: b.prestamo.conIngreso };
    a.hasta = undefined;
  } else {
    a.lineas = b.libres.filter(l => l.cuenta || l.debe || l.haber)
      .map(l => ({ cuenta: normalizarCuenta(l.cuenta) || l.cuenta, debe: num(l.debe), haber: num(l.haber) }));
  }
  if (a.plantilla !== 'prestamo') a.prestamo = undefined;
  return a;
}

function describirCuando(a: ApunteContable): string {
  if (a.plantilla === 'prestamo' && a.prestamo) return `${a.prestamo.meses} cuotas mensuales desde el ${fecha(sumarMeses(a.fecha, 1))}`;
  if (a.periodicidad === 'unico') return `El ${fecha(a.fecha)}`;
  const p = PERIODICIDADES.find(x => x.id === a.periodicidad)!.nombre.toLowerCase();
  return `${p[0].toUpperCase()}${p.slice(1)} desde el ${fecha(a.fecha)}${a.hasta ? ` hasta el ${fecha(a.hasta)}` : ''}`;
}

export default function Apuntes({ apuntes, almacen, editable, nombreCuenta, onCambio }: {
  apuntes: ApunteContable[];
  almacen?: AlmacenApuntes;
  editable: boolean;
  nombreCuenta: (c: string) => string;
  onCambio: () => void;
}) {
  const { success, error: toastError } = useToast();
  const [b, setB] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);

  const previa = useMemo(() => (b ? apunteDe(b) : null), [b]);
  const problema = previa ? problemaDe(previa) : null;
  const lineasPrevia: LineaApunte[] = useMemo(() => {
    if (!previa) return [];
    if (previa.plantilla === 'prestamo' && previa.prestamo && !problema) {
      const c = cuadroPrestamo(previa.prestamo)[0];
      const deuda = previa.prestamo.meses > 12 ? CUENTAS.deudasLargoPlazoBanco : CUENTAS.deudasCortoPlazoBanco;
      return [
        { cuenta: deuda, debe: c.capital, haber: 0 },
        { cuenta: CUENTAS.interesesDeudas, debe: c.intereses, haber: 0 },
        { cuenta: CUENTAS.bancos, debe: 0, haber: Math.round((c.capital + c.intereses) * 100) / 100 },
      ];
    }
    return previa.lineas;
  }, [previa, problema]);

  const hoyIso = hoy();
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!previa || problema) return;
    setGuardando(true);
    try {
      await guardarApunte(previa);
      success('Apunte guardado', `${fechasDe(previa, hoyIso).length} asiento(s) hasta hoy`);
      setB(null);
      onCambio();
    } catch (err) {
      toastError('No se ha podido guardar', err instanceof Error ? err.message : '');
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (a: ApunteContable) => {
    if (!window.confirm(`¿Borrar «${a.concepto}»? Desaparecen todos sus asientos.`)) return;
    try {
      await borrarApunte(a.id);
      success('Apunte borrado');
      onCambio();
    } catch (err) {
      toastError('No se ha podido borrar', err instanceof Error ? err.message : '');
    }
  };

  const set = (cambio: Partial<ApunteContable>) => b && setB({ ...b, apunte: { ...b.apunte, ...cambio } });

  return (
    <>
      <div className="conta-barra">
        <p className="equipo-nota" style={{ margin: 0 }}>
          Lo que no sale de las facturas: nóminas, amortizaciones, préstamos o cualquier asiento que te pida la gestoría.
          Los periódicos se apuntan solos cada mes, trimestre o año.
          {almacen === 'cuenta' && ` Sin la migración 052 caben ${MAX_EN_CUENTA}.`}
        </p>
        {editable && (
          <button type="button" className="btn btn-primary" onClick={() => setB(borradorDe())}>
            <Plus size={16} /> Nuevo apunte
          </button>
        )}
      </div>

      {apuntes.length === 0 ? (
        <p className="lf-card-estado">Todavía no hay apuntes a mano.</p>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr><th>Concepto</th><th>Tipo</th><th>Cuándo</th><th className="num">Importe</th><th className="num">Asientos</th>{editable && <th><span className="sr-only">Acciones</span></th>}</tr></thead>
            <tbody>
              {apuntes.map(a => (
                <tr key={a.id}>
                  <td className="primary">{a.concepto}</td>
                  <td>{PLANTILLAS.find(p => p.id === a.plantilla)?.nombre}</td>
                  <td>{describirCuando(a)}</td>
                  <td className="num mono">{formatCurrency(importeDe(a))}</td>
                  <td className="num mono">{fechasDe(a, hoyIso).length}</td>
                  {editable && (
                    <td>
                      <div className="recu-acciones">
                        <button type="button" className="btn btn-ghost btn-icon" aria-label="Cambiar" title="Cambiar" onClick={() => setB(borradorDe(a))}><Pencil size={15} /></button>
                        <button type="button" className="btn btn-ghost btn-icon" aria-label="Borrar" title="Borrar" onClick={() => borrar(a)}><Trash2 size={15} /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {b && previa && (
        <div className="modal-overlay" onClick={() => setB(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{apuntes.some(x => x.id === b.apunte.id) ? 'Cambiar apunte' : 'Nuevo apunte'}</h3>
              <button type="button" className="modal-close" onClick={() => setB(null)}><X size={18} /></button>
            </div>
            <form onSubmit={guardar}>
              <div className="modal-body">
                <div className="apunte-plantillas" role="radiogroup" aria-label="Tipo de apunte">
                  {PLANTILLAS.map(p => {
                    const Icono = p.icono;
                    return (
                      <button key={p.id} type="button" role="radio" aria-checked={b.apunte.plantilla === p.id}
                        className={`apunte-plantilla ${b.apunte.plantilla === p.id ? 'is-activa' : ''}`}
                        onClick={() => setB({ ...borradorDe(undefined, p.id), apunte: { ...borradorDe(undefined, p.id).apunte, id: b.apunte.id, concepto: b.apunte.concepto, fecha: b.apunte.fecha } })}>
                        <Icono size={16} /> {p.nombre}
                      </button>
                    );
                  })}
                </div>
                <p className="form-hint" style={{ marginTop: 0, marginBottom: 'var(--space-3)' }}>{PLANTILLAS.find(p => p.id === b.apunte.plantilla)!.ayuda}</p>

                <div className="form-group">
                  <label className="form-label required" htmlFor="ap-concepto">Concepto</label>
                  <input id="ap-concepto" className="form-input" required value={b.apunte.concepto}
                    placeholder={{ nomina: 'Nómina de Ana García', amortizacion: 'Amortización furgoneta', prestamo: 'Préstamo ICO', libre: 'Regularización' }[b.apunte.plantilla]}
                    onChange={e => set({ concepto: e.target.value })} />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label required" htmlFor="ap-fecha">{b.apunte.plantilla === 'prestamo' ? 'Fecha de firma' : b.apunte.periodicidad === 'unico' ? 'Fecha' : 'Primera vez'}</label>
                    <input id="ap-fecha" type="date" className="form-input" required value={b.apunte.fecha} onChange={e => set({ fecha: e.target.value })} />
                  </div>
                  {b.apunte.plantilla !== 'prestamo' && (
                    <div className="form-group">
                      <label className="form-label" htmlFor="ap-period">Se repite</label>
                      <select id="ap-period" className="form-select" value={b.apunte.periodicidad} onChange={e => set({ periodicidad: e.target.value as Periodicidad })}>
                        {PERIODICIDADES.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                      </select>
                    </div>
                  )}
                  {b.apunte.plantilla !== 'prestamo' && b.apunte.periodicidad !== 'unico' && (
                    <div className="form-group">
                      <label className="form-label" htmlFor="ap-hasta">Hasta (opcional)</label>
                      <input id="ap-hasta" type="date" className="form-input" min={b.apunte.fecha} value={b.apunte.hasta ?? ''} onChange={e => set({ hasta: e.target.value || undefined })} />
                    </div>
                  )}
                </div>

                {b.apunte.plantilla === 'nomina' && (
                  <div className="form-row apunte-cifras">
                    {([['bruto', 'Sueldo bruto'], ['irpf', 'Retención IRPF'], ['ssTrabajador', 'SS del trabajador'], ['ssEmpresa', 'SS de la empresa']] as const).map(([k, t]) => (
                      <div key={k} className="form-group">
                        <label className="form-label" htmlFor={`ap-${k}`}>{t}</label>
                        <input id={`ap-${k}`} className="form-input" inputMode="decimal" value={b.nomina[k]} onChange={e => setB({ ...b, nomina: { ...b.nomina, [k]: e.target.value } })} />
                      </div>
                    ))}
                  </div>
                )}

                {b.apunte.plantilla === 'amortizacion' && (
                  <div className="form-row apunte-cifras">
                    <div className="form-group">
                      <label className="form-label" htmlFor="ap-valor">Valor del bien</label>
                      <input id="ap-valor" className="form-input" inputMode="decimal" value={b.amort.valor}
                        onChange={e => { const valor = e.target.value; const cuota = num(valor) && num(b.amort.anios) ? String(cuotaAmortizacion(num(valor), num(b.amort.anios), b.apunte.periodicidad)) : b.amort.cuota; setB({ ...b, amort: { ...b.amort, valor, cuota } }); }} />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="ap-anios">Años de vida útil</label>
                      <input id="ap-anios" className="form-input" inputMode="numeric" value={b.amort.anios}
                        onChange={e => {
                          const anios = e.target.value;
                          const ok = num(b.amort.valor) && num(anios);
                          const cuota = ok ? String(cuotaAmortizacion(num(b.amort.valor), num(anios), b.apunte.periodicidad)) : b.amort.cuota;
                          const hasta = ok && b.apunte.periodicidad !== 'unico' ? sumarMeses(b.apunte.fecha, Math.round(num(anios) * 12) - PERIODICIDADES.find(p => p.id === b.apunte.periodicidad)!.meses) : b.apunte.hasta;
                          setB({ ...b, amort: { ...b.amort, anios, cuota }, apunte: { ...b.apunte, hasta } });
                        }} />
                    </div>
                    <div className="form-group">
                      <label className="form-label required" htmlFor="ap-cuota">Cuota por periodo</label>
                      <input id="ap-cuota" className="form-input" inputMode="decimal" value={b.amort.cuota} onChange={e => setB({ ...b, amort: { ...b.amort, cuota: e.target.value } })} />
                    </div>
                  </div>
                )}

                {b.apunte.plantilla === 'prestamo' && (
                  <>
                    <div className="form-row apunte-cifras">
                      <div className="form-group">
                        <label className="form-label required" htmlFor="ap-principal">Importe prestado</label>
                        <input id="ap-principal" className="form-input" inputMode="decimal" value={b.prestamo.principal} onChange={e => setB({ ...b, prestamo: { ...b.prestamo, principal: e.target.value } })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="ap-interes">Interés anual (%)</label>
                        <input id="ap-interes" className="form-input" inputMode="decimal" value={b.prestamo.interes} onChange={e => setB({ ...b, prestamo: { ...b.prestamo, interes: e.target.value } })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label required" htmlFor="ap-meses">Plazo (meses)</label>
                        <input id="ap-meses" className="form-input" inputMode="numeric" value={b.prestamo.meses} onChange={e => setB({ ...b, prestamo: { ...b.prestamo, meses: e.target.value } })} />
                      </div>
                    </div>
                    <label className="recor-interruptor" style={{ fontWeight: 400 }}>
                      <input type="checkbox" checked={b.prestamo.conIngreso} onChange={e => setB({ ...b, prestamo: { ...b.prestamo, conIngreso: e.target.checked } })} />
                      Apuntar también la entrada del dinero en el banco el día de la firma
                    </label>
                    {previa.prestamo && !problema && (
                      <p className="form-hint">Cuota: <strong>{formatCurrency(cuotaPrestamo(previa.prestamo))}</strong> al mes. Abajo, la primera; cada mes baja el interés y sube el capital.</p>
                    )}
                  </>
                )}

                {b.apunte.plantilla === 'libre' && (
                  <div className="apunte-libre">
                    {b.libres.map((l, i) => (
                      <div key={i} className="apunte-libre-fila">
                        <input className="form-input mono" placeholder="Cuenta (p. ej. 640)" aria-label={`Cuenta de la línea ${i + 1}`} value={l.cuenta}
                          onChange={e => setB({ ...b, libres: b.libres.map((x, j) => (j === i ? { ...x, cuenta: e.target.value } : x)) })} />
                        <input className="form-input" inputMode="decimal" placeholder="Debe" aria-label={`Debe de la línea ${i + 1}`} value={l.debe}
                          onChange={e => setB({ ...b, libres: b.libres.map((x, j) => (j === i ? { ...x, debe: e.target.value } : x)) })} />
                        <input className="form-input" inputMode="decimal" placeholder="Haber" aria-label={`Haber de la línea ${i + 1}`} value={l.haber}
                          onChange={e => setB({ ...b, libres: b.libres.map((x, j) => (j === i ? { ...x, haber: e.target.value } : x)) })} />
                        <button type="button" className="btn btn-ghost btn-icon" aria-label="Quitar la línea" disabled={b.libres.length <= 2}
                          onClick={() => setB({ ...b, libres: b.libres.filter((_, j) => j !== i) })}><X size={15} /></button>
                      </div>
                    ))}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setB({ ...b, libres: [...b.libres, { cuenta: '', debe: '', haber: '' }] })}>
                      <Plus size={14} /> Añadir línea
                    </button>
                  </div>
                )}

                <div className="apunte-previa">
                  <p className="conta-masa" style={{ margin: 0 }}>{b.apunte.plantilla === 'prestamo' ? 'Primera cuota' : 'Así queda el asiento'}</p>
                  {lineasPrevia.filter(l => /^\d{8}$/.test(l.cuenta)).map((l, i) => (
                    <div key={i} className="conta-linea">
                      <span><span className="mono">{l.cuenta}</span> {nombreCuenta(l.cuenta)}</span>
                      <span className="mono">{l.debe ? `${formatCurrency(l.debe)} D` : `${formatCurrency(l.haber)} H`}</span>
                    </div>
                  ))}
                  {problema && <p className="apunte-problema" role="alert">{problema}</p>}
                  {!problema && previa.plantilla !== 'prestamo' && previa.periodicidad !== 'unico' && (
                    <p className="form-hint">{fechasDe(previa, hoyIso).length} asiento(s) hasta hoy; los siguientes se apuntan solos.</p>
                  )}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setB(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={!!problema || guardando}>Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
