import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import VideoUploader from './VideoUploader';
import VideoPreview from './VideoPreview';
import { getTemplate, CTA_TYPES } from './templates/featureSpotlight';
import { isRenderSupported, checkH264Support, renderVideo } from './render/renderVideo';
import { analyzeTrim } from './render/analyzeTrim';
import { generateReelText, generateVariantText } from './render/generateText';
import styles from './VideosEditor.module.css';

const TEMPLATE = getTemplate('feature-spotlight');

export default function VideosEditor() {
  // ── source file ────────────────────────────────────────────────
  const [sourceFile, setSourceFile] = useState(null);
  const [sourceUrl, setSourceUrl] = useState(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoReady, setVideoReady] = useState(false);
  const probeRef = useRef(null);

  // ── AI context ─────────────────────────────────────────────────
  const [promptContext, setPromptContext] = useState('');

  // ── fields ─────────────────────────────────────────────────────
  const [headline, setHeadline] = useState('');
  const [subhead, setSubhead] = useState('');
  const [cta, setCta] = useState(CTA_TYPES.website.defaultText);
  const [ctaType, setCtaType] = useState('website');
  const [projectName, setProjectName] = useState('');
  const [watermark, setWatermark] = useState(true);
  const [overlayBeats, setOverlayBeats] = useState(['', '', '']);

  // ── trim ───────────────────────────────────────────────────────
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(10);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [trimSuggested, setTrimSuggested] = useState(false);

  // ── render state ───────────────────────────────────────────────
  const [renderState, setRenderState] = useState('idle');
  const [renderProgress, setRenderProgress] = useState(0);
  const [outputUrl, setOutputUrl] = useState(null);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  // ── multi-variant state ────────────────────────────────────────
  const [variantOutputs, setVariantOutputs] = useState([]);
  const [variantRenderState, setVariantRenderState] = useState('idle');
  const [variantProgress, setVariantProgress] = useState(0);
  const [variantHooks, setVariantHooks] = useState([]);

  // ── capability check ───────────────────────────────────────────
  const [codecSupported, setCodecSupported] = useState(null);
  useEffect(() => {
    checkH264Support().then(setCodecSupported);
  }, []);

  // ── file handling ──────────────────────────────────────────────
  const handleFileSelected = useCallback((file) => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    if (outputUrl) { URL.revokeObjectURL(outputUrl); setOutputUrl(null); }
    setVariantOutputs([]);
    setVariantRenderState('idle');

    const url = URL.createObjectURL(file);
    setSourceFile(file);
    setSourceUrl(url);
    setVideoReady(false);
    setRenderState('idle');
    setError(null);
    setTrimSuggested(false);

    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.src = url;
    probe.onloadedmetadata = () => {
      const dur = probe.duration;
      setVideoDuration(dur);
      setTrimStart(0);
      setTrimEnd(Math.min(dur, TEMPLATE.scenes.footage.maxMs / 1000));
      setVideoReady(true);

      if (dur > 20) {
        runAutoTrim(url);
      }
    };
    probe.onerror = () => setError('Could not read video metadata.');
    probeRef.current = probe;
  }, [sourceUrl, outputUrl]);

  const runAutoTrim = useCallback(async (url) => {
    setAnalyzing(true);
    setAnalyzeProgress(0);
    try {
      const result = await analyzeTrim(url, setAnalyzeProgress);
      if (result.analyzed) {
        setTrimStart(result.trimStart);
        setTrimEnd(result.trimEnd);
        setTrimSuggested(true);
      }
    } catch {
      // analysis failed silently — user keeps manual trim
    } finally {
      setAnalyzing(false);
    }
  }, []);

  const handleRemoveFile = useCallback(() => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    variantOutputs.forEach(v => v.url && URL.revokeObjectURL(v.url));
    setSourceFile(null);
    setSourceUrl(null);
    setVideoDuration(0);
    setVideoReady(false);
    setTrimStart(0);
    setTrimEnd(10);
    setOutputUrl(null);
    setRenderState('idle');
    setError(null);
    setTrimSuggested(false);
    setVariantOutputs([]);
    setVariantRenderState('idle');
  }, [sourceUrl, outputUrl, variantOutputs]);

  useEffect(() => {
    return () => {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      if (outputUrl) URL.revokeObjectURL(outputUrl);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── AI text generation ─────────────────────────────────────────
  const handleGenerateText = useCallback(() => {
    if (!promptContext.trim()) return;
    const result = generateReelText(promptContext, ctaType);
    setHeadline(result.headline);
    setSubhead(result.subhead);
    setOverlayBeats(result.overlayBeats);
    if (ctaType !== 'custom') setCta(result.cta);
    setVariantHooks(result.variantHooks);
  }, [promptContext, ctaType]);

  // ── CTA type change ────────────────────────────────────────────
  const handleCtaTypeChange = useCallback((type) => {
    setCtaType(type);
    if (type !== 'custom' && CTA_TYPES[type]) {
      setCta(CTA_TYPES[type].defaultText);
    }
  }, []);

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
    setTrimSuggested(false);
  }, [trimEnd]);

  const handleTrimEndChange = useCallback((val) => {
    const v = Math.max(trimStart + 1, Math.min(val, videoDuration));
    setTrimEnd(parseFloat(v.toFixed(1)));
    setTrimSuggested(false);
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

  // ── single render ──────────────────────────────────────────────
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
        overlayBeats,
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
  }, [canRender, sourceUrl, trimStart, trimEnd, headline, subhead, cta, watermark, outputUrl, overlayBeats]);

  // ── multi-variant render ───────────────────────────────────────
  const handleRenderVariants = useCallback(async () => {
    if (!canRender) return;

    const hooks = variantHooks.length > 0
      ? variantHooks
      : generateReelText(promptContext || headline, ctaType).variantHooks;

    setVariantRenderState('rendering');
    setVariantProgress(0);
    setVariantOutputs([]);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    const results = [];

    try {
      for (let i = 0; i < hooks.length; i++) {
        const hook = hooks[i];
        const varText = generateVariantText(promptContext || headline, hook.tone);

        const blob = await renderVideo({
          sourceUrl,
          trimStart,
          trimEnd,
          headline: hook.headline || varText.headline,
          subhead: varText.subhead,
          cta: cta.trim() || 'Get Maximus Sports',
          watermark,
          templateId: TEMPLATE.id,
          overlayBeats: varText.overlayBeats,
          onProgress: (p) => setVariantProgress((i + p) / hooks.length),
          signal: controller.signal,
        });

        const url = URL.createObjectURL(blob);
        results.push({
          id: hook.id,
          tone: hook.tone,
          label: hook.tone.charAt(0).toUpperCase() + hook.tone.slice(1) + ' Hook',
          headline: hook.headline || varText.headline,
          url,
          blob,
        });
      }

      setVariantOutputs(results);
      setVariantRenderState('complete');
    } catch (err) {
      if (err.name === 'AbortError') {
        setVariantRenderState('idle');
      } else {
        setError(err.message || 'Variant render failed.');
        setVariantRenderState('error');
      }
    }
  }, [canRender, variantHooks, promptContext, headline, ctaType, sourceUrl, trimStart, trimEnd, cta, watermark]);

  const handleCancelRender = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleDownload = useCallback((url, suffix = '') => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    const name = projectName.trim()
      ? projectName.trim().replace(/[^a-zA-Z0-9_-]/g, '_')
      : 'maximus_reel';
    a.download = `${name}${suffix}.mp4`;
    a.click();
  }, [projectName]);

  const handleReset = useCallback(() => {
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    variantOutputs.forEach(v => v.url && URL.revokeObjectURL(v.url));
    setOutputUrl(null);
    setVariantOutputs([]);
    setRenderState('idle');
    setVariantRenderState('idle');
    setRenderProgress(0);
    setVariantProgress(0);
    setError(null);
  }, [outputUrl, variantOutputs]);

  // ── timeline structure (informational) ─────────────────────────
  const timelineSegments = useMemo(() => {
    const introS = TEMPLATE.scenes.intro.durationMs / 1000;
    const outroS = TEMPLATE.scenes.outro.durationMs / 1000;
    const total = introS + footageDuration + outroS;
    if (total <= 0) return [];
    return [
      { label: 'Intro', duration: introS, pct: (introS / total) * 100, color: '#3C79B4' },
      { label: 'Demo', duration: footageDuration, pct: (footageDuration / total) * 100, color: '#2ecc71' },
      { label: 'Beats', duration: 0, pct: 0, color: '#f39c12', isOverlay: true },
      { label: 'CTA', duration: outroS, pct: (outroS / total) * 100, color: '#e74c3c' },
    ];
  }, [footageDuration]);

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

        {/* AI prompt context */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>AI Context</div>
          <div className={styles.fieldLabel}>Describe what happens in this video</div>
          <textarea
            className={styles.promptTextarea}
            placeholder='e.g. "Demo of pinning a team", "Showing ATS leaderboard", "Tracking betting signals"'
            value={promptContext}
            maxLength={200}
            rows={3}
            onChange={(e) => setPromptContext(e.target.value)}
          />
          <div className={styles.promptActions}>
            <div className={styles.charCount}>{promptContext.length}/200</div>
            <button
              className={styles.btnGenerate}
              disabled={!promptContext.trim()}
              onClick={handleGenerateText}
            >
              ✦ Generate Text
            </button>
          </div>
        </div>

        {/* source upload */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Source Clip</div>
          {!sourceFile ? (
            <VideoUploader onFileSelected={handleFileSelected} disabled={renderState === 'rendering' || variantRenderState === 'rendering'} />
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
          {analyzing && (
            <div className={styles.analyzingBanner}>
              <div className={styles.analyzingDot} />
              Analyzing clip… {Math.round(analyzeProgress * 100)}%
            </div>
          )}
          {trimSuggested && !analyzing && (
            <div className={styles.suggestedBanner}>
              ✦ Smart trim suggested ({trimStart.toFixed(1)}s – {trimEnd.toFixed(1)}s)
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
            {videoDuration > 20 && !analyzing && !trimSuggested && (
              <button
                className={styles.btnSmall}
                onClick={() => runAutoTrim(sourceUrl)}
              >
                ✦ Auto-detect best segment
              </button>
            )}
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
          </div>
        </div>

        {/* overlay beats */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Overlay Beats</div>
          <div className={styles.beatsHint}>Short text snippets that appear during the demo section</div>
          <div className={styles.fieldGroup}>
            {overlayBeats.map((beat, i) => (
              <div key={i}>
                <div className={styles.fieldLabel}>Beat {i + 1}</div>
                <input
                  className={styles.fieldInput}
                  placeholder={`e.g. ${['Pin teams in seconds', 'Track ATS signals', 'Never miss a game'][i]}`}
                  value={beat}
                  maxLength={40}
                  onChange={(e) => {
                    const next = [...overlayBeats];
                    next[i] = e.target.value;
                    setOverlayBeats(next);
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* CTA options */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Call to Action</div>
          <div className={styles.ctaTypeRow}>
            {Object.values(CTA_TYPES).map((t) => (
              <button
                key={t.id}
                className={`${styles.ctaTypeBtn} ${ctaType === t.id ? styles.ctaTypeBtnActive : ''}`}
                onClick={() => handleCtaTypeChange(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <input
            className={styles.fieldInput}
            placeholder={ctaType === 'custom' ? 'Enter your CTA…' : CTA_TYPES[ctaType]?.defaultText}
            value={cta}
            maxLength={60}
            onChange={(e) => setCta(e.target.value)}
            readOnly={ctaType !== 'custom' && ctaType !== 'website'}
          />
        </div>

        {/* options */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Options</div>
          <div className={styles.fieldGroup}>
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
          {(renderState === 'idle' || renderState === 'error') && variantRenderState !== 'rendering' ? (
            <>
              <button
                className={styles.btnRender}
                disabled={!canRender}
                onClick={handleRender}
              >
                <span>▶</span> Render Reel
              </button>
              <button
                className={styles.btnVariant}
                disabled={!canRender}
                onClick={handleRenderVariants}
              >
                ✦ Render 3 Variants
              </button>
            </>
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
          ) : variantRenderState === 'rendering' ? (
            <>
              <div className={styles.progressWrap}>
                <div className={styles.progressBar}>
                  <div
                    className={styles.progressFill}
                    style={{ width: `${Math.round(variantProgress * 100)}%` }}
                  />
                </div>
                <div className={styles.progressText}>
                  Rendering variants… {Math.round(variantProgress * 100)}%
                </div>
              </div>
              <button className={styles.btnSecondary} onClick={handleCancelRender}>
                Cancel
              </button>
            </>
          ) : renderState === 'complete' && variantRenderState !== 'complete' ? (
            <div className={styles.successBanner}>
              <div className={styles.successTitle}>Reel ready</div>
              <div className={styles.successDetail}>
                {TEMPLATE.width}×{TEMPLATE.height} · H.264 · silent
              </div>
              <button className={styles.btnRender} onClick={() => handleDownload(outputUrl)}>
                ⬇ Download MP4
              </button>
              <button className={styles.btnVariant} onClick={handleRenderVariants} disabled={!canRender}>
                ✦ Also render 3 variants
              </button>
              <button className={styles.btnSecondary} onClick={handleReset}>
                Edit &amp; re-render
              </button>
            </div>
          ) : null}

          {error && (renderState === 'error' || variantRenderState === 'error') && (
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
          overlayBeats={overlayBeats}
        />

        <div className={styles.previewMeta}>
          <span className={styles.metaChip}>{TEMPLATE.width}×{TEMPLATE.height}</span>
          <span className={styles.metaChip}>{TEMPLATE.fps} fps</span>
          <span className={styles.metaChip}>H.264</span>
          <span className={styles.metaChip}>silent</span>
        </div>

        {/* timeline indicator */}
        {videoReady && timelineSegments.length > 0 && (
          <div className={styles.timelineWrap}>
            <div className={styles.timelineLabel}>Reel Structure</div>
            <div className={styles.timelineBar}>
              {timelineSegments.filter(s => !s.isOverlay).map((seg) => (
                <div
                  key={seg.label}
                  className={styles.timelineSegment}
                  style={{ width: `${seg.pct}%`, background: seg.color }}
                  title={`${seg.label}: ${seg.duration.toFixed(1)}s`}
                />
              ))}
            </div>
            <div className={styles.timelineLabels}>
              {timelineSegments.filter(s => !s.isOverlay).map((seg) => (
                <span key={seg.label} className={styles.timelineLabelItem} style={{ color: seg.color }}>
                  {seg.label} {seg.duration.toFixed(1)}s
                </span>
              ))}
            </div>
          </div>
        )}

        {/* single output preview */}
        {outputUrl && variantRenderState !== 'complete' && (
          <div className={styles.outputWrap}>
            <video
              src={outputUrl}
              controls
              playsInline
              muted
              className={styles.outputVideo}
            />
            <div className={styles.outputLabel}>RENDERED OUTPUT</div>
          </div>
        )}

        {/* variant outputs */}
        {variantRenderState === 'complete' && variantOutputs.length > 0 && (
          <div className={styles.variantSection}>
            <div className={styles.variantTitle}>Your 3 Reel Variants</div>
            <div className={styles.variantGrid}>
              {variantOutputs.map((v) => (
                <div key={v.id} className={styles.variantCard}>
                  <video
                    src={v.url}
                    controls
                    playsInline
                    muted
                    className={styles.variantVideo}
                  />
                  <div className={styles.variantInfo}>
                    <div className={styles.variantLabel}>{v.label}</div>
                    <div className={styles.variantHeadline}>"{v.headline}"</div>
                    <button
                      className={styles.btnSmall}
                      onClick={() => handleDownload(v.url, `_${v.id}`)}
                    >
                      ⬇ Download
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button className={styles.btnSecondary} onClick={handleReset} style={{ marginTop: 12 }}>
              Edit &amp; re-render
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
