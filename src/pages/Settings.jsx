import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { TEAMS } from '../data/teams';
import { addPinnedTeam } from '../utils/pinnedTeams';
import { track, identify } from '../analytics/index';
import styles from './Settings.module.css';

/* ─── Icons ──────────────────────────────────────────────────────────────── */
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
    <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
    <path d="M2 7l3.5 3.5L12 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const SpinnerIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className={styles.spinner}>
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="10" strokeLinecap="round"/>
  </svg>
);

/* ─── Constants ──────────────────────────────────────────────────────────── */
const TOTAL_STEPS = 3;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

const PREFERENCES = [
  { key: 'alerts_opt_in', label: 'Alerts for my teams', description: 'Get notified about game results and news' },
  { key: 'betting_opt_in', label: 'Betting insights', description: 'Odds analysis and ATS trends' },
  { key: 'tickets_opt_in', label: 'Ticket deals', description: 'Resale alerts and best prices' },
  { key: 'merch_opt_in', label: 'Merch drops', description: 'New gear and limited releases' },
];

function randomJersey() {
  return String(Math.floor(Math.random() * 100)).padStart(2, '0');
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
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(initialSelected);
  const [error, setError] = useState('');

  useEffect(() => {
    track('onboarding_step_view', { step: 1 });
  }, []);

  const filtered = TEAMS.filter((t) =>
    t.name.toLowerCase().includes(query.toLowerCase()) ||
    t.conference.toLowerCase().includes(query.toLowerCase())
  );

  const toggleTeam = (slug) => {
    setSelected((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
    setError('');
  };

  const handleNext = () => {
    if (selected.length === 0) {
      setError('Select at least one team to continue.');
      return;
    }
    track('onboarding_step_submit', { step: 1, success: true, primary_team: selected[0], team_count: selected.length });
    onNext(selected);
  };

  return (
    <div className={styles.step}>
      <h2 className={styles.stepTitle}>Pick your teams</h2>
      <p className={styles.stepSubtitle}>Select one or more teams. Your first pick becomes your primary.</p>

      <div className={styles.searchWrap}>
        <input
          className={styles.searchInput}
          type="search"
          placeholder="Search teams or conferences…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      <div className={styles.teamGrid}>
        {filtered.map((team) => {
          const idx = selected.indexOf(team.slug);
          const isSelected = idx !== -1;
          const isPrimary = idx === 0;
          return (
            <button
              key={team.slug}
              type="button"
              className={`${styles.teamChip} ${isSelected ? styles.teamChipSelected : ''}`}
              onClick={() => toggleTeam(team.slug)}
            >
              {isSelected && (
                <span className={`${styles.teamBadge} ${isPrimary ? styles.teamBadgePrimary : ''}`}>
                  {isPrimary ? '★' : <CheckIcon />}
                </span>
              )}
              <span className={styles.teamChipName}>{team.name}</span>
              <span className={styles.teamChipConf}>{team.conference}</span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className={styles.emptyState}>No teams match &ldquo;{query}&rdquo;</p>
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
  const [username, setUsername] = useState(() => {
    const base = defaultName.toLowerCase().replace(/[^a-z0-9_]/g, '');
    return base.slice(0, 20);
  });
  // D3: prefill jersey with random number
  const [number, setNumber] = useState(randomJersey);
  const [usernameStatus, setUsernameStatus] = useState('idle'); // idle|checking|available|taken
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState('');
  const debounceRef = useRef(null);

  useEffect(() => {
    track('onboarding_step_view', { step: 2 });
  }, []);

  // D2: real-time username validation + debounced uniqueness check
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!username || !USERNAME_RE.test(username)) {
      setUsernameStatus('idle');
      setSuggestions([]);
      return;
    }

    setUsernameStatus('checking');
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', username)
          .maybeSingle();

        // Not taken if no row exists, or the row belongs to the current user
        if (data && data.id !== userId) {
          setUsernameStatus('taken');
          setSuggestions([
            `${username}1`,
            `${username}23`,
            `${username}_fan`,
          ].slice(0, 3));
        } else {
          setUsernameStatus('available');
          setSuggestions([]);
        }
      } catch {
        setUsernameStatus('idle');
      }
    }, 400);

    return () => clearTimeout(debounceRef.current);
  }, [username, userId]);

  const handleUsernameChange = (e) => {
    // strip disallowed chars in real time
    const val = e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
    setUsername(val);
    setError('');
  };

  const handleNumberChange = (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 2);
    setNumber(val);
    setError('');
  };

  // D3: Display preview badge using padded 2-digit format
  const displayNumber = number ? String(parseInt(number, 10)).padStart(2, '0') : '';
  const preview = username.trim()
    ? `${username.trim().toUpperCase()}${displayNumber ? ` #${displayNumber}` : ''}`
    : '';

  const handleNext = () => {
    if (!username.trim()) {
      setError('Username is required.');
      return;
    }
    if (!USERNAME_RE.test(username)) {
      setError('3–20 characters: letters, numbers, underscore only.');
      return;
    }
    if (usernameStatus === 'taken') {
      setError('That username is taken. Choose another or pick a suggestion below.');
      return;
    }
    if (usernameStatus === 'checking') {
      setError('Still checking availability. Please wait a moment.');
      return;
    }
    if (number && (isNaN(Number(number)) || Number(number) < 0 || Number(number) > 99)) {
      setError('Jersey number must be 00–99.');
      return;
    }

    track('onboarding_step_submit', { step: 2, success: true });
    onNext({
      username: username.trim(),
      favoriteNumber: number !== '' ? parseInt(number, 10) : null,
    });
  };

  const usernameHint = () => {
    if (!username || !USERNAME_RE.test(username)) {
      if (username && username.length < 3) return { type: 'warn', text: `${3 - username.length} more character${3 - username.length === 1 ? '' : 's'} needed` };
      if (username && !/^[a-zA-Z0-9_]+$/.test(username)) return { type: 'warn', text: 'Only letters, numbers, underscore allowed' };
      return null;
    }
    if (usernameStatus === 'checking') return { type: 'info', text: 'Checking availability…' };
    if (usernameStatus === 'available') return { type: 'ok', text: '@' + username + ' is available' };
    if (usernameStatus === 'taken') return { type: 'err', text: 'Username taken' };
    return null;
  };

  const hint = usernameHint();

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
            type="text"
            placeholder="e.g. hoops_fan"
            value={username}
            onChange={handleUsernameChange}
            autoFocus
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
          {usernameStatus === 'checking' && <span className={styles.inputSpinner}><SpinnerIcon /></span>}
          {usernameStatus === 'available' && <span className={styles.inputCheck}>✓</span>}
        </div>
        {hint && (
          <span className={`${styles.fieldHint} ${styles[`hint_${hint.type}`]}`}>
            {hint.text}
          </span>
        )}
        {usernameStatus === 'taken' && suggestions.length > 0 && (
          <div className={styles.suggestions}>
            <span className={styles.suggestionLabel}>Try one of these:</span>
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                className={styles.suggestionChip}
                onClick={() => { setUsername(s); setError(''); }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="jersey">
          Favorite Jersey Number <span className={styles.optional}>(00–99)</span>
        </label>
        <input
          id="jersey"
          className={`${styles.input} ${styles.inputNarrow}`}
          type="text"
          inputMode="numeric"
          placeholder="23"
          value={number}
          onChange={handleNumberChange}
        />
      </div>

      {preview && (
        <div className={styles.previewBadge}>
          {preview}
        </div>
      )}

      {error && <p className={styles.errorMsg}>{error}</p>}

      <button
        className={styles.btnPrimary}
        onClick={handleNext}
        disabled={usernameStatus === 'checking'}
      >
        Continue
      </button>
    </div>
  );
}

/* ─── Step 3: Preferences ────────────────────────────────────────────────── */
function StepPreferences({ onNext, loading }) {
  const [prefs, setPrefs] = useState({
    alerts_opt_in: true,
    betting_opt_in: false,
    tickets_opt_in: false,
    merch_opt_in: false,
  });

  useEffect(() => {
    track('onboarding_step_view', { step: 3 });
  }, []);

  const toggle = (key) => setPrefs((p) => ({ ...p, [key]: !p[key] }));

  return (
    <div className={styles.step}>
      <h2 className={styles.stepTitle}>Personalize your feed</h2>
      <p className={styles.stepSubtitle}>Choose what matters to you. Change anytime.</p>

      <div className={styles.prefList}>
        {PREFERENCES.map(({ key, label, description }) => (
          <button
            key={key}
            type="button"
            className={`${styles.prefRow} ${prefs[key] ? styles.prefRowOn : ''}`}
            onClick={() => toggle(key)}
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

  useEffect(() => {
    track('onboarding_complete', {});
  }, []);

  return (
    <div className={`${styles.step} ${styles.stepCenter}`}>
      <div className={styles.doneIcon}>🏆</div>
      <h2 className={styles.stepTitle}>You&apos;re set.</h2>
      <p className={styles.stepSubtitle}>Your dashboard is now personalized.</p>
      <button className={styles.btnPrimary} onClick={() => navigate('/')}>
        Go to Dashboard
      </button>
    </div>
  );
}

/* ─── Onboarding Wizard ──────────────────────────────────────────────────── */
function OnboardingWizard({ user, onComplete }) {
  const [step, setStep] = useState(1);
  const [teamSlugs, setTeamSlugs] = useState([]);
  const [profileData, setProfileData] = useState({});
  const [saving, setSaving] = useState(false);
  const [wizardError, setWizardError] = useState('');

  const defaultName = user?.user_metadata?.full_name?.split(' ')[0] || '';

  // D4: auto-pin primary team to localStorage immediately after step 1
  const handleTeams = (slugs) => {
    setTeamSlugs(slugs);
    if (slugs.length > 0) {
      try { addPinnedTeam(slugs[0]); } catch { /* ignore storage errors */ }
    }
    setStep(2);
  };

  const handleProfile = (data) => {
    setProfileData(data);
    setStep(3);
  };

  const handlePreferences = useCallback(async (prefs) => {
    setSaving(true);
    setWizardError('');
    try {
      const userId = user.id;

      // D2: upsert with onConflict so duplicate usernames give a clear error
      const { error: profileErr } = await supabase.from('profiles').upsert(
        {
          id: userId,
          username: profileData.username,
          display_name: profileData.username,
          favorite_number: profileData.favoriteNumber,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'username' }
      );
      if (profileErr) {
        if (profileErr.code === '23505') {
          track('onboarding_step_submit', { step: 3, success: false, error_code: 'username_conflict' });
          throw new Error('That username was just taken. Go back and choose another.');
        }
        throw profileErr;
      }

      // Idempotently replace user_teams
      await supabase.from('user_teams').delete().eq('user_id', userId);
      const teamRows = teamSlugs.map((slug, i) => ({
        user_id: userId,
        team_slug: slug,
        is_primary: i === 0,
        created_at: new Date().toISOString(),
      }));
      const { error: teamsErr } = await supabase.from('user_teams').insert(teamRows);
      if (teamsErr) throw teamsErr;

      const { error: prefsErr } = await supabase.from('user_preferences').upsert({ user_id: userId, ...prefs });
      if (prefsErr) throw prefsErr;

      // Identify user in analytics (privacy-safe: no email/name)
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
      {step === 2 && (
        <StepProfile
          onNext={handleProfile}
          defaultName={defaultName}
          userId={user.id}
        />
      )}
      {step === 3 && <StepPreferences onNext={handlePreferences} loading={saving} />}
    </div>
  );
}

/* ─── Authenticated Settings Panel ──────────────────────────────────────── */
function AuthenticatedSettings({ user }) {
  const { signOut } = useAuth();
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const authSuccessFiredRef = useRef(false);

  useEffect(() => {
    // D5: auth_success fires once per session after OAuth redirect lands
    if (!authSuccessFiredRef.current) {
      authSuccessFiredRef.current = true;
      try {
        const key = 'mx_auth_success_fired';
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, '1');
          track('auth_success', {});
        }
      } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      if (!cancelled) {
        setProfile(data);
        setProfileLoading(false);
        if (!data) setShowWizard(true);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [user.id]);

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
  };

  const handleEditOpen = () => {
    track('profile_edit_open', {});
    setShowWizard(true);
  };

  if (profileLoading) {
    return (
      <div className={styles.loadingWrap}>
        <SpinnerIcon />
        <span>Loading your profile…</span>
      </div>
    );
  }

  if (showWizard) {
    return <OnboardingWizard user={user} onComplete={() => { setShowWizard(false); }} />;
  }

  // D3: Display jersey as 2 digits
  const jerseyDisplay = profile?.favorite_number != null
    ? String(profile.favorite_number).padStart(2, '0')
    : null;

  return (
    <div className={styles.profileCard}>
      <div className={styles.profileHeader}>
        <div className={styles.avatar}>
          {user.user_metadata?.avatar_url
            ? <img src={user.user_metadata.avatar_url} alt="avatar" className={styles.avatarImg} />
            : <span className={styles.avatarInitial}>{(profile?.username || user.email || 'U')[0].toUpperCase()}</span>
          }
        </div>
        <div className={styles.profileInfo}>
          <span className={styles.profileName}>
            {profile?.username || user.user_metadata?.full_name || 'Maximus Fan'}
            {jerseyDisplay != null && (
              <span className={styles.jerseyBadge}>#{jerseyDisplay}</span>
            )}
          </span>
          <span className={styles.profileEmail}>{user.email}</span>
        </div>
      </div>

      <div className={styles.profileActions}>
        <button type="button" className={styles.btnOutline} onClick={handleEditOpen}>
          Edit profile
        </button>
        <button
          type="button"
          className={styles.btnDanger}
          onClick={handleSignOut}
          disabled={signingOut}
        >
          {signingOut ? <><SpinnerIcon /> Signing out…</> : 'Sign out'}
        </button>
      </div>
    </div>
  );
}

/* ─── Unauthenticated Onboarding Panel ───────────────────────────────────── */
function UnauthenticatedPanel() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogle = async () => {
    setLoading(true);
    setError('');
    track('auth_start_google', {});
    // D1: absolute redirectTo using window.location.origin — works on preview & prod
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/settings` },
    });
    if (oauthErr) {
      setError(oauthErr.message);
      setLoading(false);
    }
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
        <span>✦ Game alerts &amp; merch drops</span>
      </div>

      {error && <div className={styles.errorMsg}>{error}</div>}

      <button
        type="button"
        className={styles.btnGoogle}
        onClick={handleGoogle}
        disabled={loading}
      >
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

  // D5: settings_view on mount
  useEffect(() => {
    track('settings_view', {});
  }, []);

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingWrap}>
          <SpinnerIcon />
        </div>
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
