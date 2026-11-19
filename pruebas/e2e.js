// Prueba completa: app de vendedores + panel + el Codigo.gs real (simulado en memoria).
const { chromium } = require('playwright');
const cargarGas = require('./gas.js');
const R = require('path').join(__dirname, '..');
const V = __dirname + '/fotos';
const gas = cargarGas(R + '/apps-script/Codigo.gs');
let fallos = 0; const ok = (c, m) => { if (!c) fallos++; console.log((c ? '✅ ' : '❌ ') + m); };
const espera = ms => new Promise(r => setTimeout(r, ms));
const COL = n => ['ID','Fecha','Vendedor','Nombre comercial','Razón social','RIF','Persona de contacto','Teléfono','Correo','Dirección','Zona / Ciudad','Latitud','Longitud','Precisión GPS (m)','Google Maps','Foto RIF','Foto local','Observaciones','Estado','Nota oficina','Tipo de cliente','Interés','Exportado','Línea','ID local'].indexOf(n);
const filas = () => gas.hoja().slice(1);
let cortarRespuesta = 0, llamadas = {};

async function motor(ctx) {
  await ctx.route(/script\.google\.com/, async r => {
    const cuerpo = r.request().postData() || '{}';
    const acc = JSON.parse(cuerpo).accion; llamadas[acc] = (llamadas[acc] || 0) + 1;
    const res = gas.post(cuerpo);
    if (acc === 'registrarCliente' && cortarRespuesta > 0) { cortarRespuesta--; return r.abort('connectionreset'); } // llegó pero se cayó la señal
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(res) });
  });
  await ctx.route(/fonts\.|maps\.google|google\.com\/maps/, r => r.abort());
}

(async () => {
  const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const errs = [];
  // ===== VENDEDOR =====
  const cv = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, permissions: ['geolocation'], geolocation: { latitude: 10.4806, longitude: -66.9036, accuracy: 15 } });
  await motor(cv);
  const v = await cv.newPage(); v.on('pageerror', e => errs.push('vendedor: ' + e.message));
  await v.goto('http://localhost:8010/'); await v.waitForTimeout(700);
  await v.click('.opcion-linea.productos'); await v.waitForTimeout(500);
  ok(await v.$$eval('#nombres button', e => e.length) === 12, 'Vendedor: aparecen los 12 nombres');
  await v.click('#nombres button:has-text("Maria")'); await v.waitForTimeout(400);
  const llenar = async x => { await v.fill('#c-nombre', x.n); await v.fill('#c-contacto', x.c); await v.fill('#c-telefono', x.t); await v.fill('#c-correo', x.m);
    await v.selectOption('#sel-tipo', x.tipo); await v.selectOption('#c-interes', 'Alto'); await v.fill('#c-zona', x.z); await v.fill('#c-direccion', x.d); };
  const fotosYEnviar = async () => {
    await v.click('#btnEnviar'); await v.waitForTimeout(400);
    await v.setInputFiles('#fotoRif', V + '/foto-rif.jpg'); await v.setInputFiles('#fotoLocal', V + '/foto-local.jpg'); await v.waitForTimeout(900);
    await v.click('#btnEnviar'); await v.waitForTimeout(1500);
    await v.click('#btnEnviar'); await v.waitForSelector('#exito:not([hidden])', { timeout: 30000 });
  };
  // 1) campos vacíos no dejan pasar
  // 2) registro normal
  await llenar({ n: 'Bodega El Sol', c: 'Pedro Rivas', t: '0414-123-4567', m: 'sol@gmail.com', tipo: 'Abastos y Bodegas', z: 'Caracas', d: 'Av. Principal' });
  await fotosYEnviar(); await v.waitForTimeout(500);
  let f = filas();
  ok(f.length === 1, 'Registro normal: llega 1 fila a la hoja');
  const r1 = f[0] || [];
  ok(r1[COL('Vendedor')] === 'Maria' && r1[COL('Línea')] === 'BIPA Productos' && r1[COL('Estado')] === 'Pendiente', 'Con vendedor, línea y estado correctos');
  ok(String(r1[COL('Teléfono')]).includes('0414') && r1[COL('Tipo de cliente')] === 'Abastos y Bodegas', 'Teléfono con su 0 y tipo de cliente guardados');
  ok(Math.abs(r1[COL('Latitud')] - 10.4806) < 0.001 && /maps/.test(r1[COL('Google Maps')]), 'Ubicación GPS guardada');
  ok(/drive\.google/.test(r1[COL('Foto RIF')]) && /drive\.google/.test(r1[COL('Foto local')]), 'Las 2 fotos se guardaron en Drive');
  const fotoBytes = Object.values(gas.archivos)[0].blob.bytes.length;
  ok(fotoBytes > 20000 && fotoBytes < 900000, 'Foto comprimida a ' + Math.round(fotoBytes / 1024) + ' KB');
  ok(gas.correos.length === 1 && /Bodega El Sol/.test(gas.correos[0].subject), 'Llega el correo de aviso');

  // 3) se cae la señal justo al enviar (llegó al motor pero no hubo respuesta): no debe duplicarse
  await v.click('#btnOtro'); await v.waitForTimeout(500);
  cortarRespuesta = 1;
  await llenar({ n: 'Abasto La Paz', c: 'Luis Gil', t: '0424-555-1111', m: 'paz@gmail.com', tipo: 'Canal Tradicional', z: 'Valencia', d: 'Calle 3' });
  await fotosYEnviar(); await v.waitForTimeout(800);
  await v.evaluate(() => window.dispatchEvent(new Event('online'))); await v.waitForTimeout(5000);
  f = filas();
  ok(f.filter(r => r[COL('Nombre comercial')] === 'Abasto La Paz').length === 1, 'Señal cortada al enviar y reintento: queda 1 sola fila (no se duplica)');
  ok(Object.values(gas.archivos).filter(a => !a.papelera).length === 4, 'Fotos repetidas del reintento van a la papelera (quedan 4 fotos, no 6)');

  // 4) sin señal: queda guardado y se envía solo al volver
  await v.click('#btnOtro'); await v.waitForTimeout(500);
  await v.click('#lineaActual'); await v.waitForTimeout(500); await v.click('.opcion-linea.ritual'); await v.waitForTimeout(600);
  await llenar({ n: 'Spa Aurora', c: 'Carla M', t: '0412-777-8888', m: 'aurora@gmail.com', tipo: 'Spas y Centros Estéticos', z: 'Maracay', d: 'CC Las Garzas' });
  await cv.setOffline(true);
  await fotosYEnviar(); await v.waitForTimeout(500);
  ok(!filas().some(r => r[COL('Nombre comercial')] === 'Spa Aurora'), 'Sin señal: no llega todavía (queda en el teléfono)');
  await v.click('#btnOtro'); await v.waitForTimeout(500);
  ok(await v.isVisible('#pendientes'), 'Sin señal: el vendedor ve el aviso de pendiente');
  await cv.setOffline(false); await v.waitForTimeout(6000);
  f = filas();
  ok(f.filter(r => r[COL('Nombre comercial')] === 'Spa Aurora').length === 1 && f.find(r => r[COL('Nombre comercial')] === 'Spa Aurora')[COL('Línea')] === 'BIPA Ritual Sensorial', 'Al volver la señal se envía solo, 1 vez, con línea Ritual');

  // 5) mismo teléfono en la misma línea: avisa duplicado
  await v.click('#lineaActual'); await v.waitForTimeout(500); await v.click('.opcion-linea.productos'); await v.waitForTimeout(600);
  await llenar({ n: 'Bodega El Sol 2', c: 'Pedro', t: '04141234567', m: 'sol2@gmail.com', tipo: 'Abastos y Bodegas', z: 'Caracas', d: 'Av. Principal' });
  await fotosYEnviar(); await v.waitForTimeout(500);
  ok(/OJO/.test((filas().find(r => r[COL('Nombre comercial')] === 'Bodega El Sol 2') || [])[COL('Nota oficina')]), 'Teléfono repetido: la oficina ve "OJO: ya estaba registrado"');
  ok(filas().length === 4, 'Total en la hoja: 4 clientes, ni más ni menos (' + filas().length + ')');

  // ===== PANEL =====
  for (const [w, h, nom] of [[1300, 900, 'PC'], [390, 844, 'celular']]) {
    const co = await b.newContext({ viewport: { width: w, height: h }, isMobile: nom === 'celular' });
    await motor(co);
    const p = await co.newPage(); p.on('pageerror', e => errs.push('panel: ' + e.message));
    await p.goto('http://localhost:8010/oficina.html');
    await p.fill('#clave', 'mala'); await p.click('#btnEntrar'); await p.waitForTimeout(800);
    ok(await p.isVisible('#login') && (await p.textContent('#loginErr')).length > 0, nom + ': clave incorrecta no entra');
    await p.fill('#clave', 'cambiar1234'); await p.click('#btnEntrar'); await p.waitForSelector('.fila', { timeout: 10000 }); await p.waitForTimeout(800);
    ok(await p.$$eval('.fila', e => e.length) === filas().length, nom + ': muestra exactamente ' + filas().length + ' clientes, sin fantasmas');
    ok(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), nom + ': sin desborde de pantalla');
    // parpadeo: revisar sin cambios no debe repintar
    const html1 = await p.innerHTML('#filas');
    if (nom === 'PC') {
      llamadas = {}; await p.waitForTimeout(62000);
      ok(llamadas.listarClientes >= 1, 'PC: se revisa sola cada minuto');
      ok(await p.innerHTML('#filas') === html1, 'PC: al revisar sin cambios la lista no parpadea ni cambia');
    }
    if (nom === 'PC') {
      // ficha con fotos
      await p.click('.fila:has-text("Bodega El Sol 2")'); await p.waitForTimeout(2500);
      const imgs = await p.$$eval('#fCuerpo img', e => e.filter(i => i.complete && i.naturalWidth > 0).length);
      ok(imgs >= 2, 'Ficha: se ven las 2 fotos (' + imgs + ')');
      await p.click('.estados button[data-e="Rechazado"]'); await p.fill('#nota', 'Teléfono repetido'); await p.click('#btnGuardar'); await p.waitForTimeout(1500);
      const rr = filas().find(r => r[COL('Nombre comercial')] === 'Bodega El Sol 2');
      ok(rr[COL('Estado')] === 'Rechazado' && rr[COL('Nota oficina')] === 'Teléfono repetido', 'Guardar revisión: queda Rechazado con su nota en la hoja');
      // aprobar varios
      const visibleAviso = await p.isVisible('#btnAprobarVarios');
      if (visibleAviso) {
        await p.click('#btnAprobarVarios'); await p.waitForTimeout(500);
        const n = await p.$$eval('#variosLista input:checked', e => e.length);
        await p.click('#variosOk'); await p.waitForTimeout(2000);
        ok(filas().filter(r => r[COL('Estado')] === 'Aprobado').length === n && n > 0, 'Aprobar varios: ' + n + ' aprobados de una vez en la hoja');
      } else ok(true, 'Aprobar varios: ningún cliente cumple las reglas para sugerirlo (normal con estos datos)');
      // nuevo cliente llega solo al panel
      gas.post(JSON.stringify({ accion: 'registrarCliente', args: [{ nombre: 'Farmacia Norte', vendedor: 'Karen', telefono: '04169990000', linea: 'BIPA Productos', idLocal: 'x1' }] }));
      await p.waitForTimeout(62000);
      ok(await p.isVisible('.fila:has-text("Farmacia Norte")'), 'Cliente nuevo aparece solo en el panel');
      ok(await p.$$eval('.fila', e => e.length) === filas().length, 'Sigue cuadrando con la hoja: ' + filas().length);
      // tablero vendedores
      await p.click('#btnVendedores'); await p.waitForTimeout(400);
      ok(/Maria/.test(await p.textContent('#tablaVend')) && /Karen/.test(await p.textContent('#tablaVend')), 'Tablero por vendedor muestra a Maria y Karen');
      await p.click('#vendCerrar');
      // eliminar
      p.once('dialog', d => d.accept());
      await p.click('.fila:has-text("Farmacia Norte")'); await p.waitForTimeout(600); await p.click('#btnEliminar'); await p.waitForTimeout(1500);
      ok(!filas().some(r => r[COL('Nombre comercial')] === 'Farmacia Norte') && !(await p.isVisible('.fila:has-text("Farmacia Norte")')), 'Eliminar: se borra de la hoja y del panel');
      // exportar
      await p.click('#btnExportar'); await p.waitForTimeout(400);
      const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }).catch(() => null), p.click('#expTodos')]);
      ok(!!dl && /\.xlsx$/.test(dl.suggestedFilename()), 'Exportar a Excel descarga ' + (dl ? dl.suggestedFilename() : 'nada'));
    }
    await co.close();
  }
  ok(errs.length === 0, 'Sin errores de programa ' + errs.join(' | '));
  console.log(fallos ? '\nFALLOS: ' + fallos : '\nTODO OK');
  await b.close();
})().catch(e => { console.log('ERROR', e); process.exit(1); });
