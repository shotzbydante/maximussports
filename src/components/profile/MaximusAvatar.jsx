/**
 * MaximusAvatar — draws a user's Maximus.
 *
 * Stacked layers inside one box: the mascot art, then for each colour the
 * user changed (robot, uniform) a flat colour shown through that part's mask
 * with its shading on top, then the jersey number. The mascot's own blue and
 * navy need no tint, so an unchanged mascot is a single image.
 *
 * `crop`: 'full' shows the whole mascot, 'bust' the head, shoulders and
 * number, 'head' just the head. 'auto' picks by size, because a full-body
 * mascot is unreadable at sidebar sizes.
 */
import { LAYOUT, avatarLayers, normalizeAvatar, numberInk } from '../../brand/avatar';
import styles from './MaximusAvatar.module.css';

export default function MaximusAvatar({ config, sport, skin, uniform, number, size = 120, crop = 'auto', className = '', title }) {
  const a = normalizeAvatar(config ?? { type: 'maximus_2d', mascotType: sport, robotColor: skin, uniformColor: uniform, jerseyNumber: number });
  const L = LAYOUT[a.sport];
  const mode = crop === 'auto' ? (size < 56 ? 'head' : size < 96 ? 'bust' : 'full') : crop;
  const layers = avatarLayers(a.sport, !!a.number);

  // Place the art inside the square box.
  let stage;
  if (mode === 'full') {
    const h = size;
    const w = (L.w / L.h) * h;
    stage = { width: w, height: h, left: (size - w) / 2, top: 0 };
  } else {
    const side = mode === 'head' ? Math.min(0.5, L.bust.side) : L.bust.side;
    const h = size / side;
    const w = (L.w / L.h) * h;
    stage = { width: w, height: h, left: size / 2 - L.bust.cx * h, top: -L.bust.top * h };
  }

  const ink = numberInk(a.sport, a.uniformTint);
  const cx = L.chest.x * L.w;
  const cy = L.chest.y * L.h;
  const fontSize = L.chest.h * L.h * 1.28;
  const twoDigits = a.number.length > 1;

  return (
    <span
      className={`${styles.avatar} ${mode === 'full' ? '' : styles.cropped} ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={title || 'Maximus avatar'}
    >
      <span className={styles.stage} style={stage}>
        <img src={layers.base} alt="" className={styles.layer} draggable={false} decoding="async" />
        {a.tint && (
          <>
            <span
              className={styles.layer}
              style={{ backgroundColor: a.tint, WebkitMaskImage: `url(${layers.mask})`, maskImage: `url(${layers.mask})` }}
            />
            <img src={layers.shade} alt="" className={styles.layer} draggable={false} decoding="async" />
          </>
        )}
        {a.uniformTint && (
          <>
            <span
              className={styles.layer}
              style={{ backgroundColor: a.uniformTint, WebkitMaskImage: `url(${layers.uniformMask})`, maskImage: `url(${layers.uniformMask})` }}
            />
            <img src={layers.uniformShade} alt="" className={styles.layer} draggable={false} decoding="async" />
          </>
        )}
        {a.number && mode !== 'head' && (
          <svg className={styles.layer} viewBox={`0 0 ${L.w} ${L.h}`} aria-hidden="true">
            <text
              x={cx}
              y={cy}
              className={styles.number}
              fontSize={fontSize}
              fill={ink.fill}
              stroke={ink.stroke}
              strokeWidth={fontSize * 0.09}
              textLength={twoDigits ? L.chest.w * L.w * 1.02 : undefined}
              lengthAdjust={twoDigits ? 'spacingAndGlyphs' : undefined}
            >
              {a.number}
            </text>
          </svg>
        )}
      </span>
    </span>
  );
}
