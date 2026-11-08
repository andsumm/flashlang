/* Public app files only. Private libraries and auth traffic are never cached here. */
const BUILD_VERSION = '__BUILD_VERSION__';
const CACHE_PREFIX = `flashlang-shell:${self.registration.scope}:`;
const CACHE_NAME = `${CACHE_PREFIX}${BUILD_VERSION}`;
const BASE_URL = new URL('./', self.location.href);
const SHELL_PATHS = [
  './',
  'index.html',
  'styles.css',
  'design.css',
  'config.js',
  'src/app.js',
  'src/data.js',
  'src/icons.js',
  'src/i18n.js',
  'src/importer.js',
  'src/study.js',
  'src/cloud.js',
  'manifest.webmanifest',
  'assets/favicon.svg',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/apple-touch-icon.png',
  'samples/cards.csv',
  'samples/cards.tsv',
];
const SHELL_URLS = SHELL_PATHS.map(path => new URL(path, BASE_URL).href);
const ALLOWED_PATHS = new Set(SHELL_URLS.map(url => new URL(url).pathname));
const AUTH_QUERY_KEYS = ['code', 'token', 'access_token', 'refresh_token', 'token_hash', 'error', 'error_code'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Bypass the browser HTTP cache when preparing a new app version.
    await cache.addAll(SHELL_URLS.map(url => new Request(url, {cache: 'reload'})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function networkFirst(request, url, navigation) {
  const cache = await caches.open(CACHE_NAME);
  const key = new URL(url.pathname, url.origin).href;
  const authRedirect = AUTH_QUERY_KEYS.some(name => url.searchParams.has(name));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    // Includes config.js: fresh configuration is fetched on every online load.
    const response = await fetch(request, {cache: 'no-store', signal: controller.signal});
    if (response.ok && !authRedirect && ALLOWED_PATHS.has(url.pathname)) {
      // A full/unavailable device cache must not break a successful online load.
      try { await cache.put(key, response.clone()); } catch { /* Keep the network response. */ }
    }
    if (!response.ok && navigation) {
      const fallback = await cache.match(new URL('index.html', BASE_URL).href);
      if (fallback) return fallback;
    }
    return response;
  } catch {
    const cached = navigation
      ? await cache.match(new URL('index.html', BASE_URL).href)
      : await cache.match(key);
    if (cached) return cached;
    return new Response('This file is not available offline yet. Reconnect and reopen Flashlang.', {
      status: 503,
      headers: {'Content-Type': 'text/plain; charset=utf-8'},
    });
  } finally {
    clearTimeout(timeout);
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  // All Supabase, authentication, CDN, and font requests pass straight through.
  if (request.method !== 'GET' || url.origin !== BASE_URL.origin || !url.pathname.startsWith(BASE_URL.pathname)) return;
  const navigation = request.mode === 'navigate';
  if (!navigation && !ALLOWED_PATHS.has(url.pathname)) return;
  event.respondWith(networkFirst(request, url, navigation));
});
