/**
 * The Maximus avatar: the canonical 2D mascot for a sport, in a robot colour
 * and a uniform colour the user picks, with their number on the chest.
 *
 * Art and layers come from scripts/brand/build-avatar-layers.py. LAYOUT is
 * that script's output: paste it again whenever the mascot art changes.
 *
 * Stored on the profile as preferences.robotConfig:
 *   { type: 'maximus_2d', mascotType: <sport>, robotColor: <hex>, uniformColor: <hex>, jerseyNumber: '23' }
 * mascotType / robotColor / jerseyNumber are the keys the first avatar used,
 * so every place that already reads them keeps working. Older configs
 * (type 'maximus_robot', basketball or baseball only) are read by
 * normalizeAvatar() and upgraded the next time the user saves. Their
 * jerseyColor is not carried over: uniformColor is a new key so a default
 * left behind by the first avatar cannot recolour anyone's uniform.
 */

const dir = '/brand/avatar';

export const LAYOUT = {
  "football": {
    "w": 264,
    "h": 480,
    "chest": {
      "x": 0.5821,
      "y": 0.6278,
      "w": 0.1793,
      "h": 0.0806
    },
    "bust": {
      "cx": 0.2406,
      "top": 0.0028,
      "side": 0.6953
    },
    "ink": "white"
  },
  "basketball": {
    "w": 309,
    "h": 480,
    "chest": {
      "x": 0.5981,
      "y": 0.6493,
      "w": 0.1487,
      "h": 0.0847
    },
    "bust": {
      "cx": 0.3109,
      "top": 0.0069,
      "side": 0.7147
    },
    "ink": "white"
  },
  "baseball": {
    "w": 319,
    "h": 480,
    "chest": {
      "x": 0.6597,
      "y": 0.6361,
      "w": 0.1503,
      "h": 0.0722
    },
    "bust": {
      "cx": 0.335,
      "top": 0.0056,
      "side": 0.6967
    },
    "ink": "navy"
  },
  "hockey": {
    "w": 316,
    "h": 480,
    "chest": {
      "x": 0.5601,
      "y": 0.6125,
      "w": 0.1287,
      "h": 0.0639
    },
    "bust": {
      "cx": 0.324,
      "top": 0.0056,
      "side": 0.6689
    },
    "ink": "white"
  },
  "soccer": {
    "w": 241,
    "h": 480,
    "chest": {
      "x": 0.6039,
      "y": 0.5708,
      "w": 0.1551,
      "h": 0.0639
    },
    "bust": {
      "cx": 0.2395,
      "top": 0.0056,
      "side": 0.6272
    },
    "ink": "white"
  }
};

/** Every sport Maximus plays, football first. */
export const AVATAR_SPORTS = [
  { id: 'football',   label: 'Football' },
  { id: 'basketball', label: 'Basketball' },
  { id: 'baseball',   label: 'Baseball' },
  { id: 'hockey',     label: 'Hockey' },
  { id: 'soccer',     label: 'Soccer' },
];

/** The mascot's own blue. Stored like any other colour; drawn with no tint. */
export const MAXIMUS_BLUE = '#3795e5';

export const AVATAR_SKINS = [
  { id: 'blue',     hex: MAXIMUS_BLUE, label: 'Maximus blue' },
  { id: 'cyan',     hex: '#22c1ee', label: 'Cyan' },
  { id: 'teal',     hex: '#14b8a6', label: 'Teal' },
  { id: 'green',    hex: '#22c55e', label: 'Green' },
  { id: 'gold',     hex: '#f5b301', label: 'Gold' },
  { id: 'orange',   hex: '#f97316', label: 'Orange' },
  { id: 'red',      hex: '#ef4444', label: 'Red' },
  { id: 'pink',     hex: '#ec4899', label: 'Pink' },
  { id: 'purple',   hex: '#8b5cf6', label: 'Purple' },
  { id: 'silver',   hex: '#b6c2d2', label: 'Silver' },
  { id: 'steel',    hex: '#7b8ba1', label: 'Steel' },
  { id: 'graphite', hex: '#475569', label: 'Graphite' },
];

/** The navy the uniforms are drawn in. Stored like any other colour; drawn with no tint. */
export const MAXIMUS_NAVY = '#0a3a7c';

export const AVATAR_UNIFORMS = [
  { id: 'navy',   hex: MAXIMUS_NAVY, label: 'Maximus navy' },
  { id: 'royal',  hex: '#2563eb', label: 'Royal blue' },
  { id: 'sky',    hex: '#38bdf8', label: 'Sky blue' },
  { id: 'teal',   hex: '#0d9488', label: 'Teal' },
  { id: 'green',  hex: '#15803d', label: 'Green' },
  { id: 'gold',   hex: '#f5b301', label: 'Gold' },
  { id: 'orange', hex: '#ea580c', label: 'Orange' },
  { id: 'red',    hex: '#dc2626', label: 'Red' },
  { id: 'maroon', hex: '#7f1d1d', label: 'Maroon' },
  { id: 'purple', hex: '#6d28d9', label: 'Purple' },
  { id: 'pink',   hex: '#ec4899', label: 'Pink' },
  { id: 'black',  hex: '#1f2937', label: 'Black' },
];

export const DEFAULT_AVATAR = { type: 'maximus_2d', mascotType: 'football', robotColor: MAXIMUS_BLUE, uniformColor: MAXIMUS_NAVY, jerseyNumber: '' };

/** Colours that mean "leave the mascot blue": ours, and the first avatar's default. */
const UNTINTED = new Set([MAXIMUS_BLUE, '#4a90c4']);
const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Any stored config, old or new, to { sport, skin, tint, uniform, uniformTint, number }.
 * `tint` is null when the robot should be drawn in its own blue, and
 * `uniformTint` is null when the uniform should be drawn in its own navy.
 */
export function normalizeAvatar(config, fallbackNumber = '') {
  const cfg = config && typeof config === 'object' ? config : {};
  const hasConfig = Object.keys(cfg).length > 0;
  // A first-generation avatar with no sport recorded was the basketball robot.
  const legacySport = hasConfig && cfg.type !== 'maximus_2d' ? 'basketball' : DEFAULT_AVATAR.mascotType;
  const sport = LAYOUT[cfg.mascotType] ? cfg.mascotType : legacySport;
  const skin = HEX.test(cfg.robotColor || '') ? cfg.robotColor.toLowerCase() : MAXIMUS_BLUE;
  const raw = cfg.jerseyNumber ?? fallbackNumber ?? '';
  const number = /^\d{1,2}$/.test(String(raw)) ? String(raw) : '';
  const uniform = HEX.test(cfg.uniformColor || '') ? cfg.uniformColor.toLowerCase() : MAXIMUS_NAVY;
  return {
    sport, skin, tint: UNTINTED.has(skin) ? null : skin,
    uniform, uniformTint: uniform === MAXIMUS_NAVY ? null : uniform,
    number,
  };
}

/** What to save on the profile. */
export function toAvatarConfig({ sport, skin, uniform, number }) {
  return {
    type: 'maximus_2d',
    mascotType: LAYOUT[sport] ? sport : DEFAULT_AVATAR.mascotType,
    robotColor: HEX.test(skin || '') ? skin.toLowerCase() : MAXIMUS_BLUE,
    uniformColor: HEX.test(uniform || '') ? uniform.toLowerCase() : MAXIMUS_NAVY,
    jerseyNumber: /^\d{1,2}$/.test(String(number ?? '')) ? String(number) : '',
  };
}

export function avatarLayers(sport, hasNumber) {
  return {
    base: `${dir}/${sport}-${hasNumber ? 'blank' : 'm'}.webp`,
    mask: `${dir}/${sport}-mask.webp`,
    shade: `${dir}/${sport}-shade.webp`,
    uniformMask: `${dir}/${sport}-umask.webp`,
    uniformShade: `${dir}/${sport}-ushade.webp`,
  };
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
const darken = (hex, by) => toHex(rgb(hex).map((v) => v * (1 - by)));
/** Perceived brightness, 0 (black) to 1 (white). */
const brightness = (hex) => { const [r, g, b] = rgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

const NAVY_INK = '#14306b';

/**
 * Colours for the chest number. On most mascots the number sits on the
 * uniform, so it is white with a darker edge, or navy when the cloth is too
 * light for white to read. The baseball jersey is white, so there the number
 * is printed in the uniform colour, like the pinstripes and the cap.
 */
export function numberInk(sport, uniformTint) {
  const onWhite = LAYOUT[sport]?.ink === 'navy';
  if (onWhite) {
    if (!uniformTint) return { fill: NAVY_INK, stroke: '#ffffff' };
    return { fill: brightness(uniformTint) > 0.5 ? darken(uniformTint, 0.38) : uniformTint, stroke: '#ffffff' };
  }
  if (!uniformTint) return { fill: '#ffffff', stroke: NAVY_INK };
  if (brightness(uniformTint) > 0.62) return { fill: '#0f1f47', stroke: uniformTint };
  return { fill: '#ffffff', stroke: darken(uniformTint, 0.5) };
}
