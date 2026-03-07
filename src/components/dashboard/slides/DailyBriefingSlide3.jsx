import TeamLogo from '../../shared/TeamLogo';
import { getTeamSlug } from '../../../utils/teamSlug';
import styles from './DailyBriefingSlide3.module.css';
import SlideShell from './SlideShell';

/** Build a canonical dedup key from two team names using normalized slugs. */
function gameKey(away, home) {
  const a = getTeamSlug(away || '') || (away || '').toLowerCase().trim().slice(0, 8);
  const h = getTeamSlug(home || '') || (home || '').toLowerCase().trim().slice(0, 8);
  return `${a}|${h}`;
}

function makeTeam(name) {
  if (!name) return null;
  const cleaned = name
    .replace(/^(?:The |the )/, '')
    .replace(/^(?:No\.\s*\d+\s+|#\d+\s+)/, '')
    .replace(/\s*\((?:FL|OH|PA|CA|NY|TX|WA|OR|CO|AZ|NM|NV|UT|ID|MT|WY|ND|SD|NE|KS|MN|IA|MO|WI|IL|IN|MI|OH|KY|TN|GA|AL|MS|AR|LA|OK|KS)\)$/i, '')
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

  /** Format ISO timestamp → "7:30 PM PT" */
  function formatTimePST(iso) {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles',
      }) + ' PT';
    } catch { return null; }
  }

  const spreadGames = data?.odds?.games ?? [];
  const upcomingWithSpreads = data?.upcomingGamesWithSpreads ?? [];

  // Build a network + time lookup from ESPN scores (which have startTime + network).
  // Keyed by slug-pair for reliable matching across mismatched team name formats.
  const espnMetaMap = {};
  for (const g of [...(data?.scores ?? []), ...upcomingWithSpreads]) {
    const key = gameKey(g.awayTeam, g.homeTeam);
    if (key !== '|' && !espnMetaMap[key]) {
      espnMetaMap[key] = {
        time:    g.time || formatTimePST(g.startTime) || formatTimePST(g.commenceTime) || null,
        network: g.network || g.broadcastName || g.broadcast || null,
        spread:  g.spread ?? g.homeSpread ?? null,
        awayTeam: g.awayTeam || null,
        homeTeam: g.homeTeam || null,
      };
    }
  }

  // Build expanded game pool: odds games (enriched with ESPN meta) first, then all ESPN games
  const enrichedSpreadGames = spreadGames.map(g => {
    const key = gameKey(g.awayTeam, g.homeTeam);
    const meta = espnMetaMap[key] ?? {};
    return {
      ...g,
      time:    g.time    || meta.time    || formatTimePST(g.commenceTime) || null,
      network: g.network || meta.network || null,
    };
  });

  const seenKeys = new Set(spreadGames.map(g => gameKey(g.awayTeam, g.homeTeam)));
  const allScores = [...(data?.scores ?? []), ...upcomingWithSpreads].filter(g => {
    const s = (g.gameStatus || '').toLowerCase();
    return !s.includes('final');
  });
  const extraGames = allScores.filter(g => {
    const key = gameKey(g.awayTeam, g.homeTeam);
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  }).map(g => ({
    ...g,
    time:    g.time || formatTimePST(g.startTime) || formatTimePST(g.commenceTime) || null,
    network: g.network || g.broadcastName || g.broadcast || null,
  }));

  const games = [...enrichedSpreadGames, ...extraGames];

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
      network:   f.network || null,
      storyline: f.why,
    })).slice(0, 3);
  } else {
    const withOdds = games.filter(g => g.spread != null || g.homeSpread != null);
    const sorted   = [...withOdds].sort((a, b) => {
      const sa = Math.abs(parseFloat(a.spread ?? a.homeSpread ?? 99));
      const sb = Math.abs(parseFloat(b.spread ?? b.homeSpread ?? 99));
      return sa - sb;
    });
    // Fall back to all upcoming games if no spreads yet
    const pool = sorted.length > 0 ? sorted : games.filter(g => !g.isFinal);
    gameEntries = pool.slice(0, 3).map(g => {
      const sp = g.homeSpread ?? g.spread ?? null;
      const spNum = sp != null ? parseFloat(sp) : null;
      return {
        matchup:   `${g.awayTeam || '?'} @ ${g.homeTeam || '?'}`,
        away:      g.awayTeam || '',
        home:      g.homeTeam || '',
        spread:    spNum != null ? (spNum > 0 ? `+${spNum}` : String(spNum)) : null,
        time:      g.time || null,
        network:   g.network || g.broadcast || null,
        storyline: null,
      };
    });
  }

  // If no spread available, note it gracefully rather than forcing betting copy
  const spreadAvailable = gameEntries.some(g => g.spread);

  // Rankings lookup for team badges
  const rankingsTop25 = data?.rankingsTop25 ?? [];
  function getRank(teamName) {
    if (!teamName || !rankingsTop25.length) return null;
    const key = teamName.toLowerCase().trim();
    const entry = rankingsTop25.find(r => {
      const rName = (r.teamName || r.name || r.team || '').toLowerCase().trim();
      return rName === key || rName.includes(key.split(' ').pop() ?? '') || key.includes(rName.split(' ').pop() ?? '');
    });
    return entry?.rank ?? null;
  }

  return (
    <SlideShell asOf={asOf} accentColor="#3C79B4" styleMode={styleMode} category="daily" rest={rest}>
      <div className={styles.titleBlock}>
        <div className={styles.titleSup}>DAILY BRIEFING</div>
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
            const awayRank = getRank(awayTeam?.name || g.away);
            const homeRank = getRank(homeTeam?.name || g.home);
            const logoSize = i === 0 ? 44 : 36;
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
                    <TeamLogo team={awayTeam} size={logoSize} />
                    <div className={styles.teamNameWrap}>
                      {awayRank != null && <span className={styles.rankBadge}>#{awayRank}</span>}
                      <span className={styles.teamName}>{awayTeam?.name || g.away || '—'}</span>
                    </div>
                  </div>

                  <div className={styles.vsBlock}>
                    <span className={styles.vsAt}>@</span>
                    {g.spread
                      ? <SpreadPill spread={g.spread} />
                      : <span className={styles.lineTba}>TBA</span>
                    }
                  </div>

                  <div className={`${styles.teamCol} ${styles.teamColRight}`}>
                    <div className={`${styles.teamNameWrap} ${styles.teamNameWrapRight}`}>
                      {homeRank != null && <span className={styles.rankBadge}>#{homeRank}</span>}
                      <span className={styles.teamName}>{homeTeam?.name || g.home || '—'}</span>
                    </div>
                    <TeamLogo team={homeTeam} size={logoSize} />
                  </div>
                </div>

                {/* Time + Network meta row */}
                {(g.time || g.network) && (
                  <div className={styles.metaRow}>
                    {g.time && <span className={styles.gameTime}>{g.time}</span>}
                    {g.network && <span className={styles.networkPill}>{g.network}</span>}
                  </div>
                )}

                {/* ¶3 editorial "why it matters" */}
                {g.storyline ? (
                  <div className={styles.storylineBlock}>
                    <span className={styles.storylineLabel}>WHY IT MATTERS</span>
                    <span className={styles.storyline}>{g.storyline}</span>
                  </div>
                ) : (!g.spread && i === 0) ? (
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
