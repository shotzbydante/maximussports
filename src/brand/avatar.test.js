import { describe, it, expect } from 'vitest';
import {
  AVATAR_SKINS, AVATAR_UNIFORMS, AVATAR_SPORTS, DEFAULT_AVATAR, LAYOUT,
  MAXIMUS_BLUE, MAXIMUS_NAVY, normalizeAvatar, toAvatarConfig, numberInk, avatarLayers,
} from './avatar.js';

describe('avatar config', () => {
  it('draws an untouched mascot with no tint at all', () => {
    const a = normalizeAvatar(DEFAULT_AVATAR);
    expect(a).toMatchObject({ sport: 'football', tint: null, uniformTint: null, number: '' });
  });

  it('round-trips every choice the studio offers', () => {
    const cfg = toAvatarConfig({ sport: 'hockey', skin: '#22c55e', uniform: '#dc2626', number: '45' });
    expect(cfg).toEqual({ type: 'maximus_2d', mascotType: 'hockey', robotColor: '#22c55e', uniformColor: '#dc2626', jerseyNumber: '45' });
    expect(normalizeAvatar(cfg)).toMatchObject({ sport: 'hockey', tint: '#22c55e', uniformTint: '#dc2626', number: '45' });
  });

  it('reads an avatar saved before uniforms existed as navy', () => {
    const a = normalizeAvatar({ type: 'maximus_2d', mascotType: 'soccer', robotColor: '#ef4444', jerseyNumber: '9' });
    expect(a.uniform).toBe(MAXIMUS_NAVY);
    expect(a.uniformTint).toBeNull();
  });

  it('does not let a first-generation jersey colour recolour the uniform', () => {
    const a = normalizeAvatar({ type: 'maximus_robot', robotColor: '#4a90c4', jerseyColor: '#aa0000', jerseyNumber: '7' });
    expect(a.sport).toBe('basketball');
    expect(a.uniformTint).toBeNull();
  });

  it('falls back to the defaults on junk', () => {
    const cfg = toAvatarConfig({ sport: 'curling', skin: 'red', uniform: 'javascript:1', number: '123' });
    expect(cfg).toEqual({ ...DEFAULT_AVATAR });
    expect(normalizeAvatar({ type: 'maximus_2d', uniformColor: '#12' }).uniform).toBe(MAXIMUS_NAVY);
  });

  it('offers the mascot colours first, and only valid, distinct colours', () => {
    expect(AVATAR_SKINS[0].hex).toBe(MAXIMUS_BLUE);
    expect(AVATAR_UNIFORMS[0].hex).toBe(MAXIMUS_NAVY);
    for (const list of [AVATAR_SKINS, AVATAR_UNIFORMS]) {
      expect(new Set(list.map((c) => c.hex)).size).toBe(list.length);
      for (const c of list) expect(c.hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('has art layers for every sport', () => {
    for (const s of AVATAR_SPORTS) {
      expect(LAYOUT[s.id]).toBeTruthy();
      const l = avatarLayers(s.id, true);
      expect(l.uniformMask).toBe(`/brand/avatar/${s.id}-umask.webp`);
      expect(l.uniformShade).toBe(`/brand/avatar/${s.id}-ushade.webp`);
    }
  });
});

describe('number ink', () => {
  it('is white on a dark uniform and dark on a light one', () => {
    expect(numberInk('football', null).fill).toBe('#ffffff');
    expect(numberInk('football', '#dc2626').fill).toBe('#ffffff');
    expect(numberInk('football', '#f5b301').fill).toBe('#0f1f47');
  });

  it('prints the baseball number in the uniform colour, because that jersey is white', () => {
    expect(numberInk('baseball', null)).toEqual({ fill: '#14306b', stroke: '#ffffff' });
    expect(numberInk('baseball', '#dc2626')).toEqual({ fill: '#dc2626', stroke: '#ffffff' });
    // Gold on white would not read, so it is darkened.
    expect(numberInk('baseball', '#f5b301').fill).not.toBe('#f5b301');
  });
});
