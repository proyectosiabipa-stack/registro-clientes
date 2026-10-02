# Registro de clientes nuevos

App para que los vendedores registren clientes nuevos desde el celular (datos, foto del RIF, foto del local y ubicación GPS) y la oficina los revise en un portal.

- **Formulario de vendedores:** https://proyectosiabipa-stack.github.io/registro-clientes/
- **Portal de oficina:** https://proyectosiabipa-stack.github.io/registro-clientes/oficina.html

## Cómo funciona

| Parte | Dónde vive | Qué hace |
|---|---|---|
| `index.html` | GitHub Pages | Formulario de los vendedores |
| `oficina.html` | GitHub Pages | Portal de oficina con clave: lista, fotos, mapa y aprobación |
| `config.js` | GitHub Pages | Nombre de la empresa, vendedores sugeridos y enlace del motor |
| `apps-script/Codigo.gs` | Google Apps Script | Motor: guarda cada registro en una Hoja de Google y las fotos en Google Drive |

Los cambios en las pantallas se publican solos al subirlos a la rama `main`.

El archivo `apps-script/Codigo.gs` hay que pegarlo a mano en script.google.com cuando cambia (casi nunca). Después: **Implementar → Gestionar implementaciones → ✏️ → Nueva versión → Implementar**, así el enlace no cambia.

La clave de oficina **no** se guarda en GitHub: se pone en `CONFIG.CLAVE_OFICINA` dentro de Apps Script y queda guardada allí.

## Dónde quedan los datos

En el Google Drive de la cuenta dueña del Apps Script:
- Hoja **"Registro de clientes nuevos"**: una fila por cliente.
- Carpeta **"Registro de clientes - Fotos"**: fotos del RIF y del local.
