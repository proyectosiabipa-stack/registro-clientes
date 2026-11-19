// Prueba de la galería de fotos y de "Mis clientes" (historial). Usa el Codigo.gs real dentro del simulador gas.js:
// no toca la hoja ni el Drive reales. Necesita el servidor local en el puerto 8010 (ver README.md).
const { chromium } = require('playwright');
const cargarGas = require('./gas.js');
const R = require('path').join(__dirname, '..');
const V = __dirname + '/fotos';
let fallos = 0; const ok = (c, m) => { if (!c) fallos++; console.log((c ? '✅ ' : '❌ ') + m); };
const espera = ms => new Promise(r => setTimeout(r, ms));
const NOMBRES_COL = ['ID','Fecha','Vendedor','Nombre comercial','Razón social','RIF','Persona de contacto','Teléfono','Correo','Dirección','Zona / Ciudad','Latitud','Longitud','Precisión GPS (m)','Google Maps','Foto RIF','Foto local','Observaciones','Estado','Nota oficina','Tipo de cliente','Interés','Exportado','Línea','ID local'];
const COL = n => NOMBRES_COL.indexOf(n);
const norm = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const req = (gas, accion, ...args) => gas.post(JSON.stringify({ accion, args }));
const sembrar = (gas, d) => req(gas, 'registrarCliente', Object.assign({ linea: 'BIPA Productos', tipoCliente: 'Abastos y Bodegas', zona: 'Caracas', telefono: '04165550000', correo: 'privado@correo.com', direccion: 'Calle secreta 1' }, d));

(async () => {
  // ===================== A) MOTOR (sin navegador) =====================
  {
    const g = cargarGas(R + '/apps-script/Codigo.gs');
    ok(req(g, 'version').data === 8, 'Motor: version() ya es 8');
    sembrar(g, { nombre: 'Bodega Uno', vendedor: 'Maria', idLocal: 'a1', telefono: '04141111111', correo: 'uno@correo.com' });
    sembrar(g, { nombre: 'Bodega Dos', vendedor: 'María ', idLocal: 'a2', zona: 'Valencia', tipoCliente: 'Canal Tradicional' });
    sembrar(g, { nombre: 'Tienda de Karen', vendedor: 'Karen', idLocal: 'a3' });
    sembrar(g, { nombre: 'Tienda de Mariana', vendedor: 'Mariana', idLocal: 'a4' });
    sembrar(g, { nombre: 'Spa Ritual', vendedor: 'Maria', idLocal: 'a5', linea: 'BIPA Ritual Sensorial', tipoCliente: 'Spas y Centros Estéticos' });
    const antes = JSON.stringify(g.hoja()), vAntes = g.props.VERSION_DATOS;
    const h = req(g, 'historialVendedor', 'maria');
    const filas = (h.data || {}).filas || [];
    ok(h.ok && filas.length === 3, 'Motor: "maria" recibe solo sus 3 registros (con o sin tilde/mayúsculas), sin los de Karen ni Mariana (' + filas.length + ')');
    ok(filas.map(f => f.nombre).join('|') === 'Spa Ritual|Bodega Dos|Bodega Uno', 'Motor: del más nuevo al más viejo');
    ok(filas.every(f => JSON.stringify(Object.keys(f).sort()) === JSON.stringify(['estado', 'fecha', 'linea', 'nombre', 'tipo', 'zona'])), 'Motor: cada registro trae solo los 6 campos básicos');
    const texto = JSON.stringify(h);
    ok(!/04141111111|0414|correo\.com|secreta|drive\.google|maps|J-\d/i.test(texto), 'Motor: no se filtra teléfono, correo, dirección, fotos ni ubicación');
    ok(filas[0].linea === 'BIPA Ritual Sensorial' && filas[0].estado === 'Pendiente', 'Motor: línea y estado correctos');
    ok(JSON.stringify(g.hoja()) === antes && g.props.VERSION_DATOS === vAntes, 'Motor: consultar el historial no cambia nada en la hoja');
    const h2 = req(g, 'historialVendedor', 'Maria', h.data.v);
    ok(h2.ok && h2.data.sinCambios === true && !h2.data.filas, 'Motor: si nada cambió responde "sinCambios" sin datos');
    ok(req(g, 'historialVendedor', 'Karen').data.filas.map(f => f.nombre).join() === 'Tienda de Karen', 'Motor: Karen solo ve lo suyo');
    ok(req(g, 'historialVendedor', 'Mari').data.filas.length === 0, 'Motor: un nombre parecido no trae registros de otro vendedor');
    ok(req(g, 'historialVendedor', '  ').ok === false && req(g, 'historialVendedor').ok === false, 'Motor: sin nombre de vendedor no devuelve nada');
    for (let i = 0; i < 205; i++) sembrar(g, { nombre: 'Masivo ' + i, vendedor: 'Octavio', idLocal: 'm' + i });
    ok(req(g, 'historialVendedor', 'Octavio').data.filas.length === 200, 'Motor: tope de 200 registros');
    ok(req(g, 'accionQueNoExiste').ok === false, 'Motor: las acciones no registradas siguen rechazadas');
  }

  // ===================== B) PANTALLA =====================
  const gas = cargarGas(R + '/apps-script/Codigo.gs');
  const filas = () => gas.hoja().slice(1);
  const delVendedor = n => filas().filter(r => norm(r[COL('Vendedor')]) === norm(n));
  const errs = [], externos = [], llamadas = [];
  let motorViejo = false, sinHistorial = false, ocr = 0;
  // OCR de mentira (Google no existe en la prueba): devuelve un RIF y una razón social conocidos
  gas.ctx.UrlFetchApp.fetch = (url, op) => {
    if (op && op.method === 'delete') return {};
    if (/\/copy/.test(url)) { ocr++; return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ id: 'doc-prueba' }) }; }
    if (/\/export/.test(url)) return { getContentText: () => 'REPUBLICA BOLIVARIANA\nJ-12345678-9\nDISTRIBUIDORA PRUEBA C.A.' };
    throw new Error('sin red en la prueba');
  };
  sembrar(gas, { nombre: 'Farmacia Karen Uno', vendedor: 'Karen', idLocal: 'k1', tipoCliente: 'Canal especial - Farmacias' });
  sembrar(gas, { nombre: 'Farmacia Karen Dos', vendedor: 'Karen', idLocal: 'k2' });
  sembrar(gas, { nombre: 'Tienda de Mariana', vendedor: 'Mariana', idLocal: 'k3' });

  async function motor(ctx, pagina) {
    await ctx.route(/script\.google\.com/, async r => {
      const cuerpo = r.request().postData() || '{}';
      const acc = JSON.parse(cuerpo).accion; llamadas.push(acc);
      let res;
      if (motorViejo && acc === 'version') res = { ok: true, data: 7 };
      else if (motorViejo && acc === 'historialVendedor') res = { ok: false, error: 'Acción no válida' };
      else if (sinHistorial && acc === 'historialVendedor') res = { ok: false, error: 'Acción no válida' };
      else res = gas.post(cuerpo);
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(res) });
    });
    await ctx.route(/fonts\.|maps\.google|google\.com\/maps/, r => r.abort());
  }
  function vigilar(p, nombre) {
    p.on('pageerror', e => errs.push(nombre + ': ' + e.message));
    p.on('request', rq => { if (/^https?:/.test(rq.url())) { const h = new URL(rq.url()).hostname; if (!/^(localhost|script\.google\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|maps\.google\.com|www\.google\.com)$/.test(h)) externos.push(rq.url()); } });
  }
  async function pngGrandeTransparente(p) {
    const b64 = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 3000; c.height = 2000; const g = c.getContext('2d'); g.fillStyle = '#c00'; g.fillRect(1400, 900, 200, 200); return c.toDataURL('image/png').split(',')[1]; });
    return { name: 'captura.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') };
  }

  const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const cv = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, permissions: ['geolocation'], geolocation: { latitude: 10.4806, longitude: -66.9036, accuracy: 15 } });
  await motor(cv);
  const v = await cv.newPage(); vigilar(v, 'vendedor');
  await v.goto('http://localhost:8010/'); await v.waitForTimeout(700);
  await v.click('.opcion-linea.productos'); await v.waitForTimeout(500);
  ok(!(await v.isVisible('#btnHistorial')), 'Pantalla: sin vendedor elegido el botón "Mis clientes" no aparece');
  await v.click('#nombres button:has-text("Maria")'); await v.waitForTimeout(900);
  ok(await v.isVisible('#btnHistorial'), 'Pantalla: con el motor nuevo (versión 8) aparece "Mis clientes"');

  const llenar = async x => { await v.fill('#c-nombre', x.n); await v.fill('#c-telefono', x.t); await v.fill('#c-correo', x.m);
    await v.selectOption('#sel-tipo', x.tipo || 'Abastos y Bodegas'); await v.fill('#c-zona', x.z || 'Caracas'); };
  // fotos: { rif: {cam|gal: archivo}, local: {cam|gal: archivo} }
  async function ponerFotos(f) {
    for (const [k, id] of [['rif', 'Rif'], ['local', 'Local']]) {
      if (f[k].cam) await v.setInputFiles('#foto' + id, f[k].cam);
      if (f[k].gal) await v.setInputFiles('#galeria' + id, f[k].gal);
    }
    await v.waitForTimeout(1200);
  }
  async function registrar(x, f, esperarExito = true) {
    await llenar(x);
    await v.click('#btnEnviar'); await v.waitForTimeout(400);
    await ponerFotos(f);
    await v.click('#btnEnviar'); await v.waitForTimeout(1500);
    await v.click('#btnEnviar');
    if (esperarExito) await v.waitForSelector('#exito:not([hidden])', { timeout: 30000 });
    await v.waitForTimeout(500);
  }
  const rif = V + '/foto-rif.jpg', loc = V + '/foto-local.jpg';

  // 1) galería para RIF y local
  await v.click('#btnEnviar'); await v.waitForTimeout(300); // paso 2 (para revisar las casillas)
  ok(await v.$$eval('.enlace-galeria', e => e.length) === 2, 'Galería: hay un enlace "Elegir de la galería" bajo cada casilla');
  ok(await v.$eval('#fotoRif', e => e.getAttribute('capture')) === 'environment' && await v.$eval('#fotoLocal', e => e.getAttribute('capture')) === 'environment', 'Galería: la cámara sigue igual (capture intacto)');
  ok(await v.$eval('#galeriaRif', e => !e.hasAttribute('capture')) && await v.$eval('#galeriaLocal', e => !e.hasAttribute('capture')), 'Galería: las entradas de galería no obligan a abrir la cámara');
  await v.click('#btnAtras'); await v.waitForTimeout(300);
  await registrar({ n: 'Galeria Uno', t: '0414-777-0001', m: 'g1@gmail.com' }, { rif: { gal: rif }, local: { gal: loc } });
  let fi = filas().find(r => r[COL('Nombre comercial')] === 'Galeria Uno');
  ok(!!fi && /drive\.google/.test(fi[COL('Foto RIF')]) && /drive\.google/.test(fi[COL('Foto local')]), 'Galería: RIF y local elegidos de la galería llegan a Drive');
  ok(!!fi && fi[COL('RIF')] === 'J-12345678-9' && /DISTRIBUIDORA PRUEBA/.test(fi[COL('Razón social')]) && ocr === 1, 'Galería: la foto del RIF de galería pasa por la lectura del RIF del servidor (1 sola lectura)');
  const kb = Object.values(gas.archivos).map(a => a.blob.bytes.length);
  ok(kb.length === 2 && kb.every(n => n > 20000 && n < 900000), 'Galería: las fotos llegan comprimidas (' + kb.map(n => Math.round(n / 1024) + ' KB').join(', ') + ')');

  // 2) mixto: RIF con cámara, local = captura PNG grande con transparencia desde galería
  await v.click('#btnOtro'); await v.waitForTimeout(500);
  await llenar({ n: 'Mixto Dos', t: '0424-777-0002', m: 'm2@gmail.com', tipo: 'Canal Tradicional' });
  await v.click('#btnEnviar'); await v.waitForTimeout(400);
  const png = await pngGrandeTransparente(v);
  await v.setInputFiles('#fotoRif', rif); await v.setInputFiles('#galeriaLocal', png); await v.waitForTimeout(1500);
  ok(await v.$eval('#galeriaLocal', e => e.value) === '', 'Galería: se puede volver a elegir el mismo archivo');
  ok(await v.$eval('#tileLocal', e => e.classList.contains('lista') && !!e.querySelector('img') && /Local/.test(e.querySelector('.sello').textContent)) &&
     await v.$eval('#tileRif', e => e.classList.contains('lista') && !!e.querySelector('img')), 'Galería: vista previa y sello "Cambiar" en ambas casillas (cámara + galería)');
  const medidas = await v.$eval('#tileLocal img', async img => { const i = new Image(); i.src = img.src; await i.decode(); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d'); g.drawImage(i, 0, 0); const p = g.getImageData(3, 3, 1, 1).data; return { w: i.width, h: i.height, r: p[0], gg: p[1], bl: p[2], jpeg: img.src.startsWith('data:image/jpeg') }; });
  ok(medidas.jpeg && Math.max(medidas.w, medidas.h) === 1400, 'Galería: imagen de 3000 px se reduce a 1400 px y queda en JPEG (' + medidas.w + 'x' + medidas.h + ')');
  ok(medidas.r > 240 && medidas.gg > 240 && medidas.bl > 240, 'Galería: lo transparente queda blanco, no negro');
  await v.click('#btnEnviar'); await v.waitForTimeout(1500); await v.click('#btnEnviar');
  await v.waitForSelector('#exito:not([hidden])', { timeout: 30000 }); await v.waitForTimeout(500);
  fi = filas().find(r => r[COL('Nombre comercial')] === 'Mixto Dos');
  ok(!!fi && /drive\.google/.test(fi[COL('Foto RIF')]) && /drive\.google/.test(fi[COL('Foto local')]), 'Galería: mezcla cámara + galería llega completa');
  const ultimo = Object.values(gas.archivos).pop().blob.bytes;
  ok(ultimo[0] === 0xFF && ultimo[1] === 0xD8, 'Galería: lo que se guarda en Drive es un JPEG válido');

  // 3) Mis clientes con señal
  await v.click('#btnOtro'); await v.waitForTimeout(500);
  const datosAntes = JSON.stringify(gas.hoja()), reg0 = llamadas.filter(a => a === 'registrarCliente').length;
  await v.click('#btnHistorial'); await v.waitForSelector('#histLista .hist-item', { timeout: 10000 }); await v.waitForTimeout(800);
  const nMaria = delVendedor('Maria').length;
  ok(await v.$$eval('#histLista .hist-item', e => e.length) === nMaria && nMaria === 2, 'Mis clientes (con señal): muestra los ' + nMaria + ' clientes de Maria');
  let txt = await v.innerText('#hist');
  ok(/Galeria Uno/.test(txt) && /Mixto Dos/.test(txt) && /Pendiente/.test(txt) && /BIPA Productos/.test(txt) && /Caracas/.test(txt), 'Mis clientes: se ven negocio, fecha/tipo/línea/zona y estado');
  ok(!/Karen|Mariana/.test(txt), 'Mis clientes: no aparece ningún cliente de otro vendedor');
  ok(!/0414|0424|g1@|m2@|drive\.google|J-12345678|DISTRIBUIDORA/i.test(txt), 'Mis clientes: no muestra teléfono, correo, RIF ni fotos');
  ok(JSON.stringify(gas.hoja()) === datosAntes && llamadas.filter(a => a === 'registrarCliente').length === reg0 && llamadas.includes('historialVendedor'), 'Mis clientes: solo lectura, no escribió nada en la hoja');
  ok(await v.evaluate(() => !!JSON.parse(localStorage.getItem('historial:maria')).filas.length), 'Mis clientes: guardó la copia en el teléfono');
  await v.click('#histCerrar');

  // 4) galería sin señal + Mis clientes sin señal (copia guardada + "Por enviar")
  await cv.setOffline(true); await v.waitForTimeout(300);
  await registrar({ n: 'Offline Tres', t: '0412-777-0003', m: 'o3@gmail.com' }, { rif: { gal: rif }, local: { gal: loc } });
  ok(await v.isVisible('#exitoTit') && /Guardado en el tel/.test(await v.textContent('#exitoTit')), 'Galería sin señal: queda "Guardado en el teléfono"');
  const cola = await v.evaluate(() => Cola.todos());
  ok(cola.length === 1 && /^data:image\/jpeg/.test(cola[0].datos.fotoRif) && /^data:image\/jpeg/.test(cola[0].datos.fotoLocal), 'Galería sin señal: la cola guarda las 2 fotos comprimidas');
  ok(!filas().some(r => r[COL('Nombre comercial')] === 'Offline Tres'), 'Galería sin señal: todavía no llegó a la hoja');
  await v.click('#btnOtro'); await v.waitForTimeout(500);
  await v.click('#btnHistorial'); await v.waitForSelector('#histLista .hist-item', { timeout: 5000 }); await v.waitForTimeout(500);
  txt = await v.innerText('#hist');
  ok(/Sin señal/.test(txt) && /Galeria Uno/.test(txt) && /Mixto Dos/.test(txt), 'Mis clientes sin señal: muestra la copia guardada y lo avisa');
  ok(/Por enviar/.test(txt) && /Offline Tres/.test(txt), 'Mis clientes sin señal: el registro que espera señal sale como "Por enviar"');
  await v.click('#histCerrar');
  await cv.setOffline(false); await v.evaluate(() => window.dispatchEvent(new Event('online'))); await v.waitForTimeout(6000);
  ok(filas().filter(r => r[COL('Nombre comercial')] === 'Offline Tres').length === 1 && (await v.evaluate(() => Cola.todos())).length === 0, 'Galería sin señal: al volver la señal se envía 1 sola vez y la cola queda vacía');
  await v.click('#btnHistorial'); await v.waitForSelector('#histLista .hist-item', { timeout: 10000 }); await v.waitForTimeout(1000);
  txt = await v.innerText('#hist');
  ok(/Offline Tres/.test(txt) && !/Por enviar/.test(txt) && await v.$$eval('#histLista .hist-item', e => e.length) === 3, 'Mis clientes: tras enviarse, pasa a "Registrados" y ya no está "Por enviar"');
  await v.click('#histCerrar');

  // 5) sin señal y reabriendo la app: sigue la copia guardada
  await cv.setOffline(true); await v.reload(); await v.waitForTimeout(1500);
  if (await v.isVisible('.opcion-linea.productos').catch(() => false)) { await v.click('.opcion-linea.productos'); await v.waitForTimeout(500); }
  const abrio = await v.isVisible('#btnHistorial').catch(() => false);
  if (abrio) {
    await v.click('#btnHistorial'); await v.waitForSelector('#histLista .hist-item', { timeout: 5000 });
    ok(/Sin señal/.test(await v.innerText('#hist')) && await v.$$eval('#histLista .hist-item', e => e.length) === 3, 'Mis clientes: la app reabierta sin señal sigue mostrando la copia guardada');
    await v.click('#histCerrar');
  } else ok(false, 'Mis clientes: la app reabierta sin señal no mostró el botón');

  // 6) aislamiento entre vendedores (cambiando de vendedor en el mismo teléfono)
  const elegir = async n => { await v.click('#chipVendedor'); await v.waitForTimeout(400); await v.click('#nombres button:has-text("' + n + '")'); await v.waitForTimeout(500); };
  await elegir('Octavio'); await v.click('#btnHistorial'); await v.waitForTimeout(600);
  txt = await v.innerText('#hist');
  ok(/copia guardada/.test(txt) && !/Galeria Uno|Karen|Mixto/.test(txt), 'Aislamiento: Octavio sin señal y sin copia propia NO ve la copia de Maria');
  await v.click('#histCerrar');
  await cv.setOffline(false); await v.waitForTimeout(500);
  await elegir('Karen'); await v.click('#btnHistorial'); await v.waitForSelector('#histLista .hist-item', { timeout: 10000 }); await v.waitForTimeout(800);
  txt = await v.innerText('#hist');
  ok(await v.$$eval('#histLista .hist-item', e => e.length) === 2 && /Farmacia Karen Uno/.test(txt) && /Farmacia Karen Dos/.test(txt) && !/Galeria|Mixto|Offline|Mariana/.test(txt), 'Aislamiento: Karen ve solo sus 2 clientes');
  await v.click('#histCerrar');
  await elegir('Maria'); await v.click('#btnHistorial'); await v.waitForSelector('#histLista .hist-item', { timeout: 10000 }); await v.waitForTimeout(800);
  txt = await v.innerText('#hist');
  ok(await v.$$eval('#histLista .hist-item', e => e.length) === 3 && !/Karen|Mariana/.test(txt), 'Aislamiento: al volver a Maria ve solo los 3 suyos');
  ok(await v.evaluate(() => !!localStorage.getItem('historial:maria') && !!localStorage.getItem('historial:karen') && localStorage.getItem('historial:maria') !== localStorage.getItem('historial:karen')), 'Aislamiento: cada vendedor tiene su propia copia guardada');
  await v.click('#histCerrar');
  await elegir('Octavio'); await v.click('#btnHistorial'); await v.waitForTimeout(1200);
  ok(/Todav[ií]a no has registrado/.test(await v.innerText('#hist')) || await v.$$eval('#histLista .hist-item', e => e.length) === 200, 'Octavio con señal: ve solo lo suyo (nunca lo de otros)');
  await v.click('#histCerrar');
  await cv.close();

  // 7) motor viejo (versión 7): el botón no aparece y la galería funciona
  motorViejo = true; const desde7 = llamadas.length;
  const co = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, permissions: ['geolocation'], geolocation: { latitude: 10.48, longitude: -66.9, accuracy: 15 } });
  await motor(co);
  const w = await co.newPage(); vigilar(w, 'motor viejo');
  await w.goto('http://localhost:8010/'); await w.waitForTimeout(700);
  await w.click('.opcion-linea.productos'); await w.waitForTimeout(500);
  await w.click('#nombres button:has-text("Maria")'); await w.waitForTimeout(1200);
  ok(!(await w.isVisible('#btnHistorial')), 'Motor viejo (v7): "Mis clientes" queda oculto');
  const antesViejo = filas().length;
  await w.fill('#c-nombre', 'Con Motor Viejo'); await w.click('#btnEnviar'); await w.waitForTimeout(400);
  await w.setInputFiles('#galeriaRif', rif); await w.setInputFiles('#galeriaLocal', loc); await w.waitForTimeout(1200);
  await w.click('#btnEnviar'); await w.waitForTimeout(1500); await w.click('#btnEnviar');
  await w.waitForSelector('#exito:not([hidden])', { timeout: 30000 }); await w.waitForTimeout(500);
  ok(filas().length === antesViejo + 1 && /drive\.google/.test(filas().find(r => r[COL('Nombre comercial')] === 'Con Motor Viejo')[COL('Foto RIF')]), 'Motor viejo (v7): la galería y el envío funcionan normal');
  ok(!llamadas.slice(desde7).includes('historialVendedor'), 'Motor viejo (v7): nunca se pidió el historial');
  await co.close();

  // 8) el motor dice versión 8 pero rechaza la acción: se oculta sin errores
  motorViejo = false; sinHistorial = true;
  const cs = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await motor(cs);
  const s = await cs.newPage(); vigilar(s, 'sin historial');
  await s.goto('http://localhost:8010/'); await s.waitForTimeout(700);
  await s.click('.opcion-linea.productos'); await s.waitForTimeout(500);
  await s.click('#nombres button:has-text("Maria")'); await s.waitForTimeout(1200);
  await s.click('#btnHistorial'); await s.waitForTimeout(1500);
  ok(!(await s.isVisible('#btnHistorial')) && !(await s.isVisible('#hist')), 'Motor sin la acción: el botón y la pantalla se ocultan solos, sin error');
  await cs.close();

  ok(externos.length === 0, 'Ninguna petición salió hacia servidores distintos del simulador ' + externos.join(' | '));
  ok(errs.length === 0, 'Sin errores de programa ' + errs.join(' | '));
  console.log(fallos ? '\nFALLOS: ' + fallos : '\nTODO OK');
  await b.close();
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.log('ERROR', e); process.exit(1); });
