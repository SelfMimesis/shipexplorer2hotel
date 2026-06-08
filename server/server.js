const crypto = require("crypto");
const http = require("http");
const path = require("path");
const express = require("express");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = Number(process.env.PORT) || 10000;
const HOST = "0.0.0.0";
const SERVICE_NAME = "shipexplorer-popup-server";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const NODE_ENV = process.env.NODE_ENV || "development";
const MAX_POPUP_MESSAGE_LENGTH = 240;
const MAX_WS_PAYLOAD_BYTES = 2048;
const COMMAND_RATE_LIMIT = {
  windowMs: 60 * 1000,
  max: 20,
};

if (NODE_ENV === "production" && !ADMIN_TOKEN) {
  console.error("FATAL: ADMIN_TOKEN is required when NODE_ENV=production.");
  process.exit(1);
}

if (!ADMIN_TOKEN) {
  console.warn("WARNING: ADMIN_TOKEN is not set. Popup controller commands will be rejected.");
}

const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS || "");
let popupState = {
  popupVisible: false,
  popupMessage: "",
  updatedAt: new Date().toISOString(),
};

const app = express();
app.disable("x-powered-by");

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin) {
    if (!isOriginAllowed(origin, req)) {
      return res.status(403).json({ ok: false, error: "Origin not allowed" });
    }

    res.setHeader("Access-Control-Allow-Origin", normalizeOrigin(origin));
    res.setHeader("Vary", "Origin");
  } else if (allowedOrigins.length === 0) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  return next();
});

app.get("/health", (req, res) => {
  res.json({ ok: true, service: SERVICE_NAME });
});

app.get("/state", (req, res) => {
  res.json(getPublicPopupState());
});

app.get("/controller.html", (req, res) => {
  res.sendFile(path.join(__dirname, "controller.html"));
});

app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Not found" });
});

const server = http.createServer(app);
const wss = new WebSocketServer({
  noServer: true,
  maxPayload: MAX_WS_PAYLOAD_BYTES,
});

const clients = new Set();
const rateBuckets = new Map();

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname !== "/ws") {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
    return;
  }

  if (!isOriginAllowed(req.headers.origin, req)) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", (ws, req) => {
  const client = {
    ws,
    ip: getClientIp(req),
    isAlive: true,
  };

  clients.add(client);
  ws.on("pong", () => {
    client.isAlive = true;
  });

  ws.on("message", (data, isBinary) => {
    handleWsMessage(client, data, isBinary);
  });

  ws.on("close", () => {
    clients.delete(client);
  });

  ws.on("error", () => {
    clients.delete(client);
  });

  sendJson(ws, buildPopupUpdate());
});

const heartbeat = setInterval(() => {
  for (const client of clients) {
    if (client.ws.readyState !== WebSocket.OPEN) {
      clients.delete(client);
      continue;
    }

    if (!client.isAlive) {
      clients.delete(client);
      client.ws.terminate();
      continue;
    }

    client.isAlive = false;
    client.ws.ping();
  }
}, 30 * 1000);

wss.on("close", () => {
  clearInterval(heartbeat);
});

server.listen(PORT, HOST, () => {
  console.log(`${SERVICE_NAME} listening on ${HOST}:${PORT}`);
});

function handleWsMessage(client, data, isBinary) {
  if (isBinary) {
    sendError(client.ws, "Binary messages are not supported.");
    return;
  }

  const raw = data.toString("utf8");
  if (Buffer.byteLength(raw, "utf8") > MAX_WS_PAYLOAD_BYTES) {
    sendError(client.ws, "Message payload is too large.");
    return;
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    sendError(client.ws, "Malformed JSON message.");
    return;
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    sendError(client.ws, "WebSocket message must be a JSON object.");
    return;
  }

  if (payload.type === "ping") {
    sendJson(client.ws, { type: "pong", updatedAt: new Date().toISOString() });
    return;
  }

  if (payload.type === "state:get") {
    sendJson(client.ws, buildPopupUpdate());
    return;
  }

  if (payload.type !== "popup:show" && payload.type !== "popup:hide") {
    sendError(client.ws, "Unsupported message type.");
    return;
  }

  if (!checkCommandRateLimit(client.ip)) {
    sendError(client.ws, "Rate limit exceeded. Please wait before sending another command.");
    return;
  }

  if (!isValidAdminToken(payload.token)) {
    sendError(client.ws, "Invalid admin token.");
    return;
  }

  if (payload.type === "popup:show") {
    if (typeof payload.message !== "string") {
      sendError(client.ws, "Popup message must be a string.");
      return;
    }

    if ([...payload.message].length > MAX_POPUP_MESSAGE_LENGTH) {
      sendError(client.ws, `Popup message must be ${MAX_POPUP_MESSAGE_LENGTH} characters or fewer.`);
      return;
    }

    const message = sanitizePopupMessage(payload.message);
    if (!message) {
      sendError(client.ws, "Popup message cannot be empty.");
      return;
    }

    setPopupState(true, message);
    return;
  }

  setPopupState(false, "");
}

function setPopupState(popupVisible, popupMessage) {
  popupState = {
    popupVisible: Boolean(popupVisible),
    popupMessage: popupVisible ? popupMessage : "",
    updatedAt: new Date().toISOString(),
  };

  broadcastPopupUpdate();
}

function getPublicPopupState() {
  return {
    popupVisible: popupState.popupVisible,
    popupMessage: popupState.popupMessage,
    updatedAt: popupState.updatedAt,
  };
}

function buildPopupUpdate() {
  return {
    type: "popup:update",
    ...getPublicPopupState(),
  };
}

function broadcastPopupUpdate() {
  const message = buildPopupUpdate();

  for (const client of clients) {
    sendJson(client.ws, message);
  }
}

function sendJson(ws, payload) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

function sendError(ws, message) {
  sendJson(ws, { type: "error", message });
}

function sanitizePopupMessage(message) {
  return message
    .normalize("NFKC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isValidAdminToken(token) {
  if (!ADMIN_TOKEN || typeof token !== "string") return false;

  const expected = Buffer.from(ADMIN_TOKEN, "utf8");
  const received = Buffer.from(token, "utf8");

  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(expected, received);
}

function checkCommandRateLimit(ip) {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);

  if (!bucket || now - bucket.startedAt >= COMMAND_RATE_LIMIT.windowMs) {
    rateBuckets.set(ip, { startedAt: now, count: 1 });
    return true;
  }

  bucket.count += 1;
  return bucket.count <= COMMAND_RATE_LIMIT.max;
}

function getClientIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }

  return req.socket.remoteAddress || "unknown";
}

function parseAllowedOrigins(value) {
  return value
    .split(",")
    .map((origin) => normalizeOrigin(origin.trim()))
    .filter(Boolean);
}

function normalizeOrigin(origin) {
  if (!origin) return "";

  try {
    const parsed = new URL(origin);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "";
  }
}

function isOriginAllowed(origin, req) {
  if (!origin) return true;

  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) return false;

  const host = req.headers.host;
  const sameServiceOrigins = host ? [`http://${host}`, `https://${host}`] : [];
  if (sameServiceOrigins.includes(normalizedOrigin)) return true;

  if (allowedOrigins.length === 0) return true;
  return allowedOrigins.includes(normalizedOrigin);
}

const CONTROLLER_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ShipExplorer Popup Controller</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #111314;
      --panel: #181b1c;
      --line: #1f7d72;
      --cyan: #44e0c0;
      --amber: #ff7a16;
      --red: #e75a4f;
      --text: #d7e3df;
      --muted: #7f9695;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background:
        linear-gradient(rgba(68, 224, 192, 0.035) 1px, transparent 1px),
        linear-gradient(90deg, rgba(68, 224, 192, 0.035) 1px, transparent 1px),
        var(--bg);
      background-size: 24px 24px;
      color: var(--text);
      font-family: Consolas, "Courier New", monospace;
    }

    main {
      width: min(620px, calc(100vw - 32px));
      border: 1px solid var(--line);
      background: rgba(24, 27, 28, 0.92);
      padding: 24px;
      box-shadow: 0 0 0 1px rgba(68, 224, 192, 0.18), 0 18px 80px rgba(0, 0, 0, 0.45);
    }

    h1 {
      margin: 0 0 6px;
      color: var(--cyan);
      font-size: 22px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    p {
      margin: 0;
      color: var(--muted);
      line-height: 1.5;
    }

    label {
      display: block;
      margin: 18px 0 8px;
      color: var(--cyan);
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    input,
    textarea {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 0;
      background: #0d1011;
      color: var(--text);
      padding: 12px;
      font: inherit;
      outline: none;
    }

    textarea {
      min-height: 110px;
      resize: vertical;
    }

    input:focus,
    textarea:focus {
      border-color: var(--cyan);
      box-shadow: 0 0 0 2px rgba(68, 224, 192, 0.14);
    }

    .row {
      display: flex;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
      margin-top: 16px;
    }

    .actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 20px;
    }

    button {
      border: 1px solid var(--cyan);
      background: rgba(68, 224, 192, 0.08);
      color: var(--text);
      padding: 11px 16px;
      font: inherit;
      cursor: pointer;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    button:hover {
      border-color: var(--amber);
      color: var(--amber);
      background: rgba(255, 122, 22, 0.12);
    }

    button.danger {
      border-color: var(--red);
    }

    .status,
    .state {
      border: 1px solid rgba(31, 125, 114, 0.7);
      background: rgba(13, 16, 17, 0.72);
      padding: 12px;
      color: var(--muted);
      margin-top: 18px;
      min-height: 44px;
    }

    .status strong,
    .state strong {
      color: var(--cyan);
    }

    .error {
      color: var(--red);
    }

    .ok {
      color: var(--cyan);
    }

    .count {
      color: var(--muted);
      font-size: 12px;
    }
  </style>
</head>
<body>
  <main>
    <h1>ShipExplorer Popup Controller</h1>
    <p>Remote WebSocket control panel for the public ShipExplorer popup.</p>

    <label for="token">Admin Token</label>
    <input id="token" type="password" autocomplete="off" placeholder="ADMIN_TOKEN">

    <label for="message">Popup Message</label>
    <textarea id="message" maxlength="240" placeholder="Message shown in ShipExplorer"></textarea>

    <div class="row">
      <span id="count" class="count">0 / 240</span>
      <span id="socketStatus">DISCONNECTED</span>
    </div>

    <div class="actions">
      <button id="showButton" type="button">Show Popup</button>
      <button id="hideButton" class="danger" type="button">Hide Popup</button>
      <button id="reconnectButton" type="button">Reconnect</button>
    </div>

    <div id="status" class="status">Waiting for connection.</div>
    <div id="state" class="state">Popup state unknown.</div>
  </main>

  <script>
    const tokenInput = document.querySelector("#token");
    const messageInput = document.querySelector("#message");
    const count = document.querySelector("#count");
    const socketStatus = document.querySelector("#socketStatus");
    const statusBox = document.querySelector("#status");
    const stateBox = document.querySelector("#state");
    const showButton = document.querySelector("#showButton");
    const hideButton = document.querySelector("#hideButton");
    const reconnectButton = document.querySelector("#reconnectButton");

    let socket = null;

    function connect() {
      if (socket) socket.close();

      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(protocol + "//" + location.host + "/ws");
      setSocketStatus("CONNECTING");

      socket.addEventListener("open", () => {
        setSocketStatus("CONNECTED", true);
        setStatus("Controller connected.", true);
      });

      socket.addEventListener("close", () => {
        setSocketStatus("DISCONNECTED");
        setStatus("WebSocket disconnected.", false);
      });

      socket.addEventListener("error", () => {
        setStatus("WebSocket error.", false);
      });

      socket.addEventListener("message", (event) => {
        let payload;
        try {
          payload = JSON.parse(event.data);
        } catch {
          setStatus("Malformed server message.", false);
          return;
        }

        if (payload.type === "popup:update") {
          renderState(payload);
          setStatus("Popup state updated.", true);
          return;
        }

        if (payload.type === "error") {
          setStatus(payload.message || "Server error.", false);
        }
      });
    }

    function sendCommand(payload) {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        setStatus("WebSocket is not connected.", false);
        return;
      }

      socket.send(JSON.stringify(payload));
    }

    function setSocketStatus(text, ok = false) {
      socketStatus.textContent = text;
      socketStatus.className = ok ? "ok" : "error";
    }

    function setStatus(message, ok) {
      statusBox.innerHTML = "<strong>" + (ok ? "OK" : "ERROR") + "</strong> " + escapeHtml(message);
    }

    function renderState(state) {
      stateBox.innerHTML =
        "<strong>VISIBLE</strong> " + String(Boolean(state.popupVisible)).toUpperCase() +
        "<br><strong>MESSAGE</strong> " + escapeHtml(state.popupMessage || "") +
        "<br><strong>UPDATED</strong> " + escapeHtml(state.updatedAt || "");
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    messageInput.addEventListener("input", () => {
      count.textContent = messageInput.value.length + " / 240";
    });

    showButton.addEventListener("click", () => {
      sendCommand({
        type: "popup:show",
        token: tokenInput.value,
        message: messageInput.value
      });
    });

    hideButton.addEventListener("click", () => {
      sendCommand({
        type: "popup:hide",
        token: tokenInput.value
      });
    });

    reconnectButton.addEventListener("click", connect);

    connect();
  </script>
</body>
</html>`;
