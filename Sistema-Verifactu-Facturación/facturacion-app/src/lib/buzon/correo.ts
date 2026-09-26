/**
 * EL CORREO QUE LLEGA AL BUZÓN DE FACTURAS
 *
 * El correo entrante lo recibe Postmark («Inbound») y lo manda a nuestro
 * webhook como JSON. Cada cuenta tiene su dirección con «+clave»:
 *   abc123+CLAVEDELACUENTA@inbound.postmarkapp.com
 * Postmark deja la parte de después del «+» en `MailboxHash`. De cada
 * correo sólo interesan los adjuntos que son una factura: PDF o foto.
 *
 * Campos que se usan del JSON de Postmark: `MailboxHash`, `ToFull[].Email`,
 * `FromFull.Email`, `From`, `Subject` y `Attachments[]` con `Name`,
 * `Content` (base64), `ContentType` y `ContentLength`.
 */

export const TIPOS_ADMITIDOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
export type TipoAdmitido = (typeof TIPOS_ADMITIDOS)[number];

/** Un adjunto de más de ~10 MB no es una factura (y no cabe en la bandeja). */
export const MAXIMO_BYTES = 10 * 1024 * 1024;

export interface AdjuntoFactura { nombre: string; mime: TipoAdmitido; contenido: string }

export interface CorreoEntrante {
  clave: string | null;
  remitente: string | null;
  asunto: string | null;
  adjuntos: AdjuntoFactura[];
  descartados: number;
}

const claveValida = (c: string) => /^[A-Za-z0-9_-]{16,64}$/.test(c);

/** El tipo de verdad: algunos correos mandan los PDF como «application/octet-stream». */
function tipoDe(nombre: string, contentType: string): TipoAdmitido | null {
  const ct = contentType.toLowerCase().split(';')[0].trim();
  if ((TIPOS_ADMITIDOS as readonly string[]).includes(ct)) return ct as TipoAdmitido;
  if (ct === 'image/jpg') return 'image/jpeg';
  const ext = nombre.toLowerCase().split('.').pop() ?? '';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return null;
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export function leerCorreoPostmark(json: any): CorreoEntrante {
  let clave: string | null = typeof json?.MailboxHash === 'string' && claveValida(json.MailboxHash) ? json.MailboxHash : null;
  if (!clave && Array.isArray(json?.ToFull)) {
    for (const d of json.ToFull) {
      const m = /\+([A-Za-z0-9_-]{16,64})@/.exec(String(d?.Email ?? ''));
      if (m) { clave = m[1]; break; }
    }
  }

  const adjuntos: AdjuntoFactura[] = [];
  let descartados = 0;
  for (const a of Array.isArray(json?.Attachments) ? json.Attachments : []) {
    const nombre = String(a?.Name ?? 'adjunto').slice(0, 200);
    const mime = tipoDe(nombre, String(a?.ContentType ?? ''));
    const contenido = typeof a?.Content === 'string' ? a.Content.replace(/\s/g, '') : '';
    const bytes = Number(a?.ContentLength) || Math.floor(contenido.length * 0.75);
    // Los logos de las firmas del correo son imágenes pequeñas: no son facturas.
    const logoDeFirma = mime !== 'application/pdf' && bytes < 15_000;
    if (!mime || !contenido || bytes > MAXIMO_BYTES || logoDeFirma) { descartados++; continue; }
    adjuntos.push({ nombre, mime, contenido });
  }

  const remitente = (json?.FromFull?.Email ?? json?.From ?? null) as string | null;
  return {
    clave,
    remitente: remitente ? String(remitente).slice(0, 200) : null,
    asunto: json?.Subject ? String(json.Subject).slice(0, 300) : null,
    adjuntos,
    descartados,
  };
}

/** La dirección de una cuenta a partir de la del servicio: «local+clave@dominio». */
export function direccionDeCuenta(base: string, clave: string): string | null {
  const m = /^([^@\s+]+)@([^@\s]+)$/.exec(base.trim());
  return m ? `${m[1]}+${clave}@${m[2]}` : null;
}
