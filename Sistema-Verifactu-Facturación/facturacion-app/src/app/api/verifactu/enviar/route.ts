/**
 * POST /api/verifactu/enviar — manda a la AEAT lo que haya pendiente.
 *
 * Todo pasa en el servidor porque el certificado tiene que descifrarse
 * para levantar el TLS mutuo, y la clave de descifrado no puede bajar al
 * navegador ni una sola vez.
 *
 * TRES REGLAS QUE MANDAN SOBRE EL RESTO
 *
 * 1. ORDEN. Los registros salen por índice de cadena ascendente. La
 *    cadena es lo que da valor a Veri*Factu: si el registro 7 llega
 *    antes que el 6, la AEAT no puede comprobar el encadenamiento.
 *
 * 2. UNA VEZ. Un registro que la AEAT ya ha aceptado —aunque sea «con
 *    errores»— no se reenvía nunca. Reenviarlo no lo arregla: crea un
 *    duplicado, y el duplicado sí es un problema.
 *
 * 3. NADA SE DA POR HECHO. Si la conexión se corta a mitad, el registro
 *    NO se marca como fallido: se queda pendiente y se anota el aviso.
 *    Puede haber llegado. Lo peor que puede hacer un sistema como éste
 *    es afirmar que algo se envió o que no se envió sin saberlo.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { decryptCertificateBlob } from '@/lib/verifactu/certificateEncryption';
import { ENDPOINTS, enviarSobreSoap, type EntornoAeat } from '@/lib/verifactu/clienteAeat';
import { sobreRegFactu, MAX_REGISTROS_POR_ENVIO, type Registro } from '@/lib/verifactu/registroXml';
import {
  problemasDelRegistro, registroAltaDesdeFila, registroAnulacionDesdeFila,
  sistemaInformaticoDe, type FilaFactura, type FilaRegistro,
} from '@/lib/verifactu/mapeo';
import { estadoLocalDe, parsearRespuestaAeat, resumirRespuesta } from '@/lib/verifactu/respuestaAeat';

// El envío abre una conexión TLS con la AEAT y espera; no hay nada que
// pre-renderizar aquí.
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Cuántos registros se mandan de una tacada. */
const TAMANO_LOTE = 100;

function error(mensaje: string, estado: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error: mensaje, ...extra }, { status: estado });
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return error('No autenticado', 401);

  // Un envío es una conexión con la Agencia Tributaria, no una consulta
  // barata. Diez por minuto es de sobra para el uso legítimo y corta en
  // seco un bucle accidental que mande mil veces lo mismo.
  if (!(await checkRateLimit(`verifactu-enviar:${user.id}`, 10, 60))) {
    return error('Demasiados envíos seguidos. Espera un minuto.', 429);
  }

  // ---------- Configuración ----------
  const { data: config } = await supabase
    .from('verifactu_config')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!config?.activo) {
    return error(
      'El envío a la AEAT no está activado. Actívalo en la pantalla de Veri*Factu cuando tengas el certificado puesto.',
      400,
    );
  }

  const entorno: EntornoAeat = config.entorno === 'produccion' ? 'produccion' : 'pruebas';

  const { data: ajustes } = await supabase
    .from('company_settings')
    .select('business_name, nif, igic_enabled')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!ajustes?.nif?.trim() || !ajustes.business_name?.trim()) {
    return error('Falta el nombre o el NIF de tu empresa en Ajustes. Sin eso no se puede identificar quién factura.', 400);
  }

  let sistema;
  try {
    sistema = sistemaInformaticoDe(config, user.id);
  } catch (e) {
    return error(e instanceof Error ? e.message : 'Configuración incompleta', 400);
  }

  // ---------- Certificado ----------
  const { data: cert } = await supabase
    .from('verifactu_certificates')
    .select('id, certificate_data, certificate_password_encrypted')
    .eq('user_id', user.id)
    .eq('is_valid', true)
    .eq('is_revoked', false)
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!cert) return error('No hay ningún certificado cargado. Súbelo en la pantalla de Veri*Factu.', 400);
  if (!cert.certificate_password_encrypted) {
    return error(
      'El certificado guardado es anterior a la integración con la AEAT y no lleva la contraseña cifrada. Vuelve a subirlo para poder enviarlo.',
      400,
    );
  }

  let credencial;
  try {
    credencial = {
      pfx: decryptCertificateBlob(cert.certificate_data as string),
      passphrase: decryptCertificateBlob(cert.certificate_password_encrypted as string).toString('utf8'),
    };
  } catch {
    return error('No se ha podido descifrar el certificado en el servidor. Vuelve a subirlo.', 500);
  }

  // ---------- Lo que está pendiente ----------
  // «rechazado» y «error_envio» vuelven a la cola; «aceptado» y
  // «aceptado_con_errores» no vuelven nunca (regla 2).
  const { data: pendientes, error: errorConsulta } = await supabase
    .from('verifactu_registros')
    .select('*')
    .eq('user_id', user.id)
    .in('estado', ['pendiente', 'error_envio', 'rechazado'])
    .order('indice', { ascending: true })
    .limit(TAMANO_LOTE);

  if (errorConsulta) return error('No se han podido leer los registros pendientes.', 500);
  if (!pendientes?.length) {
    return NextResponse.json({ ok: true, enviados: 0, mensaje: 'No hay nada pendiente de enviar.' });
  }

  const lote = (pendientes as FilaRegistro[]).slice(0, MAX_REGISTROS_POR_ENVIO);

  // ---------- Datos de las facturas ----------
  const idsFactura = [...new Set(lote.map(r => r.invoice_id))];
  const [{ data: facturas }, { data: tramos }, { data: lineas }, { data: anteriores }] = await Promise.all([
    supabase.from('invoices')
      .select('id, client_name, client_nif, client_vat_number, es_intracomunitaria, clave_regimen_iva, tipo, documento_origen_number, documento_origen_id, issue_date, notes, datos_extras')
      .in('id', idsFactura),
    supabase.from('invoice_tax_breakdown').select('invoice_id, rate, base_amount, tax_amount').in('invoice_id', idsFactura),
    supabase.from('invoice_line_items').select('invoice_id, product_name').in('invoice_id', idsFactura),
    // Para el bloque RegistroAnterior hace falta identificar al registro
    // previo, no sólo su huella.
    supabase.from('verifactu_registros')
      .select('indice, id_emisor, num_serie, fecha_expedicion')
      .eq('user_id', user.id)
      .lt('indice', lote[lote.length - 1].indice + 1),
  ]);

  const porFactura = new Map((facturas ?? []).map(f => [f.id, f as unknown as FilaFactura]));
  const porIndice = new Map((anteriores ?? []).map(r => [r.indice as number, r]));

  // ---------- Validar antes de abrir la conexión ----------
  // La AEAT rechaza el envío entero si una sola línea está mal. Las
  // facturas con problemas se apartan y las demás salen: dejar sin
  // presentar noventa y nueve facturas correctas porque una no tiene NIF
  // sería convertir un aviso en un problema.
  const rechazadasEnCasa: Array<{ numero: string; problemas: string[] }> = [];
  const enviables: FilaRegistro[] = [];

  for (const registro of lote) {
    const problemas = problemasDelRegistro(registro, porFactura.get(registro.invoice_id) ?? null);
    if (problemas.length) rechazadasEnCasa.push({ numero: registro.num_serie, problemas });
    else enviables.push(registro);
  }

  if (!enviables.length) {
    return NextResponse.json({
      ok: false,
      enviados: 0,
      error: 'Ninguno de los registros pendientes se puede enviar todavía.',
      problemas: rechazadasEnCasa,
    }, { status: 400 });
  }

  // ---------- Construir el sobre ----------
  let sobre: string;
  try {
    const registros: Registro[] = enviables.map(r => {
      const anterior = porIndice.get(r.indice - 1);
      const datosAnterior = r.huella_anterior && anterior
        ? { idEmisor: anterior.id_emisor as string, numSerie: anterior.num_serie as string, fecha: anterior.fecha_expedicion as string }
        : null;

      if (r.tipo_registro === 'anulacion') {
        return { tipo: 'anulacion', datos: registroAnulacionDesdeFila(r, datosAnterior) };
      }

      return {
        tipo: 'alta',
        datos: registroAltaDesdeFila({
          registro: r,
          factura: porFactura.get(r.invoice_id)!,
          tramos: (tramos ?? []).filter(t => t.invoice_id === r.invoice_id),
          lineas: (lineas ?? []).filter(l => l.invoice_id === r.invoice_id),
          nombreRazonEmisor: ajustes.business_name,
          igic: ajustes.igic_enabled ?? false,
          anterior: datosAnterior,
        }),
      };
    });

    sobre = sobreRegFactu(
      { obligadoEmision: { nombreRazon: ajustes.business_name, nif: ajustes.nif } },
      registros,
      sistema,
    );
  } catch (e) {
    return error(e instanceof Error ? e.message : 'No se ha podido construir el envío', 500);
  }

  // ---------- Enviar ----------
  const idsEnviables = enviables.map(r => r.id);
  await supabase.from('verifactu_registros')
    .update({ estado: 'enviando', enviado_en: new Date().toISOString(), entorno })
    .in('id', idsEnviables);

  let respuestaHttp;
  try {
    respuestaHttp = await enviarSobreSoap(ENDPOINTS[entorno], sobre, credencial);
  } catch (e) {
    // Regla 3: no se sabe si llegó. Vuelven a «pendiente» con el motivo
    // anotado, y el siguiente intento los recogerá. Si de verdad
    // llegaron, la AEAT contestará «duplicado» y quedará claro.
    const motivo = e instanceof Error ? e.message : 'Error de red desconocido';
    await Promise.all(enviables.map(r => supabase.from('verifactu_registros')
      .update({ estado: 'pendiente', descripcion_error: motivo, intentos: (r.intentos ?? 0) + 1 })
      .eq('id', r.id)));
    return error(motivo, 502, { enviados: 0 });
  }

  // ---------- Interpretar ----------
  const respuesta = parsearRespuestaAeat(respuestaHttp.cuerpo);
  const ahora = new Date().toISOString();

  if (respuesta.fallo || (!respuesta.estadoEnvio && respuestaHttp.estado !== 200)) {
    const motivo = respuesta.fallo?.mensaje
      ?? `La AEAT ha respondido con un código ${respuestaHttp.estado} que no se ha podido interpretar.`;
    await supabase.from('verifactu_registros')
      .update({
        estado: 'error_envio', respondido_en: ahora, descripcion_error: motivo,
        respuesta_cruda: respuestaHttp.cuerpo.slice(0, 20000),
      })
      .in('id', idsEnviables);
    return error(motivo, 502, { enviados: 0, estadoHttp: respuestaHttp.estado });
  }

  // Cada línea a su registro. Se casa por número de factura y tipo de
  // operación, que es lo que devuelve la AEAT.
  const clave = (numSerie: string, operacion: string) => `${numSerie.trim()}|${operacion.toLowerCase()}`;
  const porClave = new Map(
    respuesta.lineas.map(l => [clave(l.numSerieFactura, l.operacion || 'alta'), l]),
  );

  let aceptados = 0, conAvisos = 0, rechazados = 0, sinRespuesta = 0;

  for (const registro of enviables) {
    const linea = porClave.get(clave(registro.num_serie, registro.tipo_registro === 'alta' ? 'alta' : 'anulacion'));

    if (!linea) {
      // La AEAT no ha dicho nada de este registro. Se queda pendiente:
      // inventarle un resultado sería exactamente lo que este código no
      // debe hacer.
      sinRespuesta++;
      await supabase.from('verifactu_registros')
        .update({
          estado: 'pendiente', respondido_en: ahora,
          descripcion_error: 'La AEAT no ha devuelto respuesta para este registro. Se reintentará.',
          intentos: (registro.intentos ?? 0) + 1,
        })
        .eq('id', registro.id);
      continue;
    }

    const estadoLocal = estadoLocalDe(linea.estado);
    if (estadoLocal === 'aceptado') aceptados++;
    else if (estadoLocal === 'aceptado_con_errores') conAvisos++;
    else rechazados++;

    await supabase.from('verifactu_registros')
      .update({
        estado: estadoLocal,
        intentos: (registro.intentos ?? 0) + 1,
        respondido_en: ahora,
        csv_aeat: respuesta.csv,
        codigo_error: linea.codigoError,
        descripcion_error: linea.descripcionError,
        respuesta_cruda: respuestaHttp.cuerpo.slice(0, 20000),
        entorno,
      })
      .eq('id', registro.id);
  }

  return NextResponse.json({
    ok: true,
    entorno,
    csv: respuesta.csv,
    estadoEnvio: respuesta.estadoEnvio,
    enviados: enviables.length,
    aceptados,
    conAvisos,
    rechazados,
    sinRespuesta,
    resumen: resumirRespuesta(respuesta),
    problemas: rechazadasEnCasa,
  });
}
