import { useMemo } from 'react';
import styles from './BracketIntelStrip.module.css';

export default function BracketIntelStrip({
  picks,
  pickOrigins,
  predictions,
  allMatchups,
  maximusPicks,
}) {
  const intel = useMemo(() => {
    if (!picks || Object.keys(picks).length === 0) return null;

    const champion = allMatchups?.['champ']
      ? (picks['champ'] === 'top' ? allMatchups['champ'].topTeam : allMatchups['champ'].bottomTeam)
      : null;

    let highestConfidence = null;
    let biggestUpset = null;
    let mostContrarian = null;
    let maximusPickCount = 0;
    let manualPickCount = 0;
    let upsetCount = 0;
    let r1UpsetCount = 0;
    let coinFlipCount = 0;

    const regionUpsets = {};

    for (const [matchupId, pred] of Object.entries(predictions || {})) {
      if (!picks[matchupId]) continue;

      if (!highestConfidence || pred.confidence > highestConfidence.confidence ||
          (pred.confidence === highestConfidence.confidence && pred.edgeMagnitude > highestConfidence.edgeMagnitude)) {
        highestConfidence = { ...pred, matchupId };
      }

      if (pred.isUpset) {
        upsetCount++;
        const matchup = allMatchups[matchupId];
        if (matchup?.round === 1) r1UpsetCount++;
        if (matchup?.region) regionUpsets[matchup.region] = (regionUpsets[matchup.region] || 0) + 1;

        if (!biggestUpset || (pred.winner?.seed - pred.loser?.seed) > (biggestUpset.winner?.seed - biggestUpset.loser?.seed)) {
          biggestUpset = { ...pred, matchupId };
        }
      }

      if (pred.edgeMagnitude < 0.04) coinFlipCount++;

      if (maximusPicks && maximusPicks[matchupId] && picks[matchupId] !== maximusPicks[matchupId]) {
        const matchup = allMatchups[matchupId];
        if (!mostContrarian || (matchup?.round || 0) > (mostContrarian.round || 0)) {
          mostContrarian = { ...pred, matchupId, round: matchup?.round || 0 };
        }
      }
    }

    for (const origin of Object.values(pickOrigins || {})) {
      if (origin === 'maximus') maximusPickCount++;
      else manualPickCount++;
    }

    let chalkBustRegion = null;
    let maxRegionUpsets = 0;
    for (const [region, count] of Object.entries(regionUpsets)) {
      if (count > maxRegionUpsets) { maxRegionUpsets = count; chalkBustRegion = region; }
    }

    let strongestFF = null;
    for (const mId of ['ff-1', 'ff-2']) {
      const pred = predictions[mId];
      if (pred && (!strongestFF || pred.confidence > strongestFF.confidence)) {
        strongestFF = { ...pred, matchupId: mId };
      }
    }

    const divergenceCount = maximusPicks
      ? Object.keys(picks).filter(id => maximusPicks[id] && picks[id] !== maximusPicks[id]).length
      : 0;

    return {
      champion, highestConfidence, biggestUpset, mostContrarian,
      maximusPickCount, manualPickCount, upsetCount, r1UpsetCount,
      coinFlipCount, chalkBustRegion, strongestFF, divergenceCount,
    };
  }, [picks, pickOrigins, predictions, allMatchups, maximusPicks]);

  if (!intel) return null;

  return (
    <div className={styles.strip}>
      <div className={styles.stripInner}>
        {intel.champion && (
          <IntelCard icon="trophy" label="Your Champion" iconClass={styles.iconTrophy}>
            {intel.champion.logo && (
              <img
                src={intel.champion.logo}
                alt=""
                className={styles.inlineTeamLogo}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            )}
            <span className={styles.cardValue}>{intel.champion.shortName || intel.champion.name}</span>
          </IntelCard>
        )}

        {intel.highestConfidence && (
          <IntelCard icon="target" label="Highest Confidence" iconClass={styles.iconTarget}>
            <span className={styles.cardValue}>
              {intel.highestConfidence.winner?.shortName || intel.highestConfidence.winner?.name}
            </span>
            <span className={`${styles.confBadge} ${styles[`conf${intel.highestConfidence.confidenceLabel}`]}`}>
              {intel.highestConfidence.confidenceLabel}
            </span>
          </IntelCard>
        )}

        {intel.biggestUpset && (
          <IntelCard icon="upset" label="Boldest Upset" iconClass={styles.iconUpset}>
            <span className={styles.cardValue}>
              {intel.biggestUpset.winner?.seed}-seed {intel.biggestUpset.winner?.shortName || intel.biggestUpset.winner?.name}
            </span>
          </IntelCard>
        )}

        {intel.upsetCount > 0 && (
          <IntelCard icon="radar" label="Upset Radar" iconClass={styles.iconRadar}>
            <span className={styles.cardValue}>{intel.upsetCount}</span>
            <span className={styles.cardDetail}>
              {intel.r1UpsetCount > 0 && `${intel.r1UpsetCount} in R1`}
            </span>
          </IntelCard>
        )}

        <IntelCard icon="split" label="Pick Breakdown" iconClass={styles.iconSplit}>
          <span className={styles.cardValue}>
            <span className={styles.maximusAccent}>{intel.maximusPickCount}</span> / <span>{intel.manualPickCount}</span>
          </span>
          <span className={styles.cardDetail}>Max / Manual</span>
        </IntelCard>

        {intel.coinFlipCount > 0 && (
          <IntelCard icon="coin" label="Coin Flips" iconClass={styles.iconCoin}>
            <span className={styles.cardValue}>{intel.coinFlipCount}</span>
            <span className={styles.cardDetail}>toss-up games</span>
          </IntelCard>
        )}

        {intel.chalkBustRegion && (
          <IntelCard icon="bust" label="Chalk Buster" iconClass={styles.iconBust}>
            <span className={styles.cardValue}>{intel.chalkBustRegion}</span>
            <span className={styles.cardDetail}>most upsets</span>
          </IntelCard>
        )}

        {intel.divergenceCount > 0 && (
          <IntelCard icon="diverge" label="vs Maximus" iconClass={styles.iconDiverge}>
            <span className={styles.cardValue}>{intel.divergenceCount}</span>
            <span className={styles.cardDetail}>disagreements</span>
          </IntelCard>
        )}

        {intel.strongestFF && (
          <IntelCard icon="ff" label="Strongest F4 Pick" iconClass={styles.iconFF}>
            <span className={styles.cardValue}>
              {intel.strongestFF.winner?.shortName || intel.strongestFF.winner?.name}
            </span>
          </IntelCard>
        )}
      </div>
    </div>
  );
}

const ICON_MAP = {
  trophy: '🏆', target: '🎯', upset: '⚡', radar: '📡',
  split: '◆', coin: '🪙', bust: '💥', diverge: '↔', ff: '🏀',
};

function IntelCard({ icon, label, iconClass, children }) {
  return (
    <div className={styles.card}>
      <span className={`${styles.cardIcon} ${iconClass || ''}`}>{ICON_MAP[icon] || icon}</span>
      <div className={styles.cardContent}>
        <span className={styles.cardLabel}>{label}</span>
        <div className={styles.cardRow}>{children}</div>
      </div>
    </div>
  );
}
