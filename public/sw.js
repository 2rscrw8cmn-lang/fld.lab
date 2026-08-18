const CACHE_PREFIX = "fld-lab-shell";
const CACHE_VERSION = "v1";
const CACHE_NAME = `${CACHE_PREFIX}-${CACHE_VERSION}`;
const CORE_ASSETS = [
  "/manifest.webmanifest",
  "/brand/fld-lab-horizontal-dark.svg",
  "/brand/fld-lab-stacked-dark.svg",
  "/icons/fld-lab-180.png",
  "/icons/fld-lab-192.png",
  "/icons/fld-lab-512.png",
];

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const response = await fetch("/", { cache: "reload" });
  if (!response.ok) throw new Error("Could not cache fld.LAB app shell.");

  await cache.put("/", response.clone());
  const html = await response.text();
  const assetUrls = Array.from(html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g), (match) => match[1]);
  await Promise.allSettled([...CORE_ASSETS, ...assetUrls].map((url) => cache.add(url)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put("/", response.clone());
          }
          return response;
        })
        .catch(async () => (await caches.match("/")) ?? Response.error()),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached ?? fetch(request).then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    })),
  );
});
