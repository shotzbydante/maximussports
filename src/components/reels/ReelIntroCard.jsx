/**
 * ReelIntroCard — DOM-based preview of the branded intro title card.
 * The actual rendered version uses drawBrandedIntroCard() from drawUtils.js.
 */

export default function ReelIntroCard({ bgColor = '#071426', logoSrc = '/logo.png' }) {
  const isWhiteBg = bgColor === '#ffffff';
  const textColor = isWhiteBg ? '#1a3d7c' : '#ffffff';
  const subColor = isWhiteBg ? 'rgba(26,61,124,0.55)' : 'rgba(255,255,255,0.55)';

  return (
    <div style={{ ...styles.card, background: bgColor }}>
      <div style={styles.glowOrb} />

      <img
        src={logoSrc}
        alt="Maximus Sports"
        style={styles.logo}
        onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }}
      />

      <div style={{ ...styles.headline, color: textColor }}>
        Welcome to Maximus Sports
      </div>
      <div style={{ ...styles.subheadline, color: subColor }}>
        Smarter college basketball intelligence
      </div>

      <div style={styles.divider} />
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
  glowOrb: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(60,121,180,0.12) 0%, transparent 70%)',
    top: '30%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
  },
  logo: {
    width: 60,
    height: 'auto',
    display: 'block',
    zIndex: 1,
    marginBottom: 8,
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
  },
  divider: {
    width: 50,
    height: 2,
    borderRadius: 1,
    background: '#3C79B4',
    zIndex: 1,
    marginTop: 4,
  },
};
