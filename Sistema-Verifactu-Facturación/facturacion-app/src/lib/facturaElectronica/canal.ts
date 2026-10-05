/**
 * POR DÓNDE SALE LA FACTURA ELECTRÓNICA — SOLO SERVIDOR
 *
 * Un canal entrega la factura y las comunicaciones de estado. Hay dos:
 *
 *  - «simulado» (el que se usa ahora): hace todo lo que se haría de verdad
 *    menos mandarlo. Vuelve a leer el fichero como lo leería quien lo
 *    recibe, comprueba que es la factura que dice ser, y responde con un
 *    código propio que empieza por «SIM-». Nada sale del programa.
 *
 *  - «spfe» (la solución pública de la AEAT): la Orden HAC/1028/2026 la
 *    regula, pero el servicio y sus especificaciones técnicas los abre la
 *    AEAT por su cuenta. Hasta que esté conectado y probado en su entorno
 *    de pruebas, este canal no envía nada: deja la factura guardada como
 *    pendiente y lo dice. Así nunca se da por enviada una factura que no ha
 *    salido.
 */

import 'server-only';
import crypto from 'node:crypto';
import { leerFacturaElectronica } from './leer';
import type { EstadoFe, TipoComunicacion } from './estados';

export type NombreCanal = 'simulado' | 'spfe';

export interface ResultadoCanal {
  /** Entregado (o, en el simulado, comprobado como si se hubiera entregado). */
  ok: boolean;
  /** Si no ha salido pero sigue pendiente (no es un error de la factura). */
  pendiente?: boolean;
  codigo?: string;
  mensaje: string;
  respuesta: Record<string, unknown>;
}

export interface FacturaParaCanal {
  id: string;
  contenido: string;
  huella: string;
  numero: string;
  nifEmisor: string;
  total: number;
}

export interface ComunicacionParaCanal {
  id: string;
  tipo: TipoComunicacion;
  fechaHecho: string;
  importe?: number | null;
  motivo?: string | null;
  factura: { numero: string; nifEmisor: string; codigo?: string | null };
}

export interface Canal {
  nombre: NombreCanal;
  enviarFactura(f: FacturaParaCanal): Promise<ResultadoCanal>;
  comunicar(c: ComunicacionParaCanal): Promise<ResultadoCanal>;
}

const huellaDe = (t: string) => crypto.createHash('sha256').update(t, 'utf8').digest('hex');

const simulado: Canal = {
  nombre: 'simulado',
  async enviarFactura(f) {
    if (huellaDe(f.contenido) !== f.huella) {
      return { ok: false, mensaje: 'El fichero guardado no coincide con su huella.', respuesta: { simulado: true } };
    }
    let leida;
    try {
      [leida] = leerFacturaElectronica(f.contenido);
    } catch (e) {
      return { ok: false, mensaje: e instanceof Error ? e.message : 'No se ha podido leer la factura.', respuesta: { simulado: true } };
    }
    const errores: string[] = [];
    if (leida.numero !== f.numero) errores.push('el número no coincide');
    if (leida.emisor.nif.replace(/^ES/, '') !== f.nifEmisor.replace(/^ES/, '')) errores.push('el NIF del emisor no coincide');
    if (Math.abs(Math.abs(leida.total) - Math.abs(f.total)) > 0.02) errores.push('el total no coincide');
    if (leida.avisos.length) errores.push(...leida.avisos);
    if (errores.length) return { ok: false, mensaje: `No se admitiría: ${errores.join('; ')}.`, respuesta: { simulado: true, errores } };
    return {
      ok: true,
      codigo: `SIM-${f.huella.slice(0, 16).toUpperCase()}`,
      mensaje: 'Modo de pruebas: la factura es correcta y se ha guardado. No se ha enviado a la AEAT ni al cliente.',
      respuesta: { simulado: true, comprobadoEn: new Date().toISOString() },
    };
  },
  async comunicar(c) {
    return {
      ok: true,
      codigo: `SIM-${c.id.replace(/-/g, '').slice(0, 16).toUpperCase()}`,
      mensaje: 'Modo de pruebas: comunicación registrada. No se ha enviado a la AEAT ni a la otra parte.',
      respuesta: { simulado: true, comprobadoEn: new Date().toISOString() },
    };
  },
};

const NO_CONECTADO = 'La conexión con la solución pública de la AEAT todavía no está activada en el programa. '
  + 'Queda guardado y pendiente: saldrá cuando se active.';

const spfe: Canal = {
  nombre: 'spfe',
  async enviarFactura() {
    return { ok: false, pendiente: true, mensaje: NO_CONECTADO, respuesta: { spfe: 'no_conectado' } };
  },
  async comunicar() {
    return { ok: false, pendiente: true, mensaje: NO_CONECTADO, respuesta: { spfe: 'no_conectado' } };
  },
};

export const canalPara = (nombre: string | null | undefined): Canal => (nombre === 'spfe' ? spfe : simulado);

/** El estado que queda tras intentar enviar una factura emitida. */
export const estadoTrasEnvio = (r: ResultadoCanal): EstadoFe => (r.ok ? 'enviada' : r.pendiente ? 'generada' : 'error');
