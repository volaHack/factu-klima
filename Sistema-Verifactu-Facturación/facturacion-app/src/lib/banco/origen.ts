/**
 * LA DIRECCIÓN PÚBLICA DE LA APP, VISTA DESDE UNA PETICIÓN
 *
 * Para la vuelta del banco hace falta la dirección EXACTA que el cliente ve
 * (la registrada en Enable Banking). Detrás de un proxy, como nginx en un
 * VPS, `request.url` puede decir `http://localhost:3000`: el banco
 * rechazaría la vuelta o devolvería al cliente a su propio ordenador.
 *
 * Por orden: `NEXT_PUBLIC_APP_URL`; las cabeceras que pone el proxy; el
 * `Host`; y la propia URL.
 */

const RE_HOST = /^[a-z0-9.-]+(?::\d{1,5})?$/i;
const esLocal = (host: string) => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);

export function origenPublico(request: Request): string {
  const declarada = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (declarada) return declarada.replace(/\/+$/, '');

  const url = new URL(request.url);
  const host = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').split(',')[0].trim();
  if (!host || !RE_HOST.test(host)) return url.origin;
  const proto = (request.headers.get('x-forwarded-proto') || '').split(',')[0].trim();
  const esquema = proto === 'http' || proto === 'https' ? proto : esLocal(host) ? url.protocol.replace(':', '') : 'https';
  return `${esquema}://${host}`;
}
