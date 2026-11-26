/**
 * EmailChoices — the list of emails a person can switch on, used in the
 * onboarding step and in Settings. Each row is a real switch: it says what
 * the email is, when it arrives and what is inside.
 */
import { useState } from 'react';
import { groupOptions, isOptionOn } from '../../features/account/emailOptions';
import styles from './EmailChoices.module.css';

function Row({ option, on, onToggle, note, locked = false }) {
  const id = `email-${option.id}`;
  return (
    <div className={`${styles.row} ${on ? styles.rowOn : ''}`}>
      <div className={styles.text}>
        <span className={styles.head}>
          <span id={id} className={styles.label}>{option.label}</span>
          <span className={styles.when}>{option.when}</span>
        </span>
        <span id={`${id}-desc`} className={styles.desc}>{option.description}</span>
        {note && <span className={styles.note}>{note}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={id}
        aria-describedby={`${id}-desc`}
        className={`${styles.switch} ${on ? styles.switchOn : ''}`}
        onClick={() => onToggle(option)}
        disabled={locked}
      >
        <span className={styles.thumb} />
      </button>
    </div>
  );
}

/**
 * `plan` decides what happens to Pro-only emails: left out when it is not
 * given (setup, before there is a plan), shown switched off and locked on
 * the free plan, and a normal switch on Pro.
 */
export default function EmailChoices({ prefs, onToggle, notes = {}, plan }) {
  const groups = groupOptions();
  const allowed = (o) => !o.pro || plan === 'pro' || plan === 'free';
  const current = groups.current.filter(allowed);
  const offseason = groups.offseason.filter(allowed);
  const locked = (o) => Boolean(o.pro) && plan !== 'pro';
  const noteFor = (o) => (locked(o) ? 'Included with Pro. Upgrade under Billing to switch this on.' : notes[o.id]);
  // Open the offseason list if the person already has one of those on.
  const [showOffseason, setShowOffseason] = useState(() => offseason.some((o) => isOptionOn(prefs, o)));

  return (
    <div className={styles.list}>
      {current.map((o) => (
        <Row key={o.id} option={o} on={!locked(o) && isOptionOn(prefs, o)} onToggle={onToggle} note={noteFor(o)} locked={locked(o)} />
      ))}

      {offseason.length > 0 && (
        <div className={styles.offseason}>
          <button
            type="button"
            className={styles.offseasonToggle}
            aria-expanded={showOffseason}
            onClick={() => setShowOffseason((v) => !v)}
          >
            <span>Offseason sports ({offseason.length})</span>
            <span className={styles.offseasonHint}>{showOffseason ? 'Hide' : 'Set up now, starts when the season does'}</span>
          </button>
          {showOffseason && offseason.map((o) => (
            <Row key={o.id} option={o} on={isOptionOn(prefs, o)} onToggle={onToggle} note={notes[o.id]} />
          ))}
        </div>
      )}
    </div>
  );
}
