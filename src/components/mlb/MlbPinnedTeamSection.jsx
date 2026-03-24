/**
 * MlbPinnedTeamSection — "Pin a team" for MLB Home.
 *
 * Mirrors the NCAAM PinnedTeamsSection pattern:
 * - Shows a default example team (Yankees) when nothing pinned
 * - Auth-gates pin actions
 * - Renders a compact team intel card with:
 *   - logo, name, championship odds, projected wins
 *   - team summary from Season Intelligence
 *   - 1–2 YouTube video tiles
 *   - CTA to Team Intel
 */
import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import { getMlbEspnLogoUrl } from '../../utils/espnMlbLogos';
import { getTeamProjection } from '../../data/mlb/seasonModel';
import { getMlbPinnedTeams, addMlbPinnedTeam, removeMlbPinnedTeam } from '../../utils/mlbPinnedTeams';
import { MLB_TEAMS } from '../../sports/mlb/teams';
import { fetchMlbChampionshipOdds } from '../../api/mlbChampionshipOdds';
import styles from './MlbPinnedTeamSection.module.css';

const DEFAULT_TEAM_SLUG = 'nyy';
const DEFAULT_TEAM_NAME = 'New York Yankees';

function formatOdds(american) {
  if (american == null) return '—';
  return american > 0 ? `+${american}` : `${american}`;
}

function VideoTile({ video }) {
  if (!video) return null;
  return (
    <a href={`https://www.youtube.com/watch?v=${video.videoId}`}
      target="_blank" rel="noopener noreferrer" className={styles.videoTile}>
      <div className={styles.videoThumb}>
        <img src={video.thumbUrl} alt={video.title} loading="lazy" />
        <span className={styles.playIcon}>▶</span>
      </div>
      <span className={styles.videoTitle}>{video.title}</span>
    </a>
  );
}

export default function MlbPinnedTeamSection() {
  const { user } = useAuth();
  const { buildPath } = useWorkspace();
  const navigate = useNavigate();

  const [pinned, setPinned] = useState(() => getMlbPinnedTeams());
  const [odds, setOdds] = useState(null);
  const [videos, setVideos] = useState([]);

  const activeSlug = pinned.length > 0 ? pinned[0] : DEFAULT_TEAM_SLUG;
  const isExample = pinned.length === 0;

  const team = useMemo(() => MLB_TEAMS.find(t => t.slug === activeSlug), [activeSlug]);
  const projection = useMemo(() => getTeamProjection(activeSlug), [activeSlug]);
  const logo = team ? getMlbEspnLogoUrl(team.slug) : null;

  // Fetch odds
  useEffect(() => {
    fetchMlbChampionshipOdds()
      .then(d => setOdds(d.odds ?? {}))
      .catch(() => {});
  }, []);

  // Fetch team videos
  useEffect(() => {
    const teamName = team?.name || DEFAULT_TEAM_NAME;
    fetch(`/api/mlb/youtube/intelFeed?maxResults=4`)
      .then(r => r.json())
      .then(d => {
        const items = d.items ?? [];
        // Filter for team-relevant videos
        const teamVideos = items.filter(v => {
          const t = (v.title || '').toLowerCase();
          const parts = teamName.toLowerCase().split(' ');
          return parts.some(p => p.length > 3 && t.includes(p));
        });
        setVideos(teamVideos.length > 0 ? teamVideos.slice(0, 2) : items.slice(0, 2));
      })
      .catch(() => {});
  }, [team]);

  const teamOdds = odds?.[activeSlug];

  // Generate summary from projection
  const summary = useMemo(() => {
    if (!projection) return team ? `Follow ${team.name} for the latest intelligence, projected performance, and market positioning.` : '';
    const tk = projection.takeaways || {};
    const parts = [];
    parts.push(`Projected at ${projection.projectedWins} wins with a ${projection.floor}–${projection.ceiling} range.`);
    if (tk.strongestDriver) parts.push(`Strongest driver: ${tk.strongestDriver.toLowerCase()}.`);
    if (projection.marketDelta > 0) parts.push(`Model is ${projection.marketDelta} wins above market.`);
    else if (projection.marketDelta < 0) parts.push(`Market has them ${Math.abs(projection.marketDelta)} wins higher than our model.`);
    return parts.join(' ');
  }, [projection, team]);

  const handlePin = () => {
    if (!user) {
      navigate('/settings');
      return;
    }
    if (isExample) {
      const next = addMlbPinnedTeam(activeSlug);
      setPinned(next);
    }
  };

  const handleUnpin = () => {
    const next = removeMlbPinnedTeam(activeSlug);
    setPinned(next);
  };

  if (!team) return null;

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2 className={styles.sectionTitle}>
          {isExample ? 'Pin a Team' : 'Your Team'}
        </h2>
        {isExample && (
          <span className={styles.exampleTag}>Example</span>
        )}
      </div>

      <div className={styles.card}>
        {/* Team identity row */}
        <div className={styles.teamRow}>
          <div className={styles.teamIdentity}>
            {logo && <img src={logo} alt="" className={styles.teamLogo} width={40} height={40} loading="lazy" />}
            <div className={styles.teamInfo}>
              <Link to={buildPath(`/teams/${team.slug}`)} className={styles.teamName}>
                {team.name}
              </Link>
              <span className={styles.teamDiv}>{team.division}</span>
            </div>
          </div>
          <div className={styles.teamStats}>
            {teamOdds && (
              <div className={styles.statChip}>
                <span className={styles.statIcon}>🏆</span>
                <span className={styles.statValue}>{formatOdds(teamOdds.bestChanceAmerican)}</span>
              </div>
            )}
            {projection && (
              <div className={styles.statChip}>
                <span className={styles.statLabel}>Proj.</span>
                <span className={styles.statValue}>{projection.projectedWins}W</span>
              </div>
            )}
          </div>
        </div>

        {/* Summary */}
        <p className={styles.summary}>{summary}</p>

        {/* Videos */}
        {videos.length > 0 && (
          <div className={styles.videosRow}>
            {videos.map(v => <VideoTile key={v.videoId} video={v} />)}
          </div>
        )}

        {/* Actions */}
        <div className={styles.actions}>
          <Link to={buildPath(`/teams/${team.slug}`)} className={styles.ctaPrimary}>
            Go to Team Intel →
          </Link>
          {isExample ? (
            <button type="button" className={styles.pinBtn} onClick={handlePin}>
              📌 Pin {team.name.split(' ').pop()}
            </button>
          ) : (
            <button type="button" className={styles.unpinBtn} onClick={handleUnpin}>
              Unpin
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
