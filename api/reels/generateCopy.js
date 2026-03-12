/**
 * POST /api/reels/generateCopy
 *
 * Server-side OpenAI reel copy generation. Returns structured JSON
 * with headline, subhead, overlay beats, CTA, caption, and 3 variants.
 * The client adapter falls back to the heuristic engine on failure.
 *
 * Uses the same raw-fetch pattern as api/chat/teamSummary.js.
 */

const OPENAI_MODEL = 'gpt-4o-mini';
const MAX_TOKENS = 1200;
const TEMPERATURE = 0.7;
const OPENAI_TIMEOUT = 20000;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'openai_not_configured' });
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

    const userPrompt = `Generate reel copy for a Maximus Sports product video.

Inputs:
- promptContext: "${promptContext}"
- featureType: "${featureType}"
- templateType: "${templateType}"
- hookStyle: "${hookStyle}"
- ctaType: "${ctaType}"
- messageAngle: "${messageAngle}"
- copyIntensity: "${copyIntensity}"
- captionTone: "${captionTone}"
${analysisSummary ? `- analysisSummary: ${JSON.stringify(analysisSummary)}` : ''}
${editPlanSummary ? `- editPlanSummary: ${JSON.stringify(editPlanSummary)}` : ''}

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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT);

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!openaiRes.ok) {
      const errBody = await openaiRes.text();
      console.error('OpenAI reel gen error:', openaiRes.status, errBody);
      return res.status(502).json({ error: 'openai_request_failed' });
    }

    const data = await openaiRes.json();
    const text = data.choices?.[0]?.message?.content;

    if (!text) {
      return res.status(502).json({ error: 'openai_empty_response' });
    }

    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);

    if (!parsed.headline || !parsed.variants || !Array.isArray(parsed.variants)) {
      return res.status(502).json({ error: 'openai_invalid_shape' });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('OpenAI reel gen timeout');
      return res.status(504).json({ error: 'openai_timeout' });
    }
    console.error('OpenAI reel gen error:', err.message || err);
    return res.status(500).json({ error: 'generation_failed' });
  }
}
