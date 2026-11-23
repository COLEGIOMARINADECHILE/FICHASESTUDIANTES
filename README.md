# Trayectoria Escolar · sitio web

Página del sistema de seguimiento de estudiantes, convivencia e inclusión del Colegio Marina de Chile. Este repositorio solo contiene la página: los datos viven en una Hoja de Cálculo privada de Google, a la que se accede por medio del backend de Apps Script (carpeta `apps-script`, que no se sube a GitHub).

El código no contiene datos, claves ni la API Key: es seguro que el repositorio sea público.

## Antes de publicar

1. Guarde los logos en `img/` con estos nombres: `logo-colegio.png`, `logo-slep.png` y, si quiere una fotografía en la pantalla de ingreso, `COLEGIO.jpg`.
2. Pegue en `js/config.js` la URL `/exec` del Apps Script, y si quiere, el nombre del sistema:

```js
window.APP_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/XXXX/exec',
  APP_NAME: 'Trayectoria Escolar',
  APP_TAGLINE: 'Colegio Marina de Chile'
};
```

El nombre, el subtítulo y los logos también se cambian desde **Administración > Nombre, logos e IA**. Lo que se guarde ahí tiene prioridad sobre `config.js`.

## Publicar en GitHub Pages

1. Cree un repositorio en GitHub (por ejemplo, `trayectoria-escolar`).
2. Suba **el contenido de esta carpeta** (`index.html`, `css/`, `js/`, `img/`), con **Add file > Upload files** o con GitHub Desktop.
3. **Settings > Pages > Deploy from a branch**, rama `main`, carpeta `/ (root)`.
4. En uno o dos minutos la página queda en `https://<usuario>.github.io/trayectoria-escolar/`.

Para actualizar la página, suba los archivos modificados al mismo repositorio.

## Estructura

| Archivo | Contenido |
| --- | --- |
| `index.html` | Estructura de pantallas |
| `css/app.css` | Colores, tipografía, componentes y estilo de los PDF |
| `js/config.js` | URL del backend y nombre del sistema |
| `js/core.js` | Constantes, estado, conexión con Apps Script, modales |
| `js/app.js` | Sesión, panel, cursos, estudiantes, ficha y administración |
| `js/plans.js` | Planes de curso e individuales, IA y carta compromiso |
| `js/export.js` | Informes PDF y firmas |
| `js/imports.js` | Inasistencias desde Excel, matrícula desde PDF y migración desde Firebase |
| `img/` | Logos y fotografía |

Sin URL en `js/config.js`, la página abre en **modo demostración**: se puede recorrer, pero nada se guarda.
