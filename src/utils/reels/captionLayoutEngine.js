/**
 * Smart Caption Layout Engine
 *
 * Manages caption placement spatially and temporally to prevent
 * overlapping, enforce safe zones, and produce clean sequencing.
 *
 * Designed for 1080×1920 (9:16) vertical video output.
 */

const W = 1080;
const H = 1920;

// ─── Placement Zones ─────────────────────────────────────────────

export const ZONES = {
  TOP_LEFT:      { id: 'TOP_LEFT',      x: W * 0.04, y: H * 0.08, w: W * 0.44, h: H * 0.12 },
  TOP_CENTER:    { id: 'TOP_CENTER',    x: W * 0.10, y: H * 0.08, w: W * 0.80, h: H * 0.12 },
  TOP_RIGHT:     { id: 'TOP_RIGHT',     x: W * 0.52, y: H * 0.08, w: W * 0.44, h: H * 0.12 },
  MID_LEFT:      { id: 'MID_LEFT',      x: W * 0.04, y: H * 0.28, w: W * 0.44, h: H * 0.12 },
  MID_RIGHT:     { id: 'MID_RIGHT',     x: W * 0.52, y: H * 0.28, w: W * 0.44, h: H * 0.12 },
  BOTTOM_LEFT:   { id: 'BOTTOM_LEFT',   x: W * 0.04, y: H * 0.68, w: W * 0.44, h: H * 0.12 },
  BOTTOM_CENTER: { id: 'BOTTOM_CENTER', x: W * 0.10, y: H * 0.68, w: W * 0.80, h: H * 0.12 },
  BOTTOM_RIGHT:  { id: 'BOTTOM_RIGHT',  x: W * 0.52, y: H * 0.68, w: W * 0.44, h: H * 0.12 },
};

const ZONE_FALLBACK_ORDER = [
  'TOP_CENTER',
  'MID_LEFT',
  'MID_RIGHT',
  'TOP_LEFT',
  'TOP_RIGHT',
  'BOTTOM_CENTER',
  'BOTTOM_LEFT',
  'BOTTOM_RIGHT',
];

const ZONE_ROTATION_CYCLE = [
  'TOP_CENTER',
  'MID_LEFT',
  'MID_RIGHT',
  'TOP_RIGHT',
  'BOTTOM_CENTER',
  'TOP_LEFT',
  'MID_RIGHT',
  'TOP_CENTER',
];

// ─── Timing Constants ────────────────────────────────────────────

export const MIN_CAPTION_GAP = 0.6;
export const PREFERRED_CAPTION_GAP = 1.4;
export const MAX_CAPTION_GAP = 3.5;
export const MAX_ACTIVE_CAPTIONS = 2;

// ─── Animation Constants ─────────────────────────────────────────

export const CAPTION_FADE_IN_MS = 200;
export const CAPTION_FADE_OUT_MS = 150;
export const CAPTION_SLIDE_PX = 8;

// ─── Caption Role Pacing ─────────────────────────────────────────

export const CAPTION_ROLES = {
  hook:       { priority: 10, preferredZones: ['TOP_CENTER'], minDuration: 0.8, maxDuration: 1.4 },
  insight:    { priority: 7,  preferredZones: ['TOP_CENTER', 'MID_LEFT'], minDuration: 1.5, maxDuration: 3.0 },
  data:       { priority: 8,  preferredZones: ['MID_LEFT', 'MID_RIGHT'], minDuration: 1.8, maxDuration: 3.5 },
  curiosity:  { priority: 6,  preferredZones: ['TOP_CENTER', 'TOP_LEFT'], minDuration: 1.4, maxDuration: 2.8 },
  feature:    { priority: 5,  preferredZones: ['MID_LEFT', 'TOP_CENTER'], minDuration: 1.5, maxDuration: 2.5 },
  cta:        { priority: 9,  preferredZones: ['BOTTOM_CENTER'], minDuration: 2.0, maxDuration: 3.0 },
};

export const STRUCTURED_PACING_ORDER = ['hook', 'insight', 'data', 'curiosity', 'feature', 'cta'];

// ─── Safe Zone Exclusions ────────────────────────────────────────

export function buildExclusions(sceneMetadata = {}) {
  const exclusions = [];

  if (sceneMetadata.ctaActive) {
    exclusions.push({ x: 0, y: H * 0.85, w: W, h: H * 0.15, label: 'cta-footer' });
  }

  if (sceneMetadata.mascotActive) {
    exclusions.push({ x: W * 0.30, y: H * 0.35, w: W * 0.40, h: H * 0.35, label: 'mascot-hero' });
  }

  if (sceneMetadata.scoreBug) {
    exclusions.push({ x: 0, y: 0, w: W, h: H * 0.08, label: 'score-bug' });
  }

  if (sceneMetadata.statOverlay) {
    exclusions.push({ x: W * 0.05, y: H * 0.60, w: W * 0.90, h: H * 0.20, label: 'stat-overlay' });
  }

  if (sceneMetadata.logoArea) {
    const la = sceneMetadata.logoArea;
    exclusions.push({ x: la.x, y: la.y, w: la.w, h: la.h, label: 'logo' });
  }

  if (sceneMetadata.lowerThird) {
    exclusions.push({ x: 0, y: H * 0.75, w: W, h: H * 0.25, label: 'lower-third' });
  }

  return exclusions;
}

// ─── Layout State Manager ────────────────────────────────────────

export class CaptionLayoutState {
  constructor() {
    this.activeCaptions = [];
    this._debug = false;
  }

  enableDebug() { this._debug = true; }

  addCaption(caption) {
    this.activeCaptions.push({ ...caption });
  }

  removeExpired(currentTime) {
    this.activeCaptions = this.activeCaptions.filter(c => c.endTime > currentTime);
  }

  getActiveAt(time) {
    return this.activeCaptions.filter(c => c.startTime <= time && c.endTime > time);
  }

  getActiveCount(time) {
    return this.getActiveAt(time).length;
  }

  reset() {
    this.activeCaptions = [];
  }
}

// ─── Collision Detection ─────────────────────────────────────────

export function rectsOverlap(a, b) {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

function captionOverlapsAny(rect, activeCaptions) {
  return activeCaptions.some(c => rectsOverlap(rect, c));
}

function zoneOverlapsExclusions(zone, exclusions) {
  return exclusions.some(ex => rectsOverlap(zone, ex));
}

// ─── Zone Selection ──────────────────────────────────────────────

export function findSafeZone(preferredZones, activeCaptions, exclusions = [], currentTime = 0, lastUsedZone = null) {
  const activeRects = activeCaptions.filter(c => c.startTime <= currentTime && c.endTime > currentTime);

  // If we have a last-used zone, try rotation first for visual variety
  if (lastUsedZone) {
    const rotationStart = ZONE_ROTATION_CYCLE.indexOf(lastUsedZone);
    if (rotationStart >= 0) {
      for (let offset = 1; offset <= ZONE_ROTATION_CYCLE.length; offset++) {
        const zoneName = ZONE_ROTATION_CYCLE[(rotationStart + offset) % ZONE_ROTATION_CYCLE.length];
        const zone = ZONES[zoneName];
        if (zone && !captionOverlapsAny(zone, activeRects) && !zoneOverlapsExclusions(zone, exclusions)) {
          return { ...zone };
        }
      }
    }
  }

  for (const zoneName of preferredZones) {
    const zone = ZONES[zoneName];
    if (!zone) continue;
    if (!captionOverlapsAny(zone, activeRects) && !zoneOverlapsExclusions(zone, exclusions)) {
      return { ...zone };
    }
  }

  for (const zoneName of ZONE_FALLBACK_ORDER) {
    const zone = ZONES[zoneName];
    if (!captionOverlapsAny(zone, activeRects) && !zoneOverlapsExclusions(zone, exclusions)) {
      return { ...zone };
    }
  }

  return { ...ZONES.TOP_CENTER };
}

// ─── Caption Duration Scaling ────────────────────────────────────

export function scaleDuration(text, role) {
  const charCount = (text || '').length;
  const roleConfig = CAPTION_ROLES[role] || CAPTION_ROLES.insight;
  const readTimeS = Math.max(roleConfig.minDuration, charCount * 0.045);
  return Math.min(readTimeS, roleConfig.maxDuration);
}

// ─── Temporal Spacing ────────────────────────────────────────────

export function enforceMinGap(proposedStart, layoutState, minGap = MIN_CAPTION_GAP) {
  let delayed = proposedStart;
  for (const caption of layoutState.activeCaptions) {
    const gapAfter = delayed - caption.endTime;
    if (gapAfter >= 0 && gapAfter < minGap) {
      delayed = caption.endTime + minGap;
    }
  }
  return delayed;
}

export function enforceMaxActiveCaptions(proposedStart, layoutState, maxActive = MAX_ACTIVE_CAPTIONS) {
  let delayed = proposedStart;
  const sorted = [...layoutState.activeCaptions].sort((a, b) => a.endTime - b.endTime);

  while (layoutState.getActiveCount(delayed) >= maxActive) {
    const nextEnd = sorted.find(c => c.endTime > delayed);
    if (nextEnd) {
      delayed = nextEnd.endTime + MIN_CAPTION_GAP;
    } else {
      break;
    }
  }

  return delayed;
}

// ─── Animation Easing ────────────────────────────────────────────

export function getCaptionAlpha(currentTime, startTime, endTime, fps = 30) {
  const fadeInS = CAPTION_FADE_IN_MS / 1000;
  const fadeOutS = CAPTION_FADE_OUT_MS / 1000;
  const elapsed = currentTime - startTime;
  const remaining = endTime - currentTime;

  if (elapsed < fadeInS) return elapsed / fadeInS;
  if (remaining < fadeOutS) return Math.max(0, remaining / fadeOutS);
  return 1;
}

export function getCaptionSlideOffset(currentTime, startTime) {
  const fadeInS = CAPTION_FADE_IN_MS / 1000;
  const elapsed = currentTime - startTime;
  if (elapsed >= fadeInS) return 0;
  return CAPTION_SLIDE_PX * (1 - elapsed / fadeInS);
}

// ─── Full Sequence Planner ───────────────────────────────────────

export function planCaptionSequence(captions, totalDuration, sceneMetadata = {}) {
  const layoutState = new CaptionLayoutState();
  const exclusions = buildExclusions(sceneMetadata);
  const planned = [];
  let lastUsedZone = null;

  const sorted = captions.map((c, i) => ({
    ...c,
    role: c.role || STRUCTURED_PACING_ORDER[i % STRUCTURED_PACING_ORDER.length],
    originalIndex: i,
  }));

  let cursor = 0;

  for (const caption of sorted) {
    const role = CAPTION_ROLES[caption.role] || CAPTION_ROLES.insight;
    const duration = scaleDuration(caption.text, caption.role);

    let start = caption.proposedStart != null ? caption.proposedStart : cursor;
    start = enforceMinGap(start, layoutState, PREFERRED_CAPTION_GAP);
    start = enforceMaxActiveCaptions(start, layoutState);

    if (start + duration > totalDuration && caption.role !== 'cta') {
      continue;
    }

    const zone = findSafeZone(role.preferredZones, layoutState.activeCaptions, exclusions, start, lastUsedZone);
    lastUsedZone = zone.id;

    const entry = {
      id: caption.id || `caption_${caption.originalIndex}`,
      text: caption.text,
      role: caption.role,
      startTime: parseFloat(start.toFixed(3)),
      endTime: parseFloat((start + duration).toFixed(3)),
      x: zone.x,
      y: zone.y,
      width: zone.w,
      height: zone.h,
      zone: zone.id,
      priority: role.priority,
    };

    layoutState.addCaption(entry);
    planned.push(entry);

    const gapMultiplier = (zone.w > W * 0.6) ? 1.3 : 1.0;
    cursor = start + duration + PREFERRED_CAPTION_GAP * gapMultiplier;
  }

  return planned;
}

// ─── Debug Renderer ──────────────────────────────────────────────

export function drawDebugOverlay(ctx, layoutState, currentTime, exclusions = []) {
  ctx.save();
  ctx.globalAlpha = 0.3;

  for (const zoneName of Object.keys(ZONES)) {
    const z = ZONES[zoneName];
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(z.x, z.y, z.w, z.h);

    ctx.font = '12px monospace';
    ctx.fillStyle = '#00ff88';
    ctx.textAlign = 'left';
    ctx.fillText(zoneName, z.x + 4, z.y + 14);
  }

  ctx.setLineDash([]);

  for (const ex of exclusions) {
    ctx.fillStyle = 'rgba(255, 0, 0, 0.15)';
    ctx.fillRect(ex.x, ex.y, ex.w, ex.h);
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 1;
    ctx.strokeRect(ex.x, ex.y, ex.w, ex.h);
    if (ex.label) {
      ctx.font = '10px monospace';
      ctx.fillStyle = '#ff4444';
      ctx.fillText(ex.label, ex.x + 4, ex.y + 12);
    }
  }

  const active = layoutState.getActiveAt(currentTime);
  for (const c of active) {
    ctx.fillStyle = 'rgba(46, 229, 157, 0.12)';
    ctx.fillRect(c.x, c.y, c.width, c.height);
    ctx.strokeStyle = '#2ee59d';
    ctx.lineWidth = 2;
    ctx.strokeRect(c.x, c.y, c.width, c.height);
  }

  ctx.restore();
}
