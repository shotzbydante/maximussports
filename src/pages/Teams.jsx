import { useState, useMemo, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { TEAMS } from '../data/teams';
import TeamLogo from '../components/shared/TeamLogo';
import ConferenceLogo from '../components/shared/ConferenceLogo';
import ChampionshipBadge from '../components/shared/ChampionshipBadge';
import YouTubeVideoCard from '../components/shared/YouTubeVideoCard';
import YouTubeVideoModal from '../components/shared/YouTubeVideoModal';
import { fetchChampionshipOdds } from '../api/championshipOdds';
import { fetchHomeFast } from '../api/home';
import { buildSlugToRankMap } from '../utils/rankingsNormalize';
import { useAtsLeaders } from '../hooks/useAtsLeaders';
import SeedBadge from '../components/common/SeedBadge';
import { getTeamSeed, isBracketOfficial, getTeamRegion } from '../utils/tournamentHelpers';
import { REGIONS } from '../config/bracketology';
import styles from './Teams.module.css';
import SEOHead, { buildOgImageUrl } from '../components/seo/SEOHead';

const TIER_ORDER = ['Lock', 'Should be in', 'Work to do', 'Long shot'];
const CONF_ORDER = ['Big Ten', 'SEC', 'ACC', 'Big 12', 'Big East', 'Others'];
const MAJOR_CONFS = CONF_ORDER.slice(0, -1);

const TIER_CLASS = {
  Lock: styles.tierLock,
  'Should be in': styles.tierShould,
  'Work to do': styles.tierWork,
  'Long shot': styles.tierLong,
};
const TIER_DOT_CLASS = {
  Lock: styles.confTierDotLock,
  'Should be in': styles.confTierDotShould,
  'Work to do': styles.confTierDotWork,
  'Long shot': styles.confTierDotLong,
};

const CONFERENCE_INTEL = {
  'Big Ten': {
    tagline: 'The deepest conference in the sport',
    narrative: 'Five programs are tournament locks, and the middle tier is loaded with dangerous, experienced squads. Title contenders and ATS landmines across the board.',
    watch: 'Bubble battles in the 5\u20138 seed range',
  },
  'SEC': {
    tagline: 'Raw talent meets volatile lines',
    narrative: 'Five locks headline a conference where elite coaching and deep rosters make every game a betting event. The bubble race here shapes the entire bracket.',
    watch: 'Kentucky\u2019s bubble trajectory and Auburn\u2019s upside',
  },
  'ACC': {
    tagline: 'Blue blood territory with a deep bubble',
    narrative: 'Duke and UNC anchor the top tier, but the ACC\u2019s real intrigue lives in the bubble \u2014 four teams fighting for at-large bids with shifting ATS profiles.',
    watch: 'NC State and Clemson as dangerous mid-seeds',
  },
  'Big 12': {
    tagline: 'The tournament factory',
    narrative: 'Six tournament locks \u2014 the most of any conference. Kansas, Houston, and Iowa State lead a murderer\u2019s row where even the long shots carry upset equity.',
    watch: 'Conference cannibalization and TCU\u2019s bubble path',
  },
  'Big East': {
    tagline: 'Compact, elite, and bracket-defining',
    narrative: 'Four locks in a tight tracked group. Every Big East game carries outsized weight for seeding and bracketology. Marquette and UConn set the pace.',
    watch: 'Seton Hall\u2019s tournament path and seeding battles',
  },
  'Others': {
    tagline: 'Mid-major darlings and bracket busters',
    narrative: 'Gonzaga leads the mid-major class, but the Mountain West, A-10, and WCC are quietly stacking tournament r\u00e9sum\u00e9s. Auto-bid races create March volatility.',
    watch: 'Gonzaga seeding and Mountain West depth',
  },
};

const VALUE_PROPS = [
  { icon: '\uD83D\uDCCA', title: 'ATS Trends', desc: 'Season, last 30, and last 7 performance against the spread \u2014 the betting signal that matters most.' },
  { icon: '\uD83C\uDFC6', title: 'Championship Odds', desc: 'Live futures context with implied probability and tier positioning for every tracked program.' },
  { icon: '\uD83C\uDFAF', title: 'Next-Game Intel', desc: 'Spread, total, moneyline, and data-driven leans for every upcoming matchup.' },
  { icon: '\uD83D\uDCF0', title: 'News & Signals', desc: 'Curated headlines, momentum indicators, and contextual intelligence updated daily.' },
];

const CONF_NETWORK_LABELS = {
  'Big Ten': 'Big Ten Network',
  'SEC': 'SEC Network',
  'ACC': 'ACC Network',
  'Big 12': 'Big 12 Conference',
  'Big East': 'Big East Conference',
};

const CONF_ABBREV = {
  'WCC': 'WCC',
  'Mountain West': 'MWC',
  'AAC': 'AAC',
  'A-10': 'A-10',
  'MVC': 'MVC',
  'MAC': 'MAC',
  'CUSA': 'CUSA',
  'WAC': 'WAC',
  'Southland': 'SLC',
};

const CONF_ACCENT = {
  'Big Ten': 'rgba(0, 75, 135, 0.25)',
  'SEC': 'rgba(81, 12, 118, 0.20)',
  'ACC': 'rgba(1, 60, 166, 0.22)',
  'Big 12': 'rgba(200, 16, 46, 0.20)',
  'Big East': 'rgba(0, 45, 114, 0.22)',
  'Others': 'rgba(92, 122, 145, 0.18)',
};

function impliedProbFromAmerican(american) {
  if (american == null || typeof american !== 'number') return null;
  if (american < 0) return (-american) / ((-american) + 100);
  return 100 / (american + 100);
}

function formatOdds(american) {
  if (american == null) return null;
  return american > 0 ? `+${american}` : String(american);
}

function getFeaturedTagClass(tag) {
  if (tag === 'Title Contender') return styles.featuredTagContender;
  if (tag === 'ATS Signal') return styles.featuredTagSignal;
  return styles.featuredTagRanked;
}

function mapConf(conference) {
  return MAJOR_CONFS.includes(conference) ? conference : 'Others';
}

/* ── Conference YouTube Feed (lazy-loaded per conference section) ── */
function ConferenceVideos({ conference, onSelectVideo }) {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !fetchedRef.current) {
          fetchedRef.current = true;
          const cacheKey = `yt:conf:${conference}`;
          try {
            const cached = sessionStorage.getItem(cacheKey);
            if (cached) {
              const parsed = JSON.parse(cached);
              if (Array.isArray(parsed) && parsed.length > 0) { setVideos(parsed); return; }
            }
          } catch { /* ignore */ }
          setLoading(true);
          const network = CONF_NETWORK_LABELS[conference];
          const q = `${network || conference} basketball highlights ${new Date().getFullYear()}`;
          fetch(`/api/youtube/search?q=${encodeURIComponent(q)}&maxResults=3`)
            .then((r) => r.json())
            .then((data) => {
              const items = data.items ?? [];
              if (items.length > 0) {
                setVideos(items);
                try { sessionStorage.setItem(cacheKey, JSON.stringify(items)); } catch { /* ignore */ }
              }
              setLoading(false);
            })
            .catch(() => setLoading(false));
        }
      },
      { rootMargin: '300px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [conference]);

  return (
    <div ref={containerRef} className={styles.confVideos}>
      {(videos.length > 0 || loading) && (
        <span className={styles.confVideosLabel}>{conference} Videos</span>
      )}
      {loading && <div className={styles.confVideosLoading}>Loading videos...</div>}
      {videos.length > 0 && (
        <div className={styles.confVideosGrid}>
          {videos.map((v) => (
            <YouTubeVideoCard key={v.videoId} video={v} onSelect={onSelectVideo} compact />
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */

export default function Teams() {
  const [search, setSearch] = useState('');
  const [conferenceFilter, setConferenceFilter] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('All');
  const [expanded, setExpanded] = useState(() => {
    const o = {};
    CONF_ORDER.forEach((c) => { o[c] = true; });
    return o;
  });
  const [championshipOdds, setChampionshipOdds] = useState({});
  const [championshipOddsMeta, setChampionshipOddsMeta] = useState(null);
  const [championshipOddsLoading, setChampionshipOddsLoading] = useState(true);
  const [sortBy, setSortBy] = useState('default');
  const [rankMap, setRankMap] = useState({});
  const [rankFilter, setRankFilter] = useState(false);
  const [activeVideo, setActiveVideo] = useState(null);

  const { atsLeaders } = useAtsLeaders({ initialWindow: 'last30' });

  /* ── Fetch championship odds ── */
  useEffect(() => {
    let cancelled = false;
    fetchChampionshipOdds()
      .then(({ odds, oddsMeta }) => {
        if (!cancelled) {
          setChampionshipOdds(odds ?? {});
          setChampionshipOddsMeta(oddsMeta ?? null);
          setChampionshipOddsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setChampionshipOdds({});
          setChampionshipOddsMeta(null);
          setChampionshipOddsLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  /* ── Fetch rankings for ranked badges & featured strip ── */
  useEffect(() => {
    let cancelled = false;
    fetchHomeFast({})
      .then((data) => {
        if (!cancelled) {
          const rankings = data.rankingsTop25 ?? data.rankings?.rankings ?? [];
          setRankMap(buildSlugToRankMap({ rankings }, TEAMS));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  /* ── Static conference tier counts ── */
  const confTierCounts = useMemo(() => {
    const counts = {};
    for (const conf of CONF_ORDER) {
      counts[conf] = { Lock: 0, 'Should be in': 0, 'Work to do': 0, 'Long shot': 0, total: 0 };
    }
    for (const team of TEAMS) {
      const conf = mapConf(team.conference);
      counts[conf][team.oddsTier] = (counts[conf][team.oddsTier] || 0) + 1;
      counts[conf].total++;
    }
    return counts;
  }, []);

  /* ── Conference featured teams (Lock-tier, up to 3 per conference) ── */
  const confFeaturedMap = useMemo(() => {
    const map = {};
    for (const conf of CONF_ORDER) {
      map[conf] = TEAMS.filter((t) => mapConf(t.conference) === conf && t.oddsTier === 'Lock').slice(0, 3);
    }
    return map;
  }, []);

  /* ── Ranked programs per conference (for power signal on conf cards) ── */
  const confRankedCounts = useMemo(() => {
    const counts = {};
    for (const conf of CONF_ORDER) counts[conf] = 0;
    for (const [slug] of Object.entries(rankMap)) {
      const team = TEAMS.find((t) => t.slug === slug);
      if (team) {
        const conf = mapConf(team.conference);
        counts[conf] = (counts[conf] || 0) + 1;
      }
    }
    return counts;
  }, [rankMap]);

  /* ── Featured teams strip: title contenders + ranked + ATS signals ── */
  const featuredTeams = useMemo(() => {
    const featured = [];
    const seen = new Set();

    const oddsRanked = Object.entries(championshipOdds)
      .map(([slug, entry]) => {
        const american = entry?.bestChanceAmerican ?? entry?.american;
        const prob = american != null ? impliedProbFromAmerican(american) : null;
        return { slug, american, prob };
      })
      .filter((e) => e.prob != null)
      .sort((a, b) => b.prob - a.prob);

    for (const { slug } of oddsRanked.slice(0, 5)) {
      const team = TEAMS.find((t) => t.slug === slug);
      if (team && !seen.has(slug)) {
        featured.push({ ...team, featuredTag: 'Title Contender' });
        seen.add(slug);
      }
    }

    const rankedEntries = Object.entries(rankMap).sort((a, b) => a[1] - b[1]);
    for (const [slug, rank] of rankedEntries) {
      if (seen.has(slug) || featured.length >= 9) break;
      const team = TEAMS.find((t) => t.slug === slug);
      if (team) {
        featured.push({ ...team, featuredTag: `#${rank} Ranked` });
        seen.add(slug);
      }
    }

    for (const row of (atsLeaders?.best ?? []).slice(0, 6)) {
      if (!row.slug || seen.has(row.slug) || featured.length >= 12) continue;
      const team = TEAMS.find((t) => t.slug === row.slug);
      if (team) {
        featured.push({ ...team, featuredTag: 'ATS Signal' });
        seen.add(row.slug);
      }
    }

    return featured.slice(0, 12);
  }, [championshipOdds, rankMap, atsLeaders]);

  /* ── Filtered teams (FIXED: "Others" filter now works) ── */
  const filteredTeams = useMemo(() => {
    let list = TEAMS;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.conference.toLowerCase().includes(q) ||
          t.oddsTier.toLowerCase().includes(q),
      );
    }
    if (conferenceFilter) {
      if (conferenceFilter === 'Others') {
        list = list.filter((t) => !MAJOR_CONFS.includes(t.conference));
      } else {
        list = list.filter((t) => t.conference === conferenceFilter);
      }
    }
    if (tierFilter) {
      list = list.filter((t) => t.oddsTier === tierFilter);
    }
    if (regionFilter !== 'All') {
      list = list.filter((t) => getTeamRegion(t.slug) === regionFilter);
      list.sort((a, b) => {
        const aSeed = getTeamSeed(a.slug) ?? 99;
        const bSeed = getTeamSeed(b.slug) ?? 99;
        return aSeed - bSeed;
      });
    }
    if (rankFilter) {
      list = list.filter((t) => rankMap[t.slug] != null);
    }
    return list;
  }, [search, conferenceFilter, tierFilter, regionFilter, rankFilter, rankMap]);

  /* ── Sorted teams (FIXED: minor conferences sort into "Others" position) ── */
  const sortedTeams = useMemo(() => {
    const list = [...filteredTeams];
    if (sortBy === 'championship') {
      list.sort((a, b) => {
        const aEntry = championshipOdds[a.slug];
        const bEntry = championshipOdds[b.slug];
        const aAmerican = aEntry?.bestChanceAmerican ?? aEntry?.american;
        const bAmerican = bEntry?.bestChanceAmerican ?? bEntry?.american;
        const aProb = aAmerican != null ? impliedProbFromAmerican(aAmerican) : null;
        const bProb = bAmerican != null ? impliedProbFromAmerican(bAmerican) : null;
        if (aProb != null && bProb == null) return -1;
        if (aProb == null && bProb != null) return 1;
        if (aProb == null && bProb == null) return a.name.localeCompare(b.name);
        return bProb - aProb;
      });
    } else {
      list.sort((a, b) => {
        const ac = CONF_ORDER.indexOf(mapConf(a.conference));
        const bc = CONF_ORDER.indexOf(mapConf(b.conference));
        if (ac !== bc) return ac - bc;
        const at = TIER_ORDER.indexOf(a.oddsTier);
        const bt = TIER_ORDER.indexOf(b.oddsTier);
        if (at !== bt) return at - bt;
        return a.name.localeCompare(b.name);
      });
    }
    return list;
  }, [filteredTeams, sortBy, championshipOdds]);

  /* ── Grouped by conference (FIXED: minor conferences bucket into "Others") ── */
  const grouped = useMemo(() => {
    const byConf = {};
    for (const team of sortedTeams) {
      const conf = mapConf(team.conference);
      if (!byConf[conf]) byConf[conf] = {};
      const tier = team.oddsTier;
      if (!byConf[conf][tier]) byConf[conf][tier] = [];
      byConf[conf][tier].push(team);
    }
    for (const conf of Object.keys(byConf)) {
      for (const tier of TIER_ORDER) {
        if (byConf[conf][tier]) byConf[conf][tier].sort((a, b) => a.name.localeCompare(b.name));
      }
    }
    return CONF_ORDER
      .filter((conf) => byConf[conf] && Object.keys(byConf[conf]).length > 0)
      .map((conf) => ({ conference: conf, tiers: byConf[conf] || {} }));
  }, [sortedTeams]);

  const handleConfExplore = (conf) => {
    setConferenceFilter(conf);
    if (conf !== 'Others') {
      setExpanded((e) => ({ ...e, [conf]: true }));
    }
    setTimeout(() => {
      document.getElementById('team-discovery')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  return (
    <div className={styles.page}>
      <SEOHead
        title={`College Basketball Team Intel Hub \u2014 Conference Betting Intelligence (${new Date().getFullYear()})`}
        description={`The Team Intel Hub: explore ${new Date().getFullYear()} college basketball intelligence by conference. ATS trends, championship odds, tournament projections, and betting signals for every tracked NCAAB program.`}
        canonicalPath="/teams"
        ogImage={buildOgImageUrl({ title: 'Team Intel Hub', subtitle: 'ATS trends, championship odds & conference intelligence', type: 'Team Intel' })}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          'name': `College Basketball Team Intel Hub (${new Date().getFullYear()})`,
          'description': `Explore ${new Date().getFullYear()} college basketball team intelligence by conference with ATS trends and championship odds.`,
          'url': 'https://maximussports.ai/teams',
          'isPartOf': { '@type': 'WebSite', 'name': 'Maximus Sports', 'url': 'https://maximussports.ai' },
        }}
      />

      {/* ── 1. Why Team Intel — product marketing (moved to top) ────── */}
      <section className={styles.merchSection}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionEyebrow}>Why Team Intel</span>
          <h2 className={styles.sectionHeadTitle}>Intelligence That Moves the Line</h2>
        </div>
        <div className={styles.valueGrid}>
          {VALUE_PROPS.map((vp) => (
            <div key={vp.title} className={styles.valueCard}>
              <span className={styles.valueCardIcon}>{vp.icon}</span>
              <h4 className={styles.valueCardTitle}>{vp.title}</h4>
              <p className={styles.valueCardDesc}>{vp.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 2. Hero: Team Intel Hub ────────────────────────────────── */}
      <header className={styles.hero}>
        <div className={styles.heroContent}>
          <span className={styles.heroEyebrow}>Team Intel Hub</span>
          <h1 className={styles.heroTitle}>Conference &amp; Team Intelligence</h1>
          <p className={styles.heroSubtitle}>
            Conference-level context, team-by-team betting intelligence, and the
            fastest path to the programs you want to track. Explore contenders,
            scan the bubble, and pin your favorites.
          </p>
          <div className={styles.heroCtas}>
            <button
              type="button"
              className={styles.heroCtaPrimary}
              onClick={() => document.getElementById('conferences')?.scrollIntoView({ behavior: 'smooth' })}
            >
              Browse Conferences
            </button>
            <button
              type="button"
              className={styles.heroCtaSecondary}
              onClick={() => document.getElementById('team-discovery')?.scrollIntoView({ behavior: 'smooth' })}
            >
              Explore All Teams
            </button>
          </div>
        </div>
      </header>

      {/* ── 3. Featured Teams Strip ────────────────────────────────── */}
      {featuredTeams.length > 0 && (
        <section className={styles.featuredSection}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionEyebrow}>Intel Spotlight</span>
            <h2 className={styles.sectionHeadTitle}>Programs Driving the Board</h2>
          </div>
          <div className={styles.featuredStrip}>
            {featuredTeams.map((team) => {
              const odds = championshipOdds[team.slug];
              const american = odds?.bestChanceAmerican ?? odds?.american;
              const rank = rankMap[team.slug];
              return (
                <Link key={team.slug} to={`/teams/${team.slug}`} className={styles.featuredCard}>
                  <TeamLogo team={team} size={36} />
                  <span className={styles.featuredName}>{team.name}</span>
                  <span className={`${styles.featuredTag} ${getFeaturedTagClass(team.featuredTag)}`}>
                    {team.featuredTag}
                  </span>
                  <div className={styles.intelPreview}>
                    <div className={styles.previewRow}>
                      <span className={styles.previewLabel}>Conference</span>
                      <span className={styles.previewValue}>{team.conference}</span>
                    </div>
                    <div className={styles.previewRow}>
                      <span className={styles.previewLabel}>Tier</span>
                      <span className={styles.previewValue}>{team.oddsTier}</span>
                    </div>
                    {rank && (
                      <div className={styles.previewRow}>
                        <span className={styles.previewLabel}>Ranking</span>
                        <span className={styles.previewValue}>#{rank}</span>
                      </div>
                    )}
                    {american != null && (
                      <div className={styles.previewRow}>
                        <span className={styles.previewLabel}>Title Odds</span>
                        <span className={styles.previewValue}>{formatOdds(american)}</span>
                      </div>
                    )}
                    <span className={styles.previewCta}>View Full Team Intel &rarr;</span>
                  </div>
                </Link>
              );
            })}
            <button
              type="button"
              className={`${styles.featuredCard} ${styles.exploreAllCard}`}
              onClick={() => document.getElementById('team-discovery')?.scrollIntoView({ behavior: 'smooth' })}
            >
              <span className={styles.exploreAllIcon}>&darr;</span>
              <span className={styles.featuredName}>Browse All Teams</span>
              <span className={styles.exploreAllSub}>{TEAMS.length} programs</span>
            </button>
          </div>
        </section>
      )}

      {/* ── 4. Conference Intel Modules ────────────────────────────── */}
      <section id="conferences" className={styles.confSection}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionEyebrow}>Conference Intel</span>
          <h2 className={styles.sectionHeadTitle}>The Landscape</h2>
        </div>
        <div className={styles.confGrid}>
          {CONF_ORDER.map((conf) => {
            const intel = CONFERENCE_INTEL[conf];
            const counts = confTierCounts[conf];
            const confTeams = confFeaturedMap[conf] || [];
            if (!intel || !counts || counts.total === 0) return null;
            return (
              <article key={conf} className={styles.confCard} style={CONF_ACCENT[conf] ? { borderTop: `3px solid ${CONF_ACCENT[conf]}` } : undefined}>
                <div className={styles.confCardHeader}>
                  <span className={styles.confCardLogo}>
                    <ConferenceLogo conference={conf} size={36} />
                  </span>
                  <div>
                    <h3 className={styles.confCardName}>{conf}</h3>
                    <span className={styles.confCardTagline}>{intel.tagline}</span>
                  </div>
                </div>
                <p className={styles.confCardNarrative}>{intel.narrative}</p>
                {confTeams.length > 0 && (
                  <div className={styles.confFeaturedTeams}>
                    {confTeams.map((t) => (
                      <Link key={t.slug} to={`/teams/${t.slug}`} className={styles.confFeaturedTeam}>
                        <TeamLogo team={t} size={18} />
                        <span>{t.name.split(' ').pop()}</span>
                      </Link>
                    ))}
                  </div>
                )}
                <div className={styles.confCardTiers}>
                  {TIER_ORDER.map((tier) => {
                    const count = counts[tier] || 0;
                    if (count === 0) return null;
                    return (
                      <span key={tier} className={styles.confTierItem}>
                        <span className={`${styles.confTierDot} ${TIER_DOT_CLASS[tier]}`} />
                        <span className={styles.confTierCount}>{count}</span>
                        <span className={styles.confTierName}>{tier}</span>
                      </span>
                    );
                  })}
                </div>
                {confRankedCounts[conf] > 0 && (
                  <span className={styles.confCardSignal}>
                    {confRankedCounts[conf]} ranked program{confRankedCounts[conf] !== 1 ? 's' : ''}
                  </span>
                )}
                <div className={styles.confCardWatch}>
                  <span className={styles.confCardWatchLabel}>Watch for: </span>
                  {intel.watch}
                </div>
                <button
                  type="button"
                  className={styles.confCardCta}
                  onClick={() => handleConfExplore(conf)}
                >
                  View {counts.total} teams &rarr;
                </button>
              </article>
            );
          })}
        </div>
      </section>

      {/* ── 5. Team Discovery ──────────────────────────────────────── */}
      <section id="team-discovery" className={styles.discoverySection}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionEyebrow}>{isBracketOfficial() ? 'Tournament Watch' : 'Team Discovery'}</span>
          <h2 className={styles.sectionHeadTitle}>{isBracketOfficial() ? 'Tournament Watch' : 'Browse by Conference'}</h2>
        </div>

        <div className={styles.filters}>
          <input
            type="search"
            placeholder="Search teams..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.searchInput}
            aria-label="Search teams"
          />
          <select
            value={conferenceFilter}
            onChange={(e) => setConferenceFilter(e.target.value)}
            className={styles.select}
            aria-label="Filter by conference"
          >
            <option value="">All conferences</option>
            {CONF_ORDER.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {isBracketOfficial() ? (
            <select
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
              className={styles.select}
              aria-label="Filter by region"
            >
              <option value="All">All regions</option>
              {REGIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          ) : (
            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
              className={styles.select}
              aria-label="Filter by tier"
            >
              <option value="">All tiers</option>
              {TIER_ORDER.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          )}
          <button
            type="button"
            className={`${styles.rankFilterBtn} ${rankFilter ? styles.rankFilterBtnActive : ''}`}
            onClick={() => setRankFilter((f) => !f)}
            aria-pressed={rankFilter}
          >
            Top 25
          </button>
          <label className={styles.filterLabel}>
            <span className={styles.sortLabel}>Sort</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className={styles.select}
              aria-label="Sort by"
            >
              <option value="default">Default</option>
              <option value="championship">Championship Odds</option>
            </select>
          </label>
          {sortBy === 'championship' && championshipOddsLoading && (
            <span className={styles.sortHint}>Loading odds...</span>
          )}
          {filteredTeams.length < TEAMS.length && (
            <span className={styles.filterCount}>
              {filteredTeams.length} of {TEAMS.length} teams
            </span>
          )}
        </div>

        <div className={styles.grid}>
          {grouped.map(({ conference, tiers }) => {
            const isOthers = conference === 'Others';
            return (
            <section key={conference} className={styles.conferenceSection}>
              <button
                type="button"
                className={styles.conferenceHeader}
                onClick={() => setExpanded((e) => ({ ...e, [conference]: !e[conference] }))}
                aria-expanded={expanded[conference]}
              >
                <span className={styles.conferenceLogoWrap}>
                  <ConferenceLogo conference={conference} size={28} />
                </span>
                <span className={styles.conferenceTitle}>{conference}</span>
                <span className={styles.chevron} aria-hidden>{expanded[conference] ? '\u25BE' : '\u25B8'}</span>
              </button>
              {expanded[conference] && (
                <>
                  <div className={styles.conferenceBody}>
                    {TIER_ORDER.map((tier) => {
                      const teams = tiers[tier];
                      if (!teams || teams.length === 0) return null;
                      return (
                        <div key={tier} className={styles.tierBlock}>
                          <span className={styles.tierLabel}>{tier}</span>
                          <ul className={styles.teamList}>
                            {teams.map((team) => {
                              const bracketOfficial = isBracketOfficial();
                              const seed = getTeamSeed(team.slug);
                              return (
                                <li key={team.slug}>
                                  <Link to={`/teams/${team.slug}`} className={styles.teamRow}>
                                    {seed != null && <SeedBadge seed={seed} size="sm" variant={seed <= 4 ? 'gold' : 'default'} />}
                                    <TeamLogo team={team} size={24} />
                                    {!bracketOfficial && rankMap[team.slug] && seed == null && (
                                      <span className={styles.rankBadge}>#{rankMap[team.slug]}</span>
                                    )}
                                    <span className={styles.teamName}>{team.name}</span>
                                    {isOthers && (
                                      <span className={styles.confLogoInline}>
                                        <ConferenceLogo conference={team.conference} size={16} />
                                      </span>
                                    )}
                                    <ChampionshipBadge slug={team.slug} oddsMap={championshipOdds} oddsMeta={championshipOddsMeta} loading={championshipOddsLoading} />
                                    {!bracketOfficial && <span className={`${styles.badge} ${TIER_CLASS[tier]}`}>{tier}</span>}
                                    <span className={styles.chevron}>&rarr;</span>
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                  {MAJOR_CONFS.includes(conference) && (
                    <ConferenceVideos conference={conference} onSelectVideo={setActiveVideo} />
                  )}
                </>
              )}
            </section>
            );
          })}
        </div>

        {grouped.length === 0 && (
          <p className={styles.empty}>No teams match your filters.</p>
        )}
      </section>

      {/* ── 6. Pinning / Watchlist CTA ─────────────────────────────── */}
      <section className={styles.pinSection}>
        <div className={styles.pinInner}>
          <h2 className={styles.pinTitle}>Build Your Watchlist</h2>
          <p className={styles.pinDesc}>
            Pin the teams you&apos;re tracking to get personalized intel on your dashboard
            every day. Follow your conference exposures and never miss a signal.
          </p>
          <Link to="/" className={styles.pinCta}>
            Go to Dashboard &rarr;
          </Link>
        </div>
      </section>

      {/* ── Video Modal (page-level) ───────────────────────────────── */}
      {activeVideo && (
        <YouTubeVideoModal video={activeVideo} onClose={() => setActiveVideo(null)} />
      )}
    </div>
  );
}
