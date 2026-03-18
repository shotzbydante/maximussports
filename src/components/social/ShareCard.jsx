/**
 * ShareCard — generates shareable cards for picks, brackets, and upsets.
 * Used across the app for viral sharing mechanics.
 */

import { useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import RobotAvatar from '../profile/RobotAvatar';
import { showToast } from '../common/Toast';
import { track } from '../../analytics/index';
import styles from './Social.module.css';

function buildShareUrl(type, userId) {
  const base = 'https://maximussports.ai';
  const ref = `ref=${userId || 'maximus'}`;
  switch (type) {
    case 'bracket': return `${base}/bracket?${ref}`;
    case 'upset':   return `${base}?${ref}`;
    default:        return `${base}/join?${ref}`;
  }
}

function buildShareText({ type, picks, bracket, upset, username }) {
  const handle = username ? `@${username}` : '';

  if (type === 'picks' && picks?.length > 0) {
    const pickLines = picks.slice(0, 3).map(p => `  ${p.team} (${p.confidence})`).join('\n');
    return `My picks on Maximus Sports ${handle}\n\n${pickLines}\n\nFollow my picks on Maximus Sports`;
  }

  if (type === 'bracket' && bracket) {
    let text = `My March Madness bracket on Maximus Sports ${handle}\n\n`;
    if (bracket.champion) text += `Champion: ${bracket.champion}\n`;
    if (bracket.finalFour?.length) text += `Final Four: ${bracket.finalFour.join(', ')}\n`;
    if (bracket.biggestUpset) text += `Boldest upset: ${bracket.biggestUpset}\n`;
    text += '\nBuild your bracket here:';
    return text;
  }

  if (type === 'upset' && upset) {
    return `UPSET PICK\nMaximus backs the underdog\n\n${upset.matchup}\nWin probability: ${upset.probability}\n\nGet the full board:`;
  }

  return `Check out my picks on Maximus Sports ${handle}`;
}

export function PicksShareCard({ picks = [], user: cardUser, avatarConfig }) {
  const { user } = useAuth();
  const userId = user?.id;

  const handleShareSms = useCallback(() => {
    const text = buildShareText({ type: 'picks', picks, username: cardUser?.username });
    const url = buildShareUrl('picks', userId);
    const message = `${text}\n${url}`;
    window.open(`sms:?&body=${encodeURIComponent(message)}`, '_blank');
    track('share_card_sms', { type: 'picks' });
  }, [picks, cardUser, userId]);

  const handleCopyLink = useCallback(async () => {
    const url = buildShareUrl('picks', userId);
    try {
      await navigator.clipboard.writeText(url);
      showToast('Share link copied', { type: 'success' });
      track('share_card_copy', { type: 'picks' });
    } catch {
      showToast('Copy failed', { type: 'error' });
    }
  }, [userId]);

  return (
    <div className={styles.shareCard}>
      <div className={styles.shareCardHeader}>
        <span className={styles.shareCardBrand}>Maximus Sports</span>
        <span className={styles.shareCardBadge}>AI Picks</span>
      </div>

      {cardUser && (
        <div className={styles.shareCardUser}>
          <RobotAvatar
            jerseyNumber={avatarConfig?.jerseyNumber || ''}
            jerseyColor={avatarConfig?.jerseyColor}
            robotColor={avatarConfig?.robotColor}
            size={28}
          />
          <div className={styles.shareCardUserInfo}>
            <span className={styles.shareCardDisplayName}>{cardUser.displayName || cardUser.username}</span>
            <span className={styles.shareCardHandle}>@{cardUser.username}</span>
          </div>
        </div>
      )}

      <div className={styles.shareCardContent}>
        {picks.slice(0, 3).map((pick, i) => (
          <div key={i} className={styles.shareCardPick}>
            <span className={styles.shareCardPickTeam}>{pick.team}</span>
            <span className={`${styles.shareCardConfidence} ${
              pick.confidence === 'High' ? styles.confidenceHigh :
              pick.confidence === 'Medium' ? styles.confidenceMedium :
              styles.confidenceLow
            }`}>
              {pick.confidence}
            </span>
          </div>
        ))}
      </div>

      <div className={styles.shareCardFooter}>
        <span className={styles.shareCardCta}>Follow my picks on Maximus Sports</span>
      </div>

      <div className={styles.shareActions}>
        <button type="button" className={`${styles.shareActionBtn} ${styles.shareActionSms}`} onClick={handleShareSms}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
          SMS
        </button>
        <button type="button" className={`${styles.shareActionBtn} ${styles.shareActionCopy}`} onClick={handleCopyLink}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
          </svg>
          Copy Link
        </button>
      </div>
    </div>
  );
}

export function BracketShareCard({ bracket = {}, user: cardUser, avatarConfig }) {
  const { user } = useAuth();
  const userId = user?.id;

  const handleShareSms = useCallback(() => {
    const text = buildShareText({ type: 'bracket', bracket, username: cardUser?.username });
    const url = buildShareUrl('bracket', userId);
    window.open(`sms:?&body=${encodeURIComponent(`${text}\n${url}`)}`, '_blank');
    track('share_card_sms', { type: 'bracket' });
  }, [bracket, cardUser, userId]);

  const handleCopyLink = useCallback(async () => {
    const url = buildShareUrl('bracket', userId);
    try {
      await navigator.clipboard.writeText(url);
      showToast('Share link copied', { type: 'success' });
      track('share_card_copy', { type: 'bracket' });
    } catch {
      showToast('Copy failed', { type: 'error' });
    }
  }, [userId]);

  return (
    <div className={styles.shareCard}>
      <div className={styles.shareCardHeader}>
        <span className={styles.shareCardBrand}>Maximus Sports</span>
        <span className={styles.shareCardBadge}>Bracket</span>
      </div>

      {cardUser && (
        <div className={styles.shareCardUser}>
          <RobotAvatar
            jerseyNumber={avatarConfig?.jerseyNumber || ''}
            jerseyColor={avatarConfig?.jerseyColor}
            robotColor={avatarConfig?.robotColor}
            size={28}
          />
          <div className={styles.shareCardUserInfo}>
            <span className={styles.shareCardDisplayName}>{cardUser.displayName || cardUser.username}</span>
            <span className={styles.shareCardHandle}>@{cardUser.username}</span>
          </div>
        </div>
      )}

      <div className={styles.shareCardContent}>
        {bracket.champion && (
          <div className={styles.shareCardPick}>
            <span className={styles.shareCardPickTeam}>Champion: {bracket.champion}</span>
          </div>
        )}
        {bracket.finalFour?.map((team, i) => (
          <div key={i} className={styles.shareCardPick}>
            <span className={styles.shareCardPickTeam}>Final Four: {team}</span>
          </div>
        ))}
        {bracket.biggestUpset && (
          <div className={styles.shareCardPick}>
            <span className={styles.shareCardPickTeam}>Upset: {bracket.biggestUpset}</span>
            <span className={`${styles.shareCardConfidence} ${styles.confidenceHigh}`}>Bold</span>
          </div>
        )}
      </div>

      <div className={styles.shareCardFooter}>
        <span className={styles.shareCardCta}>Build your bracket on Maximus Sports</span>
      </div>

      <div className={styles.shareActions}>
        <button type="button" className={`${styles.shareActionBtn} ${styles.shareActionSms}`} onClick={handleShareSms}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
          SMS
        </button>
        <button type="button" className={`${styles.shareActionBtn} ${styles.shareActionCopy}`} onClick={handleCopyLink}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
          </svg>
          Copy Link
        </button>
      </div>
    </div>
  );
}

export function UpsetAlertCard({ upset = {}, onShare }) {
  const { user } = useAuth();
  const userId = user?.id;

  const handleShareSms = useCallback(() => {
    const text = buildShareText({ type: 'upset', upset });
    const url = buildShareUrl('upset', userId);
    window.open(`sms:?&body=${encodeURIComponent(`${text}\n${url}`)}`, '_blank');
    track('share_card_sms', { type: 'upset' });
  }, [upset, userId]);

  const handleCopyLink = useCallback(async () => {
    const url = buildShareUrl('upset', userId);
    try {
      await navigator.clipboard.writeText(url);
      showToast('Share link copied', { type: 'success' });
      track('share_card_copy', { type: 'upset' });
    } catch {
      showToast('Copy failed', { type: 'error' });
    }
  }, [userId]);

  return (
    <div className={styles.upsetCard}>
      <div className={styles.upsetBadge}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        UPSET PICK — Maximus backs the underdog
      </div>

      <div className={styles.upsetMatchup}>{upset.matchup}</div>
      <div className={styles.upsetProb}>Win probability: {upset.probability}</div>

      <div className={styles.upsetFooter}>
        Get the full board at maximussports.ai
      </div>

      <div className={styles.shareActions}>
        <button type="button" className={`${styles.shareActionBtn} ${styles.shareActionSms}`} onClick={handleShareSms}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
          SMS
        </button>
        <button type="button" className={`${styles.shareActionBtn} ${styles.shareActionCopy}`} onClick={handleCopyLink}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
          </svg>
          Copy Link
        </button>
      </div>
    </div>
  );
}
