/**
 * ReelCTACard — React preview component for the premium Maximus CTA end card.
 *
 * Robot mascot is the centered hero visual. Layout: robot → headline →
 * subheadline → CTA pill. The actual rendered version uses drawOutroCard()
 * from drawUtils.js via Canvas.
 */

export default function ReelCTACard({
  accentColor = '#3C79B4',
  robotSrc = '/assets/robot/maximus-hero.png',
  bgColor = '#071426',
}) {
  const isWhiteBg = bgColor === '#ffffff';
  const textMain = isWhiteBg ? '#1a3d7c' : '#fff';
  const textSub = isWhiteBg ? 'rgba(26,61,124,0.55)' : 'rgba(255,255,255,0.55)';
  const panelBg = isWhiteBg ? 'rgba(60,121,180,0.04)' : 'rgba(255,255,255,0.03)';

  return (
    <div style={{ ...styles.card, background: bgColor }}>
      <div style={styles.glowOrb(accentColor)} />

      {/* Decorative lines */}
      <div style={styles.decorLines}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={styles.decorLine(accentColor)} />
        ))}
      </div>

      {/* Side panels */}
      <div style={{ ...styles.sidePanel, left: 8, background: panelBg }}>
        {[0, 1, 2].map(i => <div key={i} style={styles.dot(accentColor)} />)}
      </div>
      <div style={{ ...styles.sidePanel, right: 8, background: panelBg }}>
        {[0, 1, 2].map(i => <div key={i} style={styles.dot(accentColor)} />)}
      </div>

      {/* Robot hero — centered, prominent */}
      <div style={styles.robotWrap}>
        <div style={styles.robotGlow(accentColor)} />
        <img src={robotSrc} alt="Maximus mascot" style={styles.robot} />
      </div>

      {/* Headline */}
      <div style={{ ...styles.headline, color: textMain }}>Explore Maximus Sports</div>
      <div style={{ ...styles.subheadline, color: textSub }}>
        Model-driven college basketball intelligence
      </div>

      {/* Divider */}
      <div style={styles.divider(accentColor)} />

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
    borderRadius: 14,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: '24px 16px',
  },
  glowOrb: (color) => ({
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: '50%',
    background: `radial-gradient(circle, ${color}18 0%, transparent 70%)`,
    top: '35%',
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
  robotWrap: {
    position: 'relative',
    zIndex: 1,
    marginBottom: 8,
  },
  robotGlow: (color) => ({
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: '50%',
    background: `radial-gradient(circle, ${color}22, transparent)`,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
  }),
  robot: {
    width: 90,
    height: 'auto',
    display: 'block',
    position: 'relative',
  },
  headline: {
    fontSize: 17,
    fontWeight: 700,
    textAlign: 'center',
    zIndex: 1,
  },
  subheadline: {
    fontSize: 10,
    fontWeight: 400,
    textAlign: 'center',
    zIndex: 1,
    lineHeight: 1.3,
  },
  divider: (color) => ({
    width: 60,
    height: 2,
    borderRadius: 1,
    background: color,
    zIndex: 1,
  }),
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
    border: '1px solid rgba(255,255,255,0.06)',
  },
  dot: (color) => ({
    width: 4,
    height: 4,
    borderRadius: '50%',
    background: `${color}55`,
  }),
};
