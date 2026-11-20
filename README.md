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
| `editor-81d32a46c8.html` | Interfaz privada del editor y control de "Ella". |
| `sw.js` | Service worker: muestra notificaciones y renueva suscripciones. |
| `api/truco.js` | API HTTP de partidas, apuestas, chat y premios. |
| `api/_truco_engine.js` | Motor puro del juego: reglas, cartas, turnos y puntuacion. |
| `api/push.js` | API de suscripciones y mensajes push. |
| `api/_push_lib.js` | Utilidades compartidas de almacenamiento y web push. |
| `api/cron.js` | Procesa recordatorios y mensajes pendientes. |
| `api/sync.js` | Sincroniza el estado cifrado de cada usuario. |
| `vercel.json` | Programacion diaria de respaldo del cron. |
| `.github/workflows/avisos.yml` | Ejecucion horaria externa del cron. |

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
- `secret`: clave privada de `ella`.
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
CRON_SECRET
```

Los nombres Redis alternativos admitidos son `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`.

## Desarrollo local

Instalar dependencias:

```bash
npm install
```

Ejecutar las pruebas:

```bash
npm test
```

Para ejecutar la aplicacion completa se necesita desplegar en Vercel, donde cada archivo dentro de `api/` se convierte en una funcion con su propia ruta. Por ejemplo:

- `api/truco.js` -> `/api/truco`
- `api/push.js` -> `/api/push`
- `api/cron.js` -> `/api/cron`

## Seguridad y despliegue

- No expongas secretos ni tokens en `index.html` o `editor-81d32a46c8.html`.
- Configura `BLOB_READ_WRITE_TOKEN` y las claves Redis solo en Vercel.
- No publiques capturas con datos reales de usuarios.
- La clave privada del editor permite elegir el rol de `ella`; mantenla fuera del codigo.
