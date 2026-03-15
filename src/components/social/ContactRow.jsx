import { useState, useCallback } from 'react';
import RobotAvatar from '../profile/RobotAvatar';
import { VerifiedBadge } from '../profile/ProfileAvatar';
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

  const handleClick = useCallback(async () => {
    if (busy) return;
    setBusy(true);

    if (status === 'following' || status === 'friends') {
      const newStatus = await onUnfollow(contactUser.id);
      if (newStatus !== null) setStatus(newStatus);
    } else {
      const newStatus = await onFollow(contactUser.id);
      if (newStatus !== null) setStatus(newStatus);
    }

    setBusy(false);
  }, [busy, status, contactUser.id, onFollow, onUnfollow]);

  return (
    <div className={styles.contactRow}>
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
        <span className={styles.contactHandle}>@{contactUser.username}</span>
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
