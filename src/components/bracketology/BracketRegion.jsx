import { useMemo } from 'react';
import BracketMatchup from './BracketMatchup';
import { SEED_MATCHUP_ORDER } from '../../config/bracketology';
import styles from './BracketRegion.module.css';

export default function BracketRegion({
  region,
  allMatchups,
  picks,
  pickOrigins,
  predictions,
  onPick,
  onMaximusPick,
  isPreSelection,
  side = 'left',
}) {
  const regionName = region.name;
  const regionLower = regionName.toLowerCase();

  const rounds = useMemo(() => {
    const roundData = [];
    for (let round = 1; round <= 4; round++) {
      const matchups = Object.values(allMatchups)
        .filter(m => m.round === round && m.region === regionName)
        .sort((a, b) => a.position - b.position);
      roundData.push({ round, matchups });
    }
    return roundData;
  }, [allMatchups, regionName]);

  const roundLabels = ['Round of 64', 'Round of 32', 'Sweet 16', 'Elite 8'];

  return (
    <div className={`${styles.region} ${side === 'right' ? styles.rightSide : ''}`}>
      <div className={styles.regionHeader}>
        <h3 className={styles.regionTitle}>{regionName}</h3>
        <span className={styles.regionBadge}>Region</span>
      </div>
      <div className={styles.roundsContainer}>
        {rounds.map(({ round, matchups }, ri) => (
          <div key={round} className={styles.round}>
            <span className={styles.roundLabel}>{roundLabels[ri]}</span>
            <div className={styles.matchupColumn}>
              {matchups.map((matchup) => (
                <div
                  key={matchup.matchupId}
                  className={styles.matchupWrapper}
                  style={{ '--round': round }}
                >
                  <BracketMatchup
                    matchup={matchup}
                    userPick={picks[matchup.matchupId]}
                    pickOrigin={pickOrigins[matchup.matchupId]}
                    prediction={predictions[matchup.matchupId]}
                    onPick={onPick}
                    onMaximusPick={onMaximusPick}
                    isPreSelection={isPreSelection}
                    compact={round >= 3}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
