/**
 * MemberHome — the signed-in home hub at "/".
 *
 * One screen that answers "what is on right now": every sport with its
 * live slate status, the model's top play in each in-season sport, the
 * teams the user follows, and the latest headlines.
 *
 * Sport status is read from each sport's live slate, never hardcoded, so
 * the page cannot keep saying "Playoffs Live" in November.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { WorkspaceId, SeasonState, orderWorkspacesForDisplay } from '../../workspaces/config';
import { getVisibleWorkspaces } from '../../workspaces/access';
import { useAuth } from '../../context/AuthContext';
import { useUserProfile } from '../../hooks/useUserProfile';
import usePinnedTeams from '../../hooks/usePinnedTeams';
import WorkspaceLogo from '../../components/layout/WorkspaceLogo';
import { resolveTeamLogo } from '../../utils/teamLogo';
import { resolveConviction } from '../../features/picks/conviction';
import { fetchNflGames, fetchNflHeadlines } from '../../api/nfl';
import { fetchNbaHeadlines } from '../../api/nbaNews';
import { fetchMlbHeadlines } from '../../api/mlbNews';
import { getNflTeamBySlug } from '../../sports/nfl/teams';
import { getNbaTeamBySlug } from '../../sports/nba/teams';
import { MLB_TEAMS } from '../../sports/mlb/teams';
import { getTeamBySlug as getNcaamTeamBySlug } from '../../data/teams';
import styles from './MemberHome.module.css';

const META = {
  title: 'Maximus Sports — AI-Powered Sports Intelligence',
  description: 'Maximus Sports is an AI-powered sports intelligence platform for the NFL, NBA, MLB and college basketball. Team intel, odds insights, picks, season outlooks, and editorial briefings.',
  url: 'https://maximussports.ai',
  image: 'https://maximussports.ai/og.png',
};

/** Pages each sport card links to, beyond its briefing. */
const QUICK_LINKS = {
  [WorkspaceId.NFL]: [['Games', '/games'], ['Picks', '/insights'], ['Teams', '/teams'], ['Season', '/season-model']],
  [WorkspaceId.NBA]: [['Games', '/games'], ['Picks', '/insights'], ['Teams', '/teams'], ['Bracket', '/bracketology']],
  [WorkspaceId.MLB]: [['Games', '/games'], ['Picks', '/insights'], ['Teams', '/teams'], ['Season', '/season-model']],
  [WorkspaceId.CBB]: [['Games', '/games'], ['Insights', '/insights'], ['Teams', '/teams'], ['Bracket', '/bracketology']],
};

const PICKS_ENDPOINT = {
  [WorkspaceId.NFL]: '/api/nfl/picks/built',
  [WorkspaceId.NBA]: '/api/nba/picks/built',
  [WorkspaceId.MLB]: '/api/mlb/picks/built',
};

function getJson(url) {
  return fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
}

function isToday(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function plural(n, word) { return `${n} ${word}${n === 1 ? '' : 's'}`; }

/** News feeds append " - Source" to titles; the source has its own line. */
function cleanTitle(title, source) {
  const t = String(title || '').trim();
  if (source && t.endsWith(` - ${source}`)) return t.slice(0, -(source.length + 3));
  return t;
}

/** Team logo that removes itself if the image fails, so no broken icon shows. */
function Logo({ src }) {
  if (!src) return null;
  return <img src={src} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />;
}

/** Slate status for a daily sport (MLB, NBA): games on today's date. */
function dailyStatus(games) {
  const today = (games || []).filter((g) => isToday(g.startTime) || g.status === 'live');
  const live = today.filter((g) => g.status === 'live').length;
  const upcoming = today.filter((g) => g.status === 'upcoming').length;
  const final = today.filter((g) => g.status === 'final').length;
  if (today.length === 0) return { tone: 'idle', pill: 'No games today', line: 'Nothing on the schedule today.', live: 0, count: 0 };
  const bits = [];
  if (upcoming) bits.push(`${upcoming} to play`);
  if (final) bits.push(`${final} final`);
  return {
    tone: live ? 'live' : 'active',
    pill: live ? `${live} live` : plural(today.length, 'game') + ' today',
    line: live ? [`${plural(live, 'game')} in progress`, ...bits].join(' · ') : bits.join(' · '),
    live,
    count: today.length,
  };
}

/** Slate status for the NFL: the whole week. */
function weeklyStatus(slate) {
  const { games = [], counts = {}, week, seasonType } = slate || {};
  if (games.length === 0) return { tone: 'idle', pill: 'No games this week', line: 'The next slate appears once the schedule posts.', live: 0, count: 0 };
  const label = seasonType === 3 ? 'Playoffs' : week != null ? `Week ${week}` : 'This week';
  const bits = [];
  if (counts.upcoming) bits.push(`${counts.upcoming} to play`);
  if (counts.final) bits.push(`${counts.final} final`);
  return {
    tone: counts.live ? 'live' : 'active',
    pill: counts.live ? `${label} · ${counts.live} live` : label,
    line: counts.live ? [`${plural(counts.live, 'game')} in progress`, ...bits].join(' · ') : `${plural(games.length, 'game')} · ${bits.join(' · ')}`,
    live: counts.live || 0,
    count: games.length,
  };
}

function completedStatus(ws) {
  const ch = ws.championship;
  return {
    tone: 'idle',
    pill: 'Season complete',
    line: ch ? `${ch.champion} beat ${ch.runnerUp} ${ch.score} for the title.` : 'Recap, team intel and picks history.',
    live: 0,
    count: 0,
  };
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Good evening';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function pinnedTeamInfo(sport, slug) {
  if (sport === 'nfl') {
    const t = getNflTeamBySlug(slug);
    return t && { name: t.name, to: `/nfl/teams/${slug}`, logo: resolveTeamLogo({ sport: 'nfl', slug }) };
  }
  if (sport === 'nba') {
    const t = getNbaTeamBySlug(slug);
    return t && { name: t.name, to: `/nba/teams/${slug}`, logo: resolveTeamLogo({ sport: 'nba', slug }) };
  }
  if (sport === 'mlb') {
    const t = MLB_TEAMS.find((x) => x.slug === slug);
    return t && { name: t.name, to: `/mlb/teams/${slug}`, logo: resolveTeamLogo({ sport: 'mlb', slug }) };
  }
  const t = getNcaamTeamBySlug(slug);
  return t && { name: t.name, to: `/ncaam/teams/${slug}`, logo: null };
}

function SportCard({ ws, status }) {
  const links = QUICK_LINKS[ws.id] || [];
  const bracketPath = ws.id === WorkspaceId.CBB ? '/bracketology' : `${ws.routeBase}/bracketology`;
  return (
    <article className={styles.sportCard} style={{ '--accent': ws.theme?.accent }}>
      <Link to={ws.routeBase} className={styles.sportMain} aria-label={`Open ${ws.label}`}>
        <span className={styles.sportTop}>
          <span className={styles.sportLogo}><WorkspaceLogo workspace={ws} size={28} /></span>
          <span className={styles.sportName}>{ws.shortLabel}</span>
          {status ? (
            <span className={`${styles.status} ${styles[`status_${status.tone}`]}`}>
              {status.tone === 'live' && <span className={styles.liveDot} aria-hidden />}
              {status.pill}
            </span>
          ) : (
            <span className={`${styles.status} ${styles.statusLoading}`} aria-hidden />
          )}
        </span>
        <span className={styles.sportLabel}>{ws.label}</span>
        <span className={styles.sportLine}>{status ? status.line : ' '}</span>
        <span className={styles.sportCta}>Open briefing <span aria-hidden>→</span></span>
      </Link>
      <nav className={styles.sportLinks} aria-label={`${ws.shortLabel} pages`}>
        {links.map(([label, path]) => (
          <Link key={path} to={path === '/bracketology' ? bracketPath : `${ws.routeBase}${path}`}>{label}</Link>
        ))}
      </nav>
    </article>
  );
}

function TopPlayRow({ ws, pick }) {
  const away = pick.matchup?.awayTeam;
  const home = pick.matchup?.homeTeam;
  const conviction = resolveConviction(pick);
  const logo = (team) => resolveTeamLogo({ sport: ws.id, slug: team?.slug, team });
  let when = '';
  try {
    when = new Date(pick.matchup?.startTime).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  } catch { /* leave blank */ }
  return (
    <Link to={`${ws.routeBase}/insights`} className={styles.playRow}>
      <span className={styles.playSport}>{ws.shortLabel}</span>
      <span className={styles.playMatchup}>
        <Logo src={logo(away)} />
        <span>{away?.shortName}</span>
        <span className={styles.at}>at</span>
        <Logo src={logo(home)} />
        <span>{home?.shortName}</span>
        {when && <span className={styles.playWhen}>{when}</span>}
      </span>
      <span className={styles.playPick}>{pick.selection?.label || pick.pick?.label}</span>
      {conviction != null && (
        <span className={styles.playScore} title="Conviction, 0 to 100">
          {conviction}
        </span>
      )}
    </Link>
  );
}

export default function MemberHome() {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const { pinnedTeams: nflPins } = usePinnedTeams({ sport: 'nfl' });
  const { pinnedTeams: nbaPins } = usePinnedTeams({ sport: 'nba' });
  const { pinnedTeams: mlbPins } = usePinnedTeams({ sport: 'mlb' });
  const { pinnedTeams: ncaamPins } = usePinnedTeams({ sport: 'ncaam' });

  const sports = useMemo(() => orderWorkspacesForDisplay(getVisibleWorkspaces(user)), [user]);

  const [status, setStatus] = useState({});
  const [topPlays, setTopPlays] = useState(null);
  const [news, setNews] = useState({});

  useEffect(() => {
    let cancelled = false;
    const put = (id, value) => { if (!cancelled) setStatus((prev) => ({ ...prev, [id]: value })); };

    for (const ws of sports) {
      if (ws.seasonState === SeasonState.COMPLETED) { put(ws.id, completedStatus(ws)); continue; }
      if (ws.id === WorkspaceId.NFL) fetchNflGames().then((d) => put(ws.id, weeklyStatus(d)));
      else if (ws.id === WorkspaceId.NBA || ws.id === WorkspaceId.MLB) {
        getJson(`/api/${ws.id}/live/games?status=all`).then((d) => put(ws.id, dailyStatus(d?.games)));
      } else put(ws.id, { tone: 'active', pill: 'In season', line: 'Briefing, games and picks.', live: 0, count: 0 });
    }

    const active = sports.filter((ws) => ws.seasonState === SeasonState.ACTIVE && PICKS_ENDPOINT[ws.id]);
    Promise.all(active.map((ws) => getJson(PICKS_ENDPOINT[ws.id]))).then((boards) => {
      if (cancelled) return;
      setTopPlays(active
        .map((ws, i) => ({ ws, pick: boards[i]?.topPick || boards[i]?.tiers?.tier1?.[0] || boards[i]?.tiers?.tier2?.[0] || null }))
        .filter((x) => x.pick));
    });

    const feeds = {
      [WorkspaceId.NFL]: fetchNflHeadlines,
      [WorkspaceId.NBA]: fetchNbaHeadlines,
      [WorkspaceId.MLB]: fetchMlbHeadlines,
    };
    for (const ws of sports) {
      const load = feeds[ws.id];
      if (!load || ws.seasonState !== SeasonState.ACTIVE) continue;
      load().then((d) => {
        if (!cancelled) setNews((prev) => ({ ...prev, [ws.id]: (d?.headlines || []).slice(0, 4) }));
      });
    }
    return () => { cancelled = true; };
  }, [sports]);

  // Live first, then sports with games on, then the rest in default order.
  const ordered = useMemo(() => {
    const weight = (ws) => {
      const s = status[ws.id];
      if (!s) return 1;
      return s.live > 0 ? 3 : s.count > 0 ? 2 : s.tone === 'idle' ? 0 : 1;
    };
    return [...sports].sort((a, b) => weight(b) - weight(a) || sports.indexOf(a) - sports.indexOf(b));
  }, [sports, status]);

  const pinned = useMemo(() => [
    ...nflPins.map((slug) => pinnedTeamInfo('nfl', slug)),
    ...nbaPins.map((slug) => pinnedTeamInfo('nba', slug)),
    ...mlbPins.map((slug) => pinnedTeamInfo('mlb', slug)),
    ...ncaamPins.map((slug) => pinnedTeamInfo('ncaam', slug)),
  ].filter(Boolean), [nflPins, nbaPins, mlbPins, ncaamPins]);

  const newsColumns = sports.filter((ws) => news[ws.id]?.length > 0);
  const firstName = (profile?.displayName || '').trim().split(/\s+/)[0];
  const liveTotal = Object.values(status).reduce((a, s) => a + (s?.live || 0), 0);

  return (
    <>
      <Helmet>
        <title>{META.title}</title>
        <meta name="description" content={META.description} />
        <link rel="canonical" href={META.url} />
        <meta property="og:title" content={META.title} />
        <meta property="og:description" content={META.description} />
        <meta property="og:url" content={META.url} />
        <meta property="og:image" content={META.image} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Maximus Sports" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={META.title} />
        <meta name="twitter:description" content={META.description} />
        <meta name="twitter:image" content={META.image} />
      </Helmet>

      <div className={styles.page}>
        <header className={styles.header}>
          <span className={styles.date}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </span>
          <h1 className={styles.title}>{greeting()}{firstName ? `, ${firstName}` : ''}</h1>
          <p className={styles.subtitle}>
            {liveTotal > 0
              ? `${plural(liveTotal, 'game')} live right now across your sports.`
              : 'Here is what is on across your sports.'}
          </p>
        </header>

        <section aria-label="Sports">
          <div className={styles.sportGrid}>
            {ordered.map((ws) => <SportCard key={ws.id} ws={ws} status={status[ws.id]} />)}
          </div>
        </section>

        {(topPlays === null || topPlays.length > 0 || pinned.length > 0) && (
          <div className={`${styles.split} ${pinned.length === 0 ? styles.splitSingle : ''}`}>
            {(topPlays === null || topPlays.length > 0) && (
              <section className={styles.panel} aria-label="Top plays">
                <div className={styles.panelHead}>
                  <h2 className={styles.panelTitle}>Top plays</h2>
                  <span className={styles.panelSub}>The model’s highest-conviction pick in each sport</span>
                </div>
                {topPlays === null ? (
                  <div className={styles.skeleton} aria-busy="true" />
                ) : (
                  <div className={styles.playList}>
                    {topPlays.map(({ ws, pick }) => <TopPlayRow key={ws.id} ws={ws} pick={pick} />)}
                  </div>
                )}
              </section>
            )}

            {pinned.length > 0 && (
              <section className={styles.panel} aria-label="Your teams">
                <div className={styles.panelHead}>
                  <h2 className={styles.panelTitle}>Your teams</h2>
                  <Link to="/settings" className={styles.panelLink}>Manage</Link>
                </div>
                <div className={styles.teamList}>
                  {pinned.map((t) => (
                    <Link key={t.to} to={t.to} className={styles.teamChip}>
                      {t.logo
                        ? <Logo src={t.logo} />
                        : <span className={styles.teamInitial} aria-hidden>{t.name.charAt(0)}</span>}
                      <span>{t.name}</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {newsColumns.length > 0 && (
          <section aria-label="Headlines">
            <div className={styles.panelHead}>
              <h2 className={styles.panelTitle}>Headlines</h2>
            </div>
            <div className={styles.newsGrid}>
              {newsColumns.map((ws) => (
                <div key={ws.id} className={styles.panel}>
                  <div className={styles.newsHead}>
                    <span className={styles.newsSport}><WorkspaceLogo workspace={ws} size={16} /> {ws.shortLabel}</span>
                    <Link to={`${ws.routeBase}/news`} className={styles.panelLink}>All news</Link>
                  </div>
                  <ul className={styles.newsList}>
                    {news[ws.id].map((h, i) => (
                      <li key={h.id || h.link || i}>
                        <a href={h.link || h.url} target="_blank" rel="noopener noreferrer">
                          <span className={styles.newsTitle}>{cleanTitle(h.title || h.headline, h.source)}</span>
                          <span className={styles.newsMeta}>{[h.source, h.time].filter(Boolean).join(' · ')}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
