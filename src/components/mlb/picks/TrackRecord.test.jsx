import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import TrackRecord from './TrackRecord.jsx';

describe('TrackRecord', () => {
  it('renders the scaffolded "Tracking" state when no data', () => {
    const html = renderToStaticMarkup(<TrackRecord />);
    expect(html).toMatch(/Track Record/);
    expect(html).toMatch(/Tracking/);
  });

  it('renders season record with units when available', () => {
    const payload = { trackRecord: { season: { won: 112, lost: 84, push: 0, units: 18.6 } } };
    const html = renderToStaticMarkup(<TrackRecord payload={payload} />);
    expect(html).toMatch(/Season/);
    expect(html).toMatch(/112–84/);
    expect(html).toMatch(/57% win rate/);
    expect(html).toMatch(/\+18\.6 units/);
  });

  it('falls back to trailing 30-day scorecard when season absent', () => {
    const html = renderToStaticMarkup(<TrackRecord scorecard={{ trailing30d: { won: 54, lost: 38 } }} />);
    expect(html).toMatch(/Last 30 days/);
    expect(html).toMatch(/54–38/);
    expect(html).toMatch(/59% win rate/);
  });

  it('falls back to trailing 7-day when 30 is missing', () => {
    const html = renderToStaticMarkup(<TrackRecord scorecard={{ trailing7d: { won: 18, lost: 10 } }} />);
    expect(html).toMatch(/Last 7 days/);
    expect(html).toMatch(/18–10/);
  });

  it('renders Top Plays win rate when provided', () => {
    const payload = {
      trackRecord: {
        season: { won: 112, lost: 84 },
        topPlayWinRate30d: 0.68,
      },
    };
    const html = renderToStaticMarkup(<TrackRecord payload={payload} />);
    expect(html).toMatch(/Top Plays/);
    expect(html).toMatch(/68%/);
    expect(html).toMatch(/last 30 days/);
  });
});
