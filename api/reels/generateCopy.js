/**
 * POST /api/reels/generateCopy
 *
 * Server-side Claude reel copy generation. Returns structured JSON
 * with headline, subhead, overlay beats, CTA, caption, and 3 variants.
 *
 * Uses config/aiModels.js for model selection and timeout.
 * Validates output shape before returning.
 */

import { requireAdminOrCron } from '../_lib/requireAuth.js';
import { claudeComplete, isClaudeConfigured } from '../_lib/claude.js';
import {
  REEL_COPY_MODEL,
  REEL_COPY_MAX_TOKENS,
  REEL_COPY_TIMEOUT_MS,
} from '../../config/aiModels.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!(await requireAdminOrCron(req, res))) return;

  if (!isClaudeConfigured()) {
    return res.status(500).json({ error: 'llm_not_configured' });
  }

  try {
    const {
      promptContext = '',
      featureType = 'generalDemo',
      templateType = 'feature-spotlight',
      hookStyle = 'product',
      ctaType = 'website',
      messageAngle = 'demo',
      copyIntensity = 'balanced',
      captionTone = 'instagram',
      analysisSummary = null,
      editPlanSummary = null,
    } = req.body || {};

    const systemPrompt = `You generate premium short-form social video creative for Maximus Sports — a sports intelligence platform with real-time scores, ATS signals, team intel, odds data, and betting analytics.

Tone rules:
- mobile readable (short lines, punchy phrasing)
- premium and sharp (not generic SaaS copy)
- high engagement / scroll-stopping
- viral-ready for Instagram Reels and TikTok
- NOT cheesy, spammy, or clickbait
- sports-tech native (knows the audience)

Copy intensity "${copyIntensity}":
${copyIntensity === 'clean' ? '- Minimal, editorial. Short sentences. Max 5 words per headline.' : ''}
${copyIntensity === 'balanced' ? '- Standard marketing energy. Clear and compelling.' : ''}
${copyIntensity === 'bold' ? '- High energy. Urgent. Emphatic. Stronger hooks.' : ''}

Caption tone "${captionTone}":
${captionTone === 'instagram' ? '- Instagram native. Casual but polished. Use line breaks. Include relevant hashtags.' : ''}
${captionTone === 'brand' ? '- Clean brand voice. Professional. No hashtags. Concise.' : ''}
${captionTone === 'betting' ? '- Sharp bettor audience. Data-forward. Credibility-focused. Include betting hashtags.' : ''}
${captionTone === 'hype' ? '- Fan energy. Excitement. Emojis OK (tasteful). Hype-driven hashtags.' : ''}

Always return ONLY valid JSON. No markdown. No explanation. No code fences.`;

    const editPlanBlock = editPlanSummary
      ? `\n- editPlanSummary: segments=${editPlanSummary.segmentCount || '?'}, heroMoments=${editPlanSummary.heroMoments || '?'}, originalDuration=${editPlanSummary.originalDuration || '?'}s, reelDuration=${editPlanSummary.reelDuration || '?'}s, speedRamps=${editPlanSummary.hasSpeedRamps ? 'yes' : 'no'}`
      : '';

    const analysisBlock = analysisSummary
      ? `\n- analysisSummary: avgActivity=${analysisSummary.avgActivity || '?'}, peakMoments=${analysisSummary.peakMoments || '?'}, feature="${analysisSummary.feature || 'general'}", demoDuration=${analysisSummary.demoDuration || '?'}s`
      : '';

    const userPrompt = `Generate reel copy for a Maximus Sports product video.

Inputs:
- promptContext: "${promptContext}"
- featureType: "${featureType}"
- templateType: "${templateType}"
- hookStyle: "${hookStyle}"
- ctaType: "${ctaType}"
- messageAngle: "${messageAngle}"
- copyIntensity: "${copyIntensity}"
- captionTone: "${captionTone}"${analysisBlock}${editPlanBlock}

CTA destination "${ctaType}" means:
${ctaType === 'website' ? 'Direct to maximussports.ai signup' : ''}
${ctaType === 'instagram' ? 'Follow @maximussports.ai on Instagram' : ''}
${ctaType === 'explore' ? 'Explore the product at maximussports.ai' : ''}
${ctaType === 'intel' ? 'Get team intel at maximussports.ai' : ''}
${ctaType === 'custom' ? 'Custom CTA (leave empty)' : ''}

Return JSON in this exact shape:
{
  "headline": "...",
  "subhead": "...",
  "overlayBeats": ["...", "...", "..."],
  "cta": "...",
  "caption": "...",
  "variants": [
    { "id": "product", "tone": "product", "headline": "...", "subhead": "...", "overlayBeats": ["...", "...", "..."], "cta": "..." },
    { "id": "betting", "tone": "betting", "headline": "...", "subhead": "...", "overlayBeats": ["...", "...", "..."], "cta": "..." },
    { "id": "curiosity", "tone": "curiosity", "headline": "...", "subhead": "...", "overlayBeats": ["...", "...", "..."], "cta": "..." }
  ]
}

Rules:
- Headlines: max 8 words, punchy, scroll-stopping
- Subheads: max 15 words, clear benefit
- Overlay beats: max 5 words each, action-oriented
- CTA: include maximussports.ai or @maximussports.ai as appropriate
- Caption: 3-5 lines, matches the tone setting
- Each variant must feel DISTINCT, not just a rephrasing
- product variant: utility/feature-forward
- betting variant: edge/data-forward
- curiosity variant: scroll-stopping/contrarian`;

    const text = await claudeComplete({
      system: systemPrompt,
      user: userPrompt,
      maxTokens: REEL_COPY_MAX_TOKENS,
      timeoutMs: REEL_COPY_TIMEOUT_MS,
      model: REEL_COPY_MODEL,
      editorial: false, // marketing copy, not written from sports data
    });

    if (!text) {
      return res.status(502).json({ error: 'llm_empty_response' });
    }

    const cleaned = extractJsonObject(text);
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('Claude reel gen: invalid JSON', cleaned.slice(0, 200));
      return res.status(502).json({ error: 'llm_invalid_json' });
    }

    if (!validateOutput(parsed)) {
      console.error('Claude reel gen: invalid shape', JSON.stringify(parsed).slice(0, 200));
      return res.status(502).json({ error: 'llm_invalid_shape' });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    if (err?.code === 'timeout') {
      console.error('Claude reel gen timeout');
      return res.status(504).json({ error: 'llm_timeout' });
    }
    if (err?.code === 'http_error' || err?.code === 'network_error') {
      console.error('Claude reel gen error:', err.message);
      return res.status(502).json({ error: 'llm_request_failed' });
    }
    console.error('Claude reel gen error:', err.message || err);
    return res.status(500).json({ error: 'generation_failed' });
  }
}

/** Strip code fences and any prose around the JSON object the model returned. */
function extractJsonObject(text) {
  const unfenced = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  return start !== -1 && end > start ? unfenced.slice(start, end + 1) : unfenced;
}

function validateOutput(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (typeof obj.headline !== 'string' || !obj.headline) return false;
  if (typeof obj.caption !== 'string') return false;
  if (!Array.isArray(obj.variants) || obj.variants.length === 0) return false;
  for (const v of obj.variants) {
    if (!v || typeof v.headline !== 'string' || !v.headline) return false;
  }
  return true;
}
