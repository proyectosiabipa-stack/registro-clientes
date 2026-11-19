// Simula Google Apps Script en memoria y carga el Codigo.gs real.
const vm = require('vm'), fs = require('fs'), crypto = require('crypto');
module.exports = function cargar(rutaGs) {
  const props = {}, cache = {}, archivos = {}, correos = [], libros = {};
  const nuevoId = () => crypto.randomBytes(20).toString('hex').slice(0, 33);
  function Hoja() {
    this.datos = []; this.nombre = 'Hoja 1';
  }
  Hoja.prototype = {
    getLastRow() { return this.datos.length; },
    getLastColumn() { return this.datos.reduce((m, r) => Math.max(m, r.length), 0); },
    getMaxRows() { return 1000; },
    setName(n) { this.nombre = n; return this; }, setFrozenRows() { return this; },
    appendRow(r) { this.datos.push(r.slice()); return this; },
    deleteRow(f) { this.datos.splice(f - 1, 1); return this; },
    getRange(f, c, nf = 1, nc = 1) {
      const h = this;
      const rg = {
        getValues() { const o = []; for (let i = 0; i < nf; i++) { const r = h.datos[f - 1 + i] || []; const fila = []; for (let j = 0; j < nc; j++) fila.push(r[c - 1 + j] === undefined ? '' : r[c - 1 + j]); o.push(fila); } return o; },
        getValue() { return rg.getValues()[0][0]; },
        setValues(v) { for (let i = 0; i < nf; i++) { while (h.datos.length < f + i) h.datos.push([]); for (let j = 0; j < nc; j++) h.datos[f - 1 + i][c - 1 + j] = v[i][j]; } return rg; },
        setValue(v) { while (h.datos.length < f) h.datos.push([]); h.datos[f - 1][c - 1] = v; return rg; },
        setFontWeight() { return rg; }, setBackground() { return rg; }, setFontColor() { return rg; }, setDataValidation() { return rg; }
      };
      return rg;
    }
  };
  function Libro() { this.id = nuevoId(); this.hojas = [new Hoja()]; libros[this.id] = this; }
  Libro.prototype = {
    getId() { return this.id; }, getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.id; },
    getSheets() { return this.hojas; }, getSheetByName(n) { return this.hojas.find(h => h.nombre === n) || null; }
  };
  const blob = (bytes, tipo, nombre) => ({ bytes, tipo, nombre, getBytes: () => bytes, getContentType: () => tipo });
  const ctx = {
    console: { log() {} }, Logger: { log() {} }, JSON, Date, Math, String, Number, Object, Array, Error, RegExp,
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = String(v); } }) },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] ?? null, put: (k, v) => { cache[k] = v; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Session: { getScriptTimeZone: () => 'America/Caracas', getEffectiveUser: () => ({ getEmail: () => 'dueno@prueba' }) },
    MailApp: { sendEmail: m => correos.push(m) },
    ScriptApp: { getOAuthToken: () => 'tok' },
    UrlFetchApp: { fetch() { throw new Error('sin red en la prueba'); } },
    HtmlService: { createHtmlOutput: () => ({ setTitle() { return this; }, addMetaTag() { return this; } }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ texto: t, setMimeType() { return this; } }) },
    Utilities: {
      formatDate: (d, z, f) => { const p = n => String(n).padStart(2, '0'); return f.replace('yyyy', d.getFullYear()).replace('yy', String(d.getFullYear()).slice(2)).replace('MM', p(d.getMonth() + 1)).replace('dd', p(d.getDate())).replace('HH', p(d.getHours())).replace('mm', p(d.getMinutes())).replace('ss', p(d.getSeconds())); },
      getUuid: () => crypto.randomUUID(), newBlob: blob,
      base64Decode: s => Buffer.from(s, 'base64'), base64Encode: b => Buffer.from(b).toString('base64')
    },
    SpreadsheetApp: {
      create: () => new Libro(), openById: id => libros[id],
      newDataValidation: () => ({ requireValueInList() { return this; }, build() { return {}; } })
    },
    DriveApp: {
      createFolder: () => { const id = nuevoId(); return { getId: () => id, getUrl: () => 'carpeta' }; },
      getFolderById: id => ({ getUrl: () => 'carpeta', createFile: b => { const fid = nuevoId(); archivos[fid] = { blob: b, papelera: false }; return { getUrl: () => 'https://drive.google.com/file/d/' + fid + '/view' }; } }),
      getFileById: id => { const a = archivos[id]; if (!a) throw new Error('no existe'); return { setTrashed: v => { a.papelera = v; }, getBlob: () => a.blob }; },
      getRootFolder: () => ({})
    }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(rutaGs, 'utf8'), ctx);
  return {
    post: cuerpo => JSON.parse(ctx.doPost({ postData: { contents: cuerpo } }).texto),
    libros, archivos, correos, props, ctx,
    hoja: () => { const l = Object.values(libros)[0]; return l ? l.hojas[0].datos : []; }
  };
};
