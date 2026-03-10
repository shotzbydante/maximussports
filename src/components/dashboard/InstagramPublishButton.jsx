/**
 * InstagramPublishButton
 *
 * Self-contained "Post to Instagram" control for the Content Studio.
 *
 * Flow on click:
 *   1. Render slide 1 of the hidden export artboard to a 1080×1350 PNG
 *   2. Blank-image validation
 *   3. Upload the PNG to Supabase Storage via /api/social/upload-asset
 *   4. POST the public URL + caption to /api/social/instagram/publish
 *      (backend polls container until FINISHED, then publishes)
 *   5. Transition through: idle → rendering → uploading → publishing → success | error
 *
 * Duplicate protection:
 *   - Button disabled while any stage is in-flight
 *   - In-flight asset URL tracked via ref — prevents double-submit of the same image
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { sanitizeImagesForExport } from './utils/exportReady';
import { getTemplateDimensions } from './CarouselComposer';
import { uploadAsset, publishToInstagram } from '../../lib/socialPosts';
import styles from './InstagramPublishButton.module.css';

const DEBUG = import.meta.env.DEV;

// ── Blank-image detection ───────────────────────────────────────────────────

async function isBlankImage(dataUrl, threshold = 0.995) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      const step = 4;
      const { data } = ctx.getImageData(0, 0, img.width, img.height);

      let whiteCount = 0;
      let totalSampled = 0;
      for (let y = 0; y < img.height; y += step) {
        for (let x = 0; x < img.width; x += step) {
          const i = (y * img.width + x) * 4;
          totalSampled++;
          if (data[i] >= 245 && data[i + 1] >= 245 && data[i + 2] >= 245) {
            whiteCount++;
          }
        }
      }

      const ratio = totalSampled > 0 ? whiteCount / totalSampled : 1;
      if (DEBUG) {
        console.log(`[InstagramPublish:debug] blank-check: ${whiteCount}/${totalSampled} white (${(ratio * 100).toFixed(1)}%)`);
      }
      resolve(ratio >= threshold);
    };
    img.onerror = () => resolve(false);
    img.src = dataUrl;
  });
}

// ── Elapsed time display ────────────────────────────────────────────────────

function useElapsedTimer(active) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(null);

  useEffect(() => {
    if (!active) {
      setElapsed(0);
      startRef.current = null;
      return;
    }
    startRef.current = Date.now();
    const id = setInterval(() => {
      if (startRef.current) setElapsed(Date.now() - startRef.current);
    }, 500);
    return () => clearInterval(id);
  }, [active]);

  return elapsed;
}

function formatElapsed(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 1) return '';
  return `${s}s`;
}

// ── Stage configuration ─────────────────────────────────────────────────────

const STAGE_LABELS = {
  idle:       'Post to Instagram',
  rendering:  'Rendering slide…',
  uploading:  'Uploading image…',
  publishing: 'Publishing to Instagram…',
  success:    'Posted',
  error:      'Retry',
};

const STAGE_MESSAGES = {
  preflight:      'Image URL was not reachable by Instagram. Please retry.',
  create_media:   'Instagram rejected the image.',
  poll_container: 'Instagram took too long to process the image. Please retry.',
  publish_media:  'Instagram publish step failed.',
  network:        'Network error — check your connection and retry.',
};

// ── Component ───────────────────────────────────────────────────────────────

export default function InstagramPublishButton({
  exportRef,
  caption,
  canPublish = false,
  metadata   = {},
  onSuccess,
  template,
}) {
  const [stage,        setStage]       = useState('idle');
  const [errorMessage, setErrorMessage] = useState(null);
  const [lastResult,   setLastResult]   = useState(null);

  // Duplicate-submission guard: track in-flight asset URL
  const inFlightRef = useRef(null);

  const isWorking = stage === 'rendering' || stage === 'uploading' || stage === 'publishing';
  const elapsed = useElapsedTimer(isWorking);

  const buildCaptionText = useCallback(() => {
    if (!caption) return '';
    const body     = caption.shortCaption ?? '';
    const hashStr  = (caption.hashtags ?? []).join(' ');
    return hashStr ? `${body}\n\n${hashStr}` : body;
  }, [caption]);

  const handleClick = useCallback(async () => {
    if (isWorking || inFlightRef.current) return;

    setErrorMessage(null);
    setLastResult(null);

    const captionText = buildCaptionText();
    if (!captionText.trim()) {
      setErrorMessage('No caption available. Generate content first.');
      setStage('error');
      return;
    }

    if (!exportRef?.current) {
      setErrorMessage('Export artboard not ready. Wait for slides to load.');
      setStage('error');
      return;
    }

    const slide1 = exportRef.current.querySelector('[data-slide="1"]');
    if (!slide1) {
      setErrorMessage('Slide 1 not found in export artboard.');
      setStage('error');
      return;
    }

    // ── Step 1: Render slide to PNG ──────────────────────────────────────
    setStage('rendering');
    let dataUrl;
    try {
      const { toPng } = await import('html-to-image');

      await document.fonts.ready;

      const imgReport = await sanitizeImagesForExport(exportRef.current);

      if (imgReport.failed > 0) {
        console.warn(
          `[InstagramPublish] ${imgReport.failed} image(s) failed and replaced before capture:`,
          imgReport.details,
        );
      }

      if (DEBUG) {
        const rect = slide1.getBoundingClientRect();
        const cs = window.getComputedStyle(slide1);
        console.log('[InstagramPublish:debug] capture node:', {
          tagName: slide1.tagName,
          dataSlide: slide1.getAttribute('data-slide'),
          dims: { w: rect.width, h: rect.height },
          visibility: cs.visibility,
          children: slide1.childElementCount,
        });
      }

      const exportLayer = exportRef.current;
      const prevLayerVis = exportLayer.style.visibility;
      const prevSlideVis = slide1.style.visibility;
      exportLayer.style.visibility = 'visible';
      slide1.style.visibility = 'visible';

      const dims = getTemplateDimensions(template);
      try {
        dataUrl = await toPng(slide1, {
          width: dims.width, height: dims.height, pixelRatio: 1, skipAutoScale: true,
        });
      } finally {
        exportLayer.style.visibility = prevLayerVis;
        slide1.style.visibility = prevSlideVis;
      }

      if (DEBUG) {
        const sizeKB = Math.round((dataUrl.length * 3) / 4 / 1024);
        console.log(`[InstagramPublish:debug] rendered PNG: ${sizeKB} KB`);
      }
    } catch (err) {
      const msg = err.message || '';
      if (/img|image|load|fetch|network|cors/i.test(msg)) {
        setErrorMessage('Slide export failed — one or more remote logos/images did not load.');
      } else if (/font/i.test(msg)) {
        setErrorMessage('Slide export failed — fonts did not load in time.');
      } else if (/node/i.test(msg) || /null/i.test(msg)) {
        setErrorMessage('Slide export failed — the render node was missing or detached.');
      } else {
        setErrorMessage(`Render failed: ${msg || 'html-to-image error'}`);
      }
      setStage('error');
      return;
    }

    // ── Step 1b: Blank-image validation ──────────────────────────────────
    try {
      const blank = await isBlankImage(dataUrl);
      if (blank) {
        console.error('[InstagramPublish] Rendered PNG is blank — aborting.');
        setErrorMessage('Slide export produced a blank image. Please retry or check the slide preview.');
        setStage('error');
        return;
      }
    } catch {
      if (DEBUG) console.warn('[InstagramPublish:debug] blank-check skipped');
    }

    // ── Step 2: Upload PNG ───────────────────────────────────────────────
    setStage('uploading');
    let imageUrl;
    try {
      const templateSlug = metadata.templateType ?? 'slide';
      const ts           = Date.now();
      const { url }      = await uploadAsset(dataUrl, `${templateSlug}_${ts}_slide1.png`);
      imageUrl = url;
      if (DEBUG) console.log('[InstagramPublish:debug] uploaded:', imageUrl);
    } catch (err) {
      setErrorMessage(`Upload failed: ${err.message ?? 'Storage error'}`);
      setStage('error');
      return;
    }

    // Mark in-flight to prevent duplicate submissions for same asset
    inFlightRef.current = imageUrl;

    // ── Step 3: Publish (server polls container, then publishes) ─────────
    setStage('publishing');
    try {
      const result = await publishToInstagram({
        imageUrl,
        caption:               captionText,
        title:                 metadata.title              ?? null,
        contentType:           metadata.contentType        ?? null,
        teamSlug:              metadata.teamSlug           ?? null,
        teamName:              metadata.teamName           ?? null,
        contentStudioSection:  metadata.contentStudioSection ?? null,
        generatedBy:           'content_studio',
        templateType:          metadata.templateType       ?? null,
      });

      if (DEBUG) console.log('[InstagramPublish:debug] success:', result);

      setLastResult(result);
      setStage('success');
      onSuccess?.({
        postId:          result.postId,
        publishedMediaId: result.publishedMediaId,
        permalink:        result.permalink,
        requestId:        result.requestId,
        durationMs:       result.durationMs,
      });

      setTimeout(() => setStage('idle'), 8000);
    } catch (err) {
      const failStage = err.stage ?? 'publish';
      const code = err.code ? ` (code ${err.code})` : '';

      const baseMsg = STAGE_MESSAGES[failStage] ?? 'Instagram publish failed.';
      const detail  = err.message && !baseMsg.includes(err.message)
        ? ` ${err.message}`
        : '';
      const userMsg = `${baseMsg}${detail}${code}`;

      if (DEBUG) console.error('[InstagramPublish:debug] error:', { stage: failStage, code, message: err.message, requestId: err.requestId });

      setErrorMessage(userMsg);
      setStage('error');
    } finally {
      inFlightRef.current = null;
    }
  }, [isWorking, buildCaptionText, exportRef, metadata, onSuccess]);

  const handleReset = () => {
    setStage('idle');
    setErrorMessage(null);
    setLastResult(null);
  };

  const disabled = !canPublish || isWorking || stage === 'success';

  return (
    <div className={styles.wrap}>
      <button
        className={`${styles.btn} ${styles[`btn_${stage}`] ?? ''}`}
        onClick={stage === 'error' ? handleReset : handleClick}
        disabled={disabled}
        aria-label="Post slide 1 to Instagram"
        title={!canPublish ? 'Generate content first' : undefined}
      >
        <span className={styles.icon} aria-hidden="true">
          {stage === 'success' ? '✓' : stage === 'error' ? '✕' : '▶'}
        </span>
        <span className={styles.label}>
          {STAGE_LABELS[stage] ?? 'Post to Instagram'}
          {isWorking && elapsed > 1000 && (
            <span className={styles.elapsed}> {formatElapsed(elapsed)}</span>
          )}
        </span>
        {isWorking && <span className={styles.spinner} aria-hidden="true" />}
      </button>

      {/* Success state */}
      {stage === 'success' && lastResult && (
        <div className={styles.successBlock}>
          <p className={styles.successNote}>
            Live on Instagram
            {lastResult.durationMs != null && (
              <span className={styles.durationNote}>
                {' '}· {Math.round(lastResult.durationMs / 1000)}s
              </span>
            )}
          </p>
          {lastResult.permalink && (
            <a
              href={lastResult.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.permalinkLink}
            >
              View post ↗
            </a>
          )}
        </div>
      )}

      {/* Error state */}
      {stage === 'error' && errorMessage && (
        <p className={styles.errorNote} role="alert">
          {errorMessage}
        </p>
      )}

      {/* Idle hint */}
      {stage === 'idle' && (
        <p className={styles.hint}>
          Posts slide&nbsp;1 · short caption
        </p>
      )}

      {/* Publishing sub-status */}
      {stage === 'publishing' && elapsed > 3000 && (
        <p className={styles.hint}>
          Waiting for Instagram to process the image…
        </p>
      )}
    </div>
  );
}
