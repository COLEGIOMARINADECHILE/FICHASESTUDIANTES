# Trayectoria Escolar · backend en Google Apps Script

Este archivo **no se sube a GitHub**: se pega en el editor de Apps Script de una Hoja de Cálculo de Google.

- **Datos**: cada colección es una pestaña de la hoja; cada fila guarda un registro.
- **Claves**: cifradas (SHA-256 con sal). La API Key de la IA y la clave maestra quedan en las Propiedades del Script.
- **Respaldos de estudiantes**: carpeta privada de Google Drive; solo se entregan a usuarios con sesión iniciada.
- **Permisos**: el servidor vuelve a revisar los permisos de cada usuario y no entrega el contenido de los registros confidenciales a quien no corresponde.

## Instalación

1. Con la cuenta institucional, cree una Hoja de Cálculo nueva (por ejemplo, "Base Trayectoria Escolar"). No la comparta con nadie.
2. En la hoja: **Extensiones > Apps Script**. Borre el contenido de `Código.gs`, pegue `Code.gs` y guarde.
3. En el selector de funciones elija **instalar** y presione **Ejecutar**. Acepte los permisos (Hojas, Drive y conexión externa para la IA).
4. En **Ver > Registros de ejecución** aparece la clave temporal del usuario **Admin Principal** (anótela) y el enlace a la hoja donde quedan los datos. Si el script no está dentro de una hoja, `instalar` crea una llamada "Base Trayectoria Escolar" en su Drive.
5. Opcional, en **Configuración del proyecto > Propiedades del script**:
   - `GROQ_API_KEY`: API Key de Groq (también se puede pegar después en Administración > Nombre, logos e IA).
   - `CLAVE_MAESTRA`: clave de rescate que permite entrar con cualquier usuario. Si no la define, no existe.
6. **Implementar > Nueva implementación > Aplicación web**:
   - Ejecutar como: **Yo**.
   - Quién tiene acceso: **Cualquier persona**. (Sin usuario y clave no se entrega ningún dato; la hoja sigue privada).
7. Copie la URL que termina en `/exec` y péguela en `github/js/config.js`.

Cuando cambie `Code.gs`, use **Implementar > Gestionar implementaciones > Editar > Nueva versión**, así la URL no cambia.

## Traspasar los datos desde Firebase

1. En su computador, abra con doble clic `herramientas/exportar-firebase.html` y presione **Descargar respaldo**. Se descarga `respaldo-firebase-AAAA-MM-DD.json`. Esa herramienta no se sube a GitHub.
2. Entre a la página como **Admin Principal** (clave de `restablecerAdmin`).
3. **Administración > Traspasar datos**: elija el archivo, revise las cantidades y presione **Copiar al sistema**.
4. Cada funcionario entra con su clave de siempre (se cifra al copiarla). Admin Principal conserva la clave nueva.
5. Guarde el archivo `.json` en un lugar seguro o bórrelo: contiene datos de estudiantes.
6. Al terminar, cierre las reglas de Firestore o elimine el proyecto de Firebase: la página antigua dejaba la base abierta.

## Enviar avisos de cuenta por correo

1. En el editor, elija la función **autorizarCorreo**, presione **Ejecutar** y acepte el permiso para enviar correos.
2. Publique una versión nueva (**Implementar > Gestionar implementaciones > Editar > Nueva versión**).
3. Los correos salen desde la cuenta de Google dueña del Apps Script. Una cuenta institucional de Google Workspace puede enviar unos 1.500 correos al día; una cuenta gmail.com, unos 100.

## Ingreso con la cuenta institucional @andaliensur.cl (Google)

**Ya creado** en el proyecto de Google Cloud `trayectoria-escolar` (en producción, usuarios externos, origen `https://colegiomarinadechile.github.io`). Propiedad del script que se debe agregar:

- `GOOGLE_CLIENT_ID` = `32573029246-77gl0qesv05r3g18t0oolpiv3dlaru9i.apps.googleusercontent.com`

Pasos para crearlo de nuevo, si alguna vez se necesita:

1. Con su cuenta @andaliensur.cl entre a https://console.cloud.google.com y cree un proyecto (por ejemplo, "Trayectoria Escolar").
2. **API y servicios > Pantalla de consentimiento de OAuth**: tipo **Interno**, nombre "Trayectoria Escolar", su correo de soporte. Guarde.
3. **API y servicios > Credenciales > Crear credenciales > ID de cliente de OAuth**: tipo **Aplicación web**. En **Orígenes autorizados de JavaScript** agregue la dirección de su página, solo el dominio, sin carpeta: `https://SU-USUARIO.github.io`. Cree y copie el **ID de cliente** (termina en `.apps.googleusercontent.com`).
4. En Apps Script, **Configuración del proyecto > Propiedades del script**, agregue `GOOGLE_CLIENT_ID` con ese valor. No necesita publicar una versión nueva.
5. Recargue la página: aparece el botón **Acceder con Google**. Solo entran cuentas que terminen en @andaliensur.cl y cuyo correo esté registrado en un funcionario (Administración > Funcionarios).

Si el paso 2 no permite elegir "Interno", su cuenta no tiene permisos en la organización: pídalo al administrador de Google Workspace del SLEP o elija "Externo" (el sistema igual rechaza correos que no sean @andaliensur.cl).

## Si no puede ingresar

Ejecute `restablecerAdmin` en el editor de Apps Script: deja activo a "Admin Principal" con una clave nueva, que aparece en el registro de ejecución.