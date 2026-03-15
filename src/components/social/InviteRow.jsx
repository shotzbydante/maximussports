import { useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import styles from './Social.module.css';

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0].slice(0, 2).toUpperCase();
}

function buildInviteMessage(userId) {
  return `Hey! I'm using Maximus Sports to track games, get AI-powered picks, and build March Madness brackets.\n\nJoin me:\nmaximussports.ai/join?ref=${userId}\n\nYou can follow my picks and build your own bracket too.`;
}

export default function InviteRow({ contact, onInviteTracked }) {
  const { user } = useAuth();
  const [invited, setInvited] = useState(false);

  const handleInvite = useCallback(() => {
    const message = buildInviteMessage(user?.id || 'maximus');
    const smsUrl = `sms:?&body=${encodeURIComponent(message)}`;

    window.open(smsUrl, '_blank');
    setInvited(true);

    if (onInviteTracked) {
      onInviteTracked(contact.phoneHash);
    }
  }, [user?.id, contact.phoneHash, onInviteTracked]);

  return (
    <div className={styles.contactRow}>
      <div className={styles.initialsAvatar}>
        <span>{getInitials(contact.name)}</span>
      </div>
      <div className={styles.contactInfo}>
        <span className={styles.contactName}>{contact.name}</span>
        <span className={styles.contactHandle}>In your contacts</span>
      </div>
      <button
        type="button"
        className={invited ? styles.btnInvited : styles.btnInvite}
        onClick={handleInvite}
        disabled={invited}
      >
        {invited ? 'Invited' : 'Invite'}
      </button>
    </div>
  );
}
