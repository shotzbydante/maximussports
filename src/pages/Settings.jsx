import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getSupabase } from '../lib/supabaseClient';
import { TEAMS } from '../data/teams';
import TeamLogo from '../components/shared/TeamLogo';
import { addPinnedTeam, setPinnedTeams } from '../utils/pinnedTeams';
import { notifyPinnedChanged, onPinnedChanged, slugArraysEqual } from '../utils/pinnedSync';
import { track, identify, setUserProperties, analyticsReset } from '../analytics/index';
import {
  identifyUser,
  trackAccountCreated,
  trackFavoriteTeamsUpdated,
  trackSignupViewed,
} from '../lib/analytics/posthog';
import styles from './Settings.module.css';
import { showToast } from '../components/common/Toast';
import { ADMIN_EMAIL, isAdminUser } from '../config/admin';
import { effectivePlanTier, getEntitlements, PRO_PRICE_LABEL } from '../lib/entitlements';
import { invalidatePlanCache, markSyncing } from '../hooks/usePlan';

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
    err.code === 'PGRST116' ||
    err.code === 'PGRST204' ||
    err.code === '42P01'
  );
}

function friendlyDbError(err) {
  if (!err) return 'Something went wrong. Please try again.';
  if (isSchemaMissingError(err)) return 'Service temporarily unavailable. Please try again shortly.';
  if (err.code === '23505') return 'That username is already taken.';
  return err.message || 'Something went wrong. Please try again.';
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

/** Map-pin style icon — used for "Pin" action in team picker */
const PinIcon = () => (
  <svg width="11" height="14" viewBox="0 0 11 14" fill="none" aria-hidden>
    <path d="M5.5 1C3.3 1 1.5 2.8 1.5 5c0 3.2 4 8 4 8s4-4.8 4-8c0-2.2-1.8-4-4-4z"
      stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinejoin="round"/>
    <circle cx="5.5" cy="5" r="1.4" fill="currentColor"/>
  </svg>
);

/* ─── Constants ──────────────────────────────────────────────────────────── */
const TOTAL_STEPS = 3;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

const PREFERENCES = [
  { key: 'briefing',    label: 'Daily AI Briefing',     description: 'Morning digest with Maximus AI analysis' },
  { key: 'teamAlerts',  label: 'Pinned Teams Alerts',   description: 'Get notified about game results and news' },
  { key: 'oddsIntel',   label: 'Odds & ATS Intel',      description: 'Odds analysis and ATS trends' },
  { key: 'newsDigest',  label: 'Breaking News Digest',  description: 'Important news from your teams and league' },
  { key: 'teamDigest',  label: 'Team Digest',           description: 'Full editorial digest for selected teams — schedule, ATS, news, videos' },
];

const DEFAULT_PREFS = {
  briefing:        true,
  teamAlerts:      true,
  oddsIntel:       false,
  newsDigest:      true,
  teamDigest:      false,
  teamDigestTeams: [],
};

const TEST_EMAIL_TYPES = [
  { type: 'daily',      label: 'Send Daily AI Briefing (TEST)' },
  { type: 'pinned',     label: 'Send Pinned Teams Alerts (TEST)' },
  { type: 'odds',       label: 'Send Odds & ATS Intel (TEST)' },
  { type: 'news',       label: 'Send Breaking News Digest (TEST)' },
  { type: 'teamDigest', label: 'Send Team Digest (TEST)' },
];

const TIER_STYLE = {
  'Lock':         styles.tierLock,
  'Should be in': styles.tierShould,
  'Work to do':   styles.tierWork,
  'Long shot':    styles.tierLong,
};

const CONF_ORDER = ['Big Ten', 'SEC', 'ACC', 'Big 12', 'Big East'];
const CONFERENCES = [
  'All',
  ...[...new Set(TEAMS.map(t => t.conference))].sort((a, b) => {
    const ai = CONF_ORDER.indexOf(a);
    const bi = CONF_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  }),
];

/* ─── Jersey graphic ─────────────────────────────────────────────────────── */
/**
 * Small jersey SVG that shows the player name and number inside the jersey shape.
 * Always renders — shows "—" when number is absent.
 */
function JerseyGraphic({ name, number }) {
  const displayNum = number ?? '—';
  // Truncate long names to fit inside the jersey
  const displayName = name && name.length > 12 ? name.slice(0, 11) + '…' : (name ?? '');

  return (
    <span
      className={styles.jerseyGraphic}
      aria-label={number ? `Jersey #${number} — ${name}` : 'No jersey number set'}
      title={number ? undefined : 'Add a jersey number in Edit Profile'}
    >
      <svg
        viewBox="0 0 80 64"
        className={styles.jerseySvg}
        aria-hidden
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Jersey body shape */}
        <path
          d="M20 2 L5 18 L14 22 L14 62 L66 62 L66 22 L75 18 L60 2 L50 8 C48 12 32 12 30 8 Z"
          fill="var(--color-primary)"
          stroke="var(--color-primary-hover)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* Jersey number */}
        <text
          x="40"
          y="44"
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={displayNum.length > 2 ? '16' : '20'}
          fontWeight="800"
          fontFamily="var(--font-display), sans-serif"
          fill="white"
          letterSpacing="0"
        >
          {displayNum}
        </text>
        {/* Player name strip at top */}
        {displayName && (
          <text
            x="40"
            y="22"
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="7"
            fontWeight="600"
            fontFamily="var(--font-display), sans-serif"
            fill="rgba(255,255,255,0.85)"
            letterSpacing="0.05em"
            textTransform="uppercase"
          >
            {displayName.toUpperCase()}
          </text>
        )}
      </svg>
    </span>
  );
}

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
  return (
    <div className={styles.progress}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <div
          key={i}
          className={`${styles.progressDot} ${i < step ? styles.progressDotDone : ''} ${i === step - 1 ? styles.progressDotActive : ''}`}
        />
      ))}
      <span className={styles.progressLabel}>Step {step} of {TOTAL_STEPS}</span>
    </div>
  );
}

/* ─── Step 1: Favorite Teams ─────────────────────────────────────────────── */
function StepTeams({ onNext, initialSelected = [] }) {
  const [query, setQuery]             = useState('');
  const [selected, setSelected]       = useState(initialSelected);
  const [conference, setConference]   = useState('All');
  const [topTierOnly, setTopTierOnly] = useState(false);
  const [error, setError]             = useState('');

  useEffect(() => { track('onboarding_step_view', { step: 1 }); }, []);

  const filtered = TEAMS.filter((t) => {
    const matchesConf  = conference === 'All' || t.conference === conference;
    const matchesTier  = !topTierOnly || t.oddsTier === 'Lock' || t.oddsTier === 'Should be in';
    const matchesQuery = !query ||
      t.name.toLowerCase().includes(query.toLowerCase()) ||
      t.conference.toLowerCase().includes(query.toLowerCase());
    return matchesConf && matchesTier && matchesQuery;
  });

  const toggleTeam = (slug) => {
    setSelected((prev) => prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]);
    setError('');
  };

  const handleNext = () => {
    if (selected.length === 0) { setError('Select at least one team to continue.'); return; }
    track('onboarding_step_submit', { step: 1, success: true, primary_team: selected[0], team_count: selected.length });
    onNext(selected);
  };

  return (
    <div className={styles.step}>
      <h2 className={styles.stepTitle}>Pick your teams</h2>
      <p className={styles.stepSubtitle}>Select one or more teams. Your first pick becomes your primary.</p>

      <div className={styles.teamFilters}>
        <input
          className={styles.searchInput}
          type="search"
          placeholder="Search teams or conferences…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <div className={styles.filterRow}>
          <select
            className={styles.confSelect}
            value={conference}
            onChange={(e) => setConference(e.target.value)}
            aria-label="Filter by conference"
          >
            {CONFERENCES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button
            type="button"
            className={`${styles.filterChip} ${topTierOnly ? styles.filterChipActive : ''}`}
            onClick={() => setTopTierOnly(v => !v)}
          >
            Top tier only
          </button>
        </div>
      </div>

      <div className={styles.teamPickList}>
        {filtered.map((team) => {
          const idx        = selected.indexOf(team.slug);
          const isSelected = idx !== -1;
          const isPrimary  = idx === 0;
          return (
            <button
              key={team.slug}
              type="button"
              className={`${styles.teamPickRow} ${isSelected ? styles.teamPickRowSelected : ''}`}
              onClick={() => toggleTeam(team.slug)}
            >
              <span className={styles.teamPickLogo}><TeamLogo team={team} size={24} /></span>
              <span className={styles.teamPickInfo}>
                <span className={styles.teamPickName}>{team.name}</span>
                <span className={styles.teamPickConf}>{team.conference}</span>
              </span>
              <span className={`${styles.teamPickTierBadge} ${TIER_STYLE[team.oddsTier] || ''}`}>
                {team.oddsTier}
              </span>
              <span className={styles.teamPickCheck}>
                {isSelected ? (isPrimary ? '★' : <CheckIcon />) : ''}
              </span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className={styles.emptyState}>No teams match your filters.</p>
        )}
      </div>

      {selected.length > 0 && (
        <p className={styles.selectionHint}>
          {selected.length} selected · Primary: {TEAMS.find((t) => t.slug === selected[0])?.name}
        </p>
      )}

      {error && <p className={styles.errorMsg}>{error}</p>}

      <button className={styles.btnPrimary} onClick={handleNext}>
        Continue
      </button>
    </div>
  );
}

/* ─── Step 2: Username + Jersey ─────────────────────────────────────────── */
function StepProfile({ onNext, defaultName = '', userId }) {
  const [username, setUsername]           = useState(() => {
    const base = defaultName.toLowerCase().replace(/[^a-z0-9_]/g, '');
    return base.slice(0, 20);
  });
  const [number, setNumber]               = useState('');
  const [usernameStatus, setUsernameStatus] = useState('idle');
  const [suggestions, setSuggestions]     = useState([]);
  const [error, setError]                 = useState('');
  const debounceRef                       = useRef(null);

  useEffect(() => { track('onboarding_step_view', { step: 2 }); }, []);

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

  const handleNumberChange = (e) => {
    // Preserve exact input (e.g. "09" stays "09")
    setNumber(e.target.value.replace(/\D/g, '').slice(0, 2));
    setError('');
  };

  const preview = username.trim()
    ? `${username.trim().toUpperCase()}${number ? ` #${number}` : ''}`
    : '';

  const handleNext = () => {
    if (!username.trim()) { setError('Username is required.'); return; }
    if (!USERNAME_RE.test(username)) { setError('3–20 characters: letters, numbers, underscore only.'); return; }
    if (usernameStatus === 'taken') { setError('That username is taken. Choose another or pick a suggestion below.'); return; }
    if (usernameStatus === 'checking') { setError('Still checking availability. Please wait a moment.'); return; }
    if (number && (Number(number) < 0 || Number(number) > 99)) { setError('Jersey number must be 0–99.'); return; }
    track('onboarding_step_submit', { step: 2, success: true });
    onNext({ username: username.trim(), favoriteNumber: number !== '' ? number : null });
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
      <h2 className={styles.stepTitle}>Your identity</h2>
      <p className={styles.stepSubtitle}>How should we know you?</p>

      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="username">Username</label>
        <div className={styles.inputWrap}>
          <input
            id="username"
            className={`${styles.input} ${usernameStatus === 'taken' ? styles.inputError : ''} ${usernameStatus === 'available' ? styles.inputOk : ''}`}
            type="text" placeholder="e.g. hoops_fan" value={username}
            onChange={handleUsernameChange} autoFocus autoComplete="off"
            autoCapitalize="none" spellCheck={false}
          />
          {usernameStatus === 'checking' && <span className={styles.inputSpinner}><SpinnerIcon /></span>}
          {usernameStatus === 'available' && <span className={styles.inputCheck}>✓</span>}
        </div>
        {hint && <span className={`${styles.fieldHint} ${styles[`hint_${hint.type}`]}`}>{hint.text}</span>}
        {usernameStatus === 'taken' && suggestions.length > 0 && (
          <div className={styles.suggestions}>
            <span className={styles.suggestionLabel}>Try one of these:</span>
            {suggestions.map((s) => (
              <button key={s} type="button" className={styles.suggestionChip} onClick={() => { setUsername(s); setError(''); }}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="jersey">
          Favorite Jersey Number <span className={styles.optional}>(0–99, optional)</span>
        </label>
        <input
          id="jersey"
          className={`${styles.input} ${styles.inputNarrow}`}
          type="text" inputMode="numeric" placeholder="23"
          value={number} onChange={handleNumberChange}
        />
      </div>

      {preview && <div className={styles.previewBadge}>{preview}</div>}
      {error && <p className={styles.errorMsg}>{error}</p>}

      <button className={styles.btnPrimary} onClick={handleNext} disabled={usernameStatus === 'checking'}>
        Continue
      </button>
    </div>
  );
}

/* ─── Step 3: Subscriptions ──────────────────────────────────────────────── */
function StepPreferences({ onNext, loading }) {
  const [prefs, setPrefs] = useState({ ...DEFAULT_PREFS });

  useEffect(() => { track('onboarding_step_view', { step: 3 }); }, []);

  return (
    <div className={styles.step}>
      <h2 className={styles.stepTitle}>Personalize your feed</h2>
      <p className={styles.stepSubtitle}>Choose what matters to you. Change anytime.</p>
      <div className={styles.prefList}>
        {PREFERENCES.map(({ key, label, description }) => (
          <button
            key={key} type="button"
            className={`${styles.prefRow} ${prefs[key] ? styles.prefRowOn : ''}`}
            onClick={() => setPrefs(p => ({ ...p, [key]: !p[key] }))}
          >
            <div className={styles.prefText}>
              <span className={styles.prefLabel}>{label}</span>
              <span className={styles.prefDesc}>{description}</span>
            </div>
            <div className={`${styles.toggle} ${prefs[key] ? styles.toggleOn : ''}`}>
              <div className={styles.toggleThumb} />
            </div>
          </button>
        ))}
      </div>
      <button className={styles.btnPrimary} onClick={() => onNext(prefs)} disabled={loading}>
        {loading ? <><SpinnerIcon /> Saving…</> : 'Finish setup'}
      </button>
    </div>
  );
}

/* ─── Step 4: Done ───────────────────────────────────────────────────────── */
function StepDone() {
  const navigate = useNavigate();
  useEffect(() => { track('onboarding_complete', {}); }, []);
  return (
    <div className={`${styles.step} ${styles.stepCenter}`}>
      <div className={styles.doneIcon}>🏆</div>
      <h2 className={styles.stepTitle}>You&apos;re set.</h2>
      <p className={styles.stepSubtitle}>Your dashboard is now personalized.</p>
      <button className={styles.btnPrimary} onClick={() => navigate('/')}>Go to Dashboard</button>
    </div>
  );
}

/* ─── Onboarding Wizard ──────────────────────────────────────────────────── */
function OnboardingWizard({ user, onComplete }) {
  const [step, setStep]               = useState(1);
  const [teamSlugs, setTeamSlugs]     = useState([]);
  const [profileData, setProfileData] = useState({});
  const [saving, setSaving]           = useState(false);
  const [wizardError, setWizardError] = useState('');

  const defaultName = user?.user_metadata?.full_name?.split(' ')[0] || '';

  const handleTeams = (slugs) => {
    setTeamSlugs(slugs);
    if (slugs.length > 0) { try { addPinnedTeam(slugs[0]); } catch { /* ignore */ } }
    setStep(2);
  };

  const handlePreferences = useCallback(async (prefs) => {
    setSaving(true);
    setWizardError('');
    try {
      const sb = getSupabase();
      if (!sb) throw new Error('Auth service is not configured.');
      const userId = user.id;

      const { error: profileErr } = await sb.from('profiles').upsert(
        {
          id:               userId,
          username:         profileData.username,
          display_name:     profileData.username,
          favorite_number:  profileData.favoriteNumber,   // string, exact input preserved
          preferences:      prefs,
          updated_at:       new Date().toISOString(),
        },
        { onConflict: 'id' }
      );
      if (profileErr) {
        if (profileErr.code === '23505') throw new Error('That username was just taken. Go back and choose another.');
        throw new Error(friendlyDbError(profileErr));
      }

      // Idempotently replace user_teams
      await sb.from('user_teams').delete().eq('user_id', userId);
      const teamRows = teamSlugs.map((slug, i) => ({
        user_id: userId, team_slug: slug, is_primary: i === 0, created_at: new Date().toISOString(),
      }));
      const { error: teamsErr } = await sb.from('user_teams').insert(teamRows);
      if (teamsErr) throw new Error(friendlyDbError(teamsErr));

      identifyUser(user, { username: profileData.username }, teamSlugs);
      track('onboarding_step_submit', { step: 3, success: true });

      setStep(4);
      if (onComplete) onComplete({ teamSlugs });
    } catch (err) {
      setWizardError(err.message || 'Something went wrong. Please try again.');
      track('onboarding_step_submit', { step: 3, success: false, error_code: 'save_failed' });
    } finally {
      setSaving(false);
    }
  }, [user, profileData, teamSlugs, onComplete]);

  if (step === 4) return <StepDone />;

  return (
    <div className={styles.wizardCard}>
      <ProgressBar step={step} />
      {wizardError && <div className={styles.wizardError}>{wizardError}</div>}
      {step === 1 && <StepTeams onNext={handleTeams} />}
      {step === 2 && <StepProfile onNext={(d) => { setProfileData(d); setStep(3); }} defaultName={defaultName} userId={user.id} />}
      {step === 3 && <StepPreferences onNext={handlePreferences} loading={saving} />}
    </div>
  );
}

/* ─── Edit Profile Form (inline, no wizard re-entry) ─────────────────────── */
function EditProfileForm({ user, profile, onSave, onCancel }) {
  const [username, setUsername]           = useState(profile?.username || '');
  const [displayName, setDisplayName]     = useState(profile?.display_name || '');
  const [number, setNumber]               = useState(profile?.favorite_number != null ? String(profile.favorite_number) : '');
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
    if (!username.trim()) { setError('Username is required.'); return; }
    if (!USERNAME_RE.test(username)) { setError('3–20 characters: letters, numbers, underscore only.'); return; }
    if (usernameStatus === 'taken') { setError('That username is taken.'); return; }
    if (usernameStatus === 'checking') { setError('Still checking availability.'); return; }
    if (number && (Number(number) < 0 || Number(number) > 99)) { setError('Jersey number must be 0–99.'); return; }

    setSaving(true);
    setError('');
    try {
      const sb = getSupabase();
      if (!sb) throw new Error('Auth service is not configured.');
      const updates = {
        username:        username.trim(),
        display_name:    (displayName.trim() || username.trim()),
        favorite_number: number !== '' ? number : null,
        updated_at:      new Date().toISOString(),
      };
      const { error: dbErr } = await sb.from('profiles').update(updates).eq('id', user.id);
      if (dbErr) throw dbErr;
      // Determine which fields actually changed for the analytics event
      const fieldsChanged = ['username', 'display_name', 'favorite_number'].filter(
        f => updates[f] !== (f === 'favorite_number'
          ? (profile?.favorite_number != null ? String(profile.favorite_number) : null)
          : profile?.[f])
      );
      track('profile_updated', { fields_changed: fieldsChanged });
      onSave(updates);
    } catch (err) {
      setError(friendlyDbError(err));
    } finally {
      setSaving(false);
    }
  };

  const hint = (() => {
    if (!username || !USERNAME_RE.test(username)) return null;
    if (usernameStatus === 'checking') return { type: 'info', text: 'Checking availability…' };
    if (usernameStatus === 'available') return { type: 'ok', text: '@' + username + ' is available' };
    if (usernameStatus === 'taken') return { type: 'err', text: 'Username taken' };
    return null;
  })();

  return (
    <div className={styles.editForm}>
      <div className={styles.editFormHeader}>
        <h3 className={styles.editFormTitle}>Edit Profile</h3>
        <button type="button" className={styles.editFormClose} onClick={onCancel} aria-label="Cancel editing">×</button>
      </div>

      <div className={styles.editFormBody}>
        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="edit-username">Username</label>
          <div className={styles.inputWrap}>
            <input
              id="edit-username"
              className={`${styles.input} ${usernameStatus === 'taken' ? styles.inputError : ''} ${usernameStatus === 'available' ? styles.inputOk : ''}`}
              type="text" placeholder="e.g. hoops_fan" value={username}
              onChange={(e) => { setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20)); setError(''); }}
              autoComplete="off" autoCapitalize="none" spellCheck={false} autoFocus
            />
            {usernameStatus === 'checking' && <span className={styles.inputSpinner}><SpinnerIcon /></span>}
            {usernameStatus === 'available' && <span className={styles.inputCheck}>✓</span>}
          </div>
          {hint && <span className={`${styles.fieldHint} ${styles[`hint_${hint.type}`]}`}>{hint.text}</span>}
          {usernameStatus === 'taken' && suggestions.length > 0 && (
            <div className={styles.suggestions}>
              <span className={styles.suggestionLabel}>Try:</span>
              {suggestions.map((s) => (
                <button key={s} type="button" className={styles.suggestionChip} onClick={() => { setUsername(s); setError(''); }}>{s}</button>
              ))}
            </div>
          )}
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="edit-display">
            Display Name <span className={styles.optional}>(optional)</span>
          </label>
          <input
            id="edit-display"
            className={styles.input}
            type="text" placeholder="Your name"
            value={displayName}
            onChange={(e) => { setDisplayName(e.target.value.slice(0, 40)); setError(''); }}
          />
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="edit-jersey">
            Jersey Number <span className={styles.optional}>(0–99, optional)</span>
          </label>
          <input
            id="edit-jersey"
            className={`${styles.input} ${styles.inputNarrow}`}
            type="text" inputMode="numeric" placeholder="23"
            value={number}
            onChange={(e) => { setNumber(e.target.value.replace(/\D/g, '').slice(0, 2)); setError(''); }}
          />
        </div>

        {error && <p className={styles.errorMsg}>{error}</p>}
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
function TeamPickerPanel({ existingTeams, onAdd, onClose, multiSelect = false, selectedSlugs = [], onToggle }) {
  const [query, setQuery]   = useState('');
  const [adding, setAdding] = useState(null);
  const inputRef            = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const existingSlugs = existingTeams.map(t => t.team_slug);

  const allTeams = TEAMS
    .filter(t =>
      !query ||
      t.name.toLowerCase().includes(query.toLowerCase()) ||
      t.conference.toLowerCase().includes(query.toLowerCase())
    )
    .sort((a, b) => {
      // In multi-select mode, selected teams float to top
      if (multiSelect) {
        const as = selectedSlugs.includes(a.slug) ? -1 : 0;
        const bs = selectedSlugs.includes(b.slug) ? -1 : 0;
        return as - bs;
      }
      const ap = existingSlugs.includes(a.slug) ? 1 : 0;
      const bp = existingSlugs.includes(b.slug) ? 1 : 0;
      return ap - bp;
    });

  const panelTitle = multiSelect ? 'Select digest teams' : 'Pin a team';

  return (
    <div className={styles.pickerPanel}>
      <div className={styles.pickerPanelHeader}>
        <span className={styles.pickerPanelTitle}>{panelTitle}</span>
        <button type="button" className={styles.pickerPanelClose} onClick={onClose} aria-label="Close team picker">×</button>
      </div>
      <div className={styles.pickerPanelSearch}>
        <input
          ref={inputRef}
          className={styles.searchInput}
          type="search" placeholder="Search teams…"
          value={query} onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className={styles.pickerPanelList}>
        {allTeams.map(team => {
          if (multiSelect) {
            // Multi-select: toggle checkbox style
            const isSelected = selectedSlugs.includes(team.slug);
            return (
              <button
                key={team.slug}
                type="button"
                className={`${styles.pickerAddRow} ${isSelected ? styles.pickerAddRowPinned : ''}`}
                onClick={() => onToggle && onToggle(team.slug)}
              >
                <span className={styles.teamPickLogo}><TeamLogo team={team} size={24} /></span>
                <span className={styles.pickerRowInfo}>
                  <span className={styles.teamPickName}>{team.name}</span>
                  <span className={styles.teamPickConf}>{team.conference}</span>
                </span>
                <span className={`${styles.pinAction} ${isSelected ? styles.pinActionPinned : ''}`}>
                  {isSelected ? (
                    <><CheckIcon /><span>Selected</span></>
                  ) : (
                    <span style={{ fontSize: '12px', color: 'var(--color-muted)' }}>Add</span>
                  )}
                </span>
              </button>
            );
          }

          // Single-select / pin mode (original behavior)
          const isAlreadyPinned = existingSlugs.includes(team.slug);
          return (
            <button
              key={team.slug}
              type="button"
              className={`${styles.pickerAddRow} ${isAlreadyPinned ? styles.pickerAddRowPinned : ''}`}
              disabled={isAlreadyPinned || adding === team.slug}
              onClick={async () => {
                if (isAlreadyPinned) return;
                setAdding(team.slug);
                try { await onAdd(team.slug); } catch { /* handled by parent */ }
                setAdding(null);
              }}
            >
              <span className={styles.teamPickLogo}><TeamLogo team={team} size={24} /></span>
              <span className={styles.pickerRowInfo}>
                <span className={styles.teamPickName}>{team.name}</span>
                <span className={styles.teamPickConf}>{team.conference}</span>
              </span>
              <span className={`${styles.pinAction} ${isAlreadyPinned ? styles.pinActionPinned : ''}`}>
                {isAlreadyPinned ? (
                  <><CheckIcon /><span>Pinned</span></>
                ) : adding === team.slug ? (
                  <SpinnerIcon />
                ) : (
                  <><PinIcon /><span>Pin</span></>
                )}
              </span>
            </button>
          );
        })}
        {allTeams.length === 0 && (
          <p className={styles.emptyState}>No teams match your search.</p>
        )}
      </div>
    </div>
  );
}

/* ─── Admin QA Email Panel ───────────────────────────────────────────────── */
function AdminQAPanel() {
  const { user } = useAuth();
  const [sending, setSending] = useState(null);
  const [results, setResults] = useState({});

  const adminEmail = user?.email || '';

  async function handleSendTest(type) {
    if (sending) return;
    setSending(type);
    setResults(prev => ({ ...prev, [type]: null }));
    try {
      // Always fetch a fresh session token at click time — never rely on stale props.
      const sb = getSupabase();
      if (!sb) throw new Error('Not signed in.');
      const { data: { session: freshSession } } = await sb.auth.getSession();
      const token = freshSession?.access_token;
      if (!token) throw new Error('Not signed in — please sign out and back in.');

      const res = await fetch('/api/email/send-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ type }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);

      const ts = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
      setResults(prev => ({ ...prev, [type]: { ok: true, message: `Sent at ${ts}` } }));
      showToast(`Test sent — check ${adminEmail}`, { type: 'success' });
    } catch (err) {
      const ts = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
      setResults(prev => ({ ...prev, [type]: { ok: false, message: err.message || 'Send failed.' } }));
      showToast(err.message || 'Send failed.', { type: 'error' });
    } finally {
      setSending(null);
    }
  }

  return (
    <div className={styles.adminQaCard}>
      <div className={styles.adminQaHeader}>
        <div>
          <h3 className={styles.adminQaTitle}>Admin QA</h3>
          <p className={styles.adminQaSubtitle}>Send yourself test emails for each subscription.</p>
        </div>
        <span className={styles.adminBadge}>Admin</span>
      </div>
      <p className={styles.adminQaSendTo}>Sends to: <strong>{adminEmail}</strong></p>
      <div className={styles.adminQaGrid}>
        {TEST_EMAIL_TYPES.map(({ type, label }) => {
          const result = results[type];
          const isSending = sending === type;
          return (
            <div key={type} className={styles.adminQaRow}>
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
  { label: 'Pinned teams',          free: 'Up to 3',    pro: 'Unlimited' },
  { label: 'Team Digest teams',     free: 'Up to 3',    pro: 'Unlimited' },
  { label: 'Odds Insights',         free: 'Limited',    pro: 'Full access' },
  { label: "Pick'em picks",         free: 'Limited',    pro: 'Unlimited' },
  { label: 'Premium email intel',   free: 'Standard',   pro: 'Premium' },
  { label: 'ATS / spread context',  free: '—',          pro: 'Advanced' },
  { label: 'Intelligence depth',    free: 'Standard',   pro: 'Full depth' },
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
            <span className={styles.upgradePromptLimit}>Unlimited teams everywhere · {PRO_PRICE_LABEL}</span>
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
function PremiumProfile({ user, profile, onProfileUpdate, onSignOut, signingOut }) {
  const { signOut } = useAuth();

  const [userTeams, setUserTeams]         = useState([]);
  const [teamsLoading, setTeamsLoading]   = useState(true);
  const [teamsError, setTeamsError]       = useState('');
  const [showTeamPicker, setShowTeamPicker] = useState(false);
  const [primaryPending, setPrimaryPending] = useState(null);

  const [prefs, setPrefs]           = useState(() => ({ ...DEFAULT_PREFS, ...(profile?.preferences || {}) }));
  const [saveStatus, setSaveStatus] = useState('idle');
  const saveDebounce                = useRef(null);
  const [digestPickerOpen, setDigestPickerOpen] = useState(false);

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
      window.location.href = json.url;
    } catch (err) {
      setUpgradeLoading(false);
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
        sub_briefing:    prefs.briefing   ?? DEFAULT_PREFS.briefing,
        sub_teamAlerts:  prefs.teamAlerts  ?? DEFAULT_PREFS.teamAlerts,
        sub_oddsIntel:   prefs.oddsIntel   ?? DEFAULT_PREFS.oddsIntel,
        sub_newsDigest:  prefs.newsDigest  ?? DEFAULT_PREFS.newsDigest,
      });
      setUserProperties({
        primary_team_slug: primarySlug,
        sub_briefing:      prefs.briefing   ?? DEFAULT_PREFS.briefing,
        sub_teamAlerts:    prefs.teamAlerts  ?? DEFAULT_PREFS.teamAlerts,
        sub_oddsIntel:     prefs.oddsIntel   ?? DEFAULT_PREFS.oddsIntel,
        sub_newsDigest:    prefs.newsDigest  ?? DEFAULT_PREFS.newsDigest,
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
      setUserTeams(teams);
      // Reconcile localStorage to match DB and notify Home
      const dbSlugs = teams.map((t) => t.team_slug);
      setPinnedTeams(dbSlugs);
      notifyPinnedChanged(dbSlugs, 'db');
    } catch (err) {
      setTeamsError(isSchemaMissingError(err) ? 'Service temporarily unavailable.' : 'Could not load your teams.');
    } finally {
      setTeamsLoading(false);
    }
  }

  const enrichedTeams = userTeams
    .map(ut => ({ ...ut, teamData: TEAMS.find(t => t.slug === ut.team_slug) }))
    .filter(ut => ut.teamData);

  const primaryTeam = enrichedTeams.find(t => t.is_primary)?.teamData || enrichedTeams[0]?.teamData;

  const jerseyDisplay = (profile?.favorite_number != null && profile.favorite_number !== '')
    ? String(profile.favorite_number)
    : null;

  const displayName = profile?.display_name || profile?.username ||
    user.user_metadata?.full_name || 'Maximus Fan';

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
    const sb = getSupabase();
    if (!sb) return;
    setTeamsError('');
    try {
      await sb.from('user_teams').delete().eq('user_id', user.id).eq('team_slug', slug);
      const remaining = userTeams.filter(t => t.team_slug !== slug);
      const removedWasPrimary = userTeams.find(t => t.team_slug === slug)?.is_primary;
      if (removedWasPrimary && remaining.length > 0) {
        const newPrimSlug = remaining[0].team_slug;
        const sbI = getSupabase();
        if (sbI) await sbI.from('user_teams').update({ is_primary: true }).eq('user_id', user.id).eq('team_slug', newPrimSlug);
        setUserTeams(remaining.map((t, i) => ({ ...t, is_primary: i === 0 })));
      } else {
        setUserTeams(remaining);
      }
      track('team_unpinned', { team_slug: slug });
      trackFavoriteTeamsUpdated(user.id, remaining.map(t => t.team_slug));
    } catch (err) {
      setTeamsError(friendlyDbError(err));
    }
  }

  /* ── Add team (with free-tier gating) ── */
  async function handleAddTeam(slug) {
    const sb = getSupabase();
    if (!sb) throw new Error('Not connected');
    if (userTeams.find(t => t.team_slug === slug)) return;

    // Free plan: enforce maxPinnedTeams limit
    if (userTeams.length >= entitlements.maxPinnedTeams) {
      setShowTeamPicker(false);
      setUpgradePrompt({ message: `Free plan supports up to ${entitlements.maxPinnedTeams} pinned teams. Upgrade to Pro for unlimited teams.` });
      return;
    }

    const isPrimary = userTeams.length === 0;
    const { error } = await sb.from('user_teams').insert({
      user_id: user.id, team_slug: slug, is_primary: isPrimary, created_at: new Date().toISOString(),
    });
    if (error) throw new Error(friendlyDbError(error));
    setUserTeams(prev => [...prev, { user_id: user.id, team_slug: slug, is_primary: isPrimary, created_at: new Date().toISOString() }]);
    setShowTeamPicker(false);
    try { addPinnedTeam(slug); } catch { /* ignore */ }
    track('team_pinned', { team_slug: slug });
    trackFavoriteTeamsUpdated(user.id, [...userTeams.map(t => t.team_slug), slug]);
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
  function handlePrefToggle(key) {
    const prevValue = prefs[key];
    const newPrefs = { ...prefs, [key]: !prevValue };
    setPrefs(newPrefs);
    // When enabling Team Digest, auto-open the picker if no teams selected yet
    if (key === 'teamDigest' && !prevValue && (!newPrefs.teamDigestTeams || newPrefs.teamDigestTeams.length === 0)) {
      setDigestPickerOpen(true);
    }
    debouncedPrefSave(newPrefs, key, () => setPrefs(prev => ({ ...prev, [key]: prevValue })));
  }

  /* ── Toggle a team in/out of Team Digest selection (with free-tier gating) ── */
  function handleDigestTeamToggle(slug) {
    const prevTeams = Array.isArray(prefs.teamDigestTeams) ? prefs.teamDigestTeams : [];
    const isRemoving = prevTeams.includes(slug);

    // Free plan: block adding beyond limit
    if (!isRemoving && prevTeams.length >= entitlements.maxEmailTeams) {
      setDigestPickerOpen(false);
      setUpgradePrompt({ message: `Free plan supports up to ${entitlements.maxEmailTeams} Team Digest selections. Upgrade to Pro for unlimited.` });
      return;
    }

    const newTeams = isRemoving
      ? prevTeams.filter(s => s !== slug)
      : [...prevTeams, slug];
    const newPrefs = { ...prefs, teamDigestTeams: newTeams };
    setPrefs(newPrefs);
    debouncedPrefSave(newPrefs, 'teamDigestTeams', () => setPrefs(prev => ({ ...prev, teamDigestTeams: prevTeams })));
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
      setShowTeamPicker(false);   // user sees empty state with "Add your first team" CTA
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

  return (
    <div className={styles.premiumProfile}>

      {/* ── Profile Header (always visible) ── */}
      {showEditForm ? (
        <div className={styles.profileCard}>
          <EditProfileForm
            user={user}
            profile={profile}
            onSave={(updates) => { onProfileUpdate(updates); setShowEditForm(false); }}
            onCancel={() => setShowEditForm(false)}
          />
        </div>
      ) : (
        <div className={styles.profileCard}>
          <div className={styles.profileHeader}>
            <div className={styles.avatar}>
              {user.user_metadata?.avatar_url
                ? <img src={user.user_metadata.avatar_url} alt="avatar" className={styles.avatarImg} />
                : <span className={styles.avatarInitial}>{displayName[0].toUpperCase()}</span>
              }
            </div>
            <div className={styles.profileInfo}>
              <div className={styles.profileNameRow}>
                <span className={styles.profileName}>{displayName}</span>
                <JerseyGraphic name={displayName} number={jerseyDisplay} />
              </div>
              <div className={styles.profileEmailRow}>
                <span className={styles.profileEmail}>{user.email}</span>
                {planRefreshing
                  ? <span className={styles.billingVerifyingBadge}><SpinnerIcon /></span>
                  : <PlanBadge tier={planTier} />
                }
              </div>
            </div>
          </div>

          <div className={styles.profileActions}>
            <button type="button" className={styles.btnOutline} onClick={() => setShowEditForm(true)}>
              Edit profile
            </button>
            <button type="button" className={styles.btnDanger} onClick={onSignOut} disabled={signingOut}>
              {signingOut ? <><SpinnerIcon /> Signing out…</> : 'Sign out'}
            </button>
          </div>
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

      {/* ══════════ PROFILE TAB — My Teams + Email Subscriptions + Account ══════════ */}
      {activeTab === 'profile' && (
        <>
          {/* ── My Teams ── */}
          <div className={styles.profileSection}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>My Teams</h3>
              <div className={styles.sectionHeaderRight}>
                {planTier === 'free' && (
                  <span className={styles.limitChip}>
                    {userTeams.length}/{entitlements.maxPinnedTeams} free
                  </span>
                )}
                <button type="button" className={styles.btnAddTeam} onClick={() => setShowTeamPicker(v => !v)}>
                  {showTeamPicker ? 'Cancel' : '+ Add team'}
                </button>
              </div>
            </div>

            {showTeamPicker && (
              <TeamPickerPanel existingTeams={userTeams} onAdd={handleAddTeam} onClose={() => setShowTeamPicker(false)} />
            )}

            {teamsError && <p className={styles.sectionError}>{teamsError}</p>}

            {teamsLoading ? (
              <div className={styles.loadingRow}><SpinnerIcon /><span>Loading teams…</span></div>
            ) : enrichedTeams.length === 0 ? (
              <div className={styles.emptyTeams}>
                <p className={styles.emptyState}>No teams added yet.</p>
                {!showTeamPicker && (
                  <button type="button" className={styles.btnAddTeam} onClick={() => setShowTeamPicker(true)}>
                    + Add your first team
                  </button>
                )}
              </div>
            ) : (
              <div className={styles.teamsList}>
                {enrichedTeams.map(({ team_slug, is_primary, teamData }) => (
                  <div key={team_slug} className={`${styles.teamsRow} ${is_primary ? styles.teamsRowPrimary : ''}`}>
                    <span className={styles.teamsRowLogo}><TeamLogo team={teamData} size={26} /></span>
                    <span className={styles.teamsRowInfo}>
                      <span className={styles.teamsRowName}>{teamData.name}</span>
                      <span className={styles.teamsRowConf}>{teamData.conference}</span>
                    </span>
                    <span className={`${styles.tierBadge} ${TIER_STYLE[teamData.oddsTier] || ''}`}>{teamData.oddsTier}</span>
                    {is_primary ? (
                      <span className={styles.primaryStar} title="Primary team" aria-label="Primary team">★</span>
                    ) : (
                      <button
                        type="button"
                        className={styles.btnSetPrimary}
                        onClick={() => handleSetPrimary(team_slug)}
                        title="Make primary team"
                        aria-label={`Make ${teamData.name} your primary team`}
                        disabled={!!primaryPending}
                      >
                        <span className={styles.btnSetPrimaryInner}>
                          {primaryPending === team_slug ? <SpinnerIcon /> : '☆'}
                        </span>
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.btnRemoveTeam}
                      onClick={() => handleRemoveTeam(team_slug)}
                      aria-label={`Remove ${teamData.name}`}
                      title={`Remove ${teamData.name}`}
                    >×</button>
                  </div>
                ))}
              </div>
            )}

            {planTier === 'free' && userTeams.length >= entitlements.maxPinnedTeams && (
              <div className={styles.limitNudge}>
                <span>Free plan: {entitlements.maxPinnedTeams} pinned teams max.</span>
                <button type="button" className={styles.limitNudgeLink} onClick={() => setActiveTab('billing')}>
                  Upgrade to Pro for unlimited →
                </button>
              </div>
            )}
          </div>

          {/* ── Email Subscriptions ── */}
          <div className={styles.profileSection}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>Email Subscriptions</h3>
              {saveStatus === 'saved'  && <span className={styles.savedStatus}>Saved ✓</span>}
              {saveStatus === 'saving' && <span className={styles.savingStatus}>Saving…</span>}
              {saveStatus === 'error'  && <span className={styles.errorStatus}>Save failed</span>}
            </div>
            <div className={styles.prefList}>
              {PREFERENCES.map(({ key, label, description }) => {
                const isOn = !!prefs[key];
                const isTeamDigest = key === 'teamDigest';

                const toggleRow = (
                  <button
                    type="button"
                    className={`${styles.prefRow} ${isOn ? styles.prefRowOn : ''}`}
                    onClick={() => handlePrefToggle(key)}
                  >
                    <div className={styles.prefText}>
                      <span className={styles.prefLabel}>{label}</span>
                      <span className={styles.prefDesc}>{description}</span>
                    </div>
                    <div className={`${styles.toggle} ${isOn ? styles.toggleOn : ''}`}>
                      <div className={styles.toggleThumb} />
                    </div>
                  </button>
                );

                if (!isTeamDigest) return <div key={key}>{toggleRow}</div>;

                return (
                  <div key={key} className={`${styles.teamDigestCard} ${isOn ? styles.teamDigestCardOn : ''}`}>
                    {toggleRow}
                    {isOn && (
                      <div className={styles.digestTeamSelector}>
                        <div className={styles.digestTeamSelectorHeader}>
                          <span className={styles.digestTeamSelectorLabel}>
                            Digest teams
                            {Array.isArray(prefs.teamDigestTeams) && prefs.teamDigestTeams.length > 0
                              ? ` (${prefs.teamDigestTeams.length}${planTier === 'free' ? `/${entitlements.maxEmailTeams}` : ''} selected)`
                              : ' — select at least one'}
                          </span>
                          <button type="button" className={styles.btnAddTeam} onClick={() => setDigestPickerOpen(v => !v)}>
                            {digestPickerOpen ? 'Done' : '+ Add teams'}
                          </button>
                        </div>

                        {Array.isArray(prefs.teamDigestTeams) && prefs.teamDigestTeams.length > 0 && (
                          <div className={styles.digestTeamChips}>
                            {prefs.teamDigestTeams.map(slug => {
                              const teamData = TEAMS.find(t => t.slug === slug);
                              if (!teamData) return null;
                              return (
                                <span key={slug} className={styles.digestTeamChip}>
                                  <TeamLogo team={teamData} size={14} />
                                  <span className={styles.digestTeamChipName}>{teamData.name}</span>
                                  <button type="button" className={styles.digestTeamChipRemove} onClick={() => handleDigestTeamToggle(slug)} aria-label={`Remove ${teamData.name} from Team Digest`}>×</button>
                                </span>
                              );
                            })}
                          </div>
                        )}

                        {digestPickerOpen && (
                          <div className={styles.digestPickerWrap}>
                            <TeamPickerPanel
                              existingTeams={(prefs.teamDigestTeams || []).map(slug => ({ team_slug: slug }))}
                              onAdd={(slug) => { handleDigestTeamToggle(slug); }}
                              onClose={() => setDigestPickerOpen(false)}
                              multiSelect
                              selectedSlugs={prefs.teamDigestTeams || []}
                              onToggle={handleDigestTeamToggle}
                            />
                          </div>
                        )}

                        {planTier === 'free' && Array.isArray(prefs.teamDigestTeams) && prefs.teamDigestTeams.length >= entitlements.maxEmailTeams && (
                          <div className={styles.limitNudge}>
                            <span>Free plan: {entitlements.maxEmailTeams} digest teams max.</span>
                            <button type="button" className={styles.limitNudgeLink} onClick={() => setActiveTab('billing')}>
                              Upgrade to Pro for unlimited →
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
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
          if (!data || !data.username) { setShowWizard(true); wasNewUserRef.current = !data; }
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
    const isNew = wasNewUserRef.current;
    wasNewUserRef.current = false;
    setShowWizard(false);
    const sb = getSupabase();
    if (sb) {
      sb.from('profiles').select('*').eq('id', user.id).maybeSingle()
        .then(({ data }) => {
          if (data) {
            setProfile(data);
            if (isNew) {
              trackAccountCreated(user, data, teamSlugs, {
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
    return <OnboardingWizard user={user} onComplete={handleWizardComplete} />;
  }

  return (
    <PremiumProfile
      user={user}
      profile={profile}
      onProfileUpdate={(updates) => setProfile(prev => ({ ...prev, ...updates }))}
      onSignOut={handleSignOut}
      signingOut={signingOut}
    />
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

  useEffect(() => { trackSignupViewed(); }, []);

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
    setGoogleLoading(true); setError('');
    const sb = getSupabase();
    if (!sb) { setError('Auth service is not configured. Please contact support.'); setGoogleLoading(false); return; }
    track('auth_start_google', {});
    const { error: oauthErr } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/settings` },
    });
    if (oauthErr) { setError(oauthErr.message); setGoogleLoading(false); }
  };

  const sendConfirmEmail = async (emailAddress) => {
    setEmailLoading(true); setError('');
    track('auth_start_email', {});
    try {
      const res = await fetch('/api/auth/send-confirm-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailAddress }),
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

          {/* Envelope icon */}
          <div className={styles.emailSentIconWrap} aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect x="2" y="6" width="24" height="17" rx="2.5" stroke="var(--color-primary)" strokeWidth="1.5"/>
              <path d="M2 9l12 8 12-8" stroke="var(--color-primary)" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
          </div>

          <h2 className={styles.emailSentTitle}>Check your inbox</h2>

          <p className={styles.emailSentDesc}>
            We sent a confirmation link to{' '}
            <strong className={styles.emailSentEmailStr}>{email}</strong>.
            Tap the button in the email to confirm your account and get started.
          </p>

          <p className={styles.emailSentHint}>
            Not seeing it? Check your <strong>Promotions</strong> or <strong>Spam</strong> folder.
          </p>

          {/* What you'll get — compact 3-feature row */}
          <div className={styles.emailSentFeatures}>
            <div className={styles.emailSentFeatureRow}>
              <span className={styles.emailSentFeatureIcon} aria-hidden="true">✦</span>
              <span>Personalized team briefings</span>
            </div>
            <div className={styles.emailSentFeatureRow}>
              <span className={styles.emailSentFeatureIcon} aria-hidden="true">✦</span>
              <span>ATS and line movement insights</span>
            </div>
            <div className={styles.emailSentFeatureRow}>
              <span className={styles.emailSentFeatureIcon} aria-hidden="true">✦</span>
              <span>News and video highlights</span>
            </div>
          </div>

          {/* Resend link with cooldown */}
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
  return (
    <div className={styles.unauthCard}>
      <div className={styles.unauthIcon}>
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden>
          <circle cx="20" cy="20" r="19" stroke="var(--color-primary)" strokeWidth="1.5" strokeDasharray="4 3"/>
          <circle cx="20" cy="16" r="5" stroke="var(--color-primary)" strokeWidth="1.5"/>
          <path d="M9 34c0-6.075 4.925-11 11-11s11 4.925 11 11" stroke="var(--color-primary)" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
      <h2 className={styles.unauthTitle}>Create your Maximus Sports profile</h2>
      <p className={styles.unauthSubtitle}>Sync teams, personalize insights, unlock alerts</p>
      <div className={styles.unauthBenefits}>
        <span>✦ Pin your favorite teams</span>
        <span>✦ Personalized ATS insights</span>
        <span>✦ Game alerts &amp; AI briefings</span>
      </div>

      {error && <div className={styles.errorMsg}>{error}</div>}

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

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Settings</h1>
        <p className={styles.pageSubtitle}>
          {user ? 'Manage your profile and preferences.' : 'Sign in to personalize your experience.'}
        </p>
      </div>
      {user ? <AuthenticatedSettings user={user} /> : <UnauthenticatedPanel />}
    </div>
  );
}
