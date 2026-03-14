import BracketMatchup from './BracketMatchup';
import styles from './BracketFinalFour.module.css';

export default function BracketFinalFour({
  allMatchups,
  picks,
  pickOrigins,
  predictions,
  onPick,
  onMaximusPick,
  isPreSelection,
}) {
  const ff1 = allMatchups['ff-1'];
  const ff2 = allMatchups['ff-2'];
  const champ = allMatchups['champ'];

  const champion = champ && picks['champ']
    ? (picks['champ'] === 'top' ? champ.topTeam : champ.bottomTeam)
    : null;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.glowLine} />
        <h3 className={styles.title}>Final Four & Championship</h3>
        <div className={styles.glowLine} />
      </div>

      <div className={styles.bracket}>
        <div className={styles.semifinal}>
          <span className={styles.semiLabel}>Semifinal 1</span>
          {ff1 && (
            <BracketMatchup
              matchup={ff1}
              userPick={picks[ff1.matchupId]}
              pickOrigin={pickOrigins[ff1.matchupId]}
              prediction={predictions[ff1.matchupId]}
              onPick={onPick}
              onMaximusPick={onMaximusPick}
              isPreSelection={isPreSelection}
            />
          )}
          {ff1?.regionMatchup && (
            <span className={styles.regionNote}>{ff1.regionMatchup}</span>
          )}
        </div>

        <div className={styles.championship}>
          <span className={styles.champLabel}>Championship</span>
          {champ && (
            <BracketMatchup
              matchup={champ}
              userPick={picks[champ.matchupId]}
              pickOrigin={pickOrigins[champ.matchupId]}
              prediction={predictions[champ.matchupId]}
              onPick={onPick}
              onMaximusPick={onMaximusPick}
              isPreSelection={isPreSelection}
            />
          )}
          {champion && (
            <div className={styles.championDisplay}>
              <div className={styles.trophyIcon}>🏆</div>
              <span className={styles.championName}>
                {champion.shortName || champion.name}
              </span>
              <span className={styles.championLabel}>YOUR CHAMPION</span>
            </div>
          )}
        </div>

        <div className={styles.semifinal}>
          <span className={styles.semiLabel}>Semifinal 2</span>
          {ff2 && (
            <BracketMatchup
              matchup={ff2}
              userPick={picks[ff2.matchupId]}
              pickOrigin={pickOrigins[ff2.matchupId]}
              prediction={predictions[ff2.matchupId]}
              onPick={onPick}
              onMaximusPick={onMaximusPick}
              isPreSelection={isPreSelection}
            />
          )}
          {ff2?.regionMatchup && (
            <span className={styles.regionNote}>{ff2.regionMatchup}</span>
          )}
        </div>
      </div>
    </div>
  );
}
