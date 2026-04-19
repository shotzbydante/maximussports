import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import YesterdayContinuity from './YesterdayContinuity.jsx';

function summary(overrides = {}) {
  return {
    date: '2026-04-18',
    overall: { won: 3, lost: 1, push: 0, pending: 0 },
    topPlayResult: 'won',
    streak: { type: 'won', count: 3 },
    ...overrides,
  };
}

describe('YesterdayContinuity', () => {
  it('renders nothing when no summary', () => {
    expect(renderToStaticMarkup(<YesterdayContinuity summary={null} />)).toBe('');
  });

  it('renders nothing when all picks are pending', () => {
    const html = renderToStaticMarkup(
      <YesterdayContinuity summary={summary({ topPlayResult: 'pending', overall: { won: 0, lost: 0, push: 0, pending: 4 } })} />,
    );
    expect(html).toBe('');
  });

  it('renders nothing when no topPlayResult', () => {
    const html = renderToStaticMarkup(
      <YesterdayContinuity summary={summary({ topPlayResult: null })} />,
    );
    expect(html).toBe('');
  });

  it('renders "Top Play cashed yesterday" on a win', () => {
    const html = renderToStaticMarkup(<YesterdayContinuity summary={summary()} />);
    expect(html).toMatch(/Top Play cashed yesterday/);
    expect(html).toMatch(/3–1 board/);
  });

  it('renders "Top Play missed yesterday" on a loss', () => {
    const html = renderToStaticMarkup(
      <YesterdayContinuity summary={summary({ topPlayResult: 'lost', overall: { won: 1, lost: 3, push: 0, pending: 0 } })} />,
    );
    expect(html).toMatch(/Top Play missed yesterday/);
  });

  it('renders streak chip only on winning run ≥ 2', () => {
    const html = renderToStaticMarkup(<YesterdayContinuity summary={summary()} />);
    expect(html).toMatch(/3-day run/);
  });

  it('omits streak chip when count < 2', () => {
    const html = renderToStaticMarkup(
      <YesterdayContinuity summary={summary({ streak: { type: 'won', count: 1 } })} />,
    );
    expect(html).not.toMatch(/day run/);
  });
});
