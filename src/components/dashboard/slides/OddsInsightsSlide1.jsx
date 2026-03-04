import SlideShell from './SlideShell';
import StatPill from '../ui/StatPill';
import styles from './OddsInsightsSlide1.module.css';

export default function OddsInsightsSlide1({ data, asOf, slideNumber, slideTotal, ...rest }) {
  const games = data?.odds?.games ?? [];
  const ranked = data?.rankingsTop25 ?? [];

  const gamesWithOdds = games.filter(g => g.spread != null || g.homeSpread != null || g.moneyline != null);

  const rankedGames = games.filter(g => {
    const ht = (g.homeTeam || '').toLowerCase();
    const at = (g.awayTeam || '').toLowerCase();
    return ranked.some(r => {
      const n = (r.team || r.name || '').toLowerCase();
      return n && (ht.includes(n) || at.includes(n) || n.includes(ht) || n.includes(at));
    });
  });

  // Biggest favorite
  const spreads = gamesWithOdds
    .map(g => ({ spread: parseFloat(g.homeSpread ?? g.spread ?? 0), team: g.homeTeam || '' }))
    .filter(x => !isNaN(x.spread));
  const biggestFav = spreads.reduce((best, cur) => Math.abs(cur.spread) > Math.abs(best?.spread ?? 0) ? cur : best, null);

  // Median total
  const totals = gamesWithOdds.map(g => parseFloat(g.total ?? 0)).filter(x => x > 0);
  const medTotal = totals.length > 0
    ? totals.sort((a, b) => a - b)[Math.floor(totals.length / 2)]
    : null;

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles',
  });

  return (
    <SlideShell
      asOf={asOf}
      accentColor="#3C79B4"
      brandMode="standard"
      slideNumber={slideNumber}
      slideTotal={slideTotal}
      rest={rest}
    >
      <div className={styles.datePill}>{today}</div>
      <div className={styles.titleSup}>ODDS INSIGHTS</div>
      <h2 className={styles.title}>Today&apos;s<br />Market Snapshot</h2>
      <div className={styles.divider} />

      <div className={styles.grid}>
        <StatPill label="Games With Active Lines" value={gamesWithOdds.length || '—'} />
        <StatPill label="Ranked Matchups Today" value={rankedGames.length || '—'} accent />
        <StatPill
          label="Biggest Favorite Line"
          value={biggestFav ? `${Math.abs(biggestFav.spread)}` : '—'}
        />
        <StatPill
          label="Median Game Total"
          value={medTotal ? medTotal.toFixed(1) : '—'}
          accent
        />
      </div>
    </SlideShell>
  );
}
