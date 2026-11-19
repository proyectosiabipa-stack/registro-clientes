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

Prueba de la galería de fotos y de "Mis clientes" (rápida, ~1 minuto, mismo servidor y mismo simulador): `node e2e-galeria-historial.js`.

Recomendado: correr todo sobre una copia del repositorio cuyo `config.js` tenga una `API_URL` falsa (por ejemplo `.../macros/s/PRUEBA-FALSA/exec`). Así, aunque algo se escapara del simulador, nunca llegaría al motor real.

`e2e.js` tarda unos 3 minutos (espera dos veces 62 s a propósito, para probar el refresco del panel). Clave de prueba: `cambiar1234`. Las fotos de ejemplo están en `fotos/`.
