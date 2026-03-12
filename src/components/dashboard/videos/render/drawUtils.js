/**
 * Canvas drawing helpers for video rendering.
 *
 * All coordinates target the 1080×1920 output canvas.
 * Supports template-specific accent colors for differentiated
 * visual treatment across Feature Spotlight, Quick Walkthrough,
 * and Stats Proof Reel templates.
 */

const W = 1080;
const H = 1920;
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';

// ─── asset loader ────────────────────────────────────────────────
let _logoCache = null;

export function loadLogo(src = '/logo.png') {
  if (_logoCache) return Promise.resolve(_logoCache);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { _logoCache = img; resolve(img); };
    img.onerror = reject;
    img.src = src;
  });
}

// ─── background gradient ─────────────────────────────────────────
export function fillGradient(ctx, startColor = '#0a0e1a', endColor = '#131c30') {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, startColor);
  g.addColorStop(0.5, endColor);
  g.addColorStop(1, startColor);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// ─── decorative divider ──────────────────────────────────────────
function drawDivider(ctx, y, accent) {
  const cx = W / 2;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 80, y);
  ctx.lineTo(cx - 12, y);
  ctx.moveTo(cx + 12, y);
  ctx.lineTo(cx + 80, y);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, y, 4, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
}

// ─── multi-line text (centered, word-wrapped) ────────────────────
function drawWrappedText(ctx, text, x, y, maxWidth, fontSize, lineHeight, opts = {}) {
  const { color = '#fff', weight = 'bold', align = 'center', alpha = 1 } = opts;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${weight} ${fontSize}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';

  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  const totalHeight = lines.length * fontSize * lineHeight;
  let drawY = y - totalHeight / 2;

  for (const line of lines) {
    ctx.fillText(line, x, drawY);
    drawY += fontSize * lineHeight;
  }

  ctx.restore();
  return totalHeight;
}

// ─── intro card ──────────────────────────────────────────────────
export function drawIntroCard(ctx, logo, { headline, brand }, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;

  fillGradient(ctx, brand.gradientStart, brand.gradientEnd);

  if (logo) {
    const lw = 100;
    const lh = (logo.naturalHeight / logo.naturalWidth) * lw;
    ctx.drawImage(logo, (W - lw) / 2, H * 0.33 - lh / 2, lw, lh);
  }

  ctx.font = `600 18px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.textAlign = 'center';
  ctx.letterSpacing = '0.18em';
  ctx.fillText(brand.name, W / 2, H * 0.33 + 70);
  ctx.letterSpacing = '0px';

  drawDivider(ctx, H * 0.42, brand.accentColor);

  if (headline) {
    drawWrappedText(ctx, headline, W / 2, H * 0.52, W * 0.78, 56, 1.25, {
      weight: '700',
      alpha: 1,
    });
  }

  ctx.font = `500 20px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.textAlign = 'center';
  ctx.fillText(brand.url, W / 2, H * 0.72);

  ctx.restore();
}

// ─── outro / CTA card ────────────────────────────────────────────
export function drawOutroCard(ctx, logo, { cta, brand }, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;

  fillGradient(ctx, brand.gradientStart, brand.gradientEnd);

  if (cta) {
    drawWrappedText(ctx, cta, W / 2, H * 0.40, W * 0.78, 54, 1.25, {
      weight: '700',
      alpha: 1,
    });
  }

  drawDivider(ctx, H * 0.50, brand.accentColor);

  if (logo) {
    const lw = 80;
    const lh = (logo.naturalHeight / logo.naturalWidth) * lw;
    ctx.drawImage(logo, (W - lw) / 2, H * 0.56, lw, lh);
  }

  ctx.font = `600 16px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.textAlign = 'center';
  ctx.letterSpacing = '0.16em';
  ctx.fillText(brand.name, W / 2, H * 0.56 + 80);
  ctx.letterSpacing = '0px';

  ctx.font = `500 20px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillText(brand.url, W / 2, H * 0.72);

  ctx.restore();
}

// ─── video frame (cover-fit into 1080×1920) ──────────────────────
export function drawVideoFrame(ctx, video) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;

  const sourceAspect = vw / vh;
  const targetAspect = W / H;

  let dw, dh, dx, dy;
  if (sourceAspect > targetAspect) {
    dh = H;
    dw = H * sourceAspect;
    dx = (W - dw) / 2;
    dy = 0;
  } else {
    dw = W;
    dh = W / sourceAspect;
    dx = 0;
    dy = (H - dh) / 2;
  }

  ctx.drawImage(video, dx, dy, dw, dh);
}

// ─── premium headline overlay (during footage) ──────────────────
export function drawHeadlineOverlay(ctx, text, yCenter, fontSize, lineHeight, alpha = 1, accentColor = '#3C79B4') {
  if (!text || alpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = alpha;

  const maxWidth = W * 0.82;
  const padding = 28;
  const accentW = 4;

  ctx.font = `700 ${fontSize}px ${FONT}`;
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth - padding * 2 - accentW && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);

  const textH = lines.length * fontSize * lineHeight;
  const boxH = textH + padding * 2;
  const boxW = Math.min(maxWidth, Math.max(...lines.map(l => ctx.measureText(l).width)) + padding * 3 + accentW);
  const boxX = (W - boxW) / 2;
  const boxY = yCenter - boxH / 2;
  const radius = 14;

  const bgGrad = ctx.createLinearGradient(boxX, boxY, boxX, boxY + boxH);
  bgGrad.addColorStop(0, 'rgba(10, 14, 26, 0.85)');
  bgGrad.addColorStop(1, 'rgba(10, 14, 26, 0.75)');
  ctx.fillStyle = bgGrad;
  ctx.beginPath();
  roundedRect(ctx, boxX, boxY, boxW, boxH, radius);
  ctx.fill();

  ctx.fillStyle = accentColor;
  ctx.beginPath();
  roundedRect(ctx, boxX, boxY + 6, accentW, boxH - 12, 2);
  ctx.fill();

  ctx.strokeStyle = `${accentColor}40`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  roundedRect(ctx, boxX, boxY, boxW, boxH, radius);
  ctx.stroke();

  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;

  ctx.font = `700 ${fontSize}px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  let drawY = boxY + padding;
  for (const line of lines) {
    ctx.fillText(line, W / 2, drawY);
    drawY += fontSize * lineHeight;
  }

  ctx.restore();
}

// ─── beat overlay (compact pill with accent dot) ─────────────────
export function drawBeatOverlay(ctx, text, yCenter, fontSize, lineHeight, alpha = 1, accentColor = '#3C79B4') {
  if (!text || alpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = alpha;

  const maxWidth = W * 0.78;
  const padding = 20;
  const dotR = 5;
  const dotGap = 10;

  ctx.font = `600 ${fontSize}px ${FONT}`;
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth - padding * 2 - dotR * 2 - dotGap && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);

  const textH = lines.length * fontSize * lineHeight;
  const boxH = textH + padding * 2;
  const textW = Math.max(...lines.map(l => ctx.measureText(l).width));
  const boxW = Math.min(maxWidth, textW + padding * 2.5 + dotR * 2 + dotGap);
  const boxX = (W - boxW) / 2;
  const boxY = yCenter - boxH / 2;
  const radius = 12;

  ctx.fillStyle = 'rgba(10, 14, 26, 0.72)';
  ctx.beginPath();
  roundedRect(ctx, boxX, boxY, boxW, boxH, radius);
  ctx.fill();

  ctx.strokeStyle = `${accentColor}30`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  roundedRect(ctx, boxX, boxY, boxW, boxH, radius);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(boxX + padding, yCenter, dotR, 0, Math.PI * 2);
  ctx.fillStyle = accentColor;
  ctx.fill();

  ctx.font = `600 ${fontSize}px ${FONT}`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  let drawY = boxY + padding;
  for (const line of lines) {
    ctx.fillText(line, W / 2 + dotR, drawY);
    drawY += fontSize * lineHeight;
  }

  ctx.restore();
}

// ─── legacy text overlay (fallback) ──────────────────────────────
export function drawTextOverlay(ctx, text, yCenter, fontSize, lineHeight, alpha = 1) {
  if (!text || alpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = alpha;

  const maxWidth = W * 0.82;
  const padding = 24;

  ctx.font = `700 ${fontSize}px ${FONT}`;
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth - padding * 2 && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);

  const textH = lines.length * fontSize * lineHeight;
  const boxH = textH + padding * 2;
  const boxW = Math.min(maxWidth, Math.max(...lines.map(l => ctx.measureText(l).width)) + padding * 3);
  const boxX = (W - boxW) / 2;
  const boxY = yCenter - boxH / 2;
  const radius = 16;

  ctx.fillStyle = 'rgba(10, 14, 26, 0.72)';
  ctx.beginPath();
  roundedRect(ctx, boxX, boxY, boxW, boxH, radius);
  ctx.fill();

  ctx.strokeStyle = 'rgba(60, 121, 180, 0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  roundedRect(ctx, boxX, boxY, boxW, boxH, radius);
  ctx.stroke();

  ctx.font = `700 ${fontSize}px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  let drawY = boxY + padding;
  for (const line of lines) {
    ctx.fillText(line, W / 2, drawY);
    drawY += fontSize * lineHeight;
  }

  ctx.restore();
}

// ─── watermark (small logo in bottom-safe area) ──────────────────
export function drawWatermark(ctx, logo, alpha = 0.35) {
  if (!logo) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const lw = 44;
  const lh = (logo.naturalHeight / logo.naturalWidth) * lw;
  ctx.drawImage(logo, W - lw - 32, H * 0.74, lw, lh);
  ctx.restore();
}

// ─── rounded rectangle ──────────────────────────────────────────
function roundedRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

// ─── easing helper ───────────────────────────────────────────────
export function easeAlpha(progress, fadeInPct = 0.08, fadeOutPct = 0.08) {
  if (progress < fadeInPct) return progress / fadeInPct;
  if (progress > 1 - fadeOutPct) return (1 - progress) / fadeOutPct;
  return 1;
}
