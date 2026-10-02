/**
 * REGISTRO DE CLIENTES NUEVOS
 * Backend en Google Apps Script: guarda cada registro en una Hoja de Google
 * y las fotos en una carpeta de Google Drive.
 *
 * Este archivo es solo el "motor": las pantallas (formulario y portal de oficina)
 * están en GitHub Pages y le hablan a este código por internet.
 * Se pega en script.google.com y se publica como Aplicación web.
 */

// ====== CONFIGURACIÓN (cámbiala a tu gusto) ======
const CONFIG = {
  URL_PORTAL: 'https://proyectosiabipa-stack.github.io/registro-clientes/', // dónde están las pantallas
  CLAVE_OFICINA: 'cambiar1234',          // clave del portal de oficina. Cámbiala aquí (no en GitHub); queda guardada aunque luego pegues otra versión
  EMAILS_AVISO: 'DUENO',                 // correos separados por coma para avisos. 'DUENO' = la cuenta dueña de la app; '' = sin aviso
  NOMBRE_HOJA: 'Clientes',
  NOMBRE_CARPETA: 'Registro de clientes - Fotos'
};

const COLUMNAS = [
  'ID', 'Fecha', 'Vendedor', 'Nombre comercial', 'Razón social', 'RIF',
  'Persona de contacto', 'Teléfono', 'Correo', 'Dirección', 'Zona / Ciudad',
  'Latitud', 'Longitud', 'Precisión GPS (m)', 'Google Maps',
  'Foto RIF', 'Foto local', 'Observaciones', 'Estado', 'Nota oficina'
];
const ESTADOS = ['Pendiente', 'Aprobado', 'Rechazado'];

// ====== ARRANQUE ======

/** Ejecuta esta función UNA VEZ desde el editor: crea la hoja y la carpeta. */
function instalar() {
  const props = PropertiesService.getScriptProperties();
  let ss;
  const ssId = props.getProperty('SHEET_ID');
  if (ssId) {
    ss = SpreadsheetApp.openById(ssId);
  } else {
    ss = SpreadsheetApp.create('Registro de clientes nuevos');
    props.setProperty('SHEET_ID', ss.getId());
  }
  let hoja = ss.getSheetByName(CONFIG.NOMBRE_HOJA);
  if (!hoja) {
    hoja = ss.getSheets()[0];
    hoja.setName(CONFIG.NOMBRE_HOJA);
  }
  hoja.getRange(1, 1, 1, COLUMNAS.length).setValues([COLUMNAS])
      .setFontWeight('bold').setBackground('#1f4e79').setFontColor('#ffffff');
  hoja.setFrozenRows(1);
  const reglaEstado = SpreadsheetApp.newDataValidation().requireValueInList(ESTADOS, true).build();
  hoja.getRange(2, COLUMNAS.indexOf('Estado') + 1, hoja.getMaxRows() - 1, 1).setDataValidation(reglaEstado);

  if (!props.getProperty('FOLDER_ID')) {
    const carpeta = DriveApp.createFolder(CONFIG.NOMBRE_CARPETA);
    props.setProperty('FOLDER_ID', carpeta.getId());
  }
  Logger.log('Listo. Hoja: ' + ss.getUrl());
  Logger.log('Carpeta de fotos: ' + DriveApp.getFolderById(props.getProperty('FOLDER_ID')).getUrl());
}

/** Si alguien abre este enlace directo, lo manda a las pantallas en GitHub. */
function doGet(e) {
  const oficina = e && e.parameter && e.parameter.p === 'oficina';
  const url = CONFIG.URL_PORTAL + (oficina ? 'oficina.html' : '');
  return HtmlService.createHtmlOutput(
    '<div style="font:18px sans-serif;text-align:center;margin-top:60px">La app se mudó.<br><br>' +
    '<a target="_top" href="' + url + '" style="background:#1f4e79;color:#fff;padding:14px 22px;border-radius:10px;text-decoration:none">Abrir ' +
    (oficina ? 'portal de oficina' : 'formulario') + '</a></div>')
    .setTitle('Registro de clientes')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Las pantallas llaman aquí. Solo se permiten estas funciones. */
const ACCIONES = { registrarCliente, listarClientes, cambiarEstado, verFoto, urlHoja };

function doPost(e) {
  let res;
  try {
    const pedido = JSON.parse(e.postData.contents);
    const fn = ACCIONES[pedido.accion];
    if (!fn) throw new Error('Acción no válida');
    res = { ok: true, data: fn.apply(null, pedido.args || []) };
  } catch (err) {
    res = { ok: false, error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
}

// ====== VENDEDORES: registrar ======

function registrarCliente(d) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (!d || !d.nombre || !d.vendedor) throw new Error('Faltan datos obligatorios.');
    const hoja = getHoja_();
    // Aviso de duplicado por teléfono (el RIF se lee de la foto en la oficina)
    const tel = soloDigitos_(d.telefono);
    const filas = hoja.getLastRow() > 1
      ? hoja.getRange(2, COLUMNAS.indexOf('Teléfono') + 1, hoja.getLastRow() - 1, 1).getValues() : [];
    const duplicado = tel.length >= 7 && filas.some(r => soloDigitos_(r[0]) === tel);
    const nombreArchivo = String(d.nombre).replace(/[^\w áéíóúñÁÉÍÓÚÑ-]/g, '').trim().slice(0, 40);

    const id = 'C' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyMMddHHmmss');
    const carpeta = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('FOLDER_ID'));
    const fotoRif = d.fotoRif ? guardarFoto_(carpeta, d.fotoRif, id + '_RIF_' + nombreArchivo) : '';
    const fotoLocal = d.fotoLocal ? guardarFoto_(carpeta, d.fotoLocal, id + '_LOCAL_' + nombreArchivo) : '';
    const maps = (d.lat && d.lng) ? 'https://www.google.com/maps?q=' + d.lat + ',' + d.lng : (d.mapsLink || '');

    const fila = {
      'ID': id, 'Fecha': new Date(), 'Vendedor': d.vendedor, 'Nombre comercial': d.nombre,
      'Razón social': '', 'RIF': '', 'Persona de contacto': d.contacto || '',
      'Teléfono': d.telefono ? "'" + d.telefono : '', // apóstrofo: que la hoja no quite el 0 inicial 'Correo': d.correo || '', 'Dirección': d.direccion || '',
      'Zona / Ciudad': d.zona || '', 'Latitud': d.lat || '', 'Longitud': d.lng || '',
      'Precisión GPS (m)': d.precision || '', 'Google Maps': maps,
      'Foto RIF': fotoRif, 'Foto local': fotoLocal, 'Observaciones': d.notas || '',
      'Estado': 'Pendiente', 'Nota oficina': duplicado ? 'OJO: este teléfono ya estaba registrado' : ''
    };
    hoja.appendRow(COLUMNAS.map(c => fila[c]));
    avisarPorCorreo_(fila);
    return { ok: true, id: id, duplicado: duplicado };
  } finally {
    lock.releaseLock();
  }
}

function guardarFoto_(carpeta, dataUrl, nombre) {
  const partes = dataUrl.split(',');
  const tipo = partes[0].match(/data:(.*);base64/)[1];
  const blob = Utilities.newBlob(Utilities.base64Decode(partes[1]), tipo, nombre + '.jpg');
  return carpeta.createFile(blob).getUrl();
}

function avisarPorCorreo_(f) {
  if (!CONFIG.EMAILS_AVISO) return;
  const destino = CONFIG.EMAILS_AVISO === 'DUENO' ? Session.getEffectiveUser().getEmail() : CONFIG.EMAILS_AVISO;
  const url = CONFIG.URL_PORTAL + 'oficina.html';
  MailApp.sendEmail({
    to: destino,
    subject: 'Cliente nuevo: ' + f['Nombre comercial'] + ' (' + f['Vendedor'] + ')',
    htmlBody: '<b>' + f['Nombre comercial'] + '</b><br>' +
      'Vendedor: ' + f['Vendedor'] + '<br>Teléfono: ' + f['Teléfono'] + '<br>' +
      (f['Google Maps'] ? '<a href="' + f['Google Maps'] + '">Ver ubicación</a><br>' : '') +
      (f['Nota oficina'] ? '<b style="color:#c00">' + f['Nota oficina'] + '</b><br>' : '') +
      '<br><a href="' + url + '">Abrir portal de oficina</a>'
  });
}

// ====== OFICINA: consultar y aprobar ======

function listarClientes(clave) {
  validarClave_(clave);
  const hoja = getHoja_();
  if (hoja.getLastRow() < 2) return [];
  const rango = hoja.getRange(2, 1, hoja.getLastRow() - 1, COLUMNAS.length);
  const datos = rango.getDisplayValues();
  const fechas = rango.getValues().map(r => r[COLUMNAS.indexOf('Fecha')]);
  return datos.map((r, i) => {
    const o = { fila: i + 2, fechaISO: fechas[i] instanceof Date ? fechas[i].toISOString() : '' };
    COLUMNAS.forEach((c, j) => o[c] = r[j]);
    return o;
  }).reverse();
}

function cambiarEstado(clave, fila, estado, nota) {
  validarClave_(clave);
  if (ESTADOS.indexOf(estado) < 0) throw new Error('Estado no válido');
  const hoja = getHoja_();
  hoja.getRange(fila, COLUMNAS.indexOf('Estado') + 1).setValue(estado);
  if (nota !== undefined) hoja.getRange(fila, COLUMNAS.indexOf('Nota oficina') + 1).setValue(nota);
  return true;
}

/** Devuelve la foto en base64 para verla en el portal sin hacer pública la carpeta. */
function verFoto(clave, url) {
  validarClave_(clave);
  const m = String(url).match(/[-\w]{25,}/);
  if (!m) return '';
  const blob = DriveApp.getFileById(m[0]).getBlob();
  return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
}

function urlHoja(clave) {
  validarClave_(clave);
  return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID')).getUrl();
}

// ====== utilidades ======

function getHoja_() {
  let id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id || !PropertiesService.getScriptProperties().getProperty('FOLDER_ID')) {
    instalar(); // primera vez: crea la hoja y la carpeta solas
    id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  }
  return SpreadsheetApp.openById(id).getSheetByName(CONFIG.NOMBRE_HOJA);
}

function validarClave_(clave) {
  // La clave se guarda en la app la primera vez que la cambias en CONFIG,
  // así no se pierde si luego se pega una versión nueva de este código.
  const props = PropertiesService.getScriptProperties();
  if (CONFIG.CLAVE_OFICINA && CONFIG.CLAVE_OFICINA !== 'cambiar1234') props.setProperty('CLAVE_OFICINA', CONFIG.CLAVE_OFICINA);
  const real = props.getProperty('CLAVE_OFICINA') || CONFIG.CLAVE_OFICINA;
  if (clave !== real) throw new Error('Clave incorrecta');
}

function soloDigitos_(t) {
  return String(t || '').replace(/\D/g, '').replace(/^0+/, '');
}
