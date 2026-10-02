// Necesario para que Chrome ofrezca "Instalar app". Siempre busca la versión más nueva en internet.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function () {});
