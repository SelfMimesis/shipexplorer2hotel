# ShipExplorer Popup Server

Backend Node.js para controlar popups remotos de ShipExplorer mediante WebSocket.

## Stack

- Node.js
- Express
- ws
- Sin base de datos
- Controller HTML/CSS/JS vanilla servido en `GET /controller.html`

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
https://selfmimesis.github.io,https://shipexplorer.com
```

Si esta vacio, el servidor acepta cualquier origen. La pagina `controller.html` servida desde el mismo backend se permite siempre.

`NODE_ENV`

Usa `production` en Render.

`PORT`

Render lo define automaticamente. El servidor usa `process.env.PORT || 10000`.

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
ALLOWED_ORIGINS=https://selfmimesis.github.io
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
  "updatedAt": "2026-06-08T12:00:00.000Z"
}
```

### GET /controller.html

Sirve una pagina HTML simple para controlar el popup.

## WebSocket

Ruta:

```text
/ws
```

En produccion usa:

```text
wss://TU-SERVICIO.onrender.com/ws
```

Los viewers de ShipExplorer se conectan a `/ws` y reciben el estado actual inmediatamente.

Mensaje enviado por el controller para mostrar popup:

```json
{
  "type": "popup:show",
  "token": "...",
  "message": "Texto del popup"
}
```

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
  "updatedAt": "2026-06-08T12:00:00.000Z"
}
```

Errores enviados al cliente que mando el comando:

```json
{
  "type": "error",
  "message": "Invalid admin token."
}
```

## Snippet Para El Frontend Publico

```html
<script>
  const socket = new WebSocket("wss://TU-SERVICIO.onrender.com/ws");

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
- Texto sanitizado antes de actualizar el estado global.
- Sin base de datos: el estado vive en memoria y se reinicia al reiniciar el proceso.
