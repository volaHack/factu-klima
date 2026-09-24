// ============================================================
// SERVICE WORKER — la app entera disponible sin conexión
// ============================================================
//
// Antes sólo se podía abrir sin conexión lo que se hubiera visitado con
// conexión, y todo lo demás caía a la portada pública. En el móvil (la
// app de Android es esta misma web) eso dejaba al cajero sin TPV el día
// que se iba la cobertura. Ahora:
//
//   1. En cuanto hay sesión y red, la app manda la lista de sus pantallas
//      (PRECALENTAR) y aquí se guardan todas, con sus ficheros de código.
//   2. El código de Next (/_next/static/) lleva un hash en el nombre y no
//      cambia nunca: se sirve de la caché primero, al instante.
//   3. Las páginas se piden a la red, pero con un tope de 4 s: con una
//      cobertura mala, esperar a que la red falle son 30 s de pantalla en
//      blanco. Pasado el tope, la guardada.
//   4. Sin red y sin la página guardada, una pantalla propia con las que
//      sí están, en vez de la portada.
//
// Los datos NO pasan por aquí: viven en IndexedDB (lib/offlineDb.ts) y los
// sube a Supabase el motor de sincronización (lib/syncEngine.ts).

const VERSION = 'v6';
const CACHE_PAGINAS = `klima-paginas-${VERSION}`;
const CACHE_CODIGO = `klima-codigo-${VERSION}`;
const TOPE_RED_MS = 4000;

const PRECACHE = ['/login', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  // Uno a uno y no con addAll: addAll es atómico y un solo fallo dejaba
  // la caché vacía.
  event.waitUntil(
    caches.open(CACHE_PAGINAS).then((cache) =>
      Promise.all(PRECACHE.map((u) => cache.add(u).catch(() => {}))),
    ),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_PAGINAS && k !== CACHE_CODIGO)
          .map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

/** La red, pero sin esperar más de `ms`. */
function redConTope(request, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('tope')), ms);
    fetch(request).then(
      (r) => { clearTimeout(t); resolve(r); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/** Una página es de la app (no de la web pública) si no es de estas. */
function esPublica(path) {
  return path === '/' || /^\/(login|auth|aprobar|instalar|precios|legal)(\/|$)/.test(path);
}

async function paginaSinConexion() {
  const cache = await caches.open(CACHE_PAGINAS);
  const guardadas = (await cache.keys())
    .map((r) => new URL(r.url).pathname)
    .filter((p) => !esPublica(p) && !p.includes('.'))
    .sort();
  const enlaces = guardadas
    .map((p) => `<a href="${p}">${p.slice(1).replace(/-/g, ' ').replace(/\//g, ' › ') || 'inicio'}</a>`)
    .join('');
  return new Response(
    `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sin conexión · Klima</title>
<style>
body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#f2e7e0;color:#1a1216;display:grid;place-items:center;min-height:100vh}
main{max-width:420px;padding:28px}h1{font-size:22px;margin:0 0 6px}p{color:#4a3a40;margin:0 0 18px}
nav{display:grid;gap:8px}a{display:block;padding:12px 14px;border-radius:12px;background:#fff;color:#1a1216;text-decoration:none;text-transform:capitalize;box-shadow:0 1px 2px rgba(0,0,0,.08)}
@media (prefers-color-scheme:dark){body{background:#191013;color:#f5ecee}p{color:#c9b8be}a{background:#2a1d22;color:#f5ecee}}
</style>
<main><h1>Esta pantalla no está guardada</h1>
<p>No hay conexión y esta pantalla todavía no se había descargado al teléfono. Estas sí funcionan sin conexión; lo que hagas se sube solo al volver la red.</p>
<nav>${enlaces || '<p>Abre la app una vez con conexión para guardarla.</p>'}</nav></main></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

function vacia() {
  return new Response('', { status: 503, statusText: 'Sin conexión' });
}

// En desarrollo no se guarda nada: ahí los ficheros de /_next/static/ NO
// llevan hash y cambian con cada edición, así que servirlos de la caché
// enseñaba el CSS y el código de antes.
const EN_DESARROLLO = ['localhost', '127.0.0.1'].includes(self.location.hostname);

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (EN_DESARROLLO) return;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase y demás: fuera
  if (url.pathname.startsWith('/auth/') || url.pathname.startsWith('/api/')) return;

  // Código de Next con hash en el nombre: caché primero, nunca caduca.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(req).then((guardado) => guardado || fetch(req).then((r) => {
        if (r.ok) { const copia = r.clone(); caches.open(CACHE_CODIGO).then((c) => c.put(req, copia)); }
        return r;
      }).catch(vacia)),
    );
    return;
  }

  // Páginas: red con tope, si no la guardada, si no la de sin conexión.
  if (req.mode === 'navigate') {
    event.respondWith(
      redConTope(req, TOPE_RED_MS)
        .then((r) => {
          // No se guarda una redirección al login: sería guardar «sal de aquí».
          if (r.ok && !r.redirected) {
            const copia = r.clone();
            caches.open(CACHE_PAGINAS).then((c) => c.put(url.pathname, copia));
          }
          return r;
        })
        .catch(async () => (await caches.match(url.pathname)) || (await caches.match(req)) || paginaSinConexion()),
    );
    return;
  }

  // Lo demás (imágenes, fuentes, datos de navegación de Next): red, y si
  // no, lo guardado.
  event.respondWith(
    fetch(req)
      .then((r) => {
        if (r.ok && r.type === 'basic' && !url.search.includes('_rsc')) {
          const copia = r.clone();
          caches.open(CACHE_CODIGO).then((c) => c.put(req, copia));
        }
        return r;
      })
      .catch(async () => (await caches.match(req)) || vacia()),
  );
});

// ------------------------------------------------------------
// PRECALENTAR: guardar todas las pantallas de la app de una vez
// ------------------------------------------------------------

async function guardarPagina(ruta) {
  const r = await fetch(ruta, { credentials: 'same-origin', cache: 'no-store' });
  if (!r.ok || r.redirected) return 0;
  const html = await r.clone().text();
  await (await caches.open(CACHE_PAGINAS)).put(ruta, r);
  // Los ficheros de código que usa esa pantalla.
  const codigo = await caches.open(CACHE_CODIGO);
  const recursos = [...new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) || [])];
  await Promise.all(recursos.map(async (u) => {
    if (await codigo.match(u)) return;
    try { const x = await fetch(u); if (x.ok) await codigo.put(u, x); } catch { /* otra vez será */ }
  }));
  return 1;
}

self.addEventListener('message', (event) => {
  const datos = event.data || {};
  if (datos.type === 'SKIP_WAITING') self.skipWaiting();

  if (datos.type === 'PRECALENTAR' && Array.isArray(datos.rutas)) {
    event.waitUntil((async () => {
      let hechas = 0;
      // De cuatro en cuatro: sin saturar ni el servidor ni el teléfono.
      for (let i = 0; i < datos.rutas.length; i += 4) {
        const tanda = await Promise.all(datos.rutas.slice(i, i + 4).map((r) => guardarPagina(r).catch(() => 0)));
        hechas += tanda.reduce((a, b) => a + b, 0);
      }
      const clientes = await self.clients.matchAll();
      clientes.forEach((c) => c.postMessage({ type: 'PRECALENTADO', hechas, total: datos.rutas.length }));
    })());
  }

  if (datos.type === 'OLVIDAR_PAGINAS') {
    // Al cerrar sesión: las páginas guardadas llevan datos de esa cuenta.
    event.waitUntil(caches.delete(CACHE_PAGINAS));
  }
});

// Sincronización en segundo plano: Chrome la lanza al volver la red,
// aunque la app esté cerrada. Se avisa a la app para que suba la cola.
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-queue') {
    event.waitUntil(
      self.clients.matchAll({ includeUncontrolled: true }).then((clientes) => {
        clientes.forEach((c) => c.postMessage({ type: 'SYNC_REQUESTED' }));
      }),
    );
  }
});
