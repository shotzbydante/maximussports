/**
 * GET /api/og — Dynamic Open Graph image generator.
 * Returns a 1200×630 PNG for social previews.
 *
 * Query params:
 *   title    — main headline (required)
 *   subtitle — secondary line (optional)
 *   meta     — small detail line, e.g. "ATS: 13–8" (optional)
 *   team     — team name displayed top-right (optional)
 *   type     — badge label: "Upset Watch" | "ATS Intel" | "Odds Insight" | "Team Intel" (optional)
 *
 * Cache: public, s-maxage=86400, stale-while-revalidate=604800
 */

import { createElement as h } from 'react';
import { ImageResponse } from '@vercel/og';

const WIDTH  = 1200;
const HEIGHT = 630;
const MAX_TITLE_LEN    = 80;
const MAX_SUBTITLE_LEN = 120;
const MAX_META_LEN     = 60;
const MAX_TEAM_LEN     = 40;

const BADGE_COLORS = {
  'Upset Watch':    { bg: '#e53e3e', text: '#fff' },
  'High Upset Risk': { bg: '#c53030', text: '#fff' },
  'ATS Intel':      { bg: '#3c79b4', text: '#fff' },
  'Odds Insight':   { bg: '#2d6a4f', text: '#e0f2e9' },
  'Team Intel':     { bg: '#1a365d', text: '#bee3f8' },
  'Bracket Bust':   { bg: '#744210', text: '#fefcbf' },
  'Matchup Intel':  { bg: '#553c9a', text: '#e9d8fd' },
  'Maximus Picks':  { bg: '#2d8a6e', text: '#e0f2e9' },
};

function clamp(str, max) {
  if (!str) return '';
  const s = String(str).replace(/[<>&"']/g, (c) => ({ '<': '', '>': '', '&': '&', '"': '', "'": '' }[c] || ''));
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function buildCard({ title, subtitle, meta, team, type }) {
  const badge = BADGE_COLORS[type] ?? { bg: '#3c79b4', text: '#fff' };

  return h(
    'div',
    {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'row',
        background: '#0a1628',
        fontFamily: '"Inter", system-ui, sans-serif',
        position: 'relative',
        overflow: 'hidden',
      },
    },
    // Left blue accent stripe
    h('div', {
      style: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: 8,
        height: '100%',
        background: 'linear-gradient(to bottom, #3c79b4, #1a4a7a)',
      },
    }),
    // Subtle grid background pattern
    h('div', {
      style: {
        position: 'absolute',
        inset: 0,
        backgroundImage: 'radial-gradient(circle at 80% 20%, rgba(60,121,180,0.12) 0%, transparent 50%)',
      },
    }),
    // Main content
    h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '48px 64px 48px 72px',
          width: '100%',
          height: '100%',
        },
      },
      // ── Top row: wordmark + type badge ──
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          },
        },
        // Wordmark
        h(
          'div',
          { style: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10 } },
          h('div', {
            style: {
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#3c79b4',
              marginRight: 4,
            },
          }),
          h('span', {
            style: {
              color: 'rgba(255,255,255,0.9)',
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            },
          }, 'MAXIMUS SPORTS'),
        ),
        // Type badge
        type
          ? h('div', {
              style: {
                background: badge.bg,
                color: badge.text,
                fontSize: 14,
                fontWeight: 700,
                padding: '6px 16px',
                borderRadius: 99,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              },
            }, clamp(type, 30))
          : null,
      ),
      // ── Center: title + subtitle ──
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            justifyContent: 'center',
            marginTop: 24,
            marginBottom: 24,
          },
        },
        team
          ? h('div', {
              style: {
                color: '#3c79b4',
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: 12,
              },
            }, clamp(team, MAX_TEAM_LEN))
          : null,
        h('div', {
          style: {
            color: '#ffffff',
            fontSize: title.length > 50 ? 44 : 52,
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: '-0.02em',
            maxWidth: 900,
          },
        }, title),
        subtitle
          ? h('div', {
              style: {
                color: 'rgba(255,255,255,0.72)',
                fontSize: 24,
                fontWeight: 400,
                lineHeight: 1.4,
                marginTop: 16,
                maxWidth: 800,
              },
            }, subtitle)
          : null,
      ),
      // ── Bottom row: meta + domain ──
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
          },
        },
        meta
          ? h('div', {
              style: {
                color: 'rgba(255,255,255,0.5)',
                fontSize: 16,
                fontWeight: 500,
                background: 'rgba(60,121,180,0.15)',
                padding: '6px 14px',
                borderRadius: 6,
                border: '1px solid rgba(60,121,180,0.25)',
              },
            }, clamp(meta, MAX_META_LEN))
          : h('div', {}),
        h('div', {
          style: {
            color: 'rgba(255,255,255,0.35)',
            fontSize: 15,
            fontWeight: 500,
            letterSpacing: '0.04em',
          },
        }, 'maximussports.ai'),
      ),
    ),
  );
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const url = new URL(req.url, `https://${req.headers.host || 'maximussports.ai'}`);
    const rawTitle    = url.searchParams.get('title')    || 'March Madness Intelligence';
    const rawSubtitle = url.searchParams.get('subtitle') || '';
    const rawMeta     = url.searchParams.get('meta')     || '';
    const rawTeam     = url.searchParams.get('team')     || '';
    const rawType     = url.searchParams.get('type')     || '';

    const title    = clamp(rawTitle, MAX_TITLE_LEN) || 'March Madness Intelligence';
    const subtitle = clamp(rawSubtitle, MAX_SUBTITLE_LEN);
    const meta     = clamp(rawMeta, MAX_META_LEN);
    const team     = clamp(rawTeam, MAX_TEAM_LEN);
    const type     = clamp(rawType, 30);

    const card = buildCard({ title, subtitle, meta, team, type });
    const imageResponse = new ImageResponse(card, { width: WIDTH, height: HEIGHT });
    const buffer = Buffer.from(await imageResponse.arrayBuffer());

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', buffer.length);
    return res.end(buffer);
  } catch (err) {
    console.error('[api/og] error:', err?.message);
    // Return a minimal fallback PNG-colored response isn't feasible without a working image.
    // Fall back to a 302 to the static OG image.
    res.setHeader('Location', 'https://maximussports.ai/og.png');
    return res.status(302).end();
  }
}
