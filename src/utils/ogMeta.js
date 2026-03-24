/**
 * ogMeta — shared helpers for building dynamic Open Graph metadata.
 *
 * Used by:
 *   - SEOHead (client-side helmet)
 *   - api/meta.js (server-side bot metadata)
 *
 * Keeps OG image URL construction and page-type metadata in one place so
 * client and server always agree.
 */

export const ORIGIN = 'https://maximussports.ai';
export const SITE_NAME = 'Maximus Sports';
export const DEFAULT_OG_IMAGE = `${ORIGIN}/og.png`;
export const CURRENT_YEAR = new Date().getFullYear();

/**
 * Build a dynamic /api/og image URL with the given parameters.
 */
export function buildOgImageUrl({ title, subtitle, meta, team, type } = {}) {
  const params = new URLSearchParams();
  if (title)    params.set('title',    String(title).slice(0, 80));
  if (subtitle) params.set('subtitle', String(subtitle).slice(0, 120));
  if (meta)     params.set('meta',     String(meta).slice(0, 60));
  if (team)     params.set('team',     String(team).slice(0, 40));
  if (type)     params.set('type',     String(type).slice(0, 30));
  return `${ORIGIN}/api/og?${params.toString()}`;
}

/**
 * Page-type metadata generators.
 * Each returns { title, description, ogImage, ogType, canonicalPath }.
 */
export const PAGE_META = {
  home() {
    return {
      title: `College Basketball Betting Intelligence & March Madness Picks (${CURRENT_YEAR})`,
      description: `AI-powered college basketball betting intelligence for the ${CURRENT_YEAR} season — ATS picks, model-driven predictions, and March Madness insights across every major NCAAB matchup.`,
      ogImage: DEFAULT_OG_IMAGE,
      canonicalPath: '/ncaam',
    };
  },

  teams() {
    return {
      title: `College Basketball Team Intel Hub — Conference Betting Intelligence (${CURRENT_YEAR})`,
      description: `Explore ${CURRENT_YEAR} college basketball intelligence by conference. ATS trends, championship odds, tournament projections, and betting signals for every tracked NCAAB program.`,
      ogImage: buildOgImageUrl({
        title: 'Team Intel Hub',
        subtitle: 'ATS trends, championship odds & conference intelligence',
        type: 'Team Intel',
      }),
      canonicalPath: '/ncaam/teams',
    };
  },

  team({ teamName, conference, slug, rank, atsRecord, coverPct }) {
    const rankStr = rank ? `#${rank} ` : '';
    const atsStr = atsRecord ? ` ATS: ${atsRecord}.` : '';
    const coverStr = coverPct ? ` Cover rate: ${coverPct}%.` : '';
    return {
      title: `${teamName} Team Intel | ${SITE_NAME}`,
      description: `${rankStr}${teamName} — ATS trends, next-game intel, rankings, and betting signals.${atsStr}${coverStr} ${conference} conference intelligence powered by Maximus Sports.`,
      ogImage: buildOgImageUrl({
        title: teamName,
        subtitle: `ATS trends, matchup edges & betting intelligence`,
        meta: atsRecord ? `ATS: ${atsRecord}` : conference,
        team: teamName,
        type: 'Team Intel',
      }),
      canonicalPath: `/ncaam/teams/${slug}`,
    };
  },

  insights() {
    return {
      title: `College Basketball Odds Insights | ${SITE_NAME}`,
      description: `Live spreads, ATS trends, value leans, and market intelligence across the ${CURRENT_YEAR} college basketball board. Updated daily with model-driven edges.`,
      ogImage: buildOgImageUrl({
        title: 'Odds Insights',
        subtitle: 'Live spreads, ATS trends & market intelligence',
        type: 'Odds Insight',
      }),
      canonicalPath: '/ncaam/insights',
    };
  },

  picks() {
    return {
      title: `College Basketball Picks Today (${CURRENT_YEAR}) | ${SITE_NAME}`,
      description: `Today's college basketball betting intelligence — ATS picks, model-driven predictions, value leans, and game totals across the NCAAB slate.`,
      ogImage: buildOgImageUrl({
        title: "Today's Picks",
        subtitle: 'ATS picks, value leans & game totals',
        type: 'Odds Insight',
      }),
      canonicalPath: '/ncaam/college-basketball-picks-today',
    };
  },

  matchup({ teamA, teamB, slug, spread, total }) {
    const spreadStr = spread ? ` Spread: ${spread}.` : '';
    const totalStr = total ? ` O/U: ${total}.` : '';
    return {
      title: `${teamA} vs ${teamB} Odds, ATS Signals & Picks | ${SITE_NAME}`,
      description: `Live spread intel, model edges, and game analysis for ${teamA} vs ${teamB}.${spreadStr}${totalStr} Data-driven predictions powered by Maximus Sports.`,
      ogImage: buildOgImageUrl({
        title: `${teamA} vs ${teamB}`,
        subtitle: [spread && `Spread: ${spread}`, total && `O/U: ${total}`].filter(Boolean).join(' · ') || 'Matchup analysis & predictions',
        type: 'Matchup Intel',
      }),
      canonicalPath: `/ncaam/games/${slug}`,
    };
  },

  games() {
    return {
      title: `College Basketball Games Today — Live Scores & Spreads | ${SITE_NAME}`,
      description: `Live college basketball scores, spreads, and the full NCAAB daily schedule for ${CURRENT_YEAR}. Track every game with real-time odds and betting lines.`,
      ogImage: buildOgImageUrl({
        title: "Today's Games",
        subtitle: 'Live scores, spreads & daily schedule',
        type: 'Odds Insight',
      }),
      canonicalPath: '/ncaam/games',
    };
  },

  news() {
    return {
      title: `College Basketball Intel — Headlines & Analysis | ${SITE_NAME}`,
      description: `Curated college basketball videos, headlines, analysis, and betting intel across every major conference. Your command center for NCAAB intelligence.`,
      ogImage: buildOgImageUrl({
        title: 'Intel Feed',
        subtitle: 'Headlines, analysis & betting intel',
        type: 'Team Intel',
      }),
      canonicalPath: '/ncaam/news',
    };
  },

  marchMadness() {
    return {
      title: `March Madness Betting Intelligence (${CURRENT_YEAR}) | ${SITE_NAME}`,
      description: `${CURRENT_YEAR} March Madness betting intelligence — tournament matchup insights, team betting trends, bracket analysis, and championship odds.`,
      ogImage: buildOgImageUrl({
        title: 'March Madness Intelligence',
        subtitle: 'Tournament picks, trends & bracket analysis',
        type: 'Bracket Bust',
      }),
      canonicalPath: '/ncaam/march-madness-betting-intelligence',
    };
  },
};

/**
 * Resolve metadata for a given pathname.
 * Used by the server-side metadata handler to parse routes.
 */
export function resolvePageMeta(pathname) {
  if (pathname === '/' || pathname === '') return PAGE_META.home();
  if (pathname === '/teams') return PAGE_META.teams();
  if (pathname === '/insights' || pathname === '/odds-insights') return PAGE_META.insights();
  if (pathname === '/college-basketball-picks-today') return PAGE_META.picks();
  if (pathname === '/games') return PAGE_META.games();
  if (pathname === '/news') return PAGE_META.news();
  if (pathname === '/march-madness-betting-intelligence') return PAGE_META.marchMadness();

  const teamMatch = pathname.match(/^\/teams\/([a-z0-9-]+)$/);
  if (teamMatch) {
    const slug = teamMatch[1];
    const teamName = slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    return PAGE_META.team({ teamName, conference: '', slug });
  }

  const matchupMatch = pathname.match(/^\/games\/(.+)$/);
  if (matchupMatch) {
    const slug = matchupMatch[1];
    const parts = slug.replace(/-prediction$/, '').split('-vs-');
    if (parts.length === 2) {
      const teamA = parts[0].split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      const teamB = parts[1].split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      return PAGE_META.matchup({ teamA, teamB, slug });
    }
  }

  return {
    title: `College Basketball Betting Intelligence | ${SITE_NAME}`,
    description: `AI-powered college basketball intel — ATS trends, model-driven picks, odds movement, and team analytics. Track your teams smarter with Maximus Sports.`,
    ogImage: DEFAULT_OG_IMAGE,
    canonicalPath: pathname,
  };
}
