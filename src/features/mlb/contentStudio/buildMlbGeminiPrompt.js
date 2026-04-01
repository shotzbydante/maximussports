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

  return `You are rendering a 3-SLIDE INSTAGRAM CAROUSEL — not a single card.
You are an art director rendering pixel-precise mobile sports intelligence slides.
Your role is to ENHANCE VISUAL POLISH on each canonical slide, not redesign them.

This is a 3-SLIDE CAROUSEL:
  SLIDE 1 = Hero Cover (hook + mascot + branding)
  SLIDE 2 = Editorial Briefing (story + editorial cards)
  SLIDE 3 = World Series Outlook Board + CTA (data + conversion)

You MUST follow the EXACT structure for EACH slide. Do NOT combine slides or invent layouts.
Each slide is 1080×1350 (IG 4:5 portrait).

${IDENTITY_RULES}

HARD CONSTRAINTS:
- Background is a DRAMATIC deep-red/burgundy gradient with stadium-light radial glow
- Use team LOGOS only — absolutely ZERO emojis anywhere
- Professional editorial poster tone — ESPN broadcast meets Bloomberg terminal
- Each slide must look designed by a product team, not generated by AI

---

EXACT CONTENT FOR EACH SLIDE (render verbatim — perfect spelling):

═══ SLIDE 1 — HERO COVER ═══
Purpose: Scroll-stopping hook. Minimal text, maximum visual impact.

COMPOSITION (strict vertical layout):
  TOP (compact): Maximus Sports logo + "MAXIMUS SPORTS" wordmark (16pt, 75% opacity)
  TOP-THIRD: Mascot hero (420px, Pixar-like 3D baseball mascot, premium drop shadow)
  TRUE CENTER of canvas: MLB logo (56px) + "DAILY MLB BRIEFING" title + date
    - Title: 86pt bold uppercase white with glow text-shadow — THE DOMINANT ELEMENT
    - Date: "${date}" (22pt, white at 55%, directly under title, tight spacing)
  BOTTOM: Tagline (17pt italic, 32% opacity) + footer

CRITICAL RULES:
  - Title "DAILY MLB BRIEFING" is the HERO — largest element, centered on canvas
  - Mascot sits in TOP-THIRD, NOT center — it supports the title, not competes
  - Do NOT shrink the title below 80pt
  - Do NOT push the title below center
  - Do NOT overcrowd this slide — it is HOOK ONLY
  - NO team cards, NO dense text, NO editorial copy

═══ SLIDE 2 — EDITORIAL BRIEFING ═══
Purpose: The story — clean, readable editorial narrative.

CONTENT:
  Header: MLB logo + "TODAY'S INTEL BRIEFING" badge (16pt) + date
  Headline: "${headline}" (40pt, uppercase, white, centered)
${subhead ? `  Subhead: "${subhead}" (16pt, italic, 48% opacity)` : ''}

  Editorial cards (1 full-width + 2 half-width):
    Row 1: Full-width "HOT OFF THE PRESS" — 2-3 punchy sentences, broad news coverage
    Row 2: "PENNANT RACE INSIGHTS" (left half) + "MARKET SIGNAL" (right half) — 1-2 sentences each

  Each card: icon + label pill (14pt), body text ~24pt, glass treatment, generous padding
  Swipe hint: "Swipe for World Series Outlook →" (14pt, 30% opacity)
${bulletBlock}

  This slide is SPACIOUS AND READABLE — no density cramming needed.

═══ SLIDE 3 — WORLD SERIES OUTLOOK + CTA ═══
Purpose: Data showcase + conversion.

CONTENT:
  Header: MLB logo + "WORLD SERIES OUTLOOK" title with decorative line dividers (24pt)

  6 MODEL-FORWARD TEAM CARDS in 3×2 grid (10px gap):
  Now on their own slide, cards are LARGER and MORE READABLE than the single-slide version.

  CARD INTERIOR:
    TOP: label pill + team logo (40-48px) + team name (34-40pt) LEFT, trophy + odds (24-28pt) RIGHT
    HERO: "{XX} PROJECTED WINS" as unified same-size line (number 36-42pt, label 18-21pt)
    BOTTOM: 1-2 sentence rationale (15-16pt)
    Signal badge if applicable

${futuresContext || '  Top 3 AL + Top 3 NL teams by projected wins'}

  CTA BLOCK below the grid:
    Headline: "Get the full edge" (28pt bold)
    Subtext: "Daily AI-powered picks, projections, and insights" (16pt)
    Button: "View today's picks →" (18pt, glossy red pill)

  Footer: "maximussports.ai" + disclaimer

---

MANDATORY 3-SLIDE CAROUSEL LAYOUT:

Each slide is 1080×1350 (IG 4:5 portrait).
All 3 slides share the same deep-red gradient visual system.

SLIDE 1 — HERO COVER:
  - Mascot in TOP-THIRD zone (420px, NOT centered — sits above title)
  - "DAILY MLB BRIEFING" title (86pt bold uppercase) at TRUE CENTER of canvas
  - This title is THE DOMINANT ELEMENT — largest thing on the slide
  - Date (22pt) directly under title with tight spacing
  - MLB logo above title (56px)
  - Minimal text. Maximum visual impact. Designed to stop scroll.
  - NO team cards. NO editorial text. NO dense info.

SLIDE 2 — EDITORIAL BRIEFING:
  - "TODAY'S INTEL BRIEFING" badge + headline (40pt uppercase)
  - 1 full-width "HOT OFF THE PRESS" card (2-3 sentences, 24pt body)
  - 2 half-width cards: "PENNANT RACE INSIGHTS" + "MARKET SIGNAL"
  - Spacious, readable, editorial. Text is LARGE since it's on its own slide.
  - Swipe hint at bottom directing to slide 3.

SLIDE 3 — WORLD SERIES OUTLOOK + CTA:
  - "WORLD SERIES OUTLOOK" header with decorative dividers
  - 6 team cards in 3×2 grid (10px gap, generous card sizing)
  - Cards are LARGER than single-slide version — more readable
  - CTA block at bottom: "Get the full edge" + "View today's picks →"
  - Footer with brand URL + disclaimer

---

${VISUAL_SYSTEM}

${MASCOT_SPEC}

LOCK RULES — FINAL (STRICTLY ENFORCED):
- This is a 3-SLIDE CAROUSEL, not a single slide
- Slide 1 = Hero Cover with mascot. NO dense text. NO cards.
- Slide 2 = Editorial Briefing with 1 full-width + 2 half-width cards. SPACIOUS text (~24pt body).
- Slide 3 = World Series Outlook board (6 cards, 3×2 grid) + CTA block
- ALL 6 team cards MUST be fully visible on Slide 3 — NO CLIPPING
- "{XX} PROJECTED WINS" reads as ONE unified hero line (number ~36-42pt + label ~18-21pt)
- Team LOGO is prominent (40-48px), team names 34-40pt
- Odds: trophy SVG + value (24-28pt) in gold-tinted glassy chip
- Card rationale is 1-2 readable sentences (15-16pt)
- CTA block: "Get the full edge" headline + "View today's picks →" button
- Background is DRAMATIC deep-red gradient across all 3 slides (cohesive set)
- EMOJIS = zero. Team logos only.
- Gemini enhances visual polish ONLY — does NOT redesign, does NOT combine slides

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
