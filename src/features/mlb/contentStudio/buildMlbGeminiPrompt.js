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
Your role is to ENHANCE VISUAL POLISH, not redesign the layout.

You MUST follow the EXACT structure provided. Do NOT invent alternative layouts.
You MUST fill the ENTIRE 1080×1350 canvas — no empty space at bottom.

${IDENTITY_RULES}

HARD CONSTRAINTS FOR THIS CARD:
- The main HEADLINE must be WHITE (#FFFFFF) UPPERCASE — NOT gold, NOT yellow, NOT any other color
- Subhead text must be white at ~50% opacity — readable, not invisible
- Use team LOGOS only — absolutely ZERO emojis anywhere (no face, flag, or object emojis)
- Use structured glass panels with visible BORDERS that stand out from the background
- Each panel must have a subtle red/warm GLOW on its border (box-shadow with rgba(180,20,40))
- The WORLD SERIES OUTLOOK panel gets the STRONGEST glow — it is the hero data module
- Fill every zone of the canvas — the bottom half must have content, not empty space
- Professional editorial tone — ESPN broadcast quality
- The card must look like it was designed by a product team, not generated by AI

---

EXACT CONTENT (render verbatim — perfect spelling):

ZONE 1 — HEADER:
  Left side: logo + "MAXIMUS SPORTS" wordmark
  Right side: Maximus mascot
  Center below: MLB logo + "MLB DAILY BRIEFING" glossy badge
  Below: "${date}"

ZONE 2 — HERO:
  "${headline}" (sentence case — NOT all-caps, white, ~32pt bold, MAX 60 CHARS — concise and editorial)
${subhead ? `  "${subhead}" (~16pt, white at 55% opacity, MAX 80 CHARS — one sentence only)` : ''}

ZONE 3 — EDITORIAL (3 SEPARATE PREMIUM CARDS — THE STORY HOOK):
  This is the PRIMARY NARRATIVE SECTION of the slide. It MUST feel prominent and breathable.
  Each editorial block is its OWN glass card with:
    - A subtle inline SVG ICON + colored LABEL TAB at top (burgundy pill, uppercase, bold)
    - ONE concise sentence of body text — punchy editorial blurb, NOT a mini-paragraph
  The 3 cards are:
    1. bolt icon + "HOT OFF THE PRESS" — league-wide narrative hook (1 sentence)
    2. pennant icon + "PENNANT RACE INSIGHTS" — contention/rivalry/positioning (1 sentence)
    3. pulse icon + "MARKET SIGNAL" — odds movement/implied probability (1 sentence)
  Body text ~23pt, white at 82% opacity, strong contrast. Readable on mobile.
  Give each card GENEROUS padding (16-18px). This section gets MORE vertical space than the grid below.
  Editorial cards = the story. Outlook grid = the data board. Story dominates.
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

MANDATORY FULL-CANVAS THREE-ZONE LAYOUT:
The card is divided into THREE deliberate vertical zones:
  Zone A (top ~15-18%): Header + Hero — compact brand, badge, date, headline, subhead
  Zone B (middle ~42-48%): 3 editorial cards — the DOMINANT STORY section, generous padding, large text (~23pt)
  Zone C (bottom ~35-40%): World Series Outlook + footer — COMPRESSED model-forward data board

CRITICAL: The editorial section is the STORY. The outlook is the DATA BOARD.
The story section must feel bigger and more prominent than the data board.
No dead zones. The outlook section fills remaining canvas but stays compact.

Zone A — HEADER + HERO:
  "MAXIMUS SPORTS" LEFT (17pt), mascot RIGHT (54px).
  Glossy badge: 16pt text, 26px MLB crest, 6px 24px padding.
  Date below (12pt).
  WHITE headline ~32pt sentence case bold (NOT all-caps, MAX 60 CHARS).
  Subhead ~16pt at 55% opacity (MAX 80 CHARS, one sentence).

Zone B — EDITORIAL (the DOMINANT story / narrative hook):
  3 SEPARATE glass cards stacked vertically with 8px gap.
  Each card: 16-18px padding, icon + 12px label tab.
  Body text: ~23pt, white at 82% opacity (highly readable on mobile — 1 sentence per card).
  Each card has a subtle inline SVG icon next to the label pill.
  This zone gets the MOST vertical space of any zone.
  Must feel like the narrative centerpiece of the slide.

Zone C — WORLD SERIES OUTLOOK (compressed model-forward data board):
  Centered title: "WORLD SERIES OUTLOOK" (14pt bold uppercase).
  6 COMPACT CARDS in a uniform 3×2 grid, 4px gap.
  Cards use a MODEL-FORWARD layout:

    PROJECTED WINS is the HERO ELEMENT inside each card (36-42pt bold).
    It must be the first thing the eye hits — instant scanability.

  ALL CARDS share the same box dimensions. Hierarchy through styling only:
    LEADER CARDS: Stronger glow, border, gradient. Larger projected wins (42pt vs 36pt).
    NON-LEADER CARDS: lighter glass treatment.

  INTERNAL CARD LAYOUT:
    TOP: label pill + logo + team name (20-24pt) LEFT, small WS odds badge RIGHT
    CENTER HERO: Projected wins NUMBER in dominant large type (36-42pt)
      + "PROJ. WINS" label (10pt) + optional signal badge
    BOTTOM: Confidence + delta (11pt) + Driver + stance (10pt)

  Cards MUST use their full interior — no dead centers, no empty bottoms.
  FOOTER snug below (11pt URL, 9pt disclaimer).

---

${VISUAL_SYSTEM}

${MASCOT_SPEC}

LOCK RULES — FINAL (STRICTLY ENFORCED):
- 6 COMPACT team cards in a uniform 3×2 grid (NOT 2 big + 4 small)
- PROJECTED WINS is the HERO ELEMENT inside each card — 36-42pt, dominant, instantly scannable
- Projected wins must be VISUALLY LARGER than team name and odds — it is the model's output
- WS odds are SECONDARY — small badge in top-right of card, NOT the focal point
- Leader cards get hierarchy through STYLING (glow, border, gradient), not box size
- ALL team cards MUST have league labels (AL LEADER, NL LEADER, AL 2, etc.)
- Team cards must be COMPACT — no dead space inside, no empty centers, no loose padding
- Card interior is fully utilized: top identity row → hero wins center → support meta bottom
- Editorial section = 3 SEPARATE glass cards with label tabs (NOT one flat panel)
- Editorial is the DOMINANT STORY HOOK — it gets MORE vertical space than the data grid
- Editorial body text ~23pt, white at 82% opacity, 1 sentence per card — highly readable on mobile
- Each editorial card has generous padding (16-18px) and a subtle inline SVG icon
- The slide MUST fill the entire 1080×1350 canvas — THREE deliberate zones
- Top ~60-65% = header + hero + editorial (DOMINANT, generous, breathable)
- Bottom ~35-40% = outlook cards + footer (COMPRESSED data board, tight, model-forward)
- NO large empty area beneath the outlook cards
- Lighter premium glass on team cards — not too dark or muddy
- HEADLINE = WHITE sentence case ~32pt (NOT all-caps, MAX 60 CHARS)
- Card metadata minimum 10pt, team names 20-24pt, WS odds 16-19pt
- ALL 6 cards MUST be fully visible — no clipping at bottom of slide
- EMOJIS = zero. Team logos only.
- BACKGROUND = dark true-red gradient. No stadium.
- Gemini enhances visual polish ONLY — does NOT redesign, does NOT inflate card sizes, does NOT revert to old left-right layout

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
