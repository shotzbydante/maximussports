import { useState, useCallback, useRef, useEffect } from 'react';
import RobotAvatar from '../profile/RobotAvatar';
import { VerifiedBadge } from '../profile/ProfileAvatar';
import { observeImpression } from '../../analytics/impressions';
import { track } from '../../analytics/index';
import styles from './Social.module.css';

const STATUS_LABELS = {
  none: 'Follow',
  follower: 'Follow Back',
  following: 'Following',
  friends: 'Friends',
};

const STATUS_CLASSES = {
  none: styles.btnFollow,
  follower: styles.btnFollowBack,
  following: styles.btnFollowing,
  friends: styles.btnFriends,
};

export default function ContactRow({ user: contactUser, onFollow, onUnfollow }) {
  const [status, setStatus] = useState(contactUser.followStatus || 'none');
  const [busy, setBusy] = useState(false);
  const rowRef = useRef(null);

  useEffect(() => {
    if (!contactUser?.id || !contactUser.reason) return;
    return observeImpression(
      rowRef.current,
      `sf_${contactUser.id}`,
      () => {
        track('suggested_friend_impression', {
          candidate_user_id: contactUser.id,
          candidate_username: contactUser.username || null,
          candidate_rank: contactUser._rank ?? null,
          reason: contactUser.reason,
          source: 'suggested_friends',
        });
      }
    );
  }, [contactUser?.id, contactUser?.reason, contactUser?.username, contactUser?._rank]);

  const handleClick = useCallback(async () => {
    if (busy) return;
    setBusy(true);

    const prevStatus = status;

    if (status === 'following' || status === 'friends') {
      setStatus(status === 'friends' ? 'follower' : 'none');
      const newStatus = await onUnfollow(contactUser.id);
      if (newStatus === null) {
        setStatus(prevStatus);
      } else {
        setStatus(newStatus);
      }
    } else {
      setStatus(status === 'follower' ? 'friends' : 'following');
      const newStatus = await onFollow(contactUser.id);
      if (newStatus === null) {
        setStatus(prevStatus);
      } else {
        setStatus(newStatus);
      }
    }

    setBusy(false);
  }, [busy, status, contactUser.id, onFollow, onUnfollow]);

  return (
    <div ref={rowRef} className={styles.contactRow}>
      <div className={styles.contactAvatar}>
        <RobotAvatar
          jerseyNumber={contactUser.avatarConfig?.jerseyNumber || ''}
          jerseyColor={contactUser.avatarConfig?.jerseyColor}
          robotColor={contactUser.avatarConfig?.robotColor}
          size={44}
        />
      </div>
      <div className={styles.contactInfo}>
        <span className={styles.contactName}>
          {contactUser.displayName || contactUser.username}
          {contactUser.isPro && <VerifiedBadge className={styles.verifiedBadge} />}
        </span>
        <span className={styles.contactHandle}>
          @{contactUser.username}
          {contactUser.mutualCount > 0 && (
            <span className={styles.mutualBadge}>
              {' · '}{contactUser.mutualCount} mutual{contactUser.mutualCount !== 1 ? 's' : ''}
            </span>
          )}
        </span>
      </div>
      <button
        type="button"
        className={`${STATUS_CLASSES[status] || styles.btnFollow} ${busy ? styles.btnBusy : ''}`}
        onClick={handleClick}
        disabled={busy}
      >
        {STATUS_LABELS[status] || 'Follow'}
      </button>
    </div>
  );
}
