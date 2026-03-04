import SlideShell from './SlideShell';
import styles from './OddsInsightsSlide2.module.css';

function fmtSpread(v) {
  if (v == null) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n > 0 ? `+${n}` : String(n);
}

function fmtML(v) {
  if (v == null) return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n > 0 ? `+${n}` : String(n);
}

function interestScore(g) {
  let score = 0;
  const sp = Math.abs(parseFloat(g.homeSpread ?? g.spread ?? 99));
  if (!isNaN(sp)) score += Math.max(0, 14 - sp) * 2; // closer spread = higher
  if (g.awayRank != null || g.homeRank != null) score += 20;
  if (g.moneyline != null) score += 5;
  return score;
}

export default function OddsInsightsSlide2({ data, asOf, slideNumber, slideTotal, ...rest }) {
  const games = data?.odds?.games ?? [];
  const ranked = data?.rankingsTop25 ?? [];
  const rankedNames = ranked.map(r => (r.team || r.name || '').toLowerCase());

  function isRanked(teamName) {
    const lc = (teamName || '').toLowerCase();
    return rankedNames.some(n => n && (lc.includes(n) || n.includes(lc)));
  }

  const gamesWithOdds = games
    .filter(g => g.spread != null || g.homeSpread != null || g.moneyline != null)
    .map(g => ({
      ...g,
      awayRank: g.awayRank ?? (isRanked(g.awayTeam) ? '—' : null),
      homeRank: g.homeRank ?? (isRanked(g.homeTeam) ? '—' : null),
      _interest: interestScore(g),
    }))
    .sort((a, b) => b._interest - a._interest)
    .slice(0, 4);

  return (
    <SlideShell
      asOf={asOf}
      accentColor="#B7986C"
      brandMode="standard"
      slideNumber={slideNumber}
      slideTotal={slideTotal}
      rest={rest}
    >
      <div className={styles.titleSup}>ODDS INSIGHTS · SLIDE {slideNumber ?? 2}</div>
      <h2 className={styles.title}>High-Interest<br />Matchups</h2>
      <div className={styles.divider} />

      {gamesWithOdds.length === 0 ? (
        <div className={styles.empty}>No matchups with odds available yet.</div>
      ) : (
        <div className={styles.matchupList}>
          {gamesWithOdds.map((g, i) => {
            const spread = fmtSpread(g.homeSpread ?? g.spread);
            const ml = fmtML(g.moneyline);
            return (
              <div key={i} className={styles.matchupRow}>
                <div className={styles.teamNames}>
                  <span className={styles.awayTeam}>
                    {g.awayRank != null ? `#${g.awayRank} ` : ''}{g.awayTeam || '—'}
                  </span>
                  <span className={styles.atSymbol}>@</span>
                  <span className={styles.homeTeam}>
                    {g.homeRank != null ? `#${g.homeRank} ` : ''}{g.homeTeam || '—'}
                  </span>
                </div>
                <div className={styles.lineChips}>
                  {spread && (
                    <span className={styles.chip}>
                      <span className={styles.chipKey}>SPD</span>
                      <span className={styles.chipVal}>{spread}</span>
                    </span>
                  )}
                  {ml && (
                    <span className={styles.chip}>
                      <span className={styles.chipKey}>ML</span>
                      <span className={styles.chipVal}>{ml}</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SlideShell>
  );
}
