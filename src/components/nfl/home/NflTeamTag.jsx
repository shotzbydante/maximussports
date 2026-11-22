/**
 * A team's logo next to its name. Every team mention on the NFL pages goes
 * through one of these so the logo is never missing.
 *
 *   <TeamTag slug="chiefs" />                 logo + "Chiefs"
 *   <TeamTag slug="chiefs" label="abbrev" />  logo + "KC"
 *   <TeamText text="Chiefs RB is out" />      prose with logos added inline
 */

import { getNflTeamBySlug } from '../../../sports/nfl/teams';
import NflLogo from '../NflLogo';
import { splitTeamMentions } from './format';
import h from './home.module.css';

export function TeamTag({ slug, label = 'nickname', text, size = 16, logo, strong = false }) {
  const team = getNflTeamBySlug(slug);
  const shown = text ?? (team ? team[label] || team.nickname : slug);
  return (
    <span className={`${h.tag} ${strong ? h.tagStrong : ''}`}>
      <NflLogo slug={slug} src={logo} size={size} />
      <span>{shown}</span>
    </span>
  );
}

/** "Saints at Bears", each with its logo. */
export function Matchup({ away, home, size = 16 }) {
  return (
    <span className={h.matchupInline}>
      <TeamTag slug={away?.slug} logo={away?.logo} size={size} />
      <span className={h.small}>at</span>
      <TeamTag slug={home?.slug} logo={home?.logo} size={size} />
    </span>
  );
}

/** Plain text with a logo placed before each team it names. `abbrev` also tags abbreviations like "KC". */
export function TeamText({ text, size = 16, abbrev = false }) {
  const parts = splitTeamMentions(text, { abbrev }).map((p) => ({ ...p }));
  // Keep a possessive or closing punctuation on the same line as the team it belongs to.
  for (let i = 0; i < parts.length - 1; i += 1) {
    const tail = parts[i].slug && !parts[i + 1].slug ? /^(?:[’']s)?[.,;:!?)]*/.exec(parts[i + 1].text)?.[0] : '';
    if (tail) {
      parts[i].text += tail;
      parts[i + 1].text = parts[i + 1].text.slice(tail.length);
    }
  }
  return parts.map((part, i) => (
    part.slug
      ? <TeamTag key={i} slug={part.slug} text={part.text} size={size} />
      : part.text
  ));
}
