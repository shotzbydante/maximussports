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
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"';

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

const ROBOT_FALLBACK_PATHS = ['/mascot.png', '/assets/robot/maximus-hero.png'];

export function loadRobotImage(src) {
  if (_robotCache) return Promise.resolve(_robotCache);
  const paths = src ? [src, ...ROBOT_FALLBACK_PATHS] : [...ROBOT_FALLBACK_PATHS];
  const unique = [...new Set(paths)];

  return new Promise((resolve) => {
    let idx = 0;
    function tryNext() {
      if (idx >= unique.length) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[Maximus] All mascot asset paths failed:', unique);
        }
        resolve(null);
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => { _robotCache = img; resolve(img); };
      img.onerror = () => {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`[Maximus] Mascot asset failed: ${unique[idx]}`);
        }
        idx++;
        tryNext();
      };
      img.src = unique[idx];
    }
    tryNext();
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

// ─── SECTION 0: Branded Intro Title Card ─────────────────────────
// Premium intro card — ALWAYS uses Maximus dark navy regardless of
// user-selected bgColor. Logo is the large hero visual.

const INTRO_OUTRO_BG = '#071426';

// ─── bgColor → glass gradient for overlay pills ─────────────────
function hexToRgb(hex) {
  const num = parseInt(hex.replace('#', ''), 16);
  return { r: (num >> 16) & 0xFF, g: (num >> 8) & 0xFF, b: num & 0xFF };
}

function bgColorToGlassGrad(ctx, x, y, w, h, bgColor, opacity = 0.92) {
  const isDarkNavy = bgColor === '#071426' || bgColor === '#0c1f3a';
  if (isDarkNavy) {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, `rgba(60,121,180,${opacity})`);
    g.addColorStop(1, `rgba(40,80,140,${opacity})`);
    return g;
  }
  const { r, g: gv, b } = hexToRgb(bgColor);
  const lr = Math.min(255, r + 25);
  const lg = Math.min(255, gv + 15);
  const lb = Math.min(255, b + 15);
  const grad = ctx.createLinearGradient(x, y, x + w, y + h);
  grad.addColorStop(0, `rgba(${lr},${lg},${lb},${opacity})`);
  grad.addColorStop(1, `rgba(${r},${gv},${b},${opacity})`);
  return grad;
}

// ─── emoji enforcement for primary headlines ─────────────────────
const HEADLINE_EMOJI_MAP = [
  [/sharp|lock|pick|bettor|edge/i, '🔒'],
  [/alert|upset|trap|warning|inefficien/i, '⚠️'],
  [/fire|hot|streak|cash|heat/i, '🔥'],
];

export function ensureHeadlineEmoji(text) {
  if (!text) return text;
  const emojiRe = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;
  if (emojiRe.test(text.trim())) return text;
  for (const [pattern, emoji] of HEADLINE_EMOJI_MAP) {
    if (pattern.test(text)) return `${emoji} ${text}`;
  }
  return `📊 ${text}`;
}

function drawNavyBackground(ctx) {
  const bg = ctx.createRadialGradient(W * 0.50, H * 0.38, 0, W * 0.50, H * 0.50, W * 0.95);
  bg.addColorStop(0, 'rgba(33,92,180,0.28)');
  bg.addColorStop(0.26, 'rgba(12,31,58,0.18)');
  bg.addColorStop(0.78, INTRO_OUTRO_BG);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const edge = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 1.1);
  edge.addColorStop(0, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, W, H);
}

function drawMlbBackground(ctx) {
  // MLB dark red gradient — deeper and richer than NCAAM navy
  const bg = ctx.createRadialGradient(W * 0.50, H * 0.38, 0, W * 0.50, H * 0.50, W * 0.95);
  bg.addColorStop(0, 'rgba(196,30,58,0.22)');
  bg.addColorStop(0.26, 'rgba(60,12,18,0.16)');
  bg.addColorStop(0.78, '#0A0810');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const edge = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 1.1);
  edge.addColorStop(0, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(0,0,0,0.40)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, W, H);
}

export function drawBrandedIntroCard(ctx, logo, { brand, hookText, headline, subhead, sportContext }, introFrame, introTotalFrames) {
  const progress = introTotalFrames > 0 ? introFrame / introTotalFrames : 0;
  const alpha = introFrame < 4
    ? introFrame / 4
    : introFrame > introTotalFrames - 5
      ? Math.max(0, (introTotalFrames - introFrame) / 5)
      : 1;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Sport-aware background
  if (sportContext === 'mlb') {
    drawMlbBackground(ctx);
  } else {
    drawNavyBackground(ctx);
  }

  const accent = sportContext === 'mlb' ? '#C41E3A' : (brand.accentColor || '#3C79B4');

  ctx.strokeStyle = `${accent}10`;
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const y = H * (0.18 + i * 0.14);
    ctx.beginPath();
    ctx.moveTo(W * 0.10, y);
    ctx.lineTo(W * 0.90, y);
    ctx.stroke();
  }

  // Hero logo — large, centered
  if (logo) {
    const zoomT = Math.min(1, progress * 3.5);
    const scale = 0.88 + 0.12 * easeOutCubic(zoomT);
    const logoAlpha = Math.min(1, progress * 4);
    ctx.globalAlpha = alpha * logoAlpha;
    const lw = W * 0.70 * scale;
    const lh = (logo.naturalHeight / logo.naturalWidth) * lw;
    ctx.drawImage(logo, (W - lw) / 2, H * 0.28 - lh / 2, lw, lh);
  }

  // Hero headline — use Generated Copy headline if available, else hookText
  const headText = headline || hookText || 'Explore Maximus Sports';
  const headFontSize = headText.length > 30 ? 56 : 68;
  const headFadeT = Math.min(1, Math.max(0, (progress - 0.15) * 4));
  const headSlide = (1 - easeOutCubic(headFadeT)) * 18;
  ctx.globalAlpha = alpha * headFadeT;
  ctx.font = `900 ${headFontSize}px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 4;

  const maxW = W * 0.82;
  const words = headText.split(' ');
  const headLines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxW && cur) { headLines.push(cur); cur = w; }
    else { cur = test; }
  }
  if (cur) headLines.push(cur);
  const lineH = headFontSize > 56 ? 80 : 66;
  const baseY = H * 0.48 + headSlide;
  const startY = baseY - (headLines.length - 1) * lineH / 2;
  for (let li = 0; li < headLines.length; li++) {
    ctx.fillText(headLines[li], W / 2, startY + li * lineH);
  }
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Subhead — use Generated Copy subhead if available
  const subText = subhead || (sportContext === 'mlb' ? 'Model-driven baseball intelligence' : 'Model-driven college basketball intelligence');
  const subFadeT = Math.min(1, Math.max(0, (progress - 0.28) * 4));
  const subSlide = (1 - easeOutCubic(subFadeT)) * 12;
  ctx.globalAlpha = alpha * subFadeT * 0.55;
  ctx.font = `400 26px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  const subBaseY = startY + (headLines.length - 1) * lineH + lineH * 0.8 + subSlide;
  ctx.fillText(subText, W / 2, subBaseY);

  // Accent divider
  const divT = Math.min(1, Math.max(0, (progress - 0.35) * 5));
  const divW = 100 * divT;
  ctx.globalAlpha = alpha * divT;
  ctx.fillStyle = accent;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect((W - divW) / 2, subBaseY + 40, divW, 2.5, 2);
  else { ctx.rect((W - divW) / 2, subBaseY + 40, divW, 2.5); }
  ctx.fill();

  ctx.restore();
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// ─── SECTION 1: Hook Boost Frame (Pattern Interrupt) ─────────────
// Strong early-retention hook treatment for the first 1.0–1.4s.
// Supports 3 animation variants: punch-zoom, slam-down, glitch-flash.

const HOOK_BOOST_TEXTS = {
  product:   ['Stop betting blind.', 'This changes everything.', 'Built different.', 'Your smartest sports scroll.'],
  betting:   ['This team keeps cashing.', 'Your edge starts here.', 'Before the line moves.', 'The spread says one thing.'],
  curiosity: ['Most fans miss this.', 'What smart bettors know.', 'Stop scrolling.', 'What your sportsbook won\'t show.'],
  fans:      ['Your season starts now.', 'Never miss another game.', 'This is for real fans.', 'Every stat. One tap.'],
  editorial: ['Sports intel. Redefined.', 'One platform. Total clarity.', 'Clean data. Clear edge.', 'Smarter. Faster. Done.'],
};

export const HOOK_ANIMATION_VARIANTS = ['punch-zoom', 'slam-down', 'glitch-flash'];

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
  animationVariant = 'punch-zoom',
  textColor = '#ffffff',
  accentColor,
}) {
  const progress = frameIndex / totalFrames;
  const accent = accentColor || brand.accentColor || '#3C79B4';

  ctx.save();

  // Background: video with strong dim or gradient
  if (video && video.videoWidth) {
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

    // Variant-specific background treatment
    if (animationVariant === 'punch-zoom') {
      const scale = 1.12 - 0.12 * Math.min(1, progress * 2.5);
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(scale, scale);
      ctx.translate(-W / 2, -H / 2);
      ctx.filter = 'blur(4px) brightness(0.50)';
      ctx.drawImage(video, dx, dy, dw, dh);
      ctx.filter = 'none';
      ctx.restore();
    } else if (animationVariant === 'slam-down') {
      ctx.filter = 'blur(6px) brightness(0.40) saturate(0.7)';
      ctx.drawImage(video, dx, dy, dw, dh);
      ctx.filter = 'none';
    } else {
      const flicker = frameIndex < 3 ? 0.3 + Math.random() * 0.3 : 0.45;
      ctx.filter = `blur(3px) brightness(${flicker})`;
      ctx.drawImage(video, dx, dy, dw, dh);
      ctx.filter = 'none';
    }
  } else {
    fillGradient(ctx, brand.gradientStart, brand.gradientEnd);
  }

  // Strong background dim overlay
  const fadeInFrames = 5;
  const fadeAlpha = Math.min(1, frameIndex / fadeInFrames);
  ctx.globalAlpha = fadeAlpha;

  const dimGrad = ctx.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, W * 0.75);
  dimGrad.addColorStop(0, 'rgba(0,0,0,0.10)');
  dimGrad.addColorStop(0.5, 'rgba(0,0,0,0.35)');
  dimGrad.addColorStop(1, 'rgba(0,0,0,0.70)');
  ctx.fillStyle = dimGrad;
  ctx.fillRect(0, 0, W, H);

  // Accent color vignette
  const accentVig = ctx.createRadialGradient(W / 2, H * 0.42, W * 0.1, W / 2, H * 0.42, W * 0.9);
  accentVig.addColorStop(0, `${accent}15`);
  accentVig.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = accentVig;
  ctx.fillRect(0, 0, W, H);

  // Hook text with variant-specific animation
  if (hookText) {
    let textAlpha = fadeAlpha;
    let textScale = 1;
    let textOffsetY = 0;
    const fadeOutStart = totalFrames - 6;

    if (animationVariant === 'punch-zoom') {
      const entryT = Math.min(1, progress * 4);
      textScale = 1.3 - 0.3 * easeOutBack(entryT);
      textAlpha = Math.min(1, progress * 5);
    } else if (animationVariant === 'slam-down') {
      const entryT = Math.min(1, progress * 3.5);
      textOffsetY = -120 * (1 - easeOutBounce(entryT));
      textAlpha = entryT;
    } else {
      const flashCycle = Math.sin(progress * Math.PI * 8);
      textAlpha = frameIndex < 4 ? Math.abs(flashCycle) * 0.8 + 0.2 : fadeAlpha;
    }

    if (frameIndex >= fadeOutStart) {
      textAlpha *= Math.max(0, 1 - (frameIndex - fadeOutStart) / 6);
    }

    ctx.save();
    ctx.globalAlpha = textAlpha;

    if (textScale !== 1) {
      ctx.translate(W / 2, H * 0.42 + textOffsetY);
      ctx.scale(textScale, textScale);
      ctx.translate(-W / 2, -(H * 0.42 + textOffsetY));
    }

    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 6;

    ctx.font = `900 72px ${FONT}`;
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const words = hookText.split(' ');
    const lines = [];
    let cur = '';
    for (const word of words) {
      const test = cur ? `${cur} ${word}` : word;
      if (ctx.measureText(test).width > W * 0.82 && cur) {
        lines.push(cur); cur = word;
      } else { cur = test; }
    }
    if (cur) lines.push(cur);

    const lineH = 88;
    const baseY = H * 0.42 + textOffsetY;
    const startY = baseY - (lines.length * lineH) / 2;
    for (let li = 0; li < lines.length; li++) {
      ctx.fillText(lines[li], W / 2, startY + li * lineH);
    }

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.restore();
  }

  // Accent bar below text
  const barProgress = Math.min(1, progress * 3);
  const barWidth = W * 0.28 * barProgress;
  ctx.fillStyle = accent;
  ctx.globalAlpha = fadeAlpha * 0.9;
  ctx.beginPath();
  roundedRect(ctx, (W - barWidth) / 2, H * 0.56, barWidth, 4, 2);
  ctx.fill();

  // Fade out entire frame at the end
  const fadeOutStart = totalFrames - 5;
  if (frameIndex >= fadeOutStart) {
    const fadeOut = 1 - (frameIndex - fadeOutStart) / 5;
    ctx.globalAlpha = Math.max(0, fadeOut);
  }

  ctx.restore();
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeOutBounce(t) {
  if (t < 1 / 2.75) return 7.5625 * t * t;
  if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
  if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
  return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
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

// ─── SECTION 5: Premium Maximus-branded CTA Card ─────────────────
// Deep navy gradient with centered robot hero, glow effects,
// data-chip accents, and animated CTA pill.

export function drawOutroCard(ctx, logo, { cta, brand, templateId, robotImage, outroFrame, outroTotalFrames, sportContext }, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;

  const progress = outroTotalFrames > 0 ? (outroFrame || 0) / outroTotalFrames : 0;
  const accent = sportContext === 'mlb' ? '#C41E3A' : (brand.accentColor || '#3C79B4');

  // Sport-aware background
  if (sportContext === 'mlb') {
    drawMlbBackground(ctx);
  } else {
    drawNavyBackground(ctx);
  }

  // Decorative faint lines
  ctx.strokeStyle = `${accent}12`;
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const y = H * (0.18 + i * 0.14);
    ctx.beginPath();
    ctx.moveTo(W * 0.10, y);
    ctx.lineTo(W * 0.90, y);
    ctx.stroke();
  }

  // Glassy side panels
  const panelAlpha = 0.04 + Math.sin(progress * Math.PI * 2) * 0.01;
  ctx.fillStyle = `rgba(255,255,255,${panelAlpha})`;
  ctx.beginPath();
  roundedRect(ctx, W * 0.04, H * 0.18, W * 0.10, H * 0.16, 8);
  ctx.fill();
  ctx.beginPath();
  roundedRect(ctx, W * 0.86, H * 0.18, W * 0.10, H * 0.16, 8);
  ctx.fill();
  ctx.strokeStyle = `${accent}18`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  roundedRect(ctx, W * 0.04, H * 0.18, W * 0.10, H * 0.16, 8);
  ctx.stroke();
  ctx.beginPath();
  roundedRect(ctx, W * 0.86, H * 0.18, W * 0.10, H * 0.16, 8);
  ctx.stroke();

  // Robot mascot — LARGE hero visual, ~45% frame width
  // Fallback chain: robotImage → logo as large hero → wordmark text
  const heroImage = robotImage || logo;
  if (heroImage) {
    const robotEntryT = Math.min(1, Math.max(0, progress * 3.2));
    const bounceY = robotEntryT < 1 ? -60 * (1 - easeOutBounce(robotEntryT)) : 0;
    const floatY = robotEntryT >= 1 ? Math.sin(progress * Math.PI * 3) * -4 : 0;
    const rAlpha = Math.min(1, robotEntryT);

    ctx.globalAlpha = alpha * rAlpha;

    const rw = robotImage ? W * 0.45 : W * 0.55;
    const rh = (heroImage.naturalHeight / heroImage.naturalWidth) * rw;
    const rx = (W - rw) / 2;
    const ry = H * 0.22 + bounceY + floatY;

    const auraSize = rw * 0.8;
    const auraGlow = ctx.createRadialGradient(rx + rw / 2, ry + rh / 2, 0, rx + rw / 2, ry + rh / 2, auraSize);
    const glowPulse = 0.15 + Math.sin(progress * Math.PI * 4) * 0.06;
    auraGlow.addColorStop(0, `${accent}${Math.round(glowPulse * 255).toString(16).padStart(2, '0')}`);
    auraGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = auraGlow;
    ctx.fillRect(rx - auraSize, ry - auraSize / 2, rw + auraSize * 2, rh + auraSize);

    ctx.drawImage(heroImage, rx, ry, rw, rh);
  } else {
    // Final fallback: render "MAXIMUS SPORTS" wordmark
    ctx.globalAlpha = alpha;
    ctx.font = `800 52px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('MAXIMUS SPORTS', W / 2, H * 0.36);
  }

  // Headline below robot
  const headlineEntryT = Math.min(1, Math.max(0, (progress - 0.18) * 4));
  const headSlide = (1 - headlineEntryT) * 12;
  ctx.globalAlpha = alpha * headlineEntryT;
  ctx.font = `700 44px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Explore Maximus Sports', W / 2, H * 0.60 + headSlide);

  // Subheadline
  ctx.font = `400 22px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText('Model-driven college basketball intelligence', W / 2, H * 0.65 + headSlide);

  // Microcopy
  const microT = Math.min(1, Math.max(0, (progress - 0.30) * 4));
  ctx.globalAlpha = alpha * microT * 0.4;
  ctx.font = `400 18px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Smarter picks, bracket intel, and daily signals', W / 2, H * 0.70 + headSlide);

  // CTA pill — prominent, clear
  const ctaEntryT = Math.min(1, Math.max(0, (progress - 0.38) * 3));
  const ctaSlide = (1 - ctaEntryT) * 16;
  ctx.globalAlpha = alpha * ctaEntryT;

  const ctaText = 'maximussports.ai';
  ctx.font = `700 28px ${FONT}`;
  const ctaMetrics = ctx.measureText(ctaText);
  const pillW = ctaMetrics.width + 64;
  const pillH = 58;
  const pillX = (W - pillW) / 2;
  const pillY = H * 0.77 + ctaSlide;
  const pillR = 29;

  const pillGrad = ctx.createLinearGradient(pillX, pillY, pillX + pillW, pillY + pillH);
  pillGrad.addColorStop(0, accent);
  pillGrad.addColorStop(1, shadeColor(accent, -20));
  ctx.fillStyle = pillGrad;
  ctx.beginPath();
  roundedRect(ctx, pillX, pillY, pillW, pillH, pillR);
  ctx.fill();

  ctx.shadowColor = `${accent}66`;
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 4;
  ctx.beginPath();
  roundedRect(ctx, pillX, pillY, pillW, pillH, pillR);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.font = `700 28px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ctaText, W / 2, pillY + pillH / 2);

  // Logo at bottom
  if (logo) {
    ctx.globalAlpha = alpha * ctaEntryT * 0.5;
    const lw = 50;
    const lh = (logo.naturalHeight / logo.naturalWidth) * lw;
    ctx.drawImage(logo, (W - lw) / 2, H * 0.89, lw, lh);
  }

  ctx.restore();
}

function shadeColor(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + percent));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + percent));
  const b = Math.min(255, Math.max(0, (num & 0x0000FF) + percent));
  return `#${(0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1)}`;
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

  const { templateId, animProgress, textColor } = opts;

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

  const bgGrad = opts.bgColor
    ? bgColorToGlassGrad(ctx, boxX, boxY, boxW, boxH, opts.bgColor)
    : templateId
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
  ctx.fillStyle = textColor || '#ffffff';
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

// ─── SECTION 3+4: Beat overlay / support chip with glass pill ─────
// No bullet dots — clean subordinate chip. Smaller font, lighter bg.
export function drawBeatOverlay(ctx, text, yCenter, fontSize, lineHeight, alpha = 1, accentColor = '#3C79B4', opts = {}) {
  if (!text || alpha <= 0) return;

  const { stepNum, templateId, animProgress, textColor } = opts;

  const chipFontSize = stepNum != null ? fontSize : Math.round(fontSize * 0.88);
  const chipWeight = stepNum != null ? '600' : '500';
  const bgOpacity = stepNum != null ? 0.92 : 0.82;

  const slideUp = animProgress != null ? (1 - Math.min(1, animProgress / 0.25)) * 12 : 0;
  const microBounce = animProgress != null && animProgress > 0.25 && animProgress < 0.5
    ? Math.sin((animProgress - 0.25) / 0.25 * Math.PI) * 0.025
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
  const padding = stepNum != null ? 20 : 16;

  ctx.font = `${chipWeight} ${chipFontSize}px ${FONT}`;
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

  const textH = lines.length * chipFontSize * lineHeight;
  const boxH = textH + padding * 2;
  const textW = Math.max(...lines.map(l => ctx.measureText(l).width));
  const boxW = Math.min(maxWidth, textW + padding * 2.5);
  const boxX = (W - boxW) / 2;
  const boxY = adjustedY - boxH / 2;
  const radius = 12;

  const bgGrad = opts.bgColor
    ? bgColorToGlassGrad(ctx, boxX, boxY, boxW, boxH, opts.bgColor, bgOpacity)
    : templateId
      ? getGlassGradient(ctx, boxX, boxY, boxW, boxH, templateId)
      : (() => {
          const g = ctx.createLinearGradient(boxX, boxY, boxX + boxW, boxY + boxH);
          g.addColorStop(0, `rgba(60,121,180,${bgOpacity})`);
          g.addColorStop(1, `rgba(40,80,140,${bgOpacity})`);
          return g;
        })();
  ctx.fillStyle = bgGrad;
  ctx.beginPath();
  roundedRect(ctx, boxX, boxY, boxW, boxH, radius);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  roundedRect(ctx, boxX, boxY, boxW, boxH, radius);
  ctx.stroke();

  ctx.shadowColor = 'rgba(0,0,0,0.30)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;

  // Step number for walkthrough mode only — no bullet dots otherwise
  if (stepNum != null) {
    const dotR = 5;
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
  }

  ctx.shadowColor = 'rgba(0,0,0,0.30)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  ctx.font = `${chipWeight} ${chipFontSize}px ${FONT}`;
  ctx.letterSpacing = '0.02em';
  ctx.fillStyle = textColor || '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  let drawY = boxY + padding;
  for (const line of lines) {
    ctx.fillText(line, W / 2, drawY);
    drawY += chipFontSize * lineHeight;
  }

  ctx.letterSpacing = '0px';
  ctx.restore();
}

// ─── stat callout overlay (stats proof template) ─────────────────
export function drawStatOverlay(ctx, text, yCenter, fontSize, lineHeight, alpha = 1, accentColor = '#e67e22', opts = {}) {
  if (!text || alpha <= 0) return;

  const { animProgress, textColor } = opts;
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

  const bgGrad = opts.bgColor
    ? bgColorToGlassGrad(ctx, boxX, boxY, boxW, boxH, opts.bgColor)
    : getGlassGradient(ctx, boxX, boxY, boxW, boxH, 'stats-proof');
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
  const baseTextColor = textColor || '#ffffff';
  for (let i = 0; i < lines.length; i++) {
    const isNumber = /^\d/.test(lines[i].trim());
    ctx.fillStyle = baseTextColor;
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
