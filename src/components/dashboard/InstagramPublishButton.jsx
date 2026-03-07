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
import { waitForImages } from './utils/exportReady';
import { uploadAsset, publishToInstagram } from '../../lib/socialPosts';
import styles from './InstagramPublishButton.module.css';

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
      await waitForImages(exportRef.current);
      dataUrl = await toPng(slide1, {
        width: 1080, height: 1350, pixelRatio: 1, skipAutoScale: true, cacheBust: true,
      });
    } catch (err) {
      setErrorMessage(`Render failed: ${err.message ?? 'html-to-image error'}`);
      setStage('error');
      return;
    }

    // ── Step 2: Upload PNG to get a public URL ─────────────────────────────
    setStage('uploading');
    let imageUrl;
    try {
      const templateSlug = metadata.templateType ?? 'slide';
      const ts           = Date.now();
      const { url }      = await uploadAsset(dataUrl, `${templateSlug}_${ts}_slide1.png`);
      imageUrl = url;
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
      setErrorMessage(`${msg}${code}`);
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
