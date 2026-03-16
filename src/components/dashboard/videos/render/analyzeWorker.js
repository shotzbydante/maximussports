/**
 * Web Worker for video frame analysis.
 *
 * Receives raw pixel data (ArrayBuffers) from the main thread,
 * computes frame-to-frame diff scores, finds the optimal trim window,
 * identifies activity peaks for beat placement, and classifies
 * segments for the multi-segment edit plan.
 *
 * Protocol:
 *   Main → Worker:  { type: 'analyze', buffers, width, height, sampleInterval, duration }
 *   Worker → Main:  { type: 'progress', value }
 *   Worker → Main:  { type: 'result', scores, trimStart, trimEnd, beatPeaks, segments, fullDuration }
 */

const TRIM_RATIO = 0.18;
const TRIM_MIN_S = 8;
const TRIM_MAX_S = 24;
const MIN_PEAK_DISTANCE = 4;
const ACTIVITY_HIGH = 0.015;
const ACTIVITY_LOW = 0.005;
const MIN_SEGMENT_SAMPLES = 2;

function clampTrim(value) {
  return Math.max(TRIM_MIN_S, Math.min(TRIM_MAX_S, value));
}

function proportionalWindow(duration) {
  const base = clampTrim(duration * TRIM_RATIO);
  return { min: base, max: clampTrim(base * 1.25) };
}

self.onmessage = function (e) {
  const { type } = e.data;

  if (type === 'analyze') {
    const { buffers, width, height, sampleInterval, duration } = e.data;
    const frames = buffers.map(b => new Uint8ClampedArray(b));
    const pixelCount = width * height;

    const scores = [];

    for (let i = 0; i < frames.length; i++) {
      if (i === 0) {
        scores.push(0);
      } else {
        const prev = frames[i - 1];
        const curr = frames[i];
        let diff = 0;
        const len = curr.length;
        for (let p = 0; p < len; p += 4) {
          diff += Math.abs(curr[p] - prev[p]);
          diff += Math.abs(curr[p + 1] - prev[p + 1]);
          diff += Math.abs(curr[p + 2] - prev[p + 2]);
        }
        scores.push(diff / (pixelCount * 3 * 255));
      }

      if (i % 10 === 0) {
        self.postMessage({ type: 'progress', value: i / frames.length });
      }
    }

    let trimStart = 0;
    let trimEnd = duration;

    const { min: winMin, max: winMax } = proportionalWindow(duration);
    if (duration > winMin) {
      const result = findBestWindow(scores, sampleInterval, duration, winMin, winMax);
      trimStart = result.trimStart;
      trimEnd = result.trimEnd;
    }

    const beatPeaks = findActivityPeaks(scores, sampleInterval, trimStart, trimEnd);
    const segments = classifySegments(scores, sampleInterval);

    self.postMessage({
      type: 'result',
      scores,
      trimStart,
      trimEnd,
      beatPeaks,
      segments,
      fullDuration: duration,
    });
  }
};

function findBestWindow(scores, sampleInterval, duration, targetMin = 8, targetMax = 24) {
  const windowSamples = Math.round(targetMin / sampleInterval);
  const maxWindowSamples = Math.round(targetMax / sampleInterval);

  let bestScore = -1;
  let bestStart = 0;
  let bestLen = windowSamples;

  for (let wLen = windowSamples; wLen <= maxWindowSamples; wLen++) {
    for (let start = 0; start <= scores.length - wLen; start++) {
      let sum = 0;
      for (let j = start; j < start + wLen; j++) {
        sum += scores[j];
      }
      const avg = sum / wLen;
      if (avg > bestScore) {
        bestScore = avg;
        bestStart = start;
        bestLen = wLen;
      }
    }
  }

  return {
    trimStart: parseFloat((bestStart * sampleInterval).toFixed(1)),
    trimEnd: parseFloat(Math.min((bestStart + bestLen) * sampleInterval, duration).toFixed(1)),
  };
}

function findActivityPeaks(scores, sampleInterval, trimStart, trimEnd) {
  const startIdx = Math.floor(trimStart / sampleInterval);
  const endIdx = Math.ceil(trimEnd / sampleInterval);
  const window = scores.slice(startIdx, endIdx);

  if (window.length < 3) return [];

  // Wider smoothing kernel for more stable peak detection
  const smoothed = window.map((_, i) => {
    const lo = Math.max(0, i - 2);
    const hi = Math.min(window.length, i + 3);
    let sum = 0;
    for (let j = lo; j < hi; j++) sum += window[j];
    return sum / (hi - lo);
  });

  // Compute a weighted score that boosts scene cuts (large jumps) and
  // sustained camera motion (high average in a local neighborhood)
  const weighted = smoothed.map((s, i) => {
    const raw = window[i];
    const prev = i > 0 ? window[i - 1] : raw;
    const jump = Math.abs(raw - prev);
    const sceneCutBonus = jump > 0.02 ? jump * 2.5 : 0;
    const lo = Math.max(0, i - 2);
    const hi = Math.min(window.length, i + 3);
    let localSum = 0;
    for (let j = lo; j < hi; j++) localSum += window[j];
    const localAvg = localSum / (hi - lo);
    const motionBonus = localAvg > ACTIVITY_HIGH ? localAvg * 0.8 : 0;
    return s + sceneCutBonus + motionBonus;
  });

  const peaks = [];
  for (let i = 1; i < weighted.length - 1; i++) {
    if (weighted[i] > weighted[i - 1] && weighted[i] >= weighted[i + 1]) {
      peaks.push({ idx: i, score: weighted[i] });
    }
  }

  peaks.sort((a, b) => b.score - a.score);

  const trimDuration = trimEnd - trimStart;
  const maxBeats = trimDuration > 16 ? 6 : trimDuration > 10 ? 5 : 4;

  const selected = [];
  for (const peak of peaks) {
    if (selected.length >= maxBeats) break;
    const tooClose = selected.some(s => Math.abs(s.idx - peak.idx) < MIN_PEAK_DISTANCE);
    if (!tooClose) {
      selected.push(peak);
    }
  }

  selected.sort((a, b) => a.idx - b.idx);

  return selected.map(p => ({
    sampleIdx: startIdx + p.idx,
    time: parseFloat(((startIdx + p.idx) * sampleInterval).toFixed(1)),
    score: p.score,
  }));
}

function classifySegments(scores, sampleInterval) {
  const classified = scores.map((score, i) => {
    let type = 'idle';
    if (score >= ACTIVITY_HIGH) type = 'hero';
    else if (score >= ACTIVITY_LOW) type = 'normal';
    return { index: i, score, type };
  });

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
    .filter(seg => seg.scores.length >= MIN_SEGMENT_SAMPLES)
    .map(seg => ({
      sourceStart: parseFloat((seg.startIdx * sampleInterval).toFixed(1)),
      sourceEnd: parseFloat(((seg.endIdx + 1) * sampleInterval).toFixed(1)),
      type: seg.type,
      activity: parseFloat((seg.scores.reduce((a, b) => a + b, 0) / seg.scores.length).toFixed(4)),
      maxActivity: parseFloat(Math.max(...seg.scores).toFixed(4)),
    }));
}
