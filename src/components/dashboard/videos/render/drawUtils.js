/**
 * Canvas drawing helpers for video rendering.
 *
 * All coordinates target the 1080×1920 output canvas.
 *
 * Features:
 *   - Hook Boost Frame: micro pattern-interrupt in the first 0.7s
 *   - Template-specific gradient glass pill overlays
 *   - Slide-up + micro-bounce entrance animations
 *   - Smart overlay safe zone placement
 *   - Hero robot outro with floating animation
 */

const W = 1080;
const H = 1920;
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';

// ─── template glass pill gradients ───────────────────────────────
const GLASS_GRADIENTS = {
  'feature-spotlight': { start: 'rgba(60,121,180,0.92)', end: 'rgba(40,80,140,0.92)' },
  'quick-walkthrough': { start: 'rgba(39,174,96,0.92)', end: 'rgba(28,120,72,0.92)' },
  'stats-proof':       { start: 'rgba(230,126,34,0.92)', end: 'rgba(160,80,20,0.92)' },
};

function getGlassGradient(ctx, x, y, w, h, templateId) {
  const tplGrad = GLASS_GRADIENTS[templateId] || GLASS_GRADIENTS['feature-spotlight'];
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, tplGrad.start);
  g.addColorStop(1, tplGrad.end);
  return g;
}

// ─── asset loaders ───────────────────────────────────────────────
let _logoCache = null;
let _robotCache = null;

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

export function loadRobotImage(src = '/assets/robot/maximus-hero.png') {
  if (_robotCache) return Promise.resolve(_robotCache);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { _robotCache = img; resolve(img); };
    img.onerror = () => resolve(null);
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

// ─── SECTION 1: Hook Boost Frame ─────────────────────────────────
// Micro pattern-interrupt for the first ~0.7s of a reel.
// Renders a bold hook text with scale animation and radial focus.

const HOOK_BOOST_TEXTS = {
  product:   ['See what you\'re missing.', 'This changes everything.', 'Built different.'],
  betting:   ['Bet smarter in 10 seconds.', 'Your edge starts here.', 'Before the line moves.'],
  curiosity: ['Most fans miss this.', 'What smart bettors know.', 'Stop scrolling.'],
  fans:      ['Your season starts now.', 'Never miss another game.', 'This is for real fans.'],
  editorial: ['Sports intel. Redefined.', 'One platform. Total clarity.', 'Clean data. Clear edge.'],
};

export function getHookBoostText(hookStyle) {
  const pool = HOOK_BOOST_TEXTS[hookStyle] || HOOK_BOOST_TEXTS.product;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function drawHookBoostFrame(ctx, video, {
  hookText,
  brand,
  frameIndex,
  totalFrames,
  fps = 30,
}) {
  const progress = frameIndex / totalFrames;
  const fadeInFrames = 8;
  const fadeAlpha = Math.min(1, frameIndex / fadeInFrames);
  const scaleT = Math.min(1, frameIndex / totalFrames);
  const scale = 1.05 - 0.05 * scaleT;

  ctx.save();

  if (video && video.videoWidth) {
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(scale, scale);
    ctx.translate(-W / 2, -H / 2);

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const sourceAspect = vw / vh;
    const targetAspect = W / H;
    let dw, dh, dx, dy;
    if (sourceAspect > targetAspect) {
      dh = H; dw = H * sourceAspect; dx = (W - dw) / 2; dy = 0;
    } else {
      dw = W; dh = W / sourceAspect; dx = 0; dy = (H - dh) / 2;
    }
    ctx.filter = 'blur(3px) brightness(0.65)';
    ctx.drawImage(video, dx, dy, dw, dh);
    ctx.filter = 'none';
    ctx.restore();
  } else {
    fillGradient(ctx, brand.gradientStart, brand.gradientEnd);
  }

  ctx.globalAlpha = fadeAlpha;

  const radial = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, W * 0.7);
  radial.addColorStop(0, 'rgba(0,0,0,0)');
  radial.addColorStop(0.6, 'rgba(0,0,0,0.15)');
  radial.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, W, H);

  if (hookText) {
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 4;

    ctx.font = `800 64px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '0.02em';

    const words = hookText.split(' ');
    const lines = [];
    let cur = '';
    for (const word of words) {
      const test = cur ? `${cur} ${word}` : word;
      if (ctx.measureText(test).width > W * 0.78 && cur) {
        lines.push(cur); cur = word;
      } else { cur = test; }
    }
    if (cur) lines.push(cur);

    const lineH = 80;
    const startY = H * 0.45 - (lines.length * lineH) / 2;
    for (let li = 0; li < lines.length; li++) {
      ctx.fillText(lines[li], W / 2, startY + li * lineH);
    }

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.letterSpacing = '0px';
  }

  const accentY = H * 0.58;
  ctx.fillStyle = brand.accentColor || '#3C79B4';
  ctx.beginPath();
  roundedRect(ctx, W * 0.38, accentY, W * 0.24, 3, 2);
  ctx.fill();

  const fadeOutStart = totalFrames - 5;
  if (frameIndex >= fadeOutStart) {
    const fadeOut = 1 - (frameIndex - fadeOutStart) / 5;
    ctx.globalAlpha = Math.max(0, fadeOut);
  }

  ctx.restore();
}

// ─── SECTION 2: Smart Overlay Safe Zone ──────────────────────────
// Analyzes a video frame to find the least busy area for overlays.

export function computeOverlaySafeZone(ctx, canvasW = W, canvasH = H) {
  const gridCols = 5;
  const gridRows = 8;
  const cellW = Math.floor(canvasW / gridCols);
  const cellH = Math.floor(canvasH / gridRows);

  const zones = [
    { id: 'top-left',     col: 0, row: 1, yPct: 0.18 },
    { id: 'top-right',    col: 4, row: 1, yPct: 0.18 },
    { id: 'center-top',   col: 2, row: 2, yPct: 0.22 },
    { id: 'bottom-left',  col: 0, row: 5, yPct: 0.70 },
    { id: 'bottom-right', col: 4, row: 5, yPct: 0.70 },
  ];

  const scores = zones.map(zone => {
    const x = zone.col * cellW;
    const y = zone.row * cellH;
    let imageData;
    try {
      imageData = ctx.getImageData(x, y, cellW, cellH);
    } catch {
      return { ...zone, score: 0 };
    }
    const pixels = imageData.data;
    let totalVariance = 0;
    let totalBrightness = 0;
    const sampleStep = 16;
    let count = 0;

    for (let p = 0; p < pixels.length; p += sampleStep * 4) {
      const r = pixels[p], g = pixels[p + 1], b = pixels[p + 2];
      const brightness = (r + g + b) / 3;
      totalBrightness += brightness;
      count++;
    }

    const avgBrightness = totalBrightness / (count || 1);

    for (let p = 0; p < pixels.length; p += sampleStep * 4) {
      const r = pixels[p], g = pixels[p + 1], b = pixels[p + 2];
      const brightness = (r + g + b) / 3;
      totalVariance += (brightness - avgBrightness) ** 2;
    }

    const variance = totalVariance / (count || 1);
    const uniformity = 1 / (1 + variance / 500);
    const contrastFriendly = avgBrightness < 80 ? 1 : avgBrightness < 150 ? 0.7 : 0.4;
    const score = uniformity * 0.6 + contrastFriendly * 0.4;

    return { ...zone, score, avgBrightness, variance };
  });

  scores.sort((a, b) => b.score - a.score);
  return scores[0] || zones[0];
}

// ─── intro card (template-differentiated) ────────────────────────
export function drawIntroCard(ctx, logo, { headline, brand, templateId }, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;

  fillGradient(ctx, brand.gradientStart, brand.gradientEnd);

  if (templateId === 'quick-walkthrough') {
    drawIntroWalkthrough(ctx, logo, headline, brand);
  } else if (templateId === 'stats-proof') {
    drawIntroStatsProof(ctx, logo, headline, brand);
  } else {
    drawIntroSpotlight(ctx, logo, headline, brand);
  }

  ctx.restore();
}

function drawIntroSpotlight(ctx, logo, headline, brand) {
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
    drawWrappedText(ctx, headline, W / 2, H * 0.52, W * 0.78, 56, 1.25, { weight: '700' });
  }

  ctx.font = `500 20px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.textAlign = 'center';
  ctx.fillText(brand.url, W / 2, H * 0.72);
}

function drawIntroWalkthrough(ctx, logo, headline, brand) {
  const accent = brand.accentColor;

  ctx.fillStyle = accent;
  ctx.beginPath();
  roundedRect(ctx, W * 0.06, H * 0.28, 5, H * 0.22, 3);
  ctx.fill();

  if (logo) {
    const lw = 60;
    const lh = (logo.naturalHeight / logo.naturalWidth) * lw;
    ctx.drawImage(logo, W * 0.08, H * 0.30, lw, lh);
  }

  ctx.font = `600 14px ${FONT}`;
  ctx.fillStyle = `${accent}cc`;
  ctx.textAlign = 'left';
  ctx.letterSpacing = '0.2em';
  ctx.fillText('QUICK WALKTHROUGH', W * 0.08, H * 0.38);
  ctx.letterSpacing = '0px';

  if (headline) {
    drawWrappedText(ctx, headline, W / 2, H * 0.48, W * 0.82, 50, 1.2, { weight: '700' });
  }

  ctx.font = `500 18px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.textAlign = 'center';
  ctx.fillText(brand.url, W / 2, H * 0.68);
}

function drawIntroStatsProof(ctx, logo, headline, brand) {
  const accent = brand.accentColor;

  ctx.fillStyle = accent;
  ctx.beginPath();
  roundedRect(ctx, W * 0.35, H * 0.26, W * 0.30, 4, 2);
  ctx.fill();

  if (logo) {
    const lw = 70;
    const lh = (logo.naturalHeight / logo.naturalWidth) * lw;
    ctx.drawImage(logo, (W - lw) / 2, H * 0.29, lw, lh);
  }

  ctx.font = `800 16px ${FONT}`;
  ctx.fillStyle = accent;
  ctx.textAlign = 'center';
  ctx.letterSpacing = '0.22em';
  ctx.fillText('STATS PROOF', W / 2, H * 0.37);
  ctx.letterSpacing = '0px';

  if (headline) {
    drawWrappedText(ctx, headline, W / 2, H * 0.50, W * 0.80, 52, 1.2, { weight: '800' });
  }

  ctx.font = `600 22px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.textAlign = 'center';
  ctx.fillText(brand.url, W / 2, H * 0.70);
}

// ─── SECTION 5: outro with robot hero ────────────────────────────
export function drawOutroCard(ctx, logo, { cta, brand, templateId, robotImage, outroFrame, outroTotalFrames }, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;

  fillGradient(ctx, brand.gradientStart, brand.gradientEnd);

  if (templateId === 'quick-walkthrough') {
    drawOutroWalkthrough(ctx, logo, cta, brand);
  } else if (templateId === 'stats-proof') {
    drawOutroStatsProof(ctx, logo, cta, brand);
  } else {
    drawOutroSpotlight(ctx, logo, cta, brand);
  }

  if (robotImage) {
    const floatCycle = outroTotalFrames > 0 ? (outroFrame || 0) / outroTotalFrames : 0;
    const floatY = Math.sin(floatCycle * Math.PI * 2) * -6;

    const rw = 180;
    const rh = (robotImage.naturalHeight / robotImage.naturalWidth) * rw;
    const rx = (W - rw) / 2;
    const ry = H * 0.60 + floatY;

    ctx.drawImage(robotImage, rx, ry, rw, rh);
  }

  ctx.restore();
}

function drawOutroSpotlight(ctx, logo, cta, brand) {
  if (cta) {
    drawWrappedText(ctx, cta, W / 2, H * 0.38, W * 0.78, 54, 1.25, { weight: '700' });
  }

  drawDivider(ctx, H * 0.48, brand.accentColor);

  if (logo) {
    const lw = 80;
    const lh = (logo.naturalHeight / logo.naturalWidth) * lw;
    ctx.drawImage(logo, (W - lw) / 2, H * 0.52, lw, lh);
  }

  ctx.font = `600 16px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.textAlign = 'center';
  ctx.letterSpacing = '0.16em';
  ctx.fillText(brand.name, W / 2, H * 0.52 + 80);
  ctx.letterSpacing = '0px';

  drawDivider(ctx, H * 0.76, brand.accentColor);

  ctx.font = `500 20px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillText(brand.url, W / 2, H * 0.80);
}

function drawOutroWalkthrough(ctx, logo, cta, brand) {
  const accent = brand.accentColor;

  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.15;
  ctx.beginPath();
  ctx.arc(W * 0.85, H * 0.35, 120, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  if (cta) {
    drawWrappedText(ctx, cta, W / 2, H * 0.38, W * 0.80, 48, 1.2, { weight: '700' });
  }

  if (logo) {
    const lw = 60;
    const lh = (logo.naturalHeight / logo.naturalWidth) * lw;
    ctx.drawImage(logo, (W - lw) / 2, H * 0.52, lw, lh);
  }

  ctx.font = `500 18px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.textAlign = 'center';
  ctx.fillText(brand.url, W / 2, H * 0.80);
}

function drawOutroStatsProof(ctx, logo, cta, brand) {
  const accent = brand.accentColor;

  ctx.fillStyle = accent;
  ctx.beginPath();
  roundedRect(ctx, W * 0.35, H * 0.30, W * 0.30, 4, 2);
  ctx.fill();

  if (cta) {
    drawWrappedText(ctx, cta, W / 2, H * 0.38, W * 0.78, 50, 1.2, { weight: '700' });
  }

  if (logo) {
    const lw = 70;
    const lh = (logo.naturalHeight / logo.naturalWidth) * lw;
    ctx.drawImage(logo, (W - lw) / 2, H * 0.52, lw, lh);
  }

  ctx.font = `600 18px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.textAlign = 'center';
  ctx.fillText(brand.url, W / 2, H * 0.80);
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

// ─── SECTION 3+4: Premium headline overlay with glass pill + animation ──
export function drawHeadlineOverlay(ctx, text, yCenter, fontSize, lineHeight, alpha = 1, accentColor = '#3C79B4', opts = {}) {
  if (!text || alpha <= 0) return;

  const { templateId, animProgress } = opts;

  const slideUp = animProgress != null ? (1 - Math.min(1, animProgress / 0.3)) * 12 : 0;
  const microBounce = animProgress != null && animProgress > 0.3 && animProgress < 0.6
    ? Math.sin((animProgress - 0.3) / 0.3 * Math.PI) * 0.03
    : 0;
  const effectiveScale = 1 + microBounce;
  const adjustedY = yCenter + slideUp;

  ctx.save();
  ctx.globalAlpha = alpha;

  if (effectiveScale !== 1) {
    ctx.translate(W / 2, adjustedY);
    ctx.scale(effectiveScale, effectiveScale);
    ctx.translate(-W / 2, -adjustedY);
  }

  const maxWidth = W * 0.82;
  const padding = 28;
  const accentW = 4;

  ctx.font = `700 ${fontSize}px ${FONT}`;
  ctx.letterSpacing = '0.02em';
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
  const boxY = adjustedY - boxH / 2;
  const radius = 14;

  const bgGrad = templateId
    ? getGlassGradient(ctx, boxX, boxY, boxW, boxH, templateId)
    : (() => {
        const g = ctx.createLinearGradient(boxX, boxY, boxX + boxW, boxY + boxH);
        g.addColorStop(0, 'rgba(60,121,180,0.92)');
        g.addColorStop(1, 'rgba(40,80,140,0.92)');
        return g;
      })();
  ctx.fillStyle = bgGrad;
  ctx.beginPath();
  roundedRect(ctx, boxX, boxY, boxW, boxH, radius);
  ctx.fill();

  ctx.fillStyle = accentColor;
  ctx.beginPath();
  roundedRect(ctx, boxX, boxY + 6, accentW, boxH - 12, 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  roundedRect(ctx, boxX, boxY, boxW, boxH, radius);
  ctx.stroke();

  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;

  ctx.font = `700 ${fontSize}px ${FONT}`;
  ctx.letterSpacing = '0.02em';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  let drawY = boxY + padding;
  for (const line of lines) {
    ctx.fillText(line, W / 2, drawY);
    drawY += fontSize * lineHeight;
  }

  ctx.letterSpacing = '0px';
  ctx.restore();
}

// ─── SECTION 3+4: Beat overlay with glass pill + animation ───────
export function drawBeatOverlay(ctx, text, yCenter, fontSize, lineHeight, alpha = 1, accentColor = '#3C79B4', opts = {}) {
  if (!text || alpha <= 0) return;

  const { stepNum, templateId, animProgress } = opts;

  const slideUp = animProgress != null ? (1 - Math.min(1, animProgress / 0.25)) * 12 : 0;
  const microBounce = animProgress != null && animProgress > 0.25 && animProgress < 0.5
    ? Math.sin((animProgress - 0.25) / 0.25 * Math.PI) * 0.03
    : 0;
  const effectiveScale = 1 + microBounce;
  const adjustedY = yCenter + slideUp;

  ctx.save();
  ctx.globalAlpha = alpha;

  if (effectiveScale !== 1) {
    ctx.translate(W / 2, adjustedY);
    ctx.scale(effectiveScale, effectiveScale);
    ctx.translate(-W / 2, -adjustedY);
  }

  const maxWidth = W * 0.78;
  const padding = 20;
  const dotR = 5;
  const dotGap = 10;

  ctx.font = `600 ${fontSize}px ${FONT}`;
  ctx.letterSpacing = '0.02em';
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
  const boxY = adjustedY - boxH / 2;
  const radius = 12;

  const bgGrad = templateId
    ? getGlassGradient(ctx, boxX, boxY, boxW, boxH, templateId)
    : (() => {
        const g = ctx.createLinearGradient(boxX, boxY, boxX + boxW, boxY + boxH);
        g.addColorStop(0, 'rgba(60,121,180,0.92)');
        g.addColorStop(1, 'rgba(40,80,140,0.92)');
        return g;
      })();
  ctx.fillStyle = bgGrad;
  ctx.beginPath();
  roundedRect(ctx, boxX, boxY, boxW, boxH, radius);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  roundedRect(ctx, boxX, boxY, boxW, boxH, radius);
  ctx.stroke();

  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;

  if (stepNum != null) {
    ctx.beginPath();
    ctx.arc(boxX + padding, adjustedY, dotR + 3, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = `700 ${dotR * 2 + 2}px ${FONT}`;
    ctx.fillStyle = accentColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(stepNum), boxX + padding, adjustedY);
  } else {
    ctx.beginPath();
    ctx.arc(boxX + padding, adjustedY, dotR, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }

  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  ctx.font = `600 ${fontSize}px ${FONT}`;
  ctx.letterSpacing = '0.02em';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  let drawY = boxY + padding;
  for (const line of lines) {
    ctx.fillText(line, W / 2 + dotR, drawY);
    drawY += fontSize * lineHeight;
  }

  ctx.letterSpacing = '0px';
  ctx.restore();
}

// ─── stat callout overlay (stats proof template) ─────────────────
export function drawStatOverlay(ctx, text, yCenter, fontSize, lineHeight, alpha = 1, accentColor = '#e67e22', opts = {}) {
  if (!text || alpha <= 0) return;

  const { animProgress } = opts;
  const slideUp = animProgress != null ? (1 - Math.min(1, animProgress / 0.25)) * 12 : 0;
  const adjustedY = yCenter + slideUp;

  ctx.save();
  ctx.globalAlpha = alpha;

  const maxWidth = W * 0.80;
  const padding = 24;

  ctx.font = `800 ${fontSize}px ${FONT}`;
  ctx.letterSpacing = '0.02em';
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
  const textMaxW = Math.max(...lines.map(l => ctx.measureText(l).width));
  const boxW = Math.min(maxWidth, textMaxW + padding * 3);
  const boxX = (W - boxW) / 2;
  const boxY = adjustedY - boxH / 2;
  const radius = 10;

  const bgGrad = getGlassGradient(ctx, boxX, boxY, boxW, boxH, 'stats-proof');
  ctx.fillStyle = bgGrad;
  ctx.beginPath();
  roundedRect(ctx, boxX, boxY, boxW, boxH, radius);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  roundedRect(ctx, boxX, boxY, boxW, boxH, radius);
  ctx.stroke();

  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;

  ctx.font = `800 ${fontSize}px ${FONT}`;
  ctx.letterSpacing = '0.02em';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  let drawY = boxY + padding;
  for (let i = 0; i < lines.length; i++) {
    const isNumber = /^\d/.test(lines[i].trim());
    ctx.fillStyle = isNumber ? '#fff' : '#ffffff';
    ctx.font = isNumber ? `800 ${fontSize + 4}px ${FONT}` : `700 ${fontSize}px ${FONT}`;
    ctx.fillText(lines[i], W / 2, drawY);
    drawY += fontSize * lineHeight;
  }

  ctx.letterSpacing = '0px';
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
