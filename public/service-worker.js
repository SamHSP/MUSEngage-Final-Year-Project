const CACHE_VERSION = 'v1';
const STATIC_CACHE = `muse-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `muse-runtime-${CACHE_VERSION}`;
const API_CACHE = `muse-api-${CACHE_VERSION}`;

const APP_SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/MUSEngage.png',
  '/MUSEngage_red.png',
  '/MU_logo_512x512.svg',
  '/MU_logo_800x800.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(STATIC_CACHE);
        // Try to cache assets individually, don't fail if some don't exist
        await Promise.allSettled(
          APP_SHELL_ASSETS.map(async (asset) => {
            try {
              await cache.add(asset);
            } catch (error) {
              console.warn(`Failed to cache asset: ${asset}`, error);
            }
          })
        );
        await self.skipWaiting();
      } catch (error) {
        console.error('Service worker installation failed:', error);
        // Still skip waiting to activate even if caching fails
        await self.skipWaiting();
      }
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => ![STATIC_CACHE, RUNTIME_CACHE, API_CACHE].includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

const networkFirst = async (request, cacheName) => {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
};

const cacheFirst = async (request, cacheName) => {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  const response = await fetch(request);
  cache.put(request, response.clone());
  return response;
};

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          const cache = await caches.open(STATIC_CACHE);
          cache.put(request, networkResponse.clone());
          return networkResponse;
        } catch (error) {
          const cache = await caches.open(STATIC_CACHE);
          const cachedIndex = await cache.match('/index.html');
          if (cachedIndex) {
            return cachedIndex;
          }
          throw error;
        }
      })(),
    );
    return;
  }

  if (/\/api\//.test(url.pathname)) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  if (url.origin === self.location.origin) {
    const assetTypes = ['style', 'script', 'worker', 'image', 'font'];
    if (assetTypes.includes(request.destination)) {
      event.respondWith(cacheFirst(request, RUNTIME_CACHE));
      return;
    }
  }

  event.respondWith(networkFirst(request, RUNTIME_CACHE).catch(() => caches.match(request)));
});

self.addEventListener('push', (event) => {
  const payload = (() => {
    try {
      return event.data ? event.data.json() : {};
    } catch (error) {
      return {};
    }
  })();

  const title = payload.title || 'MUSEngage';
  const options = {
    body: payload.body || '',
    data: {
      url: payload.url || '/',
      notificationId: payload.notificationId,
      type: payload.type,
    },
    icon: '/MUSEngage.png',
    badge: '/MUSE_logo_512x512.png',
  };

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) {
        client.postMessage({ type: 'PUSH_NOTIFICATION', payload });
      }
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url;
  if (!targetUrl) {
    return;
  }

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of allClients) {
        if ('focus' in client) {
          await client.focus();
        }
        client.postMessage({ type: 'PUSH_NOTIFICATION', payload: { url: targetUrl } });
        if ('navigate' in client) {
          try {
            await client.navigate(targetUrl);
            return;
          } catch (error) {
            // ignore navigation errors
          }
        }
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});
