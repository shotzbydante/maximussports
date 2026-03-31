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
  "${headline}" (UPPERCASE, white, ~38pt bold, generous breathing room)
${subhead ? `  "${subhead}" (~17pt, white at 60% opacity)` : ''}

ZONE 3 — EDITORIAL (3 SEPARATE PREMIUM CARDS, NOT one flat panel):
  Each editorial block is its OWN glass card with:
    - A small colored LABEL TAB at top (burgundy pill, uppercase, bold)
    - Body text below
  The 3 cards are:
    1. "HOT OFF THE PRESS:" — top headline editorial
    2. "PENNANT RACE INSIGHTS:" — odds/standings editorial
    3. "MARKET SIGNAL:" — model/market editorial
${bulletBlock}

ZONE 4 — WORLD SERIES OUTLOOK (6 TEAM CARDS — 2 FEATURED + 4 SECONDARY):
  Centered section title: "WORLD SERIES OUTLOOK" (20pt bold uppercase)

  TOP ROW: 2 LARGE FEATURED CARDS side by side:
    - Each has a small LEAGUE LABEL at top: "AL LEADER" or "NL LEADER"
    - Logo (48px) + Team abbreviation (28pt bold) + Odds (24pt, right-aligned)
    - "Projected wins: XX" with signal badge
    - Confidence tier + vs market delta
    - "Key Driver: X - Stance" + small chart icon (bottom right)
    - STRONG GLOW border (box-shadow with red accent)
${futuresContext || '  Top 3 AL + Top 3 NL teams by projected wins'}

  BOTTOM: 4 SMALLER SECONDARY CARDS in a 2x2 grid:
    - Each has a small LEAGUE LABEL at top: "AL 2", "AL 3", "NL 2", "NL 3"
    - Logo (22px) + Name (16pt) + Odds (14pt right-aligned)
    - "Projected wins: XX" + signal badge inline
    - Confidence + vs market + key driver (compact)
  6 cards total. If fewer than 6 are shown, the result is INCORRECT.

FOOTER: "maximussports.ai" — "For entertainment only • 21+"

---

MANDATORY FULL-CANVAS THREE-ZONE LAYOUT:
The card is divided into THREE deliberate vertical zones:
  Zone A (top ~22-25%): Header + Hero — brand, badge, date, headline, subhead
  Zone B (middle ~30-35%): 3 editorial cards — generous padding, readable body text
  Zone C (bottom ~38-42%): World Series Outlook + footer — data-rich but compact

CRITICAL: No dead zones. No large empty areas below the outlook cards.
The outlook section sizes to its CONTENT, not to fill remaining space.
The footer sits snugly beneath the outlook section.

Zone A — HEADER + HERO (~300px):
  "MAXIMUS SPORTS" LEFT (17pt), mascot RIGHT (62px).
  Glossy badge centered (15pt). Date below (13pt).
  WHITE headline ~38pt UPPERCASE bold. Subhead ~17pt at 60% opacity.
  The headline should BREATHE — generous padding around it.

Zone B — EDITORIAL (~430px):
  3 SEPARATE glass cards stacked vertically with 8px gap.
  Each card: 16px padding, 12px label tab, 16pt body text.
  Must feel like premium publishable editorial blocks.
  NOT compressed or squished — these are the narrative heart of the card.

Zone C — WORLD SERIES OUTLOOK (~540px):
  Centered title: "WORLD SERIES OUTLOOK" (20pt bold uppercase).
  2 FEATURED CARDS on top — these must CLEARLY POP:
    - "AL LEADER" / "NL LEADER" labels (11pt)
    - Logo (52px). Team name: 32pt bold. Odds: 28pt right-aligned.
    - "Projected wins: XX" (15pt) + signal badge (11pt)
    - Confidence + vs market (14pt)
    - Key Driver + stance (13pt) + chart icon
    - STRONG GLOW: box-shadow 32px rgba(180,20,40,0.20)
    - 16px internal padding, 1.5px border rgba(255,255,255,0.16)
  4 SECONDARY CARDS in 2x2 grid — compact but elegant:
    - "AL 2", "AL 3", "NL 2", "NL 3" labels (10pt)
    - Logo (22px). Name: 18pt. Odds: 16pt right-aligned.
    - Projected wins (12pt) + confidence + key driver
    - 10px padding, clean spacing between rows
    - Clearly subordinate to featured cards
  FOOTER snug below (12pt URL, 10pt disclaimer).

---

${VISUAL_SYSTEM}

${MASCOT_SPEC}

LOCK RULES — FINAL:
- Follow the standard slide 2+4 card structure EXACTLY
- 2 LARGE featured cards on top, 4 SMALLER secondary cards below
- Featured cards must CLEARLY POP — stronger glow, bigger text, more padding than secondary
- ALL team cards MUST have league labels (AL LEADER, NL LEADER, AL 2, etc.)
- Editorial section = 3 SEPARATE glass cards with label tabs (NOT one flat panel)
- The slide MUST fill the entire 1080×1350 canvas — THREE deliberate zones
- Top 60% = header + hero + editorial (generous, readable, breathable)
- Bottom 40% = outlook cards + footer (data-rich, compact, no dead zone)
- NO large empty area beneath the outlook cards
- HEADLINE = WHITE UPPERCASE ~38pt
- ALL body text must be READABLE on mobile (minimum 16pt for editorial, 12pt for card metadata)
- EMOJIS = zero. Team logos only.
- BACKGROUND = dark true-red gradient. No stadium.
- Gemini enhances visual polish, does NOT redesign layout

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
