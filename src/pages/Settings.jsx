import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { TEAMS } from '../data/teams';
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

const PREFERENCES = [
  { key: 'alerts_opt_in', label: 'Alerts for my teams', description: 'Get notified about game results and news' },
  { key: 'betting_opt_in', label: 'Betting insights', description: 'Odds analysis and ATS trends' },
  { key: 'tickets_opt_in', label: 'Ticket deals', description: 'Resale alerts and best prices' },
  { key: 'merch_opt_in', label: 'Merch drops', description: 'New gear and limited releases' },
];

/* ─── Sub-components ─────────────────────────────────────────────────────── */
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
          <p className={styles.emptyState}>No teams match "{query}"</p>
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
function StepProfile({ onNext, defaultName = '' }) {
  const [username, setUsername] = useState(defaultName);
  const [number, setNumber] = useState('');
  const [error, setError] = useState('');

  const preview = username.trim()
    ? `${username.trim().toUpperCase()}${number ? ` #${number}` : ''}`
    : '';

  const handleNext = () => {
    if (!username.trim()) {
      setError('Username is required.');
      return;
    }
    if (username.trim().length < 2) {
      setError('Username must be at least 2 characters.');
      return;
    }
    if (number && (isNaN(Number(number)) || Number(number) < 0 || Number(number) > 99)) {
      setError('Jersey number must be between 00 and 99.');
      return;
    }
    onNext({ username: username.trim(), favoriteNumber: number ? parseInt(number, 10) : null });
  };

  const handleNumberChange = (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 2);
    setNumber(val);
    setError('');
  };

  return (
    <div className={styles.step}>
      <h2 className={styles.stepTitle}>Your identity</h2>
      <p className={styles.stepSubtitle}>How should we know you? (Your favorite jersey number is optional.)</p>

      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="username">Username</label>
        <input
          id="username"
          className={styles.input}
          type="text"
          placeholder="e.g. hoops_fan"
          value={username}
          maxLength={32}
          onChange={(e) => { setUsername(e.target.value); setError(''); }}
          autoFocus
        />
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="jersey">Favorite Jersey Number <span className={styles.optional}>(optional)</span></label>
        <input
          id="jersey"
          className={`${styles.input} ${styles.inputNarrow}`}
          type="text"
          inputMode="numeric"
          placeholder="00–99"
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

      <button className={styles.btnPrimary} onClick={handleNext}>
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

  const toggle = (key) => setPrefs((p) => ({ ...p, [key]: !p[key] }));

  return (
    <div className={styles.step}>
      <h2 className={styles.stepTitle}>Personalize your feed</h2>
      <p className={styles.stepSubtitle}>Choose what matters to you. You can change these anytime.</p>

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
  const [error, setError] = useState('');

  const defaultName = user?.user_metadata?.full_name?.split(' ')[0] || '';

  const handleTeams = (slugs) => {
    setTeamSlugs(slugs);
    setStep(2);
  };

  const handleProfile = (data) => {
    setProfileData(data);
    setStep(3);
  };

  const handlePreferences = useCallback(async (prefs) => {
    setSaving(true);
    setError('');
    try {
      const userId = user.id;

      // Upsert profile
      const { error: profileErr } = await supabase.from('profiles').upsert({
        id: userId,
        username: profileData.username,
        display_name: profileData.username,
        favorite_number: profileData.favoriteNumber,
        created_at: new Date().toISOString(),
      });
      if (profileErr) throw profileErr;

      // Insert user_teams (delete existing first to be idempotent)
      await supabase.from('user_teams').delete().eq('user_id', userId);
      const teamRows = teamSlugs.map((slug, i) => ({
        user_id: userId,
        team_slug: slug,
        is_primary: i === 0,
        created_at: new Date().toISOString(),
      }));
      const { error: teamsErr } = await supabase.from('user_teams').insert(teamRows);
      if (teamsErr) throw teamsErr;

      // Upsert user_preferences
      const { error: prefsErr } = await supabase.from('user_preferences').upsert({
        user_id: userId,
        ...prefs,
      });
      if (prefsErr) throw prefsErr;

      setStep(4);
      if (onComplete) onComplete();
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [user, profileData, teamSlugs, onComplete]);

  if (step === 4) return <StepDone />;

  return (
    <div className={styles.wizardCard}>
      <ProgressBar step={step} />
      {error && <div className={styles.wizardError}>{error}</div>}
      {step === 1 && <StepTeams onNext={handleTeams} />}
      {step === 2 && <StepProfile onNext={handleProfile} defaultName={defaultName} />}
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

  if (profileLoading) {
    return (
      <div className={styles.loadingWrap}>
        <SpinnerIcon />
        <span>Loading your profile…</span>
      </div>
    );
  }

  if (showWizard) {
    return <OnboardingWizard user={user} onComplete={() => setShowWizard(false)} />;
  }

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
            {profile?.favorite_number != null && (
              <span className={styles.jerseyBadge}>#{profile.favorite_number}</span>
            )}
          </span>
          <span className={styles.profileEmail}>{user.email}</span>
        </div>
      </div>

      <div className={styles.profileActions}>
        <button
          type="button"
          className={styles.btnOutline}
          onClick={() => setShowWizard(true)}
        >
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
        <span>✦ Game alerts & merch drops</span>
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
