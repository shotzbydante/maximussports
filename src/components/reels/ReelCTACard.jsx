/**
 * ReelCTACard — React preview component for the premium Maximus CTA end card.
 *
 * This is the DOM-based preview. The actual rendered version uses
 * drawOutroCard() from drawUtils.js via Canvas.
 */

export default function ReelCTACard({ accentColor = '#3C79B4', robotSrc = '/assets/robot/maximus-hero.png' }) {
  return (
    <div style={styles.card}>
      <div style={styles.glowOrb(accentColor)} />

      {/* Decorative lines */}
      <div style={styles.decorLines}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={styles.decorLine(accentColor)} />
        ))}
      </div>

      {/* Headline */}
      <div style={styles.headline}>Explore Maximus Sports</div>
      <div style={styles.subheadline}>Smarter college basketball intelligence</div>

      {/* Divider */}
      <div style={styles.divider(accentColor)} />

      {/* Robot hero */}
      <div style={styles.robotWrap}>
        <div style={styles.robotGlow(accentColor)} />
        <img src={robotSrc} alt="Maximus mascot" style={styles.robot} />
      </div>

      {/* CTA pill */}
      <div style={styles.ctaPill(accentColor)}>maximussports.ai</div>

      {/* Side panels */}
      <div style={{ ...styles.sidePanel, left: 8 }}>
        {[0, 1, 2].map(i => <div key={i} style={styles.dot(accentColor)} />)}
      </div>
      <div style={{ ...styles.sidePanel, right: 8 }}>
        {[0, 1, 2].map(i => <div key={i} style={styles.dot(accentColor)} />)}
      </div>
    </div>
  );
}

const styles = {
  card: {
    position: 'relative',
    width: '100%',
    aspectRatio: '9 / 16',
    background: 'linear-gradient(180deg, #060a14 0%, #0c1425 35%, #101c32 65%, #060a14 100%)',
    borderRadius: 14,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: '24px 16px',
  },
  glowOrb: (color) => ({
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: '50%',
    background: `radial-gradient(circle, ${color}18 0%, transparent 70%)`,
    top: '42%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
  }),
  decorLines: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
  },
  decorLine: (color) => ({
    height: 1,
    background: `${color}12`,
    marginBottom: '12%',
  }),
  headline: {
    fontSize: 18,
    fontWeight: 700,
    color: '#fff',
    textAlign: 'center',
    zIndex: 1,
  },
  subheadline: {
    fontSize: 11,
    fontWeight: 400,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    zIndex: 1,
  },
  divider: (color) => ({
    width: 60,
    height: 2,
    borderRadius: 1,
    background: color,
    zIndex: 1,
  }),
  robotWrap: {
    position: 'relative',
    zIndex: 1,
  },
  robotGlow: (color) => ({
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: '50%',
    background: `radial-gradient(circle, ${color}20, transparent)`,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
  }),
  robot: {
    width: 80,
    height: 'auto',
    display: 'block',
    position: 'relative',
  },
  ctaPill: (color) => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px 20px',
    borderRadius: 20,
    background: `linear-gradient(135deg, ${color}, ${color}cc)`,
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
    boxShadow: `0 4px 14px ${color}33`,
    zIndex: 1,
  }),
  sidePanel: {
    position: 'absolute',
    top: '22%',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: 6,
    borderRadius: 4,
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  dot: (color) => ({
    width: 4,
    height: 4,
    borderRadius: '50%',
    background: `${color}55`,
  }),
};
