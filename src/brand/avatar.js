/**
 * The Maximus avatar: the canonical 2D mascot for a sport, in a robot colour
 * the user picks, with their number on the chest.
 *
 * Art and layers come from scripts/brand/build-avatar-layers.py. LAYOUT is
 * that script's output: paste it again whenever the mascot art changes.
 *
 * Stored on the profile as preferences.robotConfig:
 *   { type: 'maximus_2d', mascotType: <sport>, robotColor: <hex>, jerseyNumber: '23' }
 * The keys are the ones the first avatar used, so every place that already
 * reads mascotType / robotColor / jerseyNumber keeps working. Older configs
 * (type 'maximus_robot', basketball or baseball only, with a jersey colour)
 * are read by normalizeAvatar() and upgraded the next time the user saves.
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

export const DEFAULT_AVATAR = { type: 'maximus_2d', mascotType: 'football', robotColor: MAXIMUS_BLUE, jerseyNumber: '' };

/** Colours that mean "leave the mascot blue": ours, and the first avatar's default. */
const UNTINTED = new Set([MAXIMUS_BLUE, '#4a90c4']);
const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Any stored config, old or new, to { sport, skin, tint, number }.
 * `tint` is null when the mascot should be drawn in its own blue.
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
  return { sport, skin, tint: UNTINTED.has(skin) ? null : skin, number };
}

/** What to save on the profile. */
export function toAvatarConfig({ sport, skin, number }) {
  return {
    type: 'maximus_2d',
    mascotType: LAYOUT[sport] ? sport : DEFAULT_AVATAR.mascotType,
    robotColor: HEX.test(skin || '') ? skin.toLowerCase() : MAXIMUS_BLUE,
    jerseyNumber: /^\d{1,2}$/.test(String(number ?? '')) ? String(number) : '',
  };
}

export function avatarLayers(sport, hasNumber) {
  return {
    base: `${dir}/${sport}-${hasNumber ? 'blank' : 'm'}.webp`,
    mask: `${dir}/${sport}-mask.webp`,
    shade: `${dir}/${sport}-shade.webp`,
  };
}
