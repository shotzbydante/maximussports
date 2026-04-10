/**
 * mlbSlideRenderer — Server-side MLB Daily Briefing slide image generator.
 *
 * Uses @vercel/og (Satori + Resvg) to render 1080×1350 PNG slides that match
 * the MLB crimson design system. These are simplified server-renderable versions
 * of the client-side slides — same data, same layout intent, adapted for Satori's
 * inline-style-only constraint.
 *
 * Exports:
 *   renderSlide1(content) → Buffer (PNG)
 *   renderSlide2(content) → Buffer (PNG)
 *   renderSlide3(content) → Buffer (PNG)
 *
 * All functions accept the same content shape built by assembleMlbAutopostData().
 */

import { createElement as h } from 'react';
import { ImageResponse } from '@vercel/og';

const W = 1080;
const H = 1350;

// ── Shared style tokens ────────────────────────────────────────────────────

const BG = {
  background: 'linear-gradient(170deg, #7a1030 0%, #8a1838 18%, #6a1228 38%, #3a0818 68%, #1a0408 100%)',
};

const GLASS = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 20,
};

const PILL = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  padding: '10px 26px',
  borderRadius: 16,
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.14)',
};

function clamp(s, max) {
  if (!s) return '';
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// ── SLIDE 1 — Summary Cover ────────────────────────────────────────────────

export async function renderSlide1(c) {
  const el = h('div', {
    style: {
      width: W, height: H, display: 'flex', flexDirection: 'column',
      alignItems: 'center', color: '#fff', fontFamily: 'Inter, sans-serif',
      ...BG, position: 'relative', padding: '40px 44px',
    },
  },
    // Brand pill
    h('div', { style: { ...PILL, height: 48, marginBottom: 24 } },
      h('span', { style: { fontSize: 14, fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.9)' } }, 'MAXIMUS SPORTS'),
    ),

    // Title
    h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 } },
      h('div', { style: { fontSize: 72, fontWeight: 900, letterSpacing: '1.5px', textTransform: 'uppercase', textAlign: 'center', lineHeight: 0.95 } }, 'DAILY MLB BRIEFING'),
      h('div', { style: { fontSize: 24, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(255,225,180,0.90)', marginTop: 12 } }, c.dateLabel),
    ),

    // Story cards
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: 16, width: '100%', marginBottom: 20 } },
      h('div', { style: { ...GLASS, padding: '24px 32px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' } },
        h('div', { style: { fontSize: 40, fontWeight: 800, lineHeight: 1.1 } }, clamp(c.storyCard1Title, 50)),
        c.storyCard1Sub ? h('div', { style: { fontSize: 22, fontWeight: 600, color: 'rgba(255,225,180,0.88)', marginTop: 8 } }, clamp(c.storyCard1Sub, 60)) : null,
      ),
      h('div', { style: { ...GLASS, padding: '24px 32px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' } },
        h('div', { style: { fontSize: 40, fontWeight: 800, lineHeight: 1.1 } }, clamp(c.storyCard2Title, 50)),
        c.storyCard2Sub ? h('div', { style: { fontSize: 22, fontWeight: 600, color: 'rgba(255,225,180,0.88)', marginTop: 8 } }, clamp(c.storyCard2Sub, 60)) : null,
      ),
    ),

    // HOTP
    h('div', { style: { width: '100%', display: 'flex', flexDirection: 'column', marginBottom: 20 } },
      h('div', { style: { ...PILL, width: 'auto', marginBottom: 12, alignSelf: 'flex-start' } },
        h('span', { style: { fontSize: 15, fontWeight: 800, letterSpacing: '1.4px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.82)' } }, 'HOT OFF THE PRESS'),
      ),
      h('div', { style: { ...GLASS, padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 8 } },
        ...(c.bullets || []).map((b, i) =>
          h('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: 8 } },
            h('span', { style: { fontSize: 13, color: 'rgba(255,180,200,0.6)', flexShrink: 0 } }, '▸'),
            h('span', { style: { fontSize: 20, fontWeight: 600, color: 'rgba(255,255,255,0.88)', lineHeight: 1.28 } }, clamp(b.text, 80)),
          )
        ),
      ),
    ),

    // Bottom grid
    h('div', { style: { display: 'flex', gap: 16, width: '100%', flex: 1 } },
      // Pennant Race
      h('div', { style: { ...GLASS, flex: 1, padding: '16px 18px', display: 'flex', flexDirection: 'column' } },
        h('div', { style: { fontSize: 14, fontWeight: 800, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)', marginBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 8 } }, 'PENNANT RACE'),
        ...(c.raceTeams || []).map((t, i) =>
          h('div', { key: i, style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < (c.raceTeams.length - 1) ? '1px solid rgba(255,255,255,0.04)' : 'none' } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
              h('span', { style: { fontSize: 18, fontWeight: 800, color: '#fff' } }, t.team),
            ),
            h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' } },
              h('span', { style: { fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.9)' } }, `${t.projectedWins} W`),
              h('span', { style: { fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)' } }, t.division),
            ),
          )
        ),
      ),

      // Picks
      h('div', { style: { ...GLASS, flex: 1, padding: '16px 18px', display: 'flex', flexDirection: 'column' } },
        h('div', { style: { fontSize: 14, fontWeight: 800, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)', marginBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 8 } }, "MAXIMUS'S PICKS"),
        ...(c.picks || []).map((p, i) =>
          h('div', { key: i, style: { display: 'flex', flexDirection: 'column', padding: '6px 0', borderBottom: i < (c.picks.length - 1) ? '1px solid rgba(255,255,255,0.04)' : 'none' } },
            h('div', { style: { display: 'flex', justifyContent: 'space-between' } },
              h('span', { style: { fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)' } }, clamp(p.matchup, 24)),
              h('span', { style: { fontSize: 11, fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'rgba(255,200,160,0.75)', padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.06)' } }, p.type),
            ),
            h('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: 3 } },
              h('span', { style: { fontSize: 18, fontWeight: 800, color: '#fff' } }, clamp(p.selection, 20)),
              h('span', { style: { fontSize: 12, fontWeight: 700, color: 'rgba(255,200,160,0.8)' } }, p.conviction),
            ),
          )
        ),
      ),
    ),

    // CTA
    h('div', { style: { ...PILL, height: 56, marginTop: 16, borderRadius: 20, gap: 10 } },
      h('span', { style: { fontSize: 15, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)' } }, 'MORE AT'),
      h('span', { style: { fontSize: 20, fontWeight: 800, color: 'rgba(255,230,200,0.92)' } }, 'maximussports.ai'),
    ),
  );

  const img = new ImageResponse(el, { width: W, height: H });
  return Buffer.from(await img.arrayBuffer());
}

// ── SLIDE 2 — Intel Briefing ───────────────────────────────────────────────

export async function renderSlide2(c) {
  const el = h('div', {
    style: {
      width: W, height: H, display: 'flex', flexDirection: 'column',
      alignItems: 'center', color: '#fff', fontFamily: 'Inter, sans-serif',
      ...BG, padding: '32px 28px 18px',
    },
  },
    // Top pill
    h('div', { style: { ...PILL, height: 42, marginBottom: 8 } },
      h('span', { style: { fontSize: 14, fontWeight: 800, letterSpacing: '1.4px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.94)' } }, "TODAY'S INTEL BRIEFING"),
    ),
    h('div', { style: { fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.78)', marginBottom: 10 } }, c.dateLabel),

    // Headline
    h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 8, textAlign: 'center', minHeight: 130, justifyContent: 'center' } },
      h('div', { style: { fontSize: 48, fontWeight: 900, lineHeight: 0.96, textTransform: 'uppercase', letterSpacing: '-0.2px' } }, clamp(c.headline, 70)),
      c.subhead ? h('div', { style: { fontSize: 17, fontWeight: 600, color: 'rgba(255,255,255,0.64)', fontStyle: 'italic', marginTop: 8, maxWidth: 820 } }, clamp(c.subhead, 95)) : null,
    ),

    // HOTP card
    h('div', { style: { ...GLASS, width: '100%', padding: '14px 20px', marginBottom: 8, display: 'flex', flexDirection: 'column' } },
      h('div', { style: { display: 'flex', alignItems: 'center', height: 28, padding: '0 12px', borderRadius: 999, fontSize: 12, fontWeight: 800, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.9)', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', width: 'fit-content', marginBottom: 12 } }, 'HOT OFF THE PRESS'),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
        ...(c.featureBullets || []).map((b, i) =>
          h('div', { key: i, style: { display: 'flex', alignItems: 'flex-start', gap: 9 } },
            h('div', { style: { width: 8, height: 8, borderRadius: 999, flexShrink: 0, marginTop: 7, background: 'radial-gradient(circle, rgba(255,255,255,0.95), rgba(255,120,140,0.68))' } }),
            h('span', { style: { fontSize: 20, lineHeight: 1.3, fontWeight: 700, color: 'rgba(255,255,255,0.94)' } }, clamp(b.text, 90)),
          )
        ),
      ),
      c.featureTakeaway ? h('div', { style: { marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.74)' } }, clamp(c.featureTakeaway, 90)) : null,
    ),

    // Bottom 2-col grid
    h('div', { style: { display: 'flex', gap: 10, width: '100%', flex: 1 } },
      // Pennant Race
      h('div', { style: { ...GLASS, flex: 1, padding: '14px 14px', display: 'flex', flexDirection: 'column' } },
        h('div', { style: { display: 'flex', alignItems: 'center', height: 28, padding: '0 12px', borderRadius: 999, fontSize: 12, fontWeight: 800, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.9)', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', width: 'fit-content', marginBottom: 10 } }, 'PENNANT RACE'),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, flex: 1 } },
          ...(c.raceTeams || []).slice(0, 4).map((t, i) =>
            h('div', { key: i, style: { ...GLASS, padding: '10px 12px', display: 'flex', flexDirection: 'column', flex: 1 } },
              h('div', { style: { display: 'flex', justifyContent: 'space-between' } },
                h('span', { style: { fontSize: 18, fontWeight: 900, color: 'rgba(255,255,255,0.94)' } }, t.team),
                h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' } },
                  h('span', { style: { fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.72)' } }, t.division),
                  h('span', { style: { fontSize: 13, fontWeight: 800, color: 'rgba(255,220,140,0.92)' } }, t.convictionLabel),
                ),
              ),
              h('div', { style: { fontSize: 18, fontWeight: 800, color: 'rgba(255,255,255,0.92)', marginTop: 6 } }, `Projected Wins: ${t.projectedWins}`),
              t.summaryTag ? h('div', { style: { fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.76)', marginTop: 4 } }, clamp(t.summaryTag, 40)) : null,
              h('div', { style: { fontSize: 14, fontWeight: 800, color: 'rgba(255,225,170,0.94)', marginTop: 'auto', paddingTop: 6, alignSelf: 'flex-end' } }, `🏆 ${t.championshipOdds}`),
            )
          ),
        ),
      ),

      // Picks
      h('div', { style: { ...GLASS, flex: 1, padding: '14px 14px', display: 'flex', flexDirection: 'column' } },
        h('div', { style: { display: 'flex', alignItems: 'center', height: 28, padding: '0 12px', borderRadius: 999, fontSize: 12, fontWeight: 800, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.9)', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', width: 'fit-content', marginBottom: 10 } }, "MAXIMUS'S PICKS"),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, flex: 1 } },
          ...(c.picks || []).slice(0, 4).map((p, i) =>
            h('div', { key: i, style: { ...GLASS, padding: '10px 12px', display: 'flex', flexDirection: 'column', flex: 1 } },
              h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                h('span', { style: { fontSize: 14, fontWeight: 800, textTransform: 'uppercase', color: 'rgba(255,255,255,0.8)' } }, clamp(p.matchup, 20)),
                h('span', { style: { fontSize: 10, fontWeight: 800, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.78)', padding: '2px 6px', borderRadius: 999, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' } }, p.type),
              ),
              h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6 } },
                h('span', { style: { fontSize: 20, fontWeight: 900, color: 'rgba(255,255,255,0.96)' } }, clamp(p.selection, 16)),
                h('span', { style: { fontSize: 13, fontWeight: 800, color: 'rgba(255,220,140,0.92)' } }, p.conviction),
              ),
              h('div', { style: { fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.72)', marginTop: 4 } }, clamp(p.rationale, 50)),
            )
          ),
        ),
      ),
    ),

    // Footer
    h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 6 } },
      h('span', { style: { fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.44)' } }, 'Swipe for World Series Outlook →'),
      h('span', { style: { fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.42)', marginTop: 2 } }, 'maximussports.ai'),
    ),
  );

  const img = new ImageResponse(el, { width: W, height: H });
  return Buffer.from(await img.arrayBuffer());
}

// ── SLIDE 3 — World Series Outlook ─────────────────────────────────────────

export async function renderSlide3(c) {
  const alTeams = (c.leagueBoard || []).filter(t => t.league === 'AL').slice(0, 5);
  const nlTeams = (c.leagueBoard || []).filter(t => t.league === 'NL').slice(0, 5);

  function teamCard(t) {
    return h('div', { style: { ...GLASS, padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 0 } },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } },
        h('div', { style: { display: 'flex', flexDirection: 'column' } },
          h('span', { style: { fontSize: 24, fontWeight: 900, color: 'rgba(255,255,255,0.98)', lineHeight: 0.95 } }, t.name || t.abbrev),
          t.record ? h('span', { style: { fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.74)', marginTop: 4 } }, t.record) : null,
        ),
        t.championshipOdds ? h('div', { style: { padding: '4px 10px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,215,100,0.08)', border: '1px solid rgba(255,215,100,0.22)', fontSize: 18, fontWeight: 900, color: '#F7D37A' } }, `🏆 ${t.championshipOdds}`) : null,
      ),
      h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 6, paddingTop: 8 } },
        h('span', { style: { fontSize: 52, fontWeight: 900, lineHeight: 0.88, color: 'rgba(255,255,255,0.98)' } }, String(t.projectedWins)),
        h('span', { style: { fontSize: 12, fontWeight: 800, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.62)' } }, 'PROJ WINS'),
      ),
      t.rationale ? h('div', { style: { fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.8)', lineHeight: 1.3, marginTop: 6 } }, clamp(t.rationale, 60)) : null,
    );
  }

  function leagueCol(title, teams) {
    return h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column' } },
      h('div', { style: { ...GLASS, height: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 } },
        h('span', { style: { fontSize: 17, fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.8)' } }, title),
      ),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, flex: 1 } },
        ...teams.map((t, i) => teamCard(t)),
      ),
    );
  }

  const el = h('div', {
    style: {
      width: W, height: H, display: 'flex', flexDirection: 'column',
      color: '#fff', fontFamily: 'Inter, sans-serif',
      ...BG, padding: '28px 22px 18px',
    },
  },
    // Top pill
    h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 6 } },
      h('div', { style: { ...PILL, height: 42, marginBottom: 6 } },
        h('span', { style: { fontSize: 14, fontWeight: 800, letterSpacing: '1.4px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.94)' } }, 'WORLD SERIES OUTLOOK'),
      ),
      h('span', { style: { fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.78)' } }, c.dateLabel),
    ),

    // Title
    h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 24px 4px', marginBottom: 6, textAlign: 'center' } },
      h('div', { style: { fontSize: 48, fontWeight: 900, lineHeight: 0.95, textTransform: 'uppercase', letterSpacing: '0.8px' } }, 'WORLD SERIES OUTLOOK'),
      h('div', { style: { fontSize: 17, fontWeight: 700, letterSpacing: '1.6px', marginTop: 8, textTransform: 'uppercase', color: 'rgba(255,255,255,0.76)' } }, 'Top 5 Per League • Model Projections'),
    ),

    // 2-col board
    h('div', { style: { display: 'flex', gap: 12, flex: 1 } },
      leagueCol('AMERICAN LEAGUE', alTeams),
      leagueCol('NATIONAL LEAGUE', nlTeams),
    ),

    // Footer
    h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 6, paddingTop: 6 } },
      h('span', { style: { fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.42)' } }, 'maximussports.ai'),
    ),
  );

  const img = new ImageResponse(el, { width: W, height: H });
  return Buffer.from(await img.arrayBuffer());
}
