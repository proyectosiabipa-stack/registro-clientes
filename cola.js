// Registros guardados en el teléfono hasta que haya señal.
// La usan el formulario (index.html) y el service worker (sw.js), que envía la cola
// aunque la app esté cerrada. Cada registro lleva un idLocal: si llega dos veces,
// el motor lo reconoce y no lo duplica.
var Cola = (function () {
  var BD = 'registro-clientes', TABLA = 'cola', corriendo = null;
  var enVuelo = {}; // registros que ya se están enviando (no se mandan dos veces a la vez)

  function abrir() {
    return new Promise(function (ok, mal) {
      var r = indexedDB.open(BD, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(TABLA, { keyPath: 'idLocal' }); };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { mal(r.error); };
    });
  }
  function usar(modo, fn) {
    return abrir().then(function (db) {
      return new Promise(function (ok, mal) {
        var t = db.transaction(TABLA, modo), pedido = fn(t.objectStore(TABLA));
        t.oncomplete = function () { db.close(); ok(pedido ? pedido.result : undefined); };
        t.onerror = t.onabort = function () { db.close(); mal(t.error); };
      });
    });
  }

  function nuevoId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }
  function guardar(item) { return usar('readwrite', function (s) { return s.put(item); }); }
  function quitar(id) { return usar('readwrite', function (s) { return s.delete(id); }); }
  function todos() {
    return usar('readonly', function (s) { return s.getAll(); })
      .then(function (l) { return (l || []).sort(function (a, b) { return a.creado - b.creado; }); });
  }

  // Envía un registro. Si falla la red el error lleva .red = true (se reintenta luego).
  function enviarUno(item) {
    var id = item.idLocal; enVuelo[id] = true;
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var reloj = setTimeout(function () { if (ctl) ctl.abort(); }, 120000);
    return fetch(CONFIG.API_URL, {
      method: 'POST', signal: ctl ? ctl.signal : undefined,
      body: JSON.stringify({ accion: 'registrarCliente', args: [item.datos] })
    }).then(function (r) {
      if (!r.ok) { var e = new Error('El servidor respondió con error ' + r.status); e.red = true; throw e; }
      return r.json();
    }, function () {
      var e = new Error('Sin señal'); e.red = true; throw e;
    }).then(function (j) {
      clearTimeout(reloj);
      if (!j.ok) throw new Error(j.error || 'Error desconocido');
      delete enVuelo[id];
      return j.data;
    }, function (e) { clearTimeout(reloj); delete enVuelo[id]; throw e; });
  }

  // Envía todo lo pendiente, en orden. Se detiene si no hay red.
  function procesar() {
    if (corriendo) return corriendo;
    var enviados = [];
    corriendo = todos().then(function (lista) {
      return lista.reduce(function (p, item) {
        return p.then(function (seguir) {
          if (!seguir) return false;
          if (enVuelo[item.idLocal]) return true;
          return enviarUno(item).then(function (res) {
            enviados.push({ nombre: item.datos.nombre, id: res.id, duplicado: res.duplicado });
            return quitar(item.idLocal).then(function () { return true; });
          }, function (e) {
            if (e.red) return false;
            item.intentos = (item.intentos || 0) + 1; item.error = e.message;
            return guardar(item).then(function () { return true; });
          });
        });
      }, Promise.resolve(true));
    }).then(function () { return enviados; }, function () { return enviados; })
      .then(function (r) { corriendo = null; return r; });
    return corriendo;
  }

  return { nuevoId: nuevoId, guardar: guardar, quitar: quitar, todos: todos, enviarUno: enviarUno, procesar: procesar };
})();
