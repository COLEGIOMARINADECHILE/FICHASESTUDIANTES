// Trayectoria Educativa: service worker (aplicación instalable en iPhone y Android).
// - Nunca guarda datos de estudiantes: las consultas al servidor (Apps Script, POST) no pasan por aquí.
// - La página se pide primero a internet (siempre la versión más nueva) y, sin conexión, se usa la copia guardada.
// - Archivos con versión (?v=...) y bibliotecas externas se guardan para abrir más rápido.
const VERSION = 'trayectoria-2026-12-17a';
const BASE = ['./', 'index.html', 'manifest.webmanifest', 'img/icons/icon-192.png', 'img/icons/icon-512.png', 'img/icons/apple-touch-icon.png', 'img/logo-colegio.png'];
const CDN = /^https:\/\/(unpkg\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(BASE.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const propio = url.origin === self.location.origin;
  if (!propio && !CDN.test(req.url)) return; // Google (ingreso), Apps Script y otros: directo a internet
  // Páginas: primero internet, sin conexión la copia guardada
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(VERSION).then(x => x.put('index.html', c)); return r; }).catch(() => caches.match('index.html').then(r => r || caches.match('./'))));
    return;
  }
  // Con versión o externos: copia guardada y, si no existe, internet
  if (url.searchParams.has('v') || !propio) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok || r.type === 'opaque') { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); } return r; })));
    return;
  }
  // Resto (imágenes, íconos): internet y, sin conexión, la copia
  e.respondWith(fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); } return r; }).catch(() => caches.match(req)));
});