/**
 * emailPipeline — canonical email build pipeline.
 *
 * Single source of truth for:
 *   - template resolution
 *   - data assembly
 *   - sport-specific team lookup
 *   - subject generation
 *   - enrichment flags
 *
 * ALL send paths (run-daily, send-test, global-send, preview) MUST use
 * this module instead of maintaining independent template/data logic.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * EMAIL REGISTRY — config for every email type
 * ═══════════════════════════════════════════════════════════════════════
 */

import { assembleMlbEmailData } from './mlbEmailData.js';
import { dedupeNewsItems } from './newsDedupe.js';
import { fetchScoresSource, fetchRankingsSource, fetchNewsAggregateSource, fetchOddsSource } from '../_sources.js';
import { getAtsLeadersPipeline } from '../home/atsPipeline.js';
import { assembleTeamDigestPayload, TEAM_DIGEST_MAX_TEAMS } from './teamDigest.js';
import { getProfileEntitlements } from './entitlements.js';

/**
 * Email type registry. Every email type is defined here ONCE.
 * Send paths should NEVER duplicate this configuration.
 */
export const EMAIL_REGISTRY = {
  global_briefing: {
    template: 'globalBriefing',
    prefKey: 'global_briefing',
    sport: 'global',
    dataNeeds: ['ncaam', 'mlb'],
    mlbFlags: { includeSummary: true, includePicks: true },
    includePennantRace: true,
    includeWorldSeriesOutlook: true,
  },
  mlb_briefing: {
    template: 'mlbBriefing',
    prefKey: 'mlb_briefing',
    sport: 'mlb',
    dataNeeds: ['mlb'],
    mlbFlags: { includeSummary: true, includePicks: false },
  },
  mlb_team_digest: {
    template: 'mlbTeamDigest',
    prefKey: 'mlb_team_digest',
    sport: 'mlb',
    dataNeeds: ['mlb'],
    mlbFlags: { includeSummary: false, includePicks: false },
    isTeamDigest: true,
    enrichTeamIntel: true,
  },
  mlb_picks: {
    template: 'mlbPicks',
    prefKey: 'mlb_picks',
    sport: 'mlb',
    dataNeeds: ['mlb'],
    mlbFlags: { includeSummary: false, includePicks: true },
  },
  ncaam_briefing: {
    template: 'daily',
    prefKey: 'ncaam_briefing',
    sport: 'ncaam',
    dataNeeds: ['ncaam'],
    seasonGated: true,
  },
  ncaam_team_digest: {
    template: 'pinned',
    prefKey: 'ncaam_team_digest',
    sport: 'ncaam',
    dataNeeds: ['ncaam'],
    seasonGated: true,
    isTeamDigest: true,
  },
  ncaam_picks: {
    template: 'odds',
    prefKey: 'ncaam_picks',
    sport: 'ncaam',
    dataNeeds: ['ncaam'],
    seasonGated: true,
  },
};

export const VALID_EMAIL_TYPES = Object.keys(EMAIL_REGISTRY);

/**
 * Get the registry entry for an email type.
 */
export function getEmailConfig(type) {
  return EMAIL_REGISTRY[type] || null;
}

/**
 * Resolve template name for an email type. Single source of truth.
 */
export function resolveTemplate(type) {
  const config = EMAIL_REGISTRY[type];
  return config?.template || null;
}

/**
 * Resolve preference key for an email type.
 */
export function resolvePrefKey(type) {
  const config = EMAIL_REGISTRY[type];
  return config?.prefKey || null;
}

/**
 * Check if an email type is season-gated (NCAAM offseason).
 */
export function isSeasonGated(type) {
  return EMAIL_REGISTRY[type]?.seasonGated === true;
}

/**
 * Get the sport for an email type.
 */
export function getEmailSport(type) {
  return EMAIL_REGISTRY[type]?.sport || null;
}

/**
 * Load the sport-specific team lookup function.
 */
export async function loadTeamLookup(type) {
  const sport = getEmailSport(type);
  try {
    if (sport === 'mlb') {
      const mod = await import('../../src/sports/mlb/teams.js');
      return mod.getMLBTeamBySlug;
    }
    // NCAAM / default
    const mod = await import('../../src/data/teams.js');
    return mod.getTeamBySlug;
  } catch (err) {
    console.warn(`[emailPipeline] Failed to load teams for ${type}:`, err.message);
    return null;
  }
}

/**
 * Filter pinned team slugs to only the relevant sport.
 */
export function filterSportSlugs(slugs, getTeamBySlugFn) {
  if (!getTeamBySlugFn || !slugs?.length) return [];
  return slugs.filter(s => getTeamBySlugFn(s) != null);
}

/**
 * Assemble the shared data payload for an email type.
 * This is the canonical data assembly — all send paths should call this.
 *
 * @param {string} type — email type key
 * @param {string} baseUrl — e.g. "http://maximussports.ai"
 * @returns {object} assembled data for the email
 */
export async function assembleEmailData(type, baseUrl) {
  const config = EMAIL_REGISTRY[type];
  if (!config) throw new Error(`Unknown email type: ${type}`);

  const result = {
    scoresToday: [],
    rankingsTop25: [],
    atsLeaders: { best: [], worst: [] },
    headlines: [],
    oddsGames: [],
    botIntelBullets: [],
    mlbData: null,
    mlbNarrativeParagraph: '',
    picksBoard: null,
    briefingContext: {},
    modelSignals: [],
    tournamentMeta: {},
    pennantRace: null,
  };

  const needs = config.dataNeeds || [];

  // Fetch NCAAM data if needed
  if (needs.includes('ncaam')) {
    const [scoresTodayRaw, rankingsData, atsResult, newsData, oddsRaw] = await Promise.allSettled([
      fetchScoresSource(),
      fetchRankingsSource(),
      getAtsLeadersPipeline(),
      fetchNewsAggregateSource({ includeNational: true }),
      config.template === 'odds' ? fetchOddsSource() : Promise.resolve(null),
    ]);

    result.scoresToday = scoresTodayRaw.status === 'fulfilled' ? (scoresTodayRaw.value || []) : [];
    result.rankingsTop25 = rankingsData.status === 'fulfilled'
      ? (rankingsData.value?.rankings || []).slice(0, 25) : [];
    result.atsLeaders = atsResult.status === 'fulfilled'
      ? { best: atsResult.value?.best || [], worst: atsResult.value?.worst || [] }
      : { best: [], worst: [] };
    const headlinesRaw = newsData.status === 'fulfilled' ? (newsData.value?.items || []) : [];
    result.headlines = dedupeNewsItems(headlinesRaw);
    result.oddsGames = (oddsRaw?.status === 'fulfilled' && oddsRaw.value?.games)
      ? oddsRaw.value.games.map(g => ({ ...g, gameStatus: 'Scheduled', startTime: g.commenceTime || null }))
      : [];
  }

  // Fetch MLB data if needed
  if (needs.includes('mlb')) {
    const flags = config.mlbFlags || {};
    const mlbData = await assembleMlbEmailData(baseUrl, {
      includeSummary: flags.includeSummary ?? false,
      includePicks: flags.includePicks ?? false,
    });

    if (config.sport === 'mlb') {
      // For pure MLB emails, MLB data IS the primary data
      result.headlines = mlbData.headlines;
      result.scoresToday = mlbData.scoresToday;
      result.botIntelBullets = mlbData.botIntelBullets;
      result.mlbNarrativeParagraph = mlbData.narrativeParagraph;
      result.rankingsTop25 = mlbData.rankingsTop25;
      result.atsLeaders = mlbData.atsLeaders;
      result.oddsGames = mlbData.oddsGames;
      result.picksBoard = mlbData.picksBoard;
    }

    // For global briefing, MLB data is supplementary
    result.mlbData = mlbData;

    // Pennant race (top 3 per league)
    if (config.includePennantRace) {
      try {
        const { getSeasonProjections, filterTeams } = await import('../../src/data/mlb/seasonModel.js');
        const all = getSeasonProjections();
        const alTop = filterTeams(all, { league: 'AL' }).sort((a, b) => b.projectedWins - a.projectedWins).slice(0, 3);
        const nlTop = filterTeams(all, { league: 'NL' }).sort((a, b) => b.projectedWins - a.projectedWins).slice(0, 3);
        result.mlbData.pennantRace = { al: alTop, nl: nlTop };
      } catch (err) {
        console.warn(`[emailPipeline] Pennant race build failed: ${err.message}`);
      }
    }

    // World Series Outlook (top 5 per league with full projection details)
    if (config.includeWorldSeriesOutlook) {
      try {
        const { getSeasonProjections, filterTeams } = await import('../../src/data/mlb/seasonModel.js');
        const all = getSeasonProjections();
        const champOdds = mlbData.champOdds || {};

        const enrichTeam = (t) => {
          const oddsData = champOdds[t.slug];
          const oddsVal = oddsData?.bestChanceAmerican ?? oddsData?.american ?? null;
          const fullRat = t.rationale || '';
          const sents = fullRat.match(/[^.!?]*[.!?]+/g) || [];
          const driverS = sents.find(s => /strongest|primary|engine|firepower|rotation|bullpen|offense|lineup/i.test(s));
          const marketS = sents.find(s => /market|value signal|above.*market|below.*market/i.test(s));
          const closeS = sents.find(s => /range:|profile,/i.test(s));
          const distilled = [driverS, marketS || closeS]
            .filter(Boolean).map(s => s.trim()).join(' ')
            || sents.slice(0, 2).join(' ').trim() || '';

          return {
            ...t,
            champOdds: oddsVal,
            distilledRationale: distilled,
            rangeLabel: t.floor && t.ceiling ? `${t.floor}\u2013${t.ceiling}` : '',
          };
        };

        const alTop5 = filterTeams(all, { league: 'AL' }).sort((a, b) => b.projectedWins - a.projectedWins).slice(0, 5).map(enrichTeam);
        const nlTop5 = filterTeams(all, { league: 'NL' }).sort((a, b) => b.projectedWins - a.projectedWins).slice(0, 5).map(enrichTeam);
        result.mlbData.worldSeriesOutlook = { al: alTop5, nl: nlTop5 };
      } catch (err) {
        console.warn(`[emailPipeline] World Series Outlook build failed: ${err.message}`);
      }
    }
  }

  return result;
}

/**
 * Enrich MLB team digest entries with projection data and intel summaries.
 */
export async function enrichMlbTeamDigests(teamDigests, getTeamBySlugFn) {
  if (!teamDigests?.length) return;
  try {
    const { getTeamProjection } = await import('../../src/data/mlb/seasonModel.js');
    const { getTeamMeta } = await import('../../src/data/mlb/teamMeta.js');
    const { buildMlbTeamIntelSummary } = await import('../../src/data/mlb/teamIntelSummary.js');

    for (const digest of teamDigests) {
      const slug = digest.team?.slug;
      if (!slug) continue;
      const proj = getTeamProjection(slug);
      const meta = getTeamMeta(slug);
      const teamData = getTeamBySlugFn?.(slug);
      if (proj) {
        digest.team.division = teamData?.division || proj.division || '';
        digest.team.conference = `${proj.projectedWins}W projected \u2022 ${proj.divOutlook || ''} \u2022 ${teamData?.division || ''}`;
        digest.maximusInsight = buildMlbTeamIntelSummary({
          team: teamData || digest.team,
          projection: proj,
          meta,
          odds: null,
        });
        digest._meta = meta;
        digest._projection = proj;
      }
    }
  } catch (err) {
    console.warn(`[emailPipeline] MLB digest enrichment failed: ${err.message}`);
  }
}

/**
 * Build the full emailData object for a template.
 *
 * @param {string} type — email type key
 * @param {object} assembledData — from assembleEmailData()
 * @param {object} recipientContext — { displayName, pinnedTeams, pinnedSlugs }
 * @returns {object} emailData ready to pass to template
 */
export function buildEmailData(type, assembledData, recipientContext = {}) {
  const { displayName = '', pinnedTeams = [], pinnedSlugs = [] } = recipientContext;
  const maximusNote = assembledData.botIntelBullets?.[0] || '';

  return {
    displayName,
    scoresToday: assembledData.scoresToday,
    rankingsTop25: assembledData.rankingsTop25,
    atsLeaders: assembledData.atsLeaders,
    headlines: assembledData.headlines,
    pinnedTeams,
    pinnedSlugs,
    botIntelBullets: assembledData.botIntelBullets,
    maximusNote,
    oddsGames: assembledData.oddsGames,
    modelSignals: assembledData.modelSignals,
    tournamentMeta: assembledData.tournamentMeta,
    narrativeParagraph: assembledData.mlbNarrativeParagraph || assembledData.briefingContext?.narrativeParagraph || '',
    priorDayResults: assembledData.briefingContext?.priorDayResults || [],
    todayUpcoming: assembledData.briefingContext?.todayUpcoming || [],
    picksSummary: assembledData.briefingContext?.picksSummary || '',
    picksBoard: assembledData.picksBoard || null,
    mlbData: assembledData.mlbData || null,
    pennantRace: assembledData.mlbData?.pennantRace || null,
    worldSeriesOutlook: assembledData.mlbData?.worldSeriesOutlook || null,
    leadersCategories: assembledData.mlbData?.leadersCategories || {},
    champOdds: assembledData.mlbData?.champOdds || {},
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 * CANONICAL HERO EMAIL HELPER — prepareEmailPayload()
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Single source of truth for preparing a template-ready emailData payload
 * for ANY email type. Both production (run-daily.js) and test (send-test.js)
 * MUST call this function — no reimplementation, no reconstruction, no
 * field extraction.
 *
 * This guarantees prod/test parity by design: there is literally ONE
 * assembly+build path. Any drift would require bypassing this function.
 *
 * Hero-email critical sections (for global_briefing) are always derived
 * from the canonical assembled payload via buildEmailData().
 *
 * @param {string} type — email type key (e.g. 'global_briefing')
 * @param {string} baseUrl — e.g. "https://maximussports.ai"
 * @param {object} recipientContext — { displayName, pinnedTeams, pinnedSlugs }
 * @returns {Promise<{ assembled, emailData }>}
 */
export async function prepareEmailPayload(type, baseUrl, recipientContext = {}) {
  const assembled = await assembleEmailData(type, baseUrl);
  const emailData = buildEmailData(type, assembled, recipientContext);

  // Hero-email parity diagnostics — logs the exact section presence contract
  if (type === 'global_briefing') {
    const digest = globalBriefingSectionDigest(emailData);
    console.log('[prepareEmailPayload] global_briefing section digest:', JSON.stringify(digest));
    const missing = expectedHeroSections(digest);
    if (missing.length > 0) {
      console.warn(`[prepareEmailPayload] global_briefing MISSING hero sections: ${missing.join(', ')}`);
    }
  }

  return { assembled, emailData };
}

/**
 * Returns the explicit section presence profile for a global_briefing payload.
 * Used by both the production send path and parity tests.
 */
export function globalBriefingSectionDigest(emailData) {
  const md = emailData?.mlbData || {};
  const picks = md.picksBoard?.categories || {};
  const picksCount = (picks.pickEms?.length || 0) + (picks.ats?.length || 0)
                   + (picks.leans?.length || 0) + (picks.totals?.length || 0);
  return {
    hasNarrative: !!(md.narrativeParagraph && md.narrativeParagraph.length > 30),
    hasHeadlines: Array.isArray(md.headlines) && md.headlines.length > 0,
    hasPicks: picksCount > 0,
    hasPennant: !!(emailData?.pennantRace?.al?.length && emailData?.pennantRace?.nl?.length),
    hasLeaders: !!(emailData?.leadersCategories && Object.keys(emailData.leadersCategories).length > 0),
    hasOutlook: !!(emailData?.worldSeriesOutlook?.al?.length && emailData?.worldSeriesOutlook?.nl?.length),
    hasChampOdds: !!(emailData?.champOdds && Object.keys(emailData.champOdds).length > 0),
  };
}

/**
 * Returns the list of hero-email sections that should be present but are not.
 * Used for runtime diagnostics — warns if a durable section is missing.
 */
export function expectedHeroSections(digest) {
  const missing = [];
  // Durable sections (always-available) — MUST be present
  if (!digest.hasPennant) missing.push('pennantRace');
  if (!digest.hasOutlook) missing.push('worldSeriesOutlook');
  if (!digest.hasLeaders) missing.push('leadersCategories');
  if (!digest.hasChampOdds) missing.push('champOdds');
  return missing;
}

/**
 * Generate a debug summary for parity checking.
 */
export function emailPayloadDigest(type, emailData) {
  const config = EMAIL_REGISTRY[type];
  return {
    type,
    template: config?.template,
    sport: config?.sport,
    keys: Object.keys(emailData).filter(k => emailData[k] != null),
    hasMlbData: !!emailData.mlbData,
    mlbNarrativeLen: emailData.mlbData?.narrativeParagraph?.length || emailData.narrativeParagraph?.length || 0,
    mlbHeadlineCount: emailData.mlbData?.headlines?.length || 0,
    ncaamHeadlineCount: emailData.headlines?.length || 0,
    picksCount: emailData.picksBoard?.categories
      ? Object.values(emailData.picksBoard.categories).reduce((acc, arr) => acc + (arr?.length || 0), 0)
      : 0,
    hasPennant: !!emailData.pennantRace || !!emailData.mlbData?.pennantRace,
    pinnedTeamCount: emailData.pinnedTeams?.length || 0,
    pinnedSlugCount: emailData.pinnedSlugs?.length || 0,
  };
}
