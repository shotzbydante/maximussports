import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AboutTheModel from './AboutTheModel.jsx';

describe('AboutTheModel', () => {
  it('renders the About the model kicker', () => {
    const html = renderToStaticMarkup(<AboutTheModel />);
    expect(html).toMatch(/About the model/);
  });
  it('mentions 0–100 conviction score', () => {
    const html = renderToStaticMarkup(<AboutTheModel />);
    expect(html).toMatch(/0.?100/);
  });
  it('compact variant is shorter and omits the expand toggle', () => {
    const full = renderToStaticMarkup(<AboutTheModel variant="full" />);
    const compact = renderToStaticMarkup(<AboutTheModel variant="compact" />);
    expect(full.length).toBeGreaterThan(compact.length);
    expect(compact).not.toMatch(/How it's graded/);
  });
  it('does not make any performance claims', () => {
    const html = renderToStaticMarkup(<AboutTheModel />);
    expect(html).not.toMatch(/win rate/i);
    expect(html).not.toMatch(/\d+%/);
  });
});
