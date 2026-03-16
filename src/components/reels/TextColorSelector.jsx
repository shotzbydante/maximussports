import { useMemo } from 'react';

const COLOR_PRESETS = [
  { id: 'maximus-green', label: 'Maximus Green', value: '#2ee59d' },
  { id: 'light-blue',    label: 'Light Blue',    value: '#63b3ff' },
  { id: 'deep-blue',     label: 'Deep Blue',     value: '#2b6cff' },
  { id: 'white',         label: 'White',          value: '#ffffff' },
  { id: 'gold',          label: 'Gold',           value: '#f6c343' },
];

export { COLOR_PRESETS };

export default function TextColorSelector({ value, onChange, disabled = false }) {
  const activePreset = useMemo(
    () => COLOR_PRESETS.find(p => p.value === value) || COLOR_PRESETS[3],
    [value],
  );

  return (
    <div style={styles.container}>
      <div style={styles.swatchRow}>
        {COLOR_PRESETS.map(preset => {
          const isActive = preset.value === value;
          return (
            <button
              key={preset.id}
              style={{
                ...styles.swatch,
                background: preset.value,
                boxShadow: isActive
                  ? `0 0 0 2px #fff, 0 0 0 4px ${preset.value}, 0 2px 8px ${preset.value}44`
                  : '0 1px 3px rgba(0,0,0,0.15)',
                transform: isActive ? 'scale(1.15)' : 'scale(1)',
                border: preset.value === '#ffffff'
                  ? '1.5px solid rgba(60,121,180,0.25)'
                  : '1.5px solid transparent',
              }}
              onClick={() => onChange(preset.value)}
              disabled={disabled}
              title={preset.label}
              aria-label={`Select ${preset.label}`}
            />
          );
        })}
      </div>
      <div style={styles.label}>{activePreset.label}</div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    alignItems: 'flex-start',
  },
  swatchRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'all 0.18s ease',
    padding: 0,
    outline: 'none',
    flexShrink: 0,
  },
  label: {
    fontSize: 10,
    fontWeight: 600,
    color: '#5c7a91',
    letterSpacing: '0.04em',
  },
};
