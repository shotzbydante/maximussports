/**
 * AvatarStudio — build your Maximus.
 *
 * A player card on the left that updates as you go, and five choices on the
 * right: sport, robot colour, uniform colour, number and name. Used in the
 * last onboarding step and in Edit profile.
 *
 * value: { sport, skin, uniform, number, name }   onChange(nextValue)
 */
import { useId } from 'react';
import MaximusAvatar from './MaximusAvatar';
import { AVATAR_SPORTS, AVATAR_SKINS, AVATAR_UNIFORMS } from '../../brand/avatar';
import styles from './AvatarStudio.module.css';

export const NAME_MAX = 18;

/** The card on its own, for places that only show it (the "you're in" screen, the profile header). */
export function PlayerCard({ sport, skin, uniform, number, name, username, size = 'lg' }) {
  const sportLabel = AVATAR_SPORTS.find((s) => s.id === sport)?.label || '';
  const shown = (name || '').trim() || (username ? `@${username}` : 'Your name');
  return (
    <div className={`${styles.card} ${size === 'sm' ? styles.cardSm : ''}`}>
      <span className={styles.cardNumber} aria-hidden="true">{number || 'M'}</span>
      <div className={styles.cardArt}>
        <MaximusAvatar sport={sport} skin={skin} uniform={uniform} number={number} size={size === 'sm' ? 170 : 250} crop="full" title={`${shown}, ${sportLabel} Maximus`} />
      </div>
      <div className={styles.plate}>
        <span className={styles.plateName}>{shown}</span>
        <span className={styles.plateMeta}>
          {number ? `No. ${number}` : 'No number'}
          <i aria-hidden="true" />
          {sportLabel}
          {username && (name || '').trim() ? <><i aria-hidden="true" />@{username}</> : null}
        </span>
      </div>
    </div>
  );
}

/** One row of colour choices. A radio group, so arrow keys move between colours. */
function Swatches({ legend, name, options, value, onPick }) {
  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>
        {legend} <span className={styles.legendValue}>{options.find((c) => c.hex === value)?.label}</span>
      </legend>
      <div className={styles.swatches}>
        {options.map((c) => (
          <label key={c.id} className={`${styles.swatch} ${value === c.hex ? styles.swatchOn : ''}`} style={{ '--swatch': c.hex }} title={c.label}>
            <input
              type="radio"
              name={name}
              className={styles.srOnly}
              checked={value === c.hex}
              onChange={() => onPick(c.hex)}
              aria-label={c.label}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function AvatarStudio({ value, onChange, username }) {
  const id = useId();
  const set = (patch) => onChange({ ...value, ...patch });

  return (
    <div className={styles.studio}>
      <PlayerCard {...value} username={username} />

      <div className={styles.controls}>
        <fieldset className={styles.group}>
          <legend className={styles.legend}>Sport</legend>
          <div className={styles.sports}>
            {AVATAR_SPORTS.map((s) => (
              <label key={s.id} className={`${styles.sport} ${value.sport === s.id ? styles.sportOn : ''}`}>
                <input
                  type="radio"
                  name={`${id}-sport`}
                  className={styles.srOnly}
                  checked={value.sport === s.id}
                  onChange={() => set({ sport: s.id })}
                />
                <MaximusAvatar sport={s.id} skin={value.skin} uniform={value.uniform} size={52} crop="head" title="" />
                <span>{s.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <Swatches
          legend="Robot colour"
          name={`${id}-skin`}
          options={AVATAR_SKINS}
          value={value.skin}
          onPick={(hex) => set({ skin: hex })}
        />

        <Swatches
          legend="Uniform colour"
          name={`${id}-uniform`}
          options={AVATAR_UNIFORMS}
          value={value.uniform}
          onPick={(hex) => set({ uniform: hex })}
        />

        <div className={styles.pair}>
          <div className={styles.group}>
            <label className={styles.legend} htmlFor={`${id}-number`}>Number</label>
            <input
              id={`${id}-number`}
              className={`${styles.input} ${styles.inputNumber}`}
              type="text"
              inputMode="numeric"
              placeholder="00"
              autoComplete="off"
              value={value.number}
              onChange={(e) => set({ number: e.target.value.replace(/\D/g, '').slice(0, 2) })}
              aria-describedby={`${id}-number-hint`}
            />
            <span id={`${id}-number-hint`} className={styles.hint}>0 to 99. Leave empty to keep the M.</span>
          </div>
          <div className={styles.group}>
            <label className={styles.legend} htmlFor={`${id}-name`}>Name on the card</label>
            <input
              id={`${id}-name`}
              className={styles.input}
              type="text"
              placeholder="Your name"
              autoComplete="nickname"
              maxLength={NAME_MAX}
              value={value.name}
              onChange={(e) => set({ name: e.target.value.slice(0, NAME_MAX) })}
              aria-describedby={`${id}-name-hint`}
            />
            <span id={`${id}-name-hint`} className={styles.hint}>Shown on your profile. Up to {NAME_MAX} characters.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
