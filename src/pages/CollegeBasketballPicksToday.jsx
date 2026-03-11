import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { fetchHomeFast, fetchHomeSlow } from '../api/home';
import { mergeGamesWithOdds } from '../api/odds';
import { getTeamSlug } from '../utils/teamSlug';
import { buildSlugToRankMap } from '../utils/rankingsNormalize';
import { TEAMS } from '../data/teams';
import { useAtsLeaders } from '../hooks/useAtsLeaders';
import { fetchChampionshipOdds } from '../api/championshipOdds';
import { buildMaximusPicks } from '../utils/maximusPicksModel';
import { sportsDateStr } from '../utils/slateDate';
import { getPinnedTeams } from '../utils/pinnedTeams';
import MaximusPicks from '../components/home/MaximusPicks';
import SEOHead from '../components/seo/SEOHead';
import styles from './CollegeBasketballPicksToday.module.css';

const DEFAULT_SLUGS = ['duke-blue-devils', 'houston-cougars', 'purdue-boilermakers', 'kansas-jayhawks'];

export default function CollegeBasketballPicksToday() {
  const [fastData, setFastData] = useState({ rankings: [], scoresToday: [] });
  const [slowData, setSlowData] = useState({ oddsGames: [], upcomingGames: [] });
  const [fastLoading, setFastLoading] = useState(true);
  const [slowLoading, setSlowLoading] = useState(true);
  const [championshipOdds, setChampionshipOdds] = useState({});

  const {
    atsLeaders, atsLoading,
  } = useAtsLeaders({ initialWindow: 'last30' });

  useEffect(() => {
    let cancelled = false;
    setFastLoading(true);
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
    setSlowLoading(true);
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
    if (all.length === 0) return null;
    const map = {};
    for (const row of all) {
      if (!row.slug) continue;
      map[row.slug] = {
        season: row.season ?? row.rec ?? null,
        last30: row.last30 ?? row.rec ?? null,
        last7: row.last7 ?? row.rec ?? null,
      };
    }
    return Object.keys(map).length > 0 ? map : null;
  }, [atsLeaders]);

  const picksResult = allGames.length
    ? buildMaximusPicks({ games: allGames, atsLeaders, atsBySlug, rankMap, championshipOdds })
    : { pickEmPicks: [], atsPicks: [], valuePicks: [], totalsPicks: [] };

  const totalPicks = picksResult.pickEmPicks.length + picksResult.atsPicks.length +
    picksResult.valuePicks.length + picksResult.totalsPicks.length;

  const slateDate = sportsDateStr();
  const todayDisplay = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    'name': `College Basketball Picks Today — ${todayDisplay}`,
    'description': 'Today\'s college basketball betting intelligence powered by the Maximus model, highlighting ATS trends, value plays, and game totals across the NCAAB slate.',
    'url': 'https://maximussports.ai/college-basketball-picks-today',
    'dateModified': new Date().toISOString(),
    'isPartOf': { '@type': 'WebSite', 'name': 'Maximus Sports', 'url': 'https://maximussports.ai' },
    'breadcrumb': {
      '@type': 'BreadcrumbList',
      'itemListElement': [
        { '@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': 'https://maximussports.ai' },
        { '@type': 'ListItem', 'position': 2, 'name': 'College Basketball Picks Today', 'item': 'https://maximussports.ai/college-basketball-picks-today' },
      ],
    },
  };

  return (
    <div className={styles.page}>
      <SEOHead
        title="College Basketball Picks Today — NCAAB Predictions & Betting Intelligence"
        description="Today's college basketball betting intelligence powered by the Maximus model, highlighting ATS trends, value plays, and game totals across the NCAAB slate."
        canonicalPath="/college-basketball-picks-today"
        jsonLd={jsonLd}
      />

      <header className={styles.header}>
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span aria-hidden>/</span>
          <span>Today&apos;s Picks</span>
        </nav>
        <h1 className={styles.pageTitle}>
          College Basketball Picks Today
        </h1>
        <p className={styles.pageSubtitle}>
          Today&apos;s college basketball betting intelligence powered by the Maximus model,
          highlighting ATS trends, value plays, and game totals across the NCAAB slate.
        </p>
        <time className={styles.dateLine} dateTime={new Date().toISOString().slice(0, 10)}>
          {todayDisplay}
        </time>
      </header>

      <section className={styles.picksSection} aria-label="Today's picks">
        <h2 className={styles.sectionTitle}>Today&apos;s ATS Picks &amp; Betting Intelligence</h2>
        <p className={styles.sectionIntro}>
          {totalPicks > 0
            ? `${totalPicks} data-driven picks across today's college basketball slate — spread leans, moneyline value, and game total projections.`
            : 'Picks will populate once today\'s lines are posted. Check back closer to tip-off.'
          }
        </p>
        <MaximusPicks
          games={allGames}
          atsLeaders={atsLeaders}
          atsBySlug={atsBySlug}
          rankMap={rankMap}
          championshipOdds={championshipOdds}
          loading={fastLoading || slowLoading || atsLoading}
          slateDate={slateDate}
          hideViewMore
        />
      </section>

      <section className={styles.linksSection} aria-label="Related pages">
        <h2 className={styles.sectionTitle}>Explore More Betting Intelligence</h2>
        <div className={styles.linksGrid}>
          <Link to="/insights" className={styles.linkCard}>
            <span className={styles.linkCardTitle}>Odds Insights</span>
            <span className={styles.linkCardDesc}>Full market analysis, spread distribution, and upset alerts</span>
          </Link>
          <Link to="/teams" className={styles.linkCard}>
            <span className={styles.linkCardTitle}>All Teams</span>
            <span className={styles.linkCardDesc}>ATS trends and championship odds by conference</span>
          </Link>
          <Link to="/games" className={styles.linkCard}>
            <span className={styles.linkCardTitle}>Today&apos;s Games</span>
            <span className={styles.linkCardDesc}>Live scores, spreads, and the full daily schedule</span>
          </Link>
          <Link to="/news" className={styles.linkCard}>
            <span className={styles.linkCardTitle}>NCAAB News</span>
            <span className={styles.linkCardDesc}>Headlines, video highlights, and expert analysis</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
