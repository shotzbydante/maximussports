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

  return (
    <div className={styles.page}>
      <SEOHead
        title="College Basketball Teams — NCAAB Betting Intelligence by Conference"
        description="Browse college basketball teams by conference and odds tier. Access ATS trends, championship odds, and betting intelligence for every NCAAB program tracked by Maximus Sports."
        canonicalPath="/teams"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          'name': 'College Basketball Teams — Betting Intelligence',
          'description': 'Browse college basketball teams by conference and odds tier with ATS trends and championship odds.',
          'url': 'https://maximussports.ai/teams',
          'isPartOf': { '@type': 'WebSite', 'name': 'Maximus Sports', 'url': 'https://maximussports.ai' }
        }}
      />
      <header className={styles.header}>
        <h1>College Basketball Teams — Bubble Watch</h1>
        <p className={styles.subtitle}>NCAAB betting intelligence by conference and odds tier — ATS trends, championship odds, and tournament projections</p>
      </header>

      <section className={styles.top25Section}>
        <Top25Rankings />
      </section>

      <div className={styles.filters}>
        <input
          type="search"
          placeholder="Search teams…"
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
          <span className={styles.sortHint}>Loading odds…</span>
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
              <span className={styles.chevron} aria-hidden>{expanded[conference] ? '▾' : '▸'}</span>
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
                              <span className={styles.chevron}>→</span>
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
    </div>
  );
}
