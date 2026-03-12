import { getMaximusTake, getSlideColors, getConfidenceLabel } from '../../utils/confidenceSystem';
import { getTeamSlug } from '../../utils/teamSlug';
import TeamLogo from './TeamLogo';
import styles from './MaximusTakeCard.module.css';

function makeTeamObj(name) {
  if (!name) return null;
  return { name: name.replace(/^(?:The |the )/, '').trim(), slug: getTeamSlug(name) };
}

export default function MaximusTakeCard({ allPicks, variant = 'web' }) {
  const take = getMaximusTake(allPicks);
  if (!take) return null;

  const pick = take.pick;
  const cs = getSlideColors(pick.confidence);
  const isSlide = variant === 'slide';
  const isTot = pick.pickType === 'total';
  const teamObj = !isTot ? makeTeamObj(pick.pickTeam) : null;
  const opponentLabel = !isTot && pick.opponentTeam ? `vs ${pick.opponentTeam}` : null;
  const matchupLabel = isTot ? `${pick.awayTeam} vs ${pick.homeTeam}` : opponentLabel;

  return (
    <div className={`${styles.card} ${isSlide ? styles.slideVariant : styles.webVariant}`}>
      <div className={styles.header}>
        <span className={styles.bolt}>⚡</span>
        <span className={styles.title}>MAXIMUS TAKE</span>
        {take.takeType && <span className={styles.takeType}>{take.takeType}</span>}
        <span
          className={styles.confBadge}
          style={isSlide ? { background: cs.bg, color: cs.text, borderColor: cs.border } : undefined}
        >
          {getConfidenceLabel(pick.confidence)}
        </span>
      </div>
      <div className={styles.body}>
        {teamObj && (
          <span className={styles.logoWrap}>
            <TeamLogo team={teamObj} size={isSlide ? 28 : 22} />
          </span>
        )}
        <div className={styles.detail}>
          <span className={styles.pickLine}>{take.label}</span>
          {matchupLabel && <span className={styles.matchup}>{matchupLabel}</span>}
        </div>
      </div>
      <div className={styles.editorial}>{take.editorial}</div>
    </div>
  );
}
