/**
 * buildMlbGeminiPrompt — v3
 *
 * Constructs an AUTHORITATIVE, PRESCRIPTIVE prompt for Gemini image generation.
 *
 * Philosophy:
 *   - Gemini is a brand-constrained visual renderer, NOT a creative artist
 *   - Standard rendered version = source of truth for layout/design language
 *   - MLB Home intel briefing = source of truth for content
 *   - Gemini = premium visual renderer that makes the card more polished
 *
 * All text comes verbatim from the normalized payload. Gemini renders layout only.
 */

// ── Style preset (centralized, reusable) ─────────────────────────────────────

export const MLB_STYLE_PRESET = {
  id: 'mlb-glassy-terminal',
  palette: {
    navy: '#0A1628',
    burgundy: '#8B1A2B',
    gold: '#C4A55A',
    white: '#FFFFFF',
    glass: 'rgba(10, 22, 40, 0.55)',
  },
};

export const LAYOUT_VARIANTS = {
  'headline-heavy': 'Large headline dominates, bullets smaller below',
  'bullet-heavy': 'Bullets get more space, headline is prominent but compact',
};

// ── Hard identity rules ─────────────────────────────────────────────────────

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

// ── Visual system specification ─────────────────────────────────────────────

const VISUAL_SYSTEM = `
VISUAL SYSTEM — MANDATORY SPECIFICATIONS:

CANVAS:
- Dimensions: exactly 1080 x 1350 pixels (4:5 portrait)
- Mobile-first composition optimized for Instagram feed
- Safe padding: 80px on all sides
- Maximum content width: 860px
- Single vertical editorial layout — NO multi-panel, NO collage

COLOR PALETTE (USE ONLY THESE — NO EXCEPTIONS):
- Primary background: dark burgundy-to-deep-red gradient (#1a0a10 → #3d1525 → #2a0f1a → #0e0610)
- Secondary glow: subtle burgundy radial glow from center (#8B1A2B at 18% opacity)
- Accent: warm gold #C4A55A (used sparingly for bullet markers, thin dividers)
- Text: crisp white #FFFFFF, varying opacity for hierarchy
- Glass panels: rgba(10, 22, 40, 0.45) with subtle white border rgba(255,255,255,0.07)
- DO NOT use any other colors. No bright blue. No neon. No navy-dominant palette.

GLASSMORPHISM:
- Frosted glass panels for all content areas
- Background: rgba(10, 22, 40, 0.45) with backdrop blur effect
- Border: 1px solid rgba(255, 255, 255, 0.07)
- Border radius: 14px
- Subtle warm inner glow on glass panels
- This is the defining visual characteristic — make it feel like a premium app UI

TYPOGRAPHY:
- Clean modern sans-serif (Inter, SF Pro, Helvetica Neue style)
- Headline: bold, white, large (~28-30pt), tight letter-spacing, UPPERCASE
- Subhead: regular, white at 50% opacity, ~14pt
- Bullets: regular weight, white at 70% opacity, ~13pt, good line spacing
- Badge text: bold, uppercase, ~10pt, high letter-spacing, burgundy pill bg
- ALL text must be PERFECTLY SPELLED — zero typos, zero garbled characters
- ALL text must be SHARP, CRISP, and FULLY LEGIBLE on a phone screen

BACKGROUND:
- Dark burgundy/red gradient ONLY — consistent with Maximus Sports MLB UI
- Light film grain texture (barely visible)
- NO stadium, NO crowd, NO field, NO scenic backdrop, NO baseball environment
- NO cinematic photography, NO action shots, NO players
- Just a clean dark red gradient with subtle texture — like a premium app background
`.trim();

// ── Negative prompt / avoid block ───────────────────────────────────────────

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
- Mascot omission — the mascot MUST appear
- Extra invented analysis or paraphrased content
- Misspelled words, garbled text, typos, or character mutations
- Clip-art or cartoonish graphics (except the branded mascot)
- Excessive realism or fantasy art
- Fake magazine cover layouts
- Tiny unreadable text below ~12pt
- Cluttered or overcrowded composition
- Any text not explicitly provided in the CONTENT section
- Dark navy-dominant backgrounds — use DARK RED/BURGUNDY gradient instead
`.trim();

// ── Mascot specification ────────────────────────────────────────────────────

const MASCOT_SPEC = `
MASCOT — MANDATORY:
- Include the Maximus Sports baseball mascot at the TOP CENTER of the card
- The mascot is a friendly blue robot character in baseball gear
- Pixar-like 3D style, high quality, polished
- Approximately 100-120px height in the final composition
- Positioned above the "MAXIMUS SPORTS" wordmark
- The mascot is a BRAND ELEMENT — treat it like a logo placement
- DO NOT redesign, distort, reinterpret, or omit the mascot
- DO NOT replace it with a generic robot or baseball player
- If a reference image of the mascot is provided, match it exactly
`.trim();

// ── Section prompt: Daily Briefing ──────────────────────────────────────────

function dailyBriefingPrompt(payload) {
  const intel = payload.intelBriefing;
  const headline = intel?.headline || payload.headline || 'MLB Daily Briefing';
  const subhead = intel?.subhead || payload.subhead || '';
  const bullets = (intel?.bullets || payload.bullets || []).slice(0, 6);
  const matchups = (intel?.keyMatchups || payload.keyMatchups || []).slice(0, 3);
  const boardPulse = intel?.boardPulse || payload.boardPulse || '';
  const date = intel?.date || payload.dateLabel || '';

  const bulletBlock = bullets.length > 0
    ? bullets.map((b, i) => `  ${i + 1}. "${b}"`).join('\n')
    : '  (No bullets available — use headline and subhead only)';

  const matchupBlock = matchups.length > 0
    ? matchups.map(m => `  • ${m.teamA} vs ${m.teamB}`).join('\n')
    : '';

  return `You are rendering a premium MLB Daily Briefing Instagram card for Maximus Sports.

${IDENTITY_RULES}

---

EXACT CONTENT TO RENDER (use verbatim, do not modify):

HEADER:
  Mascot: Maximus Sports baseball mascot (top center)
  Brand: "MAXIMUS SPORTS"
  Badge: "MLB DAILY BRIEFING" (burgundy pill badge)
  Date: "${date}"

HEADLINE:
  "${headline}"

${subhead ? `SUBHEAD:\n  "${subhead}"\n` : ''}
INTELLIGENCE BULLETS (render ALL of these inside a glass panel):
${bulletBlock}

${matchupBlock ? `MATCHUPS TO WATCH:\n${matchupBlock}\n` : ''}
${boardPulse ? `BOARD PULSE:\n  "${boardPulse}"\n` : ''}
FOOTER:
  "maximussports.ai"
  "For entertainment only • 21+"

---

CARD STRUCTURE (top to bottom):

1. TOP ZONE (top 200px):
   - Maximus Sports baseball mascot (centered, ~100-120px)
   - "MAXIMUS SPORTS" wordmark below mascot (bold, white, uppercase)
   - "MLB DAILY BRIEFING" badge (burgundy rounded pill)
   - Date line (small, white at 40% opacity)

2. HEADLINE ZONE (next ~180px):
   - Main headline in bold white
   - Max 3 lines, tight spacing
   - Subhead below in lighter weight, slightly smaller

3. GLASS INTELLIGENCE PANEL (main content area, ~500-600px):
   - Frosted glass card with the exact specifications above
   - All intelligence bullets rendered inside this panel
   - Clean bullet markers (subtle dot or dash)
   - Good line spacing — each bullet must be fully readable
   - This is the CORE of the card — give it the most space

4. MATCHUPS ROW (if matchups provided, ~100px):
   - Compact horizontal layout below the glass panel
   - Team names with subtle "vs" separator
   - Small type, clean, informational

5. FOOTER ZONE (bottom ~80px):
   - "maximussports.ai" centered
   - Disclaimer text below, very small

---

${VISUAL_SYSTEM}

${MASCOT_SPEC}

${AVOID_BLOCK}`;
}

// ── Section prompt: Team Intel ───────────────────────────────────────────────

function teamIntelPrompt(payload) {
  const teamName = payload.teamA?.name || payload.headline || 'Team';
  const bullets = (payload.bullets || []).slice(0, 5);
  const bulletBlock = bullets.map((b, i) => `  ${i + 1}. "${b}"`).join('\n');

  return `You are rendering a premium MLB Team Intel Instagram card for Maximus Sports.

${IDENTITY_RULES}

---

EXACT CONTENT TO RENDER:

HEADER:
  Mascot: Maximus Sports baseball mascot (top center)
  Brand: "MAXIMUS SPORTS"
  Badge: "MLB TEAM INTEL" (burgundy pill)

HEADLINE: "${payload.headline || `${teamName} Intel Report`}"
SUBHEAD: "${payload.subhead || 'Model-driven team breakdown'}"

BULLETS:
${bulletBlock || '  (No bullets)'}

FOOTER:
  "maximussports.ai"
  "For entertainment only • 21+"

---

SECTION DIRECTION:
- Team-centric hero card — team name is prominent
- Dramatic spotlight/vignette effect on dark background
- Glass panel with structured intel bullets

${VISUAL_SYSTEM}
${MASCOT_SPEC}
${AVOID_BLOCK}`;
}

// ── Section prompt: League Intel ─────────────────────────────────────────────

function leagueIntelPrompt(payload) {
  const lg = payload.league || 'AL';
  const fullName = lg === 'AL' ? 'American League' : 'National League';
  const bullets = (payload.bullets || []).slice(0, 5);
  const bulletBlock = bullets.map((b, i) => `  ${i + 1}. "${b}"`).join('\n');

  return `You are rendering a premium MLB ${fullName} Intel Instagram card for Maximus Sports.

${IDENTITY_RULES}

---

EXACT CONTENT TO RENDER:

HEADER:
  Mascot: Maximus Sports baseball mascot (top center)
  Brand: "MAXIMUS SPORTS"
  Badge: "${fullName.toUpperCase()} INTEL" (burgundy pill)

HEADLINE: "${payload.headline || `${fullName} Overview`}"
SUBHEAD: "${payload.subhead || ''}"

BULLETS:
${bulletBlock || '  (No bullets)'}

FOOTER:
  "maximussports.ai"
  "For entertainment only • 21+"

---

${VISUAL_SYSTEM}
${MASCOT_SPEC}
${AVOID_BLOCK}`;
}

// ── Section prompt: Division Intel ───────────────────────────────────────────

function divisionIntelPrompt(payload) {
  const div = payload.division || 'AL East';
  const bullets = (payload.bullets || []).slice(0, 5);
  const bulletBlock = bullets.map((b, i) => `  ${i + 1}. "${b}"`).join('\n');

  return `You are rendering a premium MLB ${div} Division Intel Instagram card for Maximus Sports.

${IDENTITY_RULES}

---

EXACT CONTENT TO RENDER:

HEADER:
  Mascot: Maximus Sports baseball mascot (top center)
  Brand: "MAXIMUS SPORTS"
  Badge: "${div.toUpperCase()} INTEL" (burgundy pill)

HEADLINE: "${payload.headline || `${div} Division Report`}"
SUBHEAD: "${payload.subhead || ''}"

BULLETS:
${bulletBlock || '  (No bullets)'}

FOOTER:
  "maximussports.ai"
  "For entertainment only • 21+"

---

${VISUAL_SYSTEM}
${MASCOT_SPEC}
${AVOID_BLOCK}`;
}

// ── Section prompt: Game Insights ────────────────────────────────────────────

function gameInsightsPrompt(payload) {
  const away = payload.teamA?.name || 'Away';
  const home = payload.teamB?.name || 'Home';
  const signals = (payload.signals || []).map(s => `  • ${s}`).join('\n');

  return `You are rendering a premium MLB Game Preview Instagram card for Maximus Sports.

${IDENTITY_RULES}

---

EXACT CONTENT TO RENDER:

HEADER:
  Mascot: Maximus Sports baseball mascot (top center)
  Brand: "MAXIMUS SPORTS"
  Badge: "MLB GAME PREVIEW" (burgundy pill)

MATCHUP: "${away} VS ${home}"
${payload.recordA ? `AWAY RECORD: ${payload.recordA}` : ''}
${payload.recordB ? `HOME RECORD: ${payload.recordB}` : ''}
SUBHEAD: "${payload.subhead || 'Model-driven matchup analysis'}"

${signals ? `MARKET DATA:\n${signals}` : ''}

FOOTER:
  "maximussports.ai"
  "For entertainment only • 21+"

---

SECTION DIRECTION:
- Head-to-head composition — team names facing off
- "VS" treatment between teams
- Glass panel for market data below matchup
- Night-game atmosphere

${VISUAL_SYSTEM}
${MASCOT_SPEC}
${AVOID_BLOCK}`;
}

// ── Section prompt: Maximus's Picks ──────────────────────────────────────────

function maximusPicksPrompt(payload) {
  const signals = (payload.signals || []).map(s => `  • ${s}`).join('\n');
  const conf = payload.keyPick?.confidence;

  return `You are rendering a premium MLB Maximus's Picks Instagram card for Maximus Sports.

${IDENTITY_RULES}

---

EXACT CONTENT TO RENDER:

HEADER:
  Mascot: Maximus Sports baseball mascot (top center)
  Brand: "MAXIMUS SPORTS"
  Badge: "MAXIMUS'S PICKS" (burgundy pill)

HEADLINE: "${payload.headline || "Today's Board"}"
SUBHEAD: "${payload.subhead || ''}"

${payload.keyPick ? `TOP PICK: "${payload.keyPick.label}" (${payload.keyPick.market})${conf ? ` — ${conf.toUpperCase()} CONFIDENCE` : ''}` : ''}

${signals ? `BOARD SIGNALS:\n${signals}` : ''}

FOOTER:
  "maximussports.ai"
  "For entertainment only • 21+"

---

SECTION DIRECTION:
- Picks-board / dashboard feel — structured, clean
- Hero treatment for the top pick — large, prominent
${conf === 'high' ? '- Subtle green accent glow around the top pick for high confidence' : ''}
- Secondary picks in smaller rows below
- Sharp data-terminal aesthetic

${VISUAL_SYSTEM}
${MASCOT_SPEC}
${AVOID_BLOCK}`;
}

// ── Main export ─────────────────────────────────────────────────────────────

const SECTION_BUILDERS = {
  'daily-briefing': dailyBriefingPrompt,
  'team-intel': teamIntelPrompt,
  'league-intel': leagueIntelPrompt,
  'division-intel': divisionIntelPrompt,
  'game-insights': gameInsightsPrompt,
  'maximus-picks': maximusPicksPrompt,
};

/**
 * Build the full Gemini prompt from a normalized MLB image payload.
 * @param {Object} payload
 * @returns {string}
 */
export function buildMlbGeminiPrompt(payload) {
  const builder = SECTION_BUILDERS[payload.section] || dailyBriefingPrompt;
  return builder(payload);
}
