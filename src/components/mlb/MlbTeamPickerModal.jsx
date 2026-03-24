/**
 * MlbTeamPickerModal — modal overlay for searching and pinning MLB teams.
 * Mirrors the NCAAM picker UX pattern: search + scrollable list + instant pin.
 * Uses the unified usePinnedTeams({ sport: 'mlb' }) hook.
 */
import { useState, useMemo, useEffect, useRef } from 'react';
import { getMlbEspnLogoUrl } from '../../utils/espnMlbLogos';
import { MLB_TEAMS } from '../../sports/mlb/teams';
import styles from './MlbTeamPickerModal.module.css';

const FREE_PIN_LIMIT = 3;

export default function MlbTeamPickerModal({ isOpen, onClose, pinnedTeams, addTeam, removeTeam, isPinned, isPro }) {
  const [search, setSearch] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const filteredTeams = useMemo(() => {
    if (!search.trim()) return MLB_TEAMS;
    const q = search.toLowerCase().trim();
    return MLB_TEAMS.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.abbrev.toLowerCase().includes(q) ||
      t.division.toLowerCase().includes(q)
    );
  }, [search]);

  const atLimit = !isPro && pinnedTeams.length >= FREE_PIN_LIMIT;

  const handleToggle = (slug) => {
    if (isPinned(slug)) {
      removeTeam(slug);
    } else {
      if (atLimit) return; // blocked
      addTeam(slug);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.backdrop} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Add MLB teams">
        {/* Header */}
        <div className={styles.header}>
          <div>
            <h3 className={styles.title}>Add teams to your watchlist</h3>
            <p className={styles.subtitle}>Pin teams to track projected wins, odds, and intel.</p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* Search */}
        <div className={styles.searchWrap}>
          <svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            placeholder="Search teams (Yankees, Dodgers, Braves…)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.searchInput}
            aria-label="Search MLB teams"
          />
        </div>

        {/* Selected count */}
        <div className={styles.selectedBar}>
          <span className={`${styles.selectedCount} ${atLimit ? styles.atCap : ''}`}>
            {isPro
              ? `Selected: ${pinnedTeams.length}`
              : `Selected: ${pinnedTeams.length} / ${FREE_PIN_LIMIT}`}
          </span>
          {atLimit && (
            <span className={styles.limitNote}>Upgrade to Pro for unlimited teams</span>
          )}
        </div>

        {/* Team list */}
        <div className={styles.teamList}>
          {filteredTeams.map(team => {
            const pinned = isPinned(team.slug);
            const blocked = !pinned && atLimit;
            const logo = getMlbEspnLogoUrl(team.slug);
            return (
              <button
                key={team.slug}
                type="button"
                className={`${styles.teamRow} ${pinned ? styles.teamRowPinned : ''} ${blocked ? styles.teamRowBlocked : ''}`}
                onClick={() => handleToggle(team.slug)}
                disabled={blocked}
              >
                {logo && <img src={logo} alt="" className={styles.teamLogo} width={28} height={28} loading="lazy" />}
                <div className={styles.teamInfo}>
                  <span className={styles.teamName}>{team.name}</span>
                  <span className={styles.teamDiv}>{team.division}</span>
                </div>
                <span className={styles.pinIndicator}>
                  {pinned ? '✓' : '📌'}
                </span>
              </button>
            );
          })}
          {filteredTeams.length === 0 && (
            <p className={styles.noResults}>No teams match &ldquo;{search}&rdquo;</p>
          )}
        </div>
      </div>
    </div>
  );
}
