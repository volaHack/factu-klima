// ============================================================
// SERVICE WORKER — Offline-First PWA (Network First for Build Chunks & HTML)
// ============================================================

const CACHE_NAME = 'facturacion-pwa-v5';
const STATIC_ASSETS = [
  '/',
  '/login',
  '/manifest.webmanifest',
  '/favicon.ico',
];

// Install: precache static assets.
//
// Se cachea uno a uno en vez de con cache.addAll porque addAll es atómico: si
// UN solo recurso falla, se pierde el precache entero. Pasó de verdad —
// /manifest.json se borró (ahora lo genera app/manifest.ts como
// /manifest.webmanifest), su petición fallaba, y la caché quedaba vacía. Sin
// nada cacheado, el fallback de navegación no encontraba nada que servir.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        STATIC_ASSETS.map((asset) =>
          cache.add(asset).catch((err) => {
            console.warn('SW: no se pudo precachear', asset, err);
          })
        )
      )
    )
  );
  self.skipWaiting();
});

// Activate: delete ALL old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch: strategy-based routing
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Skip Supabase API calls — handled by the sync engine
  if (url.hostname.includes('supabase.co')) return;

  // Skip OAuth & auth routes
  if (url.pathname.startsWith('/auth/')) return;

  // For navigation requests (HTML pages): Network First with cache fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(async () => {
          // NUNCA se puede resolver a undefined: respondWith(undefined) hace
          // que Chrome aborte la navegación y pinte su propia pantalla de
          // "This page couldn't load", que es justo lo que se veía al entrar
          // al dashboard después de iniciar sesión.
          const cached =
            (await caches.match(event.request)) || (await caches.match('/'));
          if (cached) return cached;
          return new Response(
            '<!doctype html><meta charset="utf-8">' +
              '<title>Sin conexión</title>' +
              '<p style="font:16px system-ui;padding:2rem">' +
              'No hay conexión y esta página no está guardada sin conexión. ' +
              'Vuelve a intentarlo cuando recuperes la red.</p>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        })
    );
    return;
  }

  // For Next.js build assets & static files: Network First with cache fallback
  // (Prevents stale build chunk 404s when deploying new versions to Vercel)
  if (
    url.pathname.startsWith('/_next/') ||
    url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|ico|woff2?|ttf|eot)$/)
  ) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(async () => {
          return (await caches.match(event.request)) || offlineResponse();
        })
    );
    return;
  }

  // For everything else: Network First
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(async () => {
        return (await caches.match(event.request)) || offlineResponse();
      })
  );
});

// Un fallo de red sin nada en caché tiene que devolver una Response de verdad.
// Si respondWith recibe undefined, el navegador da la petición por fallida: en
// una navegación pinta su pantalla de error, y en un chunk de Next provoca un
// ChunkLoadError que tumba la página entera.
function offlineResponse() {
  return new Response('', { status: 503, statusText: 'Sin conexión' });
}

// Background sync support
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-queue') {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'SYNC_REQUESTED' });
        });
      })
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
