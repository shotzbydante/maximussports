/**
 * Multi-segment edit plan builder.
 *
 * Takes full-video activity scores from the analysis worker and
 * produces a condensed edit plan: the best moments across the clip,
 * assembled in chronological order with per-segment speed assignment.
 *
 * The render engine uses this plan to produce a condensed reel
 * from multiple source ranges, rather than a single trim window.
 */

import { computeProportionalTrimLength, computeBeatCount } from '../../../../utils/reels/smartTrim';

const ACTIVITY_HIGH = 0.015;
const ACTIVITY_LOW = 0.005;
const MIN_SEGMENT_S = 0.8;

/**
 * @param {number[]} scores       Frame-diff scores from the analysis worker
 * @param {number}   sampleInterval  Seconds between samples (e.g. 0.5)
 * @param {number}   duration     Full source clip duration in seconds
 * @param {object}   [opts]
 * @param {number}   [opts.targetDuration=12]
 * @param {number}   [opts.fps=30]
 * @param {number}   [opts.beatCount=3]
 * @returns {{ segments, totalOutputDuration, totalOutputFrames, segmentCount, beatPositions }}
 */
export function buildEditPlan(scores, sampleInterval, duration, opts = {}) {
  const proportionalTarget = computeProportionalTrimLength(duration);
  const proportionalBeats = computeBeatCount(proportionalTarget);

  const {
    targetDuration = proportionalTarget,
    fps = 30,
    beatCount = proportionalBeats,
  } = opts;

  const maxTarget = Math.min(24, targetDuration * 1.25);

  if (!scores || scores.length < 3) {
    return fallbackPlan(duration, targetDuration, fps);
  }

  const classified = classifySamples(scores);
  const raw = buildSegments(classified, sampleInterval);
  const selected = selectSegments(raw, Math.min(targetDuration, maxTarget), duration);
  const withSpeed = assignSpeed(selected);
  const plan = computeTimeline(withSpeed, fps);
  plan.beatPositions = findBeatPositions(plan.segments, beatCount);
  return plan;
}

// ─── Classification ──────────────────────────────────────────────

function classifySamples(scores) {
  return scores.map((score, i) => {
    let type = 'idle';
    if (score >= ACTIVITY_HIGH) type = 'hero';
    else if (score >= ACTIVITY_LOW) type = 'normal';
    return { index: i, score, type };
  });
}

// ─── Segment building ────────────────────────────────────────────

function buildSegments(classified, sampleInterval) {
  const segments = [];
  let cur = null;

  for (const sample of classified) {
    if (!cur || sample.type !== cur.type) {
      if (cur) segments.push(cur);
      cur = { type: sample.type, startIdx: sample.index, endIdx: sample.index, scores: [sample.score] };
    } else {
      cur.endIdx = sample.index;
      cur.scores.push(sample.score);
    }
  }
  if (cur) segments.push(cur);

  return segments
    .map(seg => {
      const startS = seg.startIdx * sampleInterval;
      const endS = (seg.endIdx + 1) * sampleInterval;
      const avg = seg.scores.reduce((a, b) => a + b, 0) / seg.scores.length;
      return {
        sourceStart: startS,
        sourceEnd: endS,
        sourceDuration: endS - startS,
        type: seg.type,
        activity: avg,
        maxActivity: Math.max(...seg.scores),
      };
    })
    .filter(seg => seg.sourceDuration >= MIN_SEGMENT_S);
}

// ─── Segment selection ───────────────────────────────────────────

function selectSegments(segments, target, total) {
  const scored = segments.map((seg, i) => {
    let priority = seg.activity * 40;
    if (seg.type === 'hero') priority += 30;
    else if (seg.type === 'normal') priority += 15;
    else priority += 2;

    const pos = seg.sourceStart / total;
    if (pos < 0.1) priority += 8;
    if (pos > 0.85) priority += 5;
    if (seg.sourceDuration >= 2 && seg.sourceDuration <= 4.5) priority += 10;
    else if (seg.sourceDuration > 7) priority -= 5;

    return { ...seg, priority, originalIndex: i };
  });

  scored.sort((a, b) => b.priority - a.priority);

  const selected = [];
  let accum = 0;
  for (const seg of scored) {
    if (accum >= target) break;
    const remaining = target - accum;
    const dur = Math.min(seg.sourceDuration, remaining + 1.5);
    selected.push({ ...seg, sourceEnd: seg.sourceStart + dur, sourceDuration: dur });
    accum += dur;
  }

  selected.sort((a, b) => a.sourceStart - b.sourceStart);
  return selected;
}

// ─── Speed assignment ────────────────────────────────────────────

function assignSpeed(segments) {
  return segments.map(seg => {
    let speed = 1.0;
    if (seg.type === 'normal') speed = 1.12;
    else if (seg.type === 'idle') speed = 1.28;
    return { ...seg, speed };
  });
}

// ─── Output timeline ─────────────────────────────────────────────

function computeTimeline(segments, fps) {
  let t = 0;
  const mapped = segments.map(seg => {
    const outDur = seg.sourceDuration / seg.speed;
    const outFrames = Math.max(1, Math.round(outDur * fps));
    const r = { ...seg, outputStart: t, outputEnd: t + outDur, outputDuration: outDur, outputFrames: outFrames };
    t += outDur;
    return r;
  });
  return {
    segments: mapped,
    totalOutputDuration: t,
    totalOutputFrames: mapped.reduce((s, m) => s + m.outputFrames, 0),
    segmentCount: mapped.length,
  };
}

// ─── Beat positions ──────────────────────────────────────────────

function findBeatPositions(segments, count) {
  if (!segments.length) return [];

  const heroes = segments
    .filter(s => s.type === 'hero' || s.activity > ACTIVITY_LOW)
    .sort((a, b) => b.maxActivity - a.maxActivity)
    .slice(0, count);

  heroes.sort((a, b) => a.outputStart - b.outputStart);

  if (heroes.length >= count) {
    return heroes.map(s => ({
      outputTime: s.outputStart + s.outputDuration * 0.3,
      sourceTime: s.sourceStart + s.sourceDuration * 0.3,
    }));
  }

  const total = segments[segments.length - 1]?.outputEnd || 1;
  return Array.from({ length: count }, (_, i) => {
    const time = (total * (i + 0.5)) / count;
    return { outputTime: time, sourceTime: interpolateSource(segments, time) };
  });
}

function interpolateSource(segments, outputTime) {
  for (const seg of segments) {
    if (outputTime >= seg.outputStart && outputTime <= seg.outputEnd) {
      const pct = (outputTime - seg.outputStart) / seg.outputDuration;
      return seg.sourceStart + pct * seg.sourceDuration;
    }
  }
  return segments[0]?.sourceStart || 0;
}

// ─── Fallback ────────────────────────────────────────────────────

function fallbackPlan(duration, target, fps) {
  const dur = Math.min(duration, target);
  const frames = Math.max(1, Math.round(dur * fps));
  return {
    segments: [{
      sourceStart: 0, sourceEnd: dur, sourceDuration: dur,
      speed: 1.0,
      outputStart: 0, outputEnd: dur, outputDuration: dur, outputFrames: frames,
      type: 'normal', activity: 0.5, maxActivity: 0.5,
    }],
    totalOutputDuration: dur,
    totalOutputFrames: frames,
    segmentCount: 1,
    beatPositions: [],
  };
}

/**
 * Convert edit plan beat positions to {startPct, endPct} ranges
 * compatible with the overlay system.
 */
export function editPlanBeatTimings(editPlan, numBeats = 3) {
  if (!editPlan?.beatPositions?.length || !editPlan.totalOutputDuration) return null;
  const total = editPlan.totalOutputDuration;
  const beatDurPct = 0.18;
  return editPlan.beatPositions.slice(0, numBeats).map(bp => {
    const center = bp.outputTime / total;
    return {
      startPct: Math.max(0.01, center - beatDurPct / 2),
      endPct: Math.min(0.99, center + beatDurPct / 2),
    };
  });
}
