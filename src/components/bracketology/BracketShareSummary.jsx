import { useMemo, useCallback } from 'react';
import styles from './BracketShareSummary.module.css';

export default function BracketShareSummary({
  picks,
  maximusPicks,
  allMatchups,
  predictions,
  bracketMode,
  onClose,
}) {
  const summary = useMemo(() => {
    if (!picks || Object.keys(picks).length === 0) return null;

    const champion = allMatchups?.['champ']
      ? (picks['champ'] === 'top' ? allMatchups['champ'].topTeam : allMatchups['champ'].bottomTeam)
      : null;

    const finalFour = [];
    for (const mId of ['ff-1', 'ff-2']) {
      const m = allMatchups[mId];
      if (!m || !picks[mId]) continue;
      finalFour.push(picks[mId] === 'top' ? m.topTeam : m.bottomTeam);
    }

    let biggestUpset = null;
    let upsetCount = 0;
    for (const [id, pick] of Object.entries(picks)) {
      const m = allMatchups[id];
      if (!m) continue;
      const picked = pick === 'top' ? m.topTeam : m.bottomTeam;
      const other = pick === 'top' ? m.bottomTeam : m.topTeam;
      if (picked?.seed > (other?.seed || 0)) {
        upsetCount++;
        const diff = picked.seed - other.seed;
        if (!biggestUpset || diff > (biggestUpset.seedDiff || 0)) {
          biggestUpset = { team: picked, opponent: other, seedDiff: diff };
        }
      }
    }

    const divergenceCount = maximusPicks
      ? Object.keys(picks).filter(id => maximusPicks[id] && picks[id] !== maximusPicks[id]).length
      : 0;

    return { champion, finalFour, biggestUpset, upsetCount, divergenceCount, totalPicks: Object.keys(picks).length };
  }, [picks, maximusPicks, allMatchups, predictions]);

  const handleCopyText = useCallback(async () => {
    if (!summary) return;
    const lines = ['My March Madness Bracket — Maximus Sports'];
    if (summary.champion) lines.push(`Champion: ${summary.champion.shortName || summary.champion.name}`);
    if (summary.finalFour.length > 0) {
      lines.push(`Final Four: ${summary.finalFour.map(t => t.shortName || t.name).join(', ')}`);
    }
    if (summary.biggestUpset) {
      lines.push(`Boldest Upset: ${summary.biggestUpset.team.seed}-seed ${summary.biggestUpset.team.shortName}`);
    }
    lines.push(`${summary.totalPicks} picks made`);
    if (summary.divergenceCount > 0) lines.push(`${summary.divergenceCount} games where I disagree with Maximus`);
    lines.push('');
    lines.push('Build yours at maximussports.ai/bracketology');

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
    } catch { /* fallback: do nothing */ }
  }, [summary]);

  const handleShareNative = useCallback(async () => {
    if (!summary || !navigator.share) return;
    const lines = [];
    if (summary.champion) lines.push(`My champion: ${summary.champion.shortName || summary.champion.name}`);
    if (summary.biggestUpset) {
      lines.push(`Boldest upset: ${summary.biggestUpset.team.seed}-seed ${summary.biggestUpset.team.shortName}`);
    }
    lines.push(`${summary.totalPicks} picks locked in.`);
    lines.push('Build yours at maximussports.ai/bracketology');

    try {
      await navigator.share({
        title: 'My March Madness Bracket',
        text: lines.join('\n'),
        url: 'https://maximussports.ai/bracketology',
      });
    } catch { /* user cancelled */ }
  }, [summary]);

  if (!summary) return null;

  const isProjected = bracketMode === 'projected';

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.card} onClick={e => e.stopPropagation()}>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">×</button>

        <div className={styles.cardHeader}>
          <span className={styles.brand}>MAXIMUS SPORTS</span>
          <span className={`${styles.modeBadge} ${isProjected ? styles.projected : styles.official}`}>
            {isProjected ? 'PROJECTED' : 'OFFICIAL'}
          </span>
        </div>

        <h3 className={styles.cardTitle}>My Bracket</h3>

        {summary.champion && (
          <div className={styles.championBlock}>
            {summary.champion.logo && (
              <img
                src={summary.champion.logo}
                alt=""
                className={styles.champLogo}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            )}
            <div className={styles.champInfo}>
              <span className={styles.champLabel}>Champion</span>
              <span className={styles.champName}>{summary.champion.shortName || summary.champion.name}</span>
              {summary.champion.seed && (
                <span className={styles.champSeed}>{summary.champion.seed}-seed · {summary.champion.conference}</span>
              )}
            </div>
          </div>
        )}

        {summary.finalFour.length > 0 && (
          <div className={styles.statRow}>
            <span className={styles.statLabel}>Final Four</span>
            <span className={styles.statValue}>
              {summary.finalFour.map(t => t.shortName || t.name).join(' · ')}
            </span>
          </div>
        )}

        {summary.biggestUpset && (
          <div className={styles.statRow}>
            <span className={styles.statLabel}>Boldest Upset</span>
            <span className={styles.statValue}>
              {summary.biggestUpset.team.seed}-seed {summary.biggestUpset.team.shortName || summary.biggestUpset.team.name}
              {' over '}
              {summary.biggestUpset.opponent.seed}-seed {summary.biggestUpset.opponent.shortName || summary.biggestUpset.opponent.name}
            </span>
          </div>
        )}

        <div className={styles.statsGrid}>
          <div className={styles.statBlock}>
            <span className={styles.statBlockValue}>{summary.totalPicks}</span>
            <span className={styles.statBlockLabel}>Picks</span>
          </div>
          <div className={styles.statBlock}>
            <span className={styles.statBlockValue}>{summary.upsetCount}</span>
            <span className={styles.statBlockLabel}>Upsets</span>
          </div>
          {summary.divergenceCount > 0 && (
            <div className={styles.statBlock}>
              <span className={`${styles.statBlockValue} ${styles.divergeColor}`}>{summary.divergenceCount}</span>
              <span className={styles.statBlockLabel}>vs Maximus</span>
            </div>
          )}
        </div>

        <div className={styles.actions}>
          {typeof navigator !== 'undefined' && navigator.share && (
            <button type="button" className={styles.shareBtn} onClick={handleShareNative}>
              Share My Bracket
            </button>
          )}
          <button type="button" className={styles.copyBtn} onClick={handleCopyText}>
            Copy Summary
          </button>
        </div>

        <span className={styles.watermark}>maximussports.ai/bracketology</span>
      </div>
    </div>
  );
}
