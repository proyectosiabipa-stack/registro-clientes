# Instrucciones para el asistente de IA (Claude, Cursor, Copilot, Codex, Gemini u otro)

App de **registro de clientes nuevos** de BIPA. Los vendedores registran clientes desde el celular y la oficina los revisa y aprueba en un panel. Lee también `ENTREGA.md` (guía para personas).

## Cómo hablar con el dueño
- Responde siempre en **español**, sencillo y sin tecnicismos. Quien administra no es programador: haz tú los cambios, pruébalos y explica en una o dos frases qué cambió.
- Antes de algo que no se pueda deshacer (borrar datos de la Hoja o fotos de Drive), pregunta.

## Arquitectura
- **Pantallas (frontend)**: archivos estáticos en este repo, publicados con **GitHub Pages** desde la rama `main`. No hay build, ni npm, ni framework: HTML + JS puro.
  - `index.html` — app de vendedores (elige línea → quién registra → paso 1 datos → paso 2 fotos → paso 3 ubicación y envío).
  - `oficina.html` — panel de oficina con clave (lista, ficha, fotos, aprobar/rechazar, aprobar varios, tablero por vendedor, exportar a Excel, eliminar).
  - `config.js` — enlace del motor (`API_URL`, termina en `/exec`), nombre de la empresa, **lista fija de vendedores**, `ELEGIR_LINEA_SIEMPRE`.
  - `api.js` — imita `google.script.run` con `fetch` POST al motor (sin cabecera Content-Type, para evitar CORS).
  - `cola.js` — cola sin señal en IndexedDB; `sw.js` — service worker (abre sin señal y reenvía con Background Sync).
  - `reglas.js` — recomendación automática de crédito/plazo/portafolio por canal y línea.
  - `excel.js` — genera el .xlsx sin librerías.
  - `manifest*.json`, `icon-*.png`, `logo-*.png` — app instalable y marca.
- **Motor (backend)**: `apps-script/Codigo.gs`, en Google Apps Script (proyecto "REGISTRO DE CLIENTES NUEVOS" en script.google.com). Guarda en la Hoja de Google **"Registro de clientes nuevos"** (pestaña `Clientes`) y las fotos en la carpeta de Drive **"Registro de clientes - Fotos"**. Los IDs de hoja y carpeta están en Propiedades del script (`SHEET_ID`, `FOLDER_ID`).
  - `doPost` solo acepta las funciones listadas en `ACCIONES`. Si agregas una función nueva que llamen las pantallas, agrégala ahí.
  - `version()` devuelve el número de versión del motor; súbelo si cambias lo que acepta.
  - `COLUMNAS`: las columnas nuevas van **siempre al final**, para no desordenar los datos guardados.

## Reglas importantes
- **Nunca** pongas la clave de oficina ni otros secretos en este repo (es público). La clave vive en Propiedades del script (`CLAVE_OFICINA`).
- Cada vez que cambies un archivo de las pantallas que el service worker guarda, **sube el número de `CACHE` en `sw.js`** (ej. `registro-clientes-v21` → `v22`), si no los celulares siguen viendo la versión vieja.
- Si cambias `apps-script/Codigo.gs`, el dueño tiene que pegarlo a mano en script.google.com y publicar con **Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva versión → Implementar**. **No** crear una implementación nueva: cambiaría el enlace `/exec` y la app dejaría de funcionar. Avísale siempre cuando haga falta este paso.
- Las pantallas deben seguir funcionando con un motor viejo cuando sea posible (el panel ya lee algunos datos desde "Observaciones" si el motor no tiene columnas nuevas).
- Duplicados: se detectan por teléfono dentro de la misma línea; el "ID local" que pone el teléfono evita registros repetidos al reenviar.
- Ningún campo del formulario es obligatorio (decisión del dueño). No hay campos de RIF ni razón social en el formulario: se leen de la foto del RIF con OCR (función `leerRif`).
- Dos líneas de venta: "BIPA Productos" (verdes #286a4d / #95cf5f) y "BIPA Ritual Sensorial" (degradado #f6dc7e → #f2948a → #9d97dc).

## Cómo probar
- Ver las pantallas en local: `python3 -m http.server 8010` en la raíz y abrir http://localhost:8010/ (llamará al motor real de config.js).
- Prueba completa sin tocar datos reales: `pruebas/gas.js` simula Apps Script (hoja, Drive, caché, correo) en memoria y carga el `Codigo.gs` real; `pruebas/e2e.js` maneja la app de vendedores y el panel con Playwright. Con el servidor de arriba corriendo: `cd pruebas && npm i playwright && npx playwright install chromium && node e2e.js`. Tarda unos 3 minutos (espera dos veces 62 s a propósito). La clave de prueba es `cambiar1234`.

## Publicar
- Pantallas: commit y push a `main` → GitHub Pages publica solo en 1–2 minutos.
- Motor: pegar `apps-script/Codigo.gs` en script.google.com y publicar "Nueva versión" (ver arriba).
