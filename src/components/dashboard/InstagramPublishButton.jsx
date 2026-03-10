/**
 * InstagramPublishButton
 *
 * Self-contained "Post to Instagram" control for the Content Studio.
 *
 * Flow on click:
 *   1. Render slide 1 of the hidden export artboard to a 1080×1350 PNG
 *      using html-to-image (same settings as the PNG export flow)
 *   2. Upload the PNG to Supabase Storage via /api/social/upload-asset
 *   3. POST the public URL + caption to /api/social/instagram/publish
 *   4. Transition through: idle → rendering → uploading → publishing → success | error
 *
 * Props:
 *   exportRef      {React.RefObject}  — ref forwarded to the hidden export layer in CarouselComposer
 *   caption        {object|null}      — { shortCaption, longCaption, hashtags } from buildCaption()
 *   canPublish     {boolean}          — gates the button (mirrors the canExport flag in Dashboard)
 *   metadata       {object}           — audit context: title, templateType, contentType, teamSlug, teamName, contentStudioSection
 *   onSuccess      {function}         — called with { postId, publishedMediaId } on success; triggers history refresh
 */

import { useState, useCallback } from 'react';
import { sanitizeImagesForExport } from './utils/exportReady';
import { uploadAsset, publishToInstagram } from '../../lib/socialPosts';
import styles from './InstagramPublishButton.module.css';

const DEBUG = import.meta.env.DEV;

/**
 * Analyse a data-URL PNG and return true if the image contains only
 * white / near-white pixels (i.e. the capture was blank).
 * Uses an offscreen canvas to sample pixels — fast and synchronous after decode.
 */
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
      const sampleW = Math.ceil(img.width / step);
      const sampleH = Math.ceil(img.height / step);
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
        console.log(`[InstagramPublish:debug] blank-check: ${whiteCount}/${totalSampled} white pixels (${(ratio * 100).toFixed(1)}%), threshold ${(threshold * 100).toFixed(1)}%`);
      }
      resolve(ratio >= threshold);
    };
    img.onerror = () => resolve(false);
    img.src = dataUrl;
  });
}

const STAGE_LABELS = {
  idle:       'Post to Instagram',
  rendering:  'Rendering…',
  uploading:  'Uploading…',
  publishing: 'Publishing…',
  success:    '✓ Posted',
  error:      'Retry',
};

export default function InstagramPublishButton({
  exportRef,
  caption,
  canPublish = false,
  metadata   = {},
  onSuccess,
}) {
  const [stage,        setStage]       = useState('idle');
  const [errorMessage, setErrorMessage] = useState(null);
  const [lastPostId,   setLastPostId]   = useState(null);

  const isWorking = stage === 'rendering' || stage === 'uploading' || stage === 'publishing';

  const buildCaptionText = useCallback(() => {
    if (!caption) return '';
    const body     = caption.shortCaption ?? '';
    const hashStr  = (caption.hashtags ?? []).join(' ');
    return hashStr ? `${body}\n\n${hashStr}` : body;
  }, [caption]);

  const handleClick = useCallback(async () => {
    if (isWorking) return;

    setErrorMessage(null);

    // Validate caption first so the error is clear
    const captionText = buildCaptionText();
    if (!captionText.trim()) {
      setErrorMessage('No caption available. Generate content first.');
      setStage('error');
      return;
    }

    // Validate export ref
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

    // ── Step 1: Render slide to PNG ────────────────────────────────────────
    setStage('rendering');
    let dataUrl;
    try {
      const { toPng } = await import('html-to-image');

      await document.fonts.ready;

      const imgReport = await sanitizeImagesForExport(exportRef.current);

      if (imgReport.failed > 0) {
        console.warn(
          `[InstagramPublish] ${imgReport.failed} image(s) failed to load and were replaced before capture:`,
          imgReport.details,
        );
      }

      if (DEBUG) {
        const rect = slide1.getBoundingClientRect();
        const cs = window.getComputedStyle(slide1);
        console.log('[InstagramPublish:debug] capture node:', {
          tagName: slide1.tagName,
          className: slide1.className,
          dataSlide: slide1.getAttribute('data-slide'),
          boundingRect: { width: rect.width, height: rect.height, top: rect.top, left: rect.left },
          computedVisibility: cs.visibility,
          computedDisplay: cs.display,
          computedOpacity: cs.opacity,
          childElementCount: slide1.childElementCount,
          innerHTML_length: slide1.innerHTML.length,
        });
        if (cs.visibility === 'hidden') {
          console.error('[InstagramPublish:debug] CRITICAL — capture node has visibility:hidden, image will be blank!');
        }
      }

      // Force visibility on the capture target and its export-layer parent so
      // html-to-image never clones inherited visibility:hidden styles.
      const exportLayer = exportRef.current;
      const prevLayerVis = exportLayer.style.visibility;
      const prevSlideVis = slide1.style.visibility;
      exportLayer.style.visibility = 'visible';
      slide1.style.visibility = 'visible';

      try {
        dataUrl = await toPng(slide1, {
          width: 1080, height: 1350, pixelRatio: 1, skipAutoScale: true,
        });
      } finally {
        exportLayer.style.visibility = prevLayerVis;
        slide1.style.visibility = prevSlideVis;
      }

      if (DEBUG) {
        const sizeKB = Math.round((dataUrl.length * 3) / 4 / 1024);
        console.log(`[InstagramPublish:debug] rendered PNG data-URL: ${sizeKB} KB (${dataUrl.length} chars)`);
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

    // ── Step 1b: Validate the rendered PNG is not blank ─────────────────────
    try {
      const blank = await isBlankImage(dataUrl);
      if (blank) {
        console.error('[InstagramPublish] Rendered PNG is blank/white — aborting upload.');
        setErrorMessage('Slide export produced a blank image. Please retry or check the slide preview.');
        setStage('error');
        return;
      }
      if (DEBUG) console.log('[InstagramPublish:debug] blank-check passed — image has visible content');
    } catch {
      if (DEBUG) console.warn('[InstagramPublish:debug] blank-check skipped (decode error)');
    }

    // ── Step 2: Upload PNG to get a public URL ─────────────────────────────
    setStage('uploading');
    let imageUrl;
    try {
      const templateSlug = metadata.templateType ?? 'slide';
      const ts           = Date.now();
      const { url }      = await uploadAsset(dataUrl, `${templateSlug}_${ts}_slide1.png`);
      imageUrl = url;
      if (DEBUG) console.log('[InstagramPublish:debug] uploaded asset URL:', imageUrl);
    } catch (err) {
      setErrorMessage(`Upload failed: ${err.message ?? 'Storage error'}`);
      setStage('error');
      return;
    }

    // ── Step 3: Publish to Instagram ───────────────────────────────────────
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

      setLastPostId(result.postId ?? null);
      setStage('success');
      onSuccess?.({ postId: result.postId, publishedMediaId: result.publishedMediaId });

      // Auto-reset to idle after 6 s so the button is reusable
      setTimeout(() => setStage('idle'), 6000);
    } catch (err) {
      const msg = err.message ?? 'Publish failed';
      const code = err.code ? ` (code ${err.code})` : '';
      setErrorMessage(`Instagram publish failed: ${msg}${code}`);
      setStage('error');
    }
  }, [isWorking, buildCaptionText, exportRef, metadata, onSuccess]);

  const handleReset = () => {
    setStage('idle');
    setErrorMessage(null);
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
        <span className={styles.label}>{STAGE_LABELS[stage] ?? 'Post to Instagram'}</span>
        {isWorking && <span className={styles.spinner} aria-hidden="true" />}
      </button>

      {stage === 'success' && lastPostId && (
        <p className={styles.successNote}>
          Live on Instagram · record #{lastPostId.slice(0, 8)}…
        </p>
      )}

      {stage === 'error' && errorMessage && (
        <p className={styles.errorNote} role="alert">
          {errorMessage}
        </p>
      )}

      {stage === 'idle' && (
        <p className={styles.hint}>
          Posts slide&nbsp;1 · short caption
        </p>
      )}
    </div>
  );
}
