const STATIC_CACHE = "taxbook-static-v1";
const APP_CACHE = "taxbook-app-v1";
const API_CACHE = "taxbook-api-v1";
const PRIVATE_CACHES = [APP_CACHE, API_CACHE];
const ALL_CACHES = [STATIC_CACHE, ...PRIVATE_CACHES];

function isDashboardRoute(pathname) {
  return (
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/banking/review") ||
    pathname.startsWith("/dashboard/notifications") ||
    pathname.startsWith("/dashboard/expense-leaks")
  );
}

function isCacheableApi(pathname) {
  return (
    pathname.startsWith("/api/banking/transactions/review") ||
    pathname.startsWith("/api/alerts") ||
    pathname.startsWith("/api/expense-leaks")
  );
}

async function networkFirst(request, cacheName, fallbackResponse) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }

    if (fallbackResponse) {
      return fallbackResponse;
    }

    throw new Error("Network unavailable");
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    return cached;
  }

  const networkResponse = await networkFetch;
  if (networkResponse) {
    return networkResponse;
  }

  throw new Error("Network unavailable");
}

function buildOfflineHtml() {
  return new Response(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>TaxBook AI offline</title>
    <style>
      body {
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: linear-gradient(180deg, #f8fafc 0%, #eff6ff 100%);
        color: #0f172a;
      }
      main {
        width: min(540px, calc(100vw - 32px));
        background: white;
        border: 1px solid rgba(14, 165, 233, 0.15);
        border-radius: 24px;
        padding: 32px;
        box-shadow: 0 24px 64px rgba(15, 23, 42, 0.08);
      }
      h1 {
        margin: 0 0 12px;
        font-size: 1.8rem;
      }
      p {
        margin: 0 0 12px;
        line-height: 1.65;
      }
      a {
        color: #0891b2;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>You are offline</h1>
      <p>TaxBook saved a limited workspace snapshot for offline use, but this page was not cached yet.</p>
      <p>Reconnect to refresh the latest dashboard and transaction views, or go back to a page you opened earlier in this browser.</p>
      <p><a href="/dashboard">Return to dashboard</a></p>
    </main>
  </body>
</html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    }
  );
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(STATIC_CACHE));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => !ALL_CACHES.includes(name))
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CLEAR_PRIVATE_DATA") {
    return;
  }

  event.waitUntil(
    Promise.all(PRIVATE_CACHES.map((cacheName) => caches.delete(cacheName)))
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate" && isDashboardRoute(url.pathname)) {
    event.respondWith(networkFirst(request, APP_CACHE, buildOfflineHtml()));
    return;
  }

  if (isCacheableApi(url.pathname)) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  const isStaticAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/_next/image") ||
    /\.(?:css|js|png|jpg|jpeg|svg|webp|woff2?)$/i.test(url.pathname);

  if (isStaticAsset) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
  }
});
