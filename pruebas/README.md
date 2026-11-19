# Prueba completa

`gas.js` simula Google Apps Script (hoja, Drive, caché, correo) en memoria y carga el `apps-script/Codigo.gs` real. `e2e.js` maneja con Playwright la app de vendedores y el panel contra ese motor simulado. No toca la hoja ni el Drive reales.

```
# en la raíz del repositorio, dejar corriendo:
python3 -m http.server 8010
# en otra terminal:
cd pruebas
npm i playwright && npx playwright install chromium
node e2e.js
```

Tarda unos 3 minutos (espera dos veces 62 s a propósito, para probar el refresco del panel). Clave de prueba: `cambiar1234`. Las fotos de ejemplo están en `fotos/`.
