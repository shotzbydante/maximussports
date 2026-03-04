import SlideShell from './SlideShell';
import LineBlock from '../ui/LineBlock';
import styles from './TeamIntelSlide3.module.css';
import { buildMaximusPicks, confidenceLabel } from '../../../utils/maximusPicksModel';

export default function TeamIntelSlide3({ data, teamData, asOf, slideNumber, slideTotal, ...rest }) {
  const name = teamData?.team?.displayName || teamData?.team?.name || data?.selectedTeamName || null;
  const games = data?.odds?.games ?? [];
  const atsLeaders = data?.atsLeaders ?? { best: [], worst: [] };

  // Find today's game for this team
  const teamGame = games.find(g => {
    if (!name) return false;
    const nm = name.toLowerCase().split(' ').pop() || '';
    return nm && (
      (g.homeTeam || '').toLowerCase().includes(nm) ||
      (g.awayTeam || '').toLowerCase().includes(nm)
    );
  }) ?? null;

  // Lines
  const spread = teamGame?.homeSpread ?? teamGame?.spread ?? null;
  const ml = teamGame?.moneyline ?? null;
  const total = teamGame?.total ?? null;

  // Team pick from picks model
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

  const headlines = teamData?.teamNews ?? [];
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

      {teamGame ? (
        <>
          <div className={styles.matchupLabel}>
            {teamGame.awayTeam} @ {teamGame.homeTeam}
          </div>
          <LineBlock
            spread={spread}
            ml={ml}
            total={total}
            label="TODAY'S LINE"
          />
        </>
      ) : (
        <div className={styles.noLine}>No line posted for today&apos;s game.</div>
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
