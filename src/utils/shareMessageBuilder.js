/**
 * shareMessageBuilder — centralized share-text generator.
 *
 * Every share action across the app calls `buildShareMessage()` so that
 * outgoing messages are consistently branded, context-aware, and concise
 * enough for iMessage / WhatsApp previews.
 *
 * Structure (2–3 sentences):
 *   1. Contextual insight
 *   2. Maximus Sports value proposition
 *   3. CTA with link
 */

const SITE_URL = 'https://maximussports.ai';

const TEMPLATES = {
  team_intel({ team, stat, record }) {
    const insight = buildTeamInsight(team, stat, record);
    return [
      insight,
      'Maximus Sports tracks team intel, ATS trends, and matchup edges across every program.',
      `See today\u2019s signals \u2192 ${SITE_URL}`,
    ].join('\n\n');
  },

  team_card({ team, stat, record }) {
    const insight = buildTeamInsight(team, stat, record);
    return [
      insight,
      'Maximus Sports tracks team intel, ATS trends, and matchup edges across every program.',
      `See today\u2019s signals \u2192 ${SITE_URL}`,
    ].join('\n\n');
  },

  ats_intel({ team, stat, record }) {
    const line1 = team && stat
      ? `${team} is ${stat} against the spread this season.`
      : team && record
        ? `${team} is posting a ${record} ATS record.`
        : 'ATS edges are surfacing across today\u2019s board.';
    return [
      line1,
      'Maximus Sports surfaces ATS trends, cover rates, and spread performance across every program.',
      `Track ATS leaders \u2192 ${SITE_URL}`,
    ].join('\n\n');
  },

  odds_insight({ matchup, line, signalType }) {
    const line1 = matchup && line
      ? `Model edge spotted: ${matchup} ${line}.`
      : matchup
        ? `Odds intelligence: ${matchup}.`
        : 'Sharp odds movement detected across today\u2019s board.';
    const signal = signalType ? ` Signal: ${signalType}.` : '';
    return [
      `${line1}${signal}`,
      'Maximus Sports analyzes spreads, odds movement, and ATS performance across every game.',
      `Get today\u2019s AI-powered picks \u2192 ${SITE_URL}`,
    ].join('\n\n');
  },

  upset_watch({ team, matchup, stat }) {
    const line1 = matchup
      ? `Upset alert: ${matchup}.`
      : team
        ? `Upset watch: ${team} is in dangerous territory.`
        : 'Upset signals firing across today\u2019s slate.';
    const detail = stat ? ` ${stat}` : '';
    return [
      `${line1}${detail}`,
      'Maximus Sports tracks live upsets, spread busts, and bracket-busting signals in real time.',
      `See live alerts \u2192 ${SITE_URL}`,
    ].join('\n\n');
  },

  bracket_bust({ team, matchup }) {
    const line1 = matchup
      ? `Bracket buster: ${matchup}.`
      : team
        ? `Bracket alert: ${team} could shake up the field.`
        : 'Bracket-busting signals just surfaced.';
    return [
      line1,
      'Maximus Sports delivers bracket intelligence, upset tracking, and tournament analytics.',
      `Check the full board \u2192 ${SITE_URL}`,
    ].join('\n\n');
  },

  matchup({ matchup, line, signalType }) {
    const line1 = matchup && line
      ? `Matchup intel: ${matchup} (${line}).`
      : matchup
        ? `Matchup intel: ${matchup}.`
        : 'Key matchup intel just dropped.';
    const signal = signalType ? ` Signal: ${signalType}.` : '';
    return [
      `${line1}${signal}`,
      'Maximus Sports breaks down spreads, moneylines, and data-driven edges for every game.',
      `Explore matchups \u2192 ${SITE_URL}`,
    ].join('\n\n');
  },

  conference({ team, stat }) {
    const line1 = team
      ? `${team} conference watch just tightened.`
      : stat || 'Conference intel just updated across the board.';
    return [
      line1,
      'Maximus Sports tracks championship odds, ATS trends, and team momentum across every conference.',
      `Explore the full board \u2192 ${SITE_URL}`,
    ].join('\n\n');
  },
};

const GENERIC_MESSAGE = [
  'Maximus Sports delivers AI-powered college basketball intel, betting signals, and team analytics.',
  `Track your teams smarter \u2192 ${SITE_URL}`,
].join('\n\n');

function buildTeamInsight(team, stat, record) {
  if (team && stat) return `${team} is quietly ${stat}.`;
  if (team && record) return `${team} is posting a ${record} record this season.`;
  if (team) return `${team} intel just updated on Maximus Sports.`;
  return 'New team intelligence just dropped.';
}

/**
 * Build a context-aware share message.
 *
 * @param {Object} opts
 * @param {string} opts.type        — share type key (matches ShareButton shareType)
 * @param {string} [opts.team]      — team display name, e.g. "Duke Blue Devils"
 * @param {string} [opts.stat]      — concise stat, e.g. "covering at a 62% ATS clip"
 * @param {string} [opts.record]    — record string, e.g. "18-9-1 ATS"
 * @param {string} [opts.matchup]   — matchup string, e.g. "Duke -7.5 vs Virginia"
 * @param {string} [opts.line]      — spread/line, e.g. "-7.5"
 * @param {string} [opts.signalType]— signal label, e.g. "HIGH", "MEDIUM"
 * @returns {string}
 */
export function buildShareMessage({
  type,
  team,
  stat,
  record,
  matchup,
  line,
  signalType,
} = {}) {
  const builder = TEMPLATES[type];
  if (builder) {
    return builder({ team, stat, record, matchup, line, signalType });
  }
  return GENERIC_MESSAGE;
}
