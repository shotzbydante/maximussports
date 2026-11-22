/** Formatting helpers shared by the NBA home, games and picks pages. */

import { NBA_TEAMS, nbaNickname } from '../../../sports/nba/teams';
import { getNbaEspnLogoUrl } from '../../../utils/espnNbaLogos';

export { fmtLine, fmtOdds, timeAgo } from '../../nfl/home/format';
export { nbaNickname };

export const nbaLogoUrl = (slug) => getNbaEspnLogoUrl(slug);

/** Tip-off in the viewer's own time zone, e.g. "6:00 PM". The slate is one day, so no weekday. */
export function tipShort(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch { return ''; }
}

/** "Sun 6:00 PM PST": for pages that list more than one day, or cite a time. */
export function tipLong(iso) {
  if (!iso) return '';
  try {
    return new Date(iso)
      .toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
      .replace(',', '');
  } catch { return ''; }
}

/** "Q3 4:12", "Half", "Final", "Final, overtime": the game's status in words. */
export function statusText(game) {
  const gs = game?.gameState || {};
  if (gs.isFinal) return gs.isOvertime ? (gs.overtimeCount > 1 ? `Final, ${gs.overtimeCount} overtimes` : 'Final, overtime') : 'Final';
  if (gs.isLive) {
    const label = String(gs.periodLabel || '');
    // ESPN sends "4:12 - 3rd" for a live game; a date string is not a clock.
    if (/halftime/i.test(label)) return 'Half';
    return /\d{1,2}\/\d{1,2}/.test(label) || !label ? 'Live' : label;
  }
  return '';
}

const escapeRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TEAM_BY_TEXT = new Map();
for (const t of NBA_TEAMS) {
  TEAM_BY_TEXT.set(t.name, t.slug);
  TEAM_BY_TEXT.set(nbaNickname(t.slug), t.slug);
}
TEAM_BY_TEXT.set('Sixers', 'phi');
TEAM_BY_TEXT.set('Blazers', 'por');
TEAM_BY_TEXT.set('Cavs', 'cle');
TEAM_BY_TEXT.set('Mavs', 'dal');
// "Heat", "Magic", "Jazz", "Thunder", "Suns", "Nets", "Kings", "Bulls" are
// ordinary words too. Matching is case-sensitive and whole-word, which is
// enough in sports copy: "the heat" is weather, "the Heat" is Miami.
const buildRe = (keys) => new RegExp(
  `(?<![A-Za-z0-9])(${[...keys].sort((a, b) => b.length - a.length).map(escapeRe).join('|')})(?![A-Za-z0-9])`,
  'g',
);
const TEAM_RE = buildRe(TEAM_BY_TEXT.keys());
// Abbreviations ("OKC", "BOS") are only safe to match in text our own code wrote.
const TEAM_BY_TEXT_ABBREV = new Map(TEAM_BY_TEXT);
for (const t of NBA_TEAMS) TEAM_BY_TEXT_ABBREV.set(t.abbrev, t.slug);
const TEAM_RE_ABBREV = buildRe(TEAM_BY_TEXT_ABBREV.keys());

/**
 * Split text into plain strings and team mentions, so a logo can sit next
 * to every team name. Returns [{ text }, { text, slug }, ...].
 */
export function splitNbaTeamMentions(text, { abbrev = false } = {}) {
  if (!text) return [];
  const re = abbrev ? TEAM_RE_ABBREV : TEAM_RE;
  const lookup = abbrev ? TEAM_BY_TEXT_ABBREV : TEAM_BY_TEXT;
  const out = [];
  let last = 0;
  for (const m of String(text).matchAll(re)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[0], slug: lookup.get(m[0]) });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** Team slugs named in a piece of text, in order, without repeats. */
export function nbaTeamsMentioned(text) {
  return [...new Set(splitNbaTeamMentions(text).filter((p) => p.slug).map((p) => p.slug))];
}
