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
  'Foto RIF', 'Foto local', 'Observaciones', 'Estado', 'Nota oficina',
  'Tipo de cliente', 'Interés', // columnas nuevas siempre al final
  'Exportado', 'Línea'            // para no desordenar lo ya guardado
];
const LINEAS = ['BIPA Productos', 'BIPA Ritual Sensorial'];
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
      .setFontWeight('bold').setBackground('#286a4d').setFontColor('#ffffff');
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
    '<a target="_top" href="' + url + '" style="background:#286a4d;color:#fff;padding:14px 22px;border-radius:10px;text-decoration:none">Abrir ' +
    (oficina ? 'portal de oficina' : 'formulario') + '</a></div>')
    .setTitle('Registro de clientes')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Las pantallas llaman aquí. Solo se permiten estas funciones. */
const ACCIONES = {
  registrarCliente, listarClientes, cambiarEstado, verFoto,
  urlHoja, version, leerRif, marcarExportados
};

/** Las pantallas preguntan esto para saber qué campos acepta el motor. */
function version() { return 4; }

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
  if (!d || !d.nombre || !d.vendedor) throw new Error('Faltan datos obligatorios.');
  // Si el teléfono reenvía el mismo registro (se cayó la señal), no se duplica
  const cache = CacheService.getScriptCache();
  const llave = d.idLocal ? 'reg_' + String(d.idLocal).slice(0, 60) : '';
  if (llave && cache.get(llave)) return JSON.parse(cache.get(llave));

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  let hoja, numFila, fila, res;
  try {
    if (llave && cache.get(llave)) return JSON.parse(cache.get(llave));
    hoja = getHoja_();
    // Aviso de duplicado por teléfono, solo dentro de la misma línea
    // (una tienda puede comprar velas y productos a la vez)
    const linea = LINEAS.indexOf(d.linea) >= 0 ? d.linea : LINEAS[0];
    const tel = soloDigitos_(d.telefono);
    const filas = hoja.getLastRow() > 1
      ? hoja.getRange(2, 1, hoja.getLastRow() - 1, COLUMNAS.length).getValues()
      : [];
    const cTel = COLUMNAS.indexOf('Teléfono');
    const cLin = COLUMNAS.indexOf('Línea');
    const duplicado = tel.length >= 7 && filas.some(r =>
      soloDigitos_(r[cTel]) === tel && (r[cLin] || LINEAS[0]) === linea);
    const nombreArchivo = String(d.nombre)
      .replace(/[^\w áéíóúñÁÉÍÓÚÑ-]/g, '').trim().slice(0, 40);

    const zona = Session.getScriptTimeZone();
    const id = 'C' + Utilities.formatDate(new Date(), zona, 'yyMMddHHmmss');
    const props = PropertiesService.getScriptProperties();
    const carpeta = DriveApp.getFolderById(props.getProperty('FOLDER_ID'));
    const fotoRif = d.fotoRif
      ? guardarFoto_(carpeta, d.fotoRif, id + '_RIF_' + nombreArchivo) : '';
    const fotoLocal = d.fotoLocal
      ? guardarFoto_(carpeta, d.fotoLocal, id + '_LOCAL_' + nombreArchivo) : '';
    const maps = (d.lat && d.lng)
      ? 'https://www.google.com/maps?q=' + d.lat + ',' + d.lng
      : (d.mapsLink || '');

    fila = {
      'ID': id,
      'Fecha': new Date(),
      'Vendedor': d.vendedor,
      'Nombre comercial': d.nombre,
      'Razón social': '',
      'RIF': '',
      'Persona de contacto': d.contacto || '',
      // apóstrofo: que la hoja no quite el 0 inicial
      'Teléfono': d.telefono ? "'" + d.telefono : '',
      'Correo': d.correo || '',
      'Dirección': d.direccion || '',
      'Zona / Ciudad': d.zona || '',
      // números: la hoja en español leía 10.49 como 1049
      'Latitud': d.lat ? Number(d.lat) : '',
      'Longitud': d.lng ? Number(d.lng) : '',
      'Precisión GPS (m)': d.precision || '',
      'Google Maps': maps,
      'Foto RIF': fotoRif,
      'Foto local': fotoLocal,
      'Observaciones': d.notas || '',
      'Tipo de cliente': d.tipoCliente || '',
      'Interés': d.interes || '',
      'Estado': 'Pendiente',
      'Nota oficina': duplicado ? 'OJO: este teléfono ya estaba registrado' : '',
      'Exportado': '',
      'Línea': linea
    };
    hoja.appendRow(COLUMNAS.map(c => fila[c]));
    numFila = hoja.getLastRow();
    res = { ok: true, id: id, duplicado: duplicado };
    if (llave) cache.put(llave, JSON.stringify(res), 21600);
  } finally {
    lock.releaseLock();
  }
  // Lee el RIF y la razón social de la foto (fuera del candado)
  if (fila['Foto RIF']) {
    try {
      const r = escribirRif_(hoja, numFila, fila['Foto RIF']);
      fila['RIF'] = r.rif;
      fila['Razón social'] = r.razon;
    } catch (e) {
      console.log('No se pudo leer el RIF: ' + e.message);
    }
  }
  try { avisarPorCorreo_(fila); } catch (e) { console.log(e.message); }
  return res;
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
    subject: 'Cliente nuevo ' + (f['Línea'] || '') + ': ' +
      f['Nombre comercial'] + ' (' + f['Vendedor'] + ')',
    htmlBody: '<b>' + f['Nombre comercial'] + '</b><br>' +
      'Vendedor: ' + f['Vendedor'] + '<br>' +
      'Teléfono: ' + String(f['Teléfono']).replace(/^'/, '') + '<br>' +
      (f['RIF'] ? 'RIF: ' + f['RIF'] + ' ' + (f['Razón social'] || '') + '<br>' : '') +
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
  // Una sola lectura de la hoja (es lo que más tarda)
  const datos = hoja.getRange(2, 1, hoja.getLastRow() - 1, COLUMNAS.length).getValues();
  const zona = Session.getScriptTimeZone();
  return datos.map((r, i) => {
    const o = { fila: i + 2, fechaISO: '' };
    COLUMNAS.forEach((c, j) => {
      const v = r[j];
      if (v instanceof Date) {
        o[c] = Utilities.formatDate(v, zona, 'dd/MM/yyyy HH:mm');
        if (c === 'Fecha') o.fechaISO = v.toISOString();
      } else {
        o[c] = v === null || v === undefined ? '' : String(v);
      }
    });
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
  const m = String(url).match(/\/d\/([-\w]{20,})/) || String(url).match(/[-\w]{25,}/);
  if (!m) throw new Error('Enlace de foto no válido');
  const blob = DriveApp.getFileById(m[1] || m[0]).getBlob();
  return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
}

/** Botón "Leer RIF" del portal: vuelve a leer la foto de un registro. */
function leerRif(clave, fila) {
  validarClave_(clave);
  const hoja = getHoja_();
  const url = hoja.getRange(fila, COLUMNAS.indexOf('Foto RIF') + 1).getValue();
  if (!url) throw new Error('Este cliente no tiene foto del RIF');
  return escribirRif_(hoja, fila, url);
}

/** El portal avisa qué filas ya se exportaron al sistema administrativo. */
function marcarExportados(clave, filas) {
  validarClave_(clave);
  const hoja = getHoja_();
  const col = COLUMNAS.indexOf('Exportado') + 1;
  const ahora = new Date();
  (filas || []).forEach(f => {
    if (Number(f) >= 2) hoja.getRange(Number(f), col).setValue(ahora);
  });
  return true;
}

function urlHoja(clave) {
  validarClave_(clave);
  return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID')).getUrl();
}

// ====== Lectura automática del RIF (OCR gratis de Google Drive) ======

function escribirRif_(hoja, fila, urlFoto) {
  const r = leerRifDeFoto_(urlFoto);
  if (r.rif) {
    hoja.getRange(fila, COLUMNAS.indexOf('RIF') + 1).setValue(r.rif);
  }
  if (r.razon) {
    hoja.getRange(fila, COLUMNAS.indexOf('Razón social') + 1)
        .setValue(r.razon);
  }
  return r;
}

/** Convierte la foto en texto con Google Drive y busca el RIF. */
function leerRifDeFoto_(urlFoto) {
  const id = idDrive_(urlFoto);
  const api = 'https://www.googleapis.com/drive/v3/files/';
  const cab = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
  const copia = UrlFetchApp.fetch(api + id + '/copy?ocrLanguage=es', {
    method: 'post',
    contentType: 'application/json',
    headers: cab,
    muteHttpExceptions: true,
    payload: JSON.stringify({
      name: 'lectura-rif-temporal',
      mimeType: 'application/vnd.google-apps.document'
    })
  });
  if (copia.getResponseCode() !== 200) {
    throw new Error('Drive no pudo leer la foto: ' +
      copia.getContentText().slice(0, 150));
  }
  const doc = JSON.parse(copia.getContentText()).id;
  try {
    const texto = UrlFetchApp.fetch(
      api + doc + '/export?mimeType=text/plain', { headers: cab }
    ).getContentText();
    return interpretarRif_(texto);
  } finally {
    UrlFetchApp.fetch(api + doc, {
      method: 'delete', headers: cab, muteHttpExceptions: true
    });
  }
}

/** Busca en el texto el RIF (J-12345678-9) y la razón social. */
function interpretarRif_(texto) {
  const lineas = String(texto || '').split(/\r?\n/)
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const reRif = /(^|[^A-Z0-9])([JVEGPC])\s*[-–.:]?\s*(\d{7,8})\s*[-–.]?\s*(\d)(?!\d)/i;
  const hallados = [];
  lineas.forEach((l, i) => {
    const m = l.toUpperCase().match(reRif);
    if (m) {
      hallados.push({
        rif: m[2] + '-' + ('0' + m[3]).slice(-8) + '-' + m[4],
        i: i,
        resto: l.slice(m.index + m[0].length).trim(),
        seniat: /SENIAT/i.test(l)
      });
    }
  });
  // El RIF del SENIAT (G-20000303-0) suele salir impreso; se prefiere otro
  const h = hallados.filter(x => !x.seniat && x.rif !== 'G-20000303-0')[0] ||
    hallados[0];
  const out = { rif: h ? h.rif : '', razon: '' };

  const etiqueta = new RegExp('^(R\\.?I\\.?F|REGISTRO|SENIAT|DOMICILIO|FECHA|' +
    'N[°º.]|NRO|COMPROBANTE|REP[UÚ]BLICA|BOLIVARIANA|MINISTERIO|' +
    'SERVICIO|NACIONAL|INTEGRADO|ADMINISTRACI|FISCAL|ZONA|TEL[EÉ]F|' +
    'CORREO|LA CONDICI|CONDICI|CONTRIBUYENTE|ESTADO|MUNICIPIO|' +
    'PARROQUIA|AV\\b|AVENIDA|CALLE|SECTOR|URB|EDIF|LOCAL|PISO|' +
    'C[OÓ]DIGO|FIRMA|VENCE|VENCIMIENTO|INFORMACI|P[AÁ]GINA)', 'i');
  const limpiar = l => l
    .replace(/^(NOMBRE|RAZ[OÓ]N SOCIAL|DENOMINACI[OÓ]N)\s*[:.-]?\s*/i, '')
    .replace(reRif, ' ').replace(/\s+/g, ' ').trim();
  const pareceNombre = l => {
    const t = limpiar(l);
    return t.length >= 3 && !etiqueta.test(t) &&
      (t.match(/[A-ZÁÉÍÓÚÑ]/gi) || []).length >= t.length * 0.6;
  };
  const sociedad = /(\bC\.?\s?A\.?$|\bS\.?\s?A\.?$|S\.?\s?R\.?\s?L|\bF\.?\s?P\.?$|COMPA[ÑN][IÍ]A AN[OÓ]NIMA|\bC\.\s?A\b)/i;

  let razon = lineas.filter(l => sociedad.test(l) && pareceNombre(l))[0];
  if (!razon && h && pareceNombre(h.resto)) razon = h.resto;
  if (!razon && h) {
    razon = lineas.slice(h.i + 1, h.i + 4).filter(pareceNombre)[0];
  }
  out.razon = razon ? limpiar(razon).slice(0, 120) : '';
  return out;
}

/** Ejecuta esta función UNA VEZ desde el editor para dar el permiso nuevo. */
function autorizar() {
  DriveApp.getRootFolder();
  UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
  });
  Logger.log('Permisos listos. Ya puedes publicar la nueva versión.');
}

// ====== utilidades ======

function idDrive_(url) {
  const m = String(url).match(/\/d\/([-\w]{20,})/) ||
    String(url).match(/[-\w]{25,}/);
  if (!m) throw new Error('Enlace de foto no válido');
  return m[1] || m[0];
}


function getHoja_() {
  let id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id || !PropertiesService.getScriptProperties().getProperty('FOLDER_ID')) {
    instalar(); // primera vez: crea la hoja y la carpeta solas
    id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  }
  const hoja = SpreadsheetApp.openById(id).getSheetByName(CONFIG.NOMBRE_HOJA);
  // Si se agregaron columnas nuevas al código, les pone su título en la hoja
  if (hoja.getLastColumn() < COLUMNAS.length) {
    hoja.getRange(1, 1, 1, COLUMNAS.length).setValues([COLUMNAS])
        .setFontWeight('bold').setBackground('#286a4d').setFontColor('#ffffff');
  }
  return hoja;
}

function validarClave_(clave) {
  // La clave se guarda en la app la primera vez que la cambias en CONFIG,
  // así no se pierde si luego se pega una versión nueva de este código.
  const props = PropertiesService.getScriptProperties();
  let real = props.getProperty('CLAVE_OFICINA');
  if (CONFIG.CLAVE_OFICINA && CONFIG.CLAVE_OFICINA !== 'cambiar1234' && CONFIG.CLAVE_OFICINA !== real) {
    props.setProperty('CLAVE_OFICINA', CONFIG.CLAVE_OFICINA);
    real = CONFIG.CLAVE_OFICINA;
  }
  real = real || CONFIG.CLAVE_OFICINA;
  if (clave !== real) throw new Error('Clave incorrecta');
}

function soloDigitos_(t) {
  return String(t || '').replace(/\D/g, '').replace(/^0+/, '');
}

// ====== FIN DEL CÓDIGO ======
