'use client';

/**
 * OFERTAS Y PROMOCIONES
 *
 * La pantalla donde se escribe el cartel. Todo lo que decide cuánto se
 * descuenta vive en `src/lib/ofertas.ts`; aquí sólo se rellenan las reglas y
 * se comprueba que dicen lo que uno cree que dicen.
 *
 * LA SIMULACIÓN NO ES UN ADORNO
 * -----------------------------
 * Una promoción mal configurada no se ve al guardarla: se ve tres días
 * después, en el arqueo, cuando el margen no cuadra. Por eso cada oferta
 * trae debajo una prueba en vivo —«si vendo N unidades a X euros, esto es lo
 * que le cobro»— con la misma función que usará el TPV. Quien la escribe ve
 * el resultado antes de que lo vea un cliente.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Tag, Plus, Trash2, Pencil, X, Save, Calculator, AlertTriangle, Power,
} from 'lucide-react';
import { getOfertas, saveOferta, deleteOferta, getProducts, getCompanyCategories } from '@/lib/storage';
import {
  aplicarOfertas, describirOferta, motivoNoVigente, NOMBRES_TIPO,
} from '@/lib/ofertas';
import type { Oferta, TipoOferta, AlcanceOferta, Product } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';

const DIAS = [
  { valor: 1, letra: 'L' }, { valor: 2, letra: 'M' }, { valor: 3, letra: 'X' },
  { valor: 4, letra: 'J' }, { valor: 5, letra: 'V' }, { valor: 6, letra: 'S' },
  { valor: 0, letra: 'D' },
];

/** Los ejemplos que se ofrecen al crear: lo que de verdad se pone en un cartel. */
const PLANTILLAS: { nombre: string; descripcion: string; oferta: Partial<Oferta> }[] = [
  {
    nombre: '3x2',
    descripcion: 'Llévate tres, paga dos.',
    oferta: { tipo: 'nxm', paramN: 3, paramM: 2 },
  },
  {
    nombre: '10 + 1 gratis',
    descripcion: 'Diez cajas y la undécima de regalo. El clásico del mayorista.',
    oferta: { tipo: 'nxm', paramN: 11, paramM: 10 },
  },
  {
    nombre: '2ª unidad al 50 %',
    descripcion: 'Se paga la primera entera y la segunda a mitad.',
    oferta: { tipo: 'unidad_siguiente', paramPorcentaje: 50 },
  },
  {
    nombre: 'Descuento por cantidad',
    descripcion: 'A más unidades, más porcentaje. Por tramos.',
    oferta: {
      tipo: 'escalado',
      tramos: [
        { desdeCantidad: 10, porcentaje: 5 },
        { desdeCantidad: 25, porcentaje: 10 },
        { desdeCantidad: 50, porcentaje: 15 },
      ],
    },
  },
  {
    nombre: 'Precio de promoción',
    descripcion: 'Un precio cerrado mientras dure la campaña.',
    oferta: { tipo: 'precio_fijo', paramImporte: 0 },
  },
  {
    nombre: 'Regalo por compra',
    descripcion: 'Al llevarse tantas unidades, se añade otro artículo.',
    oferta: { tipo: 'regalo', paramN: 6, regaloCantidad: 1 },
  },
];

function ofertaNueva(): Oferta {
  const ahora = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    nombre: '',
    tipo: 'nxm',
    alcance: 'producto',
    alcanceIds: [],
    paramN: 3,
    paramM: 2,
    activa: true,
    acumulable: false,
    prioridad: 0,
    createdAt: ahora,
    updatedAt: ahora,
  };
}

export default function OfertasPage() {
  const [ofertas, setOfertas] = useState<Oferta[]>([]);
  const [productos, setProductos] = useState<Product[]>([]);
  const [categorias, setCategorias] = useState<{ value: string; label: string }[]>([]);
  const [editando, setEditando] = useState<Oferta | null>(null);
  const [cargando, setCargando] = useState(true);
  const { success, error: avisarError } = useToast();

  const cargar = async () => {
    const [o, p, c] = await Promise.all([getOfertas(), getProducts(), getCompanyCategories()]);
    setOfertas(o);
    setProductos(p);
    setCategorias(c);
    setCargando(false);
  };

  // La carga va dentro de una función asíncrona propia y no como
  // `void cargar()`: así el estado se escribe siempre después de un await y
  // nunca en el cuerpo del efecto, que es lo que encadena renders.
  useEffect(() => {
    (async () => {
      const [o, p, c] = await Promise.all([getOfertas(), getProducts(), getCompanyCategories()]);
      setOfertas(o);
      setProductos(p);
      setCategorias(c);
      setCargando(false);
    })();
  }, []);

  const guardar = async (oferta: Oferta) => {
    if (!oferta.nombre.trim()) {
      avisarError('Ponle nombre', 'Es lo que verá el cliente en su ticket.');
      return;
    }
    try {
      await saveOferta({ ...oferta, updatedAt: new Date().toISOString() });
      setEditando(null);
      await cargar();
      success('Oferta guardada', 'Ya se aplica en el TPV y en las facturas nuevas.');
    } catch (err) {
      avisarError('No se ha podido guardar', err instanceof Error ? err.message : '');
    }
  };

  const alternarActiva = async (oferta: Oferta) => {
    await saveOferta({ ...oferta, activa: !oferta.activa, updatedAt: new Date().toISOString() });
    await cargar();
  };

  const borrar = async (oferta: Oferta) => {
    await deleteOferta(oferta.id);
    await cargar();
    success('Oferta borrada', 'Deja de aplicarse a partir de ahora.');
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title"><Tag size={22} /> Ofertas y promociones</h1>
          <p className="page-subtitle">
            El 3x2, la segunda unidad rebajada, «diez cajas y una gratis» o el precio de los martes.
            Se aplican solas en el TPV y en las facturas.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditando(ofertaNueva())}>
          <Plus size={16} /> Nueva oferta
        </button>
      </div>

      {cargando ? (
        <div className="skeleton" style={{ height: 120 }} />
      ) : ofertas.length === 0 ? (
        <div className="empty-state">
          <Tag size={40} />
          <h3>Todavía no hay ninguna oferta</h3>
          <p>Empieza por una de las de siempre y ajústala a lo tuyo.</p>
          <div className="ofertas-plantillas">
            {PLANTILLAS.map(p => (
              <button
                key={p.nombre}
                className="ofertas-plantilla"
                onClick={() => setEditando({ ...ofertaNueva(), nombre: p.nombre, ...p.oferta } as Oferta)}
              >
                <strong>{p.nombre}</strong>
                <span>{p.descripcion}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="ofertas-lista">
          {ofertas.map(oferta => {
            const motivo = motivoNoVigente(oferta);
            return (
              <div key={oferta.id} className={`ofertas-ficha ${oferta.activa ? '' : 'is-apagada'}`}>
                <div className="ofertas-ficha-cabecera">
                  <div>
                    <h3>{oferta.nombre}</h3>
                    <p className="ofertas-ficha-regla">{describirOferta(oferta)}</p>
                  </div>
                  <span className="badge">{NOMBRES_TIPO[oferta.tipo]}</span>
                </div>

                <p className="ofertas-ficha-alcance">
                  {oferta.alcance === 'todo' && 'A todo el catálogo'}
                  {oferta.alcance === 'producto' && `${oferta.alcanceIds.length} producto(s)`}
                  {oferta.alcance === 'categoria' && `Categorías: ${oferta.alcanceIds.join(', ') || '—'}`}
                </p>

                {motivo && (
                  <p className="ofertas-ficha-aviso">
                    <AlertTriangle size={13} /> Ahora mismo no se aplica: {motivo.toLowerCase()}
                  </p>
                )}

                <div className="ofertas-ficha-acciones">
                  <button className="btn btn-ghost btn-sm" onClick={() => alternarActiva(oferta)}>
                    <Power size={14} /> {oferta.activa ? 'Desactivar' : 'Activar'}
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditando(oferta)}>
                    <Pencil size={14} /> Editar
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => borrar(oferta)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editando && (
        <EditorOferta
          oferta={editando}
          productos={productos}
          categorias={categorias}
          onGuardar={guardar}
          onCerrar={() => setEditando(null)}
        />
      )}
    </div>
  );
}

// ============================================================
// EL EDITOR
// ============================================================

function EditorOferta({ oferta: inicial, productos, categorias, onGuardar, onCerrar }: {
  oferta: Oferta;
  productos: Product[];
  categorias: { value: string; label: string }[];
  onGuardar: (o: Oferta) => void;
  onCerrar: () => void;
}) {
  const [o, setO] = useState<Oferta>(inicial);
  const [pruebaCantidad, setPruebaCantidad] = useState(12);
  const [pruebaPrecio, setPruebaPrecio] = useState(10);

  const set = (cambios: Partial<Oferta>) => setO(prev => ({ ...prev, ...cambios }));

  /**
   * La prueba en vivo, con la MISMA función que usa el TPV.
   *
   * Se fuerza `activa` y se le quitan las fechas: aquí se está probando la
   * aritmética, no la vigencia. Que una oferta de agosto no descuente en
   * septiembre es correcto, pero no es lo que se quiere ver mientras se
   * escribe cuánto descuenta.
   */
  const prueba = useMemo(() => {
    const paraProbar: Oferta = {
      ...o, activa: true, desde: undefined, hasta: undefined,
      diasSemana: undefined, horaInicio: undefined, horaFin: undefined,
      alcance: 'todo', alcanceIds: [],
    };
    return aplicarOfertas(
      [{ id: 'x', productId: 'x', nombre: 'Artículo', cantidad: pruebaCantidad, precioUnitario: pruebaPrecio }],
      [paraProbar],
    );
  }, [o, pruebaCantidad, pruebaPrecio]);

  const alternarDia = (dia: number) => {
    const actuales = o.diasSemana ?? [];
    set({ diasSemana: actuales.includes(dia) ? actuales.filter(d => d !== dia) : [...actuales, dia] });
  };

  const alternarId = (id: string) => {
    const actuales = o.alcanceIds ?? [];
    set({ alcanceIds: actuales.includes(id) ? actuales.filter(x => x !== id) : [...actuales, id] });
  };

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{inicial.nombre ? 'Editar oferta' : 'Nueva oferta'}</h3>
          <button className="modal-close" onClick={onCerrar} aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label className="form-label required">Cómo se llama</label>
            <input
              className="form-input"
              placeholder="3x2 en refrescos"
              value={o.nombre}
              onChange={e => set({ nombre: e.target.value })}
            />
            <span className="form-hint">Es lo que verá el cliente en su ticket.</span>
          </div>

          <div className="form-group">
            <label className="form-label">Qué clase de oferta es</label>
            <select className="form-select" value={o.tipo} onChange={e => set({ tipo: e.target.value as TipoOferta })}>
              {(Object.keys(NOMBRES_TIPO) as TipoOferta[]).map(t => (
                <option key={t} value={t}>{NOMBRES_TIPO[t]}</option>
              ))}
            </select>
          </div>

          <CamposDelTipo o={o} set={set} productos={productos} />

          {/* --- La prueba --- */}
          <div className="ofertas-prueba">
            <div className="ofertas-prueba-titulo"><Calculator size={14} /> Pruébala antes de guardarla</div>
            <div className="ofertas-prueba-campos">
              <label>
                Vendo
                <input
                  className="form-input" type="number" min={1}
                  value={pruebaCantidad}
                  onChange={e => setPruebaCantidad(Math.max(1, Number(e.target.value) || 1))}
                />
                uds.
              </label>
              <label>
                a
                <input
                  className="form-input" type="number" min={0} step="0.01"
                  value={pruebaPrecio}
                  onChange={e => setPruebaPrecio(Math.max(0, Number(e.target.value) || 0))}
                />
                € cada una
              </label>
            </div>
            <div className="ofertas-prueba-resultado">
              <div><span>Sin oferta</span><strong>{formatCurrency(prueba.lineas[0]?.importeSinOfertas ?? 0)}</strong></div>
              <div><span>Se le cobra</span><strong className="es-precio">{formatCurrency(prueba.lineas[0]?.importe ?? 0)}</strong></div>
              <div><span>Se ahorra</span><strong className="es-ahorro">{formatCurrency(prueba.ahorroTotal)}</strong></div>
            </div>
            {prueba.aplicadas.length > 0 && (
              <p className="ofertas-prueba-detalle">{prueba.aplicadas[0].detalle}</p>
            )}
            {prueba.aplicadas.length === 0 && (
              <p className="ofertas-prueba-detalle">Con esa cantidad no entra la oferta.</p>
            )}
            {prueba.regalos.length > 0 && (
              <p className="ofertas-prueba-detalle">
                Y se añaden {prueba.regalos[0].cantidad} × {prueba.regalos[0].nombre}.
              </p>
            )}
          </div>

          {/* --- Alcance --- */}
          <div className="form-group">
            <label className="form-label">A qué se aplica</label>
            <select
              className="form-select"
              value={o.alcance}
              onChange={e => set({ alcance: e.target.value as AlcanceOferta, alcanceIds: [] })}
            >
              <option value="producto">A productos concretos</option>
              <option value="categoria">A una familia entera</option>
              <option value="todo">A todo el catálogo</option>
            </select>
          </div>

          {o.alcance === 'producto' && (
            <div className="ofertas-selector">
              {productos.slice(0, 80).map(p => (
                <label key={p.id} className={`ofertas-chip ${o.alcanceIds.includes(p.id) ? 'is-elegido' : ''}`}>
                  <input type="checkbox" hidden checked={o.alcanceIds.includes(p.id)} onChange={() => alternarId(p.id)} />
                  {p.name}
                </label>
              ))}
              {productos.length === 0 && <p className="form-hint">No hay productos en el catálogo todavía.</p>}
            </div>
          )}

          {o.alcance === 'categoria' && (
            <div className="ofertas-selector">
              {categorias.map(c => (
                <label key={c.value} className={`ofertas-chip ${o.alcanceIds.includes(c.value) ? 'is-elegido' : ''}`}>
                  <input type="checkbox" hidden checked={o.alcanceIds.includes(c.value)} onChange={() => alternarId(c.value)} />
                  {c.label}
                </label>
              ))}
            </div>
          )}

          {/* --- Cuándo --- */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Desde</label>
              <input className="form-input" type="date" value={o.desde ?? ''} onChange={e => set({ desde: e.target.value || undefined })} />
            </div>
            <div className="form-group">
              <label className="form-label">Hasta</label>
              <input className="form-input" type="date" value={o.hasta ?? ''} onChange={e => set({ hasta: e.target.value || undefined })} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Días de la semana</label>
            <div className="ofertas-dias">
              {DIAS.map(d => (
                <button
                  key={d.valor}
                  type="button"
                  className={`ofertas-dia ${(o.diasSemana ?? []).includes(d.valor) ? 'is-elegido' : ''}`}
                  onClick={() => alternarDia(d.valor)}
                >
                  {d.letra}
                </button>
              ))}
            </div>
            <span className="form-hint">Ninguno marcado: todos los días.</span>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">De la hora</label>
              <input className="form-input" type="time" value={o.horaInicio ?? ''} onChange={e => set({ horaInicio: e.target.value || undefined })} />
            </div>
            <div className="form-group">
              <label className="form-label">A la hora</label>
              <input className="form-input" type="time" value={o.horaFin ?? ''} onChange={e => set({ horaFin: e.target.value || undefined })} />
              <span className="form-hint">Puede cruzar la medianoche: de 22:00 a 02:00 vale.</span>
            </div>
          </div>

          {/* --- Condiciones --- */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Compra mínima del ticket (€)</label>
              <input
                className="form-input" type="number" min={0} step="0.01"
                value={o.minimoImporte ?? ''}
                onChange={e => set({ minimoImporte: e.target.value === '' ? undefined : Number(e.target.value) })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Unidades mínimas en la línea</label>
              <input
                className="form-input" type="number" min={0}
                value={o.minimoUnidades ?? ''}
                onChange={e => set({ minimoUnidades: e.target.value === '' ? undefined : Number(e.target.value) })}
              />
            </div>
          </div>

          <label className="form-check">
            <input type="checkbox" checked={o.acumulable} onChange={e => set({ acumulable: e.target.checked })} />
            <span>
              Se puede acumular con otras ofertas
              <em className="form-hint" style={{ display: 'block' }}>
                Sin marcar, compite con las demás y se le aplica al cliente la que más le ahorre.
              </em>
            </span>
          </label>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCerrar}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => onGuardar(o)}>
            <Save size={16} /> Guardar oferta
          </button>
        </div>
      </div>
    </div>
  );
}

/** Los campos que hacen falta cambian con la clase de oferta. */
function CamposDelTipo({ o, set, productos }: {
  o: Oferta;
  set: (c: Partial<Oferta>) => void;
  productos: Product[];
}) {
  const numero = (v: string) => (v === '' ? undefined : Number(v));

  if (o.tipo === 'nxm') {
    return (
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Se lleva</label>
          <input className="form-input" type="number" min={2} value={o.paramN ?? ''} onChange={e => set({ paramN: numero(e.target.value) })} />
        </div>
        <div className="form-group">
          <label className="form-label">Paga</label>
          <input className="form-input" type="number" min={1} value={o.paramM ?? ''} onChange={e => set({ paramM: numero(e.target.value) })} />
          <span className="form-hint">«Diez cajas y una gratis» son 11 y 10.</span>
        </div>
      </div>
    );
  }

  if (o.tipo === 'unidad_siguiente' || o.tipo === 'porcentaje') {
    return (
      <div className="form-group">
        <label className="form-label">Porcentaje de descuento</label>
        <input className="form-input" type="number" min={0} max={100} value={o.paramPorcentaje ?? ''} onChange={e => set({ paramPorcentaje: numero(e.target.value) })} />
      </div>
    );
  }

  if (o.tipo === 'importe' || o.tipo === 'precio_fijo') {
    return (
      <div className="form-group">
        <label className="form-label">
          {o.tipo === 'importe' ? 'Euros de descuento por unidad' : 'Precio de promoción por unidad'}
        </label>
        <input className="form-input" type="number" min={0} step="0.01" value={o.paramImporte ?? ''} onChange={e => set({ paramImporte: numero(e.target.value) })} />
      </div>
    );
  }

  if (o.tipo === 'escalado') {
    const tramos = o.tramos ?? [];
    const cambiar = (i: number, campo: 'desdeCantidad' | 'porcentaje', valor: number) => {
      const copia = tramos.map((t, j) => (i === j ? { ...t, [campo]: valor } : t));
      set({ tramos: copia });
    };
    return (
      <div className="form-group">
        <label className="form-label">Tramos por cantidad</label>
        {tramos.map((t, i) => (
          <div key={i} className="ofertas-tramo">
            <span>Desde</span>
            <input className="form-input" type="number" min={1} value={t.desdeCantidad} onChange={e => cambiar(i, 'desdeCantidad', Number(e.target.value) || 0)} />
            <span>uds.</span>
            <input className="form-input" type="number" min={0} max={100} value={t.porcentaje} onChange={e => cambiar(i, 'porcentaje', Number(e.target.value) || 0)} />
            <span>%</span>
            <button className="btn btn-ghost btn-sm" onClick={() => set({ tramos: tramos.filter((_, j) => j !== i) })}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => set({ tramos: [...tramos, { desdeCantidad: 10, porcentaje: 5 }] })}
        >
          <Plus size={14} /> Añadir tramo
        </button>
        <span className="form-hint">Se aplica el tramo más alto que se alcance, no la suma de todos.</span>
      </div>
    );
  }

  if (o.tipo === 'regalo') {
    return (
      <>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Por cada… unidades</label>
            <input className="form-input" type="number" min={1} value={o.paramN ?? ''} onChange={e => set({ paramN: numero(e.target.value) })} />
          </div>
          <div className="form-group">
            <label className="form-label">Se regalan… unidades</label>
            <input className="form-input" type="number" min={1} value={o.regaloCantidad ?? ''} onChange={e => set({ regaloCantidad: numero(e.target.value) })} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Qué se regala</label>
          <select
            className="form-select"
            value={o.regaloProductId ?? ''}
            onChange={e => {
              const p = productos.find(x => x.id === e.target.value);
              set({ regaloProductId: e.target.value || undefined, regaloNombre: p?.name });
            }}
          >
            <option value="">Elige un artículo…</option>
            {productos.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <span className="form-hint">El regalo se propone al cobrar; lo añade el cajero, no aparece solo.</span>
        </div>
      </>
    );
  }

  return null;
}
