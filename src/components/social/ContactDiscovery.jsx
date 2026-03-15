/**
 * ContactDiscovery — adaptive discovery surface.
 *
 * Layout adapts based on browser capabilities:
 * - If Contact Picker API is available: shows sync CTA + search + suggestions
 * - If not (iOS Safari, iOS Chrome, desktop): shows search + invite link + suggestions
 *
 * Never shows a broken error state. Always provides a useful next step.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useContacts } from '../../hooks/useContacts';
import { useFriendGraph } from '../../hooks/useFriendGraph';
import ContactRow from './ContactRow';
import InviteRow from './InviteRow';
import { showToast } from '../common/Toast';
import { track } from '../../analytics/index';
import styles from './Social.module.css';

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}

export default function ContactDiscovery({ onDone, showDoneButton = true, compact = false }) {
  const { user, session } = useAuth();
  const {
    status: contactStatus, matchedUsers, unmatchedContacts, error: contactError,
    isContactPickerSupported, requestAndSync, trackInvite,
  } = useContacts();
  const { followUser, unfollowUser } = useFriendGraph();

  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchEmpty, setSearchEmpty] = useState(false);
  const debounceRef = useRef(null);

  const [contactTab, setContactTab] = useState('matched');
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);

  const inviteLink = `https://maximussports.ai/join?ref=${user?.id || 'maximus'}`;

  useEffect(() => {
    if (!session) return;
    setSuggestionsLoading(true);
    async function load() {
      try {
        const res = await fetch('/api/social/discover', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.suggestions || []);
        }
      } catch { /* silent */ }
      finally { setSuggestionsLoading(false); }
    }
    load();
  }, [session]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearchEmpty(false);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    setSearchEmpty(false);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/social/search?q=${encodeURIComponent(q)}`, {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results || []);
          setSearchEmpty((data.results || []).length === 0);
        }
      } catch {
        setSearchResults([]);
        setSearchEmpty(true);
      } finally {
        setSearchLoading(false);
      }
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery, session?.access_token]);

  const handleFollow = useCallback(async (targetId) => {
    const newStatus = await followUser(targetId);
    const updateList = (list) => list.map(s =>
      s.id === targetId ? { ...s, followStatus: newStatus || 'following' } : s
    );
    setSuggestions(updateList);
    setSearchResults(updateList);
    return newStatus;
  }, [followUser]);

  const handleUnfollow = useCallback(async (targetId) => {
    const newStatus = await unfollowUser(targetId);
    const updateList = (list) => list.map(s =>
      s.id === targetId ? { ...s, followStatus: newStatus || 'none' } : s
    );
    setSuggestions(updateList);
    setSearchResults(updateList);
    return newStatus;
  }, [unfollowUser]);

  const handleCopyInviteLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setInviteLinkCopied(true);
      showToast('Invite link copied', { type: 'success' });
      track('invite_link_copied', {});
      setTimeout(() => setInviteLinkCopied(false), 3000);
    } catch {
      showToast('Copy failed', { type: 'error' });
    }
  }, [inviteLink]);

  const handleShareInvite = useCallback(() => {
    const message = `Join me on Maximus Sports for AI-powered picks and March Madness brackets.\n\n${inviteLink}`;
    const smsUrl = `sms:?&body=${encodeURIComponent(message)}`;
    window.open(smsUrl, '_blank');
    track('invite_sms_sent', {});
  }, [inviteLink]);

  const isSearchActive = searchQuery.trim().length >= 2;
  const hasContactResults = contactStatus === 'done' && (matchedUsers.length > 0 || unmatchedContacts.length > 0);
  const isContactSyncing = contactStatus === 'requesting' || contactStatus === 'hashing' || contactStatus === 'matching';

  return (
    <div className={`${styles.discoveryContainer} ${compact ? styles.compact : ''}`}>

      {/* ── Search Field ─────────────────────────────────────────────────── */}
      <div className={styles.searchWrap}>
        <SearchIcon />
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Search username or name"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoComplete="off"
          spellCheck="false"
        />
        {searchQuery && (
          <button
            type="button"
            className={styles.searchClear}
            onClick={() => setSearchQuery('')}
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {/* ── Search Results ────────────────────────────────────────────────── */}
      {isSearchActive && (
        <div className={styles.searchResultsSection}>
          {searchLoading && (
            <div className={styles.searchStatus}>
              <div className={styles.spinnerSmall} />
              <span>Searching...</span>
            </div>
          )}
          {!searchLoading && searchEmpty && (
            <p className={styles.searchEmptyText}>No users found for "{searchQuery}"</p>
          )}
          {!searchLoading && searchResults.length > 0 && (
            <div className={styles.contactList}>
              {searchResults.map(u => (
                <ContactRow key={u.id} user={u} onFollow={handleFollow} onUnfollow={handleUnfollow} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Below search: contacts OR fallback, then suggestions ───────── */}
      {!isSearchActive && (
        <>
          {/* Contact sync loading state */}
          {isContactSyncing && (
            <div className={styles.loadingState}>
              <div className={styles.spinner} />
              <p className={styles.loadingText}>
                {contactStatus === 'requesting' && 'Requesting contacts...'}
                {contactStatus === 'hashing' && 'Securing your data...'}
                {contactStatus === 'matching' && 'Finding friends...'}
              </p>
            </div>
          )}

          {/* Contact sync results */}
          {hasContactResults && !isContactSyncing && (
            <div className={styles.contactResultsSection}>
              <h4 className={styles.sectionLabel}>
                {matchedUsers.length > 0
                  ? `${matchedUsers.length} friend${matchedUsers.length !== 1 ? 's' : ''} on Maximus`
                  : 'Invite contacts'}
              </h4>
              {matchedUsers.length > 0 && unmatchedContacts.length > 0 && (
                <div className={styles.tabRow}>
                  <button type="button" className={`${styles.tab} ${contactTab === 'matched' ? styles.tabActive : ''}`}
                    onClick={() => setContactTab('matched')}>On Maximus ({matchedUsers.length})</button>
                  <button type="button" className={`${styles.tab} ${contactTab === 'invite' ? styles.tabActive : ''}`}
                    onClick={() => setContactTab('invite')}>Invite ({unmatchedContacts.length})</button>
                </div>
              )}
              <div className={styles.contactList}>
                {(contactTab === 'matched' || unmatchedContacts.length === 0) &&
                  matchedUsers.map(u => <ContactRow key={u.id} user={u} onFollow={handleFollow} onUnfollow={handleUnfollow} />)}
                {(contactTab === 'invite' || matchedUsers.length === 0) &&
                  unmatchedContacts.map((c, i) => <InviteRow key={c.phoneHash || i} contact={c} onInviteTracked={trackInvite} />)}
              </div>
            </div>
          )}

          {/* Contact sync CTA (when supported and not yet used) */}
          {!hasContactResults && !isContactSyncing && isContactPickerSupported && (
            <button type="button" className={styles.btnSyncContacts} onClick={requestAndSync}>
              <PeopleIcon />
              Sync Contacts
            </button>
          )}

          {/* Invite actions — always visible when contacts not synced */}
          {!hasContactResults && !isContactSyncing && (
            <div className={styles.inviteSection}>
              {!isContactPickerSupported && (
                <p className={styles.contactsLimitedNote}>
                  Contact sync is currently limited in some mobile browsers.
                </p>
              )}
              <div className={styles.inviteActions}>
                <button type="button" className={styles.btnInviteAction} onClick={handleShareInvite}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                  </svg>
                  Send Invite
                </button>
                <button type="button" className={styles.btnCopyLink} onClick={handleCopyInviteLink}>
                  <LinkIcon />
                  {inviteLinkCopied ? 'Copied!' : 'Copy Link'}
                </button>
              </div>
            </div>
          )}

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <div className={styles.suggestionsSection}>
              <h4 className={styles.sectionLabel}>Suggested for you</h4>
              <div className={styles.contactList}>
                {suggestions.map(s => (
                  <ContactRow key={s.id} user={s} onFollow={handleFollow} onUnfollow={handleUnfollow} />
                ))}
              </div>
            </div>
          )}

          {suggestionsLoading && suggestions.length === 0 && !hasContactResults && !isContactSyncing && (
            <div className={styles.searchStatus}>
              <div className={styles.spinnerSmall} />
              <span>Loading suggestions...</span>
            </div>
          )}

          {contactError && (
            <p className={styles.contactErrorNote}>{contactError}</p>
          )}
        </>
      )}

      {/* ── Privacy note ─────────────────────────────────────────────────── */}
      {isContactPickerSupported && (
        <p className={styles.privacyNote}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
          Your contacts are used only to help you find friends on Maximus Sports.
        </p>
      )}

      {/* ── Done / Skip ──────────────────────────────────────────────────── */}
      {showDoneButton && (
        <button type="button" className={styles.btnDone} onClick={onDone}>
          Done
        </button>
      )}
    </div>
  );
}
