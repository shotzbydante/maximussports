/**
 * buildMlbGeminiPrompt
 *
 * Constructs a structured Gemini image-generation prompt for MLB IG cards.
 * Each section type gets tailored visual direction while sharing a common
 * premium style foundation.
 */

// ── Style preset (centralized, reusable) ─────────────────────────────────────

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
  typography: 'clean sans-serif hierarchy, bold headlines, light body, sharp contrast',
  composition: 'single portrait card, mobile-first, IG feed optimized',
};

// ── Core style block (shared across all sections) ────────────────────────────

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

// ── Section-specific prompt builders ─────────────────────────────────────────

function dailyBriefingPrompt(payload) {
  const bullets = (payload.bullets || []).map(b => `  - ${b}`).join('\n');
  const signals = (payload.signals || []).join(', ');

  return `
Create a premium MLB Daily Briefing Instagram card.

CONTENT:
- Top badge: "MLB DAILY BRIEFING"
- Date: ${payload.dateLabel || 'Today'}
- Main headline: "${payload.headline}"
${payload.subhead ? `- Subhead: "${payload.subhead}"` : ''}
${bullets ? `- Key bullets:\n${bullets}` : ''}
${signals ? `- Board summary: ${signals}` : ''}
- Footer: "maximussports.ai" + "For entertainment only. 21+"

VISUAL DIRECTION:
- Full-slate editorial feel — broad, authoritative
- Centered composition with headline dominating
- Subtle baseball diamond or field geometry in background
- Glass panel for the headline area
- Small stats/signals in a secondary panel below
`.trim();
}

function teamIntelPrompt(payload) {
  const teamName = payload.teamA?.name || 'Team';
  const bullets = (payload.bullets || []).map(b => `  - ${b}`).join('\n');

  return `
Create a premium MLB Team Intel Instagram card for ${teamName}.

CONTENT:
- Top badge: "MLB TEAM INTEL"
- Main headline: "${payload.headline}"
- Subhead: "${payload.subhead || 'Full model-driven breakdown'}"
${bullets ? `- Intel bullets:\n${bullets}` : ''}
- Footer: "maximussports.ai" + "For entertainment only. 21+"

VISUAL DIRECTION:
- Team-centric hero feel — the team identity should be prominent
- Use ${teamName}'s general color scheme as accent alongside the base burgundy/navy
- Dramatic spotlight/vignette effect
- Glass intel panel with structured data points
- Baseball-specific visual cues (bat, diamond silhouette)
`.trim();
}

function leagueIntelPrompt(payload) {
  const league = payload.league || 'AL';
  const fullName = league === 'AL' ? 'American League' : 'National League';
  const bullets = (payload.bullets || []).map(b => `  - ${b}`).join('\n');

  return `
Create a premium MLB League Intel Instagram card for the ${fullName}.

CONTENT:
- Top badge: "${fullName.toUpperCase()} INTEL"
- Main headline: "${payload.headline}"
- Subhead: "${payload.subhead || ''}"
${bullets ? `- Storylines:\n${bullets}` : ''}
- Footer: "maximussports.ai" + "For entertainment only. 21+"

VISUAL DIRECTION:
- Conference/league-race feel — competitive, dynamic
- Subtle standings-board visual element
- Split composition suggesting multiple teams competing
- ${league === 'AL' ? 'Cool blue' : 'Warm red'} accent tones mixed with base palette
- Premium editorial sports magazine layout
`.trim();
}

function divisionIntelPrompt(payload) {
  const division = payload.division || 'AL East';
  const bullets = (payload.bullets || []).map(b => `  - ${b}`).join('\n');

  return `
Create a premium MLB Division Intel Instagram card for the ${division}.

CONTENT:
- Top badge: "${division.toUpperCase()} INTEL"
- Main headline: "${payload.headline}"
- Subhead: "${payload.subhead || ''}"
${bullets ? `- Division signals:\n${bullets}` : ''}
- Footer: "maximussports.ai" + "For entertainment only. 21+"

VISUAL DIRECTION:
- Division-race intensity — tight competition feel
- Subtle leaderboard/standings visual element
- Glass panels suggesting team rankings
- Focused, analytical composition
`.trim();
}

function gameInsightsPrompt(payload) {
  const awayName = payload.teamA?.name || 'Away';
  const homeName = payload.teamB?.name || 'Home';
  const signals = (payload.signals || []).map(s => `  - ${s}`).join('\n');

  return `
Create a premium MLB Game Preview Instagram card: ${awayName} at ${homeName}.

CONTENT:
- Top badge: "MLB GAME PREVIEW"
- Matchup: "${awayName} VS ${homeName}"
${payload.recordA ? `- ${awayName} record: ${payload.recordA}` : ''}
${payload.recordB ? `- ${homeName} record: ${payload.recordB}` : ''}
- Subhead: "${payload.subhead || 'Model-driven matchup analysis'}"
${signals ? `- Market snapshot:\n${signals}` : ''}
- Footer: "maximussports.ai" + "For entertainment only. 21+"

VISUAL DIRECTION:
- Head-to-head matchup composition — two sides facing off
- Split visual with team identity on each side
- "VS" graphic treatment in center
- Glass panel for market data below matchup
- Dramatic lighting suggesting night-game atmosphere
- Baseball-specific elements (diamond, mound silhouette)
`.trim();
}

function maximusPicksPrompt(payload) {
  const signals = (payload.signals || []).map(s => `  - ${s}`).join('\n');
  const conf = payload.keyPick?.confidence;

  return `
Create a premium MLB Maximus's Picks Instagram card.

CONTENT:
- Top badge: "MAXIMUS'S PICKS"
- Main headline: "${payload.headline}"
- Subhead: "${payload.subhead || ''}"
${payload.keyPick ? `- Top pick: "${payload.keyPick.label}" (${payload.keyPick.market})${conf ? ` — ${conf.toUpperCase()} confidence` : ''}` : ''}
${signals ? `- Board signals:\n${signals}` : ''}
- Footer: "maximussports.ai" + "For entertainment only. 21+"

VISUAL DIRECTION:
- Picks-board / dashboard feel — structured, data-rich but clean
- Hero treatment for the top pick — large, prominent, confident
${conf === 'high' ? '- Green accent glow for high confidence' : ''}
- Secondary picks in smaller glass cards below
- Sharp data-terminal aesthetic
- Scoreboard-like precision in layout
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
 *
 * @param {import('./normalizeMlbImagePayload').MlbImagePayload} payload
 * @returns {string}
 */
export function buildMlbGeminiPrompt(payload) {
  const sectionBuilder = SECTION_BUILDERS[payload.section] || dailyBriefingPrompt;
  const sectionPrompt = sectionBuilder(payload);

  return [
    STYLE_FOUNDATION,
    '',
    sectionPrompt,
    '',
    AVOID_BLOCK,
  ].join('\n');
}
