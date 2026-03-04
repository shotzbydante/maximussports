import SlideShell from './SlideShell';
import InsightBullets from '../ui/InsightBullets';
import styles from './TeamIntelSlide1.module.css';

function truncate(str, max) {
  if (!str) return '—';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

export default function TeamIntelSlide1({ data, teamData, asOf, slideNumber, slideTotal, ...rest }) {
  const team = teamData?.team ?? {};
  const name = team.displayName || team.name || data?.selectedTeamName || '—';
  const slug = team.slug || data?.selectedTeamSlug || null;
  const rank = teamData?.rank ?? null;

  // Record: prefer team page data
  const record = team.record?.items?.[0]?.summary
    || team.recordSummary
    || team.record
    || null;

  // Next game from schedule
  const events = teamData?.schedule?.events ?? [];
  const upcoming = events.find(e => {
    const status = (e.status?.type?.name || e.status?.name || '').toLowerCase();
    return status !== 'final' && status !== 'final-ot' && status !== 'canceled';
  }) ?? events[0] ?? null;

  const nextOpp = upcoming
    ? (() => {
        const comps = upcoming.competitions?.[0]?.competitors ?? [];
        const opp = comps.find(c => c.homeAway !== (comps.find(me => me.team?.slug === slug) ? comps.find(me => me.team?.slug === slug).homeAway : 'home') ) ?? comps[0];
        return opp?.team?.displayName || opp?.team?.name || null;
      })()
    : null;
  const nextTime = upcoming?.date
    ? new Date(upcoming.date).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })
    : null;

  // Spread from home data games
  const games = data?.odds?.games ?? [];
  const matchingGame = games.find(g => {
    const ht = (g.homeTeam || '').toLowerCase();
    const at = (g.awayTeam || '').toLowerCase();
    const nm = name.toLowerCase().split(' ').slice(-1)[0];
    return nm && (ht.includes(nm) || at.includes(nm));
  });
  const spread = matchingGame?.homeSpread ?? matchingGame?.spread ?? null;
  const ml = matchingGame?.moneyline ?? null;

  // Headlines as quick intel
  const teamNews = teamData?.teamNews ?? [];
  const bullets = teamNews.slice(0, 3).map(n => truncate(n.headline || n.title, 72));

  const conf = team.conference || data?.selectedTeamConf || null;

  return (
    <SlideShell
      asOf={asOf}
      accentColor="#3C79B4"
      brandMode="standard"
      slideNumber={slideNumber}
      slideTotal={slideTotal}
      rest={rest}
    >
      {/* Team logo hero */}
      <div className={styles.logoHero}>
        {slug ? (
          <img
            src={`/logos/${slug}.png`}
            alt={name}
            className={styles.teamLogo}
            crossOrigin="anonymous"
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div className={styles.logoPlaceholder} />
        )}
      </div>

      {/* Name + meta */}
      <div className={styles.nameBlock}>
        <div className={styles.nameMeta}>
          {rank != null && <span className={styles.rankPill}>#{rank} AP</span>}
          {conf && <span className={styles.confPill}>{conf}</span>}
        </div>
        <h2 className={styles.teamName}>{name}</h2>
        {record && <div className={styles.record}>{record}</div>}
      </div>

      <div className={styles.divider} />

      {/* Next game */}
      {(nextOpp || spread != null || ml != null) && (
        <div className={styles.nextGame}>
          <div className={styles.nextLabel}>NEXT GAME</div>
          <div className={styles.nextRow}>
            {nextOpp && <span className={styles.nextOpp}>vs {nextOpp}</span>}
            {spread != null && (
              <span className={styles.linePill}>
                {parseFloat(spread) > 0 ? `+${spread}` : spread} ATS
              </span>
            )}
          </div>
          {nextTime && <div className={styles.nextTime}>{nextTime} PT</div>}
        </div>
      )}

      {/* Quick intel bullets */}
      {bullets.length > 0 && (
        <InsightBullets bullets={bullets} label="QUICK INTEL" />
      )}
    </SlideShell>
  );
}
