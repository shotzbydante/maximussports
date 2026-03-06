import SlideShell from './SlideShell';
import LineBlock from '../ui/LineBlock';
import styles from './TeamIntelSlide3.module.css';
import { buildMaximusPicks, confidenceLabel } from '../../../utils/maximusPicksModel';

export default function TeamIntelSlide3({ data, teamData, asOf, slideNumber, slideTotal, ...rest }) {
  const name = teamData?.team?.displayName || teamData?.team?.name || data?.selectedTeamName || null;
  const atsLeaders = data?.atsLeaders ?? { best: [], worst: [] };

  // Use teamData.nextLine (same source as Team Page Next Game Line section)
  const nextLine = teamData?.nextLine ?? null;
  const nextEvent = nextLine?.nextEvent ?? null;
  const consensus = nextLine?.consensus ?? {};

  // Lines from nextLine consensus (preferred) — fall back to scanning home games
  let spread = consensus.spread ?? null;
  let ml = consensus.moneyline ?? null;
  let total = consensus.total ?? null;
  let matchupLabel = nextEvent
    ? `${name || '?'} vs ${nextEvent.opponent || 'TBD'}`
    : null;

  // Fallback: search home-data games if nextLine has no consensus yet
  if (spread == null && ml == null && total == null && name) {
    const games = data?.odds?.games ?? [];
    const nm = name.toLowerCase().split(' ').pop() || '';
    const teamGame = nm ? games.find(g =>
      (g.homeTeam || '').toLowerCase().includes(nm) ||
      (g.awayTeam || '').toLowerCase().includes(nm)
    ) : null;
    if (teamGame) {
      spread = teamGame.homeSpread ?? teamGame.spread ?? null;
      ml = teamGame.moneyline ?? null;
      total = teamGame.total ?? null;
      matchupLabel = `${teamGame.awayTeam} @ ${teamGame.homeTeam}`;
    }
  }

  const hasLine = spread != null || ml != null || total != null;

  // Team pick from picks model
  const games = data?.odds?.games ?? [];
  let teamPick = null;
  try {
    const picks = buildMaximusPicks({ games, atsLeaders });
    const allPicks = [...(picks.atsPicks ?? []), ...(picks.mlPicks ?? [])];
    teamPick = allPicks.find(p => {
      if (!name) return false;
      const nm = name.toLowerCase().split(' ').pop() || '';
      return nm && (p.pickLine || '').toLowerCase().includes(nm);
    }) ?? null;
  } catch { /* ignore */ }

  const headlines = teamData?.last7News?.length > 0
    ? teamData.last7News
    : (teamData?.teamNews ?? []);
  const topHeadlines = headlines.slice(0, 3);

  return (
    <SlideShell
      asOf={asOf}
      accentColor="#3C79B4"
      brandMode="light"
      slideNumber={slideNumber}
      slideTotal={slideTotal}
      rest={rest}
    >
      <div className={styles.titleSup}>TEAM INTEL · SLIDE {slideNumber ?? 3}</div>
      <h2 className={styles.title}>Line &amp;<br />Value</h2>
      <div className={styles.divider} />

      {hasLine || nextEvent ? (
        <>
          {matchupLabel && (
            <div className={styles.matchupLabel}>{matchupLabel}</div>
          )}
          {hasLine ? (
            <LineBlock
              spread={spread}
              ml={ml}
              total={total}
              label="NEXT GAME LINE"
            />
          ) : (
            <div className={styles.noLine}>Line not yet posted.</div>
          )}
        </>
      ) : (
        <div className={styles.noLine}>No upcoming game line available.</div>
      )}

      {/* Pick lean */}
      <div className={styles.pickSection}>
        <div className={styles.pickLabel}>MAXIMUS LEAN</div>
        {teamPick ? (
          <div className={styles.pickCard}>
            <div className={styles.pickLine}>{teamPick.pickLine}</div>
            <div className={styles.pickConf}>
              {teamPick.type === 'ats' ? 'ATS' : 'ML'} ·{' '}
              {confidenceLabel(teamPick.confidence)} confidence
              {teamPick.partial ? ' · partial signal' : ''}
            </div>
          </div>
        ) : (
          <div className={styles.noPickCard}>No qualified lean for this team today</div>
        )}
      </div>

      {/* Headlines */}
      {topHeadlines.length > 0 && (
        <div className={styles.headlinesSection}>
          <div className={styles.hlLabel}>LATEST NEWS</div>
          {topHeadlines.map((h, i) => {
            const text = (h.headline || h.title || '');
            return (
              <div key={i} className={styles.hlRow}>
                <span className={styles.hlBullet}>→</span>
                <span className={styles.hlText}>
                  {text.length > 68 ? text.slice(0, 68) + '…' : text}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </SlideShell>
  );
}
