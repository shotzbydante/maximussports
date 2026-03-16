import { useMemo } from 'react';

const BG_PRESETS = [
  { id: 'maximus-dark-blue', label: 'Maximus Dark Blue', value: '#071426' },
  { id: 'deep-navy',         label: 'Deep Navy',         value: '#0c1f3a' },
  { id: 'light-blue',        label: 'Light Blue',        value: '#3a6cff' },
  { id: 'green-accent',      label: 'Green Accent',      value: '#0f3d2e' },
  { id: 'white',             label: 'White',              value: '#ffffff' },
];

export { BG_PRESETS };

export const DEFAULT_BG_COLOR = '#071426';

export function resolveTextColor(bgColor) {
  return bgColor === '#ffffff' ? '#1a3d7c' : '#ffffff';
}

export default function BackgroundColorSelector({ value, onChange, disabled = false }) {
  const activePreset = useMemo(
    () => BG_PRESETS.find(p => p.value === value) || BG_PRESETS[0],
    [value],
  );

  return (
    <div style={styles.container}>
      <div style={styles.swatchRow}>
        {BG_PRESETS.map(preset => {
          const isActive = preset.value === value;
          return (
            <button
              key={preset.id}
              style={{
                ...styles.swatch,
                background: preset.value,
                boxShadow: isActive
                  ? `0 0 0 2px #fff, 0 0 0 4px ${preset.value === '#ffffff' ? '#3C79B4' : preset.value}, 0 2px 8px rgba(0,0,0,0.2)`
                  : '0 1px 3px rgba(0,0,0,0.15)',
                transform: isActive ? 'scale(1.15)' : 'scale(1)',
                border: preset.value === '#ffffff'
                  ? '1.5px solid rgba(60,121,180,0.3)'
                  : '1.5px solid rgba(255,255,255,0.12)',
              }}
              onClick={() => onChange(preset.value)}
              disabled={disabled}
              title={preset.label}
              aria-label={`Select ${preset.label} background`}
            />
          );
        })}
      </div>
      <div style={styles.labelRow}>
        <span style={styles.label}>{activePreset.label}</span>
        <span style={styles.textHint}>
          Text: {value === '#ffffff' ? 'dark blue' : 'white'}
        </span>
      </div>
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
  labelRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  label: {
    fontSize: 10,
    fontWeight: 600,
    color: '#5c7a91',
    letterSpacing: '0.04em',
  },
  textHint: {
    fontSize: 9,
    fontWeight: 500,
    color: '#9fb3c5',
    letterSpacing: '0.02em',
  },
};
