import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptCertificateBlob } from '@/lib/verifactu/certificateEncryption';
import { ENDPOINTS, enviarSobreSoap, type EntornoAeat } from '@/lib/verifactu/clienteAeat';
import { sobreRegFactu, MAX_REGISTROS_POR_ENVIO, type Registro } from '@/lib/verifactu/registroXml';
import {
  problemasDelRegistro, registroAltaDesdeFila, registroAnulacionDesdeFila,
  sistemaInformaticoDe, type FilaFactura, type FilaRegistro,
} from '@/lib/verifactu/mapeo';
import { estadoLocalDeLinea, parsearRespuestaAeat, resumirRespuesta } from '@/lib/verifactu/respuestaAeat';
import { productorDePlataforma } from '@/lib/plataforma/productor';
import { avisoNifDistinto, certificadoValeParaNif } from '@/lib/verifactu/titular';
import { ESTADOS_PENDIENTES } from '@/lib/verifactu/entorno';
import { todasLasFilas } from '@/lib/porTandas';
import { esNombreImpuesto, impuestoDeFactura, type NombreImpuesto } from '@/lib/impuesto';

const TAMANO_LOTE = 100;

/** Lo que dura la reserva de un envío: más que el `maxDuration` de la ruta (120 s). */
const BLOQUEO_MS = 5 * 60_000;
/** Si la AEAT no dice cuánto esperar, lo que su control de flujo pide por defecto. */
const ESPERA_POR_DEFECTO_S = 60;

type Resultado = { estado: number; cuerpo: Record<string, unknown> };

/**
 * Manda a la AEAT los registros de facturación pendientes de un usuario.
 *
 * TRES REGLAS QUE MANDAN SOBRE EL RESTO:
 * 1. ORDEN: los registros salen por índice ascendente.
 * 2. UNA VEZ: lo que la AEAT ya aceptó no se reenvía.
 * 3. NADA SE DA POR HECHO: si la conexión falla a mitad, queda en pendiente.
 */
export async function enviarPendientes(
  db: SupabaseClient,
  userId: string,
): Promise<Resultado> {
  // ---------- Configuración ----------
  const { data: config } = await db
    .from('verifactu_config')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (!config?.activo) {
    return {
      estado: 400,
      cuerpo: {
        ok: false,
        error: 'El envío a la AEAT no está activado. Actívalo en la pantalla de Veri*Factu cuando tengas el certificado puesto.',
      },
    };
  }

  const entorno: EntornoAeat = config.entorno === 'produccion' ? 'produccion' : 'pruebas';

  // Con algo ya aceptado por la AEAT real no se vuelve a Pruebas: lo que
  // se emitiera después no llegaría nunca a Hacienda (ver lib/verifactu/entorno.ts).
  if (entorno === 'pruebas') {
    const { count } = await db.from('verifactu_registros')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('entorno', 'produccion')
      .in('estado', ['aceptado', 'aceptado_con_errores']);
    if (count) {
      return {
        estado: 400,
        cuerpo: {
          ok: false,
          error: 'Esta cuenta ya tiene registros aceptados en Producción y no puede volver a enviar a Pruebas. Cambia el entorno a Producción.',
        },
      };
    }
  }

  // ---------- Un solo envío a la vez por cuenta ----------
  //
  // El botón, el envío automático y una segunda pestaña podían mandar el
  // mismo lote a la vez. La reserva es una fila que sólo se puede coger si
  // está libre o caducada (la actualización es atómica en la base de datos).
  const ahora = new Date();
  const { data: reserva, error: errorReserva } = await db
    .from('verifactu_config')
    .update({ envio_bloqueado_hasta: new Date(ahora.getTime() + BLOQUEO_MS).toISOString() })
    .eq('user_id', userId)
    .or(`envio_bloqueado_hasta.is.null,envio_bloqueado_hasta.lt.${ahora.toISOString()}`)
    .select('user_id, siguiente_envio_en');
  if (errorReserva) {
    return {
      estado: 500,
      cuerpo: { ok: false, error: 'No se ha podido reservar el envío (¿falta aplicar la migración 078?). No se ha enviado nada.' },
    };
  }
  if (!reserva?.length) {
    return {
      estado: 409,
      cuerpo: { ok: false, error: 'Ya hay un envío a la AEAT en marcha para esta cuenta. Espera a que termine.' },
    };
  }

  try {
    // Control de flujo de la AEAT: entre un envío y el siguiente hay que
    // esperar lo que dijo en TiempoEsperaEnvio.
    const siguiente = (reserva[0] as { siguiente_envio_en?: string | null }).siguiente_envio_en;
    if (siguiente && new Date(siguiente).getTime() > ahora.getTime()) {
      return {
        estado: 429,
        cuerpo: {
          ok: false,
          error: `La AEAT pide esperar entre envíos. El siguiente puede salir a partir de las ${new Date(siguiente).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid' })}.`,
          siguienteEnvio: siguiente,
        },
      };
    }

    // Con la reserva cogida, nadie más está enviando: un registro que siga
    // «enviando» es de un envío que se cortó (reinicio, tiempo agotado) sin
    // saber qué contestó la AEAT. Vuelve a pendiente; si ya había entrado,
    // la AEAT responderá «duplicado» y quedará como «consta_en_aeat».
    await db.from('verifactu_registros')
      .update({ estado: 'pendiente', descripcion_error: 'El envío anterior se interrumpió sin respuesta de la AEAT. Se vuelve a enviar.' })
      .eq('user_id', userId)
      .eq('estado', 'enviando');

    return await enviarConReserva(db, userId, entorno, config);
  } finally {
    await db.from('verifactu_config').update({ envio_bloqueado_hasta: null }).eq('user_id', userId);
  }
}

/** Apunta cuándo puede salir el siguiente envío (TiempoEsperaEnvio de la AEAT). */
async function apuntarEspera(db: SupabaseClient, userId: string, segundos: number | null): Promise<void> {
  const s = segundos != null && segundos >= 0 ? segundos : ESPERA_POR_DEFECTO_S;
  await db.from('verifactu_config')
    .update({ siguiente_envio_en: new Date(Date.now() + s * 1000).toISOString() })
    .eq('user_id', userId);
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
async function enviarConReserva(db: SupabaseClient, userId: string, entorno: EntornoAeat, config: any): Promise<Resultado> {
  const { data: ajustes } = await db
    .from('company_settings')
    .select('business_name, nif, igic_enabled')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!ajustes?.nif?.trim() || !ajustes.business_name?.trim()) {
    return {
      estado: 400,
      cuerpo: {
        ok: false,
        error: 'Falta el nombre o el NIF de tu empresa en Ajustes. Sin eso no se puede identificar quién factura.',
      },
    };
  }

  // El productor del software es la plataforma para todas las cuentas: si
  // está configurado en Administración, manda sobre lo que tenga la cuenta.
  // Sólo el de la plataforma: lo que cada cuenta hubiera escrito en su
  // pantalla (de cuando se le preguntaba) no vale, porque el productor es
  // el fabricante del programa y no quien lo usa.
  const productor = await productorDePlataforma();
  if (!productor?.nombre || !productor.nif) {
    return {
      estado: 400,
      cuerpo: {
        ok: false,
        error: 'Falta que el fabricante del programa complete sus datos de productor (Administración → Configuración). Sin ellos la AEAT rechaza el registro.',
      },
    };
  }
  const configSistema = {
    ...config,
    productor_nombre: productor.nombre,
    productor_nif: productor.nif,
    nombre_sistema: productor.sistemaNombre,
    id_sistema: productor.sistemaId,
    version_sistema: productor.sistemaVersion,
  };

  let sistema;
  try {
    sistema = sistemaInformaticoDe(configSistema, userId);
  } catch (e) {
    return {
      estado: 400,
      cuerpo: {
        ok: false,
        error: e instanceof Error ? e.message : 'Configuración incompleta',
      },
    };
  }

  // ---------- Certificado ----------
  const { data: cert } = await db
    .from('verifactu_certificates')
    .select('id, certificate_data, certificate_password_encrypted, subject_name')
    .eq('user_id', userId)
    .eq('is_valid', true)
    .eq('is_revoked', false)
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!cert) {
    return {
      estado: 400,
      cuerpo: {
        ok: false,
        error: 'No hay ningún certificado cargado. Súbelo en la pantalla de Veri*Factu.',
      },
    };
  }
  // Con el certificado de otro NIF la AEAT rechaza el envío entero en la
  // cabecera (4104). Mejor decirlo aquí, sin gastar un envío, y sin que el
  // envío automático lo reintente cada noche.
  if (certificadoValeParaNif(cert.subject_name, ajustes.nif) === false) {
    return {
      estado: 400,
      cuerpo: { ok: false, error: avisoNifDistinto(cert.subject_name, ajustes.nif) },
    };
  }
  if (!cert.certificate_password_encrypted) {
    return {
      estado: 400,
      cuerpo: {
        ok: false,
        error: 'El certificado guardado es anterior a la integración con la AEAT y no lleva la contraseña cifrada. Vuelve a subirlo para poder enviarlo.',
      },
    };
  }

  let credencial;
  try {
    credencial = {
      pfx: decryptCertificateBlob(cert.certificate_data as string),
      passphrase: decryptCertificateBlob(cert.certificate_password_encrypted as string).toString('utf8'),
    };
  } catch {
    return {
      estado: 500,
      cuerpo: {
        ok: false,
        error: 'No se ha podido descifrar el certificado en el servidor. Vuelve a subirlo.',
      },
    };
  }

  // ---------- Lo que está pendiente ----------
  const { data: pendientes, error: errorConsulta } = await db
    .from('verifactu_registros')
    .select('*')
    .eq('user_id', userId)
    // En Producción también lo que sólo llegó a Pruebas: la cadena tiene
    // que estar entera en la AEAT real, desde el primer registro.
    .or(entorno === 'produccion'
      ? `estado.in.(${ESTADOS_PENDIENTES.join(',')}),entorno.eq.pruebas`
      : `estado.in.(${ESTADOS_PENDIENTES.join(',')})`)
    .order('indice', { ascending: true })
    .limit(TAMANO_LOTE);

  if (errorConsulta) {
    return {
      estado: 500,
      cuerpo: {
        ok: false,
        error: 'No se han podido leer los registros pendientes.',
      },
    };
  }
  if (!pendientes?.length) {
    return {
      estado: 200,
      cuerpo: {
        ok: true,
        enviados: 0,
        mensaje: 'No hay nada pendiente de enviar.',
      },
    };
  }

  const lote = (pendientes as FilaRegistro[]).slice(0, MAX_REGISTROS_POR_ENVIO);

  // ---------- Datos de las facturas ----------
  const idsFactura = [...new Set(lote.map(r => r.invoice_id))];
  const [{ data: facturas }, { data: tramos }, { data: lineas }, { data: anteriores }] = await Promise.all([
    db.from('invoices')
      .select('id, client_name, client_nif, client_vat_number, es_intracomunitaria, clave_regimen_iva, impuesto, tipo, documento_origen_number, documento_origen_id, issue_date, notes, datos_extras')
      .in('id', idsFactura),
    todasLasFilas((desde, hasta) => db.from('invoice_tax_breakdown').select('invoice_id, rate, base_amount, tax_amount')
      .in('invoice_id', idsFactura).order('invoice_id').order('id').range(desde, hasta)),
    todasLasFilas((desde, hasta) => db.from('invoice_line_items').select('invoice_id, product_name')
      .in('invoice_id', idsFactura).order('invoice_id').order('sort_order', { ascending: true }).order('id').range(desde, hasta)),
    // Sólo el registro inmediatamente anterior a cada uno del lote, que es
    // el que se encadena: pedir «todos los anteriores» se quedaba en los
    // 1.000 primeros y, pasado el registro 1.000, el encadenamiento salía vacío.
    db.from('verifactu_registros')
      .select('indice, id_emisor, num_serie, fecha_expedicion')
      .eq('user_id', userId)
      .in('indice', [...new Set(lote.map(r => r.indice - 1))]),
  ]);

  const porFactura = new Map((facturas ?? []).map(f => [f.id, f as unknown as FilaFactura]));
  const porIndice = new Map((anteriores ?? []).map(r => [r.indice as number, r]));

  // ---------- Validar antes de abrir la conexión ----------
  const rechazadasEnCasa: Array<{ numero: string; problemas: string[] }> = [];
  const enviables: FilaRegistro[] = [];

  for (const registro of lote) {
    const problemas = problemasDelRegistro(registro, porFactura.get(registro.invoice_id) ?? null);
    if (problemas.length) rechazadasEnCasa.push({ numero: registro.num_serie, problemas });
    else enviables.push(registro);
  }

  if (!enviables.length) {
    return {
      estado: 400,
      cuerpo: {
        ok: false,
        enviados: 0,
        error: 'Ninguno de los registros pendientes se puede enviar todavía.',
        problemas: rechazadasEnCasa,
      },
    };
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
        datos: {
          // Un alta que la AEAT rechazó y que se ha corregido sale como subsanación.
          subsanacion: r.estado === 'subsanar',
          ...registroAltaDesdeFila({
          registro: r,
          factura: porFactura.get(r.invoice_id)!,
          tramos: (tramos ?? []).filter(t => t.invoice_id === r.invoice_id),
          lineas: (lineas ?? []).filter(l => l.invoice_id === r.invoice_id),
          nombreRazonEmisor: ajustes.business_name,
          // El impuesto con que se emitió la factura; en las anteriores a
          // la 077, que no lo guardan, el régimen de la empresa.
          igic: impuestoDeFactura(
            { impuesto: esNombreImpuesto(porFactura.get(r.invoice_id)!.impuesto) ? porFactura.get(r.invoice_id)!.impuesto as NombreImpuesto : null },
            { igicEnabled: ajustes.igic_enabled ?? false },
          ) === 'IGIC',
          anterior: datosAnterior,
          }),
        },
      };
    });

    sobre = sobreRegFactu(
      { obligadoEmision: { nombreRazon: ajustes.business_name, nif: ajustes.nif } },
      registros,
      sistema,
    );
  } catch (e) {
    return {
      estado: 500,
      cuerpo: {
        ok: false,
        error: e instanceof Error ? e.message : 'No se ha podido construir el envío',
      },
    };
  }

  // ---------- Enviar ----------
  const idsEnviables = enviables.map(r => r.id);
  await db.from('verifactu_registros')
    .update({ estado: 'enviando', enviado_en: new Date().toISOString(), entorno })
    .in('id', idsEnviables);

  let respuestaHttp;
  try {
    respuestaHttp = await enviarSobreSoap(ENDPOINTS[entorno], sobre, credencial);
  } catch (e) {
    const motivo = e instanceof Error ? e.message : 'Error de red desconocido';
    await apuntarEspera(db, userId, null);
    await Promise.all(enviables.map(r => db.from('verifactu_registros')
      .update({ estado: 'pendiente', descripcion_error: motivo, intentos: (r.intentos ?? 0) + 1 })
      .eq('id', r.id)));
    return {
      estado: 502,
      cuerpo: {
        ok: false,
        error: motivo,
        enviados: 0,
      },
    };
  }

  // ---------- Interpretar ----------
  const respuesta = parsearRespuestaAeat(respuestaHttp.cuerpo);
  const ahora = new Date().toISOString();
  await apuntarEspera(db, userId, respuesta.tiempoEsperaEnvio);

  if (respuesta.fallo || (!respuesta.estadoEnvio && respuestaHttp.estado !== 200)) {
    const motivo = respuesta.fallo?.mensaje
      ?? `La AEAT ha respondido con un código ${respuestaHttp.estado} que no se ha podido interpretar.`;
    await db.from('verifactu_registros')
      .update({
        estado: 'error_envio', respondido_en: ahora, descripcion_error: motivo,
        respuesta_cruda: respuestaHttp.cuerpo.slice(0, 20000),
      })
      .in('id', idsEnviables);
    return {
      estado: 502,
      cuerpo: {
        ok: false,
        error: motivo,
        enviados: 0,
        estadoHttp: respuestaHttp.estado,
      },
    };
  }

  const clave = (numSerie: string, operacion: string) => `${numSerie.trim()}|${operacion.toLowerCase()}`;
  const porClave = new Map(
    respuesta.lineas.map(l => [clave(l.numSerieFactura, l.operacion || 'alta'), l]),
  );

  let aceptados = 0, conAvisos = 0, rechazados = 0, sinRespuesta = 0, yaConstaban = 0;

  for (const registro of enviables) {
    const candidata = porClave.get(clave(registro.num_serie, registro.tipo_registro === 'alta' ? 'alta' : 'anulacion'));
    // Nada se da por aceptado si la línea no es, sin duda, la de este
    // registro: mismo número, misma operación y mismo emisor.
    const linea = candidata && (!candidata.idEmisorFactura || candidata.idEmisorFactura.trim() === String(registro.id_emisor ?? '').trim())
      ? candidata
      : undefined;

    if (!linea) {
      sinRespuesta++;
      await db.from('verifactu_registros')
        .update({
          estado: 'pendiente', respondido_en: ahora,
          descripcion_error: 'La AEAT no ha devuelto respuesta para este registro. Se reintentará.',
          intentos: (registro.intentos ?? 0) + 1,
        })
        .eq('id', registro.id);
      continue;
    }

    const estadoLocal = estadoLocalDeLinea(linea);
    if (estadoLocal === 'aceptado') aceptados++;
    else if (estadoLocal === 'aceptado_con_errores') conAvisos++;
    else if (estadoLocal === 'consta_en_aeat') yaConstaban++;
    else rechazados++;
    const descripcion = estadoLocal === 'consta_en_aeat'
      ? `La AEAT ya tenía este registro (estado «${linea.duplicado?.estado ?? 'sin indicar'}», petición ${linea.duplicado?.idPeticion ?? 'sin indicar'}). `
        + 'No se vuelve a enviar; compruébalo en la sede de la AEAT.'
      : linea.descripcionError;

    await db.from('verifactu_registros')
      .update({
        estado: estadoLocal,
        intentos: (registro.intentos ?? 0) + 1,
        respondido_en: ahora,
        csv_aeat: respuesta.csv,
        codigo_error: linea.codigoError,
        descripcion_error: descripcion,
        respuesta_cruda: respuestaHttp.cuerpo.slice(0, 20000),
        entorno,
      })
      .eq('id', registro.id);
  }

  return {
    estado: 200,
    cuerpo: {
      ok: true,
      entorno,
      csv: respuesta.csv,
      estadoEnvio: respuesta.estadoEnvio,
      enviados: enviables.length,
      aceptados,
      conAvisos,
      rechazados,
      sinRespuesta,
      yaConstaban,
      resumen: resumirRespuesta(respuesta),
      problemas: rechazadasEnCasa,
    },
  };
}
