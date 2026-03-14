/**
 * RobotAvatar — Maximus Sports mascot: a fun-loving basketball-playing toddler
 * robot with big expressive eyes, a wide grin, a headband, and a basketball
 * jersey. Left hand spins a basketball, right hand waves.
 *
 * Customizable: jerseyColor, robotColor, jerseyNumber.
 */
import styles from './RobotAvatar.module.css';

const DEFAULT_JERSEY_COLOR = '#1a2d3d';
const DEFAULT_ROBOT_COLOR = '#4a90c4';

export const JERSEY_COLORS = [
  { id: 'black',   hex: '#1a2d3d', label: 'Black' },
  { id: 'navy',    hex: '#1e3a5f', label: 'Navy' },
  { id: 'royal',   hex: '#2563eb', label: 'Royal Blue' },
  { id: 'sky',     hex: '#38bdf8', label: 'Sky Blue' },
  { id: 'crimson', hex: '#b91c1c', label: 'Crimson' },
  { id: 'red',     hex: '#dc2626', label: 'Red' },
  { id: 'forest',  hex: '#166534', label: 'Forest Green' },
  { id: 'teal',    hex: '#0d9488', label: 'Teal' },
  { id: 'orange',  hex: '#c2410c', label: 'Orange' },
  { id: 'gold',    hex: '#ca8a04', label: 'Gold' },
  { id: 'purple',  hex: '#6d28d9', label: 'Purple' },
  { id: 'white',   hex: '#e8edf2', label: 'White' },
];

export const ROBOT_COLORS = [
  { id: 'blue',      hex: '#4a90c4', label: 'Blue' },
  { id: 'steel',     hex: '#6b7b8d', label: 'Steel Gray' },
  { id: 'silver',    hex: '#a8b8c8', label: 'Silver' },
  { id: 'teal',      hex: '#0d9488', label: 'Teal' },
  { id: 'indigo',    hex: '#4f46e5', label: 'Indigo' },
  { id: 'sunset',    hex: '#d97706', label: 'Orange' },
  { id: 'gold',      hex: '#ca8a04', label: 'Gold' },
  { id: 'mint',      hex: '#34d399', label: 'Mint' },
  { id: 'lavender',  hex: '#a78bfa', label: 'Lavender' },
  { id: 'white',     hex: '#c8d4e0', label: 'White' },
];

export const DEFAULT_ROBOT_CONFIG = {
  jerseyNumber: '',
  jerseyColor: DEFAULT_JERSEY_COLOR,
  robotColor: DEFAULT_ROBOT_COLOR,
};

export default function RobotAvatar({
  jerseyNumber = '',
  jerseyColor = DEFAULT_JERSEY_COLOR,
  robotColor = DEFAULT_ROBOT_COLOR,
  size = 120,
  className = '',
  glow = false,
}) {
  const displayText = jerseyNumber || 'M';
  const fontSize = displayText.length > 1 ? 16 : 20;
  const isLightJersey = isLight(jerseyColor);
  const textColor = isLightJersey ? '#1a2d3d' : '#ffffff';
  const jerseyTrim = isLightJersey ? darken(jerseyColor, 0.15) : lighten(jerseyColor, 0.3);

  const bodyMain = robotColor;
  const bodyLight = lighten(robotColor, 0.18);
  const bodyDark = darken(robotColor, 0.15);
  const bodyShine = lighten(robotColor, 0.35);
  const outlineColor = darken(robotColor, 0.3);
  const cheekColor = lighten(robotColor, 0.28);

  return (
    <span
      className={`${styles.robotWrap} ${glow ? styles.glow : ''} ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 130 140"
        className={styles.robotSvg}
        aria-hidden
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Antenna */}
        <path d="M63 16 Q61 10 63 6" stroke={outlineColor} strokeWidth="2" fill="none" strokeLinecap="round" />
        <circle cx="63" cy="4" r="3.5" fill={bodyShine} stroke={outlineColor} strokeWidth="1.2" />

        {/* Head — large round toddler dome */}
        <ellipse cx="63" cy="36" rx="33" ry="27" fill={bodyMain} stroke={outlineColor} strokeWidth="1.8" />
        <ellipse cx="55" cy="26" rx="18" ry="10" fill={bodyShine} opacity="0.20" />

        {/* Headband */}
        <path d="M30 31 Q63 23 96 31 Q96 37 63 33 Q30 37 30 31Z" fill="#ffffff" opacity="0.90" stroke={outlineColor} strokeWidth="0.8" />
        <circle cx="63" cy="31" r="3.5" fill={bodyLight} stroke={outlineColor} strokeWidth="0.7" />
        <text x="63" y="32.5" textAnchor="middle" dominantBaseline="middle" fontSize="4.5" fontWeight="900" fill={outlineColor} fontFamily="'Oswald',sans-serif">M</text>

        {/* Eye sockets */}
        <path d="M41 36 L51 32 L59 36 L59 44 L51 47 L41 44Z" fill={bodyDark} stroke={outlineColor} strokeWidth="0.8" />
        <path d="M67 36 L75 32 L85 36 L85 44 L75 47 L67 44Z" fill={bodyDark} stroke={outlineColor} strokeWidth="0.8" />

        {/* Eyes */}
        <ellipse cx="50" cy="40" rx="6" ry="5" fill="#c0e8ff" />
        <ellipse cx="76" cy="40" rx="6" ry="5" fill="#c0e8ff" />
        <ellipse cx="52" cy="38" rx="2.5" ry="2" fill="#ffffff" opacity="0.85" />
        <ellipse cx="78" cy="38" rx="2.5" ry="2" fill="#ffffff" opacity="0.85" />
        <ellipse cx="49" cy="41" rx="2.2" ry="2" fill={outlineColor} opacity="0.55" />
        <ellipse cx="75" cy="41" rx="2.2" ry="2" fill={outlineColor} opacity="0.55" />

        {/* Eyebrows */}
        <path d="M43 33 Q50 30 57 33" stroke={outlineColor} strokeWidth="1.2" fill="none" strokeLinecap="round" />
        <path d="M69 33 Q76 30 83 33" stroke={outlineColor} strokeWidth="1.2" fill="none" strokeLinecap="round" />

        {/* Blush cheeks */}
        <ellipse cx="41" cy="47" rx="4" ry="2.5" fill={cheekColor} opacity="0.3" />
        <ellipse cx="85" cy="47" rx="4" ry="2.5" fill={cheekColor} opacity="0.3" />

        {/* Nose hint */}
        <path d="M61 46 L63 48 L65 46" stroke={outlineColor} strokeWidth="0.9" fill="none" strokeLinecap="round" />

        {/* Big smile */}
        <path d="M49 51 Q56 58 63 58 Q70 58 77 51" stroke={outlineColor} strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <path d="M51 52 Q63 59 75 52 Q63 56 51 52Z" fill="#ffffff" opacity="0.9" />

        {/* Ear panels */}
        <rect x="28" y="34" width="5" height="9" rx="2" fill={bodyDark} stroke={outlineColor} strokeWidth="0.8" />
        <rect x="93" y="34" width="5" height="9" rx="2" fill={bodyDark} stroke={outlineColor} strokeWidth="0.8" />

        {/* Neck — shorter and connects head to torso seamlessly */}
        <rect x="53" y="61" width="20" height="6" rx="3" fill={bodyDark} stroke={outlineColor} strokeWidth="0.8" />
        <line x1="58" y1="62.5" x2="58" y2="65.5" stroke={outlineColor} strokeWidth="0.5" opacity="0.4" />
        <line x1="63" y1="62.5" x2="63" y2="65.5" stroke={outlineColor} strokeWidth="0.5" opacity="0.4" />
        <line x1="68" y1="62.5" x2="68" y2="65.5" stroke={outlineColor} strokeWidth="0.5" opacity="0.4" />

        {/* Jersey / Torso — starts right at neck bottom, chunkier */}
        <path
          d="M36 66 L28 76 L36 80 L36 110 L90 110 L90 80 L98 76 L90 66 L79 72 C73 76 53 76 47 72 Z"
          fill={jerseyColor}
          stroke={outlineColor}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* Jersey trim — collar */}
        <path d="M47 72 Q55 78 63 78 Q71 78 79 72" stroke={jerseyTrim} strokeWidth="2.2" fill="none" strokeLinecap="round" />
        {/* Jersey trim — bottom */}
        <line x1="36" y1="108" x2="90" y2="108" stroke={jerseyTrim} strokeWidth="2" />
        {/* Jersey trim — armholes */}
        <path d="M36 80 L36 68" stroke={jerseyTrim} strokeWidth="1.5" strokeLinecap="round" />
        <path d="M90 80 L90 68" stroke={jerseyTrim} strokeWidth="1.5" strokeLinecap="round" />

        {/* Jersey number */}
        <text
          x="63"
          y="95"
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={fontSize}
          fontWeight="800"
          fontFamily="'Oswald', 'Impact', sans-serif"
          fill={textColor}
          letterSpacing="0.02em"
          style={{ textShadow: isLightJersey ? 'none' : '0 1px 2px rgba(0,0,0,0.3)' }}
        >
          {displayText}
        </text>

        {/* LEFT ARM: spinning a basketball */}
        <path d="M28 76 L17 68 L12 62" fill="none" stroke={outlineColor} strokeWidth="1.3" strokeLinecap="round" />
        <path d="M28 76 L18 69" fill={bodyMain} stroke={outlineColor} strokeWidth="1.3" strokeLinejoin="round" />
        <circle cx="21" cy="72" r="2.5" fill={bodyLight} stroke={outlineColor} strokeWidth="0.8" />
        <circle cx="12" cy="60" r="4" fill={bodyLight} stroke={outlineColor} strokeWidth="0.8" />
        <line x1="9" y1="58" x2="8" y2="56" stroke={outlineColor} strokeWidth="0.7" strokeLinecap="round" />
        <line x1="12" y1="57" x2="12" y2="54" stroke={outlineColor} strokeWidth="0.7" strokeLinecap="round" />
        <line x1="15" y1="58" x2="16" y2="56" stroke={outlineColor} strokeWidth="0.7" strokeLinecap="round" />

        {/* Basketball */}
        <circle cx="12" cy="48" r="9" fill="#e67e22" stroke="#c0601a" strokeWidth="1.2" />
        <path d="M3 48 Q12 44 21 48" stroke="#c0601a" strokeWidth="0.8" fill="none" />
        <path d="M12 39 Q14 48 12 57" stroke="#c0601a" strokeWidth="0.8" fill="none" />
        <path d="M5 42 Q12 48 19 42" stroke="#c0601a" strokeWidth="0.6" fill="none" opacity="0.5" />
        <path d="M5 54 Q12 48 19 54" stroke="#c0601a" strokeWidth="0.6" fill="none" opacity="0.5" />
        <ellipse cx="9" cy="44" rx="3" ry="2" fill="#f0a050" opacity="0.5" />

        {/* RIGHT ARM: waving */}
        <path d="M98 76 L109 64 L117 54" fill="none" stroke={outlineColor} strokeWidth="1.3" strokeLinecap="round" />
        <path d="M98 76 L108 65" fill={bodyMain} stroke={outlineColor} strokeWidth="1.3" strokeLinejoin="round" />
        <circle cx="104" cy="70" r="2.5" fill={bodyLight} stroke={outlineColor} strokeWidth="0.8" />
        <circle cx="117" cy="52" r="4.5" fill={bodyLight} stroke={outlineColor} strokeWidth="0.8" />
        <line x1="114" y1="49" x2="112" y2="46" stroke={outlineColor} strokeWidth="0.8" strokeLinecap="round" />
        <line x1="116" y1="48" x2="115" y2="44" stroke={outlineColor} strokeWidth="0.8" strokeLinecap="round" />
        <line x1="118" y1="48" x2="118" y2="44" stroke={outlineColor} strokeWidth="0.8" strokeLinecap="round" />
        <line x1="120" y1="49" x2="121" y2="45" stroke={outlineColor} strokeWidth="0.8" strokeLinecap="round" />
        <line x1="121" y1="52" x2="123" y2="50" stroke={outlineColor} strokeWidth="0.7" strokeLinecap="round" />

        {/* Waist / belt */}
        <rect x="44" y="110" width="38" height="5" rx="2" fill={bodyDark} stroke={outlineColor} strokeWidth="0.8" />

        {/* Legs */}
        <rect x="47" y="115" width="12" height="10" rx="3" fill={bodyMain} stroke={outlineColor} strokeWidth="0.8" />
        <rect x="67" y="115" width="12" height="10" rx="3" fill={bodyMain} stroke={outlineColor} strokeWidth="0.8" />

        {/* Sneakers */}
        <path d="M45 125 L45 130 Q45 133 47 133 L61 133 Q63 133 63 131 L63 125Z" fill="#ffffff" stroke={outlineColor} strokeWidth="0.8" />
        <path d="M63 125 L63 130 Q63 133 65 133 L79 133 Q81 133 81 131 L81 125Z" fill="#ffffff" stroke={outlineColor} strokeWidth="0.8" />
        <line x1="45" y1="129" x2="63" y2="129" stroke={bodyMain} strokeWidth="1.5" />
        <line x1="63" y1="129" x2="81" y2="129" stroke={bodyMain} strokeWidth="1.5" />
        <line x1="47" y1="133" x2="61" y2="133" stroke={outlineColor} strokeWidth="0.6" />
        <line x1="65" y1="133" x2="79" y2="133" stroke={outlineColor} strokeWidth="0.6" />
      </svg>
    </span>
  );
}

function isLight(hex) {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160;
}

function lighten(hex, amount) {
  return adjustColor(hex, amount);
}

function darken(hex, amount) {
  return adjustColor(hex, -amount);
}

function adjustColor(hex, amount) {
  const c = hex.replace('#', '');
  const r = Math.min(255, Math.max(0, parseInt(c.substring(0, 2), 16) + Math.round(255 * amount)));
  const g = Math.min(255, Math.max(0, parseInt(c.substring(2, 4), 16) + Math.round(255 * amount)));
  const b = Math.min(255, Math.max(0, parseInt(c.substring(4, 6), 16) + Math.round(255 * amount)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
