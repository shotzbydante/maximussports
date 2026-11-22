/**
 * NFL game matchup — one game: the market and model numbers, then the
 * roster talent on each side, unit against unit, with the starters and
 * ratings behind every grade.
 */

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import SEOHead from '../../components/seo/SEOHead';
import NflGameCard from '../../components/nfl/NflGameCard';
import NflLogo from '../../components/nfl/NflLogo';
import { MatchupTalent } from '../../components/nfl/NflTalent';
import { getNflTeamBySlug } from '../../sports/nfl/teams';
import { fetchNflGames } from '../../api/nfl';
import s from '../../components/nfl/nfl.module.css';

export default function NflGameMatchup() {
  const { matchup = '' } = useParams();
  const { buildPath } = useWorkspace();
  const [awaySlug, homeSlug] = matchup.toLowerCase().split('-at-');
  const away = getNflTeamBySlug(awaySlug);
  const home = getNflTeamBySlug(homeSlug);
  const [game, setGame] = useState(undefined);

  useEffect(() => {
    if (!away || !home) return undefined;
    let cancelled = false;
    fetchNflGames().then((g) => {
      if (cancelled) return;
      setGame(g.games.find((x) => x.teams?.home?.slug === home.slug && x.teams?.away?.slug === away.slug) || null);
    });
    return () => { cancelled = true; };
  }, [away, home]);

  if (!away || !home) {
    return (
      <div className={s.page}>
        <div className={s.empty}>
          <span className={s.emptyTitle}>Game not found</span>
          <Link to={buildPath('/games')}>Back to Games</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={s.page}>
      <SEOHead
        title={`${away.name} at ${home.name}: Talent Matchup, Position Groups & Odds`}
        description={`${away.nickname} at ${home.nickname}: the line, the model's numbers and the roster talent on each side, unit against unit, with every starter's Madden, PFF and Maximus rating.`}
      />
      <header className={s.pageHeader}>
        <span className={s.breadcrumb}><Link to={buildPath('/games')}>Games</Link> / Matchup</span>
        <div className={s.teamHero}>
          <div className={s.teamIdentity}>
            <NflLogo slug={away.slug} size={48} />
            <NflLogo slug={home.slug} size={48} />
            <div>
              <h1 className={s.pageTitle}>{away.nickname} at {home.nickname}</h1>
              <div className={s.metaLine}>
                <Link to={buildPath(`/teams/${away.slug}`)}>{away.name}</Link>
                <span className={s.metaDot}><Link to={buildPath(`/teams/${home.slug}`)}>{home.name}</Link></span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className={s.section}>
        {game === undefined ? <div className={s.skeleton} />
          : game ? <div className={s.gridGames}><NflGameCard game={game} showMatchupLink={false} /></div>
            : <div className={s.empty}>This game is not on this week&rsquo;s board. The roster comparison below still applies.</div>}
      </section>

      <MatchupTalent away={away.slug} home={home.slug} />
    </div>
  );
}
