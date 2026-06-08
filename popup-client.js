(function () {
  "use strict";

  var DEFAULT_OPTIONS = {
    socketUrl: "",
    autoReconnect: true,
    showCloseButton: true,
    zIndex: 99999,
    theme: "ship",
  };

  var VALID_THEMES = {
    dark: true,
    light: true,
    ship: true,
  };

  var state = {
    initialized: false,
    connectionState: "idle",
    socketUrl: "",
    popupVisible: false,
    popupMessage: "",
    updatedAt: "",
    localHidden: false,
    reconnectAttempt: 0,
    lastError: "",
  };

  var options = copyOptions(DEFAULT_OPTIONS);
  var socket = null;
  var reconnectTimer = 0;
  var manuallyClosed = false;
  var currentServerKey = "";
  var overlay = null;
  var messageNode = null;
  var closeButton = null;
  var styleInjected = false;
  var lastConnectionWarningAt = 0;

  function init(userOptions) {
    options = mergeOptions(DEFAULT_OPTIONS, userOptions || {});
    options.autoReconnect = options.autoReconnect !== false;
    options.showCloseButton = options.showCloseButton !== false;
    options.zIndex = Number.isFinite(Number(options.zIndex)) ? Number(options.zIndex) : DEFAULT_OPTIONS.zIndex;
    options.theme = VALID_THEMES[options.theme] ? options.theme : DEFAULT_OPTIONS.theme;
    options.socketUrl = options.socketUrl || getDefaultSocketUrl();

    state.initialized = true;
    state.socketUrl = options.socketUrl;
    state.lastError = "";

    whenReady(function () {
      injectStyles();
      createPopupDom();
      applyTheme();
      connect();
    });

    return api;
  }

  function connect() {
    clearReconnectTimer();

    if (!options.socketUrl) {
      setConnectionState("error", "Missing socketUrl.");
      scheduleReconnect();
      return;
    }

    closeSocket();
    manuallyClosed = false;
    setConnectionState("connecting");

    try {
      socket = new WebSocket(options.socketUrl);
    } catch (error) {
      setConnectionState("error", error.message || "WebSocket connection failed.");
      warnConnectionIssue(state.lastError);
      scheduleReconnect();
      return;
    }

    socket.addEventListener("open", handleOpen);
    socket.addEventListener("message", handleMessage);
    socket.addEventListener("close", handleClose);
    socket.addEventListener("error", handleError);
  }

  function handleOpen(event) {
    if (event && event.target !== socket) return;

    state.reconnectAttempt = 0;
    setConnectionState("connected");
    sendJson({ type: "state:get" });
  }

  function handleMessage(event) {
    if (event && event.target !== socket) return;

    var payload = parseJson(event.data);
    if (!payload || typeof payload !== "object") return;

    if (payload.type === "popup:update") {
      applyPopupUpdate(payload);
    }
  }

  function handleClose(event) {
    if (event && event.target !== socket) return;

    socket = null;
    if (manuallyClosed) return;

    setConnectionState("disconnected");
    scheduleReconnect();
  }

  function handleError(event) {
    if (event && event.target !== socket) return;

    setConnectionState("error", "WebSocket error.");
    warnConnectionIssue("WebSocket connection failed. Retrying in background.");
  }

  function scheduleReconnect() {
    if (!options.autoReconnect || manuallyClosed) return;

    clearReconnectTimer();
    state.reconnectAttempt += 1;

    var base = Math.min(30000, 800 * Math.pow(1.7, state.reconnectAttempt - 1));
    var jitter = base * 0.25 * Math.random();
    var delay = Math.round(base + jitter);

    reconnectTimer = window.setTimeout(function () {
      connect();
    }, delay);
  }

  function applyPopupUpdate(payload) {
    var visible = Boolean(payload.popupVisible);
    var message = typeof payload.popupMessage === "string" ? payload.popupMessage : "";
    var updatedAt = typeof payload.updatedAt === "string" ? payload.updatedAt : "";
    var nextKey = [visible ? "1" : "0", updatedAt, message].join("|");
    var isNewServerPopup = nextKey !== currentServerKey;

    if (isNewServerPopup) {
      state.localHidden = false;
      currentServerKey = nextKey;
    }

    state.popupVisible = visible;
    state.popupMessage = message;
    state.updatedAt = updatedAt;

    if (!visible) {
      state.localHidden = false;
      hidePopupDom();
      return;
    }

    if (!state.localHidden) {
      showPopupDom(message);
    }
  }

  function showLocal(message) {
    state.localHidden = false;
    state.popupVisible = true;
    state.popupMessage = typeof message === "string" ? message : String(message || "");

    whenReady(function () {
      injectStyles();
      createPopupDom();
      applyTheme();
      showPopupDom(state.popupMessage);
    });
  }

  function hideLocal() {
    state.localHidden = true;
    hidePopupDom();
  }

  function getStatus() {
    return {
      initialized: state.initialized,
      connectionState: state.connectionState,
      socketUrl: state.socketUrl,
      popupVisible: state.popupVisible,
      popupMessage: state.popupMessage,
      updatedAt: state.updatedAt,
      localHidden: state.localHidden,
      reconnectAttempt: state.reconnectAttempt,
      lastError: state.lastError,
    };
  }

  function sendJson(payload) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;

    try {
      socket.send(JSON.stringify(payload));
      return true;
    } catch (error) {
      setConnectionState("error", error.message || "Unable to send WebSocket message.");
      return false;
    }
  }

  function closeSocket() {
    if (!socket) return;

    try {
      manuallyClosed = true;
      socket.close();
    } catch {
      // Ignore close errors. A broken backend should never break the page.
    }
  }

  function clearReconnectTimer() {
    if (!reconnectTimer) return;
    window.clearTimeout(reconnectTimer);
    reconnectTimer = 0;
  }

  function createPopupDom() {
    if (overlay || !document.body) return;

    overlay = document.createElement("div");
    overlay.className = "shipexplorer-popup-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-live", "polite");
    overlay.hidden = true;
    overlay.style.zIndex = String(options.zIndex);

    var panel = document.createElement("div");
    panel.className = "shipexplorer-popup-panel";

    var rail = document.createElement("div");
    rail.className = "shipexplorer-popup-rail";

    var label = document.createElement("div");
    label.className = "shipexplorer-popup-label";
    label.textContent = "SHIP EXPLORER";

    messageNode = document.createElement("div");
    messageNode.className = "shipexplorer-popup-message";

    closeButton = document.createElement("button");
    closeButton.className = "shipexplorer-popup-close";
    closeButton.type = "button";
    closeButton.textContent = "CERRAR";
    closeButton.addEventListener("click", hideLocal);

    panel.appendChild(rail);
    panel.appendChild(label);
    panel.appendChild(messageNode);
    panel.appendChild(closeButton);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    overlay.addEventListener("click", function (event) {
      if (event.target === overlay && options.showCloseButton) {
        hideLocal();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && overlay && !overlay.hidden && options.showCloseButton) {
        hideLocal();
      }
    });
  }

  function showPopupDom(message) {
    if (!overlay) return;

    messageNode.textContent = message || "";
    closeButton.hidden = !options.showCloseButton;
    overlay.style.zIndex = String(options.zIndex);
    overlay.hidden = false;
    overlay.classList.add("shipexplorer-popup-visible");
    applyTheme();
  }

  function hidePopupDom() {
    if (!overlay) return;

    overlay.classList.remove("shipexplorer-popup-visible");
    overlay.hidden = true;
  }

  function applyTheme() {
    if (!overlay) return;

    overlay.classList.remove("shipexplorer-popup-theme-dark", "shipexplorer-popup-theme-light", "shipexplorer-popup-theme-ship");
    overlay.classList.add("shipexplorer-popup-theme-" + options.theme);
  }

  function injectStyles() {
    if (styleInjected || document.getElementById("shipexplorer-popup-styles")) return;

    var style = document.createElement("style");
    style.id = "shipexplorer-popup-styles";
    style.textContent = [
      ".shipexplorer-popup-overlay{position:fixed;inset:0;display:grid;place-items:center;padding:24px;background:rgba(5,8,9,.68);font-family:Consolas,'Courier New',monospace;box-sizing:border-box;}",
      ".shipexplorer-popup-overlay[hidden]{display:none!important;}",
      ".shipexplorer-popup-overlay *{box-sizing:border-box;}",
      ".shipexplorer-popup-panel{position:relative;width:min(560px,calc(100vw - 48px));min-height:170px;padding:30px 30px 24px;border:1px solid var(--shipexplorer-popup-line);background:var(--shipexplorer-popup-panel);color:var(--shipexplorer-popup-text);box-shadow:0 0 0 1px var(--shipexplorer-popup-halo),0 24px 90px rgba(0,0,0,.5);overflow:hidden;}",
      ".shipexplorer-popup-panel:before{content:'';position:absolute;inset:10px;border:1px solid var(--shipexplorer-popup-inner);pointer-events:none;}",
      ".shipexplorer-popup-rail{position:absolute;left:0;top:0;bottom:0;width:5px;background:var(--shipexplorer-popup-accent);box-shadow:0 0 18px var(--shipexplorer-popup-accent);}",
      ".shipexplorer-popup-label{position:relative;margin:0 0 18px;color:var(--shipexplorer-popup-muted);font-size:12px;letter-spacing:.16em;text-transform:uppercase;}",
      ".shipexplorer-popup-message{position:relative;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--shipexplorer-popup-text);font-size:clamp(20px,3vw,32px);line-height:1.28;letter-spacing:0;text-align:center;padding:12px 8px 20px;}",
      ".shipexplorer-popup-close{position:relative;display:block;margin:8px auto 0;min-height:38px;border:1px solid var(--shipexplorer-popup-line);background:transparent;color:var(--shipexplorer-popup-text);font:inherit;font-size:13px;letter-spacing:.1em;text-transform:uppercase;padding:9px 15px;cursor:pointer;}",
      ".shipexplorer-popup-close:hover{border-color:var(--shipexplorer-popup-accent);color:var(--shipexplorer-popup-accent);}",
      ".shipexplorer-popup-visible .shipexplorer-popup-panel{animation:shipexplorer-popup-in .18s ease-out both;}",
      "@keyframes shipexplorer-popup-in{from{opacity:0;transform:translateY(12px) scale(.985);}to{opacity:1;transform:translateY(0) scale(1);}}",
      ".shipexplorer-popup-theme-ship{--shipexplorer-popup-panel:rgba(17,19,20,.94);--shipexplorer-popup-line:#44e0c0;--shipexplorer-popup-inner:rgba(68,224,192,.38);--shipexplorer-popup-halo:rgba(68,224,192,.2);--shipexplorer-popup-text:#d7e3df;--shipexplorer-popup-muted:#7f9695;--shipexplorer-popup-accent:#ff7a16;}",
      ".shipexplorer-popup-theme-dark{--shipexplorer-popup-panel:rgba(18,20,22,.96);--shipexplorer-popup-line:#8fa4a0;--shipexplorer-popup-inner:rgba(143,164,160,.32);--shipexplorer-popup-halo:rgba(143,164,160,.18);--shipexplorer-popup-text:#f4f7f6;--shipexplorer-popup-muted:#a2afad;--shipexplorer-popup-accent:#44e0c0;}",
      ".shipexplorer-popup-theme-light{background:rgba(246,248,247,.62);--shipexplorer-popup-panel:rgba(255,255,255,.97);--shipexplorer-popup-line:#1f7d72;--shipexplorer-popup-inner:rgba(31,125,114,.24);--shipexplorer-popup-halo:rgba(31,125,114,.12);--shipexplorer-popup-text:#111314;--shipexplorer-popup-muted:#5c6c6a;--shipexplorer-popup-accent:#ff7a16;}",
      "@media (prefers-reduced-motion:reduce){.shipexplorer-popup-visible .shipexplorer-popup-panel{animation:none;}}",
    ].join("");

    document.head.appendChild(style);
    styleInjected = true;
  }

  function setConnectionState(nextState, errorMessage) {
    state.connectionState = nextState;
    state.lastError = errorMessage || "";
  }

  function warnConnectionIssue(message) {
    var now = Date.now();
    if (now - lastConnectionWarningAt < 30000) return;
    lastConnectionWarningAt = now;

    if (window.console && typeof window.console.warn === "function") {
      window.console.warn("ShipExplorerPopupClient:", message || "Popup backend unavailable.");
    }
  }

  function parseJson(raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function getDefaultSocketUrl() {
    if (!window.location || !window.location.host) return "";
    var protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return protocol + "//" + window.location.host + "/ws";
  }

  function whenReady(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
      return;
    }

    callback();
  }

  function copyOptions(source) {
    var output = {};
    Object.keys(source).forEach(function (key) {
      output[key] = source[key];
    });
    return output;
  }

  function mergeOptions(base, override) {
    var output = copyOptions(base);
    Object.keys(override).forEach(function (key) {
      output[key] = override[key];
    });
    return output;
  }

  var api = {
    init: init,
    showLocal: showLocal,
    hideLocal: hideLocal,
    getStatus: getStatus,
  };

  window.ShipExplorerPopupClient = api;
})();
