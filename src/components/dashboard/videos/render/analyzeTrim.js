/**
 * Smart auto-trim analyzer.
 *
 * Samples frames from the source video, computes pixel-difference scores
 * between adjacent samples, and identifies the most "active" 10–15 s
 * segment. This avoids idle intro/outro footage and selects the portion
 * with the most visual change (cursor movement, UI transitions, etc.).
 *
 * Returns a suggested { trimStart, trimEnd } in seconds.
 */

const SAMPLE_INTERVAL_S = 0.5;
const THUMB_W = 160;
const THUMB_H = 90;
const TARGET_MIN_S = 10;
const TARGET_MAX_S = 15;

export async function analyzeTrim(videoUrl, onProgress) {
  const video = await loadVideo(videoUrl);
  const duration = video.duration;

  if (duration <= TARGET_MAX_S) {
    return { trimStart: 0, trimEnd: duration, scores: [], analyzed: true };
  }

  const canvas = document.createElement('canvas');
  canvas.width = THUMB_W;
  canvas.height = THUMB_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const sampleCount = Math.floor(duration / SAMPLE_INTERVAL_S);
  const scores = [];
  let prevData = null;

  for (let i = 0; i < sampleCount; i++) {
    const time = i * SAMPLE_INTERVAL_S;
    await seekVideo(video, time);

    ctx.drawImage(video, 0, 0, THUMB_W, THUMB_H);
    const imageData = ctx.getImageData(0, 0, THUMB_W, THUMB_H);
    const currentData = imageData.data;

    if (prevData) {
      let diff = 0;
      const len = currentData.length;
      for (let p = 0; p < len; p += 4) {
        diff += Math.abs(currentData[p] - prevData[p]);
        diff += Math.abs(currentData[p + 1] - prevData[p + 1]);
        diff += Math.abs(currentData[p + 2] - prevData[p + 2]);
      }
      const pixelCount = len / 4;
      scores.push(diff / (pixelCount * 3 * 255));
    } else {
      scores.push(0);
    }

    prevData = new Uint8ClampedArray(currentData);
    onProgress?.(i / sampleCount);
  }

  const windowSamples = Math.round(TARGET_MIN_S / SAMPLE_INTERVAL_S);
  const maxWindowSamples = Math.round(TARGET_MAX_S / SAMPLE_INTERVAL_S);

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

  const trimStart = parseFloat((bestStart * SAMPLE_INTERVAL_S).toFixed(1));
  const trimEnd = parseFloat(
    Math.min((bestStart + bestLen) * SAMPLE_INTERVAL_S, duration).toFixed(1)
  );

  return { trimStart, trimEnd, scores, analyzed: true };
}

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
