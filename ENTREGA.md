# Guía de entrega: cómo administrar y cambiar la app

Esta guía es para la persona que se queda a cargo de la app de **registro de clientes nuevos** de BIPA. No hace falta saber programar: los cambios se piden en español a Claude Code (u otra herramienta de "vibe coding") abierta sobre este repositorio. El archivo `CLAUDE.md` le explica a Claude cómo está hecha la app.

## 1. Qué es y quién la usa

- **Vendedores** (celular): https://proyectosiabipa-stack.github.io/registro-clientes/
  Eligen la línea (BIPA Productos o BIPA Ritual Sensorial), tocan su nombre, llenan datos, toman foto del RIF y del local, y la app toma la ubicación GPS. Funciona sin señal: guarda el registro y lo envía solo cuando vuelve la conexión.
- **Oficina** (celular o PC): https://proyectosiabipa-stack.github.io/registro-clientes/oficina.html
  Entra con una clave. Ve la lista, abre cada ficha con sus fotos, ve la recomendación de crédito, aprueba o rechaza (uno o varios), ve el tablero por vendedor, exporta a Excel y descarga fotos.

## 2. Dónde vive cada cosa

| Pieza | Dónde está | Para qué |
|---|---|---|
| Pantallas (este repositorio) | GitHub: `proyectosiabipa-stack/registro-clientes`, publicado con GitHub Pages | Lo que ven vendedores y oficina |
| Motor | Google Apps Script, proyecto **"REGISTRO DE CLIENTES NUEVOS"** en script.google.com (copia del código en `apps-script/Codigo.gs`) | Recibe los registros y los guarda |
| Datos | Hoja de Google **"Registro de clientes nuevos"**, pestaña `Clientes` | Una fila por cliente |
| Fotos | Carpeta de Google Drive **"Registro de clientes - Fotos"** | Fotos del RIF y del local (privadas) |
| Clave de oficina | Dentro del Apps Script (Propiedades del script). **No** está en GitHub | Entrar al panel |

Ojo: en el Drive hay copias viejas con el mismo nombre. La hoja y la carpeta **vigentes** son las que tienen registros de noviembre de 2026. Si hay dudas, en el Apps Script: ⚙️ Configuración del proyecto → Propiedades del script → `SHEET_ID` y `FOLDER_ID` dicen cuáles usa.

### Archivos de este repositorio

- `index.html` — app de vendedores.
- `oficina.html` — panel de oficina.
- `config.js` — **lo que más se cambia**: lista de vendedores, nombre de la empresa y el enlace del motor.
- `reglas.js` — reglas de la recomendación de crédito, plazo y portafolio.
- `api.js`, `cola.js`, `sw.js`, `excel.js` — conexión con el motor, envío sin señal, funcionamiento sin internet y Excel.
- `apps-script/Codigo.gs` — copia del motor (lo que está pegado en script.google.com).
- `pruebas/` — prueba automática completa que no toca los datos reales.

## 3. Cómo hacer un cambio

1. Abre Claude Code sobre este repositorio (en la web: claude.ai/code y elige el repositorio; o en tu computadora clonándolo).
2. Pide el cambio en palabras normales, por ejemplo:
   - "Agrega a la vendedora Ana a la lista y quita a Juan."
   - "En el panel, pon el teléfono en grande en la ficha."
   - "Cambia el plazo de crédito de las farmacias a 21 días."
3. Pídele que lo pruebe y que lo suba a la rama `main` (o que abra un pull request y luego lo aceptas en GitHub).
4. En 1 o 2 minutos GitHub Pages publica el cambio. Los celulares lo toman la próxima vez que abran la app con señal.

**Cambios en las pantallas** (todo menos `apps-script/`): se publican solos al llegar a `main`.

**Cambios en el motor** (`apps-script/Codigo.gs`): hay un paso a mano, porque Google no se actualiza desde GitHub:
1. Abre script.google.com → proyecto "REGISTRO DE CLIENTES NUEVOS".
2. Borra todo el contenido de `Código.gs` y pega el nuevo `apps-script/Codigo.gs` completo. Guarda (💾).
3. **Implementar → Gestionar implementaciones → ✏️ (lápiz) → Versión: "Nueva versión" → Implementar.**
4. **No** uses "Nueva implementación": cambia el enlace `/exec` y la app deja de funcionar (habría que ponerlo en `config.js`).

## 4. Tareas comunes

- **Cambiar la clave de oficina:** en el Apps Script, en `CONFIG.CLAVE_OFICINA` escribe la clave nueva, guarda, publica "Nueva versión" y entra una vez al panel con la clave nueva. Queda guardada aunque luego se pegue otro código. Nunca la subas a GitHub (el repositorio es público).
- **Agregar o quitar vendedores:** `config.js`, lista `VENDEDORES`.
- **Correo de aviso por cada registro:** `CONFIG.EMAILS_AVISO` en el Apps Script.
- **Ver o corregir datos a mano:** directamente en la Hoja de Google. Las columnas nuevas siempre van al final; no reordenes las columnas.
- **Si el motor deja de responder:** en script.google.com → Ejecuciones, se ven los errores.

## 5. Probar sin tocar datos reales

La carpeta `pruebas/` tiene una prueba completa que simula Google en la computadora (no escribe en la hoja real). Pídele a Claude: "corre la prueba completa de `pruebas/`". Hace unas 30 comprobaciones (registro, fotos, GPS, señal cortada, cola sin señal, duplicados, panel, aprobar varios, eliminar y Excel).

## 6. Accesos que necesitas

Para administrar todo, la cuenta de quien se hace cargo necesita:
- Ser **colaborador** del repositorio en GitHub (o dueño, si se transfiere).
- Ser **Editor** del proyecto Apps Script, de la Hoja y de la carpeta de fotos.
- Conocer la clave de oficina (se pasa en privado, nunca por GitHub).

Importante: el motor funciona con la cuenta de Google dueña del Apps Script (las fotos y la hoja quedan en su Drive y los correos salen de ella). Si esa cuenta se cierra o se borra, la app deja de guardar. Para pasar la propiedad por completo hay que mudar también el Apps Script, la hoja y la carpeta a la cuenta nueva.
