/**
 * Smart auto-trim analyzer with Web Worker offloading.
 *
 * Always analyzes the FULL clip. Returns:
 *   - trimStart / trimEnd  (best single window for backward compat)
 *   - scores               (raw frame-diff scores)
 *   - beatPeaks            (activity peaks for overlay timing)
 *   - segments             (classified segments for edit plan)
 *   - fullDuration         (source clip length)
 *
 * The editor uses `segments` + `scores` to build a multi-segment
 * edit plan via editPlan.js.
 */

const SAMPLE_INTERVAL_S = 0.5;
const THUMB_W = 160;
const THUMB_H = 90;

export async function analyzeTrim(videoUrl, onProgress) {
  const video = await loadVideo(videoUrl);
  const duration = video.duration;

  if (duration <= 3) {
    return {
      trimStart: 0,
      trimEnd: duration,
      scores: [],
      beatPeaks: [],
      segments: [],
      fullDuration: duration,
      analyzed: true,
      sampleInterval: SAMPLE_INTERVAL_S,
    };
  }

  const canvas = document.createElement('canvas');
  canvas.width = THUMB_W;
  canvas.height = THUMB_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const sampleCount = Math.floor(duration / SAMPLE_INTERVAL_S);
  const frameBuffers = [];

  for (let i = 0; i < sampleCount; i++) {
    const time = i * SAMPLE_INTERVAL_S;
    await seekVideo(video, time);

    ctx.drawImage(video, 0, 0, THUMB_W, THUMB_H);
    const imageData = ctx.getImageData(0, 0, THUMB_W, THUMB_H);
    frameBuffers.push(imageData.data.buffer.slice(0));

    if (i % 4 === 0) {
      onProgress?.(i / sampleCount * 0.6);
      await yieldToMain();
    }
  }

  onProgress?.(0.6);

  const result = await runWorkerAnalysis(frameBuffers, THUMB_W, THUMB_H, SAMPLE_INTERVAL_S, duration, (p) => {
    onProgress?.(0.6 + p * 0.4);
  });

  onProgress?.(1);

  return {
    ...result,
    analyzed: true,
    sampleInterval: SAMPLE_INTERVAL_S,
  };
}

/**
 * Convert beat peaks into overlay timing percentages within the footage window.
 */
export function beatPeaksToTimings(beatPeaks, trimStart, trimEnd, numBeats = 3) {
  const footageDuration = trimEnd - trimStart;
  if (footageDuration <= 0) return [];

  if (!beatPeaks || beatPeaks.length === 0) {
    return Array.from({ length: numBeats }, (_, i) => ({
      startPct: (i / numBeats) + 0.02,
      endPct: ((i + 1) / numBeats) - 0.03,
    }));
  }

  const usePeaks = beatPeaks.slice(0, numBeats);
  const beatDurationPct = 0.18;

  return usePeaks.map((peak) => {
    const relativeTime = peak.time - trimStart;
    const centerPct = relativeTime / footageDuration;
    return {
      startPct: Math.max(0.01, centerPct - beatDurationPct / 2),
      endPct: Math.min(0.99, centerPct + beatDurationPct / 2),
    };
  });
}

// ─── Worker communication ────────────────────────────────────────

function runWorkerAnalysis(frameBuffers, width, height, sampleInterval, duration, onProgress) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(
        new URL('./analyzeWorker.js', import.meta.url),
        { type: 'module' }
      );
    } catch {
      return resolve(mainThreadFallback(frameBuffers, width, height, sampleInterval, duration));
    }

    const timeout = setTimeout(() => {
      worker.terminate();
      resolve(mainThreadFallback(frameBuffers, width, height, sampleInterval, duration));
    }, 30000);

    worker.onmessage = (e) => {
      if (e.data.type === 'progress') {
        onProgress?.(e.data.value);
      } else if (e.data.type === 'result') {
        clearTimeout(timeout);
        worker.terminate();
        resolve(e.data);
      }
    };

    worker.onerror = () => {
      clearTimeout(timeout);
      worker.terminate();
      resolve(mainThreadFallback(frameBuffers, width, height, sampleInterval, duration));
    };

    const transferable = frameBuffers.map(b => (b instanceof ArrayBuffer ? b : b));
    worker.postMessage(
      { type: 'analyze', buffers: frameBuffers, width, height, sampleInterval, duration },
      transferable
    );
  });
}

// ─── Main-thread fallback ────────────────────────────────────────

function mainThreadFallback(frameBuffers, width, height, sampleInterval, duration) {
  const pixelCount = width * height;
  const scores = [];

  for (let i = 0; i < frameBuffers.length; i++) {
    if (i === 0) { scores.push(0); continue; }
    const prev = new Uint8ClampedArray(frameBuffers[i - 1]);
    const curr = new Uint8ClampedArray(frameBuffers[i]);
    let diff = 0;
    for (let p = 0; p < curr.length; p += 4) {
      diff += Math.abs(curr[p] - prev[p]);
      diff += Math.abs(curr[p + 1] - prev[p + 1]);
      diff += Math.abs(curr[p + 2] - prev[p + 2]);
    }
    scores.push(diff / (pixelCount * 3 * 255));
  }

  const trimBase = Math.max(8, Math.min(24, duration * 0.18));
  const trimMax = Math.min(24, trimBase * 1.25);
  const windowSamples = Math.round(trimBase / sampleInterval);
  const maxWindowSamples = Math.round(trimMax / sampleInterval);
  let bestScore = -1, bestStart = 0, bestLen = windowSamples;
  for (let wLen = windowSamples; wLen <= maxWindowSamples; wLen++) {
    for (let start = 0; start <= scores.length - wLen; start++) {
      let sum = 0;
      for (let j = start; j < start + wLen; j++) sum += scores[j];
      const avg = sum / wLen;
      if (avg > bestScore) { bestScore = avg; bestStart = start; bestLen = wLen; }
    }
  }

  return {
    scores,
    trimStart: parseFloat((bestStart * sampleInterval).toFixed(1)),
    trimEnd: parseFloat(Math.min((bestStart + bestLen) * sampleInterval, duration).toFixed(1)),
    beatPeaks: [],
    segments: [],
    fullDuration: duration,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────

function loadVideo(url) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous';
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.src = url;
    v.onloadeddata = () => resolve(v);
    v.onerror = () => reject(new Error('Failed to load video for analysis'));
  });
}

function seekVideo(video, time) {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - time) < 0.02) { resolve(); return; }
    video.onseeked = () => resolve();
    video.currentTime = time;
  });
}

function yieldToMain() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
