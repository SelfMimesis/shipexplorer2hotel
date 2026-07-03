export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const lerp = (from, to, amount) => from + (to - from) * amount;

export const rand = (min, max) => min + Math.random() * (max - min);

export const randInt = (min, max) => Math.floor(rand(min, max + 1));

export const chooseWeighted = (items) => {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;

  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }

  return items[items.length - 1];
};

export const distance = (ax, ay, bx, by) => {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.hypot(dx, dy);
};

export const pointInCircle = (px, py, cx, cy, radius) => distance(px, py, cx, cy) <= radius;

export const roundPixel = (value) => Math.round(value);

export const roundPoint = (point) => ({
  x: roundPixel(point.x),
  y: roundPixel(point.y),
});

export const screenToCanvasPoint = (event, canvas, width, height) => {
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * width;
  const y = ((event.clientY - rect.top) / rect.height) * height;

  return roundPoint({
    x: clamp(x, 0, width),
    y: clamp(y, 0, height),
  });
};

export const formatPercent = (value) => `${Math.round(value * 100).toString().padStart(3, "0")}%`;

export const withAlpha = (hex, alpha) => {
  const raw = hex.replace("#", "");
  const value = Number.parseInt(raw, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
};

export const wrapText = (text, size) => {
  const words = text.split(" ");
  const lines = [];
  let line = "";

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > size && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }

  if (line) lines.push(line);
  return lines;
};

export const formatScore = (score) => String(Math.floor(score)).padStart(6, "0");

export const formatTime = (time) => {
  const safeTime = Math.max(0, Math.ceil(time));
  const minutes = Math.floor(safeTime / 60);
  const seconds = safeTime % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

export const setFont = (ctx, size, align = "left", baseline = "top") => {
  ctx.font = `${size}px "Automatron", "Consolas", monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
};

export const drawText = (ctx, text, x, y, color, size = 5, align = "left", baseline = "top") => {
  setFont(ctx, size, align, baseline);
  ctx.fillStyle = color;
  ctx.fillText(text, Math.round(x), Math.round(y));
};

export const drawPixelLine = (ctx, x1, y1, x2, y2, color, alpha = 1, width = 1) => {
  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(Math.round(x1) + 0.5, Math.round(y1) + 0.5);
  ctx.lineTo(Math.round(x2) + 0.5, Math.round(y2) + 0.5);
  ctx.stroke();
  ctx.restore();
};

export const drawRect = (ctx, x, y, width, height, stroke, fill = null, lineWidth = 1, alpha = 1) => {
  const ix = Math.round(x);
  const iy = Math.round(y);
  const iw = Math.round(width);
  const ih = Math.round(height);

  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(ix, iy, iw, ih);
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.strokeRect(ix + 0.5, iy + 0.5, iw, ih);
  }
  ctx.restore();
};

export const drawBar = (ctx, x, y, width, height, value, color, backColor = "rgba(136, 48, 191, 0.22)") => {
  const ix = Math.round(x);
  const iy = Math.round(y);
  const iw = Math.round(width);
  const ih = Math.round(height);
  const fillWidth = Math.round(clamp(value, 0, 1) * iw);

  ctx.fillStyle = backColor;
  ctx.fillRect(ix, iy, iw, ih);
  ctx.fillStyle = color;
  ctx.fillRect(ix, iy, fillWidth, ih);
};

export const drawRing = (ctx, x, y, radius, color, alpha = 1, width = 1, start = 0, end = Math.PI * 2) => {
  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(Math.round(x), Math.round(y), Math.round(radius), start, end);
  ctx.stroke();
  ctx.restore();
};

export const drawPanel = (ctx, x, y, width, height, color, fill = "rgba(42, 18, 54, 0.38)") => {
  const ix = Math.round(x);
  const iy = Math.round(y);
  const iw = Math.round(width);
  const ih = Math.round(height);

  ctx.fillStyle = fill;
  ctx.fillRect(ix + 2, iy, iw - 4, ih);
  ctx.fillRect(ix, iy + 2, iw, ih - 4);

  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ix + 5, iy + 0.5);
  ctx.lineTo(ix + iw - 6, iy + 0.5);
  ctx.lineTo(ix + iw - 0.5, iy + 6);
  ctx.lineTo(ix + iw - 0.5, iy + ih - 6);
  ctx.lineTo(ix + iw - 6, iy + ih - 0.5);
  ctx.lineTo(ix + 5, iy + ih - 0.5);
  ctx.lineTo(ix + 0.5, iy + ih - 5);
  ctx.lineTo(ix + 0.5, iy + 5);
  ctx.closePath();
  ctx.stroke();
};

export const drawBracket = (ctx, x, y, width, height, color) => {
  const l = Math.round(x);
  const t = Math.round(y);
  const r = Math.round(x + width);
  const b = Math.round(y + height);
  const tick = 5;

  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(l, t + tick);
  ctx.lineTo(l, t);
  ctx.lineTo(l + tick, t);
  ctx.moveTo(r - tick, t);
  ctx.lineTo(r, t);
  ctx.lineTo(r, t + tick);
  ctx.moveTo(r, b - tick);
  ctx.lineTo(r, b);
  ctx.lineTo(r - tick, b);
  ctx.moveTo(l + tick, b);
  ctx.lineTo(l, b);
  ctx.lineTo(l, b - tick);
  ctx.stroke();
};

export const drawPixelDiamond = (ctx, x, y, size, color) => {
  const ix = Math.round(x);
  const iy = Math.round(y);
  const s = Math.round(size);
  ctx.fillStyle = color;
  ctx.fillRect(ix, iy - s, 1, 1);
  ctx.fillRect(ix - 1, iy - s + 1, 3, 1);
  ctx.fillRect(ix - s, iy, s * 2 + 1, 1);
  ctx.fillRect(ix - 1, iy + s - 1, 3, 1);
  ctx.fillRect(ix, iy + s, 1, 1);
};
