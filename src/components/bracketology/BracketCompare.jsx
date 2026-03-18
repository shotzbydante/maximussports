import { useMemo } from 'react';
import styles from './BracketCompare.module.css';

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

    const userFF = [];
    const maxFF = [];
    for (const mId of ['ff-1', 'ff-2']) {
      const m = allMatchups[mId];
      if (!m) continue;
      if (picks[mId]) userFF.push(picks[mId] === 'top' ? m.topTeam : m.bottomTeam);
      if (maximusPicks[mId]) maxFF.push(maximusPicks[mId] === 'top' ? m.topTeam : m.bottomTeam);
    }

    let boldestDivergence = null;
    for (const d of divergences) {
      if (!boldestDivergence || d.round > boldestDivergence.round) {
        boldestDivergence = d;
      }
    }

    const topDivergences = [...divergences]
      .sort((a, b) => b.round - a.round)
      .slice(0, 3);

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

    let narrative = '';
    if (comparison === null) narrative = '';
    else if (agreePct >= 90) narrative = 'You and Maximus are nearly in lockstep. A chalk-heavy bracket.';
    else if (agreePct >= 70) narrative = 'Mostly aligned, but you\'re making some bold calls Maximus wouldn\'t.';
    else if (agreePct >= 50) narrative = 'A healthy amount of disagreement — you\'re thinking independently.';
    else narrative = 'A contrarian bracket. You\'re betting against the model.';

    return {
      agreements, disagreements, agreePct, totalCompared,
      disagreeByRound, divergences, topDivergences, boldestDivergence,
      userChamp, maxChamp, champAgree,
      userFF, maxFF,
      userUpsets, maxUpsets, narrative,
    };
  }, [picks, maximusPicks, predictions, allMatchups]);

  if (!comparison) return null;

  const roundNames = { 1: 'R64', 2: 'R32', 3: 'S16', 4: 'E8', 5: 'F4', 6: 'Champ' };

  return (
    <div className={styles.compare}>
      <div className={styles.header}>
        <span className={styles.headerIcon}>◆</span>
        <h3 className={styles.headerTitle}>Your Bracket vs Maximus</h3>
        <span className={styles.headerSub}>{comparison.totalCompared} games compared</span>
      </div>

      {comparison.narrative && (
        <p className={styles.narrative}>{comparison.narrative}</p>
      )}

      <div className={styles.cards}>
        <div className={styles.card}>
          <span className={styles.cardValue}>{comparison.agreePct}%</span>
          <span className={styles.cardLabel}>Agreement</span>
        </div>

        <div className={styles.card}>
          <span className={`${styles.cardValue} ${styles.divergeValue}`}>{comparison.disagreements}</span>
          <span className={styles.cardLabel}>Disagreements</span>
        </div>

        <div className={styles.card}>
          <span className={styles.cardValue}>{comparison.userUpsets}</span>
          <span className={styles.cardLabel}>Your Upset Picks</span>
        </div>

        <div className={styles.card}>
          <span className={`${styles.cardValue} ${styles.maximusValue}`}>{comparison.maxUpsets}</span>
          <span className={styles.cardLabel}>Maximus Upset Picks</span>
        </div>
      </div>

      {/* Champion comparison */}
      {comparison.userChamp && (
        <div className={styles.champSection}>
          <span className={styles.champSectionLabel}>Champion</span>
          <div className={`${styles.champRow} ${comparison.champAgree ? styles.champAgree : styles.champDisagree}`}>
            <div className={styles.champSide}>
              <span className={styles.champSideLabel}>You</span>
              <span className={styles.champSideName}>{comparison.userChamp.shortName || comparison.userChamp.name}</span>
              {comparison.userChamp.seed && <span className={styles.champSideSeed}>{comparison.userChamp.seed}-seed</span>}
            </div>
            <span className={styles.champVsIcon}>{comparison.champAgree ? '=' : '≠'}</span>
            <div className={styles.champSide}>
              <span className={`${styles.champSideLabel} ${styles.maximusAccent}`}>Maximus</span>
              <span className={styles.champSideName}>
                {comparison.maxChamp?.shortName || comparison.maxChamp?.name || '—'}
              </span>
              {comparison.maxChamp?.seed && <span className={styles.champSideSeed}>{comparison.maxChamp.seed}-seed</span>}
            </div>
          </div>
        </div>
      )}

      {/* Final Four comparison */}
      {(comparison.userFF.length > 0 || comparison.maxFF.length > 0) && (
        <div className={styles.ffSection}>
          <span className={styles.ffSectionLabel}>Final Four</span>
          <div className={styles.ffRow}>
            <div className={styles.ffSide}>
              <span className={styles.ffSideLabel}>You</span>
              {comparison.userFF.map((t, i) => (
                <span key={i} className={styles.ffTeam}>{t?.shortName || t?.name || '—'}</span>
              ))}
            </div>
            <div className={styles.ffSide}>
              <span className={`${styles.ffSideLabel} ${styles.maximusAccent}`}>Maximus</span>
              {comparison.maxFF.map((t, i) => (
                <span key={i} className={styles.ffTeam}>{t?.shortName || t?.name || '—'}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Round-by-round disagreement */}
      {Object.keys(comparison.disagreeByRound).length > 0 && (
        <div className={styles.roundSection}>
          <span className={styles.roundSectionLabel}>Disagreements by Round</span>
          <div className={styles.roundBreakdown}>
            {Object.entries(comparison.disagreeByRound)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([round, count]) => (
                <span key={round} className={styles.roundTag}>
                  <span className={styles.roundTagName}>{roundNames[round] || `R${round}`}</span>
                  <span className={styles.roundTagCount}>{count}</span>
                </span>
              ))}
          </div>
        </div>
      )}

      {/* Top divergences */}
      {comparison.topDivergences.length > 0 && (
        <div className={styles.divergenceSection}>
          <span className={styles.divergenceSectionLabel}>Boldest Disagreements</span>
          {comparison.topDivergences.map((d, i) => (
            <div key={d.matchupId} className={styles.divergenceItem}>
              <span className={styles.divergenceRound}>{roundNames[d.round]}</span>
              <span className={styles.divergenceYou}>{d.userTeam?.shortName || d.userTeam?.name}</span>
              <span className={styles.divergenceVs}>vs</span>
              <span className={styles.divergenceMax}>{d.maximusTeam?.shortName || d.maximusTeam?.name}</span>
              {d.isUpset && <span className={styles.divergenceUpset}>UPSET PICK</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
