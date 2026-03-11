/**
 * Client-side video render engine.
 *
 * Pipeline:  Canvas (1080×1920) → VideoEncoder (H.264) → mp4-muxer → Blob
 *
 * Requires WebCodecs (Chrome 94+, Safari 16.4+).
 * The render loop seeks through the source video frame-by-frame and
 * composites intro/outro cards and text overlays onto a Canvas, encoding
 * each frame as it goes. Progress is reported via callback.
 *
 * This module is the *render implementation*. The orchestration lives in
 * VideosEditor. The module can be swapped for Remotion Lambda or server-
 * side FFmpeg later without changing the editor.
 */

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { getTemplate } from '../templates/featureSpotlight';
import {
  loadLogo,
  drawIntroCard,
  drawOutroCard,
  drawVideoFrame,
  drawTextOverlay,
  drawWatermark,
  easeAlpha,
} from './drawUtils';

// ─── capability check ────────────────────────────────────────────

export function isRenderSupported() {
  return (
    typeof VideoEncoder !== 'undefined' &&
    typeof VideoFrame !== 'undefined' &&
    typeof EncodedVideoChunk !== 'undefined'
  );
}

export async function checkH264Support(width = 1080, height = 1920) {
  if (!isRenderSupported()) return false;
  try {
    const { supported } = await VideoEncoder.isConfigSupported({
      codec: 'avc1.640028',
      width,
      height,
      bitrate: 5_000_000,
      framerate: 30,
    });
    return supported;
  } catch {
    return false;
  }
}

// ─── main render function ────────────────────────────────────────

/**
 * @param {object}   opts
 * @param {string}   opts.sourceUrl        Object URL or public URL to source video
 * @param {number}   opts.trimStart        Trim start in seconds
 * @param {number}   opts.trimEnd          Trim end in seconds
 * @param {string}   opts.headline         Headline overlay text
 * @param {string}   opts.subhead          Subhead overlay text
 * @param {string}   opts.cta              CTA text for outro
 * @param {boolean}  [opts.watermark=true] Show logo watermark during footage
 * @param {string}   [opts.templateId]     Template ID (default feature-spotlight)
 * @param {function} [opts.onProgress]     (0-1) progress callback
 * @param {AbortSignal} [opts.signal]      Abort signal for cancellation
 * @returns {Promise<Blob>}  H.264 MP4 blob
 */
export async function renderVideo(opts) {
  const {
    sourceUrl,
    trimStart,
    trimEnd,
    headline = '',
    subhead = '',
    cta = 'Get Maximus Sports',
    watermark = true,
    templateId = 'feature-spotlight',
    onProgress,
    signal,
  } = opts;

  const tpl = getTemplate(templateId);
  const { width: W, height: H, fps, scenes, overlays, brand } = tpl;

  const footageDurMs = (trimEnd - trimStart) * 1000;
  const introFrames = Math.round((scenes.intro.durationMs / 1000) * fps);
  const footageFrames = Math.round((footageDurMs / 1000) * fps);
  const outroFrames = Math.round((scenes.outro.durationMs / 1000) * fps);
  const totalFrames = introFrames + footageFrames + outroFrames;

  // load assets
  const [logo, video] = await Promise.all([
    loadLogo(brand.logo),
    loadSourceVideo(sourceUrl),
  ]);

  // canvas
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });

  // muxer + encoder
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width: W, height: H },
    fastStart: 'in-memory',
  });

  let encodeError = null;

  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { encodeError = e; },
  });

  encoder.configure({
    codec: 'avc1.640028',
    width: W,
    height: H,
    bitrate: 5_000_000,
    framerate: fps,
    avc: { format: 'avc' },
  });

  const fieldValues = { headline, subhead };

  // ── render loop ──────────────────────────────────────────────
  for (let i = 0; i < totalFrames; i++) {
    if (signal?.aborted) { encoder.close(); throw new DOMException('Render aborted', 'AbortError'); }
    if (encodeError) throw encodeError;

    if (i < introFrames) {
      // INTRO CARD
      const progress = i / introFrames;
      const alpha = easeAlpha(progress, 0.20, 0.12);
      drawIntroCard(ctx, logo, { headline, brand }, alpha);

    } else if (i < introFrames + footageFrames) {
      // FOOTAGE + OVERLAYS
      const footageIdx = i - introFrames;
      const footageProgress = footageIdx / footageFrames;
      const seekTime = trimStart + footageIdx / fps;

      await seekVideo(video, seekTime);
      drawVideoFrame(ctx, video);

      for (const ov of overlays) {
        const text = fieldValues[ov.field];
        if (!text) continue;
        if (footageProgress >= ov.startPct && footageProgress <= ov.endPct) {
          const ovLocal = (footageProgress - ov.startPct) / (ov.endPct - ov.startPct);
          const fadePct = ov.fadeMs / (footageDurMs * (ov.endPct - ov.startPct));
          const alpha = easeAlpha(ovLocal, fadePct, fadePct);
          drawTextOverlay(ctx, text, H * ov.yPct, ov.maxFontSize, ov.lineHeight, alpha);
        }
      }

      if (watermark) drawWatermark(ctx, logo);

    } else {
      // OUTRO CARD
      const outroIdx = i - introFrames - footageFrames;
      const progress = outroIdx / outroFrames;
      const alpha = easeAlpha(progress, 0.20, 0.12);
      drawOutroCard(ctx, logo, { cta, brand }, alpha);
    }

    // encode frame
    const frame = new VideoFrame(canvas, {
      timestamp: i * (1_000_000 / fps),
    });
    encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();

    // yield to main thread periodically for UI updates
    if (i % 5 === 0) {
      onProgress?.(i / totalFrames);
      await yieldToMain();
    }
  }

  // finalize
  await encoder.flush();
  encoder.close();
  muxer.finalize();

  onProgress?.(1);

  return new Blob([target.buffer], { type: 'video/mp4' });
}

// ─── helpers ─────────────────────────────────────────────────────

function loadSourceVideo(url) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;

    video.onloadeddata = () => resolve(video);
    video.onerror = () => reject(new Error('Failed to load source video'));
  });
}

function seekVideo(video, time) {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - time) < 0.01) {
      resolve();
      return;
    }
    video.onseeked = () => resolve();
    video.currentTime = time;
  });
}

function yieldToMain() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
