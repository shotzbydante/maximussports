import { useMemo, useCallback, useRef, useState } from 'react';
import styles from './BracketShareSummary.module.css';

function teamName(t) {
  return t?.shortName || t?.name || '';
}

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

    const champMatchup = allMatchups?.['champ'];
    const champion = champMatchup && picks['champ']
      ? (picks['champ'] === 'top' ? champMatchup.topTeam : champMatchup.bottomTeam)
      : null;

    const championshipMatchup = champMatchup && picks['champ'] ? {
      winner: picks['champ'] === 'top' ? champMatchup.topTeam : champMatchup.bottomTeam,
      loser: picks['champ'] === 'top' ? champMatchup.bottomTeam : champMatchup.topTeam,
    } : null;

    const finalFourTeams = [];
    for (const mId of ['ff-1', 'ff-2']) {
      const m = allMatchups[mId];
      if (!m) continue;
      if (m.topTeam) finalFourTeams.push(m.topTeam);
      if (m.bottomTeam) finalFourTeams.push(m.bottomTeam);
    }

    const allUpsets = [];
    let upsetCount = 0;
    let diceRollCount = 0;

    for (const [id, pick] of Object.entries(picks)) {
      const m = allMatchups[id];
      if (!m) continue;
      const picked = pick === 'top' ? m.topTeam : m.bottomTeam;
      const other = pick === 'top' ? m.bottomTeam : m.topTeam;

      const tier = predictions?.[id]?.bracketTier;
      if (tier === 'dice_roll' || tier === 'upset_special') diceRollCount++;

      if (picked?.seed > (other?.seed || 0)) {
        upsetCount++;
        allUpsets.push({
          team: picked,
          opponent: other,
          seedDiff: picked.seed - other.seed,
          round: m.round,
          tier,
        });
      }
    }

    allUpsets.sort((a, b) => b.seedDiff - a.seedDiff || (b.round || 0) - (a.round || 0));
    const notableUpsets = allUpsets.slice(0, 3);

    const divergenceCount = maximusPicks
      ? Object.keys(picks).filter(id => maximusPicks[id] && picks[id] !== maximusPicks[id]).length
      : 0;

    return {
      champion,
      championshipMatchup,
      finalFourTeams,
      notableUpsets,
      diceRollCount,
      upsetCount,
      divergenceCount,
      totalPicks: Object.keys(picks).length,
    };
  }, [picks, maximusPicks, allMatchups, predictions]);

  const handleCopyText = useCallback(async () => {
    if (!summary) return;
    const lines = ['My March Madness Bracket — Maximus Sports', ''];
    if (summary.championshipMatchup) {
      lines.push(`🏆 Champion: ${teamName(summary.championshipMatchup.winner)}`);
      lines.push(`🏀 Title Game: ${teamName(summary.championshipMatchup.winner)} over ${teamName(summary.championshipMatchup.loser)}`);
    } else if (summary.champion) {
      lines.push(`🏆 Champion: ${teamName(summary.champion)}`);
    }
    if (summary.finalFourTeams.length > 0) {
      lines.push(`Final Four: ${summary.finalFourTeams.map(teamName).join(' · ')}`);
    }
    if (summary.notableUpsets.length > 0) {
      lines.push('');
      lines.push('🎲 Dice Rolls:');
      for (const u of summary.notableUpsets) {
        lines.push(`  ${u.team.seed}-seed ${teamName(u.team)} over ${u.opponent.seed}-seed ${teamName(u.opponent)}`);
      }
    }
    lines.push('');
    lines.push(`${summary.totalPicks} picks · ${summary.upsetCount} upsets${summary.diceRollCount > 0 ? ` · ${summary.diceRollCount} dice rolls` : ''}`);
    lines.push('');
    lines.push('Build yours → maximussports.ai/bracketology');

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
    } catch { /* fallback: do nothing */ }
  }, [summary]);

  const handleShareNative = useCallback(async () => {
    if (!summary || !navigator.share) return;
    const lines = [];
    if (summary.championshipMatchup) {
      lines.push(`🏆 ${teamName(summary.championshipMatchup.winner)} wins it all`);
      lines.push(`🏀 ${teamName(summary.championshipMatchup.winner)} over ${teamName(summary.championshipMatchup.loser)} in the title game`);
    } else if (summary.champion) {
      lines.push(`🏆 My champion: ${teamName(summary.champion)}`);
    }
    if (summary.finalFourTeams.length > 0) {
      lines.push(`Final Four: ${summary.finalFourTeams.map(teamName).join(' · ')}`);
    }
    if (summary.notableUpsets.length > 0) {
      const top = summary.notableUpsets[0];
      lines.push(`🎲 Boldest call: ${top.team.seed}-seed ${teamName(top.team)} over ${top.opponent.seed}-seed ${teamName(top.opponent)}`);
    }
    lines.push(`${summary.totalPicks} picks locked in.`);
    lines.push('Build yours → maximussports.ai/bracketology');

    try {
      await navigator.share({
        title: 'My March Madness Bracket',
        text: lines.join('\n'),
        url: 'https://maximussports.ai/bracketology',
      });
    } catch { /* user cancelled */ }
  }, [summary]);

  const cardRef = useRef(null);
  const [saving, setSaving] = useState(false);

  const handleSaveImage = useCallback(async () => {
    if (!cardRef.current || saving) return;
    setSaving(true);
    try {
      const { toPng } = await import('html-to-image');
      const node = cardRef.current;

      const actionsEl = node.querySelector('[data-share-actions]');
      const closeEl = node.querySelector('[data-close-btn]');
      if (actionsEl) actionsEl.style.display = 'none';
      if (closeEl) closeEl.style.display = 'none';

      const dataUrl = await toPng(node, {
        pixelRatio: 3,
        backgroundColor: '#0a1222',
        cacheBust: true,
      });

      if (actionsEl) actionsEl.style.display = '';
      if (closeEl) closeEl.style.display = '';

      if (typeof navigator !== 'undefined' && navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const file = new File([blob], 'maximus-bracket.png', { type: 'image/png' });
        try {
          await navigator.share({ files: [file], title: 'My March Madness Bracket' });
          return;
        } catch { /* user cancelled or share failed — fall through to download */ }
      }

      const link = document.createElement('a');
      link.download = 'maximus-bracket.png';
      link.href = dataUrl;
      link.click();
    } catch {
      /* degrade gracefully */
    } finally {
      setSaving(false);
    }
  }, [saving]);

  if (!summary) return null;

  const isProjected = bracketMode === 'projected';
  const modeLabel = bracketMode === 'official' ? 'OFFICIAL'
    : bracketMode === 'official_partial' ? 'ESPN (PARTIAL)'
    : 'PROJECTED';
  const modeStyle = isProjected ? styles.projected : styles.official;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.card} ref={cardRef} onClick={e => e.stopPropagation()}>
        <button type="button" className={styles.closeBtn} data-close-btn onClick={onClose} aria-label="Close">×</button>

        <div className={styles.cardHeader}>
          <span className={styles.brand}>MAXIMUS SPORTS</span>
          <span className={`${styles.modeBadge} ${modeStyle}`}>
            {modeLabel}
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
              <span className={styles.champName}>{teamName(summary.champion)}</span>
              {summary.champion.seed && (
                <span className={styles.champSeed}>{summary.champion.seed}-seed{summary.champion.conference ? ` · ${summary.champion.conference}` : ''}</span>
              )}
            </div>
          </div>
        )}

        {summary.championshipMatchup && (
          <div className={styles.statRow}>
            <span className={styles.statLabel}>National Championship</span>
            <span className={styles.statValue}>
              {teamName(summary.championshipMatchup.winner)} over {teamName(summary.championshipMatchup.loser)}
            </span>
          </div>
        )}

        {summary.finalFourTeams.length > 0 && (
          <div className={styles.statRow}>
            <span className={styles.statLabel}>Final Four</span>
            <span className={styles.statValue}>
              {summary.finalFourTeams.map(teamName).join(' · ')}
            </span>
          </div>
        )}

        {summary.notableUpsets.length > 0 && (
          <div className={styles.diceSection}>
            <span className={styles.diceSectionLabel}>
              <span className={styles.diceIcon}>🎲</span> Dice Rolls
            </span>
            {summary.notableUpsets.map((u, i) => (
              <div key={i} className={styles.diceItem}>
                <span className={styles.diceItemIcon}>🎲</span>
                <span className={styles.diceItemText}>
                  {u.team.seed}-seed {teamName(u.team)} over {u.opponent.seed}-seed {teamName(u.opponent)}
                </span>
              </div>
            ))}
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
          {summary.diceRollCount > 0 ? (
            <div className={styles.statBlock}>
              <span className={`${styles.statBlockValue} ${styles.diceRollColor}`}>{summary.diceRollCount}</span>
              <span className={styles.statBlockLabel}>🎲 Rolls</span>
            </div>
          ) : summary.divergenceCount > 0 ? (
            <div className={styles.statBlock}>
              <span className={`${styles.statBlockValue} ${styles.divergeColor}`}>{summary.divergenceCount}</span>
              <span className={styles.statBlockLabel}>vs Maximus</span>
            </div>
          ) : null}
        </div>

        <div className={styles.actions} data-share-actions>
          <button type="button" className={styles.saveBtn} onClick={handleSaveImage} disabled={saving}>
            {saving ? 'Saving…' : 'Save Image'}
          </button>
          {typeof navigator !== 'undefined' && navigator.share && (
            <button type="button" className={styles.shareBtn} onClick={handleShareNative}>
              Share
            </button>
          )}
          <button type="button" className={styles.copyBtn} onClick={handleCopyText}>
            Copy Text
          </button>
        </div>

        <span className={styles.watermark}>maximussports.ai/bracketology</span>
      </div>
    </div>
  );
}
