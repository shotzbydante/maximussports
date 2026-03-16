/**
 * ContactDiscovery — layered social acquisition surface.
 *
 * Always shows ALL of these together:
 *   1. Search field (enhanced: partial matching, mobile-friendly)
 *   2. Find Friends card (adapts to platform capabilities)
 *   3. Invite actions (native share sheet on iOS, SMS, copy link)
 *   4. Suggestions / matched users
 *
 * Contact Picker API reality:
 *   - Supported: Chrome 80+ on Android only
 *   - NOT supported: iOS Safari, any iOS browser (WebKit), desktop browsers
 *   - When unsupported, we show a polished fallback — never a dead end
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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

function ShareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

function SmsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}

function UserPlusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4-4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  );
}

function looksLikeEmail(q) {
  return q.includes('@') && q.length > 3;
}

const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

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
  const abortRef = useRef(null);
  const searchInputRef = useRef(null);

  const [contactTab, setContactTab] = useState('matched');
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);

  const inviteLink = `https://maximussports.ai/join?ref=${user?.id || 'maximus'}`;
  const inviteMessage = `Join me on Maximus Sports for AI-powered picks and brackets.\n\n${inviteLink}`;

  useEffect(() => {
    if (!session) return;
    setSuggestionsLoading(true);
    (async () => {
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
    })();
  }, [session]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();
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
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(`/api/social/search?q=${encodeURIComponent(q)}`, {
          headers: { Authorization: `Bearer ${session?.access_token}` },
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results || []);
          setSearchEmpty((data.results || []).length === 0);
        } else {
          console.warn('[search] API returned', res.status);
          setSearchResults([]);
          setSearchEmpty(true);
        }
      } catch (err) {
        if (err?.name === 'AbortError') return;
        console.warn('[search] fetch error:', err?.message);
        setSearchResults([]);
        setSearchEmpty(true);
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [searchQuery, session?.access_token]);

  const handleFollow = useCallback(async (targetId) => {
    const newStatus = await followUser(targetId);
    const update = (list) => list.map(s =>
      s.id === targetId ? { ...s, followStatus: newStatus || 'following' } : s
    );
    setSuggestions(update);
    setSearchResults(update);
    return newStatus;
  }, [followUser]);

  const handleUnfollow = useCallback(async (targetId) => {
    const newStatus = await unfollowUser(targetId);
    const update = (list) => list.map(s =>
      s.id === targetId ? { ...s, followStatus: newStatus || 'none' } : s
    );
    setSuggestions(update);
    setSearchResults(update);
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

  const handleShareInvite = useCallback(async () => {
    if (canNativeShare) {
      try {
        await navigator.share({
          title: 'Join Maximus Sports',
          text: 'Join me on Maximus Sports for AI-powered picks and brackets.',
          url: inviteLink,
        });
        track('invite_shared', { method: 'native_share' });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    window.open(`sms:?&body=${encodeURIComponent(inviteMessage)}`, '_blank');
    track('invite_shared', { method: 'sms' });
  }, [inviteLink, inviteMessage]);

  const handleSendSms = useCallback(() => {
    window.open(`sms:?&body=${encodeURIComponent(inviteMessage)}`, '_blank');
    track('invite_sms_sent', {});
  }, [inviteMessage]);

  const isSearchActive = searchQuery.trim().length >= 2;
  const hasContactResults = contactStatus === 'done' && (matchedUsers.length > 0 || unmatchedContacts.length > 0);
  const isContactSyncing = contactStatus === 'requesting' || contactStatus === 'hashing' || contactStatus === 'matching';

  const searchHint = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return null;
    if (looksLikeEmail(q) && !q.includes('.')) return 'Enter the full email address to search';
    return null;
  }, [searchQuery]);

  return (
    <div className={`${styles.discoveryContainer} ${compact ? styles.compact : ''}`}>

      {/* ── 1. Search Field ───────────────────────────────────────────── */}
      <div className={styles.searchWrap}>
        <SearchIcon />
        <input
          ref={searchInputRef}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          className={styles.searchInput}
          placeholder="Search by username or name"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
        />
        {searchQuery && (
          <button type="button" className={styles.searchClear} onClick={() => { setSearchQuery(''); searchInputRef.current?.focus(); }} aria-label="Clear search">
            ×
          </button>
        )}
      </div>

      {searchHint && (
        <p className={styles.searchHint}>{searchHint}</p>
      )}

      {/* ── Search Results ─────────────────────────────────────────── */}
      {isSearchActive && (
        <div className={styles.searchResultsSection}>
          {searchLoading && (
            <div className={styles.searchStatus}>
              <div className={styles.spinnerSmall} />
              <span>Searching...</span>
            </div>
          )}

          {!searchLoading && searchResults.length > 0 && (
            <div className={styles.contactList}>
              {searchResults.map(u => (
                <ContactRow key={u.id} user={u} onFollow={handleFollow} onUnfollow={handleUnfollow} />
              ))}
            </div>
          )}

          {!searchLoading && searchEmpty && (
            <div className={styles.searchEmptyState}>
              <p className={styles.searchEmptyTitle}>
                No users found for &ldquo;{searchQuery.trim()}&rdquo;
              </p>
              <p className={styles.searchEmptyHint}>
                {looksLikeEmail(searchQuery.trim())
                  ? 'They may not have an account yet. Send them an invite!'
                  : 'Try a different username or name'}
              </p>
              <button
                type="button"
                className={styles.searchEmptyInviteBtn}
                onClick={handleShareInvite}
              >
                {canNativeShare ? <ShareIcon /> : <SmsIcon />}
                Invite to Maximus Sports
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Default content (when NOT searching) ──────────────────── */}
      {!isSearchActive && (
        <>
          {/* ── 2. Find Friends Card ──────────────────────────────── */}
          {!hasContactResults && !isContactSyncing && (
            <>
              {isContactPickerSupported ? (
                <button
                  type="button"
                  className={styles.syncCard}
                  onClick={() => requestAndSync()}
                >
                  <div className={styles.syncCardIcon}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4-4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M22 21v-2a4 4 0 00-3-3.87" />
                      <path d="M16 3.13a4 4 0 010 7.75" />
                    </svg>
                  </div>
                  <div className={styles.syncCardBody}>
                    <span className={styles.syncCardTitle}>Sync Contacts</span>
                    <span className={styles.syncCardDesc}>Tap to find friends already on Maximus.</span>
                  </div>
                  <span className={styles.syncCardArrow} aria-hidden>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </span>
                </button>
              ) : (
                <div className={styles.findFriendsCard}>
                  <div className={styles.findFriendsHeader}>
                    <div className={styles.findFriendsIcon}>
                      <UserPlusIcon />
                    </div>
                    <div>
                      <span className={styles.findFriendsTitle}>Find Friends</span>
                      <span className={styles.findFriendsDesc}>Search by username or invite friends to join</span>
                    </div>
                  </div>
                  <div className={styles.findFriendsActions}>
                    <button
                      type="button"
                      className={styles.findFriendBtn}
                      onClick={() => searchInputRef.current?.focus()}
                    >
                      <SearchIcon />
                      Search Users
                    </button>
                    <button
                      type="button"
                      className={styles.findFriendBtn}
                      onClick={handleShareInvite}
                    >
                      {canNativeShare ? <ShareIcon /> : <SmsIcon />}
                      {canNativeShare ? 'Share Invite' : 'Send Invite'}
                    </button>
                    <button
                      type="button"
                      className={styles.findFriendBtn}
                      onClick={handleCopyInviteLink}
                    >
                      <LinkIcon />
                      {inviteLinkCopied ? 'Copied!' : 'Copy Invite Link'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Contact sync loading */}
          {isContactSyncing && (
            <div className={styles.syncCard}>
              <div className={styles.syncCardIcon}>
                <div className={styles.spinnerSmall} />
              </div>
              <div className={styles.syncCardBody}>
                <span className={styles.syncCardTitle}>
                  {contactStatus === 'requesting' && 'Requesting contacts...'}
                  {contactStatus === 'hashing' && 'Securing your data...'}
                  {contactStatus === 'matching' && 'Finding friends...'}
                </span>
              </div>
            </div>
          )}

          {/* Contact sync results */}
          {hasContactResults && (
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

          {/* ── 3. Invite Actions — always visible ───────────────── */}
          <div className={styles.inviteActions}>
            {canNativeShare ? (
              <button type="button" className={styles.btnInviteAction} onClick={handleShareInvite}>
                <ShareIcon />
                Share Invite
              </button>
            ) : (
              <button type="button" className={styles.btnInviteAction} onClick={handleSendSms}>
                <SmsIcon />
                Send Invite
              </button>
            )}
            <button type="button" className={styles.btnCopyLink} onClick={handleCopyInviteLink}>
              <LinkIcon />
              {inviteLinkCopied ? 'Copied!' : 'Copy Link'}
            </button>
          </div>

          {contactError && <p className={styles.contactErrorNote}>{contactError}</p>}
        </>
      )}

      {/* ── Suggested for you (always visible) ────────────────────── */}
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

      {suggestionsLoading && suggestions.length === 0 && !isSearchActive && (
        <div className={styles.searchStatus}>
          <div className={styles.spinnerSmall} />
          <span>Loading suggestions...</span>
        </div>
      )}

      {/* ── Privacy note ─────────────────────────────────────────── */}
      <p className={styles.privacyNote}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
        Your contacts are used only to help you find friends on Maximus Sports.
      </p>

      {/* ── Done / Skip ──────────────────────────────────────────── */}
      {showDoneButton && (
        <button type="button" className={styles.btnDone} onClick={onDone}>
          Done
        </button>
      )}
    </div>
  );
}
