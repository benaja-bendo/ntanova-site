// Le service worker de l'espace relais, écrit dans dist/relais/sw.js à la
// construction (outils/integration-relais.mjs), avec la liste des fichiers.
// Sa portée est /relais/ : il ne touche ni le site public ni l'administration.
// Il ne met jamais en cache une réponse d'un autre domaine (Supabase, Google).

const VERSION = '__VERSION__';
const FICHIERS = /* __FICHIERS__ */ [];
const CACHE = `relais-${VERSION}`;
const COQUILLE = '/relais/';

self.addEventListener('install', (evenement) => {
  evenement.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FICHIERS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evenement) => {
  evenement.waitUntil(
    caches
      .keys()
      .then((noms) =>
        Promise.all(
          noms.filter((n) => n.startsWith('relais-') && n !== CACHE).map((n) => caches.delete(n)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evenement) => {
  const requete = evenement.request;
  if (requete.method !== 'GET') return;
  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return;

  // La page d'abord depuis le cache : elle s'ouvre sans réseau, et une nouvelle
  // version arrive avec le prochain service worker.
  if (requete.mode === 'navigate' && url.pathname.startsWith(COQUILLE)) {
    evenement.respondWith(caches.match(COQUILLE).then((r) => r ?? fetch(requete)));
    return;
  }
  evenement.respondWith(caches.match(requete).then((r) => r ?? fetch(requete)));
});
