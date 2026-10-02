// Conecta las páginas con el motor de Google Apps Script.
// Imita google.script.run para que las pantallas llamen al servidor igual que antes.
async function llamarApi(accion, args) {
  var r;
  try {
    // Sin cabecera Content-Type para que el navegador no haga una consulta previa (CORS)
    r = await fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify({ accion: accion, args: args }) });
  } catch (e) {
    throw new Error('Sin conexión a internet');
  }
  if (!r.ok) throw new Error('El servidor respondió con error ' + r.status);
  var j = await r.json();
  if (!j.ok) throw new Error(j.error || 'Error desconocido');
  return j.data;
}

function corredor(exito, falla) {
  return new Proxy({}, {
    get: function (_, nombre) {
      if (nombre === 'withSuccessHandler') return function (fn) { return corredor(fn, falla); };
      if (nombre === 'withFailureHandler') return function (fn) { return corredor(exito, fn); };
      return function () {
        var args = Array.prototype.slice.call(arguments);
        llamarApi(nombre, args)
          .then(function (d) { if (exito) exito(d); })
          .catch(function (e) { if (falla) falla(e); else console.error(e); });
      };
    }
  });
}
window.google = { script: { run: corredor() } };

document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.empresa').forEach(function (el) { el.textContent = CONFIG.NOMBRE_EMPRESA; });
  var lista = document.getElementById('listaVendedores');
  if (lista) CONFIG.VENDEDORES.forEach(function (v) { var o = document.createElement('option'); o.value = v; lista.appendChild(o); });
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
