// Service worker: la app funciona sin conexión.
// Estrategia: red primero y, si falla, caché. Así los cambios de contenido llegan en cuanto hay
// conexión y, sin ella, se usa la última versión descargada.
const CACHE = 'estudani-v22';
const PRECACHE = [
  './',
  'index.html',
  'css/styles.css',
  'js/app.js',
  'js/store.js',
  'js/autoglos.js',
  'js/markup.js',
  'js/visual.js',
  'js/iconos.js',
  'js/normaliza.js',
  'data/temas.json',
  'data/glosario.json',
  'data/tema01.json',
  'data/tema01-visual.json',
  'data/examen2025.json',
  'data/leyes.json',
  'data/zaragoza.json',
  'data/examen2025-supuestos.json',
  'data/tema13.json',
  'data/tema13-visual.json',
  'data/tema17.json',
  'data/tema17-visual.json',
  'data/tema18.json',
  'data/tema18-visual.json',
  'data/tema19.json',
  'data/tema19-visual.json',
  'data/tema04.json',
  'data/tema04-visual.json',
  'data/tema05.json',
  'data/tema05-visual.json',
  'data/tema06.json',
  'data/tema06-visual.json',
  'data/tema07.json',
  'data/tema07-visual.json',
  'data/tema08.json',
  'data/tema08-visual.json',
  'data/tema14.json',
  'data/tema14-visual.json',
  'data/tema10.json',
  'data/tema10-visual.json',
  'data/tema11.json',
  'data/tema11-visual.json',
  'data/tema16.json',
  'data/tema16-visual.json',
  'data/tema09.json',
  'data/tema09-visual.json',
  'data/tema03.json',
  'data/tema03-visual.json',
  'data/tema02.json',
  'data/tema02-visual.json',
  'data/tema15.json',
  'data/tema15-visual.json',
  'data/tema20.json',
  'data/tema20-visual.json',
  'data/tema12.json',
  'data/tema12-visual.json',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('index.html')))
  );
});
