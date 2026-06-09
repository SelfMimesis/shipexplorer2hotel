const crypto = require("crypto");
const fs = require("fs/promises");
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
const MAX_POPUP_TITLE_LENGTH = 80;
const MAX_POPUP_DURATION_MS = 2147483647;
const MAX_WS_PAYLOAD_BYTES = 2048;
const MAX_WS_FRAME_BYTES = 4096;
const STATE_PATH = path.join(__dirname, "state.json");
const VIDEOS = {
  video1: process.env.VIDEO_1_URL || "/videos/video1.mp4",
  video2: process.env.VIDEO_2_URL || "/videos/video2.mp4",
  video3: process.env.VIDEO_3_URL || "/videos/video3.mp4",
};
const VALID_VARIANTS = new Set(["info", "warning", "danger", "success"]);
const VALID_VIDEO_IDS = new Set(Object.keys(VIDEOS));
const DEV_ALLOWED_ORIGINS = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
];
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
const allowedOriginSet = new Set([...allowedOrigins, ...(NODE_ENV === "development" ? DEV_ALLOWED_ORIGINS : [])]);
let remoteState = createDefaultRemoteState();
let saveQueue = Promise.resolve();

const app = express();
app.disable("x-powered-by");

app.use(
  "/videos",
  express.static(path.join(__dirname, "videos"), {
    immutable: true,
    maxAge: "1y",
  })
);

app.use((req, res, next) => {
  if (!isCorsEndpoint(req.path)) {
    return next();
  }

  const origin = req.headers.origin;

  if (origin) {
    if (!isHttpOriginAllowed(origin)) {
      return res.status(403).json({ ok: false, error: "Origin not allowed" });
    }

    res.setHeader("Access-Control-Allow-Origin", normalizeOrigin(origin));
    res.setHeader("Vary", "Origin");
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
  maxPayload: MAX_WS_FRAME_BYTES,
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

  if (!isWebSocketOriginAllowed(req.headers.origin)) {
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

  sendCurrentState(ws);
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

startServer().catch((error) => {
  console.error(`FATAL: Unable to start ${SERVICE_NAME}.`, error);
  process.exit(1);
});

function handleWsMessage(client, data, isBinary) {
  if (isBinary) {
    sendError(client.ws, "BAD_REQUEST", "Mensaje inválido");
    return;
  }

  const raw = data.toString("utf8");
  if (Buffer.byteLength(raw, "utf8") > MAX_WS_PAYLOAD_BYTES) {
    sendError(client.ws, "BAD_REQUEST", "Mensaje inválido");
    return;
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    sendError(client.ws, "BAD_REQUEST", "Mensaje inválido");
    return;
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    sendError(client.ws, "BAD_REQUEST", "Mensaje inválido");
    return;
  }

  if (payload.type === "ping") {
    sendJson(client.ws, { type: "pong", updatedAt: new Date().toISOString() });
    return;
  }

  if (payload.type === "state:get") {
    sendCurrentState(client.ws);
    return;
  }

  if (!isAdminCommandType(payload.type)) {
    sendError(client.ws, "BAD_REQUEST", "Mensaje inválido");
    return;
  }

  if (!checkCommandRateLimit(client.ip)) {
    sendError(client.ws, "RATE_LIMIT", "Demasiados comandos");
    return;
  }

  if (!isValidAdminToken(payload.token)) {
    sendError(client.ws, "UNAUTHORIZED", "Token inválido");
    return;
  }

  if (payload.type === "popup:show") {
    const parsedPopup = parsePopupShowPayload(payload);
    if (!parsedPopup.ok) {
      sendError(client.ws, "BAD_REQUEST", "Mensaje inválido");
      return;
    }

    setPopupState(true, parsedPopup.value);
    return;
  }

  if (payload.type === "popup:hide") {
    setPopupState(false);
    return;
  }

  if (payload.type === "video:play") {
    const parsedVideo = parseVideoPlayPayload(payload);
    if (!parsedVideo.ok) {
      sendError(client.ws, "BAD_REQUEST", "Mensaje inválido");
      return;
    }

    setVideoState(true, parsedVideo.videoId);
    return;
  }

  setVideoState(false);
}

function setPopupState(popupVisible, popupOptions = {}) {
  popupState = {
    ...popupState,
    popupVisible: Boolean(popupVisible),
    popupMessage: popupVisible ? popupOptions.popupMessage : "",
    title: popupVisible ? popupOptions.title : "",
    variant: popupVisible ? popupOptions.variant : "info",
    durationMs: popupVisible ? popupOptions.durationMs : 0,
    dismissible: popupVisible ? popupOptions.dismissible : true,
    updatedAt: new Date().toISOString(),
  };

  queueSavePopupState().catch((error) => {
    console.error("ERROR: Unable to persist popup state.", error);
  });
  broadcastPopupUpdate();
}

function setVideoState(videoVisible, videoId = "") {
  const normalizedVideoId = videoVisible ? videoId : "";
  if (normalizedVideoId && !VALID_VIDEO_IDS.has(normalizedVideoId)) return;

  popupState = {
    ...popupState,
    videoVisible: Boolean(videoVisible),
    videoId: normalizedVideoId,
    videoUrl: normalizedVideoId ? VIDEOS[normalizedVideoId] : "",
    updatedAt: new Date().toISOString(),
  };

  queueSavePopupState().catch((error) => {
    console.error("ERROR: Unable to persist popup state.", error);
  });
  broadcastVideoUpdate();
}

function getPublicPopupState() {
  return {
    popupVisible: popupState.popupVisible,
    popupMessage: popupState.popupMessage,
    title: popupState.title,
    variant: popupState.variant,
    durationMs: popupState.durationMs,
    dismissible: popupState.dismissible,
    videoVisible: popupState.videoVisible,
    videoId: popupState.videoId,
    videoUrl: popupState.videoUrl,
    updatedAt: popupState.updatedAt,
  };
}

async function startServer() {
  popupState = await loadPopupState();

  server.listen(PORT, HOST, () => {
    console.log(`${SERVICE_NAME} listening on ${HOST}:${PORT}`);
  });
}

function createDefaultPopupState() {
  return {
    popupVisible: false,
    popupMessage: "",
    title: "",
    variant: "info",
    durationMs: 0,
    dismissible: true,
    videoVisible: false,
    videoId: "",
    videoUrl: "",
    updatedAt: "",
  };
}

async function loadPopupState() {
  try {
    const raw = await fs.readFile(STATE_PATH, "utf8");
    const loaded = JSON.parse(raw.replace(/^\uFEFF/, ""));
    const normalizedState = normalizePopupState(loaded);

    if (shouldPersistNormalizedState(loaded, normalizedState)) {
      await savePopupStateNow(normalizedState);
    }

    return normalizedState;
  } catch (error) {
    if (error.code === "ENOENT") {
      const defaultState = createDefaultPopupState();
      await savePopupStateNow(defaultState);
      return defaultState;
    }

    await moveCorruptStateFile(error);
    const defaultState = createDefaultPopupState();
    await savePopupStateNow(defaultState);
    return defaultState;
  }
}

function shouldPersistNormalizedState(original, normalized) {
  const stateKeys = ["popupVisible", "popupMessage", "title", "variant", "durationMs", "dismissible", "videoVisible", "videoId", "videoUrl", "updatedAt"];

  return stateKeys.some((key) => original[key] !== normalized[key]);
}

function normalizePopupState(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error("Persisted popup state must be an object.");
  }

  if (typeof candidate.popupVisible !== "boolean") {
    throw new Error("Persisted popupVisible must be a boolean.");
  }

  if (typeof candidate.popupMessage !== "string") {
    throw new Error("Persisted popupMessage must be a string.");
  }

  if ([...candidate.popupMessage].length > MAX_POPUP_MESSAGE_LENGTH) {
    throw new Error(`Persisted popupMessage exceeds ${MAX_POPUP_MESSAGE_LENGTH} characters.`);
  }

  const popupMessage = sanitizePopupText(candidate.popupMessage);
  const title = typeof candidate.title === "string" ? sanitizePopupText(candidate.title) : "";
  if ([...title].length > MAX_POPUP_TITLE_LENGTH) {
    throw new Error(`Persisted title exceeds ${MAX_POPUP_TITLE_LENGTH} characters.`);
  }

  const variant = typeof candidate.variant === "string" && VALID_VARIANTS.has(candidate.variant) ? candidate.variant : "info";
  const durationMs = Number.isInteger(candidate.durationMs) && candidate.durationMs >= 0 && candidate.durationMs <= MAX_POPUP_DURATION_MS ? candidate.durationMs : 0;
  const dismissible = typeof candidate.dismissible === "boolean" ? candidate.dismissible : true;
  const videoVisible = typeof candidate.videoVisible === "boolean" ? candidate.videoVisible : false;
  const rawVideoId = typeof candidate.videoId === "string" ? candidate.videoId : "";

  if (videoVisible && !VALID_VIDEO_IDS.has(rawVideoId)) {
    throw new Error("Persisted videoId must be video1, video2, or video3 when videoVisible is true.");
  }

  const videoId = videoVisible ? rawVideoId : "";

  if (typeof candidate.updatedAt !== "string") {
    throw new Error("Persisted updatedAt must be a string.");
  }

  return {
    popupVisible: candidate.popupVisible,
    popupMessage: candidate.popupVisible ? popupMessage : "",
    title: candidate.popupVisible ? title : "",
    variant: candidate.popupVisible ? variant : "info",
    durationMs: candidate.popupVisible ? durationMs : 0,
    dismissible: candidate.popupVisible ? dismissible : true,
    videoVisible,
    videoId,
    videoUrl: videoId ? VIDEOS[videoId] : "",
    updatedAt: candidate.updatedAt,
  };
}

async function moveCorruptStateFile(error) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const corruptPath = path.join(__dirname, `state.corrupt.${timestamp}.json`);

  try {
    await fs.rename(STATE_PATH, corruptPath);
    console.warn(`WARNING: Corrupt popup state moved to ${path.basename(corruptPath)}. ${error.message}`);
  } catch (renameError) {
    if (renameError.code !== "ENOENT") {
      console.warn("WARNING: Unable to move corrupt popup state.", renameError);
    }
  }
}

function queueSavePopupState() {
  const snapshot = getPublicPopupState();

  saveQueue = saveQueue
    .catch(() => {})
    .then(() => savePopupStateNow(snapshot));

  return saveQueue;
}

async function savePopupStateNow(stateToSave) {
  const normalizedState = normalizePopupState(stateToSave);
  const tempPath = `${STATE_PATH}.${process.pid}.${Date.now()}.tmp`;

  await fs.mkdir(path.dirname(STATE_PATH), { recursive: true });
  await fs.writeFile(tempPath, `${JSON.stringify(normalizedState, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, STATE_PATH);
}

function buildPopupUpdate() {
  return {
    type: "popup:update",
    ...getPublicPopupState(),
  };
}

function buildVideoUpdate() {
  return {
    type: "video:update",
    videoVisible: popupState.videoVisible,
    videoId: popupState.videoId,
    videoUrl: popupState.videoUrl,
    updatedAt: popupState.updatedAt,
  };
}

function broadcastPopupUpdate() {
  const message = buildPopupUpdate();

  for (const client of clients) {
    sendJson(client.ws, message);
  }
}

function broadcastVideoUpdate() {
  const message = buildVideoUpdate();

  for (const client of clients) {
    sendJson(client.ws, message);
  }
}

function sendJson(ws, payload) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

function sendError(ws, code, message) {
  sendJson(ws, { type: "error", code, message });
}

function isAdminCommandType(type) {
  return type === "popup:show" || type === "popup:hide" || type === "video:play" || type === "video:close";
}

function parsePopupShowPayload(payload) {
  if (typeof payload.message !== "string") {
    return { ok: false };
  }

  if ([...payload.message].length > MAX_POPUP_MESSAGE_LENGTH) {
    return { ok: false };
  }

  const popupMessage = sanitizePopupText(payload.message);
  if (!popupMessage) {
    return { ok: false };
  }

  if (payload.title !== undefined && payload.title !== null && typeof payload.title !== "string") {
    return { ok: false };
  }

  const rawTitle = typeof payload.title === "string" ? payload.title : "";
  if ([...rawTitle].length > MAX_POPUP_TITLE_LENGTH) {
    return { ok: false };
  }

  const title = sanitizePopupText(rawTitle);
  const variant = payload.variant === undefined || payload.variant === null ? "info" : payload.variant;
  if (typeof variant !== "string" || !VALID_VARIANTS.has(variant)) {
    return { ok: false };
  }

  const durationMs = payload.durationMs === undefined || payload.durationMs === null ? 0 : payload.durationMs;
  if (!Number.isInteger(durationMs) || durationMs < 0 || durationMs > MAX_POPUP_DURATION_MS) {
    return { ok: false };
  }

  const dismissible = payload.dismissible === undefined || payload.dismissible === null ? true : payload.dismissible;
  if (typeof dismissible !== "boolean") {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      popupMessage,
      title,
      variant,
      durationMs,
      dismissible,
    },
  };
}

function parseVideoPlayPayload(payload) {
  if (Object.prototype.hasOwnProperty.call(payload, "videoUrl")) {
    return { ok: false };
  }

  if (typeof payload.videoId !== "string" || !VALID_VIDEO_IDS.has(payload.videoId)) {
    return { ok: false };
  }

  return {
    ok: true,
    videoId: payload.videoId,
  };
}

function sanitizePopupText(message) {
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

function isCorsEndpoint(requestPath) {
  return requestPath === "/health" || requestPath === "/state";
}

function isHttpOriginAllowed(origin) {
  const normalizedOrigin = normalizeOrigin(origin);
  return Boolean(normalizedOrigin && allowedOriginSet.has(normalizedOrigin));
}

function isWebSocketOriginAllowed(origin) {
  if (!origin) return NODE_ENV === "development";
  const normalizedOrigin = normalizeOrigin(origin);
  return Boolean(normalizedOrigin && allowedOriginSet.has(normalizedOrigin));
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
