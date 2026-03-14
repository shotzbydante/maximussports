import { useMemo } from 'react';
import styles from './BracketIntelStrip.module.css';

export default function BracketIntelStrip({ picks, pickOrigins, predictions, allMatchups }) {
  const intel = useMemo(() => {
    if (!picks || Object.keys(picks).length === 0) return null;

    const champion = allMatchups?.['champ']
      ? (picks['champ'] === 'top' ? allMatchups['champ'].topTeam : allMatchups['champ'].bottomTeam)
      : null;

    let highestConfidence = null;
    let biggestUpset = null;
    let maximusPickCount = 0;
    let manualPickCount = 0;
    let upsetCount = 0;

    for (const [matchupId, pred] of Object.entries(predictions || {})) {
      if (!picks[matchupId]) continue;

      if (!highestConfidence || pred.confidence > highestConfidence.confidence) {
        highestConfidence = { ...pred, matchupId };
      }
      if (pred.isUpset) {
        upsetCount++;
        if (!biggestUpset || pred.edgeMagnitude > (biggestUpset.edgeMagnitude || 0)) {
          biggestUpset = { ...pred, matchupId };
        }
      }
    }

    for (const origin of Object.values(pickOrigins || {})) {
      if (origin === 'maximus') maximusPickCount++;
      else manualPickCount++;
    }

    return { champion, highestConfidence, biggestUpset, maximusPickCount, manualPickCount, upsetCount };
  }, [picks, pickOrigins, predictions, allMatchups]);

  if (!intel) return null;

  return (
    <div className={styles.strip}>
      <div className={styles.stripInner}>
        {intel.champion && (
          <div className={styles.card}>
            <span className={styles.cardIcon}>🏆</span>
            <div className={styles.cardContent}>
              <span className={styles.cardLabel}>Your Champion</span>
              <span className={styles.cardValue}>{intel.champion.shortName || intel.champion.name}</span>
            </div>
          </div>
        )}

        {intel.highestConfidence && (
          <div className={styles.card}>
            <span className={styles.cardIcon}>🎯</span>
            <div className={styles.cardContent}>
              <span className={styles.cardLabel}>Highest Confidence</span>
              <span className={styles.cardValue}>
                {intel.highestConfidence.winner?.shortName || intel.highestConfidence.winner?.name}
                <span className={styles.confBadge}>{intel.highestConfidence.confidenceLabel}</span>
              </span>
            </div>
          </div>
        )}

        {intel.biggestUpset && (
          <div className={styles.card}>
            <span className={styles.cardIcon}>⚡</span>
            <div className={styles.cardContent}>
              <span className={styles.cardLabel}>Boldest Upset</span>
              <span className={styles.cardValue}>
                {intel.biggestUpset.winner?.seed}-seed {intel.biggestUpset.winner?.shortName || intel.biggestUpset.winner?.name}
              </span>
            </div>
          </div>
        )}

        {intel.upsetCount > 0 && (
          <div className={styles.card}>
            <span className={styles.cardIcon}>📊</span>
            <div className={styles.cardContent}>
              <span className={styles.cardLabel}>Upset Radar</span>
              <span className={styles.cardValue}>{intel.upsetCount} upset{intel.upsetCount > 1 ? 's' : ''} picked</span>
            </div>
          </div>
        )}

        <div className={styles.card}>
          <span className={styles.cardIcon}>◆</span>
          <div className={styles.cardContent}>
            <span className={styles.cardLabel}>Pick Breakdown</span>
            <span className={styles.cardValue}>
              {intel.maximusPickCount} Maximus · {intel.manualPickCount} Manual
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
