import TeamLogo from '../../shared/TeamLogo';
import { getTeamSlug } from '../../../utils/teamSlug';
import styles from './DailyBriefingSlide3.module.css';
import SlideShell from './SlideShell';

function makeTeam(name) {
  if (!name) return null;
  const cleaned = name
    .replace(/^(?:The |the )/, '')
    .replace(/^(?:No\.\s*\d+\s+|#\d+\s+)/, '')
    .trim();
  return { name: cleaned, slug: getTeamSlug(cleaned) };
}

function SpreadPill({ spread }) {
  if (!spread) return null;
  const n = parseFloat(spread);
  if (isNaN(n)) return null;
  const label = n > 0 ? `+${n}` : String(n);
  return <span className={styles.spreadPill}>{label}</span>;
}

export default function DailyBriefingSlide3({ data, asOf, options = {}, ...rest }) {
  const { styleMode = 'generic' } = options;

  const digest    = data?.chatDigest ?? null;
  const hasDigest = digest?.hasChatContent === true;

  const games = data?.odds?.games ?? [];

  // ¶3 → games to watch, max 3 (quality over quantity)
  let gameEntries = [];

  if (hasDigest && digest.gamesToWatch?.length > 0) {
    gameEntries = digest.gamesToWatch.slice(0, 3);
  } else if (hasDigest && digest.watchGameFramings?.length > 0) {
    gameEntries = digest.watchGameFramings.map(f => ({
      matchup:   `${f.away} @ ${f.home}`,
      away:      f.away,
      home:      f.home,
      spread:    f.spread != null
        ? (parseFloat(f.spread) > 0 ? `+${parseFloat(f.spread)}` : String(parseFloat(f.spread)))
        : null,
      time:      f.time,
      storyline: f.why,
    })).slice(0, 3);
  } else {
    const withOdds = games.filter(g => g.spread != null || g.homeSpread != null);
    const sorted   = [...withOdds].sort((a, b) => {
      const sa = Math.abs(parseFloat(a.spread ?? a.homeSpread ?? 99));
      const sb = Math.abs(parseFloat(b.spread ?? b.homeSpread ?? 99));
      return sa - sb;
    });
    gameEntries = sorted.slice(0, 3).map(g => {
      const sp = g.homeSpread ?? g.spread ?? null;
      const spNum = sp != null ? parseFloat(sp) : null;
      return {
        matchup:   `${g.awayTeam || '?'} @ ${g.homeTeam || '?'}`,
        away:      g.awayTeam || '',
        home:      g.homeTeam || '',
        spread:    spNum != null ? (spNum > 0 ? `+${spNum}` : String(spNum)) : null,
        time:      g.time || null,
        storyline: null,
      };
    });
  }

  // If no spread available, note it gracefully rather than forcing betting copy
  const spreadAvailable = gameEntries.some(g => g.spread);

  return (
    <SlideShell asOf={asOf} accentColor="#3C79B4" styleMode={styleMode} rest={rest}>
      <div className={styles.titleBlock}>
        <div className={styles.titleSup}>ON THE SLATE TODAY</div>
        <h2 className={styles.title}>WHAT TO<br />WATCH</h2>
      </div>

      <div className={styles.divider} />

      {gameEntries.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No games on the slate yet.</p>
        </div>
      ) : (
        <div className={styles.gamesList}>
          {gameEntries.map((g, i) => {
            const awayTeam = makeTeam(g.away);
            const homeTeam = makeTeam(g.home);
            return (
              <div
                key={i}
                className={`${styles.gameRow} ${i === 0 ? styles.gameRowTop : ''}`}
              >
                {/* Top matchup badge */}
                {i === 0 && (
                  <div className={styles.topBadge}>TOP MATCHUP</div>
                )}

                {/* Matchup: away @ home */}
                <div className={styles.matchupRow}>
                  <div className={styles.teamCol}>
                    <TeamLogo team={awayTeam} size={44} />
                    <span className={styles.teamName}>{awayTeam?.name || g.away || '—'}</span>
                  </div>

                  <div className={styles.vsBlock}>
                    <span className={styles.vsAt}>@</span>
                    {g.spread && <SpreadPill spread={g.spread} />}
                  </div>

                  <div className={`${styles.teamCol} ${styles.teamColRight}`}>
                    <span className={styles.teamName}>{homeTeam?.name || g.home || '—'}</span>
                    <TeamLogo team={homeTeam} size={44} />
                  </div>
                </div>

                {/* Time */}
                {g.time && (
                  <div className={styles.gameTime}>{g.time}</div>
                )}

                {/* ¶3 editorial "why it matters" */}
                {g.storyline ? (
                  <div className={styles.storylineBlock}>
                    <span className={styles.storylineLabel}>WHY IT MATTERS</span>
                    <span className={styles.storyline}>{g.storyline}</span>
                  </div>
                ) : (!spreadAvailable && i === 0) ? (
                  <div className={styles.storylineBlock}>
                    <span className={styles.storylineLabel}>LINE TBA</span>
                    <span className={styles.storyline}>Spread pending — check back closer to tip.</span>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </SlideShell>
  );
}
