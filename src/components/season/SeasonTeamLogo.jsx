/**
 * Team logo for season recap surfaces. Resolves the right logo source for the
 * workspace's sport so the recap components can stay sport-agnostic.
 */

import TeamLogo from '../shared/TeamLogo';
import { getTeamBySlug } from '../../data/teams';
import { getMlbEspnLogoUrl } from '../../utils/espnMlbLogos';
import { WorkspaceId } from '../../workspaces/config';
import styles from './season.module.css';

export default function SeasonTeamLogo({ workspaceId, slug, name, size = 40 }) {
  if (!slug) return null;

  if (workspaceId === WorkspaceId.MLB) {
    const src = getMlbEspnLogoUrl(slug);
    if (!src) return null;
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className={styles.teamLogo}
        loading="lazy"
        decoding="async"
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
    );
  }

  if (workspaceId === WorkspaceId.CBB) {
    const team = getTeamBySlug(slug);
    return team ? <TeamLogo team={team} size={size} /> : null;
  }

  return name ? <span className={styles.srOnly}>{name}</span> : null;
}
