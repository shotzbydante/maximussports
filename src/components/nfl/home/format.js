/** Formatting helpers shared by the NFL home page sections. */

import { NFL_TEAMS } from '../../../sports/nfl/teams';

/** Kickoff in the viewer's own time zone, e.g. "Sun 10:00 AM". */
export function kickoffShort(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }).replace(',', '');
  } catch { return ''; }
}

export function fmtLine(v) {
  if (v == null) return '';
  return v > 0 ? `+${v}` : v === 0 ? 'PK' : `${v}`;
}
export function fmtOdds(v) {
  if (v == null) return '';
  return v > 0 ? `+${v}` : `${v}`;
}

export function timeAgo(iso) {
  if (!iso) return '';
  const diffH = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (!Number.isFinite(diffH) || diffH < 0) return '';
  if (diffH < 1) return 'Just now';
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

/** "Sat 7:49 PM PST": a quote or lock time in the viewer's own zone. */
export function stampShort(iso) {
  if (!iso) return '';
  try {
    return new Date(iso)
      .toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
      .replace(',', '');
  } catch { return ''; }
}

const escapeRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TEAM_BY_TEXT = new Map();
for (const t of NFL_TEAMS) {
  TEAM_BY_TEXT.set(t.name, t.slug);
  TEAM_BY_TEXT.set(t.nickname, t.slug);
}
// Longest first, so "Kansas City Chiefs" wins over "Chiefs". Case-sensitive:
// "Bills" is a team, "bills" is not.
const buildRe = (keys) => new RegExp(
  `(?<![A-Za-z0-9])(${[...keys].sort((a, b) => b.length - a.length).map(escapeRe).join('|')})(?![A-Za-z0-9])`,
  'g',
);
const TEAM_RE = buildRe(TEAM_BY_TEXT.keys());
// Abbreviations ("KC", "BUF") are only safe to match in text the picks engine wrote.
const TEAM_BY_TEXT_ABBREV = new Map(TEAM_BY_TEXT);
for (const t of NFL_TEAMS) TEAM_BY_TEXT_ABBREV.set(t.abbrev, t.slug);
const TEAM_RE_ABBREV = buildRe(TEAM_BY_TEXT_ABBREV.keys());

/**
 * Split text into plain strings and team mentions, so a logo can sit next
 * to every team name. Returns [{ text }, { text, slug }, ...].
 * `abbrev: true` also matches team abbreviations.
 */
export function splitTeamMentions(text, { abbrev = false } = {}) {
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
export function teamsMentioned(text) {
  return [...new Set(splitTeamMentions(text).filter((p) => p.slug).map((p) => p.slug))];
}
