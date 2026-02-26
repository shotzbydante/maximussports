import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { dailyReport } from '../data/mockData';
import { fetchHomeFast } from '../api/home';
import { fetchChampionshipOdds } from '../api/championshipOdds';
import { useAtsLeaders } from '../hooks/useAtsLeaders';
import { getTeamSlug } from '../utils/teamSlug';
import { getSlugFromRankingsName } from '../utils/rankingsNormalize';
import { TEAMS } from '../data/teams';
import RankingsTable from '../components/insights/RankingsTable';
import ATSLeaderboard from '../components/home/ATSLeaderboard';
import styles from './Insights.module.css';

export default function Insights() {
  const [rankings, setRankings] = useState([]);
  const {
    atsLeaders,
    atsMeta,
    atsWindow,
    atsLoading,
    seasonWarming,
    onRetry: atsOnRetry,
    onPeriodChange: atsOnPeriodChange,
  } = useAtsLeaders({ initialWindow: 'last30' });
  const [championshipOdds, setChampionshipOdds] = useState({});
  const [championshipOddsMeta, setChampionshipOddsMeta] = useState(null);
  const [championshipOddsLoading, setChampionshipOddsLoading] = useState(true);

  useEffect(() => {
    fetchHomeFast()
      .then((data) => {
        setRankings(data?.rankingsTop25 ?? data?.rankings?.rankings ?? []);
      })
      .catch(() => {
        setRankings([]);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchChampionshipOdds()
      .then(({ odds, oddsMeta }) => {
        if (!cancelled) {
          setChampionshipOdds(odds ?? {});
          setChampionshipOddsMeta(oddsMeta ?? null);
          setChampionshipOddsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setChampionshipOdds({});
          setChampionshipOddsMeta(null);
          setChampionshipOddsLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  const getSlug = (teamName) => getTeamSlug(teamName) ?? getSlugFromRankingsName(teamName, TEAMS);
  const apTop5 = rankings.slice(0, 5);
  const bracketFavorites = rankings.slice(0, 4);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Odds Insights</h1>
        <p className={styles.subtitle}>Daily intelligence, rankings, and ATS leaderboards</p>
      </header>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Rankings Snapshot</h2>
        <div className={styles.snapshot}>
          <div className={styles.snapshotCol}>
            <span className={styles.snapshotLabel}>AP Top 5</span>
            <ol className={styles.snapshotList}>
              {apTop5.length > 0 ? (
                apTop5.map((r, i) => {
                  const slug = getSlug(r.teamName);
                  return (
                    <li key={r.rank}>
                      {r.rank}. {slug ? <Link to={`/teams/${slug}`}>{r.teamName}</Link> : r.teamName}
                    </li>
                  );
                })
              ) : (
                <li>Loading…</li>
              )}
            </ol>
          </div>
          <div className={styles.snapshotCol}>
            <span className={styles.snapshotLabel}>Bracket Favorites</span>
            <ul className={styles.snapshotList}>
              {bracketFavorites.length > 0 ? (
                bracketFavorites.map((r) => {
                  const slug = getSlug(r.teamName);
                  return (
                    <li key={r.rank}>
                      {slug ? <Link to={`/teams/${slug}`}>{r.teamName}</Link> : r.teamName}
                    </li>
                  );
                })
              ) : (
                <li>Loading…</li>
              )}
            </ul>
          </div>
          <div className={styles.snapshotCol}>
            <span className={styles.snapshotLabel}>Biggest Movers</span>
            <p className={styles.snapshotNote}>Rankings update weekly. Check team pages for trend.</p>
          </div>
        </div>
      </section>

      <section className={styles.atsSection}>
        <ATSLeaderboard
          atsLeaders={atsLeaders}
          atsMeta={atsMeta}
          loading={atsLoading}
          atsWindow={atsWindow}
          seasonWarming={seasonWarming}
          onRetry={atsOnRetry}
          onPeriodChange={atsOnPeriodChange}
        />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Daily Report</h2>
        <div className={styles.report}>
          <span className={styles.reportDate}>{dailyReport.date}</span>
          <h3 className={styles.reportHeadline}>{dailyReport.headline}</h3>
          <p className={styles.reportSummary}>{dailyReport.summary}</p>
          <div className={styles.reportInsights}>
            {dailyReport.keyInsights.map((insight) => (
              <span key={insight.label} className={styles.insight}>
                <strong>{insight.label}:</strong> {insight.value}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Bubble Watch — Full Rankings</h2>
        <RankingsTable
          rankings={rankings}
          championshipOdds={championshipOdds}
          championshipOddsMeta={championshipOddsMeta}
          championshipOddsLoading={championshipOddsLoading}
        />
      </section>
    </div>
  );
}
