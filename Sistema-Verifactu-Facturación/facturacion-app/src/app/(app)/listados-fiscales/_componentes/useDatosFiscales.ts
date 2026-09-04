'use client';

/**
 * Carga los datos reales del ejercicio y lleva el estado de período que
 * comparten todas las pantallas de modelo.
 *
 * `recargar()` existe porque volver a poner el mismo ejercicio no
 * dispararía el efecto: el botón «Recalcular» necesita un contador que
 * cambie siempre.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { cargarDatosFiscales, ejerciciosDisponibles, type DatosFiscales } from '@/lib/fiscal/FiscalDataService';
import type { Trimestre } from '@/lib/fiscal/tipos';

export function useDatosFiscales(ejercicioInicial?: number) {
  const hoy = new Date();
  const [ejercicio, setEjercicio] = useState(ejercicioInicial ?? hoy.getFullYear());
  const [trimestre, setTrimestre] = useState<Trimestre>(
    (Math.floor(hoy.getMonth() / 3) + 1) as Trimestre,
  );
  const [datos, setDatos] = useState<DatosFiscales | null>(null);
  const [cargando, setCargando] = useState(true);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vivo = true;
    (async () => {
      // El setState va dentro del async a propósito: hacerlo en el cuerpo
      // del efecto encadena renders.
      setCargando(true);
      const d = await cargarDatosFiscales(ejercicio);
      if (!vivo) return;
      setDatos(d);
      setCargando(false);
    })();
    return () => { vivo = false; };
  }, [ejercicio, recarga]);

  const ejercicios = useMemo(
    () => ejerciciosDisponibles(datos?.facturas ?? [], datos?.gastos ?? []),
    [datos],
  );

  const recargar = useCallback(() => setRecarga(n => n + 1), []);

  return {
    datos, cargando, ejercicio, setEjercicio, trimestre, setTrimestre, ejercicios, recargar,
  };
}
