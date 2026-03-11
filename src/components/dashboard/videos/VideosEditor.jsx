import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import VideoUploader from './VideoUploader';
import VideoPreview from './VideoPreview';
import { getTemplate } from './templates/featureSpotlight';
import { isRenderSupported, checkH264Support, renderVideo } from './render/renderVideo';
import styles from './VideosEditor.module.css';

const TEMPLATE = getTemplate('feature-spotlight');

/**
 * Self-contained Videos editor for Content Studio.
 *
 * All state is local. The component owns: source file management,
 * field editing, trim controls, preview, and render orchestration.
 */
export default function VideosEditor() {
  // ── source file ────────────────────────────────────────────────
  const [sourceFile, setSourceFile] = useState(null);
  const [sourceUrl, setSourceUrl] = useState(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoReady, setVideoReady] = useState(false);
  const probeRef = useRef(null);

  // ── fields ─────────────────────────────────────────────────────
  const [headline, setHeadline] = useState('');
  const [subhead, setSubhead] = useState('');
  const [cta, setCta] = useState('Get Maximus Sports Free');
  const [projectName, setProjectName] = useState('');
  const [watermark, setWatermark] = useState(true);

  // ── trim ───────────────────────────────────────────────────────
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(10);

  // ── render state ───────────────────────────────────────────────
  const [renderState, setRenderState] = useState('idle');
  const [renderProgress, setRenderProgress] = useState(0);
  const [outputUrl, setOutputUrl] = useState(null);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  // ── capability check ───────────────────────────────────────────
  const [codecSupported, setCodecSupported] = useState(null);
  useEffect(() => {
    checkH264Support().then(setCodecSupported);
  }, []);

  // ── file handling ──────────────────────────────────────────────
  const handleFileSelected = useCallback((file) => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    if (outputUrl) { URL.revokeObjectURL(outputUrl); setOutputUrl(null); }

    const url = URL.createObjectURL(file);
    setSourceFile(file);
    setSourceUrl(url);
    setVideoReady(false);
    setRenderState('idle');
    setError(null);

    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.src = url;
    probe.onloadedmetadata = () => {
      const dur = probe.duration;
      setVideoDuration(dur);
      setTrimStart(0);
      setTrimEnd(Math.min(dur, TEMPLATE.scenes.footage.maxMs / 1000));
      setVideoReady(true);
    };
    probe.onerror = () => setError('Could not read video metadata.');
    probeRef.current = probe;
  }, [sourceUrl, outputUrl]);

  const handleRemoveFile = useCallback(() => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    setSourceFile(null);
    setSourceUrl(null);
    setVideoDuration(0);
    setVideoReady(false);
    setTrimStart(0);
    setTrimEnd(10);
    setOutputUrl(null);
    setRenderState('idle');
    setError(null);
  }, [sourceUrl, outputUrl]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      if (outputUrl) URL.revokeObjectURL(outputUrl);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── trim helpers ───────────────────────────────────────────────
  const footageDuration = trimEnd - trimStart;
  const totalDuration = useMemo(() => {
    const intro = TEMPLATE.scenes.intro.durationMs / 1000;
    const outro = TEMPLATE.scenes.outro.durationMs / 1000;
    return intro + footageDuration + outro;
  }, [footageDuration]);

  const handleTrimStartChange = useCallback((val) => {
    const v = Math.max(0, Math.min(val, trimEnd - 1));
    setTrimStart(parseFloat(v.toFixed(1)));
  }, [trimEnd]);

  const handleTrimEndChange = useCallback((val) => {
    const v = Math.max(trimStart + 1, Math.min(val, videoDuration));
    setTrimEnd(parseFloat(v.toFixed(1)));
  }, [trimStart, videoDuration]);

  // ── validation ─────────────────────────────────────────────────
  const validationErrors = useMemo(() => {
    const errs = [];
    if (!sourceFile) errs.push('Upload a source video.');
    if (footageDuration < TEMPLATE.scenes.footage.minMs / 1000) {
      errs.push(`Footage must be at least ${TEMPLATE.scenes.footage.minMs / 1000}s.`);
    }
    if (footageDuration > TEMPLATE.scenes.footage.maxMs / 1000) {
      errs.push(`Footage must be at most ${TEMPLATE.scenes.footage.maxMs / 1000}s.`);
    }
    if (!headline.trim() && !subhead.trim()) errs.push('Add at least a headline or subhead.');
    return errs;
  }, [sourceFile, footageDuration, headline, subhead]);

  const canRender = validationErrors.length === 0 && codecSupported && videoReady;

  // ── render ─────────────────────────────────────────────────────
  const handleRender = useCallback(async () => {
    if (!canRender) return;

    setRenderState('rendering');
    setRenderProgress(0);
    setError(null);
    if (outputUrl) { URL.revokeObjectURL(outputUrl); setOutputUrl(null); }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const blob = await renderVideo({
        sourceUrl,
        trimStart,
        trimEnd,
        headline: headline.trim(),
        subhead: subhead.trim(),
        cta: cta.trim() || 'Get Maximus Sports',
        watermark,
        templateId: TEMPLATE.id,
        onProgress: setRenderProgress,
        signal: controller.signal,
      });

      const url = URL.createObjectURL(blob);
      setOutputUrl(url);
      setRenderState('complete');
    } catch (err) {
      if (err.name === 'AbortError') {
        setRenderState('idle');
      } else {
        setError(err.message || 'Render failed.');
        setRenderState('error');
      }
    }
  }, [canRender, sourceUrl, trimStart, trimEnd, headline, subhead, cta, watermark, outputUrl]);

  const handleCancelRender = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleDownload = useCallback(() => {
    if (!outputUrl) return;
    const a = document.createElement('a');
    a.href = outputUrl;
    const name = projectName.trim()
      ? projectName.trim().replace(/[^a-zA-Z0-9_-]/g, '_')
      : 'maximus_reel';
    a.download = `${name}.mp4`;
    a.click();
  }, [outputUrl, projectName]);

  const handleReset = useCallback(() => {
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    setOutputUrl(null);
    setRenderState('idle');
    setRenderProgress(0);
    setError(null);
  }, [outputUrl]);

  // ── render UI ──────────────────────────────────────────────────
  return (
    <div className={styles.editor}>
      {/* ── LEFT: Controls ── */}
      <aside className={styles.controls}>

        {/* template indicator */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Template</div>
          <div className={styles.templateChip}>
            <span>✦</span> {TEMPLATE.name}
          </div>
        </div>

        {/* source upload */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Source Clip</div>
          {!sourceFile ? (
            <VideoUploader onFileSelected={handleFileSelected} disabled={renderState === 'rendering'} />
          ) : (
            <div className={styles.filePill}>
              <span style={{ fontSize: 16 }}>🎥</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className={styles.fileName}>{sourceFile.name}</div>
                <div className={styles.fileSize}>
                  {(sourceFile.size / 1024 / 1024).toFixed(1)} MB
                  {videoDuration > 0 && ` · ${videoDuration.toFixed(1)}s`}
                </div>
              </div>
              <button
                className={styles.fileRemove}
                onClick={handleRemoveFile}
                disabled={renderState === 'rendering'}
                title="Remove"
              >✕</button>
            </div>
          )}
        </div>

        {/* trim controls */}
        {videoReady && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Trim</div>
            <div className={styles.trimRow}>
              <div className={styles.trimField}>
                <div className={styles.fieldLabel}>Start</div>
                <div className={styles.trimInputWrap}>
                  <input
                    type="number"
                    className={styles.trimInput}
                    value={trimStart}
                    min={0}
                    max={trimEnd - 1}
                    step={0.1}
                    onChange={(e) => handleTrimStartChange(parseFloat(e.target.value) || 0)}
                  />
                  <span className={styles.trimUnit}>sec</span>
                </div>
              </div>
              <div className={styles.trimField}>
                <div className={styles.fieldLabel}>End</div>
                <div className={styles.trimInputWrap}>
                  <input
                    type="number"
                    className={styles.trimInput}
                    value={trimEnd}
                    min={trimStart + 1}
                    max={videoDuration}
                    step={0.1}
                    onChange={(e) => handleTrimEndChange(parseFloat(e.target.value) || 0)}
                  />
                  <span className={styles.trimUnit}>sec</span>
                </div>
              </div>
            </div>
            <input
              type="range"
              className={styles.trimSlider}
              min={0}
              max={videoDuration}
              step={0.1}
              value={trimEnd}
              onChange={(e) => handleTrimEndChange(parseFloat(e.target.value))}
            />
            <div className={styles.trimDuration}>
              footage {footageDuration.toFixed(1)}s · total {totalDuration.toFixed(1)}s
            </div>
          </div>
        )}

        {/* text fields */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Text Overlays</div>
          <div className={styles.fieldGroup}>
            <div>
              <div className={styles.fieldLabel}>Headline</div>
              <input
                className={styles.fieldInput}
                placeholder="e.g. Track your favorites in seconds"
                value={headline}
                maxLength={60}
                onChange={(e) => setHeadline(e.target.value)}
              />
              <div className={styles.charCount}>{headline.length}/60</div>
            </div>
            <div>
              <div className={styles.fieldLabel}>Subhead</div>
              <input
                className={styles.fieldInput}
                placeholder="e.g. Real-time scores, odds, and intel"
                value={subhead}
                maxLength={60}
                onChange={(e) => setSubhead(e.target.value)}
              />
              <div className={styles.charCount}>{subhead.length}/60</div>
            </div>
            <div>
              <div className={styles.fieldLabel}>CTA</div>
              <input
                className={styles.fieldInput}
                placeholder="Get Maximus Sports Free"
                value={cta}
                maxLength={40}
                onChange={(e) => setCta(e.target.value)}
              />
            </div>
            <div>
              <div className={styles.fieldLabel}>Project Name (optional)</div>
              <input
                className={styles.fieldInput}
                placeholder="e.g. Pinned Teams Demo"
                value={projectName}
                maxLength={40}
                onChange={(e) => setProjectName(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* options */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Options</div>
          <div className={styles.toggleRow}>
            <span className={styles.toggleLabel}>Logo watermark</span>
            <button
              className={styles.toggle}
              data-on={watermark}
              onClick={() => setWatermark(w => !w)}
            >
              <div className={styles.toggleKnob} />
            </button>
          </div>
        </div>

        {/* codec warning */}
        {codecSupported === false && (
          <div className={styles.errorBanner}>
            Your browser does not support H.264 encoding via WebCodecs.
            Please use Chrome 94+ or Safari 16.4+.
          </div>
        )}

        {/* validation errors */}
        {validationErrors.length > 0 && renderState === 'idle' && sourceFile && (
          <div className={styles.errorBanner}>
            {validationErrors.map((e, i) => <div key={i}>{e}</div>)}
          </div>
        )}

        {/* actions */}
        <div className={styles.actions}>
          {renderState === 'idle' || renderState === 'error' ? (
            <button
              className={styles.btnRender}
              disabled={!canRender}
              onClick={handleRender}
            >
              <span>▶</span> Render MP4
            </button>
          ) : renderState === 'rendering' ? (
            <>
              <div className={styles.progressWrap}>
                <div className={styles.progressBar}>
                  <div
                    className={styles.progressFill}
                    style={{ width: `${Math.round(renderProgress * 100)}%` }}
                  />
                </div>
                <div className={styles.progressText}>
                  Rendering… {Math.round(renderProgress * 100)}%
                </div>
              </div>
              <button className={styles.btnSecondary} onClick={handleCancelRender}>
                Cancel
              </button>
            </>
          ) : renderState === 'complete' ? (
            <div className={styles.successBanner}>
              <div className={styles.successTitle}>Reel ready</div>
              <div className={styles.successDetail}>
                {TEMPLATE.width}×{TEMPLATE.height} · H.264 · silent
              </div>
              <button className={styles.btnRender} onClick={handleDownload}>
                ⬇ Download MP4
              </button>
              <button className={styles.btnSecondary} onClick={handleReset}>
                Edit &amp; re-render
              </button>
            </div>
          ) : null}

          {error && renderState === 'error' && (
            <div className={styles.errorBanner}>{error}</div>
          )}
        </div>
      </aside>

      {/* ── RIGHT: Preview ── */}
      <section className={styles.previewArea}>
        <VideoPreview
          sourceUrl={sourceUrl}
          trimStart={trimStart}
          trimEnd={trimEnd}
          headline={headline}
          subhead={subhead}
        />

        <div className={styles.previewMeta}>
          <span className={styles.metaChip}>{TEMPLATE.width}×{TEMPLATE.height}</span>
          <span className={styles.metaChip}>{TEMPLATE.fps} fps</span>
          <span className={styles.metaChip}>H.264</span>
          <span className={styles.metaChip}>silent</span>
        </div>

        {/* output preview */}
        {outputUrl && (
          <div style={{ marginTop: 8, textAlign: 'center' }}>
            <video
              src={outputUrl}
              controls
              playsInline
              muted
              style={{
                maxWidth: 340,
                borderRadius: 14,
                boxShadow: '0 4px 24px rgba(0,0,0,0.35), 0 0 0 1px rgba(46,204,113,0.25)',
              }}
            />
            <div style={{
              fontSize: 10,
              color: 'rgba(46,204,113,0.6)',
              marginTop: 6,
              fontWeight: 600,
              letterSpacing: '0.08em',
            }}>
              RENDERED OUTPUT
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
