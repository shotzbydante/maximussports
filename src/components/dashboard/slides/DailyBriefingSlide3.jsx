import styles from './DailyBriefingSlide3.module.css';
import SlideShell from './SlideShell';

function formatSpread(spread) {
  if (spread == null) return null;
  const n = parseFloat(spread);
  if (isNaN(n)) return null;
  return n > 0 ? `+${n}` : String(n);
}

function formatML(ml) {
  if (ml == null) return null;
  const n = parseInt(ml, 10);
  if (isNaN(n)) return null;
  return n > 0 ? `+${n}` : String(n);
}

export default function DailyBriefingSlide3({ data, asOf, ...rest }) {
  const games = data?.odds?.games ?? [];
  const headlines = data?.headlines ?? [];

  // Top matchup: prefer the game with the smallest absolute spread (most competitive)
  const gamesWithOdds = games.filter(g => g.spread != null || g.homeSpread != null);
  const sortedBySpread = [...gamesWithOdds].sort((a, b) => {
    const sa = Math.abs(parseFloat(a.spread ?? a.homeSpread ?? 99));
    const sb = Math.abs(parseFloat(b.spread ?? b.homeSpread ?? 99));
    return sa - sb;
  });
  const topGame = sortedBySpread[0] ?? null;

  // Next best game
  const watchGames = sortedBySpread.slice(1, 3);

  // Headlines (skip ones used in slide 1 repeat)
  const notableHeadlines = headlines
    .filter(h => h.title || h.headline)
    .slice(0, 3);

  const bullets = [
    topGame && {
      icon: '🏀',
      text: topGame.awayTeam && topGame.homeTeam
        ? `${topGame.awayTeam} vs ${topGame.homeTeam}${
            topGame.spread != null ? ` (Spread: ${formatSpread(topGame.homeSpread ?? topGame.spread)})` : ''
          }${topGame.time ? ` · ${topGame.time}` : ''}`
        : null,
      tag: 'TOP MATCHUP',
    },
    ...watchGames.map(g => ({
      icon: '📊',
      text: g.awayTeam && g.homeTeam
        ? `${g.awayTeam} @ ${g.homeTeam}${g.moneyline ? ` (ML: ${formatML(g.moneyline)})` : ''}`
        : null,
      tag: 'WATCH',
    })),
    ...notableHeadlines.slice(0, 2).map(h => ({
      icon: '📰',
      text: (h.title || h.headline || '').slice(0, 80),
      tag: 'NEWS',
    })),
  ].filter(b => b && b.text).slice(0, 4);

  return (
    <SlideShell asOf={asOf} accentColor="#3C79B4" rest={rest}>
      <div className={styles.titleBlock}>
        <div className={styles.titleSup}>GAME PREVIEW</div>
        <h2 className={styles.title}>What to<br />Watch Today</h2>
      </div>

      <div className={styles.divider} />

      {bullets.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No games or headlines available yet.</p>
        </div>
      ) : (
        <div className={styles.bulletsList}>
          {bullets.map((b, i) => (
            <div key={i} className={styles.bulletRow}>
              <div className={styles.bulletLeft}>
                <span className={styles.bulletIcon}>{b.icon}</span>
                <span className={styles.bulletTag}>{b.tag}</span>
              </div>
              <div className={styles.bulletText}>{b.text}</div>
            </div>
          ))}
        </div>
      )}

      <div className={styles.ctaBlock}>
        <div className={styles.ctaLine}>Full analysis at maximussports.ai</div>
      </div>
    </SlideShell>
  );
}
