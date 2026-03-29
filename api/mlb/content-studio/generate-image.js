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
`.trim();

const VISUAL_SYSTEM = `
VISUAL SYSTEM — MANDATORY SPECIFICATIONS:

CANVAS:
- Exactly 1080 x 1350 pixels (4:5 portrait)
- Mobile-first, optimized for Instagram feed
- Safe padding: 80px all sides
- Max content width: 860px
- Single vertical editorial layout — NO multi-panel, NO collage

COLOR PALETTE (USE ONLY THESE):
- Primary background: deep navy #0A1628
- Secondary glow: dark burgundy #8B1A2B (subtle radial glow from center)
- Accent: warm gold #C4A55A (sparingly for badges, thin dividers)
- Text: crisp white #FFFFFF, varying opacity for hierarchy
- Glass panels: rgba(10, 22, 40, 0.55) with subtle white border rgba(255,255,255,0.08)
- NO other colors. No bright blue neon. No random gradients. No washed tones.

GLASSMORPHISM (DEFINING VISUAL):
- Frosted glass panels for ALL content areas
- Background: rgba(10, 22, 40, 0.55) with backdrop blur
- Border: 1px solid rgba(255, 255, 255, 0.08)
- Border radius: 16px
- Subtle inner glow — this is the premium signature

TYPOGRAPHY:
- Clean sans-serif (Inter/SF Pro/Helvetica Neue style)
- Headline: bold white, large ~28-34pt, tight spacing
- Subhead: semi-bold, white 70% opacity, ~16-18pt
- Bullets: regular weight, white 60-70% opacity, ~14-16pt
- Badge text: bold uppercase, ~10-11pt, high letter-spacing
- ALL text sharp and legible — never fuzzy

ATMOSPHERE:
- Subtle stadium lighting deep in background (blurred, distant)
- Light film grain (barely visible)
- Dark moody overall — night-game intelligence briefing feel
- NO lens flares, NO bright spots, NO overwhelming effects
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
- Poster composition or movie-poster styling
- Random baseball players, crowd shots, or action photography
- Overly realistic photography or stock photos
- Floating disconnected text fragments
- Multiple disconnected panels or collage layouts
- Unbranded generic sports design
- Off-brand palette (no bright neon, no washed colors, no random gradients)
- Mascot omission — mascot MUST appear
- Extra invented analysis or paraphrased content
- Clip-art or cartoonish graphics (except the branded mascot)
- Excessive realism or fantasy art
- Fake magazine cover layouts
- Tiny unreadable text below ~12pt equivalent
- Cluttered overcrowded composition
- Any text not explicitly provided in the CONTENT section
`.trim();

function buildSectionPrompt(payload, hasMascotRef) {
  const section = payload.section || 'daily-briefing';
  const headline = payload.headline || 'MLB Intelligence';
  const subhead = payload.subhead || '';
  const date = payload.dateLabel || '';
  const mascotBlock = hasMascotRef ? MASCOT_SPEC : MASCOT_SPEC_NO_REF;

  const intel = payload.intelBriefing;
  const bullets = (intel?.bullets || payload.bullets || []).slice(0, 6);
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
      contentSection = `EXACT CONTENT TO RENDER (use verbatim):

HEADER:
  Mascot: Maximus Sports baseball mascot (top center)
  Brand: "MAXIMUS SPORTS"
  Badge: "MLB DAILY BRIEFING" (burgundy pill)
  Date: "${date}"

HEADLINE:
  "${intel?.headline || headline}"

${subhead ? `SUBHEAD:\n  "${subhead}"\n` : ''}
INTELLIGENCE BULLETS (render ALL inside a glass panel):
${bulletBlock || '  (Use headline and subhead only)'}

${matchupBlock ? `MATCHUPS TO WATCH:\n${matchupBlock}\n` : ''}
${boardPulse ? `BOARD PULSE:\n  "${boardPulse}"\n` : ''}
FOOTER:
  "maximussports.ai"
  "For entertainment only • 21+"

---

CARD STRUCTURE (top to bottom):

1. TOP ZONE (~200px): Mascot → "MAXIMUS SPORTS" → "MLB DAILY BRIEFING" badge → date
2. HEADLINE ZONE (~180px): Bold headline, subhead below in lighter weight
3. GLASS INTELLIGENCE PANEL (~500-600px): ALL bullets inside frosted glass card — this is the core
4. MATCHUPS ROW (~100px, if present): Compact horizontal team names with "vs"
5. FOOTER (~80px): URL + disclaimer

SECTION DIRECTION:
- Full-slate editorial briefing — authoritative, premium, informative
- Headline dominates, bullets fill the glass panel with good spacing
- This should feel like opening a premium sports app's morning briefing`;
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
