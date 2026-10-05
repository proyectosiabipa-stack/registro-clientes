// Reglas de crédito por canal, tomadas del manual "Criterios y Manual de Facturación para Filtro de Crédito Mayorista"
// (documento SEGMENTACION DE CLIENTES). Para cambiar montos, plazos o productos se edita solo este archivo.
// El panel de oficina las usa para recomendar qué hacer con cada cliente nuevo.
var REGLAS = {
  canales: {
    bodega: {
      nombre: 'Canal 1 · Bodegas y Abastos',
      creditoInicial: 50, creditoMax: 200, plazo: '15 días',
      notaCredito: 'Empieza con $50. Con buen historial de pago puede subir a $150 – $200.',
      permitido: ['Velas básicas', 'Velas de cumpleaños', 'Velones #1 y #4', 'Paquitos', 'Lamparitas'],
      excluido: ['Velas aromáticas', 'Gel ambientador', 'Velón #5', 'Velas litúrgicas'],
      porque: 'Menor rotación de productos de alto valor. Limitar estos productos evita inventario estancado y reduce la mora.'
    },
    tradicional: {
      nombre: 'Canal 2 · Tradicional / Supermercados independientes',
      creditoInicial: 300, creditoMax: 500, plazo: '15 días',
      notaCredito: 'Rango sugerido $300 – $500.',
      permitido: ['Líneas básicas', 'Velas aromáticas', 'Gel ambientador', 'Velón #5', 'Mayor variedad de empaques'],
      excluido: ['Productos de muy baja rotación, si su historial no los valida'],
      porque: 'Mayor tráfico de clientes y mejor capacidad de pago: se puede diversificar el mix sin subir el riesgo.'
    },
    moderno: {
      nombre: 'Canal 3 · Moderno / Super cadenas',
      creditoInicial: 600, creditoMax: 1000, plazo: '21 días (35 días en evaluación)',
      notaCredito: 'Rango sugerido $600 – $1.000 o más, sujeto a evaluación de cupo corporativo.',
      permitido: ['Inciensos aromáticos', 'Varillas repelentes', 'Gel ambientador', 'Velas aromáticas', 'Velas blancas paquete x5',
        'Lamparitas semanarios x8', 'Velón paquito x3', 'Velones #1 y #4'],
      soloEstos: true,
      excluido: ['Todo lo que no esté en su portafolio exclusivo'],
      porque: 'Buscan alta rotación, consumo masivo empaquetado y cuidado del hogar.'
    },
    especial: {
      nombre: 'Canal 4 · Especial (farmacias, hoteles, funerarias, perfumerías, cafeterías)',
      creditoInicial: 100, creditoMax: 100, plazo: '15 días',
      notaCredito: 'Crédito sugerido $100.',
      permitido: ['Líneas básicas', 'Velas aromáticas', 'Gel ambientador', 'Velón #5', 'Mayor variedad de empaques'],
      excluido: ['Productos de muy baja rotación, si su historial no los valida'],
      porque: 'Mix extendido con un crédito inicial bajo.'
    }
  },

  // Tipo de cliente (como llega de la app) → canal
  porTipo: [
    [/^Abastos y Bodegas/i, 'bodega'],
    [/^Canal Tradicional/i, 'tradicional'],
    [/^Canal Moderno/i, 'moderno'],
    [/^Canal especial/i, 'especial'],
    [/^Farmacias$/i, 'especial'] // registros de antes de crear "Canal especial"
  ],
  // Cuando el vendedor eligió "Otros", se busca el canal por palabras del texto
  porPalabras: [
    [/bodega|abasto|bodeg[oó]n|kiosco|quiosco|minimercado/i, 'bodega'],
    [/cadena|hipermercado|gran superficie/i, 'moderno'],
    [/supermercado|automercado|autoservicio|mercado/i, 'tradicional'],
    [/farmacia|hotel|funerari|perfumer|cafeter/i, 'especial']
  ],

  // Lo que el analista revisa cada vez que factura un pedido a crédito (del manual)
  alFacturar: [
    'Confirmar que el pedido no traiga productos excluidos para su canal.',
    'Si el pedido es mayor que el límite: factura dividida o pago de contado del excedente antes de despachar.',
    'Verificar que no tenga facturas vencidas antes de dar un nuevo crédito.'
  ]
};

// Calcula qué hacer con un cliente. x = fila de la hoja, linea = 'BIPA Productos' | 'BIPA Ritual Sensorial'
function recomendar(x, linea) {
  var obs = String(x['Observaciones'] || '');
  var tipo = String(x['Tipo de cliente'] || (obs.match(/Tipo: ([^·]+)/) || [])[1] || '').trim();
  var interes = String(x['Interés'] || (obs.match(/Interés: ([^·]+)/) || [])[1] || '').trim();
  var r = { tipo: tipo, canal: null, porTexto: false, alertas: [], pendientes: [] };

  if (linea === 'BIPA Ritual Sensorial') {
    r.sinReglas = 'La línea Ritual Sensorial no tiene reglas de crédito en el manual.';
  } else {
    REGLAS.porTipo.forEach(function (p) { if (!r.canal && p[0].test(tipo)) r.canal = p[1]; });
    if (!r.canal && /^Otros/i.test(tipo)) {
      REGLAS.porPalabras.forEach(function (p) { if (!r.canal && p[0].test(tipo)) { r.canal = p[1]; r.porTexto = true; } });
    }
    if (!r.canal) r.sinReglas = tipo ? 'El tipo "' + tipo + '" no corresponde a ningún canal del manual.' : 'El cliente llegó sin tipo de cliente.';
  }
  r.reglas = r.canal ? REGLAS.canales[r.canal] : null;

  // Cosas que frenan la aprobación
  if (/^OJO/.test(x['Nota oficina'] || '')) r.alertas.push('Este teléfono ya estaba registrado: confirma que no sea el mismo cliente.');
  if (r.porTexto) r.alertas.push('Canal deducido del texto "' + tipo.replace(/^Otros:\s*/i, '') + '": confírmalo.');
  // Cosas por hacer que no frenan
  if (!x['RIF']) r.pendientes.push(x['Foto RIF'] ? 'Leer el RIF de la foto (botón en Datos fiscales).' : 'Falta la foto del RIF: pedirla al vendedor.');
  if (!x['Google Maps'] && !x['Latitud']) r.pendientes.push('Llegó sin ubicación GPS: confirmar la dirección.');
  if (/^bajo/i.test(interes)) r.pendientes.push('Interés bajo: empezar con un primer pedido pequeño.');

  if (!r.reglas) {
    r.accion = 'revisar';
    r.titulo = 'Revisar manualmente';
    r.motivo = r.sinReglas;
  } else if (r.alertas.length) {
    r.accion = 'revisar';
    r.titulo = 'Revisar antes de aprobar';
    r.motivo = r.alertas[0];
  } else {
    r.accion = 'aprobar';
    r.titulo = 'Aprobar con crédito de $' + r.reglas.creditoInicial + ' a ' + r.reglas.plazo.split(' (')[0];
    r.motivo = r.reglas.notaCredito;
  }
  // Texto corto para la lista y para la nota de oficina
  r.corto = r.reglas ? '$' + r.reglas.creditoInicial + ' · ' + r.reglas.plazo.split(' (')[0] : 'Sin reglas';
  r.nota = r.reglas ? 'Crédito $' + r.reglas.creditoInicial + ' (máx. $' + r.reglas.creditoMax + ') · ' + r.reglas.plazo + ' · ' + r.reglas.nombre : '';
  return r;
}
