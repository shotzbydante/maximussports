import SlideShell from './SlideShell';
import InsightBullets from '../ui/InsightBullets';
import styles from './TeamIntelSlide1.module.css';
import { getTeamEmoji } from '../../../utils/getTeamEmoji';

function truncate(str, max) {
  if (!str) return '—';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function fmtOdds(american) {
  if (american == null || typeof american !== 'number') return null;
  return american > 0 ? `+${american}` : String(american);
}

/** Derive a short editorial personality line from last-10 form. */
function buildPersonalityLine(last10) {
  if (!last10 || last10.length < 3) return null;
  const scored = last10.filter(e => e.ourScore != null && e.oppScore != null);
  if (scored.length === 0) return null;
  const wins = scored.filter(e => Number(e.ourScore) > Number(e.oppScore)).length;
  const pct  = wins / scored.length;
  const last5 = scored.slice(0, 5);
  const w5    = last5.filter(e => Number(e.ourScore) > Number(e.oppScore)).length;
  const trend = last5.length >= 5 ? w5 / 5 : null;

  if (pct >= 0.80) {
    return trend != null && trend >= 0.80
      ? 'Playing their best basketball of the season right now.'
      : 'Rolling. This team has been tough to beat lately.';
  }
  if (pct >= 0.70) {
    return trend != null && trend >= 0.80
      ? 'Last 5 is the real story — this team is peaking.'
      : 'Strong form. Momentum is real heading into this one.';
  }
  if (pct >= 0.55) {
    return trend != null && trend >= 0.70
      ? 'Heating up at the right time of year.'
      : 'Solid stretch. Not flashy, but getting the job done.';
  }
  if (pct >= 0.45) {
    return trend != null && trend <= 0.30
      ? 'Cooled off some after a stronger stretch.'
      : 'Playing around .500 ball right now — looking for a spark.';
  }
  if (pct <= 0.30) return 'Rough patch. A bounce-back spot could be in the cards.';
  return 'Inconsistent lately. Something needs to click.';
}

export default function TeamIntelSlide1({ data, teamData, asOf, slideNumber, slideTotal, ...rest }) {
  const team = teamData?.team ?? {};
  const name = team.displayName || team.name || data?.selectedTeamName || '—';
  const slug = team.slug || data?.selectedTeamSlug || null;
  const rank = teamData?.rank ?? null;

  // Championship (title) odds threaded from Dashboard enhancedTeamData
  const titleOdds = teamData?.titleOdds ?? null;
  const titleOddsLabel = fmtOdds(titleOdds);

  // Record: prefer team page data
  const record = team.record?.items?.[0]?.summary
    || team.recordSummary
    || team.record
    || null;

  // Quick Pulse: last-10 / last-5 from schedule events (same logic as Team Page)
  const schedEvents = teamData?.schedule?.events ?? [];
  const recentFinished = schedEvents
    .filter(e => e.isFinal && e.ourScore != null && e.oppScore != null)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const last10 = recentFinished.slice(0, 10);
  const last5  = recentFinished.slice(0, 5);
  const w10 = last10.filter(e => Number(e.ourScore) > Number(e.oppScore)).length;
  const l10 = last10.length - w10;
  const w5  = last5.filter(e => Number(e.ourScore) > Number(e.oppScore)).length;
  const l5  = last5.length - w5;
  const quickPulse = last10.length > 0
    ? { recent: `${w10}-${l10}`, total: last10.length, trend: last5.length === 5 ? `${w5}-${l5} L5` : null }
    : null;

  // Personality line derived from form
  const personalityLine = buildPersonalityLine(last10);

  // Next game: prefer teamData.nextLine (same source as Team Page) → fall back to schedule
  const nextLine = teamData?.nextLine ?? null;
  let nextOpp = nextLine?.nextEvent?.opponent ?? null;
  let nextTime = nextLine?.nextEvent?.commenceTime
    ? new Date(nextLine.nextEvent.commenceTime).toLocaleString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles',
      })
    : null;

  // Schedule-based fallback for opponent + time if nextLine is not yet loaded
  if (!nextOpp) {
    const upcomingEv = schedEvents.find(e => {
      const status = (e.status?.type?.name || e.status?.name || '').toLowerCase();
      return status !== 'final' && status !== 'final-ot' && status !== 'canceled';
    }) ?? null;
    if (upcomingEv) {
      const comps = upcomingEv.competitions?.[0]?.competitors ?? [];
      const me = comps.find(c => c.team?.slug === slug);
      const opp = comps.find(c => c !== me) ?? comps[0];
      nextOpp = opp?.team?.displayName || opp?.team?.name || null;
      if (!nextTime && upcomingEv.date) {
        nextTime = new Date(upcomingEv.date).toLocaleString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric',
          hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles',
        });
      }
    }
  }

  // Spread / ML from nextLine consensus (same source as Team Page Next Game Line section)
  const spread = nextLine?.consensus?.spread ?? null;
  const ml = nextLine?.consensus?.moneyline ?? null;
  const linePosted = spread != null || ml != null;

  // Headlines: use last-7 news if available (same split as Team Page), else all team news
  // News is already quality-ranked by the server (watch-spam capped, analysis boosted)
  const teamNews = teamData?.last7News?.length > 0
    ? teamData.last7News
    : (teamData?.teamNews ?? []);
  const bullets = teamNews.slice(0, 3).map(n => truncate(n.headline || n.title, 72));

  const conf = team.conference || data?.selectedTeamConf || null;
  const mascotEmoji = getTeamEmoji(slug, name);

  return (
    <SlideShell
      asOf={asOf}
      accentColor="#3C79B4"
      brandMode="standard"
      category="team"
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
          {titleOddsLabel != null && (
            <span className={styles.titleOddsPill}>🏆 {titleOddsLabel}</span>
          )}
          {conf && <span className={styles.confPill}>{conf}</span>}
        </div>
        <h2 className={styles.teamName}>
          {name}{mascotEmoji ? <span className={styles.teamEmoji}>{mascotEmoji}</span> : null}
        </h2>
        {record && <div className={styles.record}>{record}</div>}
        {quickPulse && (
          <div className={styles.quickPulse}>
            <span className={styles.quickPulseRecord}>{quickPulse.recent}</span>
            <span className={styles.quickPulseSep}> last {quickPulse.total}</span>
            {quickPulse.trend && (
              <span className={styles.quickPulseTrend}> · {quickPulse.trend}</span>
            )}
          </div>
        )}
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
                {parseFloat(spread) > 0 ? `+${parseFloat(spread)}` : spread} ATS
              </span>
            )}
            {spread == null && ml != null && (
              <span className={styles.linePill}>
                ML {ml > 0 ? `+${ml}` : ml}
              </span>
            )}
          </div>
          {nextTime && <div className={styles.nextTime}>{nextTime} PT</div>}
          {!linePosted && nextOpp && (
            <div className={styles.nextLineNote}>Line not posted yet — watch for movement closer to tip.</div>
          )}
          {/* Maximus personality line */}
          {personalityLine && (
            <div className={styles.personalityLine}>{personalityLine}</div>
          )}
        </div>
      )}

      {/* Quick intel bullets */}
      {bullets.length > 0 && (
        <InsightBullets bullets={bullets} label="QUICK INTEL" />
      )}
    </SlideShell>
  );
}
