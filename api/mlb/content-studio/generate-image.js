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
const GEMINI_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-preview-05-20';
const PROMPT_VERSION = 'mlb-gemini-v1';

// ── Prompt builder (inlined to avoid ESM import issues in Vercel serverless) ─

const STYLE_FOUNDATION = `
VISUAL STYLE — "MLB Glassy Terminal":
- Color palette: deep burgundy (#8B1A2B), dark navy (#0A1628), warm gold accents (#C4A55A), crisp white text
- Background: dark cinematic gradient with subtle baseball stadium atmosphere (out-of-focus lights, diamond geometry)
- Panels: frosted glass cards with thin white/gold borders, slight backdrop blur
- Typography: clean modern sans-serif. Large bold headline, medium subhead, small detail text. High contrast.
- Composition: single unified card layout, not a collage. Clean visual hierarchy.
- Feel: premium, editorial, data-driven. Like a Bloomberg terminal crossed with a high-end sportsbook dashboard.
- Branding: "MAXIMUS SPORTS" header text at top, "MLB INTELLIGENCE" chip/badge, "maximussports.ai" footer
- Format: single 4:5 portrait image (1080x1350 pixels), optimized for Instagram feed

MANDATORY REQUIREMENTS:
- Generate exactly ONE image
- 4:5 portrait aspect ratio
- All text must be sharp, legible, and properly spelled
- Clean layout with breathing room — do NOT overcrowd
- Professional sports broadcast quality
- Dark moody atmosphere with selective color pops
`.trim();

const AVOID_BLOCK = `
AVOID:
- Multiple panels or collage layouts
- Cartoonish or clip-art style graphics
- Cheap gambling/betting bro aesthetic
- Cluttered or overcrowded compositions
- Invented or hallucinated team logos
- Low-legibility text or tiny fonts
- Generic stock photo feel
- Bright/neon overpowering colors
- Extra decorative text beyond what's specified
- Multi-slide or carousel formats
`.trim();

function buildSectionPrompt(payload) {
  const section = payload.section || 'daily-briefing';
  const headline = payload.headline || 'MLB Intelligence';
  const subhead = payload.subhead || '';
  const bullets = (payload.bullets || []).map(b => `  - ${b}`).join('\n');
  const signals = (payload.signals || []).map(s => `  - ${s}`).join('\n');

  let sectionBlock = '';

  switch (section) {
    case 'daily-briefing':
      sectionBlock = `
Create a premium MLB Daily Briefing Instagram card.

CONTENT:
- Top badge: "MLB DAILY BRIEFING"
- Date: ${payload.dateLabel || 'Today'}
- Main headline: "${headline}"
${subhead ? `- Subhead: "${subhead}"` : ''}
${bullets ? `- Key bullets:\n${bullets}` : ''}
${signals ? `- Board summary signals:\n${signals}` : ''}
- Footer: "maximussports.ai" + "For entertainment only. 21+"

VISUAL DIRECTION:
- Full-slate editorial feel — broad, authoritative
- Centered composition with headline dominating
- Subtle baseball diamond or field geometry in background
- Glass panel for the headline area
`.trim();
      break;

    case 'team-intel': {
      const teamName = payload.teamA?.name || 'Team';
      sectionBlock = `
Create a premium MLB Team Intel Instagram card for ${teamName}.

CONTENT:
- Top badge: "MLB TEAM INTEL"
- Main headline: "${headline}"
- Subhead: "${subhead}"
${bullets ? `- Intel bullets:\n${bullets}` : ''}
- Footer: "maximussports.ai" + "For entertainment only. 21+"

VISUAL DIRECTION:
- Team-centric hero feel
- Dramatic spotlight/vignette effect
- Glass intel panel with structured data points
- Baseball-specific visual cues
`.trim();
      break;
    }

    case 'league-intel': {
      const lg = payload.league || 'AL';
      const fullName = lg === 'AL' ? 'American League' : 'National League';
      sectionBlock = `
Create a premium MLB League Intel Instagram card for the ${fullName}.

CONTENT:
- Top badge: "${fullName.toUpperCase()} INTEL"
- Main headline: "${headline}"
${subhead ? `- Subhead: "${subhead}"` : ''}
${bullets ? `- Storylines:\n${bullets}` : ''}
- Footer: "maximussports.ai" + "For entertainment only. 21+"

VISUAL DIRECTION:
- League-race feel — competitive, dynamic
- Subtle standings-board visual element
- Premium editorial sports magazine layout
`.trim();
      break;
    }

    case 'division-intel': {
      const div = payload.division || 'AL East';
      sectionBlock = `
Create a premium MLB Division Intel Instagram card for the ${div}.

CONTENT:
- Top badge: "${div.toUpperCase()} INTEL"
- Main headline: "${headline}"
${subhead ? `- Subhead: "${subhead}"` : ''}
${bullets ? `- Division signals:\n${bullets}` : ''}
- Footer: "maximussports.ai" + "For entertainment only. 21+"

VISUAL DIRECTION:
- Division-race intensity — tight competition feel
- Glass panels suggesting team rankings
- Focused, analytical composition
`.trim();
      break;
    }

    case 'game-insights': {
      const away = payload.teamA?.name || 'Away';
      const home = payload.teamB?.name || 'Home';
      sectionBlock = `
Create a premium MLB Game Preview Instagram card: ${away} at ${home}.

CONTENT:
- Top badge: "MLB GAME PREVIEW"
- Matchup: "${away} VS ${home}"
${payload.recordA ? `- ${away} record: ${payload.recordA}` : ''}
${payload.recordB ? `- ${home} record: ${payload.recordB}` : ''}
${subhead ? `- Subhead: "${subhead}"` : ''}
${signals ? `- Market snapshot:\n${signals}` : ''}
- Footer: "maximussports.ai" + "For entertainment only. 21+"

VISUAL DIRECTION:
- Head-to-head matchup composition
- Split visual with team identity on each side
- "VS" graphic treatment in center
- Glass panel for market data
- Dramatic night-game atmosphere
`.trim();
      break;
    }

    case 'maximus-picks': {
      const conf = payload.keyPick?.confidence;
      sectionBlock = `
Create a premium MLB Maximus's Picks Instagram card.

CONTENT:
- Top badge: "MAXIMUS'S PICKS"
- Main headline: "${headline}"
${subhead ? `- Subhead: "${subhead}"` : ''}
${payload.keyPick ? `- Top pick: "${payload.keyPick.label}" (${payload.keyPick.market})${conf ? ` — ${conf.toUpperCase()} confidence` : ''}` : ''}
${signals ? `- Board signals:\n${signals}` : ''}
- Footer: "maximussports.ai" + "For entertainment only. 21+"

VISUAL DIRECTION:
- Picks-board / dashboard feel — structured, data-rich but clean
- Hero treatment for the top pick — large, prominent
${conf === 'high' ? '- Green accent glow for high confidence' : ''}
- Sharp data-terminal aesthetic
`.trim();
      break;
    }

    default:
      sectionBlock = `
Create a premium MLB Intelligence Instagram card.

CONTENT:
- Top badge: "MLB INTELLIGENCE"
- Main headline: "${headline}"
${subhead ? `- Subhead: "${subhead}"` : ''}
- Footer: "maximussports.ai" + "For entertainment only. 21+"
`.trim();
  }

  return [STYLE_FOUNDATION, '', sectionBlock, '', AVOID_BLOCK].join('\n');
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
      });
    }

    return res.status(200).json({
      ok: true,
      imageBase64: parsed.base64,
      mimeType: parsed.mimeType,
      promptVersion: PROMPT_VERSION,
      model: GEMINI_MODEL,
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
    });
  }
}
