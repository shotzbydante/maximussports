/**
 * A team's logo next to its name. Every team mention on the NBA pages goes
 * through one of these so the logo is never missing.
 *
 *   <TeamTag slug="bos" />                 logo + "Celtics"
 *   <TeamTag slug="bos" label="abbrev" />  logo + "BOS"
 *   <TeamText text="Celtics guard is out" />  prose with logos added inline
 */

import { getNbaTeamBySlug } from '../../../sports/nba/teams';
import { nbaLogoUrl, nbaNickname, splitNbaTeamMentions } from './nbaFormat';
import h from '../../nfl/home/home.module.css';

/** A logo that hides itself if the image fails, so there is never a broken-image icon. */
export function NbaLogo({ slug, src, size = 24, className }) {
  const url = src || nbaLogoUrl(slug);
  if (!url) return null;
  return (
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      className={className}
      loading="lazy"
      onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
    />
  );
}

export function TeamTag({ slug, label = 'nickname', text, size = 16, logo, strong = false }) {
  const team = getNbaTeamBySlug(slug);
  const shown = text ?? (label === 'abbrev' ? team?.abbrev : label === 'name' ? team?.name : nbaNickname(slug)) ?? slug;
  return (
    <span className={`${h.tag} ${strong ? h.tagStrong : ''}`}>
      <NbaLogo slug={slug} src={logo} size={size} />
      <span>{shown}</span>
    </span>
  );
}

/** "Thunder at Heat", each with its logo. */
export function Matchup({ away, home, size = 16 }) {
  return (
    <span className={h.matchupInline}>
      <TeamTag slug={away?.slug} logo={away?.logo} size={size} />
      <span className={h.small}>at</span>
      <TeamTag slug={home?.slug} logo={home?.logo} size={size} />
    </span>
  );
}

/** Plain text with a logo placed before each team it names. `abbrev` also tags abbreviations like "OKC". */
export function TeamText({ text, size = 16, abbrev = false }) {
  const parts = splitNbaTeamMentions(text, { abbrev }).map((p) => ({ ...p }));
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
