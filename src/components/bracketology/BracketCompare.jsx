import { useMemo } from 'react';
import styles from './BracketCompare.module.css';

/**
 * BracketCompare — summary strip showing where manual picks diverge from Maximus.
 */
export default function BracketCompare({
  picks,
  pickOrigins,
  maximusPicks,
  predictions,
  allMatchups,
}) {
  const comparison = useMemo(() => {
    if (!picks || !maximusPicks || Object.keys(picks).length === 0) return null;

    let agreements = 0;
    let disagreements = 0;
    const divergences = [];
    const disagreeByRound = {};

    for (const [matchupId, userPick] of Object.entries(picks)) {
      const maxPick = maximusPicks[matchupId];
      if (!maxPick) continue;

      if (userPick === maxPick) {
        agreements++;
      } else {
        disagreements++;
        const matchup = allMatchups[matchupId];
        const round = matchup?.round || 0;
        disagreeByRound[round] = (disagreeByRound[round] || 0) + 1;

        const pred = predictions[matchupId];
        if (matchup && pred) {
          divergences.push({
            matchupId,
            round,
            userTeam: userPick === 'top' ? matchup.topTeam : matchup.bottomTeam,
            maximusTeam: maxPick === 'top' ? matchup.topTeam : matchup.bottomTeam,
            confidence: pred.confidenceLabel,
            isUpset: pred.isUpset,
          });
        }
      }
    }

    const totalCompared = agreements + disagreements;
    const agreePct = totalCompared > 0 ? Math.round((agreements / totalCompared) * 100) : 0;

    const userChamp = picks['champ']
      ? (picks['champ'] === 'top' ? allMatchups['champ']?.topTeam : allMatchups['champ']?.bottomTeam)
      : null;
    const maxChamp = maximusPicks['champ']
      ? (maximusPicks['champ'] === 'top' ? allMatchups['champ']?.topTeam : allMatchups['champ']?.bottomTeam)
      : null;
    const champAgree = userChamp && maxChamp && userChamp.slug === maxChamp.slug;

    let boldestDivergence = null;
    for (const d of divergences) {
      if (!boldestDivergence || d.round > boldestDivergence.round) {
        boldestDivergence = d;
      }
    }

    const userUpsets = Object.entries(picks).filter(([id]) => {
      const m = allMatchups[id];
      if (!m) return false;
      const picked = picks[id] === 'top' ? m.topTeam : m.bottomTeam;
      const other = picks[id] === 'top' ? m.bottomTeam : m.topTeam;
      return picked?.seed > (other?.seed || 0);
    }).length;

    const maxUpsets = Object.entries(maximusPicks).filter(([id]) => {
      const pred = predictions[id];
      return pred?.isUpset;
    }).length;

    return {
      agreements, disagreements, agreePct, totalCompared,
      disagreeByRound, divergences, boldestDivergence,
      userChamp, maxChamp, champAgree,
      userUpsets, maxUpsets,
    };
  }, [picks, maximusPicks, predictions, allMatchups]);

  if (!comparison) return null;

  const roundNames = { 1: 'R64', 2: 'R32', 3: 'S16', 4: 'E8', 5: 'F4', 6: 'Champ' };

  return (
    <div className={styles.compare}>
      <div className={styles.header}>
        <span className={styles.headerIcon}>◆</span>
        <h3 className={styles.headerTitle}>Manual vs Maximus</h3>
        <span className={styles.headerSub}>{comparison.totalCompared} games compared</span>
      </div>

      <div className={styles.cards}>
        <div className={styles.card}>
          <span className={styles.cardValue}>
            {comparison.agreePct}%
          </span>
          <span className={styles.cardLabel}>Agreement</span>
        </div>

        <div className={styles.card}>
          <span className={`${styles.cardValue} ${styles.divergeValue}`}>
            {comparison.disagreements}
          </span>
          <span className={styles.cardLabel}>Disagreements</span>
        </div>

        <div className={styles.card}>
          <span className={styles.cardValue}>{comparison.userUpsets}</span>
          <span className={styles.cardLabel}>Your Upsets</span>
        </div>

        <div className={styles.card}>
          <span className={`${styles.cardValue} ${styles.maximusValue}`}>{comparison.maxUpsets}</span>
          <span className={styles.cardLabel}>Maximus Upsets</span>
        </div>

        {comparison.userChamp && (
          <div className={`${styles.card} ${comparison.champAgree ? styles.cardAgree : styles.cardDisagree}`}>
            <div className={styles.champCompare}>
              <span className={styles.champTeam}>{comparison.userChamp.shortName || comparison.userChamp.name}</span>
              <span className={styles.champVs}>vs</span>
              <span className={`${styles.champTeam} ${styles.maximusValue}`}>
                {comparison.maxChamp?.shortName || comparison.maxChamp?.name || '—'}
              </span>
            </div>
            <span className={styles.cardLabel}>Champion</span>
          </div>
        )}

        {Object.keys(comparison.disagreeByRound).length > 0 && (
          <div className={styles.card}>
            <div className={styles.roundBreakdown}>
              {Object.entries(comparison.disagreeByRound)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([round, count]) => (
                  <span key={round} className={styles.roundTag}>
                    {roundNames[round] || `R${round}`}: {count}
                  </span>
                ))}
            </div>
            <span className={styles.cardLabel}>Disagree by Round</span>
          </div>
        )}

        {comparison.boldestDivergence && (
          <div className={styles.card}>
            <span className={styles.cardValue}>
              {roundNames[comparison.boldestDivergence.round]}
            </span>
            <span className={styles.cardLabel}>Boldest Divergence</span>
          </div>
        )}
      </div>
    </div>
  );
}
