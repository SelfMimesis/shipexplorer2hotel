# ShipExplorer Popup Server

Backend Node.js para controlar popups remotos de ShipExplorer mediante WebSocket.

## Stack

- Node.js
- Express
- ws
- Sin base de datos
- Controller HTML/CSS/JS vanilla en `controller.html`, servido en `GET /controller.html`

## Estructura

```text
server/
├─ package.json
├─ server.js
├─ controller.html
├─ state.json
├─ README.md
```

## Instalacion Local

```bash
cd server
npm install
ADMIN_TOKEN=change-me npm run dev
```

En Windows PowerShell:

```powershell
cd server
$env:ADMIN_TOKEN="change-me"
npm run dev
```

Servidor local:

```text
http://localhost:10000
```

Controller:

```text
http://localhost:10000/controller.html
```

## Variables De Entorno

`ADMIN_TOKEN`

Token secreto para mandar comandos desde el controller. No se expone nunca desde el servidor. En `NODE_ENV=production` es obligatorio; si falta, el servidor no arranca.

`ALLOWED_ORIGINS`

Lista de origenes permitidos separados por coma. Ejemplo:

```text
https://selfmimesis.github.io,https://selfmimesis.github.io/shipexplorer,https://shipexplorer2.onrender.com
```

El servidor normaliza cada entrada al origen real (`protocolo://host`). En produccion, los requests HTTP con `Origin` y los WebSocket con `Origin` solo se aceptan si estan en esta lista.

En desarrollo tambien se permiten:

```text
http://localhost:8080
http://127.0.0.1:8080
http://localhost:5500
http://127.0.0.1:5500
```

Las conexiones WebSocket sin header `Origin` solo se permiten en desarrollo.

`NODE_ENV`

Usa `production` en Render.

`PORT`

Render lo define automaticamente. El servidor usa `process.env.PORT || 10000`.

## Estado Persistido

El ultimo estado del popup se guarda en `server/state.json`. Al arrancar se carga este archivo; si no existe se crea con estado por defecto. Si esta corrupto, se renombra a `state.corrupt.<timestamp>.json` y se crea uno nuevo.

En Render, usa Persistent Disk si necesitas conservar `state.json` entre reinicios o redeploys del servicio.

## Render

1. Crea un nuevo Web Service en Render.
2. Conecta el repositorio.
3. Configura:

```text
Root Directory: server
Build Command: npm install
Start Command: npm start
```

4. Variables:

```text
NODE_ENV=production
ADMIN_TOKEN=<token-secreto-largo>
ALLOWED_ORIGINS=https://selfmimesis.github.io,https://shipexplorer2.onrender.com
```

5. Despliega.

## Endpoints

### GET /health

Respuesta:

```json
{
  "ok": true,
  "service": "shipexplorer-popup-server"
}
```

### GET /state

Respuesta:

```json
{
  "popupVisible": false,
  "popupMessage": "",
  "title": "",
  "variant": "info",
  "durationMs": 0,
  "dismissible": true,
  "updatedAt": "2026-06-08T12:00:00.000Z"
}
```

### GET /controller.html

Sirve `controller.html`, una pagina HTML simple para controlar el popup.

## WebSocket

Ruta:

```text
/ws
```

En produccion usa:

```text
wss://shipexplorer2.onrender.com/ws
```

Los viewers de ShipExplorer se conectan a `/ws` y reciben el estado actual inmediatamente.

Tambien pueden pedir el estado actual:

```json
{
  "type": "state:get"
}
```

Mensaje enviado por el controller para mostrar popup:

```json
{
  "type": "popup:show",
  "token": "...",
  "message": "Texto del popup",
  "title": "Aviso",
  "variant": "info",
  "durationMs": 0,
  "dismissible": true
}
```

`title` es opcional. `variant` acepta `info`, `warning`, `danger` o `success`. `durationMs: 0` deja el popup visible hasta ocultarlo; si es mayor que `0`, el cliente lo oculta localmente despues de ese tiempo. `dismissible` controla si aparece el cierre local.

Mensaje enviado por el controller para ocultar popup:

```json
{
  "type": "popup:hide",
  "token": "..."
}
```

Mensaje retransmitido a viewers:

```json
{
  "type": "popup:update",
  "popupVisible": true,
  "popupMessage": "Texto del popup",
  "title": "Aviso",
  "variant": "info",
  "durationMs": 0,
  "dismissible": true,
  "updatedAt": "2026-06-08T12:00:00.000Z"
}
```

Errores enviados al cliente que mando el comando:

```json
{
  "type": "error",
  "code": "UNAUTHORIZED",
  "message": "Token invalido"
}
```

## Snippet Para El Frontend Publico

```html
<script>
  const socket = new WebSocket("wss://shipexplorer2.onrender.com/ws");

  socket.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    if (data.type !== "popup:update") return;

    if (data.popupVisible) {
      console.log("Mostrar popup:", data.popupMessage);
    } else {
      console.log("Ocultar popup");
    }
  });
</script>
```

## Seguridad Incluida

- `ADMIN_TOKEN` obligatorio en produccion.
- Token validado con comparacion segura.
- `ADMIN_TOKEN` nunca se sirve al frontend.
- `ALLOWED_ORIGINS` para HTTP y WebSocket.
- Rate limit basico en memoria por IP para comandos.
- Mensajes WebSocket binarios o mal formados son rechazados.
- Payload WebSocket limitado.
- Texto del popup limitado a 240 caracteres.
- Titulo limitado a 80 caracteres.
- `variant`, `durationMs` y `dismissible` validados en servidor.
- Texto sanitizado antes de actualizar el estado global.
- Sin base de datos: el estado se guarda en `state.json`.
