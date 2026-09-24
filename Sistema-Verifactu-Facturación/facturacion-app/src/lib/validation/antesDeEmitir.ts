'use client';

/**
 * EL ÚLTIMO REPASO ANTES DE EMITIR, CON LA PERSONA DELANTE
 *
 * `emitirFactura` (storage) ya se niega a sellar con errores de NIF o de
 * datos obligatorios. Esto va antes, en la pantalla, y añade lo que allí
 * no se puede hacer:
 *
 *  - Enseñar los AVISOS (no bloquean, pero conviene leerlos) y dejar
 *    elegir.
 *  - Preguntar al censo de la AEAT si el NIF es de ese nombre. Si la
 *    AEAT tiene otro nombre parecido, ofrecer usar el suyo (y corregir la
 *    ficha del cliente para la próxima vez).
 *
 * Devuelve la factura como hay que emitirla (quizá con el nombre
 * corregido) o `null` si no hay que emitir.
 */

import type { Invoice } from '../types';
import { getClientById, getCompanySettings, saveClient } from '../storage';
import { esClienteEspanol, normalizarNif, problemasParaEmitir, resumenDeErrores } from './identidad';
import { detectNifType, isValidNif } from './nif';
import { comprobarEnAeat, explicarEstado, impideEmitir } from './censoCliente';

export interface Avisador {
  /** Mensaje de error que para la emisión. */
  error: (titulo: string, detalle: string) => void;
  /** Pregunta sí / no. */
  confirmar: (texto: string) => boolean;
}

export const avisadorDeNavegador = (error: Avisador['error']): Avisador => ({
  error,
  confirmar: texto => window.confirm(texto),
});

export async function repasarAntesDeEmitir(factura: Invoice, avisar: Avisador): Promise<Invoice | null> {
  const [empresa, ficha] = await Promise.all([
    getCompanySettings(),
    factura.clientId ? getClientById(factura.clientId).catch(() => undefined) : Promise.resolve(undefined),
  ]);

  const problemas = problemasParaEmitir(factura, empresa, ficha?.country);
  const bloqueo = resumenDeErrores(problemas);
  if (bloqueo) {
    avisar.error('No se puede emitir', bloqueo);
    return null;
  }
  const avisos = problemas.filter(p => p.gravedad === 'aviso');

  // Al censo sólo se pregunta por NIF españoles bien formados.
  const nif = normalizarNif(factura.clientNif);
  const preguntable = nif && isValidNif(nif) && detectNifType(nif) !== 'UNKNOWN'
    && esClienteEspanol(ficha?.country) && !factura.esIntracomunitaria;

  if (preguntable) {
    const r = await comprobarEnAeat(nif, factura.clientName);
    if (r.tipo === 'resultado') {
      const { estado, nombreCenso } = r.resultado;
      if (impideEmitir(estado)) {
        avisar.error('La AEAT no reconoce al cliente', `${explicarEstado(estado, nif, nombreCenso)} Corrige la ficha del cliente antes de emitir: una factura emitida ya no se puede cambiar.`);
        return null;
      }
      const mismoNombre = !nombreCenso || nombreCenso.trim().toUpperCase() === factura.clientName.trim().toUpperCase();
      if (estado === 'similar' && mismoNombre) {
        // A las personas físicas la AEAT no les devuelve el nombre del censo
        // (protección de datos): sólo dice que el enviado se parece.
        avisar.error('El nombre no coincide con Hacienda', `La AEAT dice que ${nif} existe, pero «${factura.clientName}» sólo se parece al nombre que consta. Revisa nombre y apellidos en la ficha del cliente (completos, como en el DNI) antes de emitir.`);
        return null;
      }
      if (estado === 'similar' || (estado === 'identificado' && !mismoNombre && detectNifType(nif) === 'CIF')) {
        // En empresas la AEAT devuelve la razón social exacta: si no es la
        // que lleva la factura, se ofrece la suya.
        const usar = avisar.confirmar(
          `La AEAT tiene ${nif} a nombre de «${nombreCenso}» y la factura dice «${factura.clientName}».\n\n` +
          `Aceptar: emitir con «${nombreCenso}» y corregir la ficha del cliente.\nCancelar: no emitir todavía.`,
        );
        if (!usar) return null;
        factura = { ...factura, clientName: nombreCenso };
        if (ficha) await saveClient({ ...ficha, businessName: nombreCenso, updatedAt: new Date().toISOString() }).catch(() => undefined);
        return factura;
      }
      if (estado === 'identificado') return factura;
      // no_procesado / desconocido: como un fallo de conexión.
      if (!avisar.confirmar(`${explicarEstado(estado, nif, nombreCenso)}\n\n¿Emitir igualmente? Las comprobaciones de formato y de nombre ya han pasado.`)) return null;
      return factura;
    }
    if (r.tipo === 'fallo') {
      if (!avisar.confirmar(`${r.motivo}\n\n¿Emitir igualmente? El NIF tiene un formato correcto y cuadra con el nombre, pero no se ha podido confirmar con la AEAT.`)) return null;
      return factura;
    }
    // Sin certificado: se sigue con lo comprobado sin conexión.
  }

  if (avisos.length > 0) {
    const ok = avisar.confirmar(`Antes de emitir, revisa esto:\n\n${avisos.map(a => `• ${a.mensaje}`).join('\n')}\n\n¿Emitir igualmente?`);
    if (!ok) return null;
  }
  return factura;
}
