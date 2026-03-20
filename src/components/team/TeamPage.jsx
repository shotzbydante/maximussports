import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getTeamBySlug } from '../../data/teams';
import { fetchTeamPage } from '../../api/team';
import { track } from '../../analytics/index';
import TeamLogo from '../shared/TeamLogo';
import TeamSchedule from './TeamSchedule';
import { computeAtsFromScheduleAndHistory } from './MaximusInsight';
import TeamSummaryBox from './TeamSummaryBox';
import SourceBadge from '../shared/SourceBadge';
import { fetchChampionshipOdds } from '../../api/championshipOdds';
import { fetchTeamNextLine } from '../../api/teamNextLine';
import { ModuleShell } from '../shared/ModuleShell';
import YouTubeVideoRail from '../shared/YouTubeVideoRail';
import YouTubeVideoModal from '../shared/YouTubeVideoModal';
import { getCachedVideos, setCachedVideos, getCached, setCached, getCacheAge,
  getStaleVideos, getStaleVideosAge, setStaleVideos } from '../../utils/ytClientCache';
import ShareButton from '../common/ShareButton';
import { buildMatchupSlug } from '../../utils/matchupSlug';
import { getTeamSlug } from '../../utils/teamSlug';
import { getTeamColors } from '../../utils/teamColors';
import { teamPersonality } from '../../utils/teamSnapshot';
import { getPinnedTeams, togglePinnedTeam } from '../../utils/pinnedTeams';
import { notifyPinnedChanged } from '../../utils/pinnedSync';
import SeedBadge from '../common/SeedBadge';
import { getTeamSeed, getTeamRegion, isBracketOfficial, isTournamentActive, getTournamentTeam } from '../../utils/tournamentHelpers';
import { normalizeTeamCardFields, fmtRecord, fmtAts } from '../../utils/teamCardFields';
import SEOHead, { buildOgImageUrl } from '../seo/SEOHead';
import styles from './TeamPage.module.css';

const ytDebug = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).has('debugYT');
const debugVideos = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).has('debugVideos');
const debugTeam = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).has('debugTeam');
const debugTeamNews = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).has('debugTeamNews');

const NEXT_LINE_SLOW_MS  = 18000;
const TEAM_PAGE_TTL_MS   = 5 * 60 * 1000;
const TEAM_PAGE_STALE_MS = 60 * 1000;

function formatDate(str) {
  if (!str) return '';
  try {
    const d = new Date(str);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  } catch { return str; }
}
function formatDateTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch { return iso; }
}
function formatSpread(n) {
  if (n == null || typeof n !== 'number') return '—';
  return n > 0 ? `+${n}` : String(n);
}
function formatMoneyline(n) {
  if (n == null || typeof n !== 'number') return '—';
  return n > 0 ? `+${n}` : String(n);
}

const TIER_LABEL = {
  Lock: { cls: 'tierLock', icon: '✓' },
  'Should be in': { cls: 'tierShould', icon: '↗' },
  'Work to do': { cls: 'tierWork', icon: '⚠' },
  'Long shot': { cls: 'tierLong', icon: '↘' },
};

const SECTION_NAV = [
  { id: 'briefing', label: 'Intel' },
  { id: 'nextgame', label: 'Next Game' },
  { id: 'performance', label: 'ATS' },
  { id: 'results', label: 'Results' },
  { id: 'schedule', label: 'Schedule' },
];

export default function TeamPage() {
  const { slug } = useParams();
  const team = getTeamBySlug(slug);
  const [batch, setBatch] = useState(null);
  const [headlines, setHeadlines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [championshipOdds, setChampionshipOdds] = useState({});
  const [championshipOddsMeta, setChampionshipOddsMeta] = useState(null);
  const [championshipOddsLoading, setChampionshipOddsLoading] = useState(true);
  const [nextLine, setNextLine] = useState({ nextEvent: null, consensus: {}, outliers: {}, movement: null, contributingBooks: {}, oddsMeta: {} });
  const [nextLineLoading, setNextLineLoading] = useState(true);
  const [nextLineLoadStarted, setNextLineLoadStarted] = useState(null);
  const [videos, setVideos] = useState([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [videosError, setVideosError] = useState(false);
  const [videosIsStale, setVideosIsStale] = useState(false);
  const [videosStaleAgeMs, setVideosStaleAgeMs] = useState(0);
  const [activeVideo, setActiveVideo] = useState(null);
  const [isPinned, setIsPinned] = useState(false);
  const [newsExpanded, setNewsExpanded] = useState(false);
  const [activeSection, setActiveSection] = useState('briefing');
  const [debugInfo, setDebugInfo] = useState(null);

  useEffect(() => {
    if (slug) setIsPinned(getPinnedTeams().includes(slug));
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    track('team_view', { team_slug: slug, team_name: team?.name, conference: team?.conference, tier: team?.oddsTier });
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  // Batch load: core first, then full
  useEffect(() => {
    if (!team || !slug) { setLoading(false); return; }
    let cancelled = false;
    const t0 = debugTeam ? Date.now() : 0;

    function applyData(data) {
      const news = (data.teamNews || []).map((item, i) => ({
        id: item.link || item.id || `news-${i}`,
        title: item.title, link: item.link, pubDate: item.pubDate, source: item.source || 'News',
      }));
      const cacheKey = `teamPage:${slug}`;
      setCached(cacheKey, { batch: data, headlines: news }, TEAM_PAGE_TTL_MS);
      if (!cancelled) { setBatch(data); setHeadlines(news); }
    }

    function applyCoreOnly(data) {
      if (cancelled) return;
      setBatch(data);
      setHeadlines((data.teamNews || []).map((item, i) => ({
        id: item.link || item.id || `news-${i}`,
        title: item.title, link: item.link, pubDate: item.pubDate, source: item.source || 'News',
      })));
    }

    const cacheKey = `teamPage:${slug}`;
    const cached = getCached(cacheKey);
    const age = getCacheAge(cacheKey);

    if (cached) {
      setBatch(cached.batch); setHeadlines(cached.headlines); setLoading(false);
      if (age > TEAM_PAGE_STALE_MS) {
        fetchTeamPage(slug).then(applyData).catch(() => {});
      }
      return () => { cancelled = true; };
    }

    setLoading(true); setError(null);
    fetchTeamPage(slug, { coreOnly: true })
      .then((coreData) => {
        if (cancelled) return;
        applyCoreOnly(coreData); setLoading(false);
        return fetchTeamPage(slug, { debugNews: debugTeamNews });
      })
      .then((fullData) => { if (!cancelled && fullData) applyData(fullData); })
      .catch((err) => { if (!cancelled) setError(err?.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [slug, team]);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setChampionshipOddsLoading(true);
    fetchChampionshipOdds()
      .then(({ odds, oddsMeta }) => { if (!cancelled) { setChampionshipOdds(odds ?? {}); setChampionshipOddsMeta(oddsMeta ?? null); setChampionshipOddsLoading(false); } })
      .catch(() => { if (!cancelled) { setChampionshipOdds({}); setChampionshipOddsMeta(null); setChampionshipOddsLoading(false); } });
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    setNextLineLoading(true); setNextLineLoadStarted(Date.now());
    let cancelled = false;
    fetchTeamNextLine(slug)
      .then((data) => { if (!cancelled) { setNextLine(data); setNextLineLoading(false); } })
      .catch(() => { if (!cancelled) { setNextLine({ nextEvent: null, consensus: {}, outliers: {}, movement: null, contributingBooks: {}, oddsMeta: { stage: 'error' } }); setNextLineLoading(false); } });
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    const cached = getCachedVideos(slug);
    if (cached) { setVideos(cached); setVideosIsStale(false); setVideosLoading(false); return; }
    const stale = getStaleVideos(slug);
    if (stale?.length > 0) {
      setVideos(stale); setVideosIsStale(true); setVideosStaleAgeMs(getStaleVideosAge(slug)); setVideosLoading(false);
    }
    const controller = new AbortController();
    const qs = new URLSearchParams({ teamSlug: slug, maxResults: '6' });
    if (!stale?.length) setVideosLoading(true);
    fetch(`/api/youtube/team?${qs}`, { signal: controller.signal })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => {
        const items = data.items ?? [];
        track('videos_fetch_result', { team_slug: slug, items_count: items.length, status: items.length > 0 ? 'ok' : (data.status ?? 'empty') });
        if (items.length > 0) { setCachedVideos(slug, items); setStaleVideos(slug, items); setVideos(items); setVideosIsStale(false); setVideosError(false); }
        else if (!stale?.length) { setVideos([]); setVideosIsStale(false); }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          track('videos_fetch_result', { team_slug: slug, items_count: 0, status: 'error' });
          if (!stale?.length) { setVideosError(true); setVideos([]); }
        }
      })
      .finally(() => { setVideosLoading(false); });
    return () => controller.abort();
  }, [slug]);

  // Intersection observer for section nav
  useEffect(() => {
    const ids = SECTION_NAV.map((s) => s.id);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) { setActiveSection(entry.target.id); break; }
        }
      },
      { rootMargin: '-20% 0px -70% 0px' }
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [batch]);

  const rank = batch?.rank ?? null;
  const nextLineSlow = nextLineLoadStarted != null && nextLineLoading && (Date.now() - nextLineLoadStarted > NEXT_LINE_SLOW_MS);

  const { scheduleForSummary, atsForSummary } = useMemo(() => {
    const events = batch?.schedule?.events ?? [];
    const upcoming = events.filter((e) => !e.isFinal).sort((a, b) => new Date(a.date) - new Date(b.date));
    const recent = events.filter((e) => e.isFinal).sort((a, b) => new Date(b.date) - new Date(a.date));
    const ats = batch?.schedule && batch?.oddsHistory && team
      ? computeAtsFromScheduleAndHistory(batch.schedule, batch.oddsHistory, team.name)
      : null;
    return { scheduleForSummary: { upcoming, recent, events }, atsForSummary: ats };
  }, [batch?.schedule, batch?.oddsHistory, team]);

  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const last7 = headlines.filter((h) => new Date(h.pubDate || 0).getTime() >= sevenDaysAgo);

  // Derived: record, streak, form guide
  const { record, streak, formGuide, recentGames } = useMemo(() => {
    const events = batch?.schedule?.events ?? [];
    const finals = events.filter((e) => e.isFinal).sort((a, b) => new Date(b.date) - new Date(a.date));
    let w = 0, l = 0;
    finals.forEach((e) => { if (e.ourScore != null && e.oppScore != null) { if (e.ourScore > e.oppScore) w++; else l++; } });
    const rec = (w + l > 0) ? `${w}-${l}` : null;

    let streakStr = null;
    if (finals.length > 0) {
      const scored = finals.filter((e) => e.ourScore != null && e.oppScore != null);
      if (scored.length > 0) {
        const firstWin = scored[0].ourScore > scored[0].oppScore;
        let count = 1;
        for (let i = 1; i < scored.length; i++) {
          const isWin = scored[i].ourScore > scored[i].oppScore;
          if (isWin === firstWin) count++;
          else break;
        }
        streakStr = firstWin ? `W${count}` : `L${count}`;
      }
    }

    const form = finals.slice(0, 7).map((e) => {
      if (e.ourScore == null || e.oppScore == null) return null;
      const won = e.ourScore > e.oppScore;
      return { won, score: `${e.ourScore}-${e.oppScore}`, opponent: e.opponent, date: e.date };
    }).filter(Boolean);

    return { record: rec, streak: streakStr, formGuide: form, recentGames: finals.slice(0, 7) };
  }, [batch?.schedule?.events]);

  const personality = useMemo(() => {
    if (!team || !atsForSummary) return null;
    return teamPersonality(atsForSummary, team.oddsTier);
  }, [team, atsForSummary]);

  const teamColors = useMemo(() => getTeamColors(slug), [slug]);

  const nextUpcoming = (batch?.schedule?.events ?? [])
    .filter((e) => !e.isFinal)
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0];

  const nextOpponentSlug = nextUpcoming
    ? (() => {
        const oppName = (nextUpcoming.awayTeam === team?.name) ? nextUpcoming.homeTeam : nextUpcoming.awayTeam;
        return oppName ? getTeamSlug(oppName) : null;
      })()
    : null;

  const nextMatchupLink = nextOpponentSlug ? `/games/${buildMatchupSlug(slug, nextOpponentSlug)}` : null;

  const handleTogglePin = () => {
    const after = togglePinnedTeam(slug);
    setIsPinned(!isPinned);
    notifyPinnedChanged(after, 'home');
    track(isPinned ? 'team_unpin' : 'team_pin', { team_slug: slug });
  };

  if (!team) {
    return (
      <div className={styles.page}>
        <SEOHead title="Team Not Found" description="The requested college basketball team was not found." canonicalPath={`/teams/${slug}`} noindex />
        <h1>Team Not Found</h1>
        <p>That team doesn&apos;t exist.</p>
        <Link to="/teams">← Teams</Link>
      </div>
    );
  }

  const cardFields = useMemo(() => {
    if (!batch) return null;
    return normalizeTeamCardFields(slug, batch, atsForSummary?.season ?? null);
  }, [slug, batch, atsForSummary]);

  const currentYear = new Date().getFullYear();
  const teamSeoTitle = `${team.name} Team Intel`;
  const teamSeoDesc = `ATS trends, next-game intel, rankings, and betting signals for ${team.name}. ${team.conference} conference intelligence powered by Maximus Sports.`;
  const teamOgImage = buildOgImageUrl({ title: team.name, subtitle: 'ATS trends, matchup edges & betting intelligence', meta: atsForSummary?.season?.total > 0 ? `ATS: ${atsForSummary.season.wins}\u2013${atsForSummary.season.losses}` : team.conference, team: team.name, type: 'Team Intel' });
  const tierInfo = TIER_LABEL[team.oddsTier] || {};
  const hasConsensus = nextLine.consensus?.spread != null || nextLine.consensus?.total != null || nextLine.consensus?.moneyline != null;

  return (
    <div className={styles.page}>
      <SEOHead
        title={teamSeoTitle}
        description={teamSeoDesc}
        canonicalPath={`/teams/${slug}`}
        ogImage={teamOgImage}
        jsonLd={{ '@context': 'https://schema.org', '@type': 'SportsTeam', name: team.name, sport: 'Basketball', memberOf: { '@type': 'SportsOrganization', name: team.conference }, url: `https://maximussports.ai/teams/${slug}` }}
      />

      {/* ── Hero ── */}
      <header className={styles.hero} style={{ '--team-primary': teamColors.primary, '--team-secondary': teamColors.secondary }}>
        <div className={styles.heroAccent} />
        <Link to="/teams" className={styles.backLink}>← Team Intel Hub</Link>
        <div className={styles.heroMain}>
          <div className={styles.heroIdentity}>
            <TeamLogo team={team} size={56} />
            <div className={styles.heroText}>
              <h1 className={styles.teamName}>{team.name}</h1>
              <div className={styles.heroMeta}>
                {(() => {
                  const bracketOfficial = isBracketOfficial();
                  const seed = getTeamSeed(slug);
                  return (
                    <>
                      {seed != null && <SeedBadge seed={seed} size="md" teamSlug={slug} />}
                      {seed != null && (() => {
                        const region = getTeamRegion(slug);
                        return region ? <span className={styles.regionTag}>{region} Region</span> : null;
                      })()}
                      {!bracketOfficial && rank != null && seed == null && <span className={styles.rank}>#{rank}</span>}
                    </>
                  );
                })()}
                <span className={styles.conference}>{team.conference}</span>
                {record && <span className={styles.record}>{record}</span>}
                {cardFields?.atsRecord && (
                  <span className={styles.record} title="Full-season ATS">ATS: {fmtAts(cardFields.atsRecord)}</span>
                )}
                {streak && (
                  <span className={`${styles.streak} ${streak.startsWith('W') ? styles.streakWin : styles.streakLoss}`}>
                    {streak}
                  </span>
                )}
                {cardFields?.tournamentLabel && (
                  <span className={`${styles.tournamentChip} ${cardFields.tournamentStatus === 'active' ? styles.tournamentActive : ''} ${cardFields.tournamentStatus === 'eliminated' ? styles.tournamentElim : ''}`}>
                    {cardFields.tournamentLabel}
                  </span>
                )}
                {!isBracketOfficial() && (
                  <span className={`${styles.tierBadge} ${styles[tierInfo.cls] || ''}`} title={team.oddsTier}>
                    {team.oddsTier}
                  </span>
                )}
              </div>
              {!championshipOddsLoading && (() => {
                const entry = championshipOdds?.[slug];
                const odds = entry?.bestChanceAmerican ?? entry?.american ?? null;
                if (odds == null) return null;
                const label = odds > 0 ? `+${odds}` : String(odds);
                return (
                  <div className={styles.champChip}>
                    <span className={styles.champChipIcon}>🏆</span>
                    <div className={styles.champChipText}>
                      <span className={styles.champChipLabel}>Title Odds</span>
                      <span className={styles.champChipValue}>{label}</span>
                    </div>
                  </div>
                );
              })()}
              {personality && <p className={styles.personality}>{personality}</p>}
            </div>
          </div>
          <div className={styles.heroActions}>
            <button type="button" className={`${styles.pinBtn} ${isPinned ? styles.pinBtnActive : ''}`} onClick={handleTogglePin} title={isPinned ? 'Unpin team' : 'Pin team'}>
              {isPinned ? '★' : '☆'}
            </button>
            <ShareButton
              variant="primary"
              shareType="team_intel"
              title={`${team.name} — Intel Briefing`}
              subtitle={(() => {
                const parts = [];
                if (record) parts.push(record);
                if (atsForSummary?.season?.total > 0) parts.push(`ATS: ${atsForSummary.season.wins}–${atsForSummary.season.losses}`);
                if (parts.length === 0 && rank != null) parts.push(`#${rank} ${team.conference}`);
                return parts.join(' | ') || team.conference;
              })()}
              meta={rank != null ? `${team.conference} | #${rank}` : team.conference}
              teamSlug={slug}
              destinationPath={`/teams/${slug}`}
              placement="team_header"
            />
          </div>
        </div>
      </header>

      {/* ── Section Nav ── */}
      <nav className={styles.sectionNav} aria-label="Page sections">
        {SECTION_NAV.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className={`${styles.navPill} ${activeSection === s.id ? styles.navPillActive : ''}`}
            onClick={(e) => { e.preventDefault(); document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
          >
            {s.label}
          </a>
        ))}
      </nav>

      <div className={styles.content}>
        {/* ── Intel Briefing ── */}
        <section id="briefing">
          <TeamSummaryBox
            slug={slug}
            team={team}
            schedule={scheduleForSummary}
            ats={atsForSummary}
            news={last7}
            rank={rank}
            nextLine={nextLine}
            championshipOdds={(() => {
              const entry = championshipOdds?.[slug];
              return entry?.bestChanceAmerican ?? entry?.american ?? null;
            })()}
            dataReady={!!batch}
          />
        </section>

        {/* ── Desktop 2-col: Next Game + Performance ── */}
        <div className={styles.twoCol}>
          {/* ── Next Game Spotlight ── */}
          <section id="nextgame" className={styles.nextGameCard}>
            <h3 className={styles.sectionTitle}>Next Game</h3>
            {nextLineLoading && !nextLine.nextEvent && (
              <p className={styles.muted}>Loading odds…</p>
            )}
            {!nextLineLoading && nextLine.nextEvent && (
              <div className={styles.nextGameBody}>
                <div className={styles.nextGameMatchup}>
                  {(() => {
                    const oppName = nextLine.nextEvent.opponent || 'TBD';
                    const oppSlug = getTeamSlug(oppName);
                    const oppTeam = oppSlug ? { slug: oppSlug, name: oppName } : null;
                    const oppSeed = getTeamSeed(oppSlug || oppName);
                    return (
                      <>
                        {oppSeed != null && <SeedBadge seed={oppSeed} size="sm" teamSlug={oppSlug} />}
                        {oppTeam && <TeamLogo team={oppTeam} size={28} />}
                        <span className={styles.nextGameLabel}>vs</span>
                        <strong className={styles.nextGameOpponent}>{oppName}</strong>
                      </>
                    );
                  })()}
                  {nextLine.nextEvent.commenceTime && (
                    <span className={styles.nextGameTime}>{formatDateTime(nextLine.nextEvent.commenceTime)}</span>
                  )}
                </div>
                {!nextLine.nextEvent.opponent || nextLine.nextEvent.opponent === 'TBD' ? (
                  <div className={styles.nextGameTbd}>
                    <p className={styles.nextGameTbdContext}>
                      {isTournamentActive() && getTeamSeed(slug)
                        ? `NCAA Tournament — ${getTeamRegion(slug) || ''} Region — opponent TBD`
                        : `${team.conference} Tournament — opponent TBD`}
                    </p>
                    <p className={styles.nextGameTbdLine}>Line: pending</p>
                  </div>
                ) : (
                  <>
                    {hasConsensus && (
                      <div className={styles.nextGameOdds}>
                        {nextLine.consensus?.spread != null && (
                          <div className={styles.oddsPill}>
                            <span className={styles.oddsLabel}>Spread</span>
                            <span className={styles.oddsValue}>{formatSpread(nextLine.consensus.spread)}</span>
                          </div>
                        )}
                        {nextLine.consensus?.total != null && (
                          <div className={styles.oddsPill}>
                            <span className={styles.oddsLabel}>O/U</span>
                            <span className={styles.oddsValue}>{nextLine.consensus.total}</span>
                          </div>
                        )}
                        {nextLine.consensus?.moneyline != null && (
                          <div className={styles.oddsPill}>
                            <span className={styles.oddsLabel}>ML</span>
                            <span className={styles.oddsValue}>{formatMoneyline(nextLine.consensus.moneyline)}</span>
                          </div>
                        )}
                      </div>
                    )}
                    {hasConsensus && nextLine.outliers?.spreadBestForTeam && (
                      <p className={styles.nextGameDetail}>
                        Best spread: {nextLine.outliers.spreadBestForTeam.bookTitle} {formatSpread(nextLine.outliers.spreadBestForTeam.spread)}
                      </p>
                    )}
                    {hasConsensus && nextLine.outliers?.moneylineBest && (
                      <p className={styles.nextGameDetail}>
                        Best ML: {nextLine.outliers.moneylineBest.bookTitle} {formatMoneyline(nextLine.outliers.moneylineBest.moneyline)}
                      </p>
                    )}
                    {nextLine.movement?.samples > 0 && (nextLine.movement.spread?.delta !== 0 || nextLine.movement.total?.delta !== 0) && (
                      <div className={styles.nextGameMovement}>
                        {nextLine.movement.spread?.delta != null && nextLine.movement.spread.delta !== 0 && (
                          <span>Spread {nextLine.movement.spread.delta > 0 ? '↑' : '↓'} {nextLine.movement.spread.delta > 0 ? '+' : ''}{nextLine.movement.spread.delta}</span>
                        )}
                        {nextLine.movement.total?.delta != null && nextLine.movement.total.delta !== 0 && (
                          <span>Total {nextLine.movement.total.delta > 0 ? '↑' : '↓'} {nextLine.movement.total.delta > 0 ? '+' : ''}{nextLine.movement.total.delta}</span>
                        )}
                      </div>
                    )}
                    {nextMatchupLink && (
                      <Link to={nextMatchupLink} className={styles.nextGameCta}>Full matchup intel →</Link>
                    )}
                  </>
                )}
              </div>
            )}
            {!nextLineLoading && !nextLine.nextEvent && (
              <div className={styles.nextGameBody}>
                {nextLine.oddsMeta?.stage === 'error' ? (
                  <>
                    <p className={styles.muted}>Odds unavailable.</p>
                    <button type="button" className={styles.retryBtn} onClick={() => {
                      setNextLineLoadStarted(Date.now()); setNextLineLoading(true);
                      fetchTeamNextLine(slug).then((d) => { setNextLine(d); setNextLineLoading(false); }).catch(() => setNextLineLoading(false));
                    }}>Retry</button>
                  </>
                ) : nextUpcoming ? (
                  <div className={styles.nextGameTbd}>
                    <div className={styles.nextGameMatchup}>
                      {(() => {
                        const oppName = nextUpcoming.opponent || 'TBD';
                        const oppSlug = getTeamSlug(oppName);
                        const oppTeam = oppSlug ? { slug: oppSlug, name: oppName } : null;
                        const oppSeed = getTeamSeed(oppSlug || oppName);
                        return (
                          <>
                            {oppSeed != null && <SeedBadge seed={oppSeed} size="sm" teamSlug={oppSlug} />}
                            {oppTeam && <TeamLogo team={oppTeam} size={24} />}
                            <span className={styles.nextGameLabel}>{nextUpcoming.homeAway === 'home' ? 'vs' : '@'}</span>
                            <strong className={styles.nextGameOpponent}>{oppName}</strong>
                          </>
                        );
                      })()}
                    </div>
                    {(!nextUpcoming.opponent || nextUpcoming.opponent === 'TBD') && (
                      <p className={styles.nextGameTbdContext}>
                        {isTournamentActive() && getTeamSeed(slug)
                          ? `NCAA Tournament — ${getTeamRegion(slug) || ''} Region — opponent TBD`
                          : `${team.conference} Tournament — opponent TBD`}
                      </p>
                    )}
                    <p className={styles.nextGameTbdLine}>Line: pending</p>
                  </div>
                ) : (
                  <p className={styles.muted}>No upcoming game scheduled.</p>
                )}
              </div>
            )}
          </section>

          {/* ── Performance Dashboard ── */}
          <section id="performance" className={styles.perfCard}>
            <h3 className={styles.sectionTitle}>ATS Profile</h3>
            <div className={styles.perfBody}>
              {atsForSummary ? (
                <>
                  <div className={styles.atsGrid}>
                    <div className={styles.atsStat}>
                      <span className={styles.atsLabel}>Season</span>
                      <span className={styles.atsValue}>
                        {atsForSummary.season?.total > 0
                          ? <>{atsForSummary.season.wins}-{atsForSummary.season.losses}<span className={styles.atsPct}> {Math.round((atsForSummary.season.wins / atsForSummary.season.total) * 100)}%</span></>
                          : <span className={styles.atsPending}>Pending</span>}
                      </span>
                    </div>
                    <div className={styles.atsStat}>
                      <span className={styles.atsLabel}>Last 30</span>
                      <span className={styles.atsValue}>
                        {atsForSummary.last30?.total > 0
                          ? <>{atsForSummary.last30.wins}-{atsForSummary.last30.losses}<span className={styles.atsPct}> {Math.round((atsForSummary.last30.wins / atsForSummary.last30.total) * 100)}%</span></>
                          : <span className={styles.atsPending}>Pending</span>}
                      </span>
                    </div>
                    <div className={styles.atsStat}>
                      <span className={styles.atsLabel}>Last 7</span>
                      <span className={styles.atsValue}>
                        {atsForSummary.last7?.total > 0
                          ? <>{atsForSummary.last7.wins}-{atsForSummary.last7.losses}<span className={styles.atsPct}> {Math.round((atsForSummary.last7.wins / atsForSummary.last7.total) * 100)}%</span></>
                          : <span className={styles.atsPending}>Pending</span>}
                      </span>
                    </div>
                  </div>
                  <div className={styles.sourceLine}><SourceBadge source="Odds API" /></div>
                </>
              ) : (
                <div className={styles.atsGrid}>
                  <div className={styles.atsStat}><span className={styles.atsLabel}>Season ATS</span><span className={styles.atsValue}><span className={styles.atsPending}>Pending</span></span></div>
                  <div className={styles.atsStat}><span className={styles.atsLabel}>Last 30</span><span className={styles.atsValue}><span className={styles.atsPending}>Pending</span></span></div>
                  <div className={styles.atsStat}><span className={styles.atsLabel}>Last 7</span><span className={styles.atsValue}><span className={styles.atsPending}>Pending</span></span></div>
                </div>
              )}
            </div>

            {/* Form Guide */}
            {formGuide.length > 0 && (
              <div className={styles.formGuide}>
                <span className={styles.formLabel}>Form</span>
                <div className={styles.formStrip}>
                  {formGuide.map((g, i) => (
                    <span
                      key={i}
                      className={`${styles.formDot} ${g.won ? styles.formWin : styles.formLoss}`}
                      title={`${g.won ? 'W' : 'L'}\n${g.won ? 'vs' : 'vs'} ${g.opponent}\n${g.score}`}
                      aria-label={`${g.won ? 'Win' : 'Loss'} ${g.score} vs ${g.opponent}`}
                    >
                      {g.won ? 'W' : 'L'}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* ── Recent Results ── */}
        <section id="results" className={styles.resultsSection}>
          <h3 className={styles.sectionTitle}>Recent Results</h3>
          {recentGames.length > 0 ? (
            <div className={styles.resultsList}>
              {recentGames.map((ev) => {
                const oppSlug = getTeamSlug(ev.opponent);
                const won = ev.ourScore != null && ev.oppScore != null && ev.ourScore > ev.oppScore;
                const scoreStr = ev.ourScore != null && ev.oppScore != null ? `${ev.ourScore}-${ev.oppScore}` : '—';
                return (
                  <div key={ev.id} className={styles.resultRow}>
                    <span className={styles.resultDate}>{formatDate(ev.date)}</span>
                    <span className={styles.resultOpp}>
                      {ev.homeAway === 'home' ? 'vs' : '@'}{' '}
                      {oppSlug ? <Link to={`/teams/${oppSlug}`} className={styles.oppLink}>{ev.opponent}</Link> : ev.opponent}
                    </span>
                    <span className={`${styles.resultScore} ${won ? styles.resultWin : styles.resultLoss}`}>
                      {scoreStr}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className={styles.muted}>No recent results available.</p>
          )}
        </section>

        {/* ── News & Storylines ── */}
        <section className={styles.newsSection}>
          <h3 className={styles.sectionTitle}>{team.name} News</h3>
          {loading && <div className={styles.loadingRow}><span className={styles.spinner} /><span>Loading…</span></div>}
          {!loading && !error && headlines.length === 0 && (
            <p className={styles.muted}>No men&apos;s basketball coverage found recently.</p>
          )}
          {!loading && !error && headlines.length > 0 && (
            <>
              <ul className={styles.newsList}>
                {(newsExpanded ? headlines : headlines.slice(0, 4)).map((h) => (
                  <li key={h.id} className={styles.newsItem}>
                    <a href={h.link} target="_blank" rel="noopener noreferrer" className={styles.newsLink}>
                      <span className={styles.newsTitle}>{h.title}</span>
                      <span className={styles.newsMeta}>
                        <SourceBadge source={h.source} />
                        <span className={styles.newsDate}>{formatDate(h.pubDate)}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
              {headlines.length > 4 && (
                <button type="button" className={styles.expandBtn} onClick={() => setNewsExpanded(!newsExpanded)}>
                  {newsExpanded ? 'Show less' : `View all ${headlines.length} headlines`}
                </button>
              )}
            </>
          )}
        </section>

        {/* ── Videos ── */}
        <section className={styles.videosSection} aria-label="Video highlights">
          <ModuleShell
            title="Videos"
            loading={videosLoading}
            skeletonRows={2}
            isEmpty={!videosLoading && videos.length === 0 && !videosError}
            emptyMessage="No video highlights found right now."
            footer={
              team && !videosLoading && videos.length > 0 ? (
                <span className={styles.videosFooter}>
                  {videosIsStale && <span className={styles.staleLabel}>Updated {Math.round(videosStaleAgeMs / 3600000)}h ago</span>}
                  <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${team.name} basketball highlights`)}`} target="_blank" rel="noopener noreferrer" className={styles.moreLink}>More on YouTube →</a>
                </span>
              ) : null
            }
          >
            {videosError ? (
              <p className={styles.muted}>Videos unavailable. <button type="button" className={styles.retryBtn} onClick={() => {
                setVideosError(false); setVideosLoading(true);
                fetch(`/api/youtube/team?${new URLSearchParams({ teamSlug: slug, maxResults: '6' })}`)
                  .then((r) => r.json())
                  .then((data) => { const items = data.items ?? []; if (items.length > 0) { setCachedVideos(slug, items); setStaleVideos(slug, items); } setVideos(items); })
                  .catch(() => { setVideosError(true); setVideos([]); })
                  .finally(() => setVideosLoading(false));
              }}>Retry</button></p>
            ) : (
              <YouTubeVideoRail items={videos} onSelect={setActiveVideo} />
            )}
          </ModuleShell>
        </section>

        <YouTubeVideoModal video={activeVideo} onClose={() => setActiveVideo(null)} />

        {/* ── Quick Links ── */}
        <div className={styles.quickLinks}>
          {nextMatchupLink && <Link to={nextMatchupLink} className={styles.quickLink}>Next game matchup →</Link>}
          <Link to="/insights" className={styles.quickLink}>Odds Insights →</Link>
          <Link to="/college-basketball-picks-today" className={styles.quickLink}>Today&apos;s picks →</Link>
        </div>

        {/* ── Full Schedule ── */}
        <div id="schedule">
          <TeamSchedule slug={slug} initialData={batch ? { schedule: batch.schedule, oddsHistory: batch.oddsHistory, teamId: batch.teamId } : null} />
        </div>
      </div>
    </div>
  );
}
