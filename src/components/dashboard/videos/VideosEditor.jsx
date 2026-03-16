import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import VideoUploader from './VideoUploader';
import VideoPreview from './VideoPreview';
import {
  getTemplate,
  TEMPLATES,
  CTA_TYPES,
  FEATURE_TYPES,
  HOOK_STYLES,
  MESSAGE_ANGLES,
  COPY_INTENSITIES,
  CAPTION_TONES,
} from './templates/featureSpotlight';
import { isRenderSupported, checkH264Support, renderVideo } from './render/renderVideo';
import { analyzeTrim, beatPeaksToTimings } from './render/analyzeTrim';
import { generate as generateCopy, GENERATION_MODES } from './render/generationAdapter';
import { generateVariantText, detectFeatureType } from './render/generateText';
import { generateCoverImage, generateCoverSet, downloadBlob } from './render/coverExport';
import { saveProject, loadLastProject, listProjects, deleteProject } from './render/projectStore';
import { scoreVariants, buildPostingPackage } from './render/scoreVariant';
import { buildEditPlan, editPlanBeatTimings } from './render/editPlan';
import { exportBundle } from './render/bundleExport';
import { computeProportionalTrimLength } from '../../../utils/reels/smartTrim';
import BackgroundColorSelector, { DEFAULT_BG_COLOR, resolveTextColor } from '../../reels/BackgroundColorSelector';
import { HOOK_ANIMATION_VARIANTS } from './render/drawUtils';
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
  const [messageAngle, setMessageAngle] = useState('demo');
  const [copyIntensity, setCopyIntensity] = useState('balanced');
  const [captionTone, setCaptionTone] = useState('instagram');

  // ── fields ─────────────────────────────────────────────────────
  const [headline, setHeadline] = useState('');
  const [subhead, setSubhead] = useState('');
  const [cta, setCta] = useState(CTA_TYPES.website.defaultText);
  const [ctaType, setCtaType] = useState('website');
  const [caption, setCaption] = useState('');
  const [projectName, setProjectName] = useState('');
  const [watermark, setWatermark] = useState(true);
  const [overlayBeats, setOverlayBeats] = useState(['', '', '']);
  const [bgColor, setBgColor] = useState(DEFAULT_BG_COLOR);
  const [hookAnimationVariant, setHookAnimationVariant] = useState(null);

  const textColor = resolveTextColor(bgColor);

  // ── trim + analysis ────────────────────────────────────────────
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(10);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [trimSuggested, setTrimSuggested] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [editMode, setEditMode] = useState('smart');

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

  // ── generation state ───────────────────────────────────────────
  const [genState, setGenState] = useState('idle');
  const [genMode, setGenMode] = useState(null);

  // ── project persistence ────────────────────────────────────────
  const [projectId, setProjectId] = useState(null);
  const [savedProjects, setSavedProjects] = useState([]);
  const [showProjectList, setShowProjectList] = useState(false);

  // ── posting package ────────────────────────────────────────────
  const [postingPackage, setPostingPackage] = useState(null);

  // ── capability check ───────────────────────────────────────────
  const [codecSupported, setCodecSupported] = useState(null);
  useEffect(() => {
    checkH264Support().then(setCodecSupported);
    setSavedProjects(listProjects());
  }, []);

  // ── edit plan from analysis ────────────────────────────────────
  const currentEditPlan = useMemo(() => {
    if (editMode !== 'smart' || !analysisResult?.scores?.length) return null;
    const srcDuration = analysisResult.fullDuration || videoDuration;
    const proportionalTarget = computeProportionalTrimLength(srcDuration);
    return buildEditPlan(analysisResult.scores, analysisResult.sampleInterval, srcDuration, {
      targetDuration: proportionalTarget,
      fps: template.fps,
      beatCount: template.overlayBeats?.length || 3,
    });
  }, [editMode, analysisResult, videoDuration, template]);

  // ── dynamic beat timings ───────────────────────────────────────
  const beatTimings = useMemo(() => {
    if (currentEditPlan?.beatPositions?.length) {
      const numBeats = template.overlayBeats?.length || 3;
      return editPlanBeatTimings(currentEditPlan, numBeats);
    }
    if (!analysisResult?.beatPeaks?.length) return null;
    const numBeats = template.overlayBeats?.length || 3;
    return beatPeaksToTimings(analysisResult.beatPeaks, trimStart, trimEnd, numBeats);
  }, [currentEditPlan, analysisResult, trimStart, trimEnd, template]);

  // ── adjust overlay beats count when template changes ───────────
  useEffect(() => {
    const beatCount = template.overlayBeats?.length || 3;
    setOverlayBeats(prev => {
      if (prev.length === beatCount) return prev;
      return Array.from({ length: beatCount }, (_, i) => prev[i] || '');
    });
  }, [template]);

  // ── file handling ──────────────────────────────────────────────
  const handleFileSelected = useCallback((file) => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    if (outputUrl) { URL.revokeObjectURL(outputUrl); setOutputUrl(null); }
    setVariantOutputs([]);
    setVariantRenderState('idle');
    setPostingPackage(null);

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
      runAutoTrim(url);
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
      // analysis failed
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
    setPostingPackage(null);
  }, [sourceUrl, outputUrl, variantOutputs]);

  useEffect(() => {
    return () => {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      if (outputUrl) URL.revokeObjectURL(outputUrl);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── auto-generate copy ─────────────────────────────────────────
  const handleAutoGenerate = useCallback(async () => {
    setGenState('generating');
    setGenMode(null);
    try {
      const analysisSummary = analysisResult ? {
        segmentCount: analysisResult.segments?.length || 0,
        peakCount: analysisResult.beatPeaks?.length || 0,
        fullDuration: analysisResult.fullDuration || videoDuration,
      } : null;

      const editPlanSummary = currentEditPlan ? {
        segmentCount: currentEditPlan.segmentCount,
        totalOutputDuration: currentEditPlan.totalOutputDuration,
        hasSpeedRamps: currentEditPlan.segments.some(s => s.speed > 1.05),
      } : null;

      const result = await generateCopy({
        promptContext,
        featureType: featureType === 'generalDemo' ? null : featureType,
        hookStyle,
        templateId,
        ctaDestination: ctaType,
        messageAngle,
        copyIntensity,
        captionTone,
        clipDuration: videoDuration || null,
        analysisSummary,
        editPlanSummary,
      });

      setHeadline(result.headline);
      setSubhead(result.subhead);
      setOverlayBeats(prev => {
        const beats = result.overlayBeats || [];
        return Array.from({ length: prev.length }, (_, i) => beats[i] || prev[i] || '');
      });
      if (ctaType !== 'custom') setCta(result.cta);
      setVariantHooks(result.variantHooks);
      setCaption(result.caption);
      setGenMode(result.generationMode || GENERATION_MODES.heuristic);
      setGenState(result.generationMode === GENERATION_MODES.llm ? 'llm_success' : 'heuristic_success');

      if (result.detectedFeatureType !== featureType && featureType === 'generalDemo') {
        setFeatureType(result.detectedFeatureType);
      }
    } catch {
      setGenState('error');
    }
  }, [promptContext, featureType, hookStyle, templateId, ctaType, messageAngle, copyIntensity, captionTone, videoDuration, analysisResult, currentEditPlan]);

  useEffect(() => {
    if (!promptContext.trim() || promptContext.length < 3) return;
    const timer = setTimeout(() => {
      handleAutoGenerate();
    }, 600);
    return () => clearTimeout(timer);
  }, [promptContext, featureType, hookStyle, messageAngle, copyIntensity, ctaType, captionTone]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── generate fresh variants (copy only, no re-render) ──────────
  const handleFreshVariants = useCallback(async () => {
    setGenState('generating');
    try {
      const result = await generateCopy({
        promptContext: promptContext || headline,
        featureType,
        hookStyle,
        templateId,
        ctaDestination: ctaType,
        messageAngle,
        copyIntensity,
        captionTone,
        clipDuration: videoDuration || null,
      });

      setVariantHooks(result.variantHooks);
      setCaption(result.caption);
      setHeadline(result.headline);
      setSubhead(result.subhead);
      setOverlayBeats(prev => {
        const beats = result.overlayBeats || [];
        return Array.from({ length: prev.length }, (_, i) => beats[i] || prev[i] || '');
      });
      setGenMode(result.generationMode || GENERATION_MODES.heuristic);
      setGenState(result.generationMode === GENERATION_MODES.llm ? 'llm_success' : 'heuristic_success');
    } catch {
      setGenState('error');
    }
  }, [promptContext, headline, featureType, hookStyle, templateId, ctaType, messageAngle, copyIntensity, captionTone, videoDuration]);

  // ── CTA type change ────────────────────────────────────────────
  const handleCtaTypeChange = useCallback((type) => {
    setCtaType(type);
    if (type !== 'custom' && CTA_TYPES[type]) {
      setCta(CTA_TYPES[type].defaultText);
    }
  }, []);

  // ── trim helpers ───────────────────────────────────────────────
  const footageDuration = useMemo(() => {
    if (editMode === 'smart' && currentEditPlan) {
      return currentEditPlan.totalOutputDuration;
    }
    return trimEnd - trimStart;
  }, [editMode, currentEditPlan, trimStart, trimEnd]);

  const totalDuration = useMemo(() => {
    const intro = 1.2;
    const outro = 2.2;
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
    if (editMode !== 'smart') {
      const rawDur = trimEnd - trimStart;
      if (rawDur < template.scenes.footage.minMs / 1000) {
        errs.push(`Footage must be at least ${template.scenes.footage.minMs / 1000}s.`);
      }
      if (rawDur > template.scenes.footage.maxMs / 1000) {
        errs.push(`Footage must be at most ${template.scenes.footage.maxMs / 1000}s.`);
      }
    }
    if (!headline.trim() && !subhead.trim()) errs.push('Add context or generate text first.');
    return errs;
  }, [sourceFile, editMode, trimStart, trimEnd, headline, subhead, template]);

  const canRender = validationErrors.length === 0 && codecSupported && videoReady;

  // ── project persistence ────────────────────────────────────────
  const handleSaveProject = useCallback(() => {
    const proj = saveProject({
      id: projectId,
      projectName,
      promptContext,
      featureType,
      hookStyle,
      messageAngle,
      copyIntensity,
      captionTone,
      headline,
      subhead,
      overlayBeats,
      cta,
      ctaType,
      caption,
      trimStart,
      trimEnd,
      editMode,
      watermark,
      templateId,
      sourceFileName: sourceFile?.name || null,
      videoDuration,
      bgColor,
      hookAnimationVariant,
    });
    setProjectId(proj.id);
    setSavedProjects(listProjects());
  }, [projectId, projectName, promptContext, featureType, hookStyle, messageAngle, copyIntensity, captionTone, headline, subhead, overlayBeats, cta, ctaType, caption, trimStart, trimEnd, editMode, watermark, templateId, sourceFile, videoDuration, bgColor, hookAnimationVariant]);

  const handleLoadProject = useCallback((proj) => {
    setProjectId(proj.id);
    setProjectName(proj.name || '');
    setPromptContext(proj.promptContext || '');
    setFeatureType(proj.featureType || 'generalDemo');
    setHookStyle(proj.hookStyle || 'product');
    setMessageAngle(proj.messageAngle || 'demo');
    setCopyIntensity(proj.copyIntensity || 'balanced');
    setCaptionTone(proj.captionTone || 'instagram');
    setHeadline(proj.headline || '');
    setSubhead(proj.subhead || '');
    setOverlayBeats(proj.overlayBeats || ['', '', '']);
    setCta(proj.cta || '');
    setCtaType(proj.ctaType || 'website');
    setCaption(proj.caption || '');
    setTrimStart(proj.trimStart ?? 0);
    setTrimEnd(proj.trimEnd ?? 10);
    setEditMode(proj.editMode || 'smart');
    setWatermark(proj.watermark ?? true);
    setTemplateId(proj.templateId || 'feature-spotlight');
    setBgColor(proj.bgColor || DEFAULT_BG_COLOR);
    setHookAnimationVariant(proj.hookAnimationVariant || null);
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
        editPlan: editMode === 'smart' ? currentEditPlan : null,
        headline: headline.trim(),
        subhead: subhead.trim(),
        cta: cta.trim() || 'Get Maximus Sports',
        watermark,
        templateId,
        hookStyle,
        hookAnimationVariant,
        textColor,
        bgColor,
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
  }, [canRender, sourceUrl, trimStart, trimEnd, editMode, currentEditPlan, headline, subhead, cta, watermark, outputUrl, overlayBeats, beatTimings, templateId, hookStyle, hookAnimationVariant, textColor, bgColor]);

  // ── multi-variant render ───────────────────────────────────────
  const handleRenderVariants = useCallback(async () => {
    if (!canRender) return;

    let hooks = variantHooks;
    if (hooks.length === 0) {
      const gen = await generateCopy({
        promptContext: promptContext || headline,
        featureType,
        hookStyle,
        ctaDestination: ctaType,
        messageAngle,
        copyIntensity,
        captionTone,
      });
      hooks = gen.variantHooks;
    }

    setVariantRenderState('rendering');
    setVariantProgress(0);
    setVariantOutputs([]);
    setError(null);
    setPostingPackage(null);

    const controller = new AbortController();
    abortRef.current = controller;

    const results = [];

    try {
      for (let i = 0; i < hooks.length; i++) {
        const hook = hooks[i];

        const variantCopy = hook.subhead
          ? { headline: hook.headline, subhead: hook.subhead, overlayBeats: hook.overlayBeats || [] }
          : generateVariantText(promptContext || headline, hook.tone, featureType, messageAngle, copyIntensity);

        const blob = await renderVideo({
          sourceUrl,
          trimStart,
          trimEnd,
          editPlan: editMode === 'smart' ? currentEditPlan : null,
          headline: hook.headline || variantCopy.headline,
          subhead: variantCopy.subhead,
          cta: hook.cta || cta.trim() || 'Get Maximus Sports',
          watermark,
          templateId,
          hookStyle,
          hookAnimationVariant,
          textColor,
          bgColor,
          overlayBeats: variantCopy.overlayBeats?.length ? variantCopy.overlayBeats : overlayBeats,
          beatTimings,
          onProgress: (p) => setVariantProgress((i + p) / hooks.length),
          signal: controller.signal,
        });

        const videoUrl = URL.createObjectURL(blob);

        let coverBlob = null;
        let coverSet = null;
        try {
          coverSet = await generateCoverSet({
            headline: hook.headline || variantCopy.headline,
            sourceUrl,
            seekTime: analysisResult?.beatPeaks?.[0]?.time ?? trimStart + 2,
            templateId,
          });
          coverBlob = coverSet.frameCover || coverSet.introCover;
        } catch {
          // cover generation failed
        }

        results.push({
          id: hook.id,
          tone: hook.tone,
          label: hook.tone.charAt(0).toUpperCase() + hook.tone.slice(1) + ' Hook',
          headline: hook.headline || variantCopy.headline,
          url: videoUrl,
          blob,
          coverBlob,
          coverType: coverSet?.recommended || 'intro',
          introCoverBlob: coverSet?.introCover || null,
          frameCoverBlob: coverSet?.frameCover || null,
        });
      }

      const scored = scoreVariants(results, { cta, featureType });
      setVariantOutputs(scored);
      setVariantRenderState('complete');

      const pkg = buildPostingPackage(scored, {
        caption,
        featureType,
        hookStyle,
      });
      setPostingPackage(pkg);
    } catch (err) {
      if (err.name === 'AbortError') {
        setVariantRenderState('idle');
      } else {
        setError(err.message || 'Variant render failed.');
        setVariantRenderState('error');
      }
    }
  }, [canRender, variantHooks, promptContext, headline, ctaType, featureType, hookStyle, messageAngle, copyIntensity, captionTone, sourceUrl, trimStart, trimEnd, editMode, currentEditPlan, cta, watermark, templateId, overlayBeats, beatTimings, analysisResult, caption, hookAnimationVariant, textColor, bgColor]);

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

  const handleExportBundle = useCallback(async () => {
    if (variantOutputs.length === 0) return;
    await exportBundle(variantOutputs, {
      projectName: projectName.trim() || 'maximus_reel',
      caption,
      featureType,
      hookStyle,
      messageAngle,
      templateId,
    });
  }, [variantOutputs, projectName, caption, featureType, hookStyle, messageAngle, templateId]);

  const handleCopyCaption = useCallback(() => {
    if (caption) navigator.clipboard?.writeText(caption);
  }, [caption]);

  const handleCopyPostingPackage = useCallback(() => {
    if (!postingPackage) return;
    const rec = postingPackage.recommendedVariant;
    const text = [
      rec ? `Best variant: ${rec.tone} hook — "${rec.headline}"` : '',
      rec?.explanation ? `Why: ${rec.explanation}` : '',
      postingPackage.coverExplanation ? `Cover: ${postingPackage.coverExplanation}` : '',
      postingPackage.hookStyleSummary ? `Style: ${postingPackage.hookStyleSummary}` : '',
      caption ? `\nCaption:\n${caption}` : '',
    ].filter(Boolean).join('\n');
    navigator.clipboard?.writeText(text);
  }, [postingPackage, caption]);

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
    setPostingPackage(null);
  }, [outputUrl, variantOutputs]);

  // ── timeline structure ─────────────────────────────────────────
  const timelineSegments = useMemo(() => {
    const introS = 1.2;
    const outroS = 2.2;
    const total = introS + footageDuration + outroS;
    if (total <= 0) return [];
    return [
      { label: 'Intro', duration: introS, pct: (introS / total) * 100, color: template.brand.accentColor },
      { label: 'Demo', duration: footageDuration, pct: (footageDuration / total) * 100, color: '#2ecc71' },
      { label: 'CTA', duration: outroS, pct: (outroS / total) * 100, color: '#e74c3c' },
    ];
  }, [footageDuration, template.brand.accentColor]);

  const beatMarkers = useMemo(() => {
    if (!beatTimings || !footageDuration) return [];
    const introS = 1.2;
    const outroS = 2.2;
    const total = introS + footageDuration + outroS;
    const introPct = introS / total;
    const demoPct = footageDuration / total;

    return beatTimings.map((bt, i) => ({
      label: `Beat ${i + 1}`,
      leftPct: (introPct + bt.startPct * demoPct) * 100,
      widthPct: ((bt.endPct - bt.startPct) * demoPct) * 100,
    }));
  }, [beatTimings, footageDuration]);

  const isRendering = renderState === 'rendering' || variantRenderState === 'rendering';

  const genStateBadge = genState === 'generating'
    ? { text: 'Generating reel copy…', cls: styles.genBadgeLoading }
    : genState === 'llm_success'
      ? { text: 'AI-generated', cls: styles.genBadgeLlm }
      : genState === 'heuristic_success'
        ? { text: 'Using fallback engine', cls: styles.genBadgeFallback }
        : genState === 'error'
          ? { text: 'Generation failed', cls: styles.genBadgeError }
          : null;

  // ── edit plan summary ──────────────────────────────────────────
  const editPlanSummary = useMemo(() => {
    if (!currentEditPlan) return null;
    const heroCount = currentEditPlan.segments.filter(s => s.type === 'hero').length;
    const hasRamps = currentEditPlan.segments.some(s => s.speed > 1.05);
    return {
      segmentCount: currentEditPlan.segmentCount,
      heroCount,
      compressedFrom: videoDuration,
      compressedTo: currentEditPlan.totalOutputDuration,
      hasRamps,
    };
  }, [currentEditPlan, videoDuration]);

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

        {/* creative direction */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Creative Direction</div>
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

          <div className={styles.fieldLabel} style={{ marginTop: 10 }}>Message Angle</div>
          <div className={styles.chipRow}>
            {Object.values(MESSAGE_ANGLES).map((ma) => (
              <button
                key={ma.id}
                className={`${styles.chipBtn} ${messageAngle === ma.id ? styles.chipBtnActive : ''}`}
                onClick={() => setMessageAngle(ma.id)}
              >
                {ma.label}
              </button>
            ))}
          </div>

          <div className={styles.fieldLabel} style={{ marginTop: 10 }}>Copy Intensity</div>
          <div className={styles.chipRow}>
            {Object.values(COPY_INTENSITIES).map((ci) => (
              <button
                key={ci.id}
                className={`${styles.chipBtn} ${copyIntensity === ci.id ? styles.chipBtnActive : ''}`}
                onClick={() => setCopyIntensity(ci.id)}
              >
                {ci.label}
              </button>
            ))}
          </div>

          <div className={styles.fieldLabel} style={{ marginTop: 10 }}>Caption Tone</div>
          <div className={styles.chipRow}>
            {Object.values(CAPTION_TONES).map((ct) => (
              <button
                key={ct.id}
                className={`${styles.chipBtn} ${captionTone === ct.id ? styles.chipBtnActive : ''}`}
                onClick={() => setCaptionTone(ct.id)}
              >
                {ct.label}
              </button>
            ))}
          </div>

          <div className={styles.fieldLabel} style={{ marginTop: 10 }}>CTA Destination</div>
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

          <div className={styles.promptActions}>
            <div className={styles.charCount}>{promptContext.length}/200</div>
            <button
              className={styles.btnGenerate}
              onClick={handleAutoGenerate}
              disabled={genState === 'generating'}
            >
              {genState === 'generating' ? '⏳ Generating…' : '✦ Generate Reel Copy'}
            </button>
          </div>
        </div>

        {/* generation state indicator */}
        {genStateBadge && (
          <div className={`${styles.genBanner} ${genStateBadge.cls}`}>
            {genState === 'generating' && <div className={styles.analyzingDot} />}
            {genStateBadge.text}
          </div>
        )}

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
              ✦ Full clip analyzed
              {analysisResult?.segments?.length > 0 && (
                <span> · {analysisResult.segments.length} segments found</span>
              )}
              {analysisResult?.beatPeaks?.length > 0 && (
                <span> · {analysisResult.beatPeaks.length} activity peaks</span>
              )}
            </div>
          )}
        </div>

        {/* edit mode + trim controls */}
        {videoReady && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Edit Mode</div>
            <div className={styles.chipRow} style={{ marginBottom: 10 }}>
              <button
                className={`${styles.chipBtn} ${editMode === 'smart' ? styles.chipBtnActive : ''}`}
                onClick={() => setEditMode('smart')}
              >
                ✦ Smart Cuts
              </button>
              <button
                className={`${styles.chipBtn} ${editMode === 'manual' ? styles.chipBtnActive : ''}`}
                onClick={() => setEditMode('manual')}
              >
                Manual Trim
              </button>
            </div>

            {editMode === 'smart' && editPlanSummary ? (
              <div className={styles.editPlanSummary}>
                <div className={styles.editPlanSummaryRow}>
                  <span className={styles.editPlanSummaryLabel}>Segments selected</span>
                  <span className={styles.editPlanSummaryValue}>{editPlanSummary.segmentCount}</span>
                </div>
                <div className={styles.editPlanSummaryRow}>
                  <span className={styles.editPlanSummaryLabel}>Hero moments</span>
                  <span className={styles.editPlanSummaryValue}>{editPlanSummary.heroCount}</span>
                </div>
                <div className={styles.editPlanSummaryRow}>
                  <span className={styles.editPlanSummaryLabel}>Compressed from</span>
                  <span className={styles.editPlanSummaryValue}>
                    {editPlanSummary.compressedFrom.toFixed(1)}s → {editPlanSummary.compressedTo.toFixed(1)}s
                  </span>
                </div>
                <div className={styles.editPlanSummaryRow}>
                  <span className={styles.editPlanSummaryLabel}>Speed ramps</span>
                  <span className={styles.editPlanSummaryValue}>
                    {editPlanSummary.hasRamps ? 'subtle' : 'none'}
                  </span>
                </div>
              </div>
            ) : editMode === 'smart' && !analysisResult ? (
              <div className={styles.editPlanDetail}>
                {analyzing ? 'Analyzing...' : 'Upload a clip to enable smart cuts'}
              </div>
            ) : null}

            {editMode === 'manual' && (
              <>
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
              </>
            )}

            <div className={styles.trimDuration}>
              footage {footageDuration.toFixed(1)}s · total {totalDuration.toFixed(1)}s
            </div>
          </div>
        )}

        {/* generated copy (editable) */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            Generated Copy
            {headline && genMode === GENERATION_MODES.llm && <span className={styles.genBadgeLlm}>AI-generated</span>}
            {headline && genMode === GENERATION_MODES.heuristic && <span className={styles.autoGenBadge}>auto-generated</span>}
          </div>
          <div className={styles.fieldGroup}>
            <div>
              <div className={styles.fieldLabel}>Headline</div>
              <input
                className={styles.fieldInput}
                placeholder="Auto-generated from context…"
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
                placeholder="Auto-generated from context…"
                value={subhead}
                maxLength={80}
                onChange={(e) => setSubhead(e.target.value)}
              />
              <div className={styles.charCount}>{subhead.length}/80</div>
            </div>
          </div>
        </div>

        {/* overlay beats */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Overlay Beats</div>
          <div className={styles.beatsHint}>
            Short text snippets during the demo
            {beatTimings && <span className={styles.beatsBadge}>activity-timed</span>}
            {editMode === 'smart' && currentEditPlan?.segments.some(s => s.speed > 1.05) && (
              <span className={styles.speedBadge}>speed-ramped</span>
            )}
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

        {/* CTA text */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Call to Action</div>
          <input
            className={styles.fieldInput}
            placeholder={ctaType === 'custom' ? 'Enter your CTA…' : CTA_TYPES[ctaType]?.defaultText}
            value={cta}
            maxLength={60}
            onChange={(e) => setCta(e.target.value)}
            readOnly={ctaType !== 'custom' && ctaType !== 'website'}
          />
        </div>

        {/* background color */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Background Color</div>
          <BackgroundColorSelector
            value={bgColor}
            onChange={setBgColor}
            disabled={isRendering}
          />
        </div>

        {/* hook animation */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Hook Animation</div>
          <div className={styles.chipRow}>
            <button
              className={`${styles.chipBtn} ${!hookAnimationVariant ? styles.chipBtnActive : ''}`}
              onClick={() => setHookAnimationVariant(null)}
              disabled={isRendering}
            >
              Auto
            </button>
            {HOOK_ANIMATION_VARIANTS.map(v => (
              <button
                key={v}
                className={`${styles.chipBtn} ${hookAnimationVariant === v ? styles.chipBtnActive : ''}`}
                onClick={() => setHookAnimationVariant(v)}
                disabled={isRendering}
              >
                {v.replace('-', ' ')}
              </button>
            ))}
          </div>
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
              <button className={styles.btnRender} disabled={!canRender} onClick={handleRenderVariants}>
                ✦ Generate 3 Reel Variants
              </button>
              <button className={styles.btnSecondary} disabled={!canRender} onClick={handleRender}>
                <span>▶</span> Render Single Reel
              </button>
              {variantRenderState === 'complete' && (
                <button className={styles.btnVariant} onClick={handleFreshVariants}>
                  ✦ Generate Fresh Copy Variants
                </button>
              )}
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
                <div className={styles.progressText}>Generating variants… {Math.round(variantProgress * 100)}%</div>
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
                ✦ Also generate 3 variants
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
          editPlan={editMode === 'smart' ? currentEditPlan : null}
        />

        <div className={styles.previewMeta}>
          <span className={styles.metaChip}>{template.width}×{template.height}</span>
          <span className={styles.metaChip}>{template.fps} fps</span>
          <span className={styles.metaChip}>H.264</span>
          <span className={styles.metaChip}>silent</span>
          {editMode === 'smart' && currentEditPlan && (
            <span className={styles.metaChip} style={{ color: template.brand.accentColor }}>
              {currentEditPlan.segmentCount} cuts
            </span>
          )}
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
                    <div className={styles.recommendedBadge}>
                      Recommended
                    </div>
                  )}
                  <video src={v.url} controls playsInline muted className={styles.variantVideo} />
                  <div className={styles.variantInfo}>
                    <div className={styles.variantLabel}>{v.label}</div>
                    <div className={styles.variantHookPreview}>{v.headline}</div>
                    {v.explanation && (
                      <div className={styles.variantExplanation}>{v.explanation}</div>
                    )}
                    {v.score != null && (
                      <div className={styles.variantScore}>Score: {(v.score * 100).toFixed(0)}/100</div>
                    )}
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
                      {v.frameCoverBlob && v.introCoverBlob && (
                        <button
                          className={styles.btnSmall}
                          onClick={() => handleDownloadCover(
                            v.coverType === 'frame' ? v.introCoverBlob : v.frameCoverBlob,
                            `_${v.id}_alt`
                          )}
                        >
                          🖼 Alt Cover
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* posting package */}
            {postingPackage && (
              <div className={styles.postingPackage}>
                <div className={styles.postingTitle}>Posting Package</div>
                <div className={styles.postingMeta}>
                  {postingPackage.recommendedVariant && (
                    <>
                      <div className={styles.postingRow}>
                        <span className={styles.postingLabel}>Best variant:</span>
                        <span className={styles.postingValue}>
                          {postingPackage.recommendedVariant.tone?.charAt(0).toUpperCase() + postingPackage.recommendedVariant.tone?.slice(1)} hook
                        </span>
                      </div>
                      {postingPackage.recommendedVariant.explanation && (
                        <div className={styles.postingRow}>
                          <span className={styles.postingLabel}>Why:</span>
                          <span className={styles.postingExplanation}>
                            {postingPackage.recommendedVariant.explanation}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                  {postingPackage.hookStyleSummary && (
                    <div className={styles.postingRow}>
                      <span className={styles.postingLabel}>Hook style:</span>
                      <span className={styles.postingValue}>{postingPackage.hookStyleSummary}</span>
                    </div>
                  )}
                  {postingPackage.coverExplanation && (
                    <div className={styles.postingRow}>
                      <span className={styles.postingLabel}>Cover:</span>
                      <span className={styles.postingExplanation}>{postingPackage.coverExplanation}</span>
                    </div>
                  )}
                </div>
                {caption && (
                  <div className={styles.captionWrap}>
                    <div className={styles.captionHeader}>
                      <span className={styles.fieldLabel}>Caption</span>
                      <button className={styles.btnSmall} onClick={handleCopyCaption}>
                        📋 Copy Caption
                      </button>
                    </div>
                    <div className={styles.captionText}>{caption}</div>
                  </div>
                )}
                <div className={styles.postingActions}>
                  <button className={styles.btnRender} onClick={handleExportBundle}>
                    📦 Download Full Bundle
                  </button>
                  <button className={styles.btnSecondary} onClick={handleCopyPostingPackage} style={{ marginTop: 6 }}>
                    📋 Copy Full Posting Package
                  </button>
                  <button className={styles.btnVariant} onClick={handleFreshVariants} style={{ marginTop: 6 }}>
                    ✦ Generate Fresh Variants
                  </button>
                </div>
              </div>
            )}

            <button className={styles.btnSecondary} onClick={handleReset} style={{ marginTop: 12 }}>
              Edit &amp; re-render
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
