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
import { buildShareMessage } from '../../utils/shareMessageBuilder';
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
  /** 'primary' | 'default' — solid blue (default); 'subtle' — ghost/outline */
  variant = 'default',
  /** kept for backward compat; no longer changes default appearance */
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
          type:      shareType,
          placement,
          team_slug: teamSlug,
          share_id:  shareId,
          fallback:  usedFallback,
          icon_only: iconOnly,
        });
      }
    } catch {
      usedFallback = true;
    }

    const shareTitle = `${TYPE_LABELS[shareType] || 'Maximus Insight'}: ${title}`.slice(0, 150);
    const shareText  = buildShareMessage({
      type: shareType,
      team: title,
      stat: subtitle || undefined,
      record: undefined,
      matchup: subtitle && title ? `${title}` : undefined,
      line: meta || undefined,
      signalType: undefined,
    }).slice(0, 500);

    // result: 'success' | 'copy' | 'cancel' | 'error'
    let result = 'error';

    if (hasNativeShare) {
      try {
        await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
        result = 'success';
      } catch (err) {
        if (err?.name === 'AbortError') {
          // User dismissed the native share sheet — not an error
          result = 'cancel';
        }
        // else fall through to clipboard
      }
    }

    if (result !== 'success' && result !== 'cancel') {
      const toastLabel = title
        ? `Share link copied: ${title.slice(0, 60)}`
        : 'Share link copied';
      try {
        await navigator.clipboard.writeText(shareUrl);
        showToast(toastLabel, { type: 'success' });
        result = 'copy';
      } catch {
        try {
          const el = document.createElement('input');
          el.value = shareUrl;
          document.body.appendChild(el);
          el.select();
          document.execCommand('copy');
          document.body.removeChild(el);
          showToast(toastLabel, { type: 'success' });
          result = 'copy';
        } catch {
          showToast('Copy failed — try long-pressing the link', { type: 'error' });
          result = 'error';
        }
      }
    }

    track('share_click', {
      type:             shareType,
      placement,
      team_slug:        teamSlug,
      has_native_share: hasNativeShare,
      result,
      icon_only:        iconOnly,
      fallback:         usedFallback,
    });

    setBusy(false);
  }, [busy, shareType, title, subtitle, meta, teamSlug, destinationPath, placement, iconOnly]);

  const btnClass = [
    styles.btn,
    variant === 'primary' ? styles.btnPrimary : '',
    variant === 'subtle'  ? styles.btnSubtle  : '',
    iconOnly ? styles.btnIconOnly : '',
    className,
  ].filter(Boolean).join(' ');

  const ariaLabel = iconOnly ? 'Share' : undefined;

  return (
    <button
      type="button"
      className={btnClass}
      onClick={handleShare}
      disabled={busy}
      aria-label={ariaLabel}
      title={iconOnly ? 'Share' : undefined}
      data-testid={testId}
    >
      {busy
        ? <span className={styles.spinner} aria-hidden />
        : <ShareIcon size={iconOnly ? 11 : 14} />
      }
      {!iconOnly && <span className={styles.label}>{label}</span>}
    </button>
  );
}

function ShareIcon({ size = 14 }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}
