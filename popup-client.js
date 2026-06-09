(function () {
  "use strict";

  var DEFAULT_OPTIONS = {
    socketUrl: "",
    autoReconnect: true,
    showCloseButton: true,
    zIndex: 99999,
    theme: "ship",
    videoZIndex: 999999,
    videoMuted: true,
    videoLoop: false,
    videoFadeMs: 350,
    videoCloseHoldMs: 150,
    videoLoadTimeoutMs: 8000,
    videoBackground: "#6EA285",
    allowSoundAfterTap: false,
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
    title: "",
    variant: "info",
    durationMs: 0,
    dismissible: true,
    videoVisible: false,
    videoId: "",
    videoUrl: "",
    videoStatus: "hidden",
    videoMuted: true,
    videoError: "",
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
  var currentVideoKey = "";
  var videoRequestId = 0;
  var autoHideTimer = 0;
  var videoHideTimer = 0;
  var videoTransitionTimer = 0;
  var overlay = null;
  var videoOverlay = null;
  var videoElement = null;
  var videoStatusNode = null;
  var videoCloseButton = null;
  var titleNode = null;
  var messageNode = null;
  var closeButton = null;
  var styleInjected = false;
  var lastConnectionWarningAt = 0;
  var soundUnlocked = false;
  var soundUnlockAttached = false;

  function init(userOptions) {
    options = mergeOptions(DEFAULT_OPTIONS, userOptions || {});
    options.autoReconnect = options.autoReconnect !== false;
    options.showCloseButton = options.showCloseButton !== false;
    options.zIndex = Number.isFinite(Number(options.zIndex)) ? Number(options.zIndex) : DEFAULT_OPTIONS.zIndex;
    options.theme = VALID_THEMES[options.theme] ? options.theme : DEFAULT_OPTIONS.theme;
    options.videoZIndex = Number.isFinite(Number(options.videoZIndex)) ? Number(options.videoZIndex) : Math.max(DEFAULT_OPTIONS.videoZIndex, options.zIndex + 1);
    options.videoMuted = options.videoMuted !== false;
    options.videoLoop = options.videoLoop === true;
    options.videoFadeMs = normalizeVideoDuration(options.videoFadeMs, DEFAULT_OPTIONS.videoFadeMs);
    options.videoCloseHoldMs = normalizeVideoDuration(options.videoCloseHoldMs, DEFAULT_OPTIONS.videoCloseHoldMs);
    options.videoLoadTimeoutMs = normalizeVideoDuration(options.videoLoadTimeoutMs, DEFAULT_OPTIONS.videoLoadTimeoutMs);
    options.videoBackground = typeof options.videoBackground === "string" && options.videoBackground ? options.videoBackground : DEFAULT_OPTIONS.videoBackground;
    options.allowSoundAfterTap = options.allowSoundAfterTap === true;
    options.socketUrl = options.socketUrl || getDefaultSocketUrl();

    state.initialized = true;
    state.socketUrl = options.socketUrl;
    state.lastError = "";

    whenReady(function () {
      injectStyles();
      createPopupDom();
      createVideoDom();
      setupVideoSoundUnlock();
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

    if (payload.type === "state:update") {
      applyStateUpdate(payload.state);
      return;
    }

    if (payload.type === "popup:update") {
      applyPopupUpdate(payload);
      if ("videoVisible" in payload || "videoId" in payload || "videoUrl" in payload) {
        applyVideoUpdate(payload);
      }
      return;
    }

    if (payload.type === "video:update") {
      applyVideoUpdate(payload);
    }
  }

  function applyStateUpdate(nextState) {
    if (!nextState || typeof nextState !== "object") return;

    var popup = nextState.popup && typeof nextState.popup === "object" ? nextState.popup : null;
    var video = nextState.video && typeof nextState.video === "object" ? nextState.video : null;

    if (popup) {
      applyPopupUpdate({
        type: "popup:update",
        popupVisible: Boolean(popup.visible),
        popupMessage: typeof popup.message === "string" ? popup.message : "",
        title: typeof popup.title === "string" ? popup.title : "",
        variant: typeof popup.variant === "string" ? popup.variant : "info",
        durationMs: Number.isInteger(popup.durationMs) ? popup.durationMs : state.durationMs,
        dismissible: typeof popup.dismissible === "boolean" ? popup.dismissible : state.dismissible,
        updatedAt: typeof popup.updatedAt === "string" ? popup.updatedAt : "",
      });
    }

    if (video) {
      applyVideoUpdate({
        type: "video:update",
        videoVisible: Boolean(video.visible),
        videoId: typeof video.id === "string" ? video.id : "",
        videoUrl: typeof video.url === "string" ? video.url : "",
        updatedAt: typeof video.updatedAt === "string" ? video.updatedAt : "",
      });
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
    var title = typeof payload.title === "string" ? payload.title : "";
    var variant = normalizeVariant(payload.variant);
    var durationMs = normalizeDuration(payload.durationMs);
    var dismissible = payload.dismissible !== false;
    var updatedAt = typeof payload.updatedAt === "string" ? payload.updatedAt : "";
    var nextKey = [visible ? "1" : "0", updatedAt, message, title, variant, durationMs, dismissible ? "1" : "0"].join("|");
    var isNewServerPopup = nextKey !== currentServerKey;

    if (isNewServerPopup) {
      state.localHidden = false;
      currentServerKey = nextKey;
    }

    state.popupVisible = visible;
    state.popupMessage = message;
    state.title = title;
    state.variant = variant;
    state.durationMs = durationMs;
    state.dismissible = dismissible;
    state.updatedAt = updatedAt;

    if (!visible) {
      state.localHidden = false;
      clearAutoHideTimer();
      hidePopupDom();
      return;
    }

    if (!state.localHidden) {
      showPopupDom({
        message: message,
        title: title,
        variant: variant,
        durationMs: durationMs,
        dismissible: dismissible,
      });
    }
  }

  function applyVideoUpdate(payload) {
    var visible = Boolean(payload.videoVisible);
    var videoId = typeof payload.videoId === "string" ? payload.videoId : "";
    var videoUrl = typeof payload.videoUrl === "string" ? payload.videoUrl : "";
    var updatedAt = typeof payload.updatedAt === "string" ? payload.updatedAt : "";
    var nextKey = [visible ? "1" : "0", updatedAt, videoId, videoUrl].join("|");

    if (nextKey === currentVideoKey) return;
    currentVideoKey = nextKey;

    state.updatedAt = updatedAt || state.updatedAt;

    if (!visible || !videoUrl) {
      closeRemoteVideo();
      return;
    }

    playRemoteVideo(videoId, videoUrl);
  }

  function showLocal(message) {
    state.localHidden = false;
    state.popupVisible = true;
    state.popupMessage = typeof message === "string" ? message : String(message || "");
    state.title = "";
    state.variant = "info";
    state.durationMs = 0;
    state.dismissible = true;

    whenReady(function () {
      injectStyles();
      createPopupDom();
      applyTheme();
      showPopupDom({
        message: state.popupMessage,
        title: state.title,
        variant: state.variant,
        durationMs: state.durationMs,
        dismissible: state.dismissible,
      });
    });
  }

  function hideLocal() {
    state.localHidden = true;
    clearAutoHideTimer();
    hidePopupDom();
  }

  function playRemoteVideo(videoId, videoUrl) {
    var normalizedVideoId = typeof videoId === "string" ? videoId : "";
    var normalizedVideoUrl = typeof videoUrl === "string" ? videoUrl : "";
    var hasVideoUrl = Boolean(normalizedVideoUrl);

    whenReady(function () {
      injectStyles();
      createVideoDom();
      setupVideoSoundUnlock();
      if (!hasVideoUrl) {
        showVideoError(normalizedVideoId, normalizedVideoUrl);
        return;
      }

      transitionToRemoteVideo(normalizedVideoId, normalizedVideoUrl);
    });

    return hasVideoUrl;
  }

  function closeRemoteVideo() {
    whenReady(function () {
      injectStyles();
      createVideoDom();
      closeVideoDom();
    });
  }

  function getVideoStatus() {
    return {
      videoVisible: state.videoVisible,
      videoId: state.videoId,
      videoUrl: state.videoUrl,
      videoStatus: state.videoStatus,
      videoMuted: state.videoMuted,
      videoError: state.videoError,
    };
  }

  function getStatus() {
    return {
      initialized: state.initialized,
      connectionState: state.connectionState,
      socketUrl: state.socketUrl,
      popupVisible: state.popupVisible,
      popupMessage: state.popupMessage,
      title: state.title,
      variant: state.variant,
      durationMs: state.durationMs,
      dismissible: state.dismissible,
      videoVisible: state.videoVisible,
      videoId: state.videoId,
      videoUrl: state.videoUrl,
      videoStatus: state.videoStatus,
      videoMuted: state.videoMuted,
      videoError: state.videoError,
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

    titleNode = document.createElement("div");
    titleNode.className = "shipexplorer-popup-title";

    messageNode = document.createElement("div");
    messageNode.className = "shipexplorer-popup-message";

    closeButton = document.createElement("button");
    closeButton.className = "shipexplorer-popup-close";
    closeButton.type = "button";
    closeButton.textContent = "CERRAR";
    closeButton.addEventListener("click", hideLocal);

    panel.appendChild(rail);
    panel.appendChild(label);
    panel.appendChild(titleNode);
    panel.appendChild(messageNode);
    panel.appendChild(closeButton);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    overlay.addEventListener("click", function (event) {
      if (event.target === overlay && options.showCloseButton && state.dismissible) {
        hideLocal();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && overlay && !overlay.hidden && options.showCloseButton && state.dismissible) {
        hideLocal();
      }
    });
  }

  function createVideoDom() {
    if (videoOverlay || !document.body) return;

    videoOverlay = document.createElement("div");
    videoOverlay.className = "shipexplorer-video-overlay";
    videoOverlay.setAttribute("aria-hidden", "true");
    videoOverlay.hidden = true;
    videoOverlay.style.zIndex = String(options.videoZIndex);
    videoOverlay.style.background = options.videoBackground;
    videoOverlay.style.setProperty("--shipexplorer-video-fade-ms", options.videoFadeMs + "ms");

    videoElement = createVideoElement();
    videoStatusNode = document.createElement("div");
    videoStatusNode.className = "shipexplorer-video-status";
    videoStatusNode.hidden = true;
    videoStatusNode.textContent = "VIDEO ERROR";

    videoCloseButton = document.createElement("button");
    videoCloseButton.className = "shipexplorer-video-close";
    videoCloseButton.type = "button";
    videoCloseButton.textContent = "CERRAR";
    videoCloseButton.hidden = true;
    videoCloseButton.addEventListener("click", closeRemoteVideo);

    videoOverlay.appendChild(videoElement);
    videoOverlay.appendChild(videoStatusNode);
    videoOverlay.appendChild(videoCloseButton);
    document.body.appendChild(videoOverlay);
  }

  function createVideoElement() {
    var node = document.createElement("video");
    node.className = "shipexplorer-video-element";
    node.autoplay = true;
    node.preload = "auto";
    node.playsInline = true;
    node.controls = false;
    node.muted = true;
    node.defaultMuted = true;
    node.loop = options.videoLoop;
    node.setAttribute("autoplay", "");
    node.setAttribute("muted", "");
    node.setAttribute("playsinline", "");
    node.addEventListener("ended", function () {
      if (!options.videoLoop) {
        node.pause();
      }
    });
    return node;
  }

  function showPopupDom(message) {
    if (!overlay) return;

    var popup = typeof message === "object" && message ? message : { message: message };
    var effectiveDismissible = options.showCloseButton && popup.dismissible !== false;

    clearAutoHideTimer();
    titleNode.textContent = popup.title || "";
    titleNode.hidden = !popup.title;
    messageNode.textContent = popup.message || "";
    closeButton.hidden = !effectiveDismissible;
    overlay.style.zIndex = String(options.zIndex);
    overlay.hidden = false;
    overlay.classList.add("shipexplorer-popup-visible");
    applyTheme();
    applyVariant(normalizeVariant(popup.variant));

    var durationMs = normalizeDuration(popup.durationMs);
    if (durationMs > 0) {
      autoHideTimer = window.setTimeout(function () {
        hideLocal();
      }, durationMs);
    }
  }

  function hidePopupDom() {
    if (!overlay) return;

    overlay.classList.remove("shipexplorer-popup-visible");
    overlay.hidden = true;
  }

  function transitionToRemoteVideo(videoId, videoUrl) {
    if (!videoOverlay || !videoElement) return;

    var requestId = ++videoRequestId;
    var resolvedVideoUrl = resolveVideoUrl(videoUrl);
    var hasVisibleVideo = videoElement.classList.contains("shipexplorer-video-element-visible");

    clearVideoTimers();
    hideVideoError();
    prepareVideoOverlay();

    state.videoVisible = true;
    state.videoId = videoId;
    state.videoUrl = videoUrl;
    state.videoError = "";
    state.videoStatus = hasVisibleVideo ? "transitioning" : "loading";

    if (hasVisibleVideo) {
      videoElement.classList.remove("shipexplorer-video-element-visible");
      videoTransitionTimer = window.setTimeout(function () {
        if (requestId === videoRequestId) {
          loadRemoteVideoSource(requestId, videoId, videoUrl, resolvedVideoUrl);
        }
      }, options.videoFadeMs);
      return;
    }

    videoElement.classList.remove("shipexplorer-video-element-visible");
    loadRemoteVideoSource(requestId, videoId, videoUrl, resolvedVideoUrl);
  }

  function loadRemoteVideoSource(requestId, videoId, originalVideoUrl, resolvedVideoUrl) {
    if (!videoElement || requestId !== videoRequestId) return;

    state.videoStatus = "loading";
    state.videoId = videoId;
    state.videoUrl = originalVideoUrl;
    state.videoError = "";

    try {
      videoElement.pause();
      videoElement.loop = options.videoLoop;
      videoElement.muted = shouldStartVideoMuted();
      if (videoElement.muted) {
        videoElement.setAttribute("muted", "");
      } else {
        videoElement.removeAttribute("muted");
      }
      state.videoMuted = videoElement.muted;
      videoElement.src = resolvedVideoUrl;
      videoElement.load();
    } catch {
      showVideoError(videoId, originalVideoUrl);
      return;
    }

    waitForVideoReady(videoElement, function (ready) {
      if (requestId !== videoRequestId) return;

      if (!ready) {
        showVideoError(videoId, originalVideoUrl);
        return;
      }

      activateLoadedVideo(requestId);
    });
  }

  function activateLoadedVideo(requestId) {
    if (!videoElement || requestId !== videoRequestId) return;

    state.videoVisible = true;
    state.videoStatus = "playing";
    state.videoError = "";
    hideVideoError();
    playVideoNode(videoElement);

    window.requestAnimationFrame(function () {
      if (requestId !== videoRequestId) return;
      videoElement.classList.add("shipexplorer-video-element-visible");
    });
  }

  function closeVideoDom() {
    if (!videoOverlay || !videoElement) return;

    var requestId = ++videoRequestId;
    var wasVisible = !videoOverlay.hidden;

    clearVideoTimers();
    hideVideoError();
    state.videoStatus = wasVisible ? "closing" : "hidden";
    state.videoVisible = false;
    state.videoId = "";
    state.videoUrl = "";
    state.videoError = "";

    if (!wasVisible) {
      stopVideoNode(videoElement);
      return;
    }

    videoElement.classList.remove("shipexplorer-video-element-visible");
    videoHideTimer = window.setTimeout(function () {
      if (requestId !== videoRequestId) return;
      stopVideoNode(videoElement);
      videoOverlay.hidden = true;
      state.videoStatus = "hidden";
      videoHideTimer = 0;
    }, options.videoFadeMs + options.videoCloseHoldMs);
  }

  function prepareVideoOverlay() {
    if (!videoOverlay) return;

    videoOverlay.hidden = false;
    videoOverlay.style.zIndex = String(options.videoZIndex);
    videoOverlay.style.background = options.videoBackground;
    videoOverlay.style.setProperty("--shipexplorer-video-fade-ms", options.videoFadeMs + "ms");
  }

  function showVideoError(videoId, videoUrl) {
    if (!videoOverlay || !videoElement) return;

    videoRequestId += 1;
    clearVideoTimers();
    prepareVideoOverlay();
    stopVideoNode(videoElement);
    videoElement.classList.remove("shipexplorer-video-element-visible");

    state.videoVisible = true;
    state.videoId = videoId || "";
    state.videoUrl = videoUrl || "";
    state.videoStatus = "error";
    state.videoError = "VIDEO ERROR";

    if (videoStatusNode) {
      videoStatusNode.textContent = "VIDEO ERROR";
      videoStatusNode.hidden = false;
    }

    if (videoCloseButton) {
      videoCloseButton.hidden = false;
    }

    warnConnectionIssue("Video could not be prepared: " + (videoId || "unknown"));
  }

  function hideVideoError() {
    if (videoStatusNode) videoStatusNode.hidden = true;
    if (videoCloseButton) videoCloseButton.hidden = true;
  }

  function playVideoNode(node) {
    if (!node || typeof node.play !== "function") return;

    state.videoMuted = node.muted;
    var playPromise = node.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(function () {
        if (!node.muted) {
          node.muted = true;
          node.setAttribute("muted", "");
          state.videoMuted = true;
          var mutedPromise = node.play();
          if (mutedPromise && typeof mutedPromise.catch === "function") {
            mutedPromise.catch(function () {
              warnConnectionIssue("Video playback was blocked by the browser.");
            });
          }
          return;
        }

        warnConnectionIssue("Video playback was blocked by the browser.");
      });
    }
  }

  function shouldStartVideoMuted() {
    if (!options.videoMuted && (!options.allowSoundAfterTap || soundUnlocked)) return false;
    if (options.allowSoundAfterTap && soundUnlocked) return false;
    return true;
  }

  function setupVideoSoundUnlock() {
    if (!options.allowSoundAfterTap || soundUnlockAttached) return;

    soundUnlockAttached = true;
    document.addEventListener("pointerdown", unlockVideoSound, { passive: true });
    document.addEventListener("touchstart", unlockVideoSound, { passive: true });
    document.addEventListener("keydown", unlockVideoSound);
  }

  function unlockVideoSound() {
    soundUnlocked = true;

    if (videoElement) {
      videoElement.muted = false;
      videoElement.removeAttribute("muted");
      state.videoMuted = false;

      if (!videoOverlay || videoOverlay.hidden) return;
      playVideoNode(videoElement);
    }
  }

  function waitForVideoReady(node, callback) {
    if (!node) {
      callback(false);
      return;
    }

    if (node.readyState >= 2) {
      callback(true);
      return;
    }

    var done = false;
    var timeout = window.setTimeout(function () {
      finish(node.readyState >= 2);
    }, options.videoLoadTimeoutMs);

    function finish(ready) {
      if (done) return;
      done = true;
      window.clearTimeout(timeout);
      node.removeEventListener("loadeddata", handleReady);
      node.removeEventListener("canplay", handleReady);
      node.removeEventListener("error", handleError);
      callback(Boolean(ready));
    }

    function handleReady() {
      finish(true);
    }

    function handleError() {
      finish(false);
    }

    node.addEventListener("loadeddata", handleReady);
    node.addEventListener("canplay", handleReady);
    node.addEventListener("error", handleError);
  }

  function resolveVideoUrl(videoUrl) {
    if (typeof videoUrl !== "string" || !videoUrl) return "";

    if (/^(https?:|blob:|data:)/i.test(videoUrl)) {
      return videoUrl;
    }

    if (videoUrl.charAt(0) === "/" && options.socketUrl) {
      try {
        var socketOrigin = new URL(options.socketUrl.replace(/^ws:/i, "http:").replace(/^wss:/i, "https:"));
        return socketOrigin.origin + videoUrl;
      } catch {
        return videoUrl;
      }
    }

    return videoUrl;
  }

  function stopVideoNode(node) {
    if (!node) return;

    try {
      node.pause();
      node.removeAttribute("src");
      node.load();
    } catch {
      // Ignore media cleanup errors.
    }
  }

  function applyTheme() {
    if (!overlay) return;

    overlay.classList.remove("shipexplorer-popup-theme-dark", "shipexplorer-popup-theme-light", "shipexplorer-popup-theme-ship");
    overlay.classList.add("shipexplorer-popup-theme-" + options.theme);
  }

  function applyVariant(variant) {
    if (!overlay) return;

    overlay.classList.remove(
      "shipexplorer-popup-variant-info",
      "shipexplorer-popup-variant-warning",
      "shipexplorer-popup-variant-danger",
      "shipexplorer-popup-variant-success"
    );
    overlay.classList.add("shipexplorer-popup-variant-" + normalizeVariant(variant));
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
      ".shipexplorer-popup-title{position:relative;margin:0 0 6px;color:var(--shipexplorer-popup-accent);font-size:clamp(15px,2vw,20px);line-height:1.25;letter-spacing:.08em;text-align:center;text-transform:uppercase;}",
      ".shipexplorer-popup-message{position:relative;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--shipexplorer-popup-text);font-size:clamp(20px,3vw,32px);line-height:1.28;letter-spacing:0;text-align:center;padding:12px 8px 20px;}",
      ".shipexplorer-popup-close{position:relative;display:block;margin:8px auto 0;min-height:38px;border:1px solid var(--shipexplorer-popup-line);background:transparent;color:var(--shipexplorer-popup-text);font:inherit;font-size:13px;letter-spacing:.1em;text-transform:uppercase;padding:9px 15px;cursor:pointer;}",
      ".shipexplorer-popup-close:hover{border-color:var(--shipexplorer-popup-accent);color:var(--shipexplorer-popup-accent);}",
      ".shipexplorer-popup-visible .shipexplorer-popup-panel{animation:shipexplorer-popup-in .18s ease-out both;}",
      "@keyframes shipexplorer-popup-in{from{opacity:0;transform:translateY(12px) scale(.985);}to{opacity:1;transform:translateY(0) scale(1);}}",
      ".shipexplorer-popup-theme-ship{--shipexplorer-popup-panel:rgba(17,19,20,.94);--shipexplorer-popup-line:#44e0c0;--shipexplorer-popup-inner:rgba(68,224,192,.38);--shipexplorer-popup-halo:rgba(68,224,192,.2);--shipexplorer-popup-text:#d7e3df;--shipexplorer-popup-muted:#7f9695;--shipexplorer-popup-accent:#ff7a16;}",
      ".shipexplorer-popup-theme-dark{--shipexplorer-popup-panel:rgba(18,20,22,.96);--shipexplorer-popup-line:#8fa4a0;--shipexplorer-popup-inner:rgba(143,164,160,.32);--shipexplorer-popup-halo:rgba(143,164,160,.18);--shipexplorer-popup-text:#f4f7f6;--shipexplorer-popup-muted:#a2afad;--shipexplorer-popup-accent:#44e0c0;}",
      ".shipexplorer-popup-theme-light{background:rgba(246,248,247,.62);--shipexplorer-popup-panel:rgba(255,255,255,.97);--shipexplorer-popup-line:#1f7d72;--shipexplorer-popup-inner:rgba(31,125,114,.24);--shipexplorer-popup-halo:rgba(31,125,114,.12);--shipexplorer-popup-text:#111314;--shipexplorer-popup-muted:#5c6c6a;--shipexplorer-popup-accent:#ff7a16;}",
      ".shipexplorer-popup-variant-info{--shipexplorer-popup-accent:#44e0c0;}",
      ".shipexplorer-popup-variant-warning{--shipexplorer-popup-accent:#ff7a16;}",
      ".shipexplorer-popup-variant-danger{--shipexplorer-popup-accent:#e75a4f;}",
      ".shipexplorer-popup-variant-success{--shipexplorer-popup-accent:#74f28c;}",
      ".shipexplorer-video-overlay{position:fixed;inset:0;width:100vw;height:100vh;margin:0;padding:0;background:#6EA285;overflow:hidden;z-index:999999;isolation:isolate;box-sizing:border-box;overscroll-behavior:contain;}",
      ".shipexplorer-video-overlay[hidden]{display:none!important;}",
      ".shipexplorer-video-overlay:before{content:'';position:absolute;inset:0;background:#000;z-index:0;}",
      ".shipexplorer-video-overlay *{box-sizing:border-box;}",
      ".shipexplorer-video-element{position:absolute;inset:0;display:block;width:100vw;height:100vh;margin:0;padding:0;border:0;object-fit:cover;background:#000;opacity:0;z-index:1;transition:opacity var(--shipexplorer-video-fade-ms,.35s) ease;}",
      ".shipexplorer-video-element.shipexplorer-video-element-visible{opacity:1;}",
      ".shipexplorer-video-status{position:absolute;left:50%;top:50%;z-index:2;transform:translate(-50%,-50%);padding:9px 12px;border:1px solid rgba(215,227,223,.75);background:rgba(0,0,0,.72);color:#d7e3df;font-family:Consolas,'Courier New',monospace;font-size:12px;letter-spacing:.12em;text-transform:uppercase;}",
      ".shipexplorer-video-close{position:absolute;left:50%;top:calc(50% + 44px);z-index:2;transform:translateX(-50%);min-height:36px;border:1px solid rgba(215,227,223,.75);background:rgba(0,0,0,.72);color:#d7e3df;font-family:Consolas,'Courier New',monospace;font-size:12px;letter-spacing:.1em;text-transform:uppercase;padding:8px 12px;cursor:pointer;}",
      ".shipexplorer-video-close:hover{border-color:#44e0c0;color:#44e0c0;}",
      "@media (prefers-reduced-motion:reduce){.shipexplorer-popup-visible .shipexplorer-popup-panel{animation:none;}.shipexplorer-video-element{transition:none;}}",
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

  function clearAutoHideTimer() {
    if (!autoHideTimer) return;
    window.clearTimeout(autoHideTimer);
    autoHideTimer = 0;
  }

  function clearVideoTimers() {
    if (videoHideTimer) {
      window.clearTimeout(videoHideTimer);
      videoHideTimer = 0;
    }

    if (videoTransitionTimer) {
      window.clearTimeout(videoTransitionTimer);
      videoTransitionTimer = 0;
    }
  }

  function normalizeVariant(variant) {
    if (variant === "warning" || variant === "danger" || variant === "success") return variant;
    return "info";
  }

  function normalizeDuration(durationMs) {
    var value = Number(durationMs);
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.min(Math.round(value), 2147483647);
  }

  function normalizeVideoDuration(value, fallback) {
    var parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return fallback;
    return Math.min(Math.round(parsed), 60000);
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
    playRemoteVideo: playRemoteVideo,
    closeRemoteVideo: closeRemoteVideo,
    getVideoStatus: getVideoStatus,
  };

  window.ShipExplorerPopupClient = api;
})();
