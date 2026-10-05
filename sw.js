// Hace que la app abra sin señal y envía los registros guardados en cuanto vuelve la conexión,
// aunque la app esté cerrada (Android). Siempre intenta traer la versión más nueva de internet.
importScripts('config.js', 'cola.js');

var CACHE = 'registro-clientes-v9';
var BASICOS = ['./', 'index.html', 'oficina.html', 'config.js', 'api.js', 'cola.js', 'manifest.json', 'icon-192.png', 'icon-512.png', 'logo-bipa.png', 'logo-bipa-completo.png', 'logo-ritual.png', 'logo-bipa-blanco.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(BASICOS); }).catch(function () {}));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// Archivos de la app: primero internet (con límite de espera), si no hay señal la copia guardada.
// Letras de Google: primero la copia guardada.
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.match(req).then(function (r) {
      return r || fetch(req).then(function (res) { var c = res.clone(); caches.open(CACHE).then(function (k) { k.put(req, c); }); return res; });
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;
  e.respondWith(new Promise(function (ok) {
    var listo = false;
    function deCache() {
      return caches.match(req, { ignoreSearch: true }).then(function (r) { return r || caches.match('index.html'); });
    }
    var espera = setTimeout(function () { deCache().then(function (r) { if (r && !listo) { listo = true; ok(r); } }); }, 5000);
    fetch(req).then(function (res) {
      clearTimeout(espera);
      if (res.ok) { var c = res.clone(); caches.open(CACHE).then(function (k) { k.put(req, c); }); }
      if (!listo) { listo = true; ok(res); }
    }).catch(function () {
      clearTimeout(espera);
      deCache().then(function (r) { if (!listo) { listo = true; ok(r || Response.error()); } });
    });
  }));
});

// Envío en segundo plano cuando vuelve la señal
self.addEventListener('sync', function (e) {
  if (e.tag === 'enviar-cola') e.waitUntil(enviarYAvisar());
});
self.addEventListener('message', function (e) {
  if (e.data === 'enviar-cola') e.waitUntil(enviarYAvisar());
});

function enviarYAvisar() {
  return Cola.procesar().then(function (enviados) {
    return self.clients.matchAll().then(function (cs) {
      cs.forEach(function (c) { c.postMessage({ tipo: 'cola', enviados: enviados }); });
    }).then(function () {
      return Cola.todos().then(function (resto) {
        if (resto.length && !resto.some(function (i) { return i.error; })) throw new Error('quedan pendientes'); // el navegador reintenta luego
      });
    });
  });
}
