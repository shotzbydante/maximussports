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
    return `Model shows a ${conf} edge \u2014 worth watching the line.`;
  }
  if (game.awayRank != null && game.homeRank != null) {
    return `Ranked vs. ranked \u2014 high-stakes battle with seeding implications.`;
  }
  if (game.awayRank != null || game.homeRank != null) {
    return `Ranked team in action. Momentum and ATS profile both in play.`;
  }
  if (spNum != null && spNum <= 2.5) return 'Pick-em territory \u2014 razor-thin line, could go either way.';
  if (spNum != null && spNum >= 14) return `Heavy favorite expected to control \u2014 ${spNum}-point line.`;
  return 'Competitive matchup on the slate today.';
}

export default function GameInsights5GamesSlide({ data, asOf, slideNumber, slideTotal, options = {}, ...rest }) {
  const games = data?.odds?.games ?? [];
  const upcomingWithSpreads = data?.upcomingGamesWithSpreads ?? [];
  const atsLeaders = data?.atsLeaders ?? { best: [], worst: [] };
  const rankingsTop25 = data?.rankingsTop25 ?? [];
  const dayLabel = options.dayLabel || '';
  const roundLabel = options.roundLabel || '';

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

  let keyGames;
  const preFilteredPicks = options.fiveGamesPicks || [];

  if (preFilteredPicks.length > 0) {
    keyGames = preFilteredPicks.map(p => {
      const matchedGame = games.find(g => {
        const aSlug = getTeamSlug(g.awayTeam || '');
        const hSlug = getTeamSlug(g.homeTeam || '');
        return (aSlug === p.awaySlug || aSlug === p.homeSlug) &&
               (hSlug === p.awaySlug || hSlug === p.homeSlug);
      });
      return {
        awayTeam: p.awayTeam,
        homeTeam: p.homeTeam,
        homeSpread: matchedGame?.homeSpread ?? matchedGame?.spread ?? null,
        spread: matchedGame?.spread ?? null,
        overUnder: matchedGame?.overUnder ?? matchedGame?.total ?? null,
        total: matchedGame?.total ?? null,
        time: matchedGame?.time || fmtTimePST(matchedGame?.startTime) || fmtTimePST(matchedGame?.commenceTime) || null,
        network: matchedGame?.network || matchedGame?.broadcastName || matchedGame?.broadcast || null,
        _pick: p,
      };
    });
  } else {
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
    keyGames = [
      ...withSpreads.sort((a, b) => {
        const sa = Math.abs(parseFloat(a.homeSpread ?? a.spread ?? 99));
        const sb = Math.abs(parseFloat(b.homeSpread ?? b.spread ?? 99));
        return sa - sb;
      }),
      ...withoutSpreads,
    ].slice(0, 5);
  }

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles',
  });

  const subtitleText = dayLabel
    ? `${dayLabel.toUpperCase()} \u00b7 ${roundLabel.toUpperCase()}`
    : 'GAME INSIGHTS';

  return (
    <SlideShell
      asOf={asOf}
      theme="key_games"
      brandMode="standard"
      slideNumber={slideNumber}
      slideTotal={slideTotal}
      rest={rest}
    >
      {/* Compact modular header */}
      <div className={styles.headerStrip}>
        <div className={styles.datePill}>{today}</div>
        <span className={styles.titleSup}>{subtitleText}</span>
      </div>
      <h2 className={styles.title}>5 Key Games Today</h2>
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
            const pick = g._pick || picksMap[pickKey] || null;
            const storyline = g.storyline || g.whyItMatters || buildWhyLine(g, pick);

            const awaySeed = getTeamSeed(awayObj?.slug || g.awayTeam);
            const homeSeed = getTeamSeed(homeObj?.slug || g.homeTeam);

            const tier = pickToTier(pick);

            const pickSlug = pick?.pickTeamSlug || awayObj?.slug || '';
            const tc = getTeamColors(pickSlug);
            const accentColor = tc?.primary || '#38BDF8';

            const isPickedAway = pick && (pick.pickTeam === g.awayTeam || pick.pickTeamSlug === awayObj?.slug);
            const isPickedHome = pick && !isPickedAway;

            return (
              <div
                key={i}
                className={styles.gameRow}
                style={{
                  '--card-accent': accentColor,
                  '--card-accent-30': `${accentColor}4d`,
                  '--card-accent-15': `${accentColor}26`,
                  '--card-accent-08': `${accentColor}14`,
                }}
              >
                {/* Row number */}
                <div className={styles.rowIndex}>{i + 1}</div>

                {/* Content module */}
                <div className={styles.rowContent}>
                  {/* Teams row */}
                  <div className={styles.teamsRow}>
                    <div className={`${styles.teamCell} ${isPickedAway ? styles.teamCellPicked : ''}`}>
                      <div className={isPickedAway ? styles.pickedLogoWrap : styles.logoWrap}>
                        <TeamLogo team={awayObj} size={38} />
                      </div>
                      <div className={styles.teamMeta}>
                        {awaySeed != null && <span className={styles.seedBadge}>#{awaySeed}</span>}
                        {awayRank != null && !awaySeed && <span className={styles.rankBadge}>#{awayRank}</span>}
                        <span className={styles.teamName}>{awayObj?.name || g.awayTeam}</span>
                        {isPickedAway && pick && (
                          <span className={styles.modelPickBadge}>MAXIMUS PICK</span>
                        )}
                      </div>
                    </div>

                    <div className={styles.centerCell}>
                      <span className={styles.vsLabel}>@</span>
                    </div>

                    <div className={`${styles.teamCell} ${styles.teamCellRight} ${isPickedHome ? styles.teamCellPicked : ''}`}>
                      <div className={`${styles.teamMeta} ${styles.teamMetaRight}`}>
                        {homeSeed != null && <span className={styles.seedBadge}>#{homeSeed}</span>}
                        {homeRank != null && !homeSeed && <span className={styles.rankBadge}>#{homeRank}</span>}
                        <span className={styles.teamName}>{homeObj?.name || g.homeTeam}</span>
                        {isPickedHome && pick && (
                          <span className={styles.modelPickBadge}>MAXIMUS PICK</span>
                        )}
                      </div>
                      <div className={isPickedHome ? styles.pickedLogoWrap : styles.logoWrap}>
                        <TeamLogo team={homeObj} size={38} />
                      </div>
                    </div>
                  </div>

                  {/* Data strip — time, spread, O/U, conviction */}
                  <div className={styles.dataStrip}>
                    {g.time && <span className={styles.gameTime}>{g.time}</span>}
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
              </div>
            );
          })}
        </div>
      )}
    </SlideShell>
  );
}
