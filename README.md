# Trayectoria Escolar · Colegio Marina de Chile

El proyecto tiene dos partes, cada una en su carpeta:

| Carpeta | Qué es | Dónde va |
| --- | --- | --- |
| `github/` | La página web (HTML, estilos, código, logos) | Se sube a un repositorio de GitHub y se publica con GitHub Pages |
| `apps-script/` | El backend que guarda los datos | Se pega en Apps Script, dentro de una Hoja de Cálculo de Google privada |

Orden recomendado:
1. Instalar el backend: `apps-script/README.md`.
2. Pegar su URL en `github/js/config.js` y guardar los logos en `github/img/`.
3. Publicar la página: `github/README.md`.
4. Migrar los datos desde Firebase: `apps-script/README.md`, sección final.
