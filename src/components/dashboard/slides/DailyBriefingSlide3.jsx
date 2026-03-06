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

export default function DailyBriefingSlide3({ data, asOf, options = {}, ...rest }) {
  const { styleMode = 'generic' } = options;
  const isRobot = styleMode === 'robot';

  const digest    = data?.chatDigest ?? null;
  const hasDigest = digest?.hasChatContent === true;

  const games     = data?.odds?.games ?? [];
  const headlines = data?.headlines ?? [];

  // Use chatbot-derived watch framings when available (include "why" context).
  // Fall back to sorted-by-spread structural data otherwise.
  let bullets;

  if (hasDigest && digest.watchGameFramings?.length > 0) {
    bullets = digest.watchGameFramings.map((f, i) => {
      const spreadStr = formatSpread(f.spread);
      const text = [
        `${f.away} @ ${f.home}`,
        spreadStr ? `(Spread: ${spreadStr})` : null,
        f.time ? `· ${f.time}` : null,
      ].filter(Boolean).join(' ');

      return {
        icon: i === 0 ? '🏀' : '📊',
        text,
        tag:  i === 0 ? 'TOP MATCHUP' : (isRobot ? 'WATCHING' : 'WATCH'),
        why:  f.why || null,
      };
    }).filter(b => b.text);

    // Fill remaining slots with chatbot storylines or news headlines
    const notableHeadlines = hasDigest
      ? (digest.topStorylines ?? []).slice(0, 2)
      : headlines.filter(h => h.title || h.headline).slice(0, 2).map(h => ({
          text: (h.title || h.headline || '').slice(0, 80),
          source: h.source || null,
        }));

    for (const h of notableHeadlines) {
      if (bullets.length >= 4) break;
      const title = (h.text || h.title || h.headline || '').trim();
      if (title.length > 10) {
        bullets.push({
          icon: '📰',
          text: title.length > 78 ? title.slice(0, 78) + '…' : title,
          tag:  isRobot ? 'TRACKING' : 'NEWS',
          why:  null,
        });
      }
    }

  } else {
    // Structural fallback: sort by tightest spread for competitive matchups
    const gamesWithOdds = games.filter(g => g.spread != null || g.homeSpread != null);
    const sortedBySpread = [...gamesWithOdds].sort((a, b) => {
      const sa = Math.abs(parseFloat(a.spread ?? a.homeSpread ?? 99));
      const sb = Math.abs(parseFloat(b.spread ?? b.homeSpread ?? 99));
      return sa - sb;
    });
    const topGame    = sortedBySpread[0] ?? null;
    const watchGames = sortedBySpread.slice(1, 3);
    const notableHeadlines = headlines.filter(h => h.title || h.headline).slice(0, 2);

    bullets = [
      topGame && {
        icon: '🏀',
        text: topGame.awayTeam && topGame.homeTeam
          ? `${topGame.awayTeam} vs ${topGame.homeTeam}${
              topGame.spread != null ? ` (Spread: ${formatSpread(topGame.homeSpread ?? topGame.spread)})` : ''
            }${topGame.time ? ` · ${topGame.time}` : ''}`
          : null,
        tag: 'TOP MATCHUP',
        why: null,
      },
      ...watchGames.map(g => ({
        icon: '📊',
        text: g.awayTeam && g.homeTeam
          ? `${g.awayTeam} @ ${g.homeTeam}${g.moneyline ? ` (ML: ${formatML(g.moneyline)})` : ''}`
          : null,
        tag:  isRobot ? 'WATCHING' : 'WATCH',
        why:  null,
      })),
      ...notableHeadlines.map(h => ({
        icon: '📰',
        text: (h.title || h.headline || '').slice(0, 80),
        tag:  isRobot ? 'TRACKING' : 'NEWS',
        why:  null,
      })),
    ].filter(b => b && b.text).slice(0, 4);
  }

  return (
    <SlideShell asOf={asOf} accentColor="#3C79B4" styleMode={styleMode} rest={rest}>
      <div className={styles.titleBlock}>
        <div className={styles.titleSup}>
          {isRobot ? 'MAXIMUS SAYS' : 'GAME PREVIEW'}
        </div>
        <h2 className={styles.title}>
          {isRobot ? <>Watch these<br />games today</> : <>What to<br />Watch Today</>}
        </h2>
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
              <div className={styles.bulletBody}>
                <div className={styles.bulletText}>{b.text}</div>
                {b.why && (
                  <div className={styles.bulletWhy}>{b.why}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={styles.ctaBlock}>
        <div className={styles.ctaLine}>
          {isRobot ? 'More intel at maximussports.ai 🤖' : 'Full analysis at maximussports.ai'}
        </div>
      </div>
    </SlideShell>
  );
}
