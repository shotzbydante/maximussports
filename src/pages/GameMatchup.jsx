import { useState, useEffect, useMemo } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { fetchHomeFast, fetchHomeSlow } from '../api/home';
import { mergeGamesWithOdds } from '../api/odds';
import { getTeamSlug } from '../utils/teamSlug';
import { buildSlugToRankMap } from '../utils/rankingsNormalize';
import { TEAMS } from '../data/teams';
import { useAtsLeaders } from '../hooks/useAtsLeaders';
import { fetchChampionshipOdds } from '../api/championshipOdds';
import { parseMatchupSlug, buildMatchupSlug, shortTeamName } from '../utils/matchupSlug';
import { getPinnedTeams } from '../utils/pinnedTeams';
import TeamLogo from '../components/shared/TeamLogo';
import SEOHead, { buildOgImageUrl } from '../components/seo/SEOHead';
import styles from './GameMatchup.module.css';

const CURRENT_YEAR = new Date().getFullYear();
const DEFAULT_SLUGS = ['duke-blue-devils', 'houston-cougars', 'purdue-boilermakers', 'kansas-jayhawks'];

function formatSpread(n) {
  if (n == null) return '—';
  return Number(n) > 0 ? `+${n}` : String(n);
}

function formatML(n) {
  if (n == null || isNaN(n)) return '—';
  return Number(n) > 0 ? `+${n}` : String(n);
}

function parseMLPair(mlStr) {
  if (!mlStr || typeof mlStr !== 'string') return { home: null, away: null };
  const parts = mlStr.split('/');
  if (parts.length < 2) return { home: null, away: null };
  const h = parseFloat(parts[0].trim());
  const a = parseFloat(parts[1].trim());
  return { home: isNaN(h) ? null : h, away: isNaN(a) ? null : a };
}

export default function GameMatchup() {
  const { matchupSlug } = useParams();
  const parsed = parseMatchupSlug(matchupSlug);

  const [fastData, setFastData] = useState({ rankings: [], scoresToday: [] });
  const [slowData, setSlowData] = useState({ oddsGames: [], upcomingGames: [] });
  const [fastLoading, setFastLoading] = useState(true);
  const [slowLoading, setSlowLoading] = useState(true);
  const [championshipOdds, setChampionshipOdds] = useState({});

  const { atsLeaders } = useAtsLeaders({ initialWindow: 'last30' });

  useEffect(() => {
    let cancelled = false;
    fetchHomeFast()
      .then((data) => {
        if (cancelled) return;
        setFastData({
          rankings: data?.rankingsTop25 ?? data?.rankings?.rankings ?? [],
          scoresToday: data?.scoresToday ?? [],
        });
        setFastLoading(false);
      })
      .catch(() => { if (!cancelled) setFastLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const pinned = getPinnedTeams();
    const pinnedSlugs = pinned.length > 0 ? pinned : DEFAULT_SLUGS;
    fetchHomeSlow({ pinnedSlugs })
      .then((data) => {
        if (cancelled) return;
        setSlowData({
          oddsGames: data?.odds?.games ?? [],
          upcomingGames: data?.upcomingGamesWithSpreads ?? [],
        });
        setSlowLoading(false);
      })
      .catch(() => { if (!cancelled) setSlowLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchChampionshipOdds()
      .then(({ odds }) => { if (!cancelled) setChampionshipOdds(odds ?? {}); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const rankMap = useMemo(
    () => buildSlugToRankMap({ rankings: fastData.rankings }, TEAMS),
    [fastData.rankings]
  );

  const allGames = useMemo(() => {
    const scores = fastData.scoresToday;
    const oddsGames = slowData.oddsGames;
    const upcomingGames = slowData.upcomingGames || [];
    const merged = mergeGamesWithOdds(scores, oddsGames, getTeamSlug);
    const mergedIds = new Set(merged.map((g) => g.gameId).filter(Boolean));
    const futureOdds = oddsGames.filter((og) => {
      const dt = og.commenceTime ? new Date(og.commenceTime).toISOString().slice(0, 10) : '';
      const scoreDates = new Set(scores.flatMap((g) => {
        const sd = g.startTime ? new Date(g.startTime).toISOString().slice(0, 10) : '';
        return sd ? [sd] : [];
      }));
      return dt && !scoreDates.has(dt);
    });
    const allIds = new Set([...mergedIds, ...futureOdds.map((g) => g.gameId).filter(Boolean)]);
    const extra = upcomingGames.filter((g) => !g.gameId || !allIds.has(g.gameId));
    return [...merged, ...futureOdds, ...extra];
  }, [fastData.scoresToday, slowData.oddsGames, slowData.upcomingGames]);

  const atsBySlug = useMemo(() => {
    const all = [...(atsLeaders.best ?? []), ...(atsLeaders.worst ?? [])];
    if (all.length === 0) return {};
    const map = {};
    for (const row of all) {
      if (!row.slug) continue;
      map[row.slug] = {
        season: row.season ?? row.rec ?? null,
        last30: row.last30 ?? row.rec ?? null,
        last7: row.last7 ?? row.rec ?? null,
      };
    }
    return map;
  }, [atsLeaders]);

  if (!parsed) {
    return (
      <div className={styles.page}>
        <SEOHead
          title="Matchup Not Found"
          description="The requested college basketball matchup was not found."
          canonicalPath={`/games/${matchupSlug}`}
          noindex
        />
        <h1>Matchup Not Found</h1>
        <p>We couldn&apos;t find that matchup. Browse today&apos;s games instead.</p>
        <Link to="/games">← Games</Link>
      </div>
    );
  }

  const { homeTeam, awayTeam, homeSlug, awaySlug } = parsed;

  const canonicalSlug = buildMatchupSlug(homeSlug, awaySlug);
  if (matchupSlug !== canonicalSlug) {
    return <Navigate to={`/games/${canonicalSlug}`} replace />;
  }

  const matchingGame = allGames.find((g) => {
    const hs = getTeamSlug(g.homeTeam);
    const as_ = getTeamSlug(g.awayTeam);
    return (hs === homeSlug && as_ === awaySlug) ||
           (hs === awaySlug && as_ === homeSlug);
  });

  const spread = matchingGame?.spread;
  const total = matchingGame?.total;
  const moneyline = matchingGame?.moneyline;
  const mlPair = parseMLPair(moneyline);
  const gameStatus = matchingGame?.gameStatus;
  const startTime = matchingGame?.startTime;

  const homeRank = rankMap[homeSlug];
  const awayRank = rankMap[awaySlug];
  const homeAts = atsBySlug[homeSlug];
  const awayAts = atsBySlug[awaySlug];
  const homeChampOdds = championshipOdds[homeSlug];
  const awayChampOdds = championshipOdds[awaySlug];

  const shortA = shortTeamName(homeTeam.name);
  const shortB = shortTeamName(awayTeam.name);
  const displayTitle = `${homeTeam.name} vs ${awayTeam.name}`;
  const isLoading = fastLoading && slowLoading;

  const timeStr = startTime
    ? new Date(startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
    : null;
  const dateStr = startTime
    ? new Date(startTime).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  const seoTitle = `${shortA} vs ${shortB} Odds, ATS Signals & Picks`;
  const seoDesc = `Live spread intel, model edges, and game analysis for ${shortA} vs ${shortB}. Data-driven predictions powered by Maximus Sports.`;
  const matchupOgImage = buildOgImageUrl({ title: `${shortA} vs ${shortB}`, subtitle: 'Matchup analysis, model edges & predictions', type: 'Matchup Intel' });

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    'name': `${displayTitle} — College Basketball`,
    'url': `https://maximussports.ai/games/${canonicalSlug}`,
    'sport': 'Basketball',
    'homeTeam': { '@type': 'SportsTeam', 'name': homeTeam.name, 'url': `https://maximussports.ai/teams/${homeSlug}` },
    'awayTeam': { '@type': 'SportsTeam', 'name': awayTeam.name, 'url': `https://maximussports.ai/teams/${awaySlug}` },
    ...(startTime ? { 'startDate': startTime } : {}),
    'location': { '@type': 'Place', 'name': 'College Basketball Venue' },
    'isPartOf': { '@type': 'WebSite', 'name': 'Maximus Sports', 'url': 'https://maximussports.ai' },
    'breadcrumb': {
      '@type': 'BreadcrumbList',
      'itemListElement': [
        { '@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': 'https://maximussports.ai' },
        { '@type': 'ListItem', 'position': 2, 'name': 'Games', 'item': 'https://maximussports.ai/games' },
        { '@type': 'ListItem', 'position': 3, 'name': `${shortA} vs ${shortB}`, 'item': `https://maximussports.ai/games/${canonicalSlug}` },
      ],
    },
  };

  function renderAtsLine(label, ats) {
    if (!ats) return <span className={styles.atsVal}>—</span>;
    const w = ats.wins ?? 0;
    const l = ats.losses ?? 0;
    const t = ats.total ?? (w + l);
    if (t === 0) return <span className={styles.atsVal}>—</span>;
    const pct = Math.round((w / t) * 100);
    return <span className={styles.atsVal}>{w}–{l} ({pct}%)</span>;
  }

  return (
    <div className={styles.page}>
      <SEOHead
        title={seoTitle}
        description={seoDesc}
        canonicalPath={`/games/${canonicalSlug}`}
        ogImage={matchupOgImage}
        jsonLd={jsonLd}
      />

      <header className={styles.header}>
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span aria-hidden>/</span>
          <Link to="/games">Games</Link>
          <span aria-hidden>/</span>
          <span>{shortA} vs {shortB}</span>
        </nav>

        <h1 className={styles.pageTitle}>{displayTitle} Betting Intelligence</h1>
        <p className={styles.pageSubtitle}>
          AI-powered matchup analysis for {displayTitle} including ATS trends,
          betting signals, and model-driven projections for the {CURRENT_YEAR} season.
        </p>
        {dateStr && <time className={styles.dateLine} dateTime={startTime}>{dateStr}{timeStr ? ` · ${timeStr}` : ''}</time>}
      </header>

      {isLoading && <p className={styles.loadingText}>Loading matchup data…</p>}

      {/* ── Matchup Header Card ── */}
      <section className={styles.matchupCard} aria-label="Matchup overview">
        <div className={styles.matchupTeams}>
          <Link to={`/teams/${homeSlug}`} className={styles.matchupTeamBlock}>
            <TeamLogo team={homeTeam} size={40} />
            <span className={styles.matchupTeamName}>
              {homeRank != null && <span className={styles.rankBadge}>#{homeRank}</span>}
              {homeTeam.name}
            </span>
            <span className={styles.matchupConf}>{homeTeam.conference}</span>
          </Link>
          <div className={styles.matchupVs}>
            <span>VS</span>
            {gameStatus && gameStatus !== 'Scheduled' && (
              <span className={styles.matchupStatus}>{gameStatus}</span>
            )}
          </div>
          <Link to={`/teams/${awaySlug}`} className={styles.matchupTeamBlock}>
            <TeamLogo team={awayTeam} size={40} />
            <span className={styles.matchupTeamName}>
              {awayRank != null && <span className={styles.rankBadge}>#{awayRank}</span>}
              {awayTeam.name}
            </span>
            <span className={styles.matchupConf}>{awayTeam.conference}</span>
          </Link>
        </div>

        {(spread != null || total != null || moneyline != null) && (
          <div className={styles.linesRow}>
            {spread != null && (
              <div className={styles.lineItem}>
                <span className={styles.lineLabel}>Spread</span>
                <span className={styles.lineValue}>{formatSpread(spread)}</span>
              </div>
            )}
            {total != null && (
              <div className={styles.lineItem}>
                <span className={styles.lineLabel}>O/U</span>
                <span className={styles.lineValue}>{total}</span>
              </div>
            )}
            {mlPair.home != null && (
              <div className={styles.lineItem}>
                <span className={styles.lineLabel}>Moneyline</span>
                <span className={styles.lineValue}>{formatML(mlPair.home)} / {formatML(mlPair.away)}</span>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Spread Analysis ── */}
      <section className={styles.section} aria-label="Spread analysis">
        <h2 className={styles.sectionTitle}>Spread Analysis</h2>
        {spread != null ? (
          <p className={styles.sectionBody}>
            {shortA} {Number(spread) < 0 ? 'is favored' : 'is the underdog'} with a spread of <strong>{formatSpread(spread)}</strong>.
            {Math.abs(Number(spread)) <= 3
              ? ` This is a pick'em-level contest — the market sees this as a coin flip.`
              : Math.abs(Number(spread)) >= 10
                ? ` A double-digit spread signals a clear favorite. Look for cover potential.`
                : ` A moderate spread — both teams are competitive in the eyes of the market.`
            }
          </p>
        ) : (
          <p className={styles.sectionBodyMuted}>Spread not yet posted. Check back closer to tip-off.</p>
        )}
      </section>

      {/* ── Team Trend Comparison ── */}
      <section className={styles.section} aria-label="Team trends">
        <h2 className={styles.sectionTitle}>Team Trend Comparison — ATS Records</h2>
        <div className={styles.trendsGrid}>
          <div className={styles.trendCol}>
            <h3 className={styles.trendTeamName}>{homeTeam.name}</h3>
            <div className={styles.trendRow}>
              <span className={styles.trendLabel}>ATS (Season)</span>
              {renderAtsLine('Season', homeAts?.season)}
            </div>
            <div className={styles.trendRow}>
              <span className={styles.trendLabel}>ATS (Last 30)</span>
              {renderAtsLine('Last 30', homeAts?.last30)}
            </div>
            {homeChampOdds?.american != null && (
              <div className={styles.trendRow}>
                <span className={styles.trendLabel}>Championship</span>
                <span className={styles.atsVal}>{homeChampOdds.american > 0 ? `+${homeChampOdds.american}` : homeChampOdds.american}</span>
              </div>
            )}
          </div>
          <div className={styles.trendCol}>
            <h3 className={styles.trendTeamName}>{awayTeam.name}</h3>
            <div className={styles.trendRow}>
              <span className={styles.trendLabel}>ATS (Season)</span>
              {renderAtsLine('Season', awayAts?.season)}
            </div>
            <div className={styles.trendRow}>
              <span className={styles.trendLabel}>ATS (Last 30)</span>
              {renderAtsLine('Last 30', awayAts?.last30)}
            </div>
            {awayChampOdds?.american != null && (
              <div className={styles.trendRow}>
                <span className={styles.trendLabel}>Championship</span>
                <span className={styles.atsVal}>{awayChampOdds.american > 0 ? `+${awayChampOdds.american}` : awayChampOdds.american}</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Model Projection Insight ── */}
      <section className={styles.section} aria-label="Model projections">
        <h2 className={styles.sectionTitle}>Model Projection Insight</h2>
        <p className={styles.sectionBody}>
          The Maximus model evaluates {displayTitle} across multiple dimensions — ATS performance, recent form, championship futures,
          and market pricing. Visit the <Link to="/insights">full Odds Insights dashboard</Link> or <Link to="/college-basketball-picks-today">today&apos;s picks</Link> for
          the complete model output across all games.
        </p>
      </section>

      {/* ── Team Intelligence Links ── */}
      <section className={styles.section} aria-label="Team intelligence">
        <h2 className={styles.sectionTitle}>Team Betting Intelligence</h2>
        <div className={styles.teamLinksGrid}>
          <Link to={`/teams/${homeSlug}`} className={styles.teamLinkCard}>
            <TeamLogo team={homeTeam} size={24} />
            <div>
              <span className={styles.teamLinkName}>{homeTeam.name} Betting Intelligence</span>
              <span className={styles.teamLinkDesc}>ATS trends, schedule, next game odds, and model projections</span>
            </div>
          </Link>
          <Link to={`/teams/${awaySlug}`} className={styles.teamLinkCard}>
            <TeamLogo team={awayTeam} size={24} />
            <div>
              <span className={styles.teamLinkName}>{awayTeam.name} Betting Intelligence</span>
              <span className={styles.teamLinkDesc}>ATS trends, schedule, next game odds, and model projections</span>
            </div>
          </Link>
        </div>
      </section>

      {/* ── Related Pages ── */}
      <section className={styles.linksSection} aria-label="Related pages">
        <h2 className={styles.sectionTitle}>More Betting Intelligence</h2>
        <div className={styles.linksGrid}>
          <Link to="/college-basketball-picks-today" className={styles.linkCard}>
            <span className={styles.linkCardTitle}>Today&apos;s Picks</span>
            <span className={styles.linkCardDesc}>ATS picks, moneyline value, and game totals</span>
          </Link>
          <Link to="/insights" className={styles.linkCard}>
            <span className={styles.linkCardTitle}>Odds Insights</span>
            <span className={styles.linkCardDesc}>Full market analysis and upset alerts</span>
          </Link>
          <Link to="/games" className={styles.linkCard}>
            <span className={styles.linkCardTitle}>All Games</span>
            <span className={styles.linkCardDesc}>Live scores and the full daily schedule</span>
          </Link>
          <Link to="/march-madness-betting-intelligence" className={styles.linkCard}>
            <span className={styles.linkCardTitle}>March Madness</span>
            <span className={styles.linkCardDesc}>Tournament odds, bracket analysis, and predictions</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
