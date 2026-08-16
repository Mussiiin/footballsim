// FootballSim — Service Worker (PWA)
// Estratégia: cache-first para assets estáticos, network-first para navegação.
// Atualização controlada: o SW novo NÃO toma conta sozinho — espera a página
// avisar (mensagem SKIP_WAITING após o usuário confirmar o banner). Assim quem
// está jogando não é derrubado no meio de uma partida sem consentimento.
const CACHE = 'footballsim-v4';
const CORE = ['./', './index.html', './manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE))
  );
  // sem skipWaiting automático: a decisão é do cliente via mensagem
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// o cliente (main.tsx) pede para ativar a nova versão após o usuário aceitar
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // navegação: tenta rede (sempre busca a versão mais recente), cai para cache (offline)
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // assets: cache-first com atualização em segundo plano
  e.respondWith(
    caches.match(req).then((cached) => {
      const fetched = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});
