import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import VideoUploader from './VideoUploader';
import VideoPreview from './VideoPreview';
import {
  getTemplate,
  TEMPLATES,
  CTA_TYPES,
  FEATURE_TYPES,
  HOOK_STYLES,
} from './templates/featureSpotlight';
import { isRenderSupported, checkH264Support, renderVideo } from './render/renderVideo';
import { analyzeTrim, beatPeaksToTimings } from './render/analyzeTrim';
import { generateReelText, generateVariantText, detectFeatureType } from './render/generateText';
import { generateCoverImage, downloadBlob } from './render/coverExport';
import { saveProject, loadLastProject, listProjects, deleteProject } from './render/projectStore';
import { scoreVariants } from './render/scoreVariant';
import styles from './VideosEditor.module.css';

export default function VideosEditor() {
  // ── template ───────────────────────────────────────────────────
  const [templateId, setTemplateId] = useState('feature-spotlight');
  const template = useMemo(() => getTemplate(templateId), [templateId]);

  // ── source file ────────────────────────────────────────────────
  const [sourceFile, setSourceFile] = useState(null);
  const [sourceUrl, setSourceUrl] = useState(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoReady, setVideoReady] = useState(false);
  const probeRef = useRef(null);

  // ── structured inputs ──────────────────────────────────────────
  const [promptContext, setPromptContext] = useState('');
  const [featureType, setFeatureType] = useState('generalDemo');
  const [hookStyle, setHookStyle] = useState('product');

  // ── fields ─────────────────────────────────────────────────────
  const [headline, setHeadline] = useState('');
  const [subhead, setSubhead] = useState('');
  const [cta, setCta] = useState(CTA_TYPES.website.defaultText);
  const [ctaType, setCtaType] = useState('website');
  const [projectName, setProjectName] = useState('');
  const [watermark, setWatermark] = useState(true);
  const [overlayBeats, setOverlayBeats] = useState(['', '', '']);

  // ── trim + analysis ────────────────────────────────────────────
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(10);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [trimSuggested, setTrimSuggested] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);

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

  // ── project persistence ────────────────────────────────────────
  const [projectId, setProjectId] = useState(null);
  const [savedProjects, setSavedProjects] = useState([]);
  const [showProjectList, setShowProjectList] = useState(false);

  // ── capability check ───────────────────────────────────────────
  const [codecSupported, setCodecSupported] = useState(null);
  useEffect(() => {
    checkH264Support().then(setCodecSupported);
    setSavedProjects(listProjects());
  }, []);

  // ── dynamic beat timings from analysis ─────────────────────────
  const beatTimings = useMemo(() => {
    if (!analysisResult?.beatPeaks?.length) return null;
    const numBeats = template.overlayBeats?.length || 3;
    return beatPeaksToTimings(analysisResult.beatPeaks, trimStart, trimEnd, numBeats);
  }, [analysisResult, trimStart, trimEnd, template]);

  // ── adjust overlay beats count when template changes ───────────
  useEffect(() => {
    const beatCount = template.overlayBeats?.length || 3;
    setOverlayBeats(prev => {
      if (prev.length === beatCount) return prev;
      const next = Array.from({ length: beatCount }, (_, i) => prev[i] || '');
      return next;
    });
  }, [template]);

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
    setAnalysisResult(null);

    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.src = url;
    probe.onloadedmetadata = () => {
      const dur = probe.duration;
      setVideoDuration(dur);
      setTrimStart(0);
      setTrimEnd(Math.min(dur, template.scenes.footage.maxMs / 1000));
      setVideoReady(true);

      if (dur > 20) {
        runAutoTrim(url);
      }
    };
    probe.onerror = () => setError('Could not read video metadata.');
    probeRef.current = probe;
  }, [sourceUrl, outputUrl, template]);

  const runAutoTrim = useCallback(async (url) => {
    setAnalyzing(true);
    setAnalyzeProgress(0);
    try {
      const result = await analyzeTrim(url, setAnalyzeProgress);
      if (result.analyzed) {
        setTrimStart(result.trimStart);
        setTrimEnd(result.trimEnd);
        setTrimSuggested(true);
        setAnalysisResult(result);
      }
    } catch {
      // analysis failed — user keeps manual trim
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
    setAnalysisResult(null);
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
    const resolved = featureType === 'generalDemo' && promptContext.trim()
      ? detectFeatureType(promptContext)
      : featureType;

    if (resolved !== featureType) setFeatureType(resolved);

    const result = generateReelText(promptContext, ctaType, resolved, hookStyle);
    setHeadline(result.headline);
    setSubhead(result.subhead);
    setOverlayBeats(prev => {
      const beats = result.overlayBeats || [];
      return Array.from({ length: prev.length }, (_, i) => beats[i] || prev[i] || '');
    });
    if (ctaType !== 'custom') setCta(result.cta);
    setVariantHooks(result.variantHooks);
  }, [promptContext, ctaType, featureType, hookStyle]);

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
    const intro = template.scenes.intro.durationMs / 1000;
    const outro = template.scenes.outro.durationMs / 1000;
    return intro + footageDuration + outro;
  }, [footageDuration, template]);

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
    if (footageDuration < template.scenes.footage.minMs / 1000) {
      errs.push(`Footage must be at least ${template.scenes.footage.minMs / 1000}s.`);
    }
    if (footageDuration > template.scenes.footage.maxMs / 1000) {
      errs.push(`Footage must be at most ${template.scenes.footage.maxMs / 1000}s.`);
    }
    if (!headline.trim() && !subhead.trim()) errs.push('Add at least a headline or subhead.');
    return errs;
  }, [sourceFile, footageDuration, headline, subhead, template]);

  const canRender = validationErrors.length === 0 && codecSupported && videoReady;

  // ── project persistence ────────────────────────────────────────
  const handleSaveProject = useCallback(() => {
    const proj = saveProject({
      id: projectId,
      projectName,
      promptContext,
      featureType,
      hookStyle,
      headline,
      subhead,
      overlayBeats,
      cta,
      ctaType,
      trimStart,
      trimEnd,
      watermark,
      templateId,
      sourceFileName: sourceFile?.name || null,
      videoDuration,
    });
    setProjectId(proj.id);
    setSavedProjects(listProjects());
  }, [projectId, projectName, promptContext, featureType, hookStyle, headline, subhead, overlayBeats, cta, ctaType, trimStart, trimEnd, watermark, templateId, sourceFile, videoDuration]);

  const handleLoadProject = useCallback((proj) => {
    setProjectId(proj.id);
    setProjectName(proj.name || '');
    setPromptContext(proj.promptContext || '');
    setFeatureType(proj.featureType || 'generalDemo');
    setHookStyle(proj.hookStyle || 'product');
    setHeadline(proj.headline || '');
    setSubhead(proj.subhead || '');
    setOverlayBeats(proj.overlayBeats || ['', '', '']);
    setCta(proj.cta || '');
    setCtaType(proj.ctaType || 'website');
    setTrimStart(proj.trimStart ?? 0);
    setTrimEnd(proj.trimEnd ?? 10);
    setWatermark(proj.watermark ?? true);
    setTemplateId(proj.templateId || 'feature-spotlight');
    setShowProjectList(false);
  }, []);

  const handleDeleteProject = useCallback((id) => {
    deleteProject(id);
    setSavedProjects(listProjects());
  }, []);

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
        templateId,
        overlayBeats,
        beatTimings,
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
  }, [canRender, sourceUrl, trimStart, trimEnd, headline, subhead, cta, watermark, outputUrl, overlayBeats, beatTimings, templateId]);

  // ── multi-variant render ───────────────────────────────────────
  const handleRenderVariants = useCallback(async () => {
    if (!canRender) return;

    const hooks = variantHooks.length > 0
      ? variantHooks
      : generateReelText(promptContext || headline, ctaType, featureType, hookStyle).variantHooks;

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
        const varText = generateVariantText(promptContext || headline, hook.tone, featureType);

        const blob = await renderVideo({
          sourceUrl,
          trimStart,
          trimEnd,
          headline: hook.headline || varText.headline,
          subhead: varText.subhead,
          cta: cta.trim() || 'Get Maximus Sports',
          watermark,
          templateId,
          overlayBeats: varText.overlayBeats,
          beatTimings,
          onProgress: (p) => setVariantProgress((i + p) / hooks.length),
          signal: controller.signal,
        });

        const videoUrl = URL.createObjectURL(blob);

        let coverBlob = null;
        try {
          coverBlob = await generateCoverImage({
            headline: hook.headline || varText.headline,
            templateId,
          });
        } catch {
          // cover generation failed — not critical
        }

        results.push({
          id: hook.id,
          tone: hook.tone,
          label: hook.tone.charAt(0).toUpperCase() + hook.tone.slice(1) + ' Hook',
          headline: hook.headline || varText.headline,
          url: videoUrl,
          blob,
          coverBlob,
        });
      }

      const scored = scoreVariants(results, { cta, featureType });
      setVariantOutputs(scored);
      setVariantRenderState('complete');
    } catch (err) {
      if (err.name === 'AbortError') {
        setVariantRenderState('idle');
      } else {
        setError(err.message || 'Variant render failed.');
        setVariantRenderState('error');
      }
    }
  }, [canRender, variantHooks, promptContext, headline, ctaType, featureType, hookStyle, sourceUrl, trimStart, trimEnd, cta, watermark, templateId, beatTimings]);

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

  const handleDownloadCover = useCallback((coverBlob, suffix = '') => {
    if (!coverBlob) return;
    const name = projectName.trim()
      ? projectName.trim().replace(/[^a-zA-Z0-9_-]/g, '_')
      : 'maximus_reel';
    downloadBlob(coverBlob, `${name}${suffix}_cover.png`);
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

  // ── timeline structure ─────────────────────────────────────────
  const timelineSegments = useMemo(() => {
    const introS = template.scenes.intro.durationMs / 1000;
    const outroS = template.scenes.outro.durationMs / 1000;
    const total = introS + footageDuration + outroS;
    if (total <= 0) return [];
    return [
      { label: 'Intro', duration: introS, pct: (introS / total) * 100, color: '#3C79B4' },
      { label: 'Demo', duration: footageDuration, pct: (footageDuration / total) * 100, color: '#2ecc71' },
      { label: 'CTA', duration: outroS, pct: (outroS / total) * 100, color: '#e74c3c' },
    ];
  }, [footageDuration, template]);

  const beatMarkers = useMemo(() => {
    if (!beatTimings || !footageDuration) return [];
    const introS = template.scenes.intro.durationMs / 1000;
    const outroS = template.scenes.outro.durationMs / 1000;
    const total = introS + footageDuration + outroS;
    const introPct = introS / total;
    const demoPct = footageDuration / total;

    return beatTimings.map((bt, i) => ({
      label: `Beat ${i + 1}`,
      leftPct: (introPct + bt.startPct * demoPct) * 100,
      widthPct: ((bt.endPct - bt.startPct) * demoPct) * 100,
    }));
  }, [beatTimings, footageDuration, template]);

  const isRendering = renderState === 'rendering' || variantRenderState === 'rendering';

  // ── render UI ──────────────────────────────────────────────────
  return (
    <div className={styles.editor}>
      {/* ── LEFT: Controls ── */}
      <aside className={styles.controls}>

        {/* template + project bar */}
        <div className={styles.section}>
          <div className={styles.topBar}>
            <div>
              <div className={styles.sectionTitle}>Template</div>
              <div className={styles.chipRow}>
                {TEMPLATES.map(t => (
                  <button
                    key={t.id}
                    className={`${styles.templateChip} ${templateId === t.id ? styles.templateChipActive : ''}`}
                    onClick={() => setTemplateId(t.id)}
                    disabled={isRendering}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.projectActions}>
              <button className={styles.btnIcon} onClick={handleSaveProject} title="Save draft">
                💾
              </button>
              <button
                className={styles.btnIcon}
                onClick={() => setShowProjectList(p => !p)}
                title="Recent projects"
              >
                📂
              </button>
            </div>
          </div>
          {showProjectList && (
            <div className={styles.projectList}>
              {savedProjects.length === 0 ? (
                <div className={styles.projectEmpty}>No saved projects</div>
              ) : savedProjects.map(p => (
                <div key={p.id} className={styles.projectItem}>
                  <button className={styles.projectLoad} onClick={() => handleLoadProject(p)}>
                    <span className={styles.projectName}>{p.name}</span>
                    <span className={styles.projectDate}>
                      {new Date(p.savedAt).toLocaleDateString()}
                    </span>
                  </button>
                  <button className={styles.projectDelete} onClick={() => handleDeleteProject(p.id)}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AI context + structured inputs */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>AI Context</div>
          <div className={styles.fieldLabel}>Describe what happens in this video</div>
          <textarea
            className={styles.promptTextarea}
            placeholder='e.g. "Demo of pinning a team", "Showing ATS leaderboard"'
            value={promptContext}
            maxLength={200}
            rows={2}
            onChange={(e) => setPromptContext(e.target.value)}
          />

          <div className={styles.fieldLabel} style={{ marginTop: 10 }}>Feature Type</div>
          <div className={styles.chipRow}>
            {Object.values(FEATURE_TYPES).map((ft) => (
              <button
                key={ft.id}
                className={`${styles.chipBtn} ${featureType === ft.id ? styles.chipBtnActive : ''}`}
                onClick={() => setFeatureType(ft.id)}
              >
                {ft.label}
              </button>
            ))}
          </div>

          <div className={styles.fieldLabel} style={{ marginTop: 10 }}>Hook Style</div>
          <div className={styles.chipRow}>
            {Object.values(HOOK_STYLES).map((hs) => (
              <button
                key={hs.id}
                className={`${styles.chipBtn} ${hookStyle === hs.id ? styles.chipBtnActive : ''}`}
                onClick={() => setHookStyle(hs.id)}
              >
                {hs.label}
              </button>
            ))}
          </div>

          <div className={styles.promptActions}>
            <div className={styles.charCount}>{promptContext.length}/200</div>
            <button
              className={styles.btnGenerate}
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
            <VideoUploader onFileSelected={handleFileSelected} disabled={isRendering} />
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
                disabled={isRendering}
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
              {analysisResult?.beatPeaks?.length > 0 && (
                <span> · {analysisResult.beatPeaks.length} activity peaks found</span>
              )}
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
              <button className={styles.btnSmall} onClick={() => runAutoTrim(sourceUrl)}>
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
          <div className={styles.beatsHint}>
            Short text snippets during the demo
            {beatTimings && <span className={styles.beatsBadge}>activity-timed</span>}
          </div>
          <div className={styles.fieldGroup}>
            {overlayBeats.map((beat, i) => (
              <div key={i}>
                <div className={styles.fieldLabel}>Beat {i + 1}</div>
                <input
                  className={styles.fieldInput}
                  placeholder={`e.g. ${(FEATURE_TYPES[featureType]?.beats || [])[i] || 'Beat text…'}`}
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
          <div className={styles.chipRow}>
            {Object.values(CTA_TYPES).map((t) => (
              <button
                key={t.id}
                className={`${styles.chipBtn} ${ctaType === t.id ? styles.chipBtnActive : ''}`}
                onClick={() => handleCtaTypeChange(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <input
            className={styles.fieldInput}
            style={{ marginTop: 8 }}
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
              <button className={styles.btnRender} disabled={!canRender} onClick={handleRender}>
                <span>▶</span> Render Reel
              </button>
              <button className={styles.btnVariant} disabled={!canRender} onClick={handleRenderVariants}>
                ✦ Render 3 Variants
              </button>
            </>
          ) : renderState === 'rendering' ? (
            <>
              <div className={styles.progressWrap}>
                <div className={styles.progressBar}>
                  <div className={styles.progressFill} style={{ width: `${Math.round(renderProgress * 100)}%` }} />
                </div>
                <div className={styles.progressText}>Rendering… {Math.round(renderProgress * 100)}%</div>
              </div>
              <button className={styles.btnSecondary} onClick={handleCancelRender}>Cancel</button>
            </>
          ) : variantRenderState === 'rendering' ? (
            <>
              <div className={styles.progressWrap}>
                <div className={styles.progressBar}>
                  <div className={styles.progressFill} style={{ width: `${Math.round(variantProgress * 100)}%` }} />
                </div>
                <div className={styles.progressText}>Rendering variants… {Math.round(variantProgress * 100)}%</div>
              </div>
              <button className={styles.btnSecondary} onClick={handleCancelRender}>Cancel</button>
            </>
          ) : renderState === 'complete' && variantRenderState !== 'complete' ? (
            <div className={styles.successBanner}>
              <div className={styles.successTitle}>Reel ready</div>
              <div className={styles.successDetail}>
                {template.width}×{template.height} · H.264 · silent
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
          beatTimings={beatTimings}
        />

        <div className={styles.previewMeta}>
          <span className={styles.metaChip}>{template.width}×{template.height}</span>
          <span className={styles.metaChip}>{template.fps} fps</span>
          <span className={styles.metaChip}>H.264</span>
          <span className={styles.metaChip}>silent</span>
        </div>

        {/* enhanced timeline */}
        {videoReady && timelineSegments.length > 0 && (
          <div className={styles.timelineWrap}>
            <div className={styles.timelineLabel}>Reel Structure</div>
            <div className={styles.timelineBar}>
              {timelineSegments.map((seg) => (
                <div
                  key={seg.label}
                  className={styles.timelineSegment}
                  style={{ width: `${seg.pct}%`, background: seg.color }}
                  title={`${seg.label}: ${seg.duration.toFixed(1)}s`}
                />
              ))}
            </div>
            {beatMarkers.length > 0 && (
              <div className={styles.timelineBeatRow}>
                {beatMarkers.map((bm, i) => (
                  <div
                    key={i}
                    className={styles.timelineBeatMarker}
                    style={{ left: `${bm.leftPct}%`, width: `${bm.widthPct}%` }}
                    title={bm.label}
                  />
                ))}
              </div>
            )}
            <div className={styles.timelineLabels}>
              {timelineSegments.map((seg) => (
                <span key={seg.label} className={styles.timelineLabelItem} style={{ color: seg.color }}>
                  {seg.label} {seg.duration.toFixed(1)}s
                </span>
              ))}
            </div>
            {beatMarkers.length > 0 && (
              <div className={styles.timelineBeatLabel}>
                {beatMarkers.length} beat{beatMarkers.length > 1 ? 's' : ''} timed to activity peaks
              </div>
            )}
          </div>
        )}

        {/* single output preview */}
        {outputUrl && variantRenderState !== 'complete' && (
          <div className={styles.outputWrap}>
            <video src={outputUrl} controls playsInline muted className={styles.outputVideo} />
            <div className={styles.outputLabel}>RENDERED OUTPUT</div>
          </div>
        )}

        {/* variant outputs */}
        {variantRenderState === 'complete' && variantOutputs.length > 0 && (
          <div className={styles.variantSection}>
            <div className={styles.variantTitle}>Your 3 Reel Variants</div>
            <div className={styles.variantGrid}>
              {variantOutputs.map((v) => (
                <div key={v.id} className={`${styles.variantCard} ${v.recommended ? styles.variantCardRecommended : ''}`}>
                  {v.recommended && (
                    <div className={styles.recommendedBadge}>Recommended</div>
                  )}
                  <video src={v.url} controls playsInline muted className={styles.variantVideo} />
                  <div className={styles.variantInfo}>
                    <div className={styles.variantLabel}>{v.label}</div>
                    <div className={styles.variantHeadline}>"{v.headline}"</div>
                    <div className={styles.variantBtnRow}>
                      <button
                        className={styles.btnSmall}
                        onClick={() => handleDownload(v.url, `_${v.id}`)}
                      >
                        ⬇ MP4
                      </button>
                      {v.coverBlob && (
                        <button
                          className={styles.btnSmall}
                          onClick={() => handleDownloadCover(v.coverBlob, `_${v.id}`)}
                        >
                          🖼 Cover
                        </button>
                      )}
                    </div>
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
