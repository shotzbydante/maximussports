import { describe, it, expect } from 'vitest';
import { parseAnswer, iconFor } from './answerFormat.js';

describe('parseAnswer', () => {
  it('splits a lead sentence from labelled points', () => {
    const blocks = parseAnswer('Broncos -200 at BetRivers is my strongest call.\n- Edge: Twelve books make it 68.4% to win; -200 needs 66.7%.\n- Risk: Pittsburgh runs well.\n- No label here');
    expect(blocks).toEqual([
      { type: 'text', text: 'Broncos -200 at BetRivers is my strongest call.', lead: true },
      { type: 'points', items: [
        { label: 'Edge', text: 'Twelve books make it 68.4% to win; -200 needs 66.7%.', icon: '💰' },
        { label: 'Risk', text: 'Pittsburgh runs well.', icon: '⚠️' },
        { label: '', text: 'No label here', icon: '•' },
      ] },
    ]);
  });

  it('leaves plain answers as paragraphs', () => {
    expect(parseAnswer('One line.\n\nAnother paragraph\nwrapped.')).toEqual([
      { type: 'text', text: 'One line.' }, { type: 'text', text: 'Another paragraph wrapped.' },
    ]);
    expect(parseAnswer('')).toEqual([]);
  });

  it('does not read a time or a long clause as a label', () => {
    const [, pts] = parseAnswer('Lead.\n- Kickoff is 1:25 PM on Fox\n- The model has the 49ers by 1.6 on a line of three: a lean');
    expect(pts.items.map((i) => i.label)).toEqual(['', '']);
    expect(iconFor('Weather')).toBe('🌬️');
  });
});
