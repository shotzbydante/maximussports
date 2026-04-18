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
import { uploadAsset, publishToInstagram, publishCarouselToInstagram } from '../../lib/socialPosts';
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
  preflight:      'The image URL could not be verified. It may not be publicly reachable.',
  create_media:   null,
  poll_container: 'Instagram took too long to process the image.',
  publish_media:  'Instagram publish step failed after image was processed.',
  network:        'Network error — check your connection and retry.',
};

const CATEGORY_MESSAGES = {
  auth:          'Instagram access token is invalid or expired. Reconnect in Settings.',
  permission:    'This Instagram account lacks publish permissions. Check Settings.',
  image_fetch:   'Instagram could not fetch the image. The URL or format may be unsupported.',
  image_format:  'Instagram could not process this image format.',
  rate_limit:    'Instagram rate limit reached. Wait a few minutes before retrying.',
  transient:     'Instagram encountered a temporary error. Retry in a moment.',
  invalid_param: 'The publish request had an invalid parameter.',
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

  // ── Caption contract: prefer the canonical .fullCaption from
  //    normalizeStudioCaption(); fall back to legacy { shortCaption,
  //    hashtags } shape for any path that hasn't migrated yet.
  const buildCaptionText = useCallback(() => {
    if (!caption) return '';
    if (typeof caption.fullCaption === 'string' && caption.fullCaption.length > 0) {
      return caption.fullCaption;
    }
    const body     = caption.shortCaption ?? caption.longCaption ?? caption.caption ?? '';
    const hashStr  = (caption.hashtags ?? []).join(' ');
    return hashStr ? `${body}\n\n${hashStr}` : body;
  }, [caption]);

  const handleClick = useCallback(async () => {
    if (isWorking || inFlightRef.current) return;

    setErrorMessage(null);
    setLastResult(null);

    // ── Diagnostic: log exactly what the button received ──
    console.log('[PUBLISH_BUTTON_INPUT]', {
      hasCaption: !!caption,
      captionType: typeof caption,
      captionKeys: caption && typeof caption === 'object' ? Object.keys(caption) : [],
      ok: caption?.ok,
      reason: caption?.reason,
      derivedLength: buildCaptionText().length,
    });

    // ── Differentiate failure modes for actionable user feedback ──
    if (!caption) {
      setErrorMessage('No generated content found. Generate content first.');
      setStage('error');
      return;
    }
    if (caption.ok === false) {
      // Tagged failure from the caption builder — distinguish reasons.
      if (caption.reason === 'payload_build_failed') {
        setErrorMessage('Caption payload could not be assembled. Refresh the page or regenerate content before publishing.');
      } else if (caption.reason === 'caption_build_failed') {
        setErrorMessage('Caption generation failed for this post. Refresh or regenerate content before publishing.');
      } else if (caption.reason === 'too_short') {
        setErrorMessage(`Caption looks incomplete (${caption.totalLength ?? 0} chars). Refresh or regenerate before publishing.`);
      } else if (caption.reason === 'missing_body') {
        setErrorMessage('Caption builder returned an unexpected shape. Refresh and try again.');
      } else if (caption.reason === 'null_builder_output') {
        setErrorMessage('No caption was produced. Generate content first.');
      } else {
        setErrorMessage('Caption is not ready to publish. Refresh or regenerate before publishing.');
      }
      setStage('error');
      return;
    }

    const captionText = buildCaptionText();
    if (!captionText.trim()) {
      setErrorMessage('No caption available. Generate content first.');
      setStage('error');
      return;
    }

    // ── HARD SAFETY CHECK — prevent blank/generic captions from reaching IG ──
    // A legitimate daily/team/picks caption is always 300+ chars.
    // The only way to get under 80 is a fallback string or a builder failure.
    const MIN_CAPTION_CHARS = 80;
    if (captionText.length < MIN_CAPTION_CHARS) {
      console.error('[InstagramPublish] Caption too short — blocking publish:', {
        length: captionText.length,
        preview: captionText.slice(0, 200),
      });
      setErrorMessage(`Caption looks incomplete (${captionText.length} chars). Refresh the page or regenerate before publishing.`);
      setStage('error');
      return;
    }
    console.log('[InstagramPublish] caption OK', {
      length: captionText.length,
      preview: captionText.slice(0, 200),
    });

    if (!exportRef?.current) {
      setErrorMessage('Export artboard not ready. Wait for slides to load.');
      setStage('error');
      return;
    }

    // ── Detect all slides in the export artboard ──
    const allSlides = Array.from(exportRef.current.querySelectorAll('[data-slide]'));
    if (allSlides.length === 0) {
      setErrorMessage('No slides found in export artboard.');
      setStage('error');
      return;
    }

    const isCarousel = allSlides.length > 1;

    // ── Step 1: Render all slides to PNGs ──────────────────────────────────
    setStage('rendering');
    const dataUrls = [];
    try {
      const { toPng } = await import('html-to-image');
      await document.fonts.ready;

      const imgReport = await sanitizeImagesForExport(exportRef.current);
      if (imgReport.failed > 0) {
        console.warn(`[InstagramPublish] ${imgReport.failed} image(s) sanitized:`, imgReport.details);
      }

      const exportLayer = exportRef.current;
      const prevLayerVis = exportLayer.style.visibility;
      exportLayer.style.visibility = 'visible';

      const dims = getTemplateDimensions(template);

      for (let i = 0; i < allSlides.length; i++) {
        const slide = allSlides[i];
        const prevVis = slide.style.visibility;
        slide.style.visibility = 'visible';

        try {
          const dataUrl = await toPng(slide, {
            width: dims.width, height: dims.height, pixelRatio: 1,
            skipAutoScale: true, backgroundColor: '#ffffff',
          });
          dataUrls.push(dataUrl);
          if (DEBUG) {
            const sizeKB = Math.round((dataUrl.length * 3) / 4 / 1024);
            console.log(`[InstagramPublish:debug] slide ${i + 1} rendered: ${sizeKB} KB`);
          }
        } finally {
          slide.style.visibility = prevVis;
        }
      }

      exportLayer.style.visibility = prevLayerVis;
    } catch (err) {
      const msg = err.message || '';
      if (/img|image|load|fetch|network|cors/i.test(msg)) {
        setErrorMessage('Slide export failed — one or more remote logos/images did not load.');
      } else if (/font/i.test(msg)) {
        setErrorMessage('Slide export failed — fonts did not load in time.');
      } else {
        setErrorMessage(`Render failed: ${msg || 'html-to-image error'}`);
      }
      setStage('error');
      return;
    }

    // ── Step 1b: Blank-image validation (check first slide) ──────────────
    try {
      const blank = await isBlankImage(dataUrls[0]);
      if (blank) {
        console.error('[InstagramPublish] First slide PNG is blank — aborting.');
        setErrorMessage('Slide export produced a blank image. Please retry.');
        setStage('error');
        return;
      }
    } catch {
      if (DEBUG) console.warn('[InstagramPublish:debug] blank-check skipped');
    }

    // ── Step 2: Upload all PNGs ─────────────────────────────────────────
    setStage('uploading');
    const imageUrls = [];
    try {
      const templateSlug = metadata.templateType ?? 'slide';
      const ts = Date.now();
      for (let i = 0; i < dataUrls.length; i++) {
        const { url } = await uploadAsset(dataUrls[i], `${templateSlug}_${ts}_slide${i + 1}.png`);
        imageUrls.push(url);
        if (DEBUG) console.log(`[InstagramPublish:debug] uploaded slide ${i + 1}:`, url);
      }
    } catch (err) {
      setErrorMessage(`Upload failed: ${err.message ?? 'Storage error'}`);
      setStage('error');
      return;
    }

    inFlightRef.current = imageUrls[0];

    // ── Step 3: Publish ─────────────────────────────────────────────────
    setStage('publishing');
    try {
      const metaFields = {
        title:                 metadata.title              ?? null,
        contentType:           metadata.contentType        ?? null,
        teamSlug:              metadata.teamSlug           ?? null,
        teamName:              metadata.teamName           ?? null,
        contentStudioSection:  metadata.contentStudioSection ?? null,
        generatedBy:           'content_studio',
        templateType:          metadata.templateType       ?? null,
      };

      const result = isCarousel
        ? await publishCarouselToInstagram({ imageUrls, caption: captionText, ...metaFields })
        : await publishToInstagram({ imageUrl: imageUrls[0], caption: captionText, ...metaFields });

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
      const category  = err.category ?? null;

      let userMsg;
      if (category && CATEGORY_MESSAGES[category]) {
        userMsg = CATEGORY_MESSAGES[category];
      } else if (STAGE_MESSAGES[failStage]) {
        userMsg = STAGE_MESSAGES[failStage];
      } else {
        userMsg = err.message || 'Instagram publish failed.';
      }

      const isRetryable = ['transient', 'rate_limit'].includes(category) ||
                          failStage === 'poll_container';

      if (!isRetryable && category !== 'unknown') {
        userMsg += ' Check the image and account configuration before retrying.';
      }

      if (DEBUG) console.error('[InstagramPublish:debug] error:', { stage: failStage, category, code: err.code, message: err.message, requestId: err.requestId });

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
