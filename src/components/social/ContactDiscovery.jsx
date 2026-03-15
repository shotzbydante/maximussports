import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useContacts } from '../../hooks/useContacts';
import { useFriendGraph } from '../../hooks/useFriendGraph';
import ContactRow from './ContactRow';
import InviteRow from './InviteRow';
import styles from './Social.module.css';

export default function ContactDiscovery({ onDone, showDoneButton = true, compact = false }) {
  const { user, session } = useAuth();
  const { status, matchedUsers, unmatchedContacts, error, requestAndSync, trackInvite } = useContacts();
  const { followUser, unfollowUser } = useFriendGraph();
  const [suggestions, setSuggestions] = useState([]);
  const [tab, setTab] = useState('matched');

  useEffect(() => {
    if (!session || status !== 'idle') return;
    async function loadSuggestions() {
      try {
        const res = await fetch('/api/social/discover', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.suggestions || []);
        }
      } catch {
        // silent
      }
    }
    loadSuggestions();
  }, [session, status]);

  const handleFollow = useCallback(async (targetId) => {
    const newStatus = await followUser(targetId);
    setSuggestions(prev => prev.map(s =>
      s.id === targetId ? { ...s, followStatus: newStatus || 'following' } : s
    ));
    return newStatus;
  }, [followUser]);

  const handleUnfollow = useCallback(async (targetId) => {
    const newStatus = await unfollowUser(targetId);
    setSuggestions(prev => prev.map(s =>
      s.id === targetId ? { ...s, followStatus: newStatus || 'none' } : s
    ));
    return newStatus;
  }, [unfollowUser]);

  if (status === 'idle' && matchedUsers.length === 0) {
    return (
      <div className={`${styles.discoveryContainer} ${compact ? styles.compact : ''}`}>
        <div className={styles.discoveryHeader}>
          <div className={styles.discoveryIcon}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4-4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 00-3-3.87" />
              <path d="M16 3.13a4 4 0 010 7.75" />
            </svg>
          </div>
          <h3 className={styles.discoveryTitle}>Find friends on Maximus Sports</h3>
          <p className={styles.discoveryDesc}>
            See which friends already use Maximus and invite others to join.
          </p>
        </div>

        <button
          type="button"
          className={styles.btnSyncContacts}
          onClick={requestAndSync}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 00-3-3.87" />
            <path d="M16 3.13a4 4 0 010 7.75" />
          </svg>
          Sync Contacts
        </button>

        {showDoneButton && (
          <button type="button" className={styles.btnSkip} onClick={onDone}>
            Skip for now
          </button>
        )}

        {suggestions.length > 0 && (
          <div className={styles.suggestionsSection}>
            <h4 className={styles.sectionLabel}>Suggested for you</h4>
            <div className={styles.contactList}>
              {suggestions.map(s => (
                <ContactRow
                  key={s.id}
                  user={s}
                  onFollow={handleFollow}
                  onUnfollow={handleUnfollow}
                />
              ))}
            </div>
          </div>
        )}

        <p className={styles.privacyNote}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
          Your contacts are used only to help you find friends on Maximus Sports.
        </p>

        {error && <p className={styles.errorText}>{error}</p>}
      </div>
    );
  }

  if (status === 'requesting' || status === 'hashing' || status === 'matching') {
    return (
      <div className={`${styles.discoveryContainer} ${compact ? styles.compact : ''}`}>
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <p className={styles.loadingText}>
            {status === 'requesting' && 'Requesting contacts...'}
            {status === 'hashing' && 'Securing your data...'}
            {status === 'matching' && 'Finding friends...'}
          </p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className={`${styles.discoveryContainer} ${compact ? styles.compact : ''}`}>
        <p className={styles.errorText}>{error}</p>
        <button type="button" className={styles.btnSyncContacts} onClick={requestAndSync}>
          Try Again
        </button>
        {showDoneButton && (
          <button type="button" className={styles.btnSkip} onClick={onDone}>
            Skip for now
          </button>
        )}
      </div>
    );
  }

  const hasMatched = matchedUsers.length > 0;
  const hasUnmatched = unmatchedContacts.length > 0;

  return (
    <div className={`${styles.discoveryContainer} ${compact ? styles.compact : ''}`}>
      <h3 className={styles.resultsTitle}>
        {hasMatched
          ? `${matchedUsers.length} friend${matchedUsers.length !== 1 ? 's' : ''} found`
          : 'No friends found yet'}
      </h3>

      {(hasMatched && hasUnmatched) && (
        <div className={styles.tabRow}>
          <button
            type="button"
            className={`${styles.tab} ${tab === 'matched' ? styles.tabActive : ''}`}
            onClick={() => setTab('matched')}
          >
            On Maximus ({matchedUsers.length})
          </button>
          <button
            type="button"
            className={`${styles.tab} ${tab === 'invite' ? styles.tabActive : ''}`}
            onClick={() => setTab('invite')}
          >
            Invite ({unmatchedContacts.length})
          </button>
        </div>
      )}

      <div className={styles.contactList}>
        {(tab === 'matched' || !hasUnmatched) && matchedUsers.map(u => (
          <ContactRow
            key={u.id}
            user={u}
            onFollow={handleFollow}
            onUnfollow={handleUnfollow}
          />
        ))}

        {(tab === 'invite' || !hasMatched) && unmatchedContacts.map((c, i) => (
          <InviteRow
            key={c.phoneHash || i}
            contact={c}
            onInviteTracked={trackInvite}
          />
        ))}

        {!hasMatched && !hasUnmatched && suggestions.length > 0 && (
          <>
            <h4 className={styles.sectionLabel}>Suggested for you</h4>
            {suggestions.map(s => (
              <ContactRow
                key={s.id}
                user={s}
                onFollow={handleFollow}
                onUnfollow={handleUnfollow}
              />
            ))}
          </>
        )}
      </div>

      <p className={styles.privacyNote}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
        Your contacts are used only to help you find friends on Maximus Sports.
      </p>

      {showDoneButton && (
        <button type="button" className={styles.btnDone} onClick={onDone}>
          Done
        </button>
      )}
    </div>
  );
}
