'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getInvoices, getAlbaranes, getClients,
  revisarFacturas, revisarAlbaranes, firmaDePendientesDeAlmacen, EVENTO_GUARDADO_AQUI,
} from '@/lib/storage';
import type { Albaran, Invoice } from '@/lib/types';
import { colaDeAlmacen, type PedidoEnCola } from '@/lib/prepararPedidos';
import {
  novedades, avisosDeTanda, leerMemoria, guardarMemoria, marcarAvisados, leerPreferencias,
} from '@/lib/avisoPedidos';
import { usePerfiles } from '@/lib/perfilesCliente';
import { useToast } from '@/hooks/useToast';
import { posAudio } from '@/lib/posAudio';

/** Lo que se ve en la cola cambió de «visto» (la pantalla del almacén lo avisa). */
export const EVENTO_VISTOS = 'klima-almacen-vistos';

/** Cada cuánto se pregunta al servidor, con la pestaña a la vista. */
const CADA_MS = 45_000;

/** La cuenta con que se guarda lo visto; sin sesión, una sola para este equipo. */
export function useCuentaAvisos(): string | null {
  const { cargado, cuenta } = usePerfiles();
  return cargado ? (cuenta ?? 'sin-sesion') : null;
}

/**
 * La cola del almacén, siempre al día: se vuelve a leer cuando storage
 * avisa de que cambiaron los documentos, los albaranes o los clientes
 * (lo guardado aquí o lo que trae la revisión del servidor).
 */
export function useColaAlmacen(activo = true): {
  cola: PedidoEnCola[]; documentos: Invoice[]; albaranes: Albaran[]; cargando: boolean; recargar: () => Promise<void>;
} {
  const [estado, setEstado] = useState<{ cola: PedidoEnCola[]; documentos: Invoice[]; albaranes: Albaran[]; cargando: boolean }>(
    { cola: [], documentos: [], albaranes: [], cargando: true },
  );

  const recargar = useCallback(async () => {
    const [documentos, albaranes, clientes] = await Promise.all([getInvoices(), getAlbaranes(), getClients()]);
    setEstado({ cola: colaDeAlmacen({ documentos, albaranes, clientes }), documentos, albaranes, cargando: false });
  }, []);

  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    const leer = () => { recargar().catch(() => { if (vivo) setEstado(e => ({ ...e, cargando: false })); }); };
    leer();
    const eventos = ['klima-invoices-updated', 'klima-albaranes-updated', 'klima-clients-updated'];
    for (const e of eventos) window.addEventListener(e, leer);
    return () => {
      vivo = false;
      for (const e of eventos) window.removeEventListener(e, leer);
    };
  }, [activo, recargar]);

  return { ...estado, recargar };
}

/**
 * Lo que hace que el almacén se entere sin recargar. Se monta una vez, en
 * el menú lateral, que está en todas las pantallas:
 *
 *   · cada medio minuto largo, con la pestaña a la vista (y al volver a
 *     ella o recuperar la red), pregunta al servidor por una huella pequeña
 *     de lo pendiente (firmaDePendientesDeAlmacen); si cambió, hace la
 *     lectura de siempre y storage avisa a todas las pantallas;
 *   · con la cola nueva, decide qué es nuevo (lib/avisoPedidos), lo avisa
 *     y devuelve cuántos quedan sin ver, para el número del menú.
 *
 * No hay realtime de Supabase en el programa; esto usa el mismo camino
 * que useRevisarAlVolver, pero sin bajarse todas las facturas cada vez.
 */
export function usePedidosNuevos(activo: boolean): { sinVer: number } {
  const cuenta = useCuentaAvisos();
  const encendido = activo && cuenta !== null;
  const { cola, cargando } = useColaAlmacen(encendido);
  const [sinVer, setSinVer] = useState(0);
  const { addToast } = useToast();
  const router = useRouter();
  const firma = useRef<string | null>(null);

  // Lo que se guarda en este equipo no le avisa a él mismo.
  useEffect(() => {
    if (!encendido || !cuenta) return;
    const alGuardar = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      if (id) guardarMemoria(cuenta, marcarAvisados(leerMemoria(cuenta), [id]));
    };
    window.addEventListener(EVENTO_GUARDADO_AQUI, alGuardar);
    return () => window.removeEventListener(EVENTO_GUARDADO_AQUI, alGuardar);
  }, [encendido, cuenta]);

  // Qué es nuevo, cada vez que cambia la cola o se marca algo como visto.
  useEffect(() => {
    if (!encendido || !cuenta || cargando) return;
    const mirar = () => {
      const n = novedades(cola, leerMemoria(cuenta));
      guardarMemoria(cuenta, n.memoria);
      setSinVer(n.sinVer);
      if (!n.paraAvisar.length) return;
      const pref = leerPreferencias();
      if (!pref.avisos) return;
      for (const t of avisosDeTanda(n.paraAvisar)) {
        addToast({
          type: 'info', title: t.titulo, message: t.mensaje, duration: 9000,
          accion: { etiqueta: 'Ver', alPulsar: () => router.push('/preparar-pedidos') },
        });
      }
      // El mismo tono corto que aparcar una venta en el TPV. Si el
      // navegador aún no deja sonar (nadie ha tocado la página), no suena.
      if (pref.sonido) posAudio.playHold();
    };
    mirar();
    window.addEventListener(EVENTO_VISTOS, mirar);
    return () => window.removeEventListener(EVENTO_VISTOS, mirar);
  }, [encendido, cuenta, cola, cargando, addToast, router]);

  // El sondeo ligero.
  useEffect(() => {
    if (!encendido) return;
    let vivo = true;
    const revisar = async () => {
      if (document.visibilityState !== 'visible') return;
      const nueva = await firmaDePendientesDeAlmacen();
      if (!vivo || nueva === null) return;
      const antes = firma.current;
      firma.current = nueva;
      if (antes !== null && antes !== nueva) await Promise.all([revisarFacturas(), revisarAlbaranes()]);
    };
    void revisar();
    const cada = setInterval(() => { void revisar(); }, CADA_MS);
    const alVolver = () => { void revisar(); };
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('online', alVolver);
    return () => {
      vivo = false;
      clearInterval(cada);
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('online', alVolver);
    };
  }, [encendido]);

  return { sinVer: encendido ? sinVer : 0 };
}
