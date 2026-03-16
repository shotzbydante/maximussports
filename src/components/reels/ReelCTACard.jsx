/**
 * ReelCTACard — DOM preview of the premium Maximus CTA end card.
 * Always uses dark navy. Robot mascot is the large centered hero.
 * Actual rendered version uses drawOutroCard() from drawUtils.js.
 */

export default function ReelCTACard({
  accentColor = '#3C79B4',
  robotSrc = '/mascot.png',
}) {
  return (
    <div style={styles.card}>
      <div style={styles.glowOrb(accentColor)} />

      {/* Decorative lines */}
      <div style={styles.decorLines}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={styles.decorLine(accentColor)} />
        ))}
      </div>

      {/* Robot hero — large, centered */}
      <div style={styles.robotWrap}>
        <div style={styles.robotGlow(accentColor)} />
        <img src={robotSrc} alt="Maximus mascot" style={styles.robot} />
      </div>

      {/* Headline */}
      <div style={styles.headline}>Explore Maximus Sports</div>
      <div style={styles.subheadline}>
        Model-driven college basketball intelligence
      </div>
      <div style={styles.microcopy}>
        Smarter picks, bracket intel, and daily signals
      </div>

      {/* CTA pill */}
      <div style={styles.ctaPill(accentColor)}>maximussports.ai</div>
    </div>
  );
}

const styles = {
  card: {
    position: 'relative',
    width: '100%',
    aspectRatio: '9 / 16',
    background: 'radial-gradient(circle at 50% 38%, rgba(33,92,180,0.28) 0%, rgba(12,31,58,0.18) 26%, #071426 78%)',
    borderRadius: 14,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '24px 16px',
  },
  glowOrb: (color) => ({
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: '50%',
    background: `radial-gradient(circle, ${color}20 0%, transparent 70%)`,
    top: '30%',
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
    background: `${color}10`,
    marginBottom: '14%',
  }),
  robotWrap: {
    position: 'relative',
    zIndex: 1,
    marginBottom: 8,
  },
  robotGlow: (color) => ({
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: '50%',
    background: `radial-gradient(circle, ${color}22, transparent)`,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
  }),
  robot: {
    width: 120,
    height: 'auto',
    display: 'block',
    position: 'relative',
  },
  headline: {
    fontSize: 16,
    fontWeight: 700,
    color: '#ffffff',
    textAlign: 'center',
    zIndex: 1,
  },
  subheadline: {
    fontSize: 10,
    fontWeight: 400,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    zIndex: 1,
    lineHeight: 1.3,
  },
  microcopy: {
    fontSize: 8,
    fontWeight: 400,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
    zIndex: 1,
    lineHeight: 1.3,
  },
  ctaPill: (color) => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px 22px',
    borderRadius: 20,
    background: `linear-gradient(135deg, ${color}, ${color}cc)`,
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    boxShadow: `0 4px 16px ${color}44`,
    zIndex: 1,
    marginTop: 4,
  }),
};
