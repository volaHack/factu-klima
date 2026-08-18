'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, TrendingUp } from 'lucide-react';
import {
  getCompanyCategories, regularizarCostes,
  type CategoryOption, type RentabilidadProducto,
} from '@/lib/storage';
import { formatCurrency } from '@/lib/utils';

type Agrupacion = 'producto' | 'familia' | 'todo';

/**
 * QUÉ DEJA CADA COSA
 *
 * Con los costes regularizados, no con los que se guardaron al vender. El
 * precio medio se movía sólo hacia delante y los papeles no llegan en orden:
 * se vende el lunes y la factura del proveedor llega el día 20 del mes
 * siguiente, así que la venta se quedaba apuntada con el coste que se supo
 * entonces —o con cero, si el producto era nuevo— y el margen salía inflado.
 *
 * Aquí se reconstruye el histórico en orden de fecha antes de sumar nada.
 */
export default function Rentabilidad() {
  const [filas, setFilas] = useState<RentabilidadProducto[]>([]);
  const [familias, setFamilias] = useState<CategoryOption[]>([]);
  const [familia, setFamilia] = useState('');
  const [agrupacion, setAgrupacion] = useState<Agrupacion>('producto');
  const [cargando, setCargando] = useState(true);

  // Se guarda de paso el precio medio corregido: no es un dato fiscal y
  // estaba mal, así que dejarlo mal sería raro.
  const traer = () => Promise.all([
    regularizarCostes({ guardarPmp: true }),
    getCompanyCategories(),
  ]);

  // La primera carga no toca el estado hasta tener los datos: hacerlo antes
  // dispara un renderizado de más, y el aviso de «cargando» ya sale porque
  // ese es el valor de salida. El centinela evita escribir en un componente
  // que ya no está en pantalla si alguien se va antes de que termine.
  useEffect(() => {
    let vivo = true;
    void (async () => {
      const [datos, cats] = await traer();
      if (!vivo) return;
      setFilas(datos);
      setFamilias(cats);
      setCargando(false);
    })();
    return () => { vivo = false; };
  }, []);

  // El botón de recalcular sí enseña el aviso otra vez, porque ahí la espera
  // sí es una respuesta a algo que se acaba de pulsar.
  const recalcular = async () => {
    setCargando(true);
    try {
      const [datos, cats] = await traer();
      setFilas(datos);
      setFamilias(cats);
    } finally {
      setCargando(false);
    }
  };

  const visibles = useMemo(
    () => (familia ? filas.filter(f => f.categoria === familia) : filas),
    [filas, familia],
  );

  const agrupadas = useMemo(() => {
    if (agrupacion === 'producto') {
      return visibles.map(f => ({
        clave: f.productId,
        nombre: `[${f.ref}] ${f.nombre}`,
        unidades: f.unidadesVendidas,
        ingresos: f.ingresos,
        coste: f.coste,
        margen: f.margen,
        aviso: f.tieneEstimados || f.huboDescubierto,
      }));
    }

    const por = new Map<string, {
      nombre: string; unidades: number; ingresos: number;
      coste: number; margen: number; aviso: boolean;
    }>();
    for (const f of visibles) {
      const clave = agrupacion === 'familia' ? f.categoria : 'todo';
      const nombre = agrupacion === 'familia'
        ? (familias.find(c => c.value === f.categoria)?.label ?? f.categoria)
        : 'Todos los productos';
      const acc = por.get(clave)
        ?? { nombre, unidades: 0, ingresos: 0, coste: 0, margen: 0, aviso: false };
      acc.unidades += f.unidadesVendidas;
      acc.ingresos += f.ingresos;
      acc.coste += f.coste;
      acc.margen += f.margen;
      acc.aviso = acc.aviso || f.tieneEstimados || f.huboDescubierto;
      por.set(clave, acc);
    }
    return [...por.entries()]
      .map(([clave, v]) => ({ clave, ...v }))
      .sort((a, b) => b.margen - a.margen);
  }, [visibles, agrupacion, familias]);

  const totales = useMemo(() => {
    const ingresos = visibles.reduce((s, f) => s + f.ingresos, 0);
    const coste = visibles.reduce((s, f) => s + f.coste, 0);
    return {
      ingresos, coste,
      margen: ingresos - coste,
      pct: ingresos > 0 ? ((ingresos - coste) / ingresos) * 100 : 0,
    };
  }, [visibles]);

  const conDescubierto = visibles.filter(f => f.huboDescubierto).length;

  if (cargando) {
    return (
      <div className="card">
        <p className="text-muted">Reconstruyendo el histórico de costes…</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="rentabilidad-cabeza">
        <h3 className="card-title rentabilidad-titulo">
          <TrendingUp size={16} /> Rentabilidad
        </h3>
        <div className="rentabilidad-controles">
          <select
            value={agrupacion}
            onChange={e => setAgrupacion(e.target.value as Agrupacion)}
            aria-label="Agrupar por"
          >
            <option value="producto">Por producto</option>
            <option value="familia">Por familia</option>
            <option value="todo">Todo junto</option>
          </select>
          <select
            value={familia}
            onChange={e => setFamilia(e.target.value)}
            aria-label="Filtrar por familia"
          >
            <option value="">Todas las familias</option>
            {familias.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void recalcular()}>
            <RefreshCw size={14} /> Recalcular
          </button>
        </div>
      </div>

      {conDescubierto > 0 && (
        <p className="rentabilidad-aviso">
          <AlertTriangle size={14} />
          {conDescubierto === 1
            ? 'Un producto se ha vendido más de lo que consta comprado. Puede que falte meter algún albarán de compra.'
            : `${conDescubierto} productos se han vendido más de lo que consta comprado. Puede que falten albaranes de compra.`}
        </p>
      )}

      <div className="rentabilidad-totales">
        <div><span>Ingresos</span><strong>{formatCurrency(totales.ingresos)}</strong></div>
        <div><span>Coste</span><strong>{formatCurrency(totales.coste)}</strong></div>
        <div>
          <span>Margen</span>
          <strong className={totales.margen >= 0 ? 'rentabilidad-bien' : 'rentabilidad-mal'}>
            {formatCurrency(totales.margen)} · {totales.pct.toFixed(1)}%
          </strong>
        </div>
      </div>

      <div className="table-container">
        <table className="table rentabilidad-tabla">
          <thead>
            <tr>
              <th>
                {agrupacion === 'producto' ? 'Producto'
                  : agrupacion === 'familia' ? 'Familia' : 'Conjunto'}
              </th>
              <th>Unidades</th>
              <th>Ingresos</th>
              <th>Coste</th>
              <th>Margen</th>
              <th>%</th>
            </tr>
          </thead>
          <tbody>
            {agrupadas.length === 0 && (
              <tr>
                <td colSpan={6} className="text-muted">No hay ventas que costear todavía.</td>
              </tr>
            )}
            {agrupadas.map(f => (
              <tr key={f.clave}>
                <td>
                  {f.nombre}
                  {f.aviso && (
                    <AlertTriangle
                      size={12}
                      className="rentabilidad-marca"
                      aria-label="Alguna venta se ha costeado con una compra posterior"
                    />
                  )}
                </td>
                <td>{f.unidades}</td>
                <td>{formatCurrency(f.ingresos)}</td>
                <td>{formatCurrency(f.coste)}</td>
                <td className={f.margen >= 0 ? 'rentabilidad-bien' : 'rentabilidad-mal'}>
                  {formatCurrency(f.margen)}
                </td>
                <td>{f.ingresos > 0 ? `${((f.margen / f.ingresos) * 100).toFixed(1)}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
