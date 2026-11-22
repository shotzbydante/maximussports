import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getSupabase } from '../lib/supabaseClient';
import TeamLogo from '../components/shared/TeamLogo';
import { addPinnedTeam, removePinnedTeam, setPinnedTeams } from '../utils/pinnedTeams';
import { addPinnedForSport, removePinnedForSport } from '../hooks/usePinnedTeams';
import { notifyPinnedChanged, onPinnedChanged, slugArraysEqual } from '../utils/pinnedSync';
import { track, identify, setUserProperties, analyticsReset, flush as flushAnalytics } from '../analytics/index';
import {
  identifyUser,
  trackOnboardingCompleted,
  trackSignupViewed,
  trackSignupStarted,
} from '../lib/analytics/posthog';
import styles from './Settings.module.css';
import { showToast } from '../components/common/Toast';
import { ADMIN_EMAIL, isAdminUser } from '../config/admin';
import { effectivePlanTier, getEntitlements, PRO_PRICE_LABEL } from '../lib/entitlements';
import { invalidatePlanCache, markSyncing } from '../hooks/usePlan';
import { invalidateProfileCache } from '../hooks/useUserProfile';
import { useTeamPin } from '../hooks/useTeamPin';
import { isEmbeddedBrowser, getEmbeddedSource, getPlatform } from '../utils/embeddedBrowser';
import EmbeddedBrowserModal from '../components/auth/EmbeddedBrowserModal';
import MaximusAvatar from '../components/profile/MaximusAvatar';
import AvatarStudio, { PlayerCard } from '../components/profile/AvatarStudio';
import { DEFAULT_AVATAR, normalizeAvatar, toAvatarConfig } from '../brand/avatar';
import { VerifiedBadge } from '../components/profile/ProfileAvatar';
import EmailChoices from '../components/settings/EmailChoices';
import { SIGNUP_PREFS, toggleOption } from '../features/account/emailOptions';
import { FOLLOW_SPORTS, teamBySlug, sportOfSlug, splitBySport } from '../utils/teamSports';
import ContactDiscovery from '../components/social/ContactDiscovery';
import FollowPanel from '../components/social/FollowPanel';

const SocialListDropdown = lazy(() => import('../components/profile/SocialListDropdown'));

/* ─── App-wide localStorage / sessionStorage keys ──────────────────────────
 * localStorage keys written by this app (cleared on "Sign out and clear device"):
 *   maximus-pinned-teams       — src/utils/pinnedTeams.js: pinned slugs array
 *   pinnedTeamsHideExample     — src/components/home/PinnedTeamsSection.jsx
 *   homeInsightCollapsed       — src/pages/Home.jsx: section collapse state
 *   homeAtsCollapsed           — src/pages/Home.jsx: section collapse state
 *   homeBubbleCollapsed        — src/pages/Home.jsx: section collapse state
 *   oddsBriefing:last          — src/pages/Insights.jsx: cached AI briefing
 * sessionStorage keys — cleared via sessionStorage.clear():
 *   mx_auth_success_fired      — Settings.jsx: one-time auth event dedup
 *   mx_session_id              — analytics/index.js + ShareButton.jsx: session ID
 *   mx_session_start           — analytics/index.js: one-time session_start event
 * ─────────────────────────────────────────────────────────────────────────── */
const LS_KEYS_TO_CLEAR = [
  'maximus-pinned-teams',
  'pinnedTeamsHideExample',
  'homeInsightCollapsed',
  'homeAtsCollapsed',
  'homeBubbleCollapsed',
  'oddsBriefing:last',
];

/* ─── Supabase error helpers ─────────────────────────────────────────────── */

/** Returns true for schema-cache / missing-table / missing-column Supabase errors.
 *  Use to show a friendly message instead of raw technical text. */
function isSchemaMissingError(err) {
  if (!err) return false;
  const msg = String(err.message || err.details || err.hint || '').toLowerCase();
  return (
    msg.includes('schema cache') ||
    msg.includes('could not find') ||
    msg.includes('does not exist') ||
    msg.includes('relation') ||
    msg.includes('column') ||
    err.code === 'PGRST116' ||
    err.code === 'PGRST204' ||
    err.code === '42P01' ||
    err.code === '42703'
  );
}

function friendlyDbError(err) {
  if (!err) return 'Something went wrong. Please try again.';
  if (isSchemaMissingError(err)) return 'Service temporarily unavailable. Please try again shortly.';
  if (err.code === '23505') return 'That username is already taken.';
  return err.message || 'Something went wrong. Please try again.';
}

/** The profile's avatar as { sport, skin, tint, number }, whatever generation stored it. */
function profileAvatar(profile) {
  const number = profile?.favorite_number != null ? String(profile.favorite_number) : '';
  return normalizeAvatar(profile?.preferences?.robotConfig, number);
}

/* ─── Icons ──────────────────────────────────────────────────────────────── */
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
    <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
  </svg>
);

const GoogleIconSmall = () => (
  <svg width="14" height="14" viewBox="0 0 18 18" fill="none" aria-hidden>
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
    <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
    <path d="M2 7l3.5 3.5L12 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const SpinnerIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className={styles.spinner}>
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="10" strokeLinecap="round"/>
  </svg>
);

/* ─── Constants ──────────────────────────────────────────────────────────── */
const WIZARD_STEPS = 3; // Teams → Preferences → Profile (the 3 main visible wizard steps)
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

/* ─── Email choices ──────────────────────────────────────────────────────────
 * What people see is in src/features/account/emailOptions.js: five choices,
 * each owning one or more of the server's preference keys. DEFAULT_PREFS is
 * what an account with nothing stored is treated as, and mirrors
 * api/_lib/emailDefaults.js. A new signup starts from SIGNUP_PREFS instead. */
const DEFAULT_PREFS = {
  global_briefing:     true,
  nfl_picks:           true,
  mlb_briefing:        true,
  mlb_team_digest:     false,
  mlb_picks:           false,
  ncaam_briefing:      false,
  ncaam_team_digest:   false,
  ncaam_picks:         false,
};

/** Stored preferences as the server will read them (see resolvePreferences on the server). */
function withEmailDefaults(stored) {
  const merged = { ...DEFAULT_PREFS, ...(stored || {}) };
  if (typeof stored?.nfl_picks !== 'boolean') merged.nfl_picks = merged.global_briefing === true;
  return merged;
}

const TEST_EMAIL_TYPES = [
  { type: 'global_briefing',   label: 'Send Daily Global Intel Briefing (TEST)', section: 'global' },
  { type: 'nfl_picks',         label: 'Send NFL Picks (TEST)',                    section: 'nfl' },
  { type: 'ncaam_briefing',    label: 'Send Daily NCAAM Briefing (TEST)',        section: 'ncaam' },
  { type: 'ncaam_team_digest', label: 'Send Daily NCAAM Team Digest (TEST)',     section: 'ncaam' },
  { type: 'ncaam_picks',       label: "Send Daily NCAAM Maximus's Picks (TEST)", section: 'ncaam' },
  { type: 'mlb_briefing',      label: 'Send Daily MLB Briefing (TEST)',          section: 'mlb' },
  { type: 'mlb_team_digest',   label: 'Send Daily MLB Team Digest (TEST)',       section: 'mlb' },
  { type: 'mlb_picks',         label: "Send Daily MLB Maximus's Picks (TEST)",   section: 'mlb' },
];


/* ─── Confirm modal ──────────────────────────────────────────────────────── */
function ConfirmModal({ title, message, bullets, subtext, confirmLabel = 'Confirm', danger = false, onConfirm, onCancel, loading = false }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !loading) onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel, loading]);

  return (
    <div className={styles.modalOverlay} onClick={() => { if (!loading) onCancel(); }} role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
      <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
        <h3 id="confirm-modal-title" className={styles.modalTitle}>{title}</h3>
        <p className={styles.modalMessage}>{message}</p>
        {bullets && bullets.length > 0 && (
          <ul className={styles.modalBullets}>
            {bullets.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        )}
        {subtext && <p className={styles.modalSubtext}>{subtext}</p>}
        <div className={styles.modalActions}>
          <button type="button" className={styles.btnOutline} onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button
            type="button"
            className={danger ? styles.btnDanger : styles.btnPrimary}
            onClick={onConfirm}
            disabled={loading}
            autoFocus
          >
            {loading ? <><SpinnerIcon /> Working…</> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Progress bar ────────────────────────────────────────────────────────── */
function ProgressBar({ step }) {
  // Only show progress for the 3 main wizard steps (1=Teams, 2=Preferences, 3=Profile)
  const clampedStep = Math.max(1, Math.min(step, WIZARD_STEPS));
  return (
    <div className={styles.progress}>
      {Array.from({ length: WIZARD_STEPS }).map((_, i) => (
        <div
          key={i}
          className={`${styles.progressDot} ${i < clampedStep ? styles.progressDotDone : ''} ${i === clampedStep - 1 ? styles.progressDotActive : ''}`}
        />
      ))}
      <span className={styles.progressLabel}>Step {clampedStep} of {WIZARD_STEPS}</span>
    </div>
  );
}

/* ─── Step 0: Create Password (optional) ─────────────────────────────────── */
function StepPassword({ onNext, onSkip }) {
  const [password, setPassword]     = useState('');
  const [confirm, setConfirm]       = useState('');
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => { track('onboarding_step_view', { step: 'password' }); }, []);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setSaving(true);
    try {
      const sb = getSupabase();
      if (!sb) throw new Error('Auth service not available.');
      const { error: updateErr } = await sb.auth.updateUser({ password });
      if (updateErr) throw updateErr;
      track('onboarding_password_created', {});
      onNext();
    } catch (err) {
      setError(err.message || 'Could not set password. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.step}>
      <div className={styles.stepIconWrap}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <h2 className={styles.stepTitle}>Secure your account</h2>
      <p className={styles.stepSubtitle}>
        Add a password so you can sign in easily on any device. You can always use a magic link instead.
      </p>

      <form className={styles.passwordForm} onSubmit={handleSubmit} noValidate>
        <div className={styles.inputGroup}>
          <label className={styles.inputLabel}>Password</label>
          <div className={styles.passwordInputWrap}>
            <input
              type={showPassword ? 'text' : 'password'}
              className={styles.input}
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              autoComplete="new-password"
              minLength={8}
            />
            <button
              type="button"
              className={styles.passwordToggle}
              onClick={() => setShowPassword(v => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              tabIndex={-1}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <div className={styles.inputGroup}>
          <label className={styles.inputLabel}>Confirm password</label>
          <input
            type={showPassword ? 'text' : 'password'}
            className={styles.input}
            placeholder="Re-enter password"
            value={confirm}
            onChange={(e) => { setConfirm(e.target.value); setError(''); }}
            autoComplete="new-password"
          />
        </div>

        {error && <div className={styles.errorMsg}>{error}</div>}

        <button type="submit" className={styles.btnPrimary} disabled={saving || !password}>
          {saving ? <><SpinnerIcon /> Setting password…</> : 'Set password & continue'}
        </button>
      </form>

      <button type="button" className={styles.skipLink} onClick={onSkip}>
        Skip for now
      </button>
    </div>
  );
}

/* ─── Step 1: Favorite Teams ─────────────────────────────────────────────── */
function TeamMark({ team, size = 26 }) {
  if (team.record) return <TeamLogo team={team.record} size={size} />;
  if (team.logo) return <img src={team.logo} alt="" width={size} height={size} style={{ objectFit: 'contain' }} loading="lazy" />;
  return <span className={styles.teamMarkFallback} style={{ width: size, height: size }}>{team.abbrev}</span>;
}

function StepTeams({ onNext, initialSelected = [] }) {
  const [query, setQuery]       = useState('');
  const [selected, setSelected] = useState(initialSelected);
  const [sportTab, setSportTab] = useState(FOLLOW_SPORTS[0].id); // football first
  const [error, setError]       = useState('');

  useEffect(() => { track('onboarding_step_view', { step: 1 }); }, []);

  // Free-tier cap for onboarding — new users are always free at this step.
  // This is enforced again server-side via /api/teams/pin-set.
  const ONBOARDING_FREE_LIMIT = 3;

  const sport = FOLLOW_SPORTS.find((sp) => sp.id === sportTab);
  const q = query.trim().toLowerCase();
  const teams = q
    ? sport.teams.filter((t) => t.name.toLowerCase().includes(q) || t.group.toLowerCase().includes(q) || (t.abbrev || '').toLowerCase().includes(q))
    : sport.teams;

  const toggleTeam = (slug) => {
    setError('');
    setSelected((prev) => {
      if (prev.includes(slug)) return prev.filter((x) => x !== slug);
      if (prev.length >= ONBOARDING_FREE_LIMIT) {
        setError(`The free plan follows up to ${ONBOARDING_FREE_LIMIT} teams. Remove one to swap, or upgrade later for more.`);
        return prev;
      }
      return [...prev, slug];
    });
  };

  const handleNext = () => {
    if (selected.length === 0) { setError('Pick at least one team to continue.'); return; }
    track('onboarding_step_submit', {
      step: 1, success: true, primary_team: selected[0], team_count: selected.length,
      sports: [...new Set(selected.map(sportOfSlug))].join(','),
    });
    onNext(selected);
  };

  const canContinue = selected.length > 0;
  const chosen = selected.map(teamBySlug).filter(Boolean);
  const left = ONBOARDING_FREE_LIMIT - selected.length;

  return (
    <div className={styles.step}>
      <h2 className={styles.stepTitle}>Pick your teams</h2>
      <p className={styles.stepSubtitle}>
        Follow up to {ONBOARDING_FREE_LIMIT} teams, from any sport. Your first pick is your primary team, and it shapes your home page.
      </p>

      <div className={styles.sportTabs} role="tablist" aria-label="Sport">
        {FOLLOW_SPORTS.map((sp) => {
          const count = selected.filter((slug) => sportOfSlug(slug) === sp.id).length;
          return (
            <button
              key={sp.id} type="button" role="tab" aria-selected={sportTab === sp.id}
              className={`${styles.sportTab} ${sportTab === sp.id ? styles.sportTabActive : ''}`}
              onClick={() => { setSportTab(sp.id); setQuery(''); }}
            >
              {sp.label}{count > 0 && <span className={styles.sportTabCount}>{count}</span>}
            </button>
          );
        })}
      </div>

      {chosen.length > 0 && (
        <ul className={styles.chosenRow} aria-label="Teams you picked">
          {chosen.map((t, i) => (
            <li key={t.slug} className={`${styles.chosenChip} ${i === 0 ? styles.chosenChipPrimary : ''}`}>
              <TeamMark team={t} size={18} />
              <span>{t.name}</span>
              {i === 0 && <span className={styles.chosenPrimary}>Primary</span>}
              <button type="button" className={styles.chosenRemove} onClick={() => toggleTeam(t.slug)} aria-label={`Remove ${t.name}`}>×</button>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.teamFilters}>
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon} aria-hidden>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </span>
          <input
            className={styles.searchInput}
            type="search"
            placeholder={sport.search}
            aria-label={sport.search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.teamPickList}>
        {teams.map((team, i) => {
          const idx        = selected.indexOf(team.slug);
          const isSelected = idx !== -1;
          const isPrimary  = idx === 0;
          const newGroup   = !q && sportTab !== 'ncaam' && (i === 0 || teams[i - 1].group !== team.group);
          return (
            <div key={team.slug}>
              {newGroup && <div className={styles.teamPickGroup}>{team.group}</div>}
              <button
                type="button"
                aria-pressed={isSelected}
                className={`${styles.teamPickRow} ${isSelected ? styles.teamPickRowSelected : ''} ${isPrimary ? styles.teamPickRowPrimary : ''}`}
                onClick={() => toggleTeam(team.slug)}
              >
                <span className={styles.teamPickLogo}><TeamMark team={team} /></span>
                <span className={styles.teamPickInfo}>
                  <span className={styles.teamPickName}>{team.name}</span>
                  {(q || sportTab === 'ncaam') && <span className={styles.teamPickConf}>{team.group}</span>}
                </span>
                <span className={styles.teamPickCheck}>
                  {isSelected
                    ? isPrimary ? <span className={styles.primaryBadge}>Primary</span> : <CheckIcon />
                    : <span className={styles.teamPickAdd}>+</span>}
                </span>
              </button>
            </div>
          );
        })}
        {teams.length === 0 && (
          <div className={styles.emptyState}>
            <p className={styles.emptyStateTitle}>No {sport.label} team matches “{query}”</p>
            <p className={styles.emptyStateSub}>Check the spelling, or look in another sport above.</p>
          </div>
        )}
      </div>

      <div className={styles.teamPickFooter}>
        <p className={canContinue ? styles.selectionHint : styles.selectionRequired}>
          {canContinue
            ? (left > 0 ? `${selected.length} picked. You can add ${left} more.` : `${selected.length} picked. That is the free plan’s limit.`)
            : 'Pick at least one team to continue.'}
        </p>

        {error && <p className={styles.errorMsg} role="alert">{error}</p>}

        <button
          className={`${styles.btnPrimary} ${!canContinue ? styles.btnDisabled : ''}`}
          onClick={handleNext}
          disabled={!canContinue}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

/* ─── Step 2: Username + Jersey + Robot Customization ───────────────────── */
function StepProfile({ onNext, defaultName = '', userId, primarySport }) {
  const [username, setUsername]           = useState(() => {
    const base = defaultName.toLowerCase().replace(/[^a-z0-9_]/g, '');
    return base.slice(0, 20);
  });
  // Start the avatar in the sport of the team they picked first.
  const [avatar, setAvatar] = useState({
    sport: { nfl: 'football', ncaam: 'basketball', mlb: 'baseball' }[primarySport] || DEFAULT_AVATAR.mascotType,
    skin: DEFAULT_AVATAR.robotColor,
    number: '',
    name: defaultName.slice(0, 18),
  });
  const [usernameStatus, setUsernameStatus] = useState('idle');
  const [suggestions, setSuggestions]     = useState([]);
  const [error, setError]                 = useState('');
  const debounceRef                       = useRef(null);

  useEffect(() => { track('onboarding_step_view', { step: 3 }); }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!username || !USERNAME_RE.test(username)) {
      setUsernameStatus('idle'); setSuggestions([]); return;
    }
    setUsernameStatus('checking');
    debounceRef.current = setTimeout(async () => {
      try {
        const sb = getSupabase();
        if (!sb) { setUsernameStatus('available'); return; }
        const { data } = await sb.from('profiles').select('id').eq('username', username).maybeSingle();
        if (data && data.id !== userId) {
          setUsernameStatus('taken');
          setSuggestions([`${username}1`, `${username}23`, `${username}_fan`]);
        } else {
          setUsernameStatus('available'); setSuggestions([]);
        }
      } catch { setUsernameStatus('idle'); }
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [username, userId]);

  const handleUsernameChange = (e) => {
    setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20));
    setError('');
  };

  const finish = (name) => ({
    username: name,
    displayName: avatar.name.trim() || name,
    favoriteNumber: avatar.number !== '' ? avatar.number : null,
    robotConfig: toAvatarConfig(avatar),
  });

  const handleNext = () => {
    if (!username.trim()) { setError('Choose a username. It is how friends find you.'); return; }
    if (!USERNAME_RE.test(username)) { setError('A username is 3 to 20 letters, numbers or underscores.'); return; }
    if (usernameStatus === 'taken') { setError('That username is taken. Pick another, or tap a suggestion.'); return; }
    if (usernameStatus === 'checking') { setError('Still checking that username. Try again in a second.'); return; }
    track('onboarding_step_submit', { step: 3, success: true, avatar_sport: avatar.sport, avatar_has_number: avatar.number !== '' });
    onNext(finish(username.trim()));
  };

  const hint = (() => {
    if (!username || !USERNAME_RE.test(username)) {
      if (username && username.length < 3) return { type: 'warn', text: `${3 - username.length} more character${3 - username.length === 1 ? '' : 's'} needed` };
      return null;
    }
    if (usernameStatus === 'checking') return { type: 'info', text: 'Checking availability…' };
    if (usernameStatus === 'available') return { type: 'ok', text: '@' + username + ' is available' };
    if (usernameStatus === 'taken') return { type: 'err', text: 'Username taken' };
    return null;
  })();

  return (
    <div className={styles.step}>
      <h2 className={styles.stepTitle}>Build your Maximus</h2>
      <p className={styles.stepSubtitle}>This is you on Maximus Sports: on your profile, next to your picks, and when friends follow you.</p>

      <AvatarStudio value={avatar} onChange={(next) => { setAvatar(next); setError(''); }} username={USERNAME_RE.test(username) ? username : ''} />

      <div className={`${styles.fieldGroup} ${styles.usernameField}`}>
        <label className={styles.label} htmlFor="username">Username</label>
        <div className={styles.inputWrap}>
          <input
            id="username"
            className={`${styles.input} ${usernameStatus === 'taken' ? styles.inputError : ''} ${usernameStatus === 'available' ? styles.inputOk : ''}`}
            type="text" placeholder="e.g. gridiron_dan" value={username}
            onChange={handleUsernameChange} autoComplete="off"
            autoCapitalize="none" spellCheck={false}
          />
          {usernameStatus === 'checking' && <span className={styles.inputSpinner}><SpinnerIcon /></span>}
          {usernameStatus === 'available' && <span className={styles.inputCheck}>✓</span>}
        </div>
        {hint
          ? <span className={`${styles.fieldHint} ${styles[`hint_${hint.type}`]}`}>{hint.text}</span>
          : <span className={styles.fieldHint}>How friends find and follow you. Letters, numbers and underscores.</span>}
        {usernameStatus === 'taken' && suggestions.length > 0 && (
          <div className={styles.suggestions}>
            <span className={styles.suggestionLabel}>Try one of these:</span>
            {suggestions.map((sg) => (
              <button key={sg} type="button" className={styles.suggestionChip} onClick={() => { setUsername(sg); setError(''); }}>
                {sg}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className={styles.errorMsg} role="alert">{error}</p>}

      <button className={styles.btnPrimary} onClick={handleNext} disabled={usernameStatus === 'checking'}>
        Finish setup
      </button>
      <button type="button" className={styles.btnSkip} onClick={() => onNext({
        ...finish(USERNAME_RE.test(username) && usernameStatus !== 'taken' ? username : `maximus_${Math.random().toString(36).slice(2, 7)}`),
        favoriteNumber: null,
        robotConfig: { ...DEFAULT_AVATAR },
      })}>
        Skip for now
      </button>
    </div>
  );
}

/* ─── Step 3: Subscriptions ──────────────────────────────────────────────── */
function StepPreferences({ onNext, loading, teamSlugs = [] }) {
  // Someone who just followed baseball or college teams starts with team emails on.
  const [prefs, setPrefs] = useState(() => {
    const by = splitBySport(teamSlugs);
    return { ...SIGNUP_PREFS, mlb_team_digest: by.mlb.length > 0, ncaam_team_digest: by.ncaam.length > 0 };
  });

  useEffect(() => { track('onboarding_step_view', { step: 2 }); }, []);

  return (
    <div className={styles.step}>
      <h2 className={styles.stepTitle}>Choose your emails</h2>
      <p className={styles.stepSubtitle}>Each one says what it is and when it arrives. Switch any of them off here or later in Settings.</p>

      <EmailChoices prefs={prefs} onToggle={(option) => setPrefs((p) => toggleOption(p, option))} />

      <button className={styles.btnPrimary} onClick={() => onNext(prefs)} disabled={loading}>
        {loading ? <><SpinnerIcon /> Saving…</> : 'Continue'}
      </button>
    </div>
  );
}

/* ─── Step 4: Done ───────────────────────────────────────────────────────── */
function StepDone({ profileData }) {
  const navigate = useNavigate();
  useEffect(() => { track('onboarding_complete', {}); }, []);
  const a = normalizeAvatar(profileData?.robotConfig);
  const emails = profileData?.prefs || {};
  const enter = (to) => {
    try { localStorage.setItem('mx_onboarding_completed', 'true'); } catch { /* ignore */ }
    navigate(to);
  };
  return (
    <div className={`${styles.step} ${styles.stepCenter}`}>
      <div className={styles.doneCard}>
        <PlayerCard sport={a.sport} skin={a.skin} number={a.number} name={profileData?.displayName} username={profileData?.username} size="sm" />
      </div>
      <h2 className={styles.stepTitle}>You’re in{profileData?.displayName ? `, ${profileData.displayName}` : ''}</h2>
      <p className={styles.stepSubtitle}>Your teams are on your home page and this week’s NFL board is open.</p>
      {(emails.global_briefing || emails.nfl_picks) && (
        <p className={styles.doneDigestNote}>
          {emails.global_briefing ? 'The Daily Brief arrives every morning. ' : ''}
          {emails.nfl_picks ? 'NFL Picks arrive Thursday afternoon and Sunday morning.' : ''}
        </p>
      )}
      <button className={styles.btnPrimary} onClick={() => enter('/nfl')}>
        See this week’s NFL picks
      </button>
      <button type="button" className={styles.btnSkip} onClick={() => enter('/')}>
        Go to my home page
      </button>
    </div>
  );
}

/* ─── Onboarding Wizard ──────────────────────────────────────────────────── */
function OnboardingWizard({ user, onComplete }) {
  // Skip password step for OAuth users (Google) — they already have auth
  const isOAuth = !!user?.app_metadata?.provider && user.app_metadata.provider !== 'email';
  const [step, setStep]               = useState(isOAuth ? 1 : 0);
  const [teamSlugs, setTeamSlugs]     = useState([]);
  const [profileData, setProfileData] = useState({});
  const [saving, setSaving]           = useState(false);
  const [wizardError, setWizardError] = useState('');

  const defaultName = user?.user_metadata?.full_name?.split(' ')[0] || '';
  const wizardRef = useRef(null);

  // Scroll to top of wizard on every step change
  useEffect(() => {
    wizardRef.current?.scrollTo?.({ top: 0, behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  const handleTeams = (slugs) => {
    setTeamSlugs(slugs);
    // Write to the unified local store, each team under its own sport
    slugs.forEach(slug => {
      try {
        const sport = sportOfSlug(slug);
        if (sport === 'ncaam') addPinnedTeam(slug); // legacy-compatible helper, routes to ncaam
        else if (sport) addPinnedForSport(sport, slug);
      } catch { /* ignore */ }
    });
    setStep(2); // → Preferences
  };

  const handleProfileComplete = useCallback(async (allData) => {
    setSaving(true);
    setWizardError('');
    try {
      const sb = getSupabase();
      if (!sb) throw new Error('Auth service is not configured.');
      const userId = user.id;

      const avatarConfig = allData.robotConfig || { ...DEFAULT_AVATAR };

      // Merge saved preferences from step 2 with avatar config
      const savedPrefs = allData.prefs || profileData.prefs || { ...SIGNUP_PREFS };
      const mergedPrefs = { ...savedPrefs, robotConfig: avatarConfig };

      const coreRow = {
        id:               userId,
        username:         allData.username,
        display_name:     allData.displayName || allData.username,
        favorite_number:  allData.favoriteNumber,
        preferences:      mergedPrefs,
        updated_at:       new Date().toISOString(),
      };

      const { error: coreErr } = await sb.from('profiles').upsert(coreRow, { onConflict: 'id' });
      if (coreErr) {
        if (coreErr.code === '23505') throw new Error('That username was just taken. Go back and choose another.');
        throw new Error(friendlyDbError(coreErr));
      }

      // SERVER-VALIDATED full-set persistence via /api/teams/pin-set.
      // This enforces the free-tier cap of 3 teams — the server rejects
      // any set exceeding the limit with 403 regardless of grace window.
      const { data: { session } } = await sb.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Session expired. Please sign in again.');

      const pinSetRes = await fetch('/api/teams/pin-set', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ slugs: teamSlugs, source: 'onboarding' }),
      });
      const pinSetData = await pinSetRes.json().catch(() => ({}));
      if (!pinSetRes.ok || !pinSetData.ok) {
        throw new Error(pinSetData.error || 'Failed to save teams. Please try again.');
      }

      // Re-read validated backend state for person properties — NEVER trust
      // the optimistic client list for analytics truth.
      const { data: validatedRows } = await sb.from('user_teams')
        .select('team_slug')
        .eq('user_id', userId);
      const validatedSlugs = (validatedRows || []).map(r => r.team_slug).filter(Boolean);

      identifyUser(user, { username: allData.username, plan_tier: pinSetData.plan_tier || 'free' }, validatedSlugs);
      track('onboarding_step_submit', {
        step: 3,
        success: true,
        validated_team_count: pinSetData.teamCount,
        attempted_count: teamSlugs.length,
      });

      setStep(4); // Find Friends (optional)
      if (onComplete) onComplete({ teamSlugs });
    } catch (err) {
      setWizardError(err.message || 'Something went wrong. Please try again.');
      track('onboarding_step_submit', { step: 3, success: false, error_code: 'save_failed' });
    } finally {
      setSaving(false);
    }
  }, [user, profileData, teamSlugs, onComplete]);

  if (step === 5) return <StepDone profileData={profileData} />;

  return (
    <div className={styles.wizardCard} ref={wizardRef}>
      {step >= 1 && step <= 3 && <ProgressBar step={step} />}
      {wizardError && <div className={styles.wizardError}>{wizardError}</div>}
      {step === 0 && <StepPassword onNext={() => setStep(1)} onSkip={() => setStep(1)} />}
      {step === 1 && <StepTeams onNext={handleTeams} />}
      {step === 2 && <StepPreferences teamSlugs={teamSlugs} onNext={(prefs) => { setProfileData(prev => ({ ...prev, prefs })); setStep(3); }} loading={false} />}
      {step === 3 && <StepProfile onNext={(d) => { setProfileData(prev => ({ ...prev, ...d })); handleProfileComplete({ ...profileData, ...d }); }} defaultName={defaultName} userId={user.id} primarySport={sportOfSlug(teamSlugs[0])} />}
      {step === 3 && saving && <p className={styles.savingStatus} role="status">Saving your profile…</p>}
      {step === 4 && (
        <div className={styles.step}>
          <ContactDiscovery onDone={() => setStep(5)} showDoneButton={true} compact />
        </div>
      )}
    </div>
  );
}

/* ─── Edit Profile Form (inline, no wizard re-entry) ─────────────────────── */
function EditProfileForm({ user, profile, onSave, onCancel }) {
  const [username, setUsername]           = useState(profile?.username || '');
  const [avatar, setAvatar]               = useState(() => {
    const a = profileAvatar(profile);
    const name = profile?.display_name && profile.display_name !== profile?.username ? profile.display_name : '';
    return { sport: a.sport, skin: a.skin, number: a.number, name: name.slice(0, 18) };
  });
  const [usernameStatus, setUsernameStatus] = useState('idle');
  const [suggestions, setSuggestions]     = useState([]);
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState('');
  const debounceRef                       = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const orig = profile?.username || '';
    if (!username || !USERNAME_RE.test(username)) {
      setUsernameStatus('idle'); setSuggestions([]); return;
    }
    if (username === orig) { setUsernameStatus('available'); return; }
    setUsernameStatus('checking');
    debounceRef.current = setTimeout(async () => {
      try {
        const sb = getSupabase();
        if (!sb) { setUsernameStatus('available'); return; }
        const { data } = await sb.from('profiles').select('id').eq('username', username).maybeSingle();
        if (data && data.id !== user.id) {
          setUsernameStatus('taken');
          setSuggestions([`${username}1`, `${username}_fan`, `${username}99`]);
        } else {
          setUsernameStatus('available'); setSuggestions([]);
        }
      } catch { setUsernameStatus('idle'); }
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [username, user.id, profile?.username]);

  const handleSave = async () => {
    if (!username.trim()) { setError('Choose a username. It is how friends find you.'); return; }
    if (!USERNAME_RE.test(username)) { setError('A username is 3 to 20 letters, numbers or underscores.'); return; }
    if (usernameStatus === 'taken') { setError('That username is taken. Pick another.'); return; }
    if (usernameStatus === 'checking') { setError('Still checking that username. Try again in a second.'); return; }

    setSaving(true);
    setError('');
    try {
      const sb = getSupabase();
      if (!sb) throw new Error('Auth service is not configured.');

      // The avatar lives inside preferences, next to the email choices.
      const existingPrefs = profile?.preferences || {};
      const mergedPrefs = { ...existingPrefs, robotConfig: toAvatarConfig(avatar) };

      const coreUpdates = {
        username:        username.trim(),
        display_name:    (avatar.name.trim() || username.trim()),
        favorite_number: avatar.number !== '' ? avatar.number : null,
        preferences:     mergedPrefs,
        updated_at:      new Date().toISOString(),
      };

      const { error: updateErr } = await sb.from('profiles').update(coreUpdates).eq('id', user.id);
      if (updateErr) throw updateErr;

      track('profile_updated', { fields_changed: ['username', 'display_name', 'favorite_number', 'avatar'], avatar_sport: avatar.sport });
      onSave(coreUpdates);
    } catch (err) {
      if (err?.code === '23505') {
        setError('That username is already taken.');
      } else {
        setError(friendlyDbError(err));
      }
    } finally {
      setSaving(false);
    }
  };

  const hint = (() => {
    if (!username || !USERNAME_RE.test(username)) return null;
    if (usernameStatus === 'checking') return { type: 'info', text: 'Checking availability…' };
    if (usernameStatus === 'available' && username !== (profile?.username || '')) return { type: 'ok', text: '@' + username + ' is available' };
    if (usernameStatus === 'taken') return { type: 'err', text: 'Username taken' };
    return null;
  })();

  return (
    <div className={styles.editForm}>
      <div className={styles.editFormHeader}>
        <h3 className={styles.editFormTitle}>Edit your Maximus</h3>
        <button type="button" className={styles.editFormClose} onClick={onCancel} aria-label="Cancel editing">×</button>
      </div>

      <div className={styles.editFormBody}>
        <AvatarStudio value={avatar} onChange={(next) => { setAvatar(next); setError(''); }} username={USERNAME_RE.test(username) ? username : ''} />

        <div className={`${styles.fieldGroup} ${styles.usernameField}`}>
          <label className={styles.label} htmlFor="edit-username">Username</label>
          <div className={styles.inputWrap}>
            <input
              id="edit-username"
              className={`${styles.input} ${usernameStatus === 'taken' ? styles.inputError : ''}`}
              type="text" placeholder="e.g. gridiron_dan" value={username}
              onChange={(e) => { setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20)); setError(''); }}
              autoComplete="off" autoCapitalize="none" spellCheck={false}
            />
            {usernameStatus === 'checking' && <span className={styles.inputSpinner}><SpinnerIcon /></span>}
          </div>
          {hint
            ? <span className={`${styles.fieldHint} ${styles[`hint_${hint.type}`]}`}>{hint.text}</span>
            : <span className={styles.fieldHint}>How friends find and follow you.</span>}
          {usernameStatus === 'taken' && suggestions.length > 0 && (
            <div className={styles.suggestions}>
              <span className={styles.suggestionLabel}>Try:</span>
              {suggestions.map((sg) => (
                <button key={sg} type="button" className={styles.suggestionChip} onClick={() => { setUsername(sg); setError(''); }}>{sg}</button>
              ))}
            </div>
          )}
        </div>

        {error && <p className={styles.errorMsg} role="alert">{error}</p>}
      </div>

      <div className={styles.editFormActions}>
        <button type="button" className={styles.btnOutline} onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="button" className={styles.btnPrimary} onClick={handleSave} disabled={saving || usernameStatus === 'checking'}>
          {saving ? <><SpinnerIcon /> Saving…</> : 'Save changes'}
        </button>
      </div>
    </div>
  );
}

/* ─── Team Picker Panel (Add Team in premium profile) ────────────────────── */
/**
 * @param {object} props
 * @param {Array}    props.existingTeams  — current user_teams rows [{team_slug}]
 * @param {Function} props.onAdd          — async (slug) => void  (single-select / pin mode)
 * @param {Function} props.onClose        — () => void
 * @param {boolean}  [props.multiSelect]  — if true, renders as a multi-select toggle list
 * @param {string[]} [props.selectedSlugs]— currently selected slugs (multi-select mode)
 * @param {Function} [props.onToggle]     — (slug) => void  (multi-select toggle)
 */
function TeamPickerPanel({ existingTeams, onAdd, onClose, sport: initialSport }) {
  const [sportTab, setSportTab] = useState(FOLLOW_SPORTS.some((sp) => sp.id === initialSport) ? initialSport : FOLLOW_SPORTS[0].id);
  const [query, setQuery]   = useState('');
  const [adding, setAdding] = useState(null);
  const inputRef            = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, [sportTab]);

  const existingSlugs = existingTeams.map(t => t.team_slug);
  const sport = FOLLOW_SPORTS.find((sp) => sp.id === sportTab);
  const q = query.trim().toLowerCase();
  const teams = sport.teams
    .filter((t) => !q || t.name.toLowerCase().includes(q) || t.group.toLowerCase().includes(q) || (t.abbrev || '').toLowerCase().includes(q))
    // Teams already followed sink to the bottom.
    .sort((a, b) => (existingSlugs.includes(a.slug) ? 1 : 0) - (existingSlugs.includes(b.slug) ? 1 : 0));

  return (
    <div className={styles.pickerPanel}>
      <div className={styles.pickerPanelHeader}>
        <span className={styles.pickerPanelTitle}>Follow a team</span>
        <button type="button" className={styles.pickerPanelClose} onClick={onClose} aria-label="Close team picker">×</button>
      </div>
      <div className={styles.pickerPanelSearch}>
        <div className={styles.sportTabs} role="tablist" aria-label="Sport" style={{ marginBottom: 10 }}>
          {FOLLOW_SPORTS.map((sp) => (
            <button
              key={sp.id} type="button" role="tab" aria-selected={sportTab === sp.id}
              className={`${styles.sportTab} ${sportTab === sp.id ? styles.sportTabActive : ''}`}
              onClick={() => { setSportTab(sp.id); setQuery(''); }}
            >
              {sp.label}
            </button>
          ))}
        </div>
        <input
          ref={inputRef}
          className={styles.searchInput}
          type="search" placeholder={sport.search} aria-label={sport.search}
          value={query} onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className={styles.pickerPanelList}>
        {teams.map((team) => {
          const followed = existingSlugs.includes(team.slug);
          return (
            <button
              key={team.slug}
              type="button"
              className={`${styles.pickerAddRow} ${followed ? styles.pickerAddRowPinned : ''}`}
              disabled={followed || adding === team.slug}
              onClick={async () => {
                if (followed) return;
                setAdding(team.slug);
                try { await onAdd(team.slug); } catch { /* handled by parent */ }
                setAdding(null);
              }}
            >
              <span className={styles.teamPickLogo}><TeamMark team={team} size={24} /></span>
              <span className={styles.pickerRowInfo}>
                <span className={styles.teamPickName}>{team.name}</span>
                <span className={styles.teamPickConf}>{team.group}</span>
              </span>
              <span className={`${styles.pinAction} ${followed ? styles.pinActionPinned : ''}`}>
                {followed ? <><CheckIcon /><span>Following</span></>
                  : adding === team.slug ? <SpinnerIcon />
                    : <span>Follow</span>}
              </span>
            </button>
          );
        })}
        {teams.length === 0 && (
          <p className={styles.emptyState}>No {sport.label} team matches “{query}”.</p>
        )}
      </div>
    </div>
  );
}

/* ─── Admin QA helpers ───────────────────────────────────────────────────── */

const DIGEST_META = [
  // Global
  { type: 'global_briefing',   name: 'Daily Global Intel Briefing',    section: 'Maximus Sports' },
  // MLB
  { type: 'mlb_briefing',      name: 'Daily MLB Briefing',             section: 'MLB' },
  { type: 'mlb_team_digest',   name: 'Daily MLB Team Digest',          section: 'MLB' },
  { type: 'mlb_picks',         name: "Daily MLB Maximus's Picks",      section: 'MLB' },
  // NCAAM
  { type: 'ncaam_briefing',    name: 'Daily NCAAM Briefing',           section: 'NCAAM' },
  { type: 'ncaam_team_digest', name: 'Daily NCAAM Team Digest',        section: 'NCAAM' },
  { type: 'ncaam_picks',       name: "Daily NCAAM Maximus's Picks",    section: 'NCAAM' },
];

function todayPT() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

function isTodayPT(iso) {
  if (!iso) return false;
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }) === todayPT();
}

function formatTimePT(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles',
  }) + ' PT';
}

function formatDatePT(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles',
  });
}

function runModeLabel(mode) {
  if (mode === 'override') return 'Override';
  if (mode === 'manual') return 'Manual';
  return 'Scheduled';
}

function deriveRunStatus(run) {
  if (!run) {
    return { variant: 'never', statusLabel: 'Never run', time: '\u2014', detail: '', runMode: null };
  }

  const ts = run.completed_at || run.started_at;
  const ranToday = isTodayPT(ts);
  const runStatus = run.status;
  const mode = run.run_mode || 'scheduled';

  if (runStatus === 'success') {
    if (ranToday) {
      return {
        variant: 'success',
        statusLabel: 'Sent today',
        time: formatTimePT(ts),
        detail: `${run.sent_count ?? 0} sent`,
        runMode: mode,
        scanned: run.scanned_count,
        eligible: run.eligible_count,
        skipped: run.skipped_counts,
      };
    }
    return {
      variant: 'idle',
      statusLabel: 'Not sent today',
      time: `Last: ${formatDatePT(ts)}, ${formatTimePT(ts)}`,
      detail: '',
      runMode: mode,
    };
  }

  if (runStatus === 'partial') {
    return {
      variant: 'partial',
      statusLabel: ranToday ? 'Partial today' : 'Partial',
      time: ranToday ? formatTimePT(ts) : `${formatDatePT(ts)}, ${formatTimePT(ts)}`,
      detail: `${run.sent_count ?? 0} sent · ${run.failed_count ?? 0} failed`,
      runMode: mode,
      scanned: run.scanned_count,
      eligible: run.eligible_count,
      skipped: run.skipped_counts,
      errorMessage: run.error_message,
    };
  }

  if (ranToday) {
    return {
      variant: 'failed',
      statusLabel: 'Failed today',
      time: formatTimePT(ts),
      detail: run.error_message ? run.error_message.slice(0, 80) : `${run.failed_count ?? 0} failed`,
      runMode: mode,
      errorMessage: run.error_message,
    };
  }
  return {
    variant: 'idle',
    statusLabel: 'Not sent today',
    time: `Last fail: ${formatDatePT(ts)}`,
    detail: '',
    runMode: mode,
  };
}

/* ─── Admin QA Email Panel ───────────────────────────────────────────────── */
function MyBracketsSettingsSection() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [brackets, setBrackets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.access_token) return;
    fetch('/api/bracketology/brackets', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(r => r.json())
      .then(data => setBrackets(data.brackets || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session?.access_token]);

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffHrs = Math.floor(diffMs / 3600000);
    if (diffHrs < 1) return 'just now';
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  return (
    <div className={styles.profileSection}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>My Brackets</h3>
        <button
          type="button"
          className={styles.btnAddTeam}
          onClick={() => navigate('/bracketology')}
        >
          Open Bracketology
        </button>
      </div>
      {loading ? (
        <div className={styles.loadingRow}><span>Loading brackets…</span></div>
      ) : brackets.length === 0 ? (
        <div className={styles.emptyTeams}>
          <p className={styles.emptyState}>No saved brackets yet.</p>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
            Head to Bracketology to build your first bracket.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {brackets.map((b) => {
            const pickCount = b.picks ? Object.keys(b.picks).length : 0;
            const progress = Math.round((pickCount / 63) * 100);
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => navigate(`/bracketology?bracketId=${b.id}`)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.65rem 0.85rem',
                  background: 'rgba(255,255,255,0.025)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  fontFamily: 'inherit',
                  color: 'rgba(255,255,255,0.85)',
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', minWidth: 0 }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.bracket_name || 'Untitled Bracket'}
                  </span>
                  <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.38)' }}>
                    {pickCount}/63 picks · {progress}% complete · {formatDate(b.updated_at)}
                  </span>
                </div>
                <span style={{ fontSize: '0.65rem', color: 'rgba(56,133,224,0.75)', fontWeight: 600, flexShrink: 0, marginLeft: '0.5rem' }}>
                  Open →
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AdminQAPanel() {
  const { user } = useAuth();
  const [sending, setSending] = useState(null);
  const [globalSending, setGlobalSending] = useState(null);
  const [results, setResults] = useState({});
  const [globalResults, setGlobalResults] = useState({});
  const [jobRuns, setJobRuns] = useState({});
  const [jobRunsLoading, setJobRunsLoading] = useState(true);
  const [healthData, setHealthData] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [expandedRow, setExpandedRow] = useState(null);
  const [confirmOverride, setConfirmOverride] = useState(null);

  const adminEmail = user?.email || '';

  async function getToken() {
    const sb = getSupabase();
    if (!sb) throw new Error('Not signed in.');
    const { data: { session } } = await sb.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error('Not signed in — please sign out and back in.');
    return token;
  }

  const loadJobStatus = useCallback(async () => {
    try {
      const token = await getToken();
      const resp = await fetch('/api/email/job-status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) return;
      const json = await resp.json();
      if (json.runs) setJobRuns(json.runs);
    } catch { /* non-critical */ }
    setJobRunsLoading(false);
  }, []);

  useEffect(() => { loadJobStatus(); }, [loadJobStatus]);

  async function handleSendTest(type) {
    if (sending) return;
    setSending(type);
    setResults(prev => ({ ...prev, [type]: null }));
    try {
      const token = await getToken();
      const res = await fetch('/api/email/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ type }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Build detailed error from server response
        const step = data.step ? `[${data.step}] ` : '';
        const code = data.code ? `(${data.code}) ` : '';
        const msg = data.error || `Server error ${res.status}`;
        throw new Error(`${step}${code}${msg}`);
      }

      const ts = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
      setResults(prev => ({ ...prev, [type]: { ok: true, message: `Sent at ${ts}` } }));
      showToast(`Test sent — check ${adminEmail}`, { type: 'success' });
    } catch (err) {
      console.error('[Settings send-test]', err.message);
      setResults(prev => ({ ...prev, [type]: { ok: false, message: err.message || 'Send failed.' } }));
      showToast(err.message || 'Send failed.', { type: 'error' });
    } finally {
      setSending(null);
    }
  }

  async function handleGlobalSend(type, override = false) {
    if (globalSending) return;
    setGlobalSending(type);
    setGlobalResults(prev => ({ ...prev, [type]: null }));
    try {
      const token = await getToken();
      const res = await fetch('/api/email/global-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ type, override }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);

      const mode = override ? 'Override' : 'Global';
      setGlobalResults(prev => ({
        ...prev,
        [type]: { ok: true, message: `${mode}: ${data.sent ?? 0} sent, ${data.failed ?? 0} failed (${data.elapsed})` },
      }));
      showToast(`${mode} send complete: ${data.sent ?? 0} sent`, { type: data.failed > 0 ? 'warning' : 'success' });
      loadJobStatus();
    } catch (err) {
      setGlobalResults(prev => ({ ...prev, [type]: { ok: false, message: err.message || 'Send failed.' } }));
      showToast(err.message || 'Global send failed.', { type: 'error' });
    } finally {
      setGlobalSending(null);
      setConfirmOverride(null);
    }
  }

  async function handleHealthCheck() {
    setHealthLoading(true);
    try {
      const token = await getToken();
      const resp = await fetch('/api/email/health', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json().catch(() => ({}));
      setHealthData(data);
    } catch (err) {
      setHealthData({ ok: false, error: err.message });
    } finally {
      setHealthLoading(false);
    }
  }

  return (
    <div className={styles.adminQaCard}>
      <div className={styles.adminQaHeader}>
        <div>
          <h3 className={styles.adminQaTitle}>Admin QA</h3>
          <p className={styles.adminQaSubtitle}>Email operations, global sends, and diagnostics.</p>
        </div>
        <span className={styles.adminBadge}>Admin</span>
      </div>

      {/* ── Section 1: Email Send Logs + Global Send ────────────────────────── */}
      <div className={styles.logsSection}>
        <h4 className={styles.logsSectionTitle}>Email Send Logs &amp; Global Send</h4>
        <div className={styles.logsTable}>
          {DIGEST_META.map(({ type, name, section }, idx) => {
            const prevSection = idx > 0 ? DIGEST_META[idx - 1].section : null;
            const showSectionHeader = section !== prevSection;
            const run = jobRuns[type];
            const info = deriveRunStatus(run);
            const chipCls =
              info.variant === 'success' ? styles.logChipSuccess
              : info.variant === 'partial' ? styles.logChipPartial
              : info.variant === 'failed'  ? styles.logChipFailed
              : info.variant === 'never'   ? styles.logChipNever
              : styles.logChipIdle;
            const globalResult = globalResults[type];
            const isGlobalSending = globalSending === type;
            const expanded = expandedRow === type;
            return (
              <div key={type}>
                {showSectionHeader && (
                  <div style={{ padding: '0.5rem 0 0.25rem', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)', borderTop: idx > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none', marginTop: idx > 0 ? '0.5rem' : 0 }}>
                    {section}
                  </div>
                )}
              <div className={styles.logsRowWrap}>
                <div className={styles.logsRow}>
                  <span className={styles.logsDigestName}>{name}</span>
                  {jobRunsLoading ? (
                    <span className={styles.logsLoadingPill}>Loading…</span>
                  ) : (
                    <>
                      <span className={`${styles.logChip} ${chipCls}`}>{info.statusLabel}</span>
                      <span className={styles.logsTime}>{info.time}</span>
                      {info.runMode && info.variant !== 'never' && (
                        <span className={styles.logsRunMode}>{runModeLabel(info.runMode)}</span>
                      )}
                      {info.detail && <span className={styles.logsDetail}>{info.detail}</span>}
                      <button
                        type="button"
                        className={styles.logsDetailsBtn}
                        onClick={() => setExpandedRow(expanded ? null : type)}
                        aria-label="Toggle details"
                      >
                        {expanded ? '▾' : '▸'}
                      </button>
                    </>
                  )}
                </div>
                {expanded && run && (
                  <div className={styles.logsDetailExpanded}>
                    <span>Scanned: {run.scanned_count ?? '—'}</span>
                    <span>Eligible: {run.eligible_count ?? '—'}</span>
                    <span>Sent: {run.sent_count ?? '—'}</span>
                    <span>Failed: {run.failed_count ?? '—'}</span>
                    <span>Mode: {runModeLabel(run.run_mode)}</span>
                    {run.skipped_counts && (
                      <span>Skipped: {Object.entries(run.skipped_counts).filter(([,v]) => v > 0).map(([k,v]) => `${k}: ${v}`).join(', ') || 'none'}</span>
                    )}
                    {run.error_message && <span className={styles.logsDetailError}>Error: {run.error_message.slice(0, 120)}</span>}
                  </div>
                )}
                {/* Global Send actions */}
                <div className={styles.globalSendRow}>
                  <button
                    type="button"
                    className={styles.btnGlobalSend}
                    onClick={() => handleGlobalSend(type, false)}
                    disabled={!!globalSending}
                  >
                    {isGlobalSending ? <SpinnerIcon /> : (
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden style={{flexShrink:0}}>
                        <path d="M1 1l12 6-12 6V8.5l8-1.5-8-1.5V1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill="none"/>
                      </svg>
                    )}
                    <span>Global Send</span>
                  </button>
                  <button
                    type="button"
                    className={styles.btnOverrideSend}
                    onClick={() => setConfirmOverride(type)}
                    disabled={!!globalSending}
                    title="Force send to ALL users, including unsubscribed"
                  >
                    Override Send
                  </button>
                  {globalResult && (
                    <span className={globalResult.ok ? styles.adminQaResultOk : styles.adminQaResultErr}>
                      {globalResult.ok ? '✓' : '✕'} {globalResult.message}
                    </span>
                  )}
                </div>
              </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Override confirmation modal ──────────────────────────────────────── */}
      {confirmOverride && (
        <ConfirmModal
          title="Override Send"
          message={`Send ${DIGEST_META.find(d => d.type === confirmOverride)?.name || confirmOverride} to ALL users, including those who have not subscribed?`}
          bullets={[
            'This bypasses user subscription preferences',
            'All users with an email address will receive this digest',
            'This run will be logged as "Override" in job history',
          ]}
          subtext="Use for marketing pushes and one-off campaigns only."
          confirmLabel="Force Send to All"
          danger
          onConfirm={() => handleGlobalSend(confirmOverride, true)}
          onCancel={() => setConfirmOverride(null)}
          loading={!!globalSending}
        />
      )}

      {/* ── Section 2: Test Send Actions ─────────────────────────────────────── */}
      <div className={styles.testSection}>
        <h4 className={styles.logsSectionTitle}>Test Send</h4>
        <p className={styles.adminQaSendTo}>Sends to: <strong>{adminEmail}</strong></p>
        <div className={styles.testGrid}>
          {TEST_EMAIL_TYPES.map(({ type, label }) => {
            const result = results[type];
            const isSending = sending === type;
            return (
              <div key={type} className={styles.testRow}>
                <button
                  type="button"
                  className={`${styles.btnAdminTest} ${result?.ok === true ? styles.btnAdminTestSent : ''} ${result?.ok === false ? styles.btnAdminTestError : ''}`}
                  onClick={() => handleSendTest(type)}
                  disabled={!!sending}
                >
                  {isSending ? <SpinnerIcon /> : (
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden style={{flexShrink:0}}>
                      <path d="M1 1l12 6-12 6V8.5l8-1.5-8-1.5V1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill="none"/>
                    </svg>
                  )}
                  <span>{label}</span>
                </button>
                {result && (
                  <span className={result.ok ? styles.adminQaResultOk : styles.adminQaResultErr}>
                    {result.ok ? '✓' : '✕'} {result.message}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Section 3: System Health ─────────────────────────────────────────── */}
      <div className={styles.testSection}>
        <h4 className={styles.logsSectionTitle}>System Health</h4>
        <button
          type="button"
          className={styles.btnAdminTest}
          onClick={handleHealthCheck}
          disabled={healthLoading}
        >
          {healthLoading ? <SpinnerIcon /> : (
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden style={{flexShrink:0}}>
              <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M7 4v3l2 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          )}
          <span>Run Health Check</span>
        </button>
        {healthData && (
          <div className={styles.healthResults}>
            <div className={`${styles.healthOverall} ${healthData.ok ? styles.healthOk : styles.healthFail}`}>
              {healthData.ok ? '✓ All systems healthy' : '✕ Issues detected'}
            </div>
            {healthData.checks && (
              <div className={styles.healthChecks}>
                {healthData.checks.environment && (
                  <div className={styles.healthCheckRow}>
                    <span className={styles.healthCheckLabel}>Resend API Key</span>
                    <span className={healthData.checks.environment.resendApiKey ? styles.healthCheckOk : styles.healthCheckErr}>
                      {healthData.checks.environment.resendApiKey ? 'Set' : 'Missing'}
                    </span>
                  </div>
                )}
                {healthData.checks.resend && (
                  <div className={styles.healthCheckRow}>
                    <span className={styles.healthCheckLabel}>Resend API</span>
                    <span className={healthData.checks.resend.ok ? styles.healthCheckOk : styles.healthCheckErr}>
                      {healthData.checks.resend.ok ? 'Reachable' : (healthData.checks.resend.error || 'Unreachable')}
                    </span>
                  </div>
                )}
                {healthData.checks.emailJobRunsTable && (
                  <div className={styles.healthCheckRow}>
                    <span className={styles.healthCheckLabel}>Job Runs Table</span>
                    <span className={healthData.checks.emailJobRunsTable.ok ? styles.healthCheckOk : styles.healthCheckErr}>
                      {healthData.checks.emailJobRunsTable.ok ? 'OK' : (healthData.checks.emailJobRunsTable.error || 'Missing')}
                    </span>
                  </div>
                )}
                {healthData.checks.emailSendLogTable && (
                  <div className={styles.healthCheckRow}>
                    <span className={styles.healthCheckLabel}>Send Log Table</span>
                    <span className={healthData.checks.emailSendLogTable.ok ? styles.healthCheckOk : styles.healthCheckErr}>
                      {healthData.checks.emailSendLogTable.ok ? 'OK' : (healthData.checks.emailSendLogTable.error || 'Missing')}
                    </span>
                  </div>
                )}
                {healthData.checks.authAdmin && (
                  <div className={styles.healthCheckRow}>
                    <span className={styles.healthCheckLabel}>Auth Admin</span>
                    <span className={healthData.checks.authAdmin.ok ? styles.healthCheckOk : styles.healthCheckErr}>
                      {healthData.checks.authAdmin.ok ? 'OK' : (healthData.checks.authAdmin.error || 'Failed')}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Plan badge ─────────────────────────────────────────────────────────── */
function PlanBadge({ tier }) {
  return (
    <span className={tier === 'pro' ? styles.badgePro : styles.badgeFree}>
      {tier === 'pro' ? 'PRO' : 'FREE'}
    </span>
  );
}

/* ─── Plan comparison table ──────────────────────────────────────────────── */
const COMPARISON_ROWS = [
  { label: 'Verified account',      free: '—',          pro: 'Verified badge' },
  { label: 'Pinned teams',          free: 'Up to 3',    pro: 'Unlimited' },
  { label: 'Team Digest teams',     free: 'Up to 3',    pro: 'Unlimited' },
  { label: 'Odds Insights',         free: 'Limited',    pro: 'Full access' },
  { label: "Pick'em picks",         free: 'Limited',    pro: 'Unlimited' },
  { label: 'Premium email intel',   free: 'Standard',   pro: 'Premium' },
  { label: 'ATS / spread context',  free: '—',          pro: 'Advanced' },
  { label: 'Intelligence depth',    free: 'Standard',   pro: 'Full depth' },
  { label: 'Advanced beta access',  free: '—',          pro: 'Early access' },
  { label: 'Future free merch',     free: '—',          pro: 'Included' },
];

function PlanComparisonTable({ currentTier }) {
  return (
    <div className={styles.compTable}>
      <div className={styles.compHeaderRow}>
        <div className={styles.compFeatureCol} />
        <div className={`${styles.compTierCol} ${currentTier === 'free' ? styles.compTierColActive : ''}`}>
          <span className={styles.compTierLabel}>Free</span>
        </div>
        <div className={`${styles.compTierCol} ${styles.compTierColPro} ${currentTier === 'pro' ? styles.compTierColActive : ''}`}>
          <span className={styles.compTierLabel}>Pro</span>
          <span className={styles.compTierPrice}>{PRO_PRICE_LABEL}</span>
        </div>
      </div>
      {COMPARISON_ROWS.map((row) => (
        <div key={row.label} className={styles.compRow}>
          <div className={styles.compFeatureCol}>{row.label}</div>
          <div className={`${styles.compValueCol} ${currentTier === 'free' ? styles.compValueColActive : ''}`}>
            {row.free === '—' ? <span className={styles.compDash}>—</span> : row.free}
          </div>
          <div className={`${styles.compValueCol} ${styles.compValueColPro} ${currentTier === 'pro' ? styles.compValueColActive : ''}`}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden className={styles.compCheck}>
              <circle cx="6" cy="6" r="5.5" fill="var(--color-primary)" fillOpacity="0.12"/>
              <path d="M3.5 6l1.8 1.8 3.2-3.2" stroke="var(--color-primary)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {row.pro}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Billing section ────────────────────────────────────────────────────── */
function BillingSection({
  profile, planTier, onUpgrade, onManageBilling,
  upgradeLoading, portalLoading, billingNotice, planRefreshing,
  syncNowVisible, syncNowLoading, onSyncNow,
}) {
  const isProPlan = planTier === 'pro';
  const isPastDue = profile?.subscription_status === 'past_due';

  function formatDate(isoStr) {
    if (!isoStr) return null;
    try {
      return new Date(isoStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    } catch { return null; }
  }

  return (
    <div className={styles.profileSection}>

      {/* ── Success / portal-return banner ── */}
      {billingNotice && (
        <div className={billingNotice.type === 'success' ? styles.billingBannerSuccess : styles.billingBannerInfo}>
          {billingNotice.type === 'success' && (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <circle cx="8" cy="8" r="7" stroke="var(--color-up)" strokeWidth="1.4"/>
              <path d="M5 8l2 2 4-4" stroke="var(--color-up)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
          {billingNotice.message}
        </div>
      )}

      {/* ── Current plan card ── */}
      <div className={styles.billingPlanCard}>
        <div className={styles.billingPlanRow}>
          <div className={styles.billingPlanLeft}>
            <span className={styles.billingPlanLabel}>Current plan</span>
            {planRefreshing ? (
              <span className={styles.billingVerifyingBadge}>
                <SpinnerIcon /> Verifying…
              </span>
            ) : (
              <PlanBadge tier={planTier} />
            )}
          </div>
          {/* Only show Manage billing for confirmed Pro users */}
          {isProPlan && !planRefreshing && (
            <button type="button" className={styles.btnOutline} onClick={onManageBilling} disabled={portalLoading}>
              {portalLoading ? <><SpinnerIcon /> Opening…</> : 'Manage billing'}
            </button>
          )}
        </div>

        {isProPlan && !planRefreshing && profile?.current_period_end && (
          <div className={styles.billingMeta}>
            {profile?.cancel_at_period_end ? (
              <span className={styles.billingCancelNote}>
                Cancels {formatDate(profile.current_period_end)} — Pro access remains until then.
              </span>
            ) : (
              <span className={styles.billingRenewNote}>
                Renews {formatDate(profile.current_period_end)}
              </span>
            )}
          </div>
        )}

        {isProPlan && !planRefreshing && (profile?.payment_method_brand || profile?.payment_method_last4) && (
          <div className={styles.billingCardRow}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <rect x="1" y="3" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M1 6h12" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
            {profile.payment_method_brand && (
              <span className={styles.billingCardBrand}>{profile.payment_method_brand.toUpperCase()}</span>
            )}
            {profile.payment_method_last4 && (
              <span className={styles.billingCardLast4}>·· {profile.payment_method_last4}</span>
            )}
          </div>
        )}

        {isPastDue && (
          <div className={styles.billingWarning}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path d="M7 1L13 12H1L7 1z" stroke="var(--color-down)" strokeWidth="1.2" strokeLinejoin="round"/>
              <path d="M7 5v3" stroke="var(--color-down)" strokeWidth="1.3" strokeLinecap="round"/>
              <circle cx="7" cy="10" r="0.6" fill="var(--color-down)"/>
            </svg>
            Payment failed — update your payment method to keep Pro access.
          </div>
        )}
      </div>

      {/* ── Free vs Pro comparison ── */}
      <div className={styles.billingSectionHead}>
        <h4 className={styles.billingSectionTitle}>Free vs Pro</h4>
      </div>
      <PlanComparisonTable currentTier={planRefreshing ? 'free' : planTier} />

      {/* ── CTA: verifying / upgrade / pro-active ── */}
      {planRefreshing ? (
        <div className={styles.billingVerifyingCta}>
          <SpinnerIcon />
          <span>Activating your Pro plan…</span>
          {syncNowVisible && (
            <button
              type="button"
              className={styles.btnSyncNow}
              onClick={onSyncNow}
              disabled={syncNowLoading}
            >
              {syncNowLoading ? <><SpinnerIcon /> Syncing…</> : 'Sync subscription'}
            </button>
          )}
        </div>
      ) : isProPlan ? (
        <div className={styles.billingProActiveCta}>
          <div className={styles.billingProActiveLeft}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
              <circle cx="8" cy="8" r="7" stroke="var(--color-primary)" strokeWidth="1.4"/>
              <path d="M5 8l2 2 4-4" stroke="var(--color-primary)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className={styles.billingProActiveLabel}>Maximus Sports Pro is active</span>
          </div>
          <button type="button" className={styles.btnOutline} onClick={onManageBilling} disabled={portalLoading}>
            {portalLoading ? <><SpinnerIcon /> Opening…</> : 'Manage billing'}
          </button>
        </div>
      ) : (
        <>
          <div className={styles.billingUpgradeCta}>
            <div className={styles.billingUpgradeText}>
              <span className={styles.billingUpgradeTitle}>Unlock the full Maximus experience</span>
              <span className={styles.billingUpgradeSubline}>Verified badge, beta access, future merch drops, and more.</span>
              <span className={styles.billingUpgradePrice}>{PRO_PRICE_LABEL}</span>
            </div>
            <button
              type="button"
              className={styles.btnUpgrade}
              onClick={onUpgrade}
              disabled={upgradeLoading}
            >
              {upgradeLoading ? <><SpinnerIcon /> Redirecting…</> : 'Upgrade to Pro →'}
            </button>
          </div>
          {/* Recovery path for Pro users with missed webhooks and no stripe data in profile */}
          <div className={styles.billingSyncNowRow}>
            <button
              type="button"
              className={styles.btnSyncNow}
              onClick={onSyncNow}
              disabled={syncNowLoading}
            >
              {syncNowLoading ? <><SpinnerIcon /> Syncing…</> : 'Already paid? Sync subscription'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Upgrade prompt modal ───────────────────────────────────────────────── */
function UpgradePrompt({ message, onUpgrade, onClose, upgradeLoading }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={styles.modalOverlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
        <div className={styles.upgradePromptIcon}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
            <circle cx="14" cy="14" r="13" stroke="var(--color-primary)" strokeWidth="1.4" strokeDasharray="5 3"/>
            <path d="M14 8v6M14 17v1" stroke="var(--color-primary)" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </div>
        <h3 className={styles.modalTitle}>Pro feature</h3>
        <p className={styles.modalMessage}>{message}</p>
        <div className={styles.upgradePromptComparison}>
          <div className={styles.upgradePromptRow}>
            <span className={styles.badgeFree}>FREE</span>
            <span className={styles.upgradePromptLimit}>Pinned: up to 3 · Digest: up to 3</span>
          </div>
          <div className={styles.upgradePromptRow}>
            <span className={styles.badgePro}>PRO</span>
            <span className={styles.upgradePromptLimit}>Unlimited teams · Verified badge · Beta access · {PRO_PRICE_LABEL}</span>
          </div>
        </div>
        <div className={styles.modalActions}>
          <button type="button" className={styles.btnOutline} onClick={onClose}>
            Not now
          </button>
          <button
            type="button"
            className={styles.btnUpgrade}
            onClick={onUpgrade}
            disabled={upgradeLoading}
            autoFocus
          >
            {upgradeLoading ? <><SpinnerIcon /> Redirecting…</> : 'Upgrade to Pro →'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Premium Profile Page ───────────────────────────────────────────────── */
function FriendsBlock({ username }) {
  const [openList, setOpenList] = useState(null);
  return (
    <>
      <FollowPanel username={username} onOpenList={setOpenList} />
      {openList && (
        <Suspense fallback={null}>
          <SocialListDropdown type={openList} onClose={() => setOpenList(null)} />
        </Suspense>
      )}
    </>
  );
}

function PremiumProfile({ user, profile, onProfileUpdate, onSignOut, signingOut }) {
  const { signOut } = useAuth();
  const { pinTeam: serverPinTeam, unpinTeam: serverUnpinTeam } = useTeamPin();

  const [userTeams, setUserTeams]         = useState([]);
  const [teamsLoading, setTeamsLoading]   = useState(true);
  const [teamsError, setTeamsError]       = useState('');
  const [showTeamPicker, setShowTeamPicker] = useState(null); // null | 'ncaam' | 'mlb'
  const [primaryPending, setPrimaryPending] = useState(null);

  const [prefs, setPrefs]           = useState(() => {
    const stored = profile?.preferences || {};
    // Migrate legacy preference keys (v1 → v2) at read time
    const hasLegacy = ['briefing', 'teamAlerts', 'oddsIntel', 'newsDigest', 'teamDigest'].some(k => k in stored);
    if (hasLegacy) {
      const migrated = { ...stored };
      const map = { briefing: 'global_briefing', teamAlerts: 'ncaam_team_digest', oddsIntel: 'ncaam_picks', newsDigest: 'mlb_briefing', teamDigest: 'mlb_team_digest' };
      for (const [old, nw] of Object.entries(map)) {
        if (old in migrated && !(nw in migrated)) migrated[nw] = migrated[old];
        delete migrated[old];
      }
      if (!('ncaam_briefing' in migrated) && 'briefing' in stored) migrated.ncaam_briefing = stored.briefing;
      delete migrated.gameDayAlerts; delete migrated.bracketIntel; delete migrated.teamDigestTeams;
      return withEmailDefaults(migrated);
    }
    return withEmailDefaults(stored);
  });
  const [saveStatus, setSaveStatus] = useState('idle');
  const saveDebounce                = useRef(null);

  const [showEditForm, setShowEditForm] = useState(false);

  // confirm: null | { type: 'clear-device' | 'reset-all' }
  const [confirm, setConfirm]     = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [resetError, setResetError] = useState('');

  // ── Subscription / billing state ─────────────────────────────────────────
  const [searchParams, setSearchParams] = useSearchParams();
  const planTier    = effectivePlanTier(profile);
  const entitlements = getEntitlements(planTier);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [portalLoading,  setPortalLoading]  = useState(false);
  const [upgradePrompt,  setUpgradePrompt]  = useState(null); // null | { message }
  // Guard: only attempt auto-sync once per billing-tab visit (avoids repeated requests).
  const autoSyncAttemptedRef = useRef(false);

  // Capture session_id from URL BEFORE the cleanup effect removes it.
  // Stripe populates {CHECKOUT_SESSION_ID} in the success_url so we can use it
  // as the most reliable sync path (path 0 in billing/sync).
  const sessionIdRef = useRef(
    new URLSearchParams(window.location.search).get('session_id') ?? null
  );

  // Detect billing return from Stripe
  const [billingNotice, setBillingNotice] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const upgrade = params.get('upgrade');
    const billing = params.get('billing'); // legacy compat
    if (upgrade === 'success' || billing === 'success')
      return { type: 'success', message: 'Welcome to Maximus Sports Pro!' };
    if (upgrade === 'portal_return' || billing === 'portal_return')
      return { type: 'info', message: 'Billing settings updated.' };
    return null;
  });

  // Default to billing tab if returning from Stripe or linked directly to billing
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const upgrade = params.get('upgrade');
    const billing = params.get('billing');
    const openBilling = params.get('openBilling');
    return (upgrade === 'success' || upgrade === 'portal_return' ||
            billing === 'success' || billing === 'portal_return' ||
            openBilling === '1')
      ? 'billing' : 'profile';
  });

  // Clean up query params from the URL after reading them
  useEffect(() => {
    const hasUpgrade = searchParams.get('upgrade');
    const hasBilling = searchParams.get('billing');
    const hasOpenBilling = searchParams.get('openBilling');
    if (hasUpgrade || hasBilling || hasOpenBilling) {
      searchParams.delete('upgrade');
      searchParams.delete('billing');
      searchParams.delete('openBilling');
      searchParams.delete('session_id');
      setSearchParams(searchParams, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Plan-refresh polling (after Stripe checkout success) ──────────────────
  // The webhook updates Supabase asynchronously; we poll until plan_tier = 'pro'
  // or we time out (~12 s). If webhook still hasn't fired, we call /api/billing/sync
  // as a one-shot fallback to fix the profiles row directly from Stripe.
  const [planRefreshing, setPlanRefreshing] = useState(false);
  const pollTimerRef = useRef(null);

  // Debug flag — mirrors usePlan ?debugPlan=1.
  const _debugPlan =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('debugPlan');
  const syncAttemptsRef = useRef(0);

  async function trySyncFallback(sessionId = null) {
    syncAttemptsRef.current += 1;
    const attempt = syncAttemptsRef.current;
    if (_debugPlan) {
      console.log(
        `[Settings/trySyncFallback] attempt #${attempt}`,
        { userId: user?.id?.slice(0, 8), sessionId: sessionId ? 'present' : 'none' }
      );
    }
    try {
      const sb = getSupabase();
      if (!sb) return false;
      const { data: { session: sess } } = await sb.auth.getSession();
      const token = sess?.access_token;
      if (!token) return false;

      // Include session_id in the body so the server can use path 0 (most reliable).
      const body = JSON.stringify(sessionId ? { session_id: sessionId } : {});

      const res = await fetch('/api/billing/sync', {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body,
      });
      const json = await res.json().catch(() => ({}));
      if (_debugPlan) {
        console.log(`[Settings/trySyncFallback] attempt #${attempt} result:`, json);
      }
      if (!res.ok) return false;
      if (json.isPro || json.plan_tier === 'pro') {
        // Reload profile from DB so local state is accurate.
        const { data } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
        if (data) {
          onProfileUpdate(data);
          invalidatePlanCache(user.id);
          showToast('Welcome to Maximus Sports Pro! 🎉', { type: 'success', duration: 5000 });
          return true;
        }
      }
      return false;
    } catch (err) {
      if (_debugPlan) console.log('[Settings/trySyncFallback] exception:', err?.message);
      return false;
    }
  }

  // ── "Sync Now" visibility — shown when planRefreshing for > 5 s ──────────
  const [syncNowVisible, setSyncNowVisible] = useState(false);
  const [syncNowLoading, setSyncNowLoading] = useState(false);
  const syncNowTimerRef = useRef(null);

  useEffect(() => {
    if (planRefreshing) {
      setSyncNowVisible(false);
      syncNowTimerRef.current = setTimeout(() => setSyncNowVisible(true), 5_000);
    } else {
      if (syncNowTimerRef.current) clearTimeout(syncNowTimerRef.current);
      setSyncNowVisible(false);
    }
    return () => { if (syncNowTimerRef.current) clearTimeout(syncNowTimerRef.current); };
  }, [planRefreshing]);

  async function handleSyncNow() {
    if (syncNowLoading) return;
    setSyncNowLoading(true);
    setPlanRefreshing(true);
    const synced = await trySyncFallback();
    setSyncNowLoading(false);
    setPlanRefreshing(false);
    if (!synced) {
      setBillingNotice({ type: 'info', message: "Couldn't sync. Try refreshing the page or contact support." });
    }
  }

  /**
   * Poll Supabase directly for up to 20 s after a checkout, as a fallback if
   * billing/sync hasn't flipped the profile row yet (webhook still in flight).
   * Does NOT call trySyncFallback at the end — that was already tried before
   * this function runs (see startUpgradeFlow).
   */
  function pollForProUpgrade() {
    const sb = getSupabase();
    if (!sb) return;
    let attempts = 0;
    const MAX_ATTEMPTS = 13; // ~20 s at 1.5 s intervals
    const INTERVAL_MS  = 1500;

    function attempt() {
      sb.from('profiles')
        .select('plan_tier, subscription_status')
        .eq('id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data && (data.plan_tier === 'pro' || data.subscription_status === 'active' || data.subscription_status === 'trialing')) {
            // Reload full profile for UI
            sb.from('profiles').select('*').eq('id', user.id).maybeSingle().then(({ data: full }) => {
              if (full) onProfileUpdate(full);
            });
            invalidatePlanCache(user.id);
            showToast('Welcome to Maximus Sports Pro! 🎉', { type: 'success', duration: 5000 });
            setPlanRefreshing(false);
            return;
          }
          attempts++;
          if (attempts < MAX_ATTEMPTS) {
            pollTimerRef.current = setTimeout(attempt, INTERVAL_MS);
          } else {
            setPlanRefreshing(false);
            // Webhook still in flight — friendly waiting message.
            setBillingNotice({
              type:    'info',
              message: "We're still confirming your subscription. Try clicking \"Already paid? Sync subscription\" below, or refresh in a moment.",
            });
          }
        })
        .catch(() => {
          attempts++;
          if (attempts < MAX_ATTEMPTS) {
            pollTimerRef.current = setTimeout(attempt, INTERVAL_MS);
          } else {
            setPlanRefreshing(false);
          }
        });
    }

    pollTimerRef.current = setTimeout(attempt, INTERVAL_MS);
  }

  /**
   * Primary upgrade-return flow:
   *   1. Call billing/sync immediately with the session_id (fastest, most reliable).
   *   2. If sync confirms Pro → done.
   *   3. If sync says "not pro yet" → webhook might still be in flight → poll Supabase.
   */
  async function startUpgradeFlow() {
    setPlanRefreshing(true);
    const sid = sessionIdRef.current; // captured before URL cleanup
    if (_debugPlan) console.log('[Settings/startUpgradeFlow] session_id:', sid ? 'present' : 'none');

    const synced = await trySyncFallback(sid);
    if (synced) {
      setPlanRefreshing(false);
      return;
    }

    // Sync returned "not pro" — webhook may still be in flight. Poll briefly.
    pollForProUpgrade();
  }

  // Kick off the upgrade flow immediately when landing on /settings?upgrade=success.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('upgrade') === 'success' || params.get('billing') === 'success') {
      // Back from Stripe with a paid checkout. The Stripe webhook is the record
      // of the purchase; this marks the moment in the user's own session.
      track('checkout_completed', { plan: 'pro' });
      startUpgradeFlow();
    }
    return () => { if (pollTimerRef.current) clearTimeout(pollTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-sync: when billing tab is open and plan shows FREE but Stripe customer
  // exists, attempt one silent sync to recover from a missed/delayed webhook.
  useEffect(() => {
    if (
      activeTab === 'billing' &&
      planTier === 'free' &&
      profile?.stripe_customer_id &&
      !planRefreshing &&
      !autoSyncAttemptedRef.current
    ) {
      autoSyncAttemptedRef.current = true;
      setPlanRefreshing(true);
      trySyncFallback(sessionIdRef.current).then((synced) => {
        setPlanRefreshing(false);
        if (!synced) {
          // Subscription truly isn't active yet — leave UI as-is.
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, planTier, profile?.stripe_customer_id]);

  // ── Upgrade to Pro (Stripe Checkout) ─────────────────────────────────────
  async function handleUpgrade() {
    // UI guard: Pro users must never trigger checkout again.
    if (planTier === 'pro' || planRefreshing) {
      showToast('You\'re already on Maximus Sports Pro!', { type: 'info' });
      return;
    }
    track('upgrade_clicked', { plan_tier: planTier || 'free' });
    setUpgradeLoading(true);
    try {
      const sb = getSupabase();
      if (!sb) throw new Error('Not configured');
      const { data: { session: sess } } = await sb.auth.getSession();
      const token = sess?.access_token;
      if (!token) throw new Error('Please sign in again.');
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not start checkout.');
      // Mark as syncing so badge shows ··· while webhook is in flight.
      markSyncing(user.id);
      track('checkout_started', { plan: 'pro' });
      flushAnalytics(); // leaving for Stripe; send before the page unloads
      window.location.href = json.url;
    } catch (err) {
      setUpgradeLoading(false);
      track('checkout_start_failed', { message: (err?.message || '').slice(0, 120) });
      showToast(err.message || 'Could not start upgrade. Please try again.', { type: 'error' });
    }
  }

  // ── Open Stripe Billing Portal ────────────────────────────────────────────
  async function handleManageBilling() {
    setPortalLoading(true);
    try {
      const sb = getSupabase();
      if (!sb) throw new Error('Not configured');
      const { data: { session: sess } } = await sb.auth.getSession();
      const token = sess?.access_token;
      if (!token) throw new Error('Please sign in again.');
      const res = await fetch('/api/stripe/create-portal-session', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not open billing portal.');
      track('billing_portal_opened', {});
      flushAnalytics();
      window.location.href = json.url;
    } catch (err) {
      setPortalLoading(false);
      showToast(err.message || 'Could not open billing portal. Please try again.', { type: 'error' });
    }
  }

  // ── PostHog: debounced identify + people.set ──────────────────────────────
  const identifyTimerRef = useRef(null);
  useEffect(() => {
    if (teamsLoading) return;  // wait until teams are loaded before identifying
    if (identifyTimerRef.current) clearTimeout(identifyTimerRef.current);
    identifyTimerRef.current = setTimeout(() => {
      const primarySlug = userTeams.find(t => t.is_primary)?.team_slug || null;
      const teamSlugs   = userTeams.map(t => t.team_slug);
      // identifyUser sets username, email, favorite_teams (CSV), plan
      identifyUser(user, profile, teamSlugs);
      // merge richer properties that supplement the core person schema
      identify(user.id, {
        display_name:    profile?.display_name,
        favorite_number: profile?.favorite_number != null ? String(profile.favorite_number) : null,
        primary_team:    primarySlug,
        team_count:      teamSlugs.length,
        plan_tier:       profile?.plan_tier || 'free',
        sub_global_briefing:   prefs.global_briefing   ?? DEFAULT_PREFS.global_briefing,
        sub_nfl_picks:         prefs.nfl_picks         ?? DEFAULT_PREFS.nfl_picks,
        sub_mlb_briefing:      prefs.mlb_briefing      ?? DEFAULT_PREFS.mlb_briefing,
        sub_ncaam_briefing:    prefs.ncaam_briefing     ?? DEFAULT_PREFS.ncaam_briefing,
        sub_ncaam_team_digest: prefs.ncaam_team_digest  ?? DEFAULT_PREFS.ncaam_team_digest,
        sub_ncaam_picks:       prefs.ncaam_picks        ?? DEFAULT_PREFS.ncaam_picks,
      });
      setUserProperties({
        primary_team_slug:     primarySlug,
        sub_global_briefing:   prefs.global_briefing   ?? DEFAULT_PREFS.global_briefing,
        sub_nfl_picks:         prefs.nfl_picks         ?? DEFAULT_PREFS.nfl_picks,
        sub_mlb_briefing:      prefs.mlb_briefing      ?? DEFAULT_PREFS.mlb_briefing,
        sub_ncaam_briefing:    prefs.ncaam_briefing     ?? DEFAULT_PREFS.ncaam_briefing,
        sub_ncaam_team_digest: prefs.ncaam_team_digest  ?? DEFAULT_PREFS.ncaam_team_digest,
        sub_ncaam_picks:       prefs.ncaam_picks        ?? DEFAULT_PREFS.ncaam_picks,
        provider:          user.app_metadata?.provider || 'google',
      });
    }, 500);
    return () => { if (identifyTimerRef.current) clearTimeout(identifyTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamsLoading, userTeams, prefs, profile, user.id, user.email]);

  useEffect(() => { loadUserTeams(); }, []);

  // Listen for pinned-team changes from Home and optimistically sync userTeams state.
  useEffect(() => {
    return onPinnedChanged(({ slugs, source }) => {
      if (source !== 'home') return; // DB and settings events are handled separately
      setUserTeams((prev) => {
        const prevSlugs = prev.map((t) => t.team_slug);
        // Skip update when slug set is identical (order-insensitive)
        if (slugArraysEqual(prevSlugs, slugs)) return prev;

        const prevSlugSet = new Set(prevSlugs);
        const nextSlugSet = new Set(slugs);
        const added = slugs
          .filter((s) => !prevSlugSet.has(s))
          .map((slug) => ({
            user_id: user.id,
            team_slug: slug,
            is_primary: false,
            created_at: new Date().toISOString(),
          }));
        const kept = prev.filter((t) => nextSlugSet.has(t.team_slug));
        return [...kept, ...added];
      });
    });
  }, [user.id]);

  async function loadUserTeams() {
    setTeamsLoading(true); setTeamsError('');
    try {
      const sb = getSupabase();
      if (!sb) { setTeamsLoading(false); return; }
      const { data, error } = await sb.from('user_teams').select('*').eq('user_id', user.id).order('created_at');
      if (error) throw error;
      const teams = data || [];

      // NOTE: Previously merged stale localStorage MLB pins directly into
      // user_teams via unvalidated upsert — this was a free-tier bypass
      // (users could end up with >3 teams). Server state is now canonical.
      // If localStorage drifts, usePinnedTeamsSync reconciles it from the
      // server; any pins added via Home already went through the validated
      // /api/teams/pin endpoint, so missing pins are genuinely not pinned.

      setUserTeams(teams);

      // Reconcile the local store to match the database, each team under its sport
      const allSlugs = teams.map((t) => t.team_slug);
      const bySport = splitBySport(allSlugs);

      // College basketball goes through the legacy-compatible helper
      setPinnedTeams(bySport.ncaam);

      try {
        const UNIFIED_KEY = 'maximus-pinned-teams-v2';
        const raw = localStorage.getItem(UNIFIED_KEY);
        const v2 = raw ? JSON.parse(raw) : {};
        v2.ncaam = bySport.ncaam;
        v2.mlb = bySport.mlb;
        v2.nfl = bySport.nfl;
        localStorage.setItem(UNIFIED_KEY, JSON.stringify(v2));
        window.dispatchEvent(new CustomEvent('maximus-pins-updated'));
      } catch { /* quota */ }

      notifyPinnedChanged(allSlugs, 'db');
    } catch (err) {
      setTeamsError(isSchemaMissingError(err) ? 'Service temporarily unavailable.' : 'Could not load your teams.');
    } finally {
      setTeamsLoading(false);
    }
  }

  const enrichedTeams = userTeams
    .map(ut => {
      const teamData = teamBySlug(ut.team_slug);
      return teamData ? { ...ut, teamData, sport: teamData.sport } : null;
    })
    .filter(Boolean);




  /* ── Set Primary — optimistic update with rollback ── */
  async function handleSetPrimary(slug) {
    if (primaryPending) return;
    const sb = getSupabase();
    if (!sb) return;
    setTeamsError('');
    setPrimaryPending(slug);
    const prevTeams = [...userTeams];
    setUserTeams(prev => prev.map(t => ({ ...t, is_primary: t.team_slug === slug })));
    try {
      const { error: e1 } = await sb.from('user_teams').update({ is_primary: false }).eq('user_id', user.id);
      if (e1) throw e1;
      const { error: e2 } = await sb.from('user_teams').update({ is_primary: true }).eq('user_id', user.id).eq('team_slug', slug);
      if (e2) throw e2;
      track('primary_team_set', { team_slug: slug });
    } catch (err) {
      setUserTeams(prevTeams);  // rollback
      setTeamsError(friendlyDbError(err));
    } finally {
      setPrimaryPending(null);
    }
  }

  /* ── Remove team ── */
  async function handleRemoveTeam(slug) {
    setTeamsError('');
    try {
      // Server-validated remove
      const remainingSlugsForTracking = userTeams.filter(t => t.team_slug !== slug).map(t => t.team_slug);
      const result = await serverUnpinTeam(slug, { surface: 'settings', allSlugs: remainingSlugsForTracking });
      if (!result.ok) {
        setTeamsError(result.error || 'Failed to remove team.');
        return;
      }

      const remaining = userTeams.filter(t => t.team_slug !== slug);
      const removedWasPrimary = userTeams.find(t => t.team_slug === slug)?.is_primary;
      if (removedWasPrimary && remaining.length > 0) {
        // Set new primary via direct DB (primary is not part of the pin endpoint)
        const sb = getSupabase();
        if (sb) {
          const newPrimSlug = remaining[0].team_slug;
          await sb.from('user_teams').update({ is_primary: true }).eq('user_id', user.id).eq('team_slug', newPrimSlug);
        }
        setUserTeams(remaining.map((t, i) => ({ ...t, is_primary: i === 0 })));
      } else {
        setUserTeams(remaining);
      }
      const remainingSlugs = remaining.map(t => t.team_slug);
      // Mirror to localStorage
      const removedSport = sportOfSlug(slug);
      if (removedSport === 'ncaam' || !removedSport) removePinnedTeam(slug);
      else { try { removePinnedForSport(removedSport, slug); } catch { /* ignore */ } }
      notifyPinnedChanged(remainingSlugs, 'settings');
      // Canonical tracking fires via serverUnpinTeam → useTeamPin → teamPinTracking
    } catch (err) {
      setTeamsError(typeof err === 'string' ? err : err?.message || 'Failed to remove team.');
    }
  }

  /* ── Add team (server-validated with free-tier gating) ── */
  async function handleAddTeam(slug) {
    if (userTeams.find(t => t.team_slug === slug)) return;

    // Client-side pre-check for instant UX feedback
    if (userTeams.length >= entitlements.maxPinnedTeams) {
      setShowTeamPicker(null);
      setUpgradePrompt({ message: `Free plan supports up to ${entitlements.maxPinnedTeams} pinned teams. Upgrade to Pro for unlimited teams.` });
      return;
    }

    // Server-validated add (source of truth)
    const afterSlugs = [...userTeams.map(t => t.team_slug), slug];
    const result = await serverPinTeam(slug, { surface: 'settings', allSlugs: afterSlugs });
    if (!result.ok) {
      setShowTeamPicker(null);
      setUpgradePrompt({ message: result.error || 'Unable to pin team.' });
      return;
    }

    const isPrimary = userTeams.length === 0;
    setUserTeams(prev => [...prev, { user_id: user.id, team_slug: slug, is_primary: isPrimary, created_at: new Date().toISOString() }]);
    setShowTeamPicker(false);
    // Mirror to localStorage
    try {
      const addedSport = sportOfSlug(slug);
      if (addedSport === 'ncaam' || !addedSport) addPinnedTeam(slug);
      else addPinnedForSport(addedSport, slug);
    } catch { /* ignore */ }
    // Canonical tracking fires via serverPinTeam → useTeamPin → teamPinTracking
  }

  /* ── Shared debounced Supabase preference writer ── */
  function debouncedPrefSave(newPrefs, key, revertFn) {
    setSaveStatus('saving');
    if (saveDebounce.current) clearTimeout(saveDebounce.current);
    saveDebounce.current = setTimeout(async () => {
      try {
        const sb = getSupabase();
        if (!sb) { setSaveStatus('idle'); return; }
        const { error } = await sb.from('profiles').update({ preferences: newPrefs, updated_at: new Date().toISOString() }).eq('id', user.id);
        if (error) throw error;
        setSaveStatus('saved');
        if (key) track('subscription_updated', { key, value: newPrefs[key] });
        setTimeout(() => setSaveStatus('idle'), 2500);
      } catch {
        setSaveStatus('error');
        // Revert UI to match actual DB state on failure
        if (revertFn) revertFn();
      }
    }, 600);
  }

  /* ── Toggle preference (debounced, with revert on failure) ── */
  /** Flip one email choice. A choice can own several keys; they move together. */
  function handleOptionToggle(option) {
    const before = prefs;
    const newPrefs = toggleOption(prefs, option);
    setPrefs(newPrefs);
    track('email_choice_toggled', { choice: option.id, on: newPrefs[option.keys[0]] === true });
    debouncedPrefSave(newPrefs, option.id, () => setPrefs(before));
  }

  /* ── Sign out and clear device ── */
  async function handleClearDevice() {
    setConfirmLoading(true);
    try {
      LS_KEYS_TO_CLEAR.forEach(k => { try { localStorage.removeItem(k); } catch { /* ignore */ } });
      try { sessionStorage.clear(); } catch { /* ignore */ }
      track('device_cleared', {});
      analyticsReset();
      await signOut();
    } finally {
      setConfirmLoading(false);
      setConfirm(null);
    }
  }

  /* ── Reset preferences and teams ── */
  async function handleResetAll() {
    setConfirmLoading(true);
    setResetError('');
    try {
      const sb = getSupabase();
      if (!sb) throw new Error('Auth service is not configured.');
      // Delete all teams for this user
      const { error: teamsErr } = await sb.from('user_teams').delete().eq('user_id', user.id);
      if (teamsErr) throw teamsErr;
      // Reset preferences to {}
      const { error: prefsErr } = await sb.from('profiles').update({ preferences: {}, updated_at: new Date().toISOString() }).eq('id', user.id);
      if (prefsErr) throw prefsErr;
      // Clear localStorage pinned teams cache
      try { setPinnedTeams([]); } catch { /* ignore */ }
      try { localStorage.removeItem('pinnedTeamsHideExample'); } catch { /* ignore */ }

      // Update local state — stay on this page, picker auto-opens
      setUserTeams([]);
      setPrefs({ ...DEFAULT_PREFS });
      onProfileUpdate({ preferences: {} });
      setShowTeamPicker(null);   // user sees the empty state with "Follow your first team"
      track('preferences_reset', {});
      // Notify Home so its pinned list clears immediately
      notifyPinnedChanged([], 'settings');
      setConfirm(null);
    } catch (err) {
      setResetError(friendlyDbError(err));
    } finally {
      setConfirmLoading(false);
    }
  }

  // Only two top-level tabs: Profile (teams + emails + account) and Billing
  const TABS = [
    { id: 'profile', label: 'Profile' },
    { id: 'billing', label: planTier === 'pro' || planRefreshing ? 'Billing ✦' : 'Billing' },
  ];

  const avatar = profileAvatar(profile);
  const cardName = profile?.display_name && profile.display_name !== profile?.username ? profile.display_name : '';
  const teamsBySport = FOLLOW_SPORTS
    .map((sp) => ({ ...sp, followed: enrichedTeams.filter((t) => t.sport === sp.id) }))
    .filter((sp) => sp.followed.length > 0);
  const followsOtherSports = enrichedTeams.some((t) => t.sport === 'mlb' || t.sport === 'ncaam');

  return (
    <div className={styles.premiumProfile}>
     <div className={styles.profileLayout}>

      {/* ── Who you are: card, plan, friends ── */}
      <aside className={styles.profileAside}>
        <PlayerCard sport={avatar.sport} skin={avatar.skin} number={avatar.number} name={cardName} username={profile?.username} size="sm" />
        <div className={styles.asideAccount}>
          <span className={styles.asideEmail}>
            {user.email}
            {planTier === 'pro' && !planRefreshing && <VerifiedBadge className={styles.verifiedInline} />}
          </span>
          {planRefreshing
            ? <span className={styles.billingVerifyingBadge}><SpinnerIcon /></span>
            : <PlanBadge tier={planTier} />}
        </div>
        <div className={styles.asideActions}>
          <button type="button" className={styles.btnOutline} onClick={() => { setShowEditForm(true); setActiveTab('profile'); }}>
            Edit your Maximus
          </button>
          <button type="button" className={styles.btnDanger} onClick={onSignOut} disabled={signingOut}>
            {signingOut ? <><SpinnerIcon /> Signing out…</> : 'Sign out'}
          </button>
        </div>
        <FriendsBlock username={profile?.username} />
      </aside>

      <div className={styles.profileMain}>

      {showEditForm && (
        <div className={styles.profileCard}>
          <EditProfileForm
            user={user}
            profile={profile}
            onSave={(updates) => { onProfileUpdate(updates); setShowEditForm(false); }}
            onCancel={() => setShowEditForm(false)}
          />
        </div>
      )}

      {/* ── Tab Navigation ── */}
      <div className={styles.tabNav} role="tablist">
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`${styles.tabBtn} ${activeTab === tab.id ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ══════════ PROFILE TAB — My Teams + Emails + Account ══════════ */}
      {activeTab === 'profile' && (
        <>
          {/* ── My Teams ── */}
          <div className={styles.profileSection}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>My Teams</h3>
              <span className={styles.sectionHeaderActions}>
                {planTier === 'free' && (
                  <span className={styles.limitChip}>
                    {userTeams.length} of {entitlements.maxPinnedTeams} on the free plan
                  </span>
                )}
                {!showTeamPicker && enrichedTeams.length > 0 && (
                  <button type="button" className={styles.teamsSportAddBtn} onClick={() => setShowTeamPicker(FOLLOW_SPORTS[0].id)}>
                    + Follow a team
                  </button>
                )}
              </span>
            </div>

            {showTeamPicker && (
              <TeamPickerPanel sport={showTeamPicker} existingTeams={userTeams} onAdd={handleAddTeam} onClose={() => setShowTeamPicker(null)} />
            )}

            {teamsError && <p className={styles.sectionError}>{teamsError}</p>}

            {teamsLoading ? (
              <div className={styles.loadingRow}><SpinnerIcon /><span>Loading teams…</span></div>
            ) : enrichedTeams.length === 0 ? (
              !showTeamPicker && (
                <div className={styles.emptyTeams}>
                  <p className={styles.emptyState}>You are not following a team yet. Follow one to put its games, odds and news on your home page.</p>
                  <button type="button" className={styles.btnAddTeam} onClick={() => setShowTeamPicker(FOLLOW_SPORTS[0].id)}>
                    + Follow your first team
                  </button>
                </div>
              )
            ) : (
              <div className={styles.teamsSectioned}>
                {teamsBySport.map((sp) => (
                  <div key={sp.id} className={styles.teamsSportSection}>
                    <div className={styles.teamsSportHeader}>
                      <span className={styles.teamsSportLabel}>{sp.label}</span>
                      <span className={styles.teamsSportCount}>{sp.followed.length}</span>
                    </div>
                    <div className={styles.teamsList}>
                      {sp.followed.map(({ team_slug, is_primary, teamData }) => (
                        <div key={team_slug} className={`${styles.teamsRow} ${is_primary ? styles.teamsRowPrimary : ''}`}>
                          <span className={styles.teamsRowLogo}><TeamMark team={teamData} /></span>
                          <span className={styles.teamsRowInfo}>
                            <span className={styles.teamsRowName}>{teamData.name}</span>
                            <span className={styles.teamsRowConf}>{teamData.group}</span>
                          </span>
                          {is_primary ? (
                            <span className={styles.primaryBadge} title="Your primary team">Primary</span>
                          ) : (
                            <button type="button" className={styles.btnSetPrimary}
                              onClick={() => handleSetPrimary(team_slug)}
                              title="Make primary team"
                              aria-label={`Make ${teamData.name} your primary team`}
                              disabled={!!primaryPending}>
                              <span className={styles.btnSetPrimaryInner}>
                                {primaryPending === team_slug ? <SpinnerIcon /> : '☆'}
                              </span>
                            </button>
                          )}
                          <button type="button" className={styles.btnRemoveTeam}
                            onClick={() => handleRemoveTeam(team_slug)}
                            aria-label={`Stop following ${teamData.name}`}
                            title={`Stop following ${teamData.name}`}>×</button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {planTier === 'free' && userTeams.length >= entitlements.maxPinnedTeams && (
              <div className={styles.limitNudge}>
                <span>The free plan follows {entitlements.maxPinnedTeams} teams.</span>
                <button type="button" className={styles.limitNudgeLink} onClick={() => setActiveTab('billing')}>
                  Upgrade to Pro for unlimited →
                </button>
              </div>
            )}
          </div>

          {/* ── Emails ── */}
          <div className={styles.profileSection}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>Emails</h3>
              <span role="status">
                {saveStatus === 'saved'  && <span className={styles.savedStatus}>Saved ✓</span>}
                {saveStatus === 'saving' && <span className={styles.savingStatus}>Saving…</span>}
                {saveStatus === 'error'  && <span className={styles.errorStatus}>Could not save. Check your connection and try again.</span>}
              </span>
            </div>
            <EmailChoices
              prefs={prefs}
              onToggle={handleOptionToggle}
              notes={{ teams: followsOtherSports ? null : 'You do not follow a baseball or college basketball team yet, so nothing will send.' }}
            />
          </div>

          {/* ── Account ── */}
          <div className={styles.profileSection}>
            <h3 className={styles.sectionTitle}>Account</h3>
            <div className={styles.accountInfo}>
              <div className={styles.accountRow}>
                <span className={styles.accountLabel}>Sign-in provider</span>
                <span className={styles.providerChip}><GoogleIconSmall /> Google</span>
              </div>

              <div className={styles.accountRow}>
                <div className={styles.accountLabelGroup}>
                  <span className={styles.accountLabel}>Sign out and clear device</span>
                  <span className={styles.accountSubtext}>Removes local data on this device only</span>
                </div>
                <button type="button" className={styles.btnClearDevice} onClick={() => setConfirm({ type: 'clear-device' })}>
                  Clear &amp; sign out
                </button>
              </div>

              <div className={styles.accountRow}>
                <div className={styles.accountLabelGroup}>
                  <span className={styles.accountLabel}>Reset teams &amp; preferences</span>
                  <span className={styles.accountSubtext}>Clears pinned teams and email settings</span>
                </div>
                <button type="button" className={styles.btnReset} onClick={() => { setResetError(''); setConfirm({ type: 'reset-all' }); }}>
                  Reset
                </button>
              </div>

              {resetError && <div className={styles.accountRowError}>{resetError}</div>}
            </div>
          </div>

          {/* ── My Brackets ── */}
          <MyBracketsSettingsSection />

          {isAdminUser(user.email) && <AdminQAPanel />}
        </>
      )}

      {/* ══════════ BILLING TAB ══════════ */}
      {activeTab === 'billing' && (
        <BillingSection
          profile={profile}
          planTier={planTier}
          onUpgrade={handleUpgrade}
          onManageBilling={handleManageBilling}
          upgradeLoading={upgradeLoading}
          portalLoading={portalLoading}
          billingNotice={billingNotice}
          planRefreshing={planRefreshing}
          syncNowVisible={syncNowVisible}
          syncNowLoading={syncNowLoading}
          onSyncNow={handleSyncNow}
        />
      )}

      </div>{/* /profileMain */}
     </div>{/* /profileLayout */}

      {/* ── Global modals ── */}
      {upgradePrompt && (
        <UpgradePrompt
          message={upgradePrompt.message}
          onUpgrade={handleUpgrade}
          onClose={() => setUpgradePrompt(null)}
          upgradeLoading={upgradeLoading}
        />
      )}

      {confirm?.type === 'clear-device' && (
        <ConfirmModal
          title="Sign out and clear this device?"
          message="This signs you out and removes the following local data from this browser:"
          bullets={[
            'Pinned teams (device-only cache)',
            'Section collapse states (UI preferences)',
            'Cached AI briefings and session flags',
          ]}
          subtext="Your Maximus account is NOT deleted. All server-side data (profile, teams, preferences) is preserved — sign back in anytime."
          confirmLabel="Clear & sign out"
          danger
          loading={confirmLoading}
          onConfirm={handleClearDevice}
          onCancel={() => setConfirm(null)}
        />
      )}

      {confirm?.type === 'reset-all' && (
        <ConfirmModal
          title="Reset teams and preferences?"
          message="This permanently removes the following from your account:"
          bullets={[
            'All pinned teams (removed from your profile in the database)',
            'Subscription toggles (reset to defaults in the database)',
            'Device-level pinned teams cache',
          ]}
          subtext="Your username, jersey number, email, and sign-in are not affected. You can re-add teams immediately after."
          confirmLabel="Reset"
          danger
          loading={confirmLoading}
          onConfirm={handleResetAll}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

/* ─── Authenticated Settings Panel ──────────────────────────────────────── */
function AuthenticatedSettings({ user }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile]               = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [showWizard, setShowWizard]         = useState(false);
  const [signingOut, setSigningOut]         = useState(false);
  const authSuccessFiredRef                 = useRef(false);
  // track whether this is a brand-new user completing onboarding for the first time
  const wasNewUserRef                       = useRef(false);

  useEffect(() => {
    if (!authSuccessFiredRef.current) {
      authSuccessFiredRef.current = true;
      try {
        const key = 'mx_auth_success_fired';
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, '1');
          track('auth_sign_in_success', { provider: 'google' });
        }
      } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const sb = getSupabase();
      if (!sb) {
        if (!cancelled) { setProfile(null); setProfileLoading(false); setShowWizard(true); wasNewUserRef.current = true; }
        return;
      }
      try {
        const { data } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
        if (!cancelled) {
          setProfile(data);
          setProfileLoading(false);
          // Show wizard if no profile OR if profile shell exists but onboarding
          // was never completed (no username → user never finished step 2/3).
          if (!data || !data.username) { setShowWizard(true); wasNewUserRef.current = !data?.username; }
        }
      } catch {
        if (!cancelled) { setProfile(null); setProfileLoading(false); setShowWizard(true); wasNewUserRef.current = true; }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [user.id]);

  const handleSignOut = async () => {
    setSigningOut(true);
    track('auth_sign_out', {});
    analyticsReset();
    // Clear plan cache so it never leaks to the next user on this device.
    if (user?.id) invalidatePlanCache(user.id);
    await signOut();
  };

  const handleWizardComplete = ({ teamSlugs = [] } = {}) => {
    const isFirstOnboarding = wasNewUserRef.current;
    wasNewUserRef.current = false;
    setShowWizard(false);

    // Redirect to intended destination if present (preserved through the auth flow)
    try {
      const n = new URLSearchParams(window.location.search).get('next');
      if (n && n.startsWith('/') && !n.startsWith('//') && !/^[a-z]+:/i.test(n)) {
        navigate(n, { replace: true });
      }
    } catch { /* ignore */ }

    const sb = getSupabase();
    if (sb) {
      sb.from('profiles').select('*').eq('id', user.id).maybeSingle()
        .then(({ data }) => {
          if (data) {
            setProfile(data);
            invalidateProfileCache(user.id);
            if (isFirstOnboarding) {
              trackOnboardingCompleted(user, data, teamSlugs, {
                method: user.app_metadata?.provider || 'google',
              });
              // Send welcome email (best-effort, non-blocking)
              sb.auth.getSession().then(({ data: { session } }) => {
                if (session?.access_token) {
                  fetch('/api/auth/send-welcome', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${session.access_token}` },
                  }).catch(() => {});
                }
              }).catch(() => {});
            }
          }
        })
        .catch(() => { /* silently ignore */ });
    }
  };

  if (profileLoading) {
    return (
      <div className={styles.loadingWrap}>
        <SpinnerIcon /><span>Loading your profile…</span>
      </div>
    );
  }

  if (showWizard) {
    return (
      <div className={styles.pageNarrow}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Welcome to Maximus Sports</h1>
          <p className={styles.pageSubtitle}>Three quick steps: your teams, your emails, your Maximus.</p>
        </div>
        <OnboardingWizard user={user} onComplete={handleWizardComplete} />
      </div>
    );
  }

  return (
    <>
    <div className={styles.pageHeader}>
      <h1 className={styles.pageTitle}>Settings</h1>
      <p className={styles.pageSubtitle}>Your Maximus, your teams, your emails and your plan.</p>
    </div>
    <PremiumProfile
      user={user}
      profile={profile}
      onProfileUpdate={(updates) => { setProfile(prev => ({ ...prev, ...updates })); invalidateProfileCache(user.id); }}
      onSignOut={handleSignOut}
      signingOut={signingOut}
    />
    </>
  );
}

/* ─── Unauthenticated Onboarding Panel ───────────────────────────────────── */
function UnauthenticatedPanel() {
  const [googleLoading, setGoogleLoading] = useState(false);
  const [emailLoading, setEmailLoading]   = useState(false);
  const [email, setEmail]                 = useState('');
  const [emailSent, setEmailSent]         = useState(false);
  const [error, setError]                 = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const resendTimerRef                      = useRef(null);
  const [showBrowserModal, setShowBrowserModal] = useState(false);
  const [focusEmail, setFocusEmail]       = useState(false);
  const emailInputRef                     = useRef(null);

  useEffect(() => {
    trackSignupViewed();
    // Track embedded browser context for funnel analysis
    if (isEmbeddedBrowser()) {
      track('auth_embedded_browser_detected', {
        source: getEmbeddedSource(),
        platform: getPlatform(),
        referrer: document.referrer?.slice(0, 200) || '',
        auth_mode: 'email_first',
      });
    }
  }, []);

  // Auto-focus email input when user picks "Use email instead" from modal
  useEffect(() => {
    if (focusEmail && emailInputRef.current) {
      emailInputRef.current.focus();
      setFocusEmail(false);
    }
  }, [focusEmail]);

  // Clean up countdown on unmount
  useEffect(() => () => { if (resendTimerRef.current) clearInterval(resendTimerRef.current); }, []);

  function startResendCooldown(seconds) {
    setResendCooldown(seconds);
    if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    resendTimerRef.current = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) { clearInterval(resendTimerRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  const handleGoogle = async () => {
    track('oauth_attempted', {
      provider: 'google',
      embedded_browser_detected: isEmbeddedBrowser(),
      platform: getPlatform(),
      referrer: document.referrer?.slice(0, 200) || '',
    });

    if (isEmbeddedBrowser()) {
      track('oauth_blocked_embedded_browser', {
        provider: 'google',
        embedded_source: getEmbeddedSource(),
        platform: getPlatform(),
        referrer: document.referrer?.slice(0, 200) || '',
      });
      setShowBrowserModal(true);
      return;
    }

    setGoogleLoading(true); setError('');
    const sb = getSupabase();
    if (!sb) { setError('Auth service is not configured. Please contact support.'); setGoogleLoading(false); return; }
    track('auth_start_google', {});
    trackSignupStarted({ method: 'google' });
    // Preserve intended destination from ?next= query
    let oauthNext = '';
    try {
      const n = new URLSearchParams(window.location.search).get('next');
      if (n && n.startsWith('/') && !n.startsWith('//') && !/^[a-z]+:/i.test(n)) {
        oauthNext = `?next=${encodeURIComponent(n)}`;
      }
    } catch { /* ignore */ }

    const { error: oauthErr } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback${oauthNext}` },
    });
    if (oauthErr) {
      track('oauth_error', { provider: 'google', error: oauthErr.message?.slice(0, 200) });
      setError(oauthErr.message);
      setGoogleLoading(false);
    }
  };

  const sendConfirmEmail = async (emailAddress) => {
    setEmailLoading(true); setError('');
    track('auth_start_email', {});
    trackSignupStarted({ method: 'email' });

    // Preserve intended destination from ?next= (set by RouteGate redirects)
    let nextPath = null;
    try {
      const n = new URLSearchParams(window.location.search).get('next');
      if (n && n.startsWith('/') && !n.startsWith('//') && !/^[a-z]+:/i.test(n)) {
        nextPath = n;
      }
    } catch { /* ignore */ }

    try {
      const res = await fetch('/api/auth/send-confirm-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailAddress, next: nextPath }),
      });
      // Endpoint always returns { ok: true } — no enumeration possible
      await res.json().catch(() => ({}));
      setEmailSent(true);
      startResendCooldown(30);
    } catch {
      setError('Could not send confirmation email. Please try again.');
    } finally {
      setEmailLoading(false);
    }
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    await sendConfirmEmail(trimmed);
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || emailLoading) return;
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    await sendConfirmEmail(trimmed);
  };

  const anyLoading = googleLoading || emailLoading;

  // ── "Check your email" premium state ──────────────────────────────────────
  if (emailSent) {
    return (
      <div className={styles.unauthCard}>
        <div className={styles.emailSentPanel}>

          {/* Step indicator */}
          <div className={styles.emailSentStep}>
            <span className={styles.emailSentStepDot} />
            <span className={styles.emailSentStepLine} />
            <span className={styles.emailSentStepDotEmpty} />
            <span className={styles.emailSentStepLine} />
            <span className={styles.emailSentStepDotEmpty} />
            <span className={styles.emailSentStepLabel}>Step 1 of 3 — Confirm Email</span>
          </div>

          {/* Mascot */}
          <div className={styles.emailSentMascotWrap}>
            <img
              src="/mascot.png"
              alt="Maximus Robot"
              className={styles.emailSentMascot}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </div>

          <h2 className={styles.emailSentTitle}>Check your inbox</h2>

          <p className={styles.emailSentDesc}>
            We sent a confirmation link to{' '}
            <strong className={styles.emailSentEmailStr}>{email}</strong>.
          </p>
          <p className={styles.emailSentDescSub}>
            Tap the link in your email to activate your account and start getting personalized intelligence.
          </p>

          {/* What you get */}
          <div className={styles.emailSentFeaturesCard}>
            <span className={styles.emailSentFeaturesTitle}>What you get</span>
            <div className={styles.emailSentFeatures}>
              <div className={styles.emailSentFeatureRow}>
                <span className={styles.emailSentFeatureIcon} aria-hidden="true">✦</span>
                <span>Personalized team briefings every morning</span>
              </div>
              <div className={styles.emailSentFeatureRow}>
                <span className={styles.emailSentFeatureIcon} aria-hidden="true">✦</span>
                <span>ATS edges and line movement intelligence</span>
              </div>
              <div className={styles.emailSentFeatureRow}>
                <span className={styles.emailSentFeatureIcon} aria-hidden="true">✦</span>
                <span>Breaking news and highlights for teams you follow</span>
              </div>
              <div className={styles.emailSentFeatureRow}>
                <span className={styles.emailSentFeatureIcon} aria-hidden="true">✦</span>
                <span>Access to your Maximus Picks dashboard</span>
              </div>
            </div>
          </div>

          <p className={styles.emailSentHint}>
            Email taking a minute? Check <strong>Promotions</strong> or <strong>Spam</strong>.
          </p>

          <button
            type="button"
            className={styles.btnResend}
            onClick={handleResend}
            disabled={resendCooldown > 0 || emailLoading}
          >
            {emailLoading
              ? <><SpinnerIcon /> Sending…</>
              : resendCooldown > 0
                ? `Resend in ${resendCooldown}s`
                : 'Resend email'
            }
          </button>

        </div>
      </div>
    );
  }

  // ── Normal sign-in state ───────────────────────────────────────────────────
  // In embedded browsers (Instagram, Facebook, etc.), Google OAuth is blocked.
  // Show email-first flow to avoid the dead-end modal. Google remains primary
  // for normal browsers where it works reliably.
  const inEmbedded = isEmbeddedBrowser();

  return (
    <div className={styles.unauthCard}>
      <div className={styles.unauthIcon}>
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden>
          <circle cx="20" cy="20" r="19" stroke="var(--color-primary)" strokeWidth="1.5" strokeDasharray="4 3"/>
          <circle cx="20" cy="16" r="5" stroke="var(--color-primary)" strokeWidth="1.5"/>
          <path d="M9 34c0-6.075 4.925-11 11-11s11 4.925 11 11" stroke="var(--color-primary)" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
      <h2 className={styles.unauthTitle}>Join Maximus Sports</h2>
      <p className={styles.unauthSubtitle}>
        {inEmbedded
          ? 'Enter your email to get your personalized picks and intel'
          : 'Your personalized sports intelligence command center'}
      </p>
      <div className={styles.unauthBenefits}>
        <span>✦ AI-powered daily briefings</span>
        <span>✦ Personalized picks & edges</span>
        <span>✦ Real-time team intel alerts</span>
      </div>

      {error && <div className={styles.errorMsg}>{error}</div>}

      {/* Email-first in embedded browsers, Google-first in normal browsers */}
      {inEmbedded ? (
        <>
          <form className={styles.emailForm} onSubmit={handleEmailSubmit} noValidate>
            <input
              ref={emailInputRef}
              type="email"
              className={styles.emailInput}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={anyLoading}
              autoComplete="email"
              aria-label="Email address"
              autoFocus
            />
            <button
              type="submit"
              className={styles.btnEmailSubmit}
              disabled={anyLoading || !email.trim()}
            >
              {emailLoading ? <SpinnerIcon /> : 'Get started with email'}
            </button>
          </form>
          <p className={styles.emailHint}>We'll send a secure sign-in link. No password needed.</p>
        </>
      ) : (
        <>
          <button type="button" className={styles.btnGoogle} onClick={handleGoogle} disabled={anyLoading}>
            {googleLoading ? <SpinnerIcon /> : <GoogleIcon />}
            Continue with Google
          </button>

          <div className={styles.authDivider}>
            <span className={styles.authDividerLine} />
            <span className={styles.authDividerText}>or</span>
            <span className={styles.authDividerLine} />
          </div>

          <form className={styles.emailForm} onSubmit={handleEmailSubmit} noValidate>
            <input
              ref={emailInputRef}
              type="email"
              className={styles.emailInput}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={anyLoading}
              autoComplete="email"
              aria-label="Email address"
            />
            <button
              type="submit"
              className={styles.btnEmailSubmit}
              disabled={anyLoading || !email.trim()}
            >
              {emailLoading ? <SpinnerIcon /> : 'Continue with email'}
            </button>
          </form>
        </>
      )}

      {showBrowserModal && (
        <EmbeddedBrowserModal
          onClose={() => setShowBrowserModal(false)}
          onEmailFallback={() => {
            setShowBrowserModal(false);
            setFocusEmail(true);
          }}
        />
      )}
    </div>
  );
}

/* ─── Settings Page ──────────────────────────────────────────────────────── */
export default function Settings() {
  const { user, loading } = useAuth();
  useEffect(() => { track('settings_view', {}); }, []);

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingWrap}><SpinnerIcon /></div>
      </div>
    );
  }

  if (user) {
    return (
      <div className={styles.page}>
        <AuthenticatedSettings user={user} />
      </div>
    );
  }

  return (
    <div className={`${styles.page} ${styles.pageNarrow}`}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Settings</h1>
        <p className={styles.pageSubtitle}>Sign in to personalize your experience.</p>
      </div>
      <UnauthenticatedPanel />
    </div>
  );
}
