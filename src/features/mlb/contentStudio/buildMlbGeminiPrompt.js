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

function fmtOdds(v) {
  if (v == null) return '—';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  return n > 0 ? `+${n}` : `${n}`;
}

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
  const bullets = (intel?.bullets || payload.bullets || []).slice(0, 3);
  const matchups = (intel?.keyMatchups || payload.keyMatchups || []).slice(0, 3);
  const date = intel?.date || payload.dateLabel || '';

  const bulletBlock = bullets.length > 0
    ? bullets.map((b, i) => `  ${i + 1}. "${b}"`).join('\n')
    : '  (Use headline only)';

  // Build futures context if available
  const futuresContext = payload.seasonIntel
    ? [...(payload.seasonIntel.al || []), ...(payload.seasonIntel.nl || [])]
        .slice(0, 6)
        .map(t => `  ${t.abbrev} ${fmtOdds(t.odds)}${t.projectedWins ? ` · ${t.projectedWins}W proj` : ''}${t.signals?.[0] ? ` · ${t.signals[0]}` : ''}`)
        .join('\n')
    : '';

  return `You are rendering a PRODUCT UI CARD — not a poster, not a graphic, not a creative image.
You are an art director rendering a pixel-precise mobile sports intelligence card.
Your role is to ENHANCE VISUAL POLISH on the canonical design, not redesign the layout.

You MUST follow the EXACT structure provided. Do NOT invent alternative layouts.
You MUST fill the ENTIRE 1080×1350 canvas — no empty space at bottom.

${IDENTITY_RULES}

HARD CONSTRAINTS FOR THIS CARD:
- The main HEADLINE must be WHITE (#FFFFFF) UPPERCASE — NOT gold, NOT yellow
- Background is a DRAMATIC deep-red/burgundy gradient with stadium-light radial glow from top center
- Use team LOGOS only — absolutely ZERO emojis anywhere
- Use structured glass panels with visible BORDERS
- Professional editorial poster tone — ESPN broadcast meets Bloomberg terminal
- The card must look like it was designed by a product team, not generated by AI

---

EXACT CONTENT (render verbatim — perfect spelling):

ZONE 1 — HEADER (centered composition):
  Center: MLB logo mark + "MAXIMUS SPORTS" glossy badge pill (20pt, uppercase, 0.12em letter-spacing)
  Below badge: "${date}" (14pt, white at 45% opacity)
  NO mascot in header. NO left-right brand layout. CENTERED ONLY.

ZONE 2 — HERO HEADLINE (large, dramatic, centered):
  "${headline}" (UPPERCASE, white, ~50pt bold, multi-line if needed)
  This should feel like a sports editorial poster headline.
${subhead ? `  "${subhead}" (~16pt, white at 50% opacity, italic, one sentence)` : ''}

ZONE 3 — EDITORIAL (1 FULL-WIDTH + 2 HALF-WIDTH CARDS):
  This is the PRIMARY NARRATIVE SECTION. It MUST feel prominent and breathable.

  LAYOUT:
    Row 1: ONE full-width glass card — "HOT OFF THE PRESS"
    Row 2: TWO half-width glass cards side by side:
      Left: "PENNANT RACE INSIGHTS"
      Right: "MARKET SIGNAL"

  Each card has:
    - Icon + colored LABEL TAB at top (burgundy pill, 13pt uppercase bold)
    - ONE concise sentence of body text (~22pt, white at 82% opacity)
    - Glass background (rgba(255,255,255,0.05)), border, border-radius 14px
    - Generous padding (18-20px)

  The editorial section is the STORY HOOK — it gets visual prominence.
  The 1-full + 2-half layout creates visual rhythm and hierarchy.
${bulletBlock}

ZONE 4 — WORLD SERIES OUTLOOK (6 MODEL-FORWARD TEAM CARDS in a compact 3×2 grid):
  Centered section title: "WORLD SERIES OUTLOOK" (14pt bold uppercase, tight)

  THIS IS A COMPRESSED DATA BOARD — NOT a gallery of large tiles.
  The section should be SHORTER than the editorial section above.
  ALL 6 CARDS are in a uniform 3×2 grid (2 columns, 3 rows) with 4px gap.
  Cards should feel like a tight futures model dashboard.

  EVERY CARD uses a MODEL-FORWARD layout where PROJECTED WINS are the HERO:
    TOP ROW (compact): label pill + logo + team abbrev (20-24pt) LEFT, WS odds badge RIGHT
      - Odds badge is SECONDARY: "WS" label (7-8pt) + odds value (16-19pt) in small box
    HERO CENTER: Projected wins in LARGE DOMINANT TYPE (36-42pt, bold, white)
      + "PROJ. WINS" label beside it (10pt uppercase)
      + Optional signal badge
    BOTTOM SUPPORT: Confidence tier + market delta (11pt) + Key driver + stance (10pt)

  The projected wins number is the MOST VISUALLY DOMINANT element in each card.
  It should be instantly scannable — you see "101" or "54" immediately.
  The odds badge is small and secondary — NOT the focal point.
  Cards must use their interior space FULLY — no dead zones or empty centers.

${futuresContext || '  Top 3 AL + Top 3 NL teams by projected wins'}

  6 cards total. If fewer than 6 are shown, the result is INCORRECT.

FOOTER: "maximussports.ai" — "For entertainment only • 21+"

---

MANDATORY FULL-CANVAS FIVE-ZONE LAYOUT:
The card is divided into FIVE vertical zones:
  Zone A (top ~8%): Centered header badge + date
  Zone B (~15%): Large hero headline — editorial poster style
  Zone C (~32%): Editorial section — 1 full-width + 2 half-width cards
  Zone D (~38%): World Series Outlook — compact 3×2 model-forward board
  Zone E (~7%): Footer — centered, stacked

CRITICAL: The background is a DRAMATIC deep-red gradient with stadium-light
radial glow from the top center, creating editorial sports atmosphere.

Zone A — CENTERED HEADER:
  MLB logo mark + "MAXIMUS SPORTS" glossy badge pill (20pt, centered).
  Date below (14pt, white at 45%).
  No mascot. No left-right brand layout. Centered only.

Zone B — HERO HEADLINE:
  Large UPPERCASE white headline (~50pt bold, multi-line).
  Editorial sports poster feel. Text-shadow for drama.
  Optional italic subhead beneath (~16pt, 50% opacity).

Zone C — EDITORIAL (1 full-width + 2 half-width):
  Row 1: Full-width "HOT OFF THE PRESS" glass card.
  Row 2: "PENNANT RACE INSIGHTS" (left half) + "MARKET SIGNAL" (right half).
  Glass cards with burgundy label pills, ~22pt body text, generous padding.
  This is the STORY SECTION — it must feel prominent and breathable.

Zone D — WORLD SERIES OUTLOOK (model-forward futures board):
  Title: "WORLD SERIES OUTLOOK" with decorative line dividers on each side.
  6 cards in a uniform 3×2 grid (6px gap).

  PROJECTED WINS is the HERO inside each card (48-56pt bold white).
  "PROJ WINS" label inline. Signal badge if available.

  Card layout:
    TOP: label pill + logo + team name (28-34pt) LEFT, odds badge (22-26pt) RIGHT
    CENTER: Projected wins DOMINANT (48-56pt bold)
    BOTTOM: Confidence + delta (13pt) + Driver (12pt)

  Cards are compact but information-dense. No dead space.
  Leader cards get stronger glow/border/gradient.

Zone E — FOOTER:
  Centered stacked: "maximussports.ai" (16pt) + disclaimer (11pt italic).

---

${VISUAL_SYSTEM}

${MASCOT_SPEC}

LOCK RULES — FINAL (STRICTLY ENFORCED):
- Header is CENTERED: MLB mark + "MAXIMUS SPORTS" badge + date. NO mascot. NO left-right layout.
- Hero headline is LARGE (~50pt), UPPERCASE, WHITE, multi-line, editorial poster style
- Editorial section uses 1 FULL-WIDTH card + 2 HALF-WIDTH cards side by side (NOT 3 stacked)
- Editorial body text ~22pt, white at 82% opacity, 1 sentence per card
- 6 team cards in uniform 3×2 grid with 6px gap
- PROJECTED WINS is the HERO inside each card — 48-56pt, dominant, instantly scannable
- Projected wins must be VISUALLY LARGER than team name and odds
- Team names are 28-34pt bold. Odds badges are 22-26pt in bordered box, top-right.
- Leader cards get hierarchy through STYLING (glow, border, gradient), not box size
- ALL team cards have league labels (AL LEADER, NL 2, etc.)
- Card interiors are fully utilized: top identity → hero wins → support meta
- Outlook title has decorative line dividers on each side
- Background is DRAMATIC deep-red gradient with bright stadium-light radial glow from top
- Footer is CENTERED and STACKED: brand URL (16pt) + disclaimer (11pt)
- The slide fills the entire 1080×1350 canvas — FIVE distinct zones
- ALL 6 cards MUST be fully visible — no clipping
- EMOJIS = zero. Team logos only.
- Gemini enhances visual polish ONLY — does NOT redesign layout or change composition

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
