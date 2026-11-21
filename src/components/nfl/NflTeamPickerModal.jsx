/**
 * NflTeamPickerModal — search and pin NFL teams.
 *
 * Pinning goes through the same server-validated path as every other
 * sport (the parent's onPin / onUnpin), so the free-plan cap is enforced
 * across sports rather than per sport.
 */
import { useState, useMemo, useEffect, useRef } from 'react';
import { NFL_TEAMS } from '../../sports/nfl/teams';
import NflLogo from './NflLogo';
import s from './nfl.module.css';

export default function NflTeamPickerModal(props) {
  // Mounting the dialog only while open gives it a fresh search box each time.
  if (!props.isOpen) return null;
  return <PickerDialog {...props} />;
}

function PickerDialog({ onClose, isPinned, onPin, onUnpin, atLimit, limit, totalPinned, isPro }) {
  const [search, setSearch] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const teams = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return NFL_TEAMS;
    return NFL_TEAMS.filter((t) =>
      t.name.toLowerCase().includes(q)
      || t.abbrev.toLowerCase().includes(q)
      || t.division.toLowerCase().includes(q));
  }, [search]);

  return (
    <div className={s.backdrop} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={s.modal} role="dialog" aria-modal="true" aria-label="Add NFL teams">
        <div className={s.modalHead}>
          <div>
            <h3 className={s.modalTitle}>Follow NFL teams</h3>
            <p className={s.sectionSub}>
              {isPro ? `${totalPinned} followed across all sports` : `${totalPinned} of ${limit} followed across all sports`}
            </p>
          </div>
          <button type="button" className={s.iconBtn} onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className={s.modalBody}>
          <input
            ref={inputRef}
            type="search"
            className={s.searchInput}
            placeholder="Search by team, city or division"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search NFL teams"
          />
          {atLimit && (
            <div className={s.notice}>Free plans can follow {limit} teams. Remove one, or upgrade for unlimited.</div>
          )}
        </div>

        <div className={s.modalList}>
          {teams.map((team) => {
            const pinned = isPinned(team.slug);
            const blocked = !pinned && atLimit;
            return (
              <button
                key={team.slug}
                type="button"
                className={`${s.pickRow} ${pinned ? s.pickRowOn : ''}`}
                onClick={() => (pinned ? onUnpin(team.slug) : onPin(team.slug))}
                disabled={blocked}
                aria-pressed={pinned}
              >
                <NflLogo slug={team.slug} size={28} />
                <span>
                  <span className={s.pickRowName}>{team.name}</span>
                  <span className={s.pickRowSub}>{team.division}</span>
                </span>
                <span className={s.pickRowState}>{pinned ? 'Following' : 'Follow'}</span>
              </button>
            );
          })}
          {teams.length === 0 && <p className={s.note}>No teams match “{search}”.</p>}
        </div>
      </div>
    </div>
  );
}
