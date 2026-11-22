/**
 * FollowPanel — find people, follow back, and get found, in one place.
 *
 * Sits on the Settings page beside the profile. Three jobs:
 *   1. Search by username or name and follow from the results.
 *   2. Show who follows you that you have not followed back.
 *   3. Hand you your own handle and invite link to share.
 * It reuses the search and follow endpoints and the same row as the Friends
 * page, so a follow made here shows up everywhere.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useFriendGraph } from '../../hooks/useFriendGraph';
import { track } from '../../analytics/index';
import ContactRow from './ContactRow';
import styles from './FollowPanel.module.css';

/** "@Dante " → "Dante". People paste handles with the @. */
const cleanHandle = (q) => String(q || '').trim().replace(/^@+/, '');

export default function FollowPanel({ username, onOpenList }) {
  const { user, session } = useAuth();
  const { followUser, unfollowUser, fetchFollowers, socialCounts } = useFriendGraph();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [state, setState] = useState('idle'); // idle | loading | done | error
  const [followBack, setFollowBack] = useState([]);
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  const token = session?.access_token;
  const q = cleanHandle(query);

  // Search as you type.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.length < 2) { setResults([]); setState('idle'); return undefined; }
    setState('loading');
    const ctrl = new AbortController();
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/social/search?q=${encodeURIComponent(q)}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        setResults((data.results || []).slice(0, 6));
        setState('done');
        track('friend_search', { source: 'settings', result_count: (data.results || []).length });
      } catch (err) {
        if (err.name !== 'AbortError') setState('error');
      }
    }, 250);
    return () => { clearTimeout(timer.current); ctrl.abort(); };
  }, [q, token]);

  // People who follow you that you have not followed back.
  useEffect(() => {
    if (!token) return undefined;
    const ctrl = new AbortController();
    fetchFollowers(ctrl.signal)
      .then((rows) => setFollowBack(rows.filter((r) => r.followStatus === 'follower').slice(0, 3)))
      .catch(() => { /* the list is a convenience; the count above still shows */ });
    return () => ctrl.abort();
  }, [fetchFollowers, token, socialCounts.followers]);

  const onFollow = useCallback((id) => followUser(id, { source: 'settings' }), [followUser]);

  const inviteLink = `https://maximussports.ai/join?ref=${user?.id || 'maximus'}`;
  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      track('invite_shared', { method: 'copy_link', source: 'settings' });
      setTimeout(() => setCopied(false), 2500);
    } catch { /* clipboard blocked: the link is still visible to copy by hand */ }
  };

  return (
    <section className={styles.panel} aria-label="Friends">
      <div className={styles.head}>
        <h3 className={styles.title}>Friends</h3>
        <span className={styles.counts}>
          <button type="button" className={styles.count} onClick={() => onOpenList?.('followers')}>
            <b>{socialCounts.followers}</b> {socialCounts.followers === 1 ? 'follower' : 'followers'}
          </button>
          <button type="button" className={styles.count} onClick={() => onOpenList?.('following')}>
            <b>{socialCounts.following}</b> following
          </button>
        </span>
      </div>

      <label className={styles.search}>
        <span className={styles.srOnly}>Find people by username or name</span>
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          placeholder="Find people by @username or name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
        />
      </label>

      <div className={styles.results} aria-live="polite">
        {state === 'loading' && <p className={styles.note}>Searching…</p>}
        {state === 'error' && <p className={styles.note}>Search is not responding. Try again in a moment.</p>}
        {state === 'done' && results.length === 0 && (
          <p className={styles.note}>
            Nobody matches “{q}”. Usernames are 3 to 20 letters, numbers or underscores. If they have not joined yet, send them your invite link below.
          </p>
        )}
        {results.map((r) => <ContactRow key={r.id} user={r} onFollow={onFollow} onUnfollow={unfollowUser} />)}
      </div>

      {state === 'idle' && followBack.length > 0 && (
        <div className={styles.block}>
          <p className={styles.blockLabel}>They follow you</p>
          {followBack.map((r) => <ContactRow key={r.id} user={r} onFollow={onFollow} onUnfollow={unfollowUser} />)}
        </div>
      )}

      <div className={styles.share}>
        <p className={styles.shareText}>
          {username
            ? <>Friends can find you by searching <b>@{username}</b>.</>
            : <>Add a username in Edit profile so friends can find you.</>}
        </p>
        <button type="button" className={styles.copy} onClick={copyInvite}>
          {copied ? 'Link copied' : 'Copy invite link'}
        </button>
      </div>
    </section>
  );
}
