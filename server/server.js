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

app.use(
  "/assets",
  express.static(path.join(__dirname, "assets"), {
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

  if (payload.type === "screen:lock") {
    setScreenState(true);
    return;
  }

  if (payload.type === "screen:unlock") {
    setScreenState(false);
    return;
  }

  setVideoState(false);
}

function setPopupState(popupVisible, popupOptions = {}) {
  const updatedAt = new Date().toISOString();

  remoteState = {
    ...remoteState,
    popup: {
      visible: Boolean(popupVisible),
      message: popupVisible ? popupOptions.popupMessage : "",
      title: popupVisible ? popupOptions.title : "",
      variant: popupVisible ? popupOptions.variant : "info",
      durationMs: popupVisible ? popupOptions.durationMs : 0,
      dismissible: popupVisible ? popupOptions.dismissible : true,
      updatedAt,
    },
    updatedAt,
  };

  queueSavePopupState().catch((error) => {
    console.error("ERROR: Unable to persist popup state.", error);
  });
  broadcastStateUpdate();
  broadcastPopupUpdate();
}

function setVideoState(videoVisible, videoId = "") {
  const normalizedVideoId = videoVisible ? videoId : "";
  if (normalizedVideoId && !VALID_VIDEO_IDS.has(normalizedVideoId)) return;
  const updatedAt = new Date().toISOString();

  remoteState = {
    ...remoteState,
    video: {
      visible: Boolean(videoVisible),
      id: normalizedVideoId,
      url: normalizedVideoId ? VIDEOS[normalizedVideoId] : "",
      updatedAt,
    },
    updatedAt,
  };

  queueSavePopupState().catch((error) => {
    console.error("ERROR: Unable to persist popup state.", error);
  });
  broadcastStateUpdate();
  broadcastVideoUpdate();
}

function setScreenState(screenLocked) {
  const locked = Boolean(screenLocked);
  const updatedAt = new Date().toISOString();
  const wasVideoVisible = remoteState.video.visible;

  remoteState = {
    ...remoteState,
    screen: {
      locked,
      updatedAt,
    },
    video: locked
      ? remoteState.video
      : {
          visible: false,
          id: "",
          url: "",
          updatedAt: wasVideoVisible ? updatedAt : remoteState.video.updatedAt,
        },
    updatedAt,
  };

  queueSavePopupState().catch((error) => {
    console.error("ERROR: Unable to persist popup state.", error);
  });
  broadcastStateUpdate();
  broadcastScreenUpdate();
  if (!locked && wasVideoVisible) {
    broadcastVideoUpdate();
  }
}

function getPublicPopupState() {
  return {
    state: getPublicRemoteState(),
    popupVisible: remoteState.popup.visible,
    popupMessage: remoteState.popup.message,
    title: remoteState.popup.title,
    variant: remoteState.popup.variant,
    durationMs: remoteState.popup.durationMs,
    dismissible: remoteState.popup.dismissible,
    videoVisible: remoteState.video.visible,
    videoId: remoteState.video.id,
    videoUrl: remoteState.video.url,
    screenLocked: remoteState.screen.locked,
    updatedAt: remoteState.updatedAt,
  };
}

async function startServer() {
  remoteState = await loadPopupState();

  server.listen(PORT, HOST, () => {
    console.log(`${SERVICE_NAME} listening on ${HOST}:${PORT}`);
  });
}

function createDefaultRemoteState() {
  return {
    popup: {
      visible: false,
      message: "",
      title: "",
      variant: "info",
      durationMs: 0,
      dismissible: true,
      updatedAt: "",
    },
    video: {
      visible: false,
      id: "",
      url: "",
      updatedAt: "",
    },
    screen: {
      locked: false,
      updatedAt: "",
    },
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
      const defaultState = createDefaultRemoteState();
      await savePopupStateNow(defaultState);
      return defaultState;
    }

    await moveCorruptStateFile(error);
    const defaultState = createDefaultRemoteState();
    await savePopupStateNow(defaultState);
    return defaultState;
  }
}

function shouldPersistNormalizedState(original, normalized) {
  return JSON.stringify(original) !== JSON.stringify(normalized);
}

function normalizePopupState(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error("Persisted popup state must be an object.");
  }

  const sourcePopup = candidate.popup && typeof candidate.popup === "object" && !Array.isArray(candidate.popup)
    ? candidate.popup
    : {
        visible: candidate.popupVisible,
        message: candidate.popupMessage,
        title: candidate.title,
        variant: candidate.variant,
        durationMs: candidate.durationMs,
        dismissible: candidate.dismissible,
        updatedAt: candidate.updatedAt,
      };
  const sourceVideo = candidate.video && typeof candidate.video === "object" && !Array.isArray(candidate.video)
    ? candidate.video
    : {
        visible: candidate.videoVisible,
        id: candidate.videoId,
        url: candidate.videoUrl,
        updatedAt: candidate.updatedAt,
      };
  const sourceScreen = candidate.screen && typeof candidate.screen === "object" && !Array.isArray(candidate.screen)
    ? candidate.screen
    : {
        locked: candidate.screenLocked,
        updatedAt: candidate.updatedAt,
      };

  if (typeof sourcePopup.visible !== "boolean") {
    throw new Error("Persisted popup.visible must be a boolean.");
  }

  if (typeof sourcePopup.message !== "string") {
    throw new Error("Persisted popup.message must be a string.");
  }

  if ([...sourcePopup.message].length > MAX_POPUP_MESSAGE_LENGTH) {
    throw new Error(`Persisted popup.message exceeds ${MAX_POPUP_MESSAGE_LENGTH} characters.`);
  }

  const popupMessage = sanitizePopupText(sourcePopup.message);
  const title = typeof sourcePopup.title === "string" ? sanitizePopupText(sourcePopup.title) : "";
  if ([...title].length > MAX_POPUP_TITLE_LENGTH) {
    throw new Error(`Persisted title exceeds ${MAX_POPUP_TITLE_LENGTH} characters.`);
  }

  const variant = typeof sourcePopup.variant === "string" && VALID_VARIANTS.has(sourcePopup.variant) ? sourcePopup.variant : "info";
  const durationMs = Number.isInteger(sourcePopup.durationMs) && sourcePopup.durationMs >= 0 && sourcePopup.durationMs <= MAX_POPUP_DURATION_MS ? sourcePopup.durationMs : 0;
  const dismissible = typeof sourcePopup.dismissible === "boolean" ? sourcePopup.dismissible : true;
  const videoVisible = typeof sourceVideo.visible === "boolean" ? sourceVideo.visible : false;
  const rawVideoId = typeof sourceVideo.id === "string" ? sourceVideo.id : "";

  if (videoVisible && !VALID_VIDEO_IDS.has(rawVideoId)) {
    throw new Error("Persisted video.id must be video1, video2, or video3 when video.visible is true.");
  }

  const videoId = videoVisible ? rawVideoId : "";
  const screenLocked = typeof sourceScreen.locked === "boolean" ? sourceScreen.locked : false;
  const popupUpdatedAt = typeof sourcePopup.updatedAt === "string" ? sourcePopup.updatedAt : "";
  const videoUpdatedAt = typeof sourceVideo.updatedAt === "string" ? sourceVideo.updatedAt : "";
  const screenUpdatedAt = typeof sourceScreen.updatedAt === "string" ? sourceScreen.updatedAt : "";
  const updatedAt = typeof candidate.updatedAt === "string" ? candidate.updatedAt : popupUpdatedAt || videoUpdatedAt || screenUpdatedAt;

  return {
    popup: {
      visible: sourcePopup.visible,
      message: sourcePopup.visible ? popupMessage : "",
      title: sourcePopup.visible ? title : "",
      variant: sourcePopup.visible ? variant : "info",
      durationMs: sourcePopup.visible ? durationMs : 0,
      dismissible: sourcePopup.visible ? dismissible : true,
      updatedAt: popupUpdatedAt,
    },
    video: {
      visible: videoVisible,
      id: videoId,
      url: videoId ? VIDEOS[videoId] : "",
      updatedAt: videoUpdatedAt,
    },
    screen: {
      locked: screenLocked,
      updatedAt: screenUpdatedAt,
    },
    updatedAt,
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
  const snapshot = remoteState;

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
    popupVisible: remoteState.popup.visible,
    popupMessage: remoteState.popup.message,
    title: remoteState.popup.title,
    variant: remoteState.popup.variant,
    durationMs: remoteState.popup.durationMs,
    dismissible: remoteState.popup.dismissible,
    updatedAt: remoteState.popup.updatedAt,
  };
}

function buildVideoUpdate() {
  return {
    type: "video:update",
    videoVisible: remoteState.video.visible,
    videoId: remoteState.video.id,
    videoUrl: remoteState.video.url,
    updatedAt: remoteState.video.updatedAt,
  };
}

function buildScreenUpdate() {
  return {
    type: "screen:update",
    screenLocked: remoteState.screen.locked,
    updatedAt: remoteState.screen.updatedAt,
  };
}

function buildStateUpdate() {
  return {
    type: "state:update",
    state: getPublicRemoteState(),
  };
}

function getPublicRemoteState() {
  return {
    popup: {
      visible: remoteState.popup.visible,
      message: remoteState.popup.message,
      title: remoteState.popup.title,
      variant: remoteState.popup.variant,
      updatedAt: remoteState.popup.updatedAt,
    },
    video: {
      visible: remoteState.video.visible,
      id: remoteState.video.id,
      url: remoteState.video.url,
      updatedAt: remoteState.video.updatedAt,
    },
    screen: {
      locked: remoteState.screen.locked,
      updatedAt: remoteState.screen.updatedAt,
    },
    updatedAt: remoteState.updatedAt,
  };
}

function sendCurrentState(ws) {
  sendJson(ws, buildStateUpdate());
  sendJson(ws, buildPopupUpdate());
  sendJson(ws, buildVideoUpdate());
  sendJson(ws, buildScreenUpdate());
}

function broadcastStateUpdate() {
  const message = buildStateUpdate();

  for (const client of clients) {
    sendJson(client.ws, message);
  }
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

function broadcastScreenUpdate() {
  const message = buildScreenUpdate();

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
  return type === "popup:show" || type === "popup:hide" || type === "video:play" || type === "video:close" || type === "screen:lock" || type === "screen:unlock";
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
      --bg: #000000;
      --panel: #2A1236;
      --line: #B84DFF;
      --cyan: #9D00FF;
      --amber: #D6FF00;
      --orange: #FF8A00;
      --red: #FF5A1F;
      --text: #F3E8FF;
      --muted: #98AA39;
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
        linear-gradient(rgba(157, 0, 255, 0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(157, 0, 255, 0.04) 1px, transparent 1px),
        var(--bg);
      background-size: 24px 24px;
      color: var(--text);
      font-family: Consolas, "Courier New", monospace;
    }

    main {
      width: min(620px, calc(100vw - 32px));
      border: 1px solid var(--line);
      background: rgba(42, 18, 54, 0.58);
      padding: 24px;
      box-shadow: 0 0 0 1px rgba(157, 0, 255, 0.2), 0 18px 80px rgba(0, 0, 0, 0.45);
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
      background: #000000;
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
      box-shadow: 0 0 0 2px rgba(157, 0, 255, 0.16);
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
      background: rgba(157, 0, 255, 0.08);
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
      background: rgba(255, 138, 0, 0.12);
    }

    button.danger {
      border-color: var(--red);
    }

    .status,
    .state {
      border: 1px solid rgba(136, 48, 191, 0.7);
      background: rgba(42, 18, 54, 0.52);
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
