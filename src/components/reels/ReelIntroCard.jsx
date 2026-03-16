/**
 * ReelIntroCard — DOM preview of the branded intro title card.
 * Always uses Maximus dark navy. The actual rendered version uses
 * drawBrandedIntroCard() from drawUtils.js.
 */

export default function ReelIntroCard({ logoSrc = '/logo.png' }) {
  return (
    <div style={styles.card}>
      <div style={styles.glowOrb} />

      <img
        src={logoSrc}
        alt="Maximus Sports"
        style={styles.logo}
        onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }}
      />

      <div style={styles.headline}>
        Welcome to Maximus Sports
      </div>
      <div style={styles.subheadline}>
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
    background: 'radial-gradient(circle at 50% 38%, rgba(33,92,180,0.28) 0%, rgba(12,31,58,0.18) 26%, #071426 78%)',
    borderRadius: 14,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '24px 16px',
  },
  glowOrb: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(60,121,180,0.14) 0%, transparent 70%)',
    top: '30%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
  },
  logo: {
    width: '70%',
    maxWidth: 220,
    height: 'auto',
    display: 'block',
    zIndex: 1,
    marginBottom: 10,
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
