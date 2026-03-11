import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getTeamsGroupedByConference, TEAMS } from '../data/teams';
import TeamLogo from '../components/shared/TeamLogo';
import ConferenceLogo from '../components/shared/ConferenceLogo';
import ChampionshipBadge from '../components/shared/ChampionshipBadge';
import Top25Rankings from '../components/home/Top25Rankings';
import { fetchChampionshipOdds } from '../api/championshipOdds';
import styles from './Teams.module.css';
import SEOHead from '../components/seo/SEOHead';

const TIER_ORDER = ['Lock', 'Should be in', 'Work to do', 'Long shot'];
const CONF_ORDER = ['Big Ten', 'SEC', 'ACC', 'Big 12', 'Big East', 'Others'];
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
  {
    icon: '\uD83D\uDCCA',
    title: 'ATS Trends',
    desc: 'Season, last 30, and last 7 performance against the spread \u2014 the betting signal that matters most.',
  },
  {
    icon: '\uD83C\uDFC6',
    title: 'Championship Odds',
    desc: 'Live futures context with implied probability and tier positioning for every tracked program.',
  },
  {
    icon: '\uD83C\uDFAF',
    title: 'Next-Game Intel',
    desc: 'Spread, total, moneyline, and data-driven leans for every upcoming matchup.',
  },
  {
    icon: '\uD83D\uDCF0',
    title: 'News & Signals',
    desc: 'Curated headlines, momentum indicators, and contextual intelligence updated daily.',
  },
];

function impliedProbFromAmerican(american) {
  if (american == null || typeof american !== 'number') return null;
  if (american < 0) return (-american) / ((-american) + 100);
  return 100 / (american + 100);
}

export default function Teams() {
  const [search, setSearch] = useState('');
  const [conferenceFilter, setConferenceFilter] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [expanded, setExpanded] = useState(() => {
    const o = {};
    CONF_ORDER.forEach((c) => { o[c] = true; });
    return o;
  });
  const [championshipOdds, setChampionshipOdds] = useState({});
  const [championshipOddsMeta, setChampionshipOddsMeta] = useState(null);
  const [championshipOddsLoading, setChampionshipOddsLoading] = useState(true);
  const [sortBy, setSortBy] = useState('default');

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

  const confTierCounts = useMemo(() => {
    const counts = {};
    for (const conf of CONF_ORDER) {
      counts[conf] = { Lock: 0, 'Should be in': 0, 'Work to do': 0, 'Long shot': 0, total: 0 };
    }
    for (const team of TEAMS) {
      const conf = CONF_ORDER.slice(0, -1).includes(team.conference) ? team.conference : 'Others';
      if (!counts[conf]) counts[conf] = { Lock: 0, 'Should be in': 0, 'Work to do': 0, 'Long shot': 0, total: 0 };
      counts[conf][team.oddsTier] = (counts[conf][team.oddsTier] || 0) + 1;
      counts[conf].total++;
    }
    return counts;
  }, []);

  const filteredTeams = useMemo(() => {
    let list = TEAMS;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.conference.toLowerCase().includes(q) ||
          t.oddsTier.toLowerCase().includes(q)
      );
    }
    if (conferenceFilter) {
      list = list.filter((t) => t.conference === conferenceFilter);
    }
    if (tierFilter) {
      list = list.filter((t) => t.oddsTier === tierFilter);
    }
    return list;
  }, [search, conferenceFilter, tierFilter]);

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
        const aHas = aProb != null;
        const bHas = bProb != null;
        if (aHas && !bHas) return -1;
        if (!aHas && bHas) return 1;
        if (!aHas && !bHas) return a.name.localeCompare(b.name);
        return bProb - aProb;
      });
    } else {
      list.sort((a, b) => {
        const ac = CONF_ORDER.indexOf(a.conference);
        const bc = CONF_ORDER.indexOf(b.conference);
        if (ac !== bc) return ac - bc;
        const at = TIER_ORDER.indexOf(a.oddsTier);
        const bt = TIER_ORDER.indexOf(b.oddsTier);
        if (at !== bt) return at - bt;
        return a.name.localeCompare(b.name);
      });
    }
    return list;
  }, [filteredTeams, sortBy, championshipOdds]);

  const grouped = useMemo(() => {
    const byConf = {};
    for (const team of sortedTeams) {
      if (!byConf[team.conference]) byConf[team.conference] = {};
      const tier = team.oddsTier;
      if (!byConf[team.conference][tier]) byConf[team.conference][tier] = [];
      byConf[team.conference][tier].push(team);
    }
    for (const conf of Object.keys(byConf)) {
      for (const tier of TIER_ORDER) {
        if (byConf[conf][tier]) byConf[conf][tier].sort((a, b) => a.name.localeCompare(b.name));
      }
    }
    return CONF_ORDER.filter((conf) => byConf[conf] && Object.keys(byConf[conf]).length > 0).map((conf) => ({
      conference: conf,
      tiers: byConf[conf] || {},
    }));
  }, [sortedTeams]);

  const handleConfExplore = (conf) => {
    if (conf === 'Others') {
      setConferenceFilter('');
    } else {
      setConferenceFilter(conf);
      setExpanded((e) => ({ ...e, [conf]: true }));
    }
    setTimeout(() => {
      document.getElementById('team-discovery')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  return (
    <div className={styles.page}>
      <SEOHead
        title={`College Basketball Team Intel \u2014 Conference Betting Intelligence (${new Date().getFullYear()})`}
        description={`Explore ${new Date().getFullYear()} college basketball team intelligence by conference. ATS trends, championship odds, tournament projections, and betting signals for every tracked NCAAB program.`}
        canonicalPath="/teams"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          'name': `College Basketball Team Intel \u2014 Conference Betting Intelligence (${new Date().getFullYear()})`,
          'description': `Explore ${new Date().getFullYear()} college basketball team intelligence by conference with ATS trends and championship odds.`,
          'url': 'https://maximussports.ai/teams',
          'isPartOf': { '@type': 'WebSite', 'name': 'Maximus Sports', 'url': 'https://maximussports.ai' }
        }}
      />

      {/* ── Hero: Team Intel value proposition ─────────────────────────── */}
      <header className={styles.hero}>
        <div className={styles.heroContent}>
          <span className={styles.heroEyebrow}>Team Intel</span>
          <h1 className={styles.heroTitle}>Conference &amp; Team Intelligence</h1>
          <p className={styles.heroSubtitle}>
            Track every conference through a betting intelligence lens. Explore the teams
            shaping the title race, bubble watch, and ATS landscape &mdash; then pin your
            favorites to your dashboard.
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

      {/* ── Conference Intel Modules ───────────────────────────────────── */}
      <section id="conferences" className={styles.confSection}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionEyebrow}>Conference Intel</span>
          <h2 className={styles.sectionHeadTitle}>The Landscape</h2>
        </div>
        <div className={styles.confGrid}>
          {CONF_ORDER.map((conf) => {
            const intel = CONFERENCE_INTEL[conf];
            const counts = confTierCounts[conf];
            if (!intel || !counts || counts.total === 0) return null;
            return (
              <article key={conf} className={styles.confCard}>
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

      {/* ── Team Intel Merchandising ───────────────────────────────────── */}
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

      {/* ── Top 25 Rankings ────────────────────────────────────────────── */}
      <section className={styles.top25Section}>
        <Top25Rankings />
      </section>

      {/* ── Team Discovery ─────────────────────────────────────────────── */}
      <section id="team-discovery" className={styles.discoverySection}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionEyebrow}>Team Discovery</span>
          <h2 className={styles.sectionHeadTitle}>Browse by Conference</h2>
        </div>

        <div className={styles.filters}>
          <input
            type="search"
            placeholder="Search teams\u2026"
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
            <span className={styles.sortHint}>Loading odds\u2026</span>
          )}
          {filteredTeams.length < TEAMS.length && (
            <span className={styles.filterCount}>
              {filteredTeams.length} of {TEAMS.length} teams
            </span>
          )}
        </div>

        <div className={styles.grid}>
          {grouped.map(({ conference, tiers }) => (
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
                <div className={styles.conferenceBody}>
                  {TIER_ORDER.map((tier) => {
                    const teams = tiers[tier];
                    if (!teams || teams.length === 0) return null;
                    return (
                      <div key={tier} className={styles.tierBlock}>
                        <span className={styles.tierLabel}>{tier}</span>
                        <ul className={styles.teamList}>
                          {teams.map((team) => (
                            <li key={team.slug}>
                              <Link to={`/teams/${team.slug}`} className={styles.teamRow}>
                                <TeamLogo team={team} size={24} />
                                <span className={styles.teamName}>{team.name}</span>
                                <ChampionshipBadge slug={team.slug} oddsMap={championshipOdds} oddsMeta={championshipOddsMeta} loading={championshipOddsLoading} />
                                <span className={`${styles.badge} ${TIER_CLASS[tier]}`}>{tier}</span>
                                <span className={styles.chevron}>&rarr;</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ))}
        </div>

        {grouped.length === 0 && (
          <p className={styles.empty}>No teams match your filters.</p>
        )}
      </section>

      {/* ── Pinning / Watchlist CTA ────────────────────────────────────── */}
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
    </div>
  );
}
