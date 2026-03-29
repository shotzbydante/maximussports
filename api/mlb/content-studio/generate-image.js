/**
 * POST /api/mlb/content-studio/generate-image
 *
 * Generates a single MLB IG card image using Google Gemini.
 *
 * Request body: normalized MlbImagePayload
 * Response: { ok, imageBase64, mimeType, promptVersion, model, metadata }
 *
 * Server-side only — API key never exposed to frontend.
 */

import { GoogleGenAI } from '@google/genai';

// ── Centralized model config ─────────────────────────────────────────────────
const GEMINI_MODEL = process.env.GEMINI_IMAGE_MODEL || 'models/gemini-2.5-flash-image';
const PROMPT_VERSION = 'mlb-gemini-v2';

// ── Prompt builder (deterministic UI rendering — content passed verbatim) ────

const DESIGN_SYSTEM = `
DESIGN SYSTEM (STRICT):

Canvas:
- Size: 1080x1350 (4:5 portrait)
- Safe padding: 80px all sides
- Max content width: 860px
- Vertical stacked layout

Background:
- Deep navy (#0A1628) base
- Burgundy radial glow (#8B1A2B) from center
- Subtle stadium lighting effect in background
- Light cinematic grain texture

Header (Top Center):
- "MAXIMUS SPORTS" in bold white uppercase, letter-spacing 0.12em
- Below: "MLB INTELLIGENCE" badge — burgundy pill with white text, rounded

Date:
- Small, centered below header
- Light opacity white text

Main Glass Card:
- Frosted glass panel
- Background: rgba(10, 22, 40, 0.55) with backdrop blur
- Border: 1px solid rgba(255, 255, 255, 0.08)
- Border radius: 16px
- Padding: 28px inside

Headline:
- Bold white text, large size
- Max 3 lines
- Tight letter spacing

Body Content:
- Clean bullet points with subtle markers
- Good line spacing for readability
- White text, slightly lower opacity than headline

Footer:
- "maximussports.ai" — small, centered
- "For entertainment only • 21+" — tiny disclaimer

STYLE:
- Premium, sleek, glassy
- ESPN broadcast quality × Apple design × Bloomberg Terminal
- Clean structured UI — NOT a poster, NOT a collage
- Mobile-first readability
`.trim();

const CRITICAL_RULES = `
CRITICAL RULES:
- DO NOT rewrite, summarize, or reinterpret ANY content
- DO NOT invent data, stats, or text
- DO NOT add new text beyond what is provided
- Use the EXACT text provided in the CONTENT section
- Focus ONLY on layout, hierarchy, typography, and visual polish
- Render this as a structured UI card, not a creative graphic
`.trim();

const AVOID_BLOCK = `
AVOID:
- Collage layouts or multiple separate panels
- Poster-style creative graphics
- Tiny unreadable text
- Stock imagery or photos
- Cluttered compositions
- Invented or hallucinated logos
- Extra text beyond what is specified in CONTENT
- Cartoonish or clip-art style
- Bright neon colors
- Multi-slide or carousel formats
`.trim();

function buildSectionPrompt(payload) {
  const section = payload.section || 'daily-briefing';
  const headline = payload.headline || 'MLB Intelligence';
  const subhead = payload.subhead || '';
  const date = payload.dateLabel || '';

  // For daily briefing, use intelBriefing if available
  const intel = payload.intelBriefing;
  const bullets = (intel?.bullets || payload.bullets || []).slice(0, 5);
  const matchups = intel?.keyMatchups || payload.keyMatchups || [];
  const signals = payload.signals || [];

  const bulletBlock = bullets.map((b, i) => `  ${i + 1}. ${b}`).join('\n');
  const matchupBlock = matchups.length > 0
    ? matchups.map(m => `  ${m.teamA} vs ${m.teamB}`).join('\n')
    : '';
  const signalBlock = signals.map(s => `  - ${s}`).join('\n');

  let contentBlock = '';

  switch (section) {
    case 'daily-briefing':
      contentBlock = `
BADGE: MLB DAILY BRIEFING
DATE: ${date}
HEADLINE: ${intel?.headline || headline}
${bulletBlock ? `BULLETS:\n${bulletBlock}` : ''}
${matchupBlock ? `MATCHUPS:\n${matchupBlock}` : ''}

SECTION DIRECTION:
- Full-slate editorial feel — authoritative morning briefing
- Headline dominates the glass card
- Bullets listed cleanly below
- Matchups as compact row near bottom if present
`.trim();
      break;

    case 'team-intel':
      contentBlock = `
BADGE: MLB TEAM INTEL
HEADLINE: ${headline}
SUBHEAD: ${subhead}
${bulletBlock ? `BULLETS:\n${bulletBlock}` : ''}

SECTION DIRECTION:
- Team-centric hero feel
- Dramatic spotlight/vignette
- Glass panel with structured intel bullets
`.trim();
      break;

    case 'league-intel': {
      const lg = payload.league || 'AL';
      const fullName = lg === 'AL' ? 'American League' : 'National League';
      contentBlock = `
BADGE: ${fullName.toUpperCase()} INTEL
HEADLINE: ${headline}
SUBHEAD: ${subhead}
${bulletBlock ? `BULLETS:\n${bulletBlock}` : ''}

SECTION DIRECTION:
- League-race competitive feel
- Subtle standings visual element
`.trim();
      break;
    }

    case 'division-intel':
      contentBlock = `
BADGE: ${(payload.division || 'AL EAST').toUpperCase()} INTEL
HEADLINE: ${headline}
SUBHEAD: ${subhead}
${bulletBlock ? `BULLETS:\n${bulletBlock}` : ''}

SECTION DIRECTION:
- Division-race intensity
- Glass panels suggesting team rankings
`.trim();
      break;

    case 'game-insights': {
      const away = payload.teamA?.name || 'Away';
      const home = payload.teamB?.name || 'Home';
      contentBlock = `
BADGE: MLB GAME PREVIEW
MATCHUP: ${away} VS ${home}
${payload.recordA ? `AWAY RECORD: ${payload.recordA}` : ''}
${payload.recordB ? `HOME RECORD: ${payload.recordB}` : ''}
SUBHEAD: ${subhead}
${signalBlock ? `MARKET SNAPSHOT:\n${signalBlock}` : ''}

SECTION DIRECTION:
- Head-to-head composition, team names on each side
- "VS" treatment in center
- Glass panel for market data
- Night-game atmosphere
`.trim();
      break;
    }

    case 'maximus-picks': {
      const conf = payload.keyPick?.confidence;
      contentBlock = `
BADGE: MAXIMUS'S PICKS
HEADLINE: ${headline}
SUBHEAD: ${subhead}
${payload.keyPick ? `TOP PICK: ${payload.keyPick.label} (${payload.keyPick.market})${conf ? ` — ${conf.toUpperCase()} CONFIDENCE` : ''}` : ''}
${signalBlock ? `BOARD SIGNALS:\n${signalBlock}` : ''}

SECTION DIRECTION:
- Picks-board / dashboard feel
- Hero treatment for top pick
${conf === 'high' ? '- Green accent glow for high confidence' : ''}
- Sharp data-terminal aesthetic
`.trim();
      break;
    }

    default:
      contentBlock = `
BADGE: MLB INTELLIGENCE
HEADLINE: ${headline}
SUBHEAD: ${subhead}
`.trim();
  }

  return `You are generating a premium Instagram sports intelligence card.

GOAL:
Render a single MLB card using the EXACT content provided below.

${CRITICAL_RULES}

---

CONTENT:

${contentBlock}

FOOTER: maximussports.ai | For entertainment only • 21+

---

${DESIGN_SYSTEM}

${AVOID_BLOCK}`;
}

// ── Response parser ──────────────────────────────────────────────────────────

function parseImageResponse(response) {
  try {
    if (!response) return { ok: false, error: 'Empty response from Gemini' };

    const candidates = response.candidates;
    if (!candidates?.length) return { ok: false, error: 'No candidates in Gemini response' };

    const parts = candidates[0]?.content?.parts;
    if (!parts?.length) return { ok: false, error: 'No parts in Gemini response' };

    for (const part of parts) {
      if (part.inlineData?.data && part.inlineData?.mimeType) {
        return { ok: true, base64: part.inlineData.data, mimeType: part.inlineData.mimeType };
      }
    }

    const textParts = parts.filter(p => p.text).map(p => p.text);
    if (textParts.length > 0) {
      return { ok: false, error: 'Model returned text instead of image', textFallback: textParts.join('\n') };
    }

    return { ok: false, error: 'No image data in response' };
  } catch (err) {
    return { ok: false, error: `Parse error: ${err.message}` };
  }
}

// ── Route handler ────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[generate-image] GEMINI_API_KEY is not set');
    return res.status(500).json({ ok: false, error: 'Image generation is not configured. GEMINI_API_KEY missing.' });
  }

  let payload;
  try {
    payload = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ ok: false, error: 'Invalid request body' });
    }
  } catch {
    return res.status(400).json({ ok: false, error: 'Failed to parse request body' });
  }

  // Enforce MLB-only
  if (payload.workspace && payload.workspace !== 'mlb') {
    return res.status(400).json({ ok: false, error: 'This endpoint only supports MLB workspace' });
  }

  // Force single-slide
  payload.slideCount = 1;

  const prompt = buildSectionPrompt(payload);
  const modelSource = process.env.GEMINI_IMAGE_MODEL ? 'env' : 'fallback';
  console.log(`[generate-image] Using model: ${GEMINI_MODEL} (source: ${modelSource})`);

  try {
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseModalities: ['Image'],
      },
    });

    const parsed = parseImageResponse(response);

    if (!parsed.ok) {
      console.error('[generate-image] Generation failed:', parsed.error, parsed.textFallback || '');
      return res.status(422).json({
        ok: false,
        error: parsed.error,
        textFallback: parsed.textFallback || null,
        promptVersion: PROMPT_VERSION,
        model: GEMINI_MODEL,
        modelUsed: GEMINI_MODEL,
      });
    }

    return res.status(200).json({
      ok: true,
      imageBase64: parsed.base64,
      mimeType: parsed.mimeType,
      promptVersion: PROMPT_VERSION,
      model: GEMINI_MODEL,
      modelUsed: GEMINI_MODEL,
      metadata: {
        section: payload.section || 'unknown',
        headline: payload.headline || '',
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[generate-image] Gemini API error:', err);
    return res.status(500).json({
      ok: false,
      error: `Gemini API error: ${err.message || 'Unknown error'}`,
      promptVersion: PROMPT_VERSION,
      model: GEMINI_MODEL,
      modelUsed: GEMINI_MODEL,
    });
  }
}
