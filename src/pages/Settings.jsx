import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getSupabase } from '../lib/supabaseClient';
import { TEAMS } from '../data/teams';
import TeamLogo from '../components/shared/TeamLogo';
import { addPinnedTeam, setPinnedTeams } from '../utils/pinnedTeams';
import { notifyPinnedChanged, onPinnedChanged, slugArraysEqual } from '../utils/pinnedSync';
import { track, identify, setUserProperties, analyticsReset } from '../analytics/index';
import styles from './Settings.module.css';

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
  { key: 'briefing',   label: 'Daily AI Briefing',     description: 'Morning digest with Maximus AI analysis' },
  { key: 'teamAlerts', label: 'Pinned Teams Alerts',   description: 'Get notified about game results and news' },
  { key: 'oddsIntel',  label: 'Odds & ATS Intel',      description: 'Odds analysis and ATS trends' },
  { key: 'newsDigest', label: 'Breaking News Digest',  description: 'Important news from your teams and league' },
];

const DEFAULT_PREFS = {
  briefing: true,
  teamAlerts: true,
  oddsIntel: false,
  newsDigest: true,
};

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

      identify(userId, { has_profile: true, team_count: teamSlugs.length });
      track('onboarding_step_submit', { step: 3, success: true });

      setStep(4);
      if (onComplete) onComplete();
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
function TeamPickerPanel({ existingTeams, onAdd, onClose }) {
  const [query, setQuery]   = useState('');
  const [adding, setAdding] = useState(null);
  const inputRef            = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const existingSlugs = existingTeams.map(t => t.team_slug);

  // Show all teams; pinned ones appear last and show disabled "Pinned" state
  const allTeams = TEAMS
    .filter(t =>
      !query ||
      t.name.toLowerCase().includes(query.toLowerCase()) ||
      t.conference.toLowerCase().includes(query.toLowerCase())
    )
    .sort((a, b) => {
      const ap = existingSlugs.includes(a.slug) ? 1 : 0;
      const bp = existingSlugs.includes(b.slug) ? 1 : 0;
      return ap - bp;
    });

  return (
    <div className={styles.pickerPanel}>
      <div className={styles.pickerPanelHeader}>
        <span className={styles.pickerPanelTitle}>Pin a team</span>
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

  const [showEditForm, setShowEditForm] = useState(false);

  // confirm: null | { type: 'clear-device' | 'reset-all' }
  const [confirm, setConfirm]     = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [resetError, setResetError] = useState('');

  // ── PostHog: debounced identify + people.set ──────────────────────────────
  const identifyTimerRef = useRef(null);
  useEffect(() => {
    if (teamsLoading) return;  // wait until teams are loaded before identifying
    if (identifyTimerRef.current) clearTimeout(identifyTimerRef.current);
    identifyTimerRef.current = setTimeout(() => {
      const primarySlug = userTeams.find(t => t.is_primary)?.team_slug || null;
      const teamSlugs   = userTeams.map(t => t.team_slug);
      identify(user.id, {
        email:           user.email,
        username:        profile?.username,
        display_name:    profile?.display_name,
        favorite_number: profile?.favorite_number != null ? String(profile.favorite_number) : null,
        primary_team:    primarySlug,
        team_count:      teamSlugs.length,
      });
      setUserProperties({
        email:             user.email,
        username:          profile?.username,
        display_name:      profile?.display_name,
        favorite_number:   profile?.favorite_number != null ? String(profile.favorite_number) : null,
        primary_team_slug: primarySlug,
        team_slugs:        teamSlugs,
        sub_briefing:      prefs.briefing   ?? DEFAULT_PREFS.briefing,
        sub_teamAlerts:    prefs.teamAlerts  ?? DEFAULT_PREFS.teamAlerts,
        sub_oddsIntel:     prefs.oddsIntel   ?? DEFAULT_PREFS.oddsIntel,
        sub_newsDigest:    prefs.newsDigest  ?? DEFAULT_PREFS.newsDigest,
        provider:          'google',
      });
    }, 500);
    return () => { if (identifyTimerRef.current) clearTimeout(identifyTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamsLoading, userTeams, prefs, profile, user.id, user.email]);

  useEffect(() => { loadUserTeams(); }, []);

  // Listen for pinned-team changes from Home and optimistically sync userTeams state.
  useEffect(() => {
    return onPinnedChanged(({ pinnedSlugs, source }) => {
      if (source !== 'home') return; // DB and settings events are handled separately
      setUserTeams((prev) => {
        const prevSlugs = prev.map((t) => t.team_slug);
        // Skip update when slug list is identical (order-aware)
        if (slugArraysEqual(prevSlugs, pinnedSlugs)) return prev;

        const prevSlugSet = new Set(prevSlugs);
        const nextSlugSet = new Set(pinnedSlugs);
        const added = pinnedSlugs
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
    } catch (err) {
      setTeamsError(friendlyDbError(err));
    }
  }

  /* ── Add team ── */
  async function handleAddTeam(slug) {
    const sb = getSupabase();
    if (!sb) throw new Error('Not connected');
    if (userTeams.find(t => t.team_slug === slug)) return;
    const isPrimary = userTeams.length === 0;
    const { error } = await sb.from('user_teams').insert({
      user_id: user.id, team_slug: slug, is_primary: isPrimary, created_at: new Date().toISOString(),
    });
    if (error) throw new Error(friendlyDbError(error));
    setUserTeams(prev => [...prev, { user_id: user.id, team_slug: slug, is_primary: isPrimary, created_at: new Date().toISOString() }]);
    setShowTeamPicker(false);
    try { addPinnedTeam(slug); } catch { /* ignore */ }
    track('team_pinned', { team_slug: slug });
  }

  /* ── Toggle preference (debounced, confirmed write) ── */
  function handlePrefToggle(key) {
    const newPrefs = { ...prefs, [key]: !prefs[key] };
    setPrefs(newPrefs);
    setSaveStatus('saving');
    if (saveDebounce.current) clearTimeout(saveDebounce.current);
    saveDebounce.current = setTimeout(async () => {
      try {
        const sb = getSupabase();
        if (!sb) { setSaveStatus('idle'); return; }
        const { error } = await sb.from('profiles').update({ preferences: newPrefs, updated_at: new Date().toISOString() }).eq('id', user.id);
        if (error) throw error;
        setSaveStatus('saved');
        track('subscription_updated', { key, value: newPrefs[key] });
        setTimeout(() => setSaveStatus('idle'), 2500);
      } catch {
        setSaveStatus('error');
        // Revert UI on failure so display matches actual DB state
        setPrefs(prev => ({ ...prev, [key]: !prev[key] }));
      }
    }, 600);
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

  return (
    <div className={styles.premiumProfile}>

      {/* ── Profile Header ── */}
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
              <span className={styles.profileEmail}>{user.email}</span>
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

      {/* ── My Teams ── */}
      <div className={styles.profileSection}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>My Teams</h3>
          <button type="button" className={styles.btnAddTeam} onClick={() => setShowTeamPicker(v => !v)}>
            {showTeamPicker ? 'Cancel' : '+ Add team'}
          </button>
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
      </div>

      {/* ── Subscriptions ── */}
      <div className={styles.profileSection}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Subscriptions</h3>
          {saveStatus === 'saved'  && <span className={styles.savedStatus}>Saved ✓</span>}
          {saveStatus === 'saving' && <span className={styles.savingStatus}>Saving…</span>}
          {saveStatus === 'error'  && <span className={styles.errorStatus}>Save failed</span>}
        </div>
        <div className={styles.prefList}>
          {PREFERENCES.map(({ key, label, description }) => (
            <button
              key={key} type="button"
              className={`${styles.prefRow} ${prefs[key] ? styles.prefRowOn : ''}`}
              onClick={() => handlePrefToggle(key)}
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
            <button
              type="button"
              className={styles.btnClearDevice}
              onClick={() => setConfirm({ type: 'clear-device' })}
            >
              Clear &amp; sign out
            </button>
          </div>

          <div className={styles.accountRow}>
            <div className={styles.accountLabelGroup}>
              <span className={styles.accountLabel}>Reset teams &amp; preferences</span>
              <span className={styles.accountSubtext}>Clears pinned teams and subscription settings</span>
            </div>
            <button
              type="button"
              className={styles.btnReset}
              onClick={() => { setResetError(''); setConfirm({ type: 'reset-all' }); }}
            >
              Reset
            </button>
          </div>

          {resetError && <div className={styles.accountRowError}>{resetError}</div>}
        </div>
      </div>

      {/* ── Confirm Modals ── */}
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
          if (!data) { setShowWizard(true); wasNewUserRef.current = true; }
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
    await signOut();
  };

  const handleWizardComplete = () => {
    const isNew = wasNewUserRef.current;
    wasNewUserRef.current = false;
    setShowWizard(false);
    const sb = getSupabase();
    if (sb) {
      sb.from('profiles').select('*').eq('id', user.id).maybeSingle()
        .then(({ data }) => {
          if (data) {
            setProfile(data);
            if (isNew) track('account_created', { provider: 'google' });
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
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const handleGoogle = async () => {
    setLoading(true); setError('');
    const sb = getSupabase();
    if (!sb) { setError('Auth service is not configured. Please contact support.'); setLoading(false); return; }
    track('auth_start_google', {});
    const { error: oauthErr } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/settings` },
    });
    if (oauthErr) { setError(oauthErr.message); setLoading(false); }
  };

  return (
    <div className={styles.unauthCard}>
      <div className={styles.unauthIcon}>
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden>
          <circle cx="20" cy="20" r="19" stroke="var(--color-primary)" strokeWidth="1.5" strokeDasharray="4 3"/>
          <circle cx="20" cy="16" r="5" stroke="var(--color-primary)" strokeWidth="1.5"/>
          <path d="M9 34c0-6.075 4.925-11 11-11s11 4.925 11 11" stroke="var(--color-primary)" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
      <h2 className={styles.unauthTitle}>Create your Maximus profile</h2>
      <p className={styles.unauthSubtitle}>Sync teams, personalize insights, unlock alerts</p>
      <div className={styles.unauthBenefits}>
        <span>✦ Pin your favorite teams</span>
        <span>✦ Personalized ATS insights</span>
        <span>✦ Game alerts &amp; AI briefings</span>
      </div>
      {error && <div className={styles.errorMsg}>{error}</div>}
      <button type="button" className={styles.btnGoogle} onClick={handleGoogle} disabled={loading}>
        {loading ? <SpinnerIcon /> : <GoogleIcon />}
        Continue with Google
      </button>
      <button type="button" className={styles.btnEmailLink} disabled>
        Continue with email — coming soon
      </button>
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
