/**
 * POST /api/mlb/content-studio/generate-image
 *
 * Generates a single MLB IG card image using Google Gemini.
 * v3: Authoritative deterministic UI rendering with mascot reference image.
 *
 * Server-side only — API key never exposed to frontend.
 */

import { GoogleGenAI } from '@google/genai';
import { readFileSync } from 'fs';
import { join } from 'path';

// ── Centralized model config ─────────────────────────────────────────────────
const GEMINI_MODEL = process.env.GEMINI_IMAGE_MODEL || 'models/gemini-2.5-flash-image';
const PROMPT_VERSION = 'mlb-gemini-v3';

// ── Mascot reference image loader ────────────────────────────────────────────

let _mascotBase64 = null;

function getMascotBase64() {
  if (_mascotBase64) return _mascotBase64;
  try {
    // Try multiple possible paths for the mascot asset
    const paths = [
      join(process.cwd(), 'public', 'mascot-mlb.png'),
      join(process.cwd(), '..', 'public', 'mascot-mlb.png'),
    ];
    for (const p of paths) {
      try {
        const buf = readFileSync(p);
        _mascotBase64 = buf.toString('base64');
        console.log(`[generate-image] Mascot loaded from: ${p} (${buf.length} bytes)`);
        return _mascotBase64;
      } catch { /* try next */ }
    }
    console.warn('[generate-image] Mascot file not found at any path');
    return null;
  } catch {
    console.warn('[generate-image] Failed to load mascot');
    return null;
  }
}

// ── Prompt builder v3 — authoritative, prescriptive ─────────────────────────

const IDENTITY_RULES = `
HARD IDENTITY RULES — YOU MUST FOLLOW ALL OF THESE:

1. You are NOT creating a poster. You are NOT creating creative art.
2. You ARE rendering a premium mobile sports intelligence briefing card.
3. You MUST preserve every piece of provided content EXACTLY as written.
4. You MUST follow the prescribed design hierarchy precisely.
5. You MUST use ONLY the specified color palette — no random colors.
6. You MUST include the Maximus Sports baseball mascot at the top of the card.
7. You MUST produce a UI-style sports briefing card, NOT a collage or poster.
8. You MUST keep all text legible on a phone screen (minimum ~14pt equivalent).
9. You MUST use glassmorphism and structured editorial layout throughout.
10. You MUST NOT omit ANY of the specified content blocks.
11. You MUST NOT invent, summarize, paraphrase, or rewrite any content.
12. You MUST NOT add text, stats, analysis, or data beyond what is provided.
13. You MUST spell every word correctly — zero typos, zero garbled text.
14. You MUST NOT alter, mutate, or distort any supplied wording.
15. You MUST use a dark RED/BURGUNDY gradient background, NOT dark navy/blue.
`.trim();

const VISUAL_SYSTEM = `
VISUAL SYSTEM — MANDATORY SPECIFICATIONS:

CANVAS:
- Exactly 1080 x 1350 pixels (4:5 portrait)
- Mobile-first, optimized for Instagram feed
- Safe padding: 80px all sides
- Max content width: 860px
- Single vertical editorial layout — NO multi-panel, NO collage

COLOR PALETTE (USE ONLY THESE — NO EXCEPTIONS):
- Primary background: dark burgundy-to-deep-red gradient (#1a0a10 → #3d1525 → #2a0f1a → #0e0610)
- Secondary glow: subtle burgundy radial glow from center (#8B1A2B at 18% opacity)
- Accent: warm gold #C4A55A (sparingly for bullet markers, thin dividers)
- Text: crisp white #FFFFFF, varying opacity for hierarchy
- Glass panels: rgba(10, 22, 40, 0.45) with subtle white border rgba(255,255,255,0.07)
- DO NOT use any other colors. No bright blue. No neon. No navy-dominant palette.

GLASSMORPHISM:
- Frosted glass panels for ALL content areas
- Background: rgba(10, 22, 40, 0.45) with backdrop blur
- Border: 1px solid rgba(255, 255, 255, 0.07)
- Border radius: 14px
- Subtle warm inner glow — premium app UI feel

TYPOGRAPHY:
- Clean sans-serif (Inter/SF Pro/Helvetica Neue style)
- Headline: bold white, ~28-30pt, tight spacing, UPPERCASE
- Subhead: regular, white 50% opacity, ~14pt
- Bullets: regular weight, white 70% opacity, ~13pt, good line spacing
- Badge text: bold uppercase, ~10pt, high letter-spacing, burgundy pill bg
- ALL text PERFECTLY SPELLED — zero typos, zero garbled characters
- ALL text SHARP, CRISP, FULLY LEGIBLE on a phone screen

BACKGROUND:
- Dark burgundy/red gradient ONLY — consistent with Maximus Sports MLB UI
- Light film grain texture (barely visible)
- NO stadium, NO crowd, NO field, NO scenic backdrop, NO baseball environment
- NO cinematic photography, NO action shots, NO players
- Just a clean dark red gradient with subtle texture — like a premium app background
`.trim();

const MASCOT_SPEC = `
MASCOT — MANDATORY (a reference image of the mascot is provided):
- Place the Maximus Sports baseball mascot at TOP CENTER of the card
- The mascot is a friendly blue robot in baseball gear (Pixar-like 3D style)
- Match the reference image provided — same character, same style
- Approximately 100-120px height in final composition
- Positioned ABOVE the "MAXIMUS SPORTS" wordmark
- Treat as a brand logo placement — clean, integrated, premium
- DO NOT redesign, distort, reinterpret, or omit
`.trim();

const MASCOT_SPEC_NO_REF = `
MASCOT — MANDATORY:
- Place the Maximus Sports baseball mascot at TOP CENTER of the card
- The mascot is a friendly blue robot character wearing baseball gear
- Pixar-like 3D style, high quality, polished appearance
- Blue metallic body, large friendly eyes, baseball cap and glove
- Approximately 100-120px height in final composition
- Positioned ABOVE the "MAXIMUS SPORTS" wordmark
- DO NOT redesign, distort, reinterpret, or omit
`.trim();

const AVOID_BLOCK = `
ABSOLUTELY AVOID — HARD CONSTRAINTS:
- Stadium backgrounds, baseball fields, crowd shots, scenic environments
- Poster composition or movie-poster styling
- Cinematic photography or action shots of players
- Overly realistic photography or stock photos
- Floating disconnected text fragments
- Multiple disconnected panels or collage layouts
- Unbranded generic sports design
- Off-brand palette — no bright blue, no neon, no washed colors, no navy-dominant look
- Mascot omission — mascot MUST appear
- Extra invented analysis or paraphrased content
- Misspelled words, garbled text, typos, or character mutations
- Clip-art or cartoonish graphics (except the branded mascot)
- Excessive realism or fantasy art
- Fake magazine cover layouts
- Tiny unreadable text below ~12pt
- Cluttered overcrowded composition
- Any text not explicitly provided in the CONTENT section
- Dark navy-dominant backgrounds — use DARK RED/BURGUNDY gradient instead
`.trim();

function buildSectionPrompt(payload, hasMascotRef) {
  const section = payload.section || 'daily-briefing';
  const headline = payload.headline || 'MLB Intelligence';
  const subhead = payload.subhead || '';
  const date = payload.dateLabel || '';
  const mascotBlock = hasMascotRef ? MASCOT_SPEC : MASCOT_SPEC_NO_REF;

  const intel = payload.intelBriefing;
  const bullets = (intel?.bullets || payload.bullets || []).slice(0, 4);
  const matchups = (intel?.keyMatchups || payload.keyMatchups || []).slice(0, 3);
  const boardPulse = intel?.boardPulse || payload.boardPulse || '';
  const signals = payload.signals || [];

  const bulletBlock = bullets.length > 0
    ? bullets.map((b, i) => `  ${i + 1}. "${b}"`).join('\n')
    : '';
  const matchupBlock = matchups.length > 0
    ? matchups.map(m => `  • ${m.teamA} vs ${m.teamB}`).join('\n')
    : '';
  const signalBlock = signals.map(s => `  • ${s}`).join('\n');

  let contentSection = '';

  switch (section) {
    case 'daily-briefing':
      contentSection = `This is a DESIGNED APP CARD, not a generated image. Think of yourself as an art director
rendering a premium mobile sports intelligence product card.

EXACT CONTENT TO RENDER (every word must be spelled correctly):

ZONE 1 — HEADER:
  - "DAILY BRIEFING" in gold accent (#C4A55A), large hero text
  - Mascot next to the title
  - "MLB DAILY BRIEFING" glass badge with gold border
  - Date: "${date}"

ZONE 2 — HERO BLOCK:
  - Headline: "${intel?.headline || headline}"
${subhead ? `  - Subhead: "${subhead}"` : ''}

ZONE 3 — INTELLIGENCE PANEL (glass card with gold-tinted border):
${bulletBlock || '  (Use headline only)'}

ZONE 4 — MARKET MODULE (compact bottom panel):
${boardPulse ? `  - Board Pulse: "${boardPulse}"` : '  - (No market data)'}
${matchupBlock ? `  - Matchups: ${matchupBlock}` : ''}

FOOTER: "maximussports.ai" — "For entertainment only • 21+"

---

4-ZONE LAYOUT:
1. HEADER: Gold "DAILY BRIEFING" title with glow, mascot, badge, date
2. HERO: Bold headline centered, max 3 lines. Subhead below.
3. INTELLIGENCE PANEL: Glass card with gold accent border. Bullets well-spaced. Core of card.
4. MARKET MODULE: Compact analytics panel with board pulse and matchups.
5. FOOTER: Small, clean.

STYLE: Premium product card — ESPN briefing × Apple Sports × Bloomberg Terminal.
Dark red/burgundy gradient background. Glass panels. Gold accents. Crisp typography.
NOT a poster. NOT a stadium scene. NOT a generic sports image.`;
      break;

    case 'team-intel':
      contentSection = `EXACT CONTENT TO RENDER:

HEADER:
  Mascot + Brand + Badge: "MLB TEAM INTEL"

HEADLINE: "${headline}"
SUBHEAD: "${subhead}"
${bulletBlock ? `BULLETS:\n${bulletBlock}` : ''}

FOOTER: "maximussports.ai" | "For entertainment only • 21+"

DIRECTION: Team-centric hero, dramatic spotlight, glass intel panel`;
      break;

    case 'league-intel': {
      const lg = payload.league || 'AL';
      const fn = lg === 'AL' ? 'American League' : 'National League';
      contentSection = `EXACT CONTENT TO RENDER:

HEADER:
  Mascot + Brand + Badge: "${fn.toUpperCase()} INTEL"

HEADLINE: "${headline}"
SUBHEAD: "${subhead}"
${bulletBlock ? `BULLETS:\n${bulletBlock}` : ''}

FOOTER: "maximussports.ai" | "For entertainment only • 21+"

DIRECTION: League-race competitive feel, standings visual element`;
      break;
    }

    case 'division-intel':
      contentSection = `EXACT CONTENT TO RENDER:

HEADER:
  Mascot + Brand + Badge: "${(payload.division || 'AL EAST').toUpperCase()} INTEL"

HEADLINE: "${headline}"
SUBHEAD: "${subhead}"
${bulletBlock ? `BULLETS:\n${bulletBlock}` : ''}

FOOTER: "maximussports.ai" | "For entertainment only • 21+"

DIRECTION: Division-race intensity, glass ranking panels`;
      break;

    case 'game-insights': {
      const away = payload.teamA?.name || 'Away';
      const home = payload.teamB?.name || 'Home';
      contentSection = `EXACT CONTENT TO RENDER:

HEADER:
  Mascot + Brand + Badge: "MLB GAME PREVIEW"

MATCHUP: "${away} VS ${home}"
${payload.recordA ? `AWAY RECORD: ${payload.recordA}` : ''}
${payload.recordB ? `HOME RECORD: ${payload.recordB}` : ''}
SUBHEAD: "${subhead}"
${signalBlock ? `MARKET DATA:\n${signalBlock}` : ''}

FOOTER: "maximussports.ai" | "For entertainment only • 21+"

DIRECTION: Head-to-head, "VS" center treatment, glass market panel, night-game feel`;
      break;
    }

    case 'maximus-picks': {
      const conf = payload.keyPick?.confidence;
      contentSection = `EXACT CONTENT TO RENDER:

HEADER:
  Mascot + Brand + Badge: "MAXIMUS'S PICKS"

HEADLINE: "${headline}"
SUBHEAD: "${subhead}"
${payload.keyPick ? `TOP PICK: "${payload.keyPick.label}" (${payload.keyPick.market})${conf ? ` — ${conf.toUpperCase()} CONFIDENCE` : ''}` : ''}
${signalBlock ? `BOARD SIGNALS:\n${signalBlock}` : ''}

FOOTER: "maximussports.ai" | "For entertainment only • 21+"

DIRECTION: Picks-board dashboard, hero top pick${conf === 'high' ? ', green accent glow' : ''}, data-terminal aesthetic`;
      break;
    }

    default:
      contentSection = `EXACT CONTENT TO RENDER:

HEADER: Mascot + Brand + Badge: "MLB INTELLIGENCE"
HEADLINE: "${headline}"
SUBHEAD: "${subhead}"
FOOTER: "maximussports.ai" | "For entertainment only • 21+"`;
  }

  return `You are rendering a premium MLB Instagram sports intelligence card for Maximus Sports.

${IDENTITY_RULES}

---

${contentSection}

---

${VISUAL_SYSTEM}

${mascotBlock}

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

  // Load mascot reference image
  const mascotB64 = getMascotBase64();
  const hasMascotRef = !!mascotB64;

  const prompt = buildSectionPrompt(payload, hasMascotRef);
  const modelSource = process.env.GEMINI_IMAGE_MODEL ? 'env' : 'fallback';
  console.log(`[generate-image] v3 | model: ${GEMINI_MODEL} (${modelSource}) | mascot: ${hasMascotRef ? 'yes' : 'no'} | section: ${payload.section}`);

  try {
    const ai = new GoogleGenAI({ apiKey });

    // Build content parts — text prompt + optional mascot reference
    const parts = [{ text: prompt }];
    if (mascotB64) {
      parts.push({
        inlineData: {
          data: mascotB64,
          mimeType: 'image/png',
        },
      });
      // Add instruction to use the reference
      parts.push({
        text: '\n\nThe image above is the EXACT Maximus Sports baseball mascot. Place this mascot at the top center of the card. Match its appearance precisely.',
      });
    }

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: 'user', parts }],
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
        hasMascotRef,
      });
    }

    return res.status(200).json({
      ok: true,
      imageBase64: parsed.base64,
      mimeType: parsed.mimeType,
      promptVersion: PROMPT_VERSION,
      model: GEMINI_MODEL,
      modelUsed: GEMINI_MODEL,
      hasMascotRef,
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
