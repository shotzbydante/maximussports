import SlideShell from './SlideShell';
import TeamLogo from '../../shared/TeamLogo';
import { getTeamSlug } from '../../../utils/teamSlug';
import { getTeamSeed } from '../../../utils/tournamentHelpers';
import { getTeamColors } from '../../../utils/teamColors';
import { buildMaximusPicks } from '../../../utils/maximusPicksModel';
import { getConfidenceTier, TIERS } from '../../../utils/confidenceTier';
import styles from './GameInsights5GamesSlide.module.css';

function makeTeam(name) {
  if (!name) return null;
  const cleaned = name
    .replace(/^(?:The |the )/, '')
    .replace(/^(?:No\.\s*\d+\s+|#\d+\s+)/, '')
    .trim();
  return { name: cleaned, slug: getTeamSlug(cleaned) };
}

function fmtSpread(v) {
  if (v == null) return null;
  const n = parseFloat(v);
  if (isNaN(n)) return null;
  return n > 0 ? `+${n}` : String(n);
}

function fmtTimePST(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles',
    }) + ' PT';
  } catch { return null; }
}

function getEdgeColor(pct) {
  if (pct >= 75) return '#5FE8A8';
  if (pct >= 62) return '#D4B87A';
  return '#6EB3E8';
}

function pickToTier(pick) {
  if (!pick) return null;
  const c = pick.confidence ?? 0;
  if (c >= 2) return TIERS.conviction;
  if (c >= 1) return TIERS.lean;
  return TIERS.tossUp;
}

function TierChip({ tier }) {
  if (!tier) return null;
  const c = tier.igColor;
  return (
    <span
      className={styles.convictionTag}
      style={{ color: c.text, background: c.bg, borderColor: c.border }}
    >
      <span style={{ fontSize: '0.85em', lineHeight: 1, marginRight: '3px' }}>{tier.icon}</span>
      {tier.label}
    </span>
  );
}

function buildWhyLine(game, pick) {
  const sp = game.homeSpread ?? game.spread ?? null;
  const spNum = sp != null ? Math.abs(parseFloat(sp)) : null;
  if (pick) {
    const conf = pick.confidence === 2 ? 'strong' : pick.confidence === 1 ? 'moderate' : 'slight';
    return `Model shows a ${conf} edge — worth watching the line.`;
  }
  if (game.awayRank != null && game.homeRank != null) {
    return `Ranked vs. ranked — high-stakes battle with seeding implications.`;
  }
  if (game.awayRank != null || game.homeRank != null) {
    return `Ranked team in action. Momentum and ATS profile both in play.`;
  }
  if (spNum != null && spNum <= 2.5) return 'Pick-em territory — razor-thin line, could go either way.';
  if (spNum != null && spNum >= 14) return `Heavy favorite expected to control — ${spNum}-point line.`;
  return 'Competitive matchup on the slate today.';
}

/**
 * "5 Key Upcoming Games" slide — premium redesign with
 * prediction blocks, conviction badges, and probability indicators.
 */
export default function GameInsights5GamesSlide({ data, asOf, slideNumber, slideTotal, ...rest }) {
  const games = data?.odds?.games ?? [];
  const upcomingWithSpreads = data?.upcomingGamesWithSpreads ?? [];
  const atsLeaders = data?.atsLeaders ?? { best: [], worst: [] };
  const rankingsTop25 = data?.rankingsTop25 ?? [];

  let picksMap = {};
  try {
    const { atsPicks = [], mlPicks = [] } = buildMaximusPicks({ games, atsLeaders });
    [...atsPicks, ...mlPicks].forEach(p => {
      const key = `${getTeamSlug(p.awayTeam || '')}|${getTeamSlug(p.homeTeam || '')}`;
      if (!picksMap[key] || (p.confidence ?? 0) > (picksMap[key].confidence ?? 0)) {
        picksMap[key] = p;
      }
    });
  } catch { /* ignore */ }

  function getRank(teamName) {
    if (!teamName || !rankingsTop25.length) return null;
    const key = teamName.toLowerCase().trim();
    const entry = rankingsTop25.find(r => {
      const rn = (r.teamName || r.name || r.team || '').toLowerCase().trim();
      return rn === key || rn.includes(key.split(' ').pop() ?? '') || key.includes(rn.split(' ').pop() ?? '');
    });
    return entry?.rank ?? null;
  }

  const seen = new Set();
  const allGames = [...games, ...upcomingWithSpreads];
  const enriched = [];
  for (const g of allGames) {
    if (!g.awayTeam || !g.homeTeam) continue;
    const key = `${getTeamSlug(g.awayTeam)}|${getTeamSlug(g.homeTeam)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    enriched.push({
      ...g,
      time: g.time || fmtTimePST(g.startTime) || fmtTimePST(g.commenceTime) || null,
      network: g.network || g.broadcastName || g.broadcast || null,
    });
  }

  const withSpreads = enriched.filter(g => g.homeSpread != null || g.spread != null || g.awaySpread != null);
  const withoutSpreads = enriched.filter(g => g.homeSpread == null && g.spread == null && g.awaySpread == null);
  const sorted = [
    ...withSpreads.sort((a, b) => {
      const sa = Math.abs(parseFloat(a.homeSpread ?? a.spread ?? 99));
      const sb = Math.abs(parseFloat(b.homeSpread ?? b.spread ?? 99));
      return sa - sb;
    }),
    ...withoutSpreads,
  ];

  const keyGames = sorted.slice(0, 5);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles',
  });

  return (
    <SlideShell
      asOf={asOf}
      accentColor="#4A90D9"
      brandMode="standard"
      slideNumber={slideNumber}
      slideTotal={slideTotal}
      rest={rest}
    >
      <div className={styles.datePill}>{today}</div>
      <div className={styles.titleSup}>GAME INSIGHTS</div>
      <h2 className={styles.title}>5 Key<br />Games Today</h2>
      <div className={styles.divider} />

      {keyGames.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No games with lines available yet. Check back closer to tip-off.</p>
        </div>
      ) : (
        <div className={styles.gameList}>
          {keyGames.map((g, i) => {
            const awayObj = makeTeam(g.awayTeam);
            const homeObj = makeTeam(g.homeTeam);
            const awayRank = getRank(awayObj?.name || g.awayTeam);
            const homeRank = getRank(homeObj?.name || g.homeTeam);
            const spreadNum = g.homeSpread ?? (g.awaySpread != null ? -g.awaySpread : null) ?? (g.spread != null ? parseFloat(g.spread) : null);
            const spreadStr = fmtSpread(spreadNum);
            const total = g.overUnder ?? g.total ?? null;
            const pickKey = `${awayObj?.slug || ''}|${homeObj?.slug || ''}`;
            const pick = picksMap[pickKey] ?? null;
            const storyline = g.storyline || g.whyItMatters || buildWhyLine(g, pick);
            const isTop = i === 0;

            const awaySeed = getTeamSeed(awayObj?.slug || g.awayTeam);
            const homeSeed = getTeamSeed(homeObj?.slug || g.homeTeam);

            const tier = pickToTier(pick);

            const pickSlug = pick?.pickTeamSlug || awayObj?.slug || '';
            const tc = getTeamColors(pickSlug);
            const accentColor = tc?.primary || '#4A90D9';

            return (
              <div
                key={i}
                className={`${styles.gameRow} ${isTop ? styles.gameRowTop : ''}`}
                style={{
                  '--card-accent': accentColor,
                  '--card-accent-30': `${accentColor}4d`,
                  '--card-accent-15': `${accentColor}26`,
                  '--card-accent-08': `${accentColor}14`,
                }}
              >
                {/* Teams row */}
                <div className={styles.teamsRow}>
                  <div className={styles.teamCell}>
                    <TeamLogo team={awayObj} size={isTop ? 34 : 26} />
                    <div className={styles.teamMeta}>
                      {awaySeed != null && <span className={styles.seedBadge}>#{awaySeed}</span>}
                      {awayRank != null && !awaySeed && <span className={styles.rankBadge}>#{awayRank}</span>}
                      <span className={styles.teamName}>{awayObj?.name || g.awayTeam}</span>
                    </div>
                  </div>

                  <div className={styles.centerCell}>
                    <span className={styles.vsLabel}>@</span>
                  </div>

                  <div className={`${styles.teamCell} ${styles.teamCellRight}`}>
                    <div className={`${styles.teamMeta} ${styles.teamMetaRight}`}>
                      {homeSeed != null && <span className={styles.seedBadge}>#{homeSeed}</span>}
                      {homeRank != null && !homeSeed && <span className={styles.rankBadge}>#{homeRank}</span>}
                      <span className={styles.teamName}>{homeObj?.name || g.homeTeam}</span>
                    </div>
                    <TeamLogo team={homeObj} size={isTop ? 34 : 26} />
                  </div>
                </div>

                {/* Game info + betting context */}
                <div className={styles.infoRow}>
                  {g.time && <span className={styles.gameTime}>{g.time}</span>}
                  {g.network && <span className={styles.networkPill}>{g.network}</span>}
                  {spreadStr
                    ? <span className={styles.spreadPill}>{spreadStr}</span>
                    : <span className={styles.tba}>Line TBA</span>
                  }
                  {total != null && <span className={styles.ouPill}>O/U {total}</span>}
                  <TierChip tier={tier} />
                </div>

                {/* Storyline */}
                {storyline && (
                  <div className={styles.storyline}>{storyline}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SlideShell>
  );
}
