/**
 * ShareButton — one-click share for insight cards.
 *
 * Props:
 *   shareType       — 'upset_watch' | 'ats_intel' | 'odds_insight' | 'team_intel' | 'matchup' | 'team_card'
 *   title           — insight headline (required)
 *   subtitle        — secondary line (optional)
 *   meta            — small detail, e.g. "ATS: 13–8 last 30" (optional)
 *   teamSlug        — team slug for OG image display (optional)
 *   destinationPath — SPA path to navigate to, e.g. "/teams/duke-blue-devils" (required)
 *   placement       — analytics placement string, e.g. "team_header" (optional)
 *   className       — extra CSS class on root button (optional)
 *   label           — button text (default: "Share")
 *   iconOnly        — render icon only, no text label (default: false)
 *   data-testid     — forwarded to root <button>
 */

import { useState, useCallback } from 'react';
import { track } from '../../analytics/index';
import { showToast } from './Toast';
import styles from './ShareButton.module.css';

const TYPE_LABELS = {
  upset_watch:  'Upset Watch',
  ats_intel:    'ATS Intel',
  odds_insight: 'Odds Insight',
  team_intel:   'Team Intel',
  team_card:    'Team Intel',
  bracket_bust: 'Bracket Bust Alert',
  matchup:      'Matchup Intel',
};

function appendUtm(path) {
  try {
    const sep = path.includes('?') ? '&' : '?';
    return `${path}${sep}utm_source=share&utm_medium=link&utm_campaign=insight_card`;
  } catch {
    return path;
  }
}

function getSessionId() {
  try {
    let id = sessionStorage.getItem('mx_session_id');
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem('mx_session_id', id);
    }
    return id;
  } catch {
    return '';
  }
}

export default function ShareButton({
  shareType = 'team_intel',
  title = '',
  subtitle = '',
  meta = '',
  teamSlug = '',
  destinationPath = '/',
  placement = 'unknown',
  className = '',
  label = 'Share',
  iconOnly = false,
  /** 'primary' — solid filled button for prominent placements */
  variant = 'default',
  /** 'light' — icon/border colour suited to white/light card surfaces */
  surface = 'dark',
  'data-testid': testId,
}) {
  const [busy, setBusy] = useState(false);

  const handleShare = useCallback(async () => {
    if (busy) return;
    setBusy(true);

    const hasNativeShare = typeof navigator !== 'undefined' && !!navigator.share;
    const destWithUtm = appendUtm(destinationPath);
    const origin = typeof window !== 'undefined'
      ? window.location.origin
      : 'https://maximussports.ai';
    const fallbackUrl = `${origin}${destWithUtm}`;

    let shareUrl = fallbackUrl;
    let shareId  = null;
    let usedFallback = false;

    try {
      const res = await fetch('/api/share/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: shareType,
          title: title.slice(0, 120),
          subtitle: subtitle.slice(0, 200),
          meta: meta.slice(0, 80),
          teamSlug,
          destinationPath: destWithUtm,
          sessionId: getSessionId(),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          shareUrl     = data.url;
          shareId      = data.id;
          usedFallback = !!data.fallback;
        }
        track('share_link_created', {
          type: shareType,
          placement,
          team_slug: teamSlug,
          share_id:  shareId,
          fallback:  usedFallback,
        });
      }
    } catch {
      usedFallback = true;
    }

    const shareTitle = `${TYPE_LABELS[shareType] || 'Maximus Insight'}: ${title}`.slice(0, 150);
    const shareText  = [subtitle, meta].filter(Boolean).join(' · ').slice(0, 200)
      || 'March Madness intelligence from Maximus Sports.';

    let success = false;

    if (hasNativeShare) {
      try {
        await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
        success = true;
      } catch (err) {
        if (err?.name === 'AbortError') {
          success = true; // user saw the sheet and dismissed — not a failure
        }
        // else fall through to clipboard
      }
    }

    if (!success) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        showToast('Link copied to clipboard', { type: 'success' });
        success = true;
      } catch {
        try {
          const el = document.createElement('input');
          el.value = shareUrl;
          document.body.appendChild(el);
          el.select();
          document.execCommand('copy');
          document.body.removeChild(el);
          showToast('Link copied', { type: 'success' });
          success = true;
        } catch {
          showToast('Copy failed — try long-pressing the link', { type: 'error' });
        }
      }
    }

    track('share_click', {
      type:             shareType,
      placement,
      team_slug:        teamSlug,
      has_native_share: hasNativeShare,
      success,
      fallback:         usedFallback,
    });

    setBusy(false);
  }, [busy, shareType, title, subtitle, meta, teamSlug, destinationPath, placement]);

  const btnClass = [
    styles.btn,
    variant === 'primary' ? styles.btnPrimary : '',
    iconOnly ? styles.btnIconOnly : '',
    surface === 'light' ? styles.btnSurfaceLight : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      className={btnClass}
      onClick={handleShare}
      disabled={busy}
      aria-label={`Share: ${title || 'this insight'}`}
      title="Share"
      data-testid={testId}
    >
      {busy
        ? <span className={styles.spinner} aria-hidden />
        : <ShareIcon />
      }
      {!iconOnly && <span className={styles.label}>{label}</span>}
    </button>
  );
}

function ShareIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}
