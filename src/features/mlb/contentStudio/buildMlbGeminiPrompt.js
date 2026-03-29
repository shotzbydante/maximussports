/**
 * buildMlbGeminiPrompt
 *
 * Constructs a DETERMINISTIC UI-rendering prompt for Gemini image generation.
 * Gemini renders the layout — it does NOT generate or reinterpret content.
 * All text comes verbatim from the normalized payload.
 */

// ── Centralized style preset ─────────────────────────────────────────────────

export const MLB_STYLE_PRESET = {
  id: 'mlb-glassy-terminal',
  palette: {
    primary: 'deep burgundy (#8B1A2B)',
    secondary: 'dark navy (#0A1628)',
    accent: 'warm gold (#C4A55A)',
    text: 'crisp white',
    glass: 'frosted translucent panels with subtle white borders',
  },
  atmosphere: 'cinematic baseball night-game under stadium lights',
  feel: 'Bloomberg Terminal meets premium sportsbook meets The Athletic',
};

// ── Layout variants (future-ready) ──────────────────────────────────────────

export const LAYOUT_VARIANTS = {
  'headline-heavy': 'Large headline dominates, bullets smaller below',
  'matchup-heavy': 'Matchup logos/teams are the hero, headline secondary',
};

// ── Design system (shared across all sections) ──────────────────────────────

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
- Small mascot icon or baseball graphic accent

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
- Clean bullet points with subtle bullet markers
- Good line spacing for readability
- White text, slightly lower opacity than headline

Footer:
- "maximussports.ai" — small, centered
- "For entertainment only • 21+" — tiny disclaimer below

STYLE:
- Premium, sleek, glassy
- ESPN broadcast quality crossed with Apple design crossed with Bloomberg Terminal
- Clean structured UI — NOT a poster, NOT a collage
- Mobile-first readability
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

const CRITICAL_RULES = `
CRITICAL RULES:
- DO NOT rewrite, summarize, or reinterpret ANY content
- DO NOT invent data, stats, or text
- DO NOT add new text beyond what is provided
- Use the EXACT text provided in the CONTENT section
- Focus ONLY on layout, hierarchy, typography, and visual polish
- Render this as a structured UI card, not a creative graphic
`.trim();

// ── Section-specific prompt builders ─────────────────────────────────────────

function dailyBriefingPrompt(payload) {
  const intel = payload.intelBriefing;
  const headline = intel?.headline || payload.headline || 'MLB Daily Briefing';
  const bullets = (intel?.bullets || payload.bullets || []).slice(0, 5);
  const matchups = intel?.keyMatchups || payload.keyMatchups || [];
  const date = intel?.date || payload.dateLabel || '';

  const bulletBlock = bullets.map((b, i) => `  ${i + 1}. ${b}`).join('\n');
  const matchupBlock = matchups.length > 0
    ? matchups.map(m => `  ${m.teamA} vs ${m.teamB}`).join('\n')
    : '';

  return `
You are generating a premium Instagram sports intelligence card.

GOAL:
Render a single MLB Daily Briefing card using the EXACT content provided.

${CRITICAL_RULES}

---

CONTENT:

HEADLINE:
${headline}

BULLETS:
${bulletBlock || '  (No bullets available)'}

${matchupBlock ? `MATCHUPS:\n${matchupBlock}` : ''}

DATE:
${date}

---

${DESIGN_SYSTEM}

SECTION-SPECIFIC DIRECTION:
- This is a DAILY BRIEFING — full-slate editorial feel
- Headline should dominate the glass card
- Bullets listed cleanly below headline
- If matchups present, show as a compact row near bottom of card
- Authoritative, morning-briefing energy

${AVOID_BLOCK}
`.trim();
}

function teamIntelPrompt(payload) {
  const teamName = payload.teamA?.name || payload.headline || 'Team';
  const bullets = (payload.bullets || []).slice(0, 5);
  const bulletBlock = bullets.map((b, i) => `  ${i + 1}. ${b}`).join('\n');

  return `
You are generating a premium Instagram sports intelligence card.

GOAL:
Render a single MLB Team Intel card for ${teamName} using the EXACT content provided.

${CRITICAL_RULES}

---

CONTENT:

HEADLINE:
${payload.headline || `${teamName} Intel Report`}

SUBHEAD:
${payload.subhead || 'Model-driven team breakdown'}

BULLETS:
${bulletBlock || '  (No bullets available)'}

DATE:
${payload.dateLabel || ''}

---

${DESIGN_SYSTEM}

SECTION-SPECIFIC DIRECTION:
- Team-centric hero card
- Team name should be prominent
- Dramatic spotlight/vignette effect
- Glass panel with structured intel bullets
- Baseball visual accents (subtle)

${AVOID_BLOCK}
`.trim();
}

function leagueIntelPrompt(payload) {
  const league = payload.league || 'AL';
  const fullName = league === 'AL' ? 'American League' : 'National League';
  const bullets = (payload.bullets || []).slice(0, 5);
  const bulletBlock = bullets.map((b, i) => `  ${i + 1}. ${b}`).join('\n');

  return `
You are generating a premium Instagram sports intelligence card.

GOAL:
Render a single MLB ${fullName} Intel card using the EXACT content provided.

${CRITICAL_RULES}

---

CONTENT:

BADGE:
${fullName.toUpperCase()} INTEL

HEADLINE:
${payload.headline || `${fullName} Overview`}

SUBHEAD:
${payload.subhead || ''}

BULLETS:
${bulletBlock || '  (No bullets available)'}

DATE:
${payload.dateLabel || ''}

---

${DESIGN_SYSTEM}

SECTION-SPECIFIC DIRECTION:
- League-race competitive feel
- Subtle standings/leaderboard visual element
- ${league === 'AL' ? 'Cool blue accent tones' : 'Warm red accent tones'} mixed with base palette

${AVOID_BLOCK}
`.trim();
}

function divisionIntelPrompt(payload) {
  const division = payload.division || 'AL East';
  const bullets = (payload.bullets || []).slice(0, 5);
  const bulletBlock = bullets.map((b, i) => `  ${i + 1}. ${b}`).join('\n');

  return `
You are generating a premium Instagram sports intelligence card.

GOAL:
Render a single MLB ${division} Division Intel card using the EXACT content provided.

${CRITICAL_RULES}

---

CONTENT:

BADGE:
${division.toUpperCase()} INTEL

HEADLINE:
${payload.headline || `${division} Division Report`}

SUBHEAD:
${payload.subhead || ''}

BULLETS:
${bulletBlock || '  (No bullets available)'}

DATE:
${payload.dateLabel || ''}

---

${DESIGN_SYSTEM}

SECTION-SPECIFIC DIRECTION:
- Division-race intensity
- Glass panels suggesting team rankings
- Focused analytical composition

${AVOID_BLOCK}
`.trim();
}

function gameInsightsPrompt(payload) {
  const away = payload.teamA?.name || 'Away';
  const home = payload.teamB?.name || 'Home';
  const signals = (payload.signals || []).map(s => `  - ${s}`).join('\n');

  return `
You are generating a premium Instagram sports intelligence card.

GOAL:
Render a single MLB Game Preview card: ${away} at ${home}, using the EXACT content provided.

${CRITICAL_RULES}

---

CONTENT:

BADGE:
MLB GAME PREVIEW

MATCHUP:
${away} VS ${home}

${payload.recordA ? `AWAY RECORD: ${payload.recordA}` : ''}
${payload.recordB ? `HOME RECORD: ${payload.recordB}` : ''}

SUBHEAD:
${payload.subhead || 'Model-driven matchup analysis'}

${signals ? `MARKET SNAPSHOT:\n${signals}` : ''}

DATE:
${payload.dateLabel || ''}

---

${DESIGN_SYSTEM}

SECTION-SPECIFIC DIRECTION:
- Head-to-head matchup composition
- Team names on each side with "VS" in center
- Glass panel for market data below
- Dramatic night-game atmosphere

${AVOID_BLOCK}
`.trim();
}

function maximusPicksPrompt(payload) {
  const signals = (payload.signals || []).map(s => `  - ${s}`).join('\n');
  const conf = payload.keyPick?.confidence;

  return `
You are generating a premium Instagram sports intelligence card.

GOAL:
Render a single MLB Maximus's Picks card using the EXACT content provided.

${CRITICAL_RULES}

---

CONTENT:

BADGE:
MAXIMUS'S PICKS

HEADLINE:
${payload.headline || "Today's Board"}

SUBHEAD:
${payload.subhead || ''}

${payload.keyPick ? `TOP PICK: ${payload.keyPick.label} (${payload.keyPick.market})${conf ? ` — ${conf.toUpperCase()} CONFIDENCE` : ''}` : ''}

${signals ? `BOARD SIGNALS:\n${signals}` : ''}

DATE:
${payload.dateLabel || ''}

---

${DESIGN_SYSTEM}

SECTION-SPECIFIC DIRECTION:
- Picks-board / dashboard feel
- Hero treatment for the top pick — large and prominent
${conf === 'high' ? '- Green accent glow for high confidence' : ''}
- Secondary picks in smaller rows
- Sharp data-terminal aesthetic

${AVOID_BLOCK}
`.trim();
}

// ── Main prompt builder ──────────────────────────────────────────────────────

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
  const sectionBuilder = SECTION_BUILDERS[payload.section] || dailyBriefingPrompt;
  return sectionBuilder(payload);
}
