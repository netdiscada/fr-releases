// FR - service worker do site (PWA). Guarda o app inteiro no celular para abrir sem internet.
// O workflow "Lançar APK" troca 'dev' pela versão lançada: o arquivo muda, o navegador instala
// o SW novo, que baixa tudo de novo e apaga o cache antigo.
const VERSAO = '2026.10.19';
const CACHE = 'fr-' + VERSAO;

const ARQUIVOS = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './css/anim.css',
  './fonts/chakra-petch-700.woff2',
  './fonts/archivo.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './assets/template_FR.pdf',
  './vendor/pdf-lib.min.js',
  './vendor/firebase-app-compat.js',
  './vendor/firebase-auth-compat.js',
  './vendor/firebase-firestore-compat.js',
  './vendor/pdfjs/pdf.min.js',
  './vendor/pdfjs/pdf.worker.min.js',
  './js/csp.js',
  './js/versao.js',
  './js/config.js',
  './js/layout.js',
  './js/pdf.js',
  './js/db.js',
  './js/ui.js',
  './js/anim.js',
  './js/icones.js',
  './js/imprimir.js',
  './js/backup.js',
  './js/checklist.js',
  './js/frlista.js',
  './js/ficha.js',
  './js/dia.js',
  './js/adm.js',
  './js/chefe.js',
  './js/app.js',
];

self.addEventListener('install', event => {
  // cache: 'reload' passa por cima do cache HTTP do GitHub Pages (max-age 10 min)
  event.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ARQUIVOS.map(a => new Request(a, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(chaves => Promise.all(chaves.filter(k => k.startsWith('fr-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Firebase (banco e login) e o que for de fora não passam pelo cache
  if (url.origin !== self.location.origin) return;

  // Abrir o app: sempre a página guardada (com ou sem internet)
  if (req.mode === 'navigate') {
    event.respondWith(caches.match('./index.html', { cacheName: CACHE }).then(r => r || fetch(req)));
    return;
  }
  event.respondWith(
    caches.match(req, { cacheName: CACHE, ignoreSearch: true }).then(r => r || fetch(req))
  );
});
