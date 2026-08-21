/// <reference lib="webworker" />

// Cast `self` to the correct Service Worker type to resolve TS errors
const sw = self as unknown as ServiceWorkerGlobalScope;

const PDF_CACHE_NAME = 'offline-pdf-cache-v1';

// Extensions this worker will serve from the offline cache. Kept as a literal
// rather than imported from src/app/lib/file-types.ts because the custom worker
// is compiled by next-pwa in its own pass, without the `@/` path alias.
// Keep in sync with ALLOWED_EXTENSIONS there.
const CACHEABLE_EXTENSIONS = [
  '.pdf',
  '.docx', '.pptx', '.xlsx',
  '.png', '.jpg', '.jpeg', '.webp', '.gif',
  '.txt', '.md',
];

const isCacheable = (pathname: string) => {
  const lower = pathname.toLowerCase();
  return CACHEABLE_EXTENSIONS.some((ext) => lower.endsWith(ext));
};

sw.addEventListener('message', async (event: ExtendableMessageEvent) => {
  if (!event.data) return;

  if (event.data.type === 'CACHE_PDF') {
    try {
      const cache = await caches.open(PDF_CACHE_NAME);
      
      // CRITICAL UPDATE: mode: 'cors' prevents massive Opaque Responses from R2
      const response = await fetch(event.data.url, {
        mode: 'cors',
        credentials: 'omit' // R2 does not require cookies
      });
      
      if (response.ok) {
        await cache.put(event.data.url, response.clone());
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ success: true });
        }
      } else {
        throw new Error('Network response was not ok');
      }
    } catch (err: any) {
      console.error("Failed to cache file:", err);
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ success: false, error: err.message });
      }
    }
  }

  if (event.data.type === 'REMOVE_PDF') {
    try {
      const cache = await caches.open(PDF_CACHE_NAME);
      await cache.delete(event.data.url);
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ success: true });
      }
    } catch (err) {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ success: false });
      }
    }
  }
});

sw.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url);
  
  // CRITICAL UPDATE: Removed the Supabase-specific path check.
  // Now intercepts any supported document request to support the new R2 URLs.
  // The CACHE_PDF / REMOVE_PDF message names are kept for wire compatibility
  // with service workers already installed on users' devices.
  if (isCacheable(url.pathname)) {
    event.respondWith(
      caches.open(PDF_CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse; // Serve from cache if available
          }
          
          // Use CORS for live fallback fetches as well
          const fetchRequest = new Request(event.request, {
            mode: 'cors',
            credentials: 'omit'
          });
          
          return fetch(fetchRequest);
        });
      })
    );
  }
});

// Adding an empty export ensures TypeScript treats this file as a module 
// and stops it from conflicting with standard DOM typings.
export {};