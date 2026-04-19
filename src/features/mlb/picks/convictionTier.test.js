import { describe, it, expect } from 'vitest';
import { convictionTier, convictionDescription } from './convictionTier.js';

describe('convictionTier', () => {
  it('maps 95 to Elite', () => expect(convictionTier(95)).toMatchObject({ label: 'Elite', variant: 'elite' }));
  it('maps exactly 90 to Elite', () => expect(convictionTier(90).label).toBe('Elite'));
  it('maps 89 to Strong', () => expect(convictionTier(89)).toMatchObject({ label: 'Strong', variant: 'strong' }));
  it('maps exactly 80 to Strong', () => expect(convictionTier(80).label).toBe('Strong'));
  it('maps 79 to Solid', () => expect(convictionTier(79)).toMatchObject({ label: 'Solid', variant: 'solid' }));
  it('maps exactly 70 to Solid', () => expect(convictionTier(70).label).toBe('Solid'));
  it('maps 65 to Lean', () => expect(convictionTier(65)).toMatchObject({ label: 'Lean', variant: 'lean' }));
  it('maps 0 to Lean', () => expect(convictionTier(0).label).toBe('Lean'));
  it('handles null and undefined', () => {
    expect(convictionTier(null).label).toBe('Lean');
    expect(convictionTier(undefined).label).toBe('Lean');
  });
  it('provides human-readable descriptions', () => {
    expect(convictionDescription(95)).toMatch(/Elite/);
    expect(convictionDescription(95)).toMatch(/95/);
    expect(convictionDescription(65)).toMatch(/Lean/);
    expect(convictionDescription(65)).toMatch(/Directional/);
  });
});
