/**
 * Web Worker for video frame analysis.
 *
 * Receives raw pixel data (ArrayBuffers) from the main thread,
 * computes frame-to-frame diff scores, finds the optimal trim window,
 * and identifies activity peaks for beat placement.
 *
 * Protocol:
 *   Main → Worker:  { type: 'analyze', buffers: ArrayBuffer[], width, height, sampleInterval, duration }
 *   Worker → Main:  { type: 'progress', value: number }
 *   Worker → Main:  { type: 'result', scores, trimStart, trimEnd, beatPeaks }
 */

const TARGET_MIN_S = 10;
const TARGET_MAX_S = 15;
const MIN_PEAK_DISTANCE = 4; // samples apart (~2s at 0.5s interval)

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

    if (duration > TARGET_MAX_S) {
      const result = findBestWindow(scores, sampleInterval, duration);
      trimStart = result.trimStart;
      trimEnd = result.trimEnd;
    }

    const beatPeaks = findActivityPeaks(scores, sampleInterval, trimStart, trimEnd);

    self.postMessage({
      type: 'result',
      scores,
      trimStart,
      trimEnd,
      beatPeaks,
    });
  }
};

function findBestWindow(scores, sampleInterval, duration) {
  const windowSamples = Math.round(TARGET_MIN_S / sampleInterval);
  const maxWindowSamples = Math.round(TARGET_MAX_S / sampleInterval);

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

  // smooth with 3-sample moving average
  const smoothed = window.map((_, i) => {
    const start = Math.max(0, i - 1);
    const end = Math.min(window.length, i + 2);
    let sum = 0;
    for (let j = start; j < end; j++) sum += window[j];
    return sum / (end - start);
  });

  // find local maxima
  const peaks = [];
  for (let i = 1; i < smoothed.length - 1; i++) {
    if (smoothed[i] > smoothed[i - 1] && smoothed[i] >= smoothed[i + 1]) {
      peaks.push({ idx: i, score: smoothed[i] });
    }
  }

  peaks.sort((a, b) => b.score - a.score);

  // select top peaks with minimum separation
  const selected = [];
  for (const peak of peaks) {
    if (selected.length >= 4) break;
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
