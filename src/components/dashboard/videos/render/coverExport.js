/**
 * Cover image / thumbnail generator.
 *
 * Supports two modes:
 *   1. Intro card cover (branded intro frame)
 *   2. Footage frame cover (strongest source frame with headline overlay)
 *
 * Each reel variant gets a matching PNG cover for social workflows.
 */

import { getTemplate } from '../templates/featureSpotlight';
import { loadLogo, drawIntroCard, drawVideoFrame, drawHeadlineOverlay, drawWatermark } from './drawUtils';

/**
 * Generate a cover from the branded intro card.
 */
export async function generateCoverImage({ headline, templateId = 'feature-spotlight' }) {
  const tpl = getTemplate(templateId);
  const { width, height, brand } = tpl;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const logo = await loadLogo(brand.logo);
  drawIntroCard(ctx, logo, { headline, brand }, 1);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

/**
 * Generate a cover from a source video frame with headline overlay.
 */
export async function generateFrameCover({
  sourceUrl,
  seekTime = 0,
  headline = '',
  templateId = 'feature-spotlight',
  headlineYPct = 0.50,
}) {
  const tpl = getTemplate(templateId);
  const { width, height, brand } = tpl;
  const accentColor = brand.accentColor || '#3C79B4';

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const video = await loadSourceVideoForCover(sourceUrl);
  await seekVideoForCover(video, seekTime);
  drawVideoFrame(ctx, video);

  if (headline) {
    drawHeadlineOverlay(ctx, headline, height * headlineYPct, 52, 1.25, 0.95, accentColor);
  }

  const logo = await loadLogo(brand.logo);
  drawWatermark(ctx, logo, 0.5);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

/**
 * Generate both cover types and return the best option.
 */
export async function generateCoverSet({
  headline,
  sourceUrl,
  seekTime,
  templateId = 'feature-spotlight',
  headlineYPct,
}) {
  const introCover = await generateCoverImage({ headline, templateId });

  let frameCover = null;
  if (sourceUrl && seekTime != null) {
    try {
      frameCover = await generateFrameCover({ sourceUrl, seekTime, headline, templateId, headlineYPct });
    } catch {
      // frame cover generation failed — not critical
    }
  }

  return {
    introCover,
    frameCover,
    recommended: frameCover ? 'frame' : 'intro',
  };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── Internal helpers ────────────────────────────────────────────

function loadSourceVideoForCover(url) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;
    video.onloadeddata = () => resolve(video);
    video.onerror = () => reject(new Error('Failed to load video for cover'));
  });
}

function seekVideoForCover(video, time) {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - time) < 0.05) { resolve(); return; }
    video.onseeked = () => resolve();
    video.currentTime = time;
  });
}
