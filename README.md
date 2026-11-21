# Nuestras cartas

Aplicacion privada para compartir cartas, recordatorios, notificaciones y jugar al truco argentino a dos personas.

## Funcionalidades

- Catalogo privado de cartas y editor cifrado.
- Sincronizacion entre la app y el editor.
- Recordatorios individuales y avisos programados.
- Notificaciones web push.
- Truco argentino a dos jugadores, sin flor y a 15 puntos.
- Premios y deudas derivados de las partidas.
- Mini chat durante una partida.

## Archivos principales

| Ruta | Funcion |
| --- | --- |
| `index.html` | Interfaz principal de "El". |
| `src/css/app.css` | Estilos legibles para editar. |
| `src/js/app.js` | Logica legible de la interfaz principal. |
| `assets/css/app.css` | Estilos minificados que carga la web; se generan al compilar. |
| `assets/js/app.js` | JavaScript minificado que carga la web; se genera al compilar. |
| `assets/data/app-data.js` | Datos generados por el editor; contiene los sobres cifrados. No editar a mano. |
| `editor-81d32a46c8.html` | Interfaz del editor y control de "Ella". |
| `sw.js` | Service worker: muestra notificaciones y renueva suscripciones. |
| `api/truco.js` | API HTTP de partidas, apuestas, chat y premios. |
| `api/_truco_engine.js` | Motor puro del juego: reglas, cartas, turnos y puntuacion. |
| `api/push.js` | API de suscripciones y mensajes push. |
| `api/_push_lib.js` | Utilidades compartidas de almacenamiento y web push. |
| `api/cron.js` | Procesa recordatorios y mensajes pendientes. |
| `api/sync.js` | Sincroniza el estado cifrado de cada usuario. |
| `vercel.json` | Publicacion estatica desde `public/` y programacion diaria de respaldo del cron. |
| `.github/workflows/avisos.yml` | Ejecucion horaria externa del cron. |

La interfaz principal separa estructura, estilos, logica y datos. Edita los archivos de `src/` y ejecuta `npm run build` para generar los archivos compactos de `assets/`. El editor conserva una plantilla para la vista previa y, al publicar, genera `index.html` y `assets/data/app-data.js` sin volver a incrustar la logica en la pagina. Un pequeno script sigue en el encabezado para aplicar el tema antes de mostrar la pagina y evitar un cambio de colores al cargar.

```text
api/                 Funciones de servidor
assets/
  css/app.css        Apariencia minificada (generada)
  data/app-data.js   Datos generados de los sobres
  js/app.js          Interacciones minificadas (generadas)
src/
  css/app.css        Apariencia legible
  js/app.js          Interacciones legibles
test/                Pruebas automaticas
index.html           Pantalla principal
editor-*.html        Editor privado
sw.js                Notificaciones del navegador
```

## Framework y servidor

La app no usa un framework de interfaz como React o Vue: está hecha con HTML, CSS y JavaScript. `esbuild` solo genera versiones compactas de los archivos del navegador; no cambia las reglas ni es un framework.

Vercel aloja los archivos de la web y sirve las funciones de `api/` como funciones Node.js bajo demanda. No hay un servidor propio ejecutándose continuamente. Por ejemplo, `api/truco.js` se publica como `/api/truco`.

## Donde se guardan los datos

No hay una base de datos SQL tradicional como PostgreSQL o MySQL. Se usan varios tipos de almacenamiento:

- `localStorage` del navegador guarda datos locales, como el estado de la colección y los ajustes.
- Vercel Blob guarda datos como JSON: suscripciones push, solicitudes, recordatorios y, si Redis no está configurado, partidas.
- Upstash Redis/KV es opcional; cuando está configurado, se usa para el estado y el ledger del truco.
- `cartas-datos.enc` guarda cifrados los datos que administra el editor. Al publicar, el editor genera `assets/data/app-data.js`, que contiene los sobres cifrados que usa la app.
- La sincronización de actividad usa `/api/sync` y guarda los datos cifrados en Vercel Blob.

## Como llegan las notificaciones

1. La persona acepta los permisos de notificación en el navegador.
2. El navegador registra `sw.js` y crea una suscripción para ese dispositivo.
3. La app envía esa suscripción a `/api/push`; el servidor la guarda en Vercel Blob.
4. Cuando toca enviar un aviso, `api/push.js` usa Web Push y las claves VAPID para enviarlo al servicio push del navegador.
5. El navegador despierta el service worker, que muestra el aviso. Al tocarlo, `sw.js` abre la app.

Se necesita HTTPS y permiso del usuario. La compatibilidad depende del navegador y del dispositivo; en algunos iPhone hay que instalar primero la web en la pantalla de inicio.

### Que significan `sw` y `cron`

- **Service Worker (`sw.js`)**: un pequeño programa del navegador que puede activarse en segundo plano para recibir avisos y mostrarlos. `sw` es una abreviatura habitual, no una palabra obligatoria.
- **Cron (`api/cron.js`)**: una tarea programada. No está ejecutándose todo el tiempo: GitHub Actions la llama cada hora y Vercel la ejecuta una vez al día como respaldo. Comprueba qué recordatorios ya vencieron y envía los avisos pendientes.

Los nombres se pueden cambiar, pero también hay que actualizar los lugares que los usan. `sw.js` debe coincidir con la ruta de registro del navegador y mantenerse en la raíz para tener alcance sobre toda la web. `api/cron.js` crea la ruta `/api/cron`, que aparece en la programación de Vercel y en GitHub Actions.

## Flujo del truco

1. El jugador `el` crea un desafio y deja su apuesta.
2. El jugador `ella` acepta si apuesta como minimo el mismo valor.
3. El estado completo vive en el servidor.
4. Cada llamada a `/api/truco` devuelve una vista limpia:
   - `el` solo recibe sus cartas.
   - `ella` solo recibe sus cartas.
5. El campo `v` es el numero de version de la partida y detecta acciones antiguas.
6. Al terminar una mano se actualiza el marcador.
7. Al llegar a 15 puntos se cierran la partida y se actualiza el ledger de premios/deudas.

## API `/api/truco`

Todas las acciones son `POST` y necesitan autenticacion.

### Atributos comunes

- `uid`: identificador corto del usuario.
- `tok`: token privado de `el`.
- El token firmado del editor identifica a `ella` en el truco.
- `action`: accion a ejecutar.
- `bet`: apuesta con cartas.
- `move`: movimiento del motor, usado por `act`.

### Acciones

- `state`: consultar estado y marcar presencia.
- `challenge`: crear un desafio.
- `accept`: aceptar el desafio.
- `decline` / `cancel`: rechazar o abandonar.
- `act`: jugar carta o cantar truco/envido.
- `say`: enviar un mensaje al mini chat.
- `useprize`: marcar un premio como usado.
- `paydebt`: marcar una deuda como pagada.

Ejemplo de consulta:

```json
{
  "uid": "usuario",
  "tok": "token-privado-de-por-lo-menos-20-caracteres",
  "action": "state"
}
```

Ejemplo de jugada:

```json
{
  "uid": "usuario",
  "tok": "token-privado-de-por-lo-menos-20-caracteres",
  "action": "act",
  "v": 3,
  "move": { "type": "play", "i": 0 }
}
```

## API de notificaciones `/api/push`

Acciones principales:

- `sub`: registrar o actualizar una suscripcion push.
- `resub` / `unsub`: renovar o borrar una suscripcion.
- `test`: enviar una prueba.
- `event`: enviar un aviso inmediato.
- `request`: crear una solicitud inmediata o programada.
- `custom`: crear una notificacion personalizada.
- `reqList` / `reqDone`: administrar solicitudes desde el editor.

Las claves VAPID se generan y almacenan automaticamente la primera vez.

## Notificaciones automaticas

Hay dos mecanismos de ejecucion:

- GitHub Actions llama `/api/cron` una vez por hora.
- Vercel ejecuta el cron diario indicado en `vercel.json`.

La funcion comprueba recordatorios de suscriptores, avisos personalizados y solicitudes pendientes. Se prioriza el horario de Madrid.

## Requisitos

- Node.js 18 o superior.
- Cuenta de Vercel con Blob Storage.
- Opcional: Redis de Upstash/KV para partidas de truco.

Variables habituales:

```text
BLOB_READ_WRITE_TOKEN
KV_REST_API_URL
KV_REST_API_TOKEN
EDITOR_LOGIN_PASSWORD
EDITOR_SESSION_SECRET
EDITOR_ORIGIN (opcional)
CRON_SECRET
```

Los nombres Redis alternativos admitidos son `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`.

`EDITOR_LOGIN_PASSWORD` debe tener al menos 16 caracteres (recomiendo una clave aleatoria de 32 o más). `EDITOR_SESSION_SECRET` y `CRON_SECRET` también deben ser aleatorios y tener al menos 32 caracteres; puedes generar cada valor con:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Configura estas variables en Vercel, en **Settings → Environment Variables**. `EDITOR_ORIGIN` solo hace falta si cambia el origen del editor; por defecto es `https://editor-aurora-81d3.vercel.app`. Guarda el mismo `CRON_SECRET` en GitHub como secreto del repositorio llamado `CRON_SECRET` para que funcione el aviso horario. No pongas estos valores en archivos del proyecto ni los compartas.

## Desarrollo local

Instalar dependencias:

```bash
npm install
```

Ejecutar las pruebas:

```bash
npm test
```

Generar los archivos compactos que carga la web:

```bash
npm run build
```

Para ejecutar la aplicacion completa se necesita desplegar en Vercel, donde cada archivo dentro de `api/` se convierte en una funcion con su propia ruta. Por ejemplo:

- `api/truco.js` -> `/api/truco`
- `api/push.js` -> `/api/push`
- `api/cron.js` -> `/api/cron`

## Seguridad y despliegue

- Conserva el enlace habitual del editor: `https://editor-aurora-81d3.vercel.app/editor-81d32a46c8.html`.
- Como el editor y la API están en dominios distintos, no se usa una cookie `HttpOnly`: el editor obtiene un token firmado que vence en 8 horas y lo guarda en `sessionStorage` (solo esa pestaña/sesion del navegador). El token es accesible al JavaScript del editor; la API lo acepta solo desde el origen configurado y limita CORS a ese origen.
- La clave de acceso es `EDITOR_LOGIN_PASSWORD`; es distinta de la contraseña que descifra las cartas. Cierra sesión con **Bloquear** y vuelve a entrar si el token vence.
- La sincronizacion privada, las acciones administrativas de notificaciones y el rol `ella` en el truco requieren esa sesion. Las funciones normales de la app (por ejemplo, guardar actividad cifrada, jugar como `el` y enviar solicitudes) siguen disponibles para las personas usuarias.
- El cron exige `CRON_SECRET`; no se acepta una clave en la URL.
- El HTML y JavaScript que se envian al navegador siempre se pueden inspeccionar o copiar. El backend protege datos y operaciones, pero no puede impedir que alguien copie una web publica. Para proteger el codigo fuente, mantén privado el repositorio de GitHub y comparte solo la web desplegada.
- No expongas secretos ni tokens en `index.html` o `editor-81d32a46c8.html`.
- Configura `BLOB_READ_WRITE_TOKEN` y las claves Redis solo en Vercel.
- No publiques capturas con datos reales de usuarios.
- No guardes ni compartas `EDITOR_LOGIN_PASSWORD`, `EDITOR_SESSION_SECRET`, `CRON_SECRET` ni el token de GitHub.
