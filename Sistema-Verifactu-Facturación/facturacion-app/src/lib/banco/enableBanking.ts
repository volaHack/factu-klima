import 'server-only';

/**
 * CLIENTE DE ENABLE BANKING (open banking PSD2) — SOLO SERVIDOR
 *
 * Por qué Enable Banking: GoCardless (el antiguo Nordigen) cerró las altas
 * nuevas, y es el proveedor europeo con alta propia, pruebas y cobertura de
 * los bancos españoles.
 *
 * Autenticación: cada petición lleva un JWT firmado (RS256) con la clave
 * privada de la aplicación; `kid` es el id de la aplicación. Variables:
 *   ENABLE_BANKING_APP_ID       el id de la aplicación
 *   ENABLE_BANKING_PRIVATE_KEY  la clave privada en PEM (con saltos \n)
 * En el panel de Enable Banking, la aplicación tiene que tener registrada
 * la dirección de vuelta: https://TU-DOMINIO/api/banco/vuelta
 */

import crypto from 'node:crypto';
import type { TransaccionEnableBanking } from './conectado';

const API = 'https://api.enablebanking.com';

export function enableBankingConfigurado(): boolean {
  return !!process.env.ENABLE_BANKING_APP_ID && !!process.env.ENABLE_BANKING_PRIVATE_KEY;
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function jwt(): string {
  const appId = process.env.ENABLE_BANKING_APP_ID!;
  const clave = process.env.ENABLE_BANKING_PRIVATE_KEY!.replace(/\\n/g, '\n');
  const iat = Math.floor(Date.now() / 1000);
  const cabecera = b64url(JSON.stringify({ typ: 'JWT', alg: 'RS256', kid: appId }));
  const cuerpo = b64url(JSON.stringify({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat, exp: iat + 3600 }));
  const firma = crypto.createSign('RSA-SHA256').update(`${cabecera}.${cuerpo}`).sign(clave);
  return `${cabecera}.${cuerpo}.${b64url(firma)}`;
}

async function llamar<T>(ruta: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${API}${ruta}`, {
    ...init,
    headers: { Authorization: `Bearer ${jwt()}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    cache: 'no-store',
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`Enable Banking ${r.status}: ${texto.slice(0, 300)}`);
  return (texto ? JSON.parse(texto) : {}) as T;
}

export interface BancoDisponible {
  nombre: string;
  pais: string;
  logo: string | null;
  /** Segundos que como mucho dura la autorización en ese banco. */
  maxConsentimiento: number | null;
  empresas: boolean;
}

export async function bancosDe(pais = 'ES'): Promise<BancoDisponible[]> {
  const d = await llamar<{ aspsps: { name: string; country: string; logo?: string; maximum_consent_validity?: number; psu_types?: string[] }[] }>(
    `/aspsps?country=${encodeURIComponent(pais)}&service=AIS`,
  );
  return (d.aspsps ?? []).map(a => ({
    nombre: a.name, pais: a.country, logo: a.logo ?? null,
    maxConsentimiento: a.maximum_consent_validity ?? null,
    empresas: !a.psu_types || a.psu_types.includes('business'),
  })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/** Empieza la autorización: devuelve la dirección de la web del banco. */
export async function empezarAutorizacion(p: { banco: string; pais: string; state: string; vuelta: string; empresa: boolean; diasValidez: number }): Promise<string> {
  const d = await llamar<{ url: string }>('/auth', {
    method: 'POST',
    body: JSON.stringify({
      access: { valid_until: new Date(Date.now() + p.diasValidez * 86_400_000).toISOString() },
      aspsp: { name: p.banco, country: p.pais },
      state: p.state,
      redirect_url: p.vuelta,
      psu_type: p.empresa ? 'business' : 'personal',
    }),
  });
  return d.url;
}

export interface SesionBanco {
  sessionId: string;
  validoHasta: string | null;
  cuentas: { uid: string; iban: string | null; nombre: string | null; moneda: string | null }[];
}

export async function crearSesion(code: string): Promise<SesionBanco> {
  const d = await llamar<{
    session_id: string;
    access?: { valid_until?: string };
    accounts?: { uid: string; account_id?: { iban?: string }; name?: string; currency?: string }[];
  }>('/sessions', { method: 'POST', body: JSON.stringify({ code }) });
  return {
    sessionId: d.session_id,
    validoHasta: d.access?.valid_until ?? null,
    cuentas: (d.accounts ?? []).map(c => ({ uid: c.uid, iban: c.account_id?.iban ?? null, nombre: c.name ?? null, moneda: c.currency ?? null })),
  };
}

export async function borrarSesion(sessionId: string): Promise<void> {
  await llamar(`/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
}

/** Los movimientos desde una fecha, siguiendo las páginas (con tope). */
export async function transacciones(cuentaUid: string, desde: string): Promise<TransaccionEnableBanking[]> {
  const todas: TransaccionEnableBanking[] = [];
  let continuar: string | undefined;
  for (let pagina = 0; pagina < 20; pagina++) {
    const q = new URLSearchParams({ date_from: desde, ...(continuar ? { continuation_key: continuar } : {}) });
    const d = await llamar<{ transactions?: TransaccionEnableBanking[]; continuation_key?: string }>(
      `/accounts/${encodeURIComponent(cuentaUid)}/transactions?${q}`,
    );
    todas.push(...(d.transactions ?? []));
    continuar = d.continuation_key || undefined;
    if (!continuar) break;
  }
  return todas;
}
