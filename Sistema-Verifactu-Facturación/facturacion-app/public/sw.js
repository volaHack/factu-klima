// ============================================================
// SERVICE WORKER — Offline-First PWA
// Cache First for static assets, Network First for API
// Precaches all app routes for full offline navigation
// ============================================================

const CACHE_NAME = 'facturacion-pwa-v2';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.ico',
];

const APP_ROUTES = [
  '/dashboard',
  '/facturas',
  '/clientes',
  '/productos',
  '/informes',
  '/ajustes',
  '/login',
];

// Install: precache essential assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([...STATIC_ASSETS, ...APP_ROUTES]);
    }).catch((err) => {
      console.warn('SW: Some assets failed to precache:', err);
      // Still cache what we can
      return caches.open(CACHE_NAME).then((cache) => {
        return cache.addAll(STATIC_ASSETS);
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
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

  // Skip OAuth callbacks
  if (url.pathname.startsWith('/auth/callback')) return;

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
        .catch(() => {
          return caches.match(event.request).then((cachedResponse) => {
            // Return cached page, or fallback to dashboard
            return cachedResponse || caches.match('/dashboard');
          });
        })
    );
    return;
  }

  // For static assets (JS, CSS, images): Cache First
  if (
    url.pathname.startsWith('/_next/') ||
    url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|ico|woff2?|ttf|eot)$/)
  ) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(event.request).then((response) => {
          if (!response || response.status !== 200) return response;
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        });
      })
    );
    return;
  }

  // For everything else: Network First with cache fallback
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
      .catch(() => {
        return caches.match(event.request);
      })
  );
});

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

// Push notification support (future)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
