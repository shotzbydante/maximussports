/**
 * NbaDailySlide2 — Today's Intel Briefing (Slide 2 of NBA Daily Briefing).
 *
 * Mirrors MlbDailySlide2 structure:
 *   Brand pill → big playoff-framed headline → Subhead
 *   → HOT OFF THE PRESS panel (up to 4 bullets)
 *   → Maximus's Picks row (3 tiles)
 *   → Season Leaders grid (PPG / APG / RPG / SPG / BPG, top 1 each)
 *   → Footer CTA
 *
 * Data flows from normalizeNbaImagePayload; no parallel shaping.
 */

import { normalizeNbaImagePayload } from '../../../features/nba/contentStudio/normalizeNbaImagePayload';
import { LEADER_CATEGORIES } from '../../../data/nba/seasonLeaders';
import styles from './NbaSlides.module.css';

function formatConv(tier) {
  if (!tier) return 'Edge';
  const t = String(tier).toLowerCase();
  if (t === 'high' || t === 'tier1' || t === 'elite') return 'High';
  if (t === 'medium' || t === 'tier2' || t === 'strong') return 'Medium';
  if (t === 'low' || t === 'tier3' || t === 'solid') return 'Lean';
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

export default function NbaDailySlide2({ data, asOf: _asOf, slideNumber: _sn, slideTotal: _st, ...rest }) {
  const payload = data?.section === 'daily-briefing' && data?.playoffOutlook
    ? data
    : normalizeNbaImagePayload({
        activeSection: 'nba-daily',
        nbaPicks: data?.nbaPicks,
        nbaLiveGames: data?.nbaLiveGames || [],
        nbaChampOdds: data?.nbaChampOdds || null,
        nbaStandings: data?.nbaStandings || null,
        nbaLeaders: data?.nbaLeaders || null,
        nbaNews: data?.nbaNews || [],
      });

  const bullets = (payload.bullets || []).slice(0, 4);

  const cats = payload.nbaPicks?.categories || {};
  const allPicks = [
    ...(cats.pickEms || []).map(p => ({ ...p, _cat: 'Moneyline' })),
    ...(cats.ats     || []).map(p => ({ ...p, _cat: 'Spread' })),
    ...(cats.totals  || []).map(p => ({ ...p, _cat: 'Total' })),
    ...(cats.leans   || []).map(p => ({ ...p, _cat: 'Lean' })),
  ].sort((a, b) => (b.betScore?.total ?? b.confidenceScore ?? 0) - (a.betScore?.total ?? a.confidenceScore ?? 0)).slice(0, 3);

  // Season leaders — one card per category
  const leadersRaw = payload.nbaLeaders?.categories || {};
  const leaderCards = LEADER_CATEGORIES.map(cat => {
    const top = leadersRaw[cat.key]?.leaders?.[0];
    return {
      key: cat.key,
      abbrev: cat.abbrev,
      name: top?.name || '—',
      teamAbbrev: top?.teamAbbrev || '',
      value: top?.display || (top?.value != null ? String(top.value) : '—'),
    };
  });

  return (
    <div className={styles.s2} data-slide="2" {...rest}>
      <div className={styles.bgBase} />
      <div className={styles.bgGlow} />
      <div className={styles.bgStreaks} />
      <div className={styles.bgNoise} />

      <header className={styles.s2TopBar}>
        <div className={styles.s2Pill}>
          <span>🏀</span><span>TODAY'S INTEL BRIEFING</span>
        </div>
        <div className={styles.s1RoundPill}>🏆 {payload.nbaPlayoffContext?.round || 'Round 1'}</div>
      </header>

      <div className={styles.s2HeadlineBlock}>
        <h2 className={styles.s2Headline}>{payload.mainHeadline || payload.heroTitle}</h2>
        {payload.subhead && <div className={styles.s2Subhead}>{payload.subhead}</div>}
      </div>

      <div className={styles.s2HotpZone}>
        <div className={styles.s2HotpHeader}>
          <span>🔔</span><span>HOT OFF THE PRESS</span>
        </div>
        <div className={styles.s2HotpList}>
          {bullets.map((b, i) => (
            <div key={i} className={styles.s2HotpRow}>
              <span className={styles.s2HotpDot}>▸</span>
              <span className={styles.s2HotpText}>{b.text}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.s2PicksZone}>
        <div className={styles.s2PicksHeader}>
          <span>🎯</span><span>MAXIMUS'S PICKS</span>
        </div>
        <div className={styles.s2PicksRow}>
          {allPicks.map((p, i) => {
            const away = p.matchup?.awayTeam || {};
            const home = p.matchup?.homeTeam || {};
            return (
              <div key={i} className={styles.s2PickTile}>
                <div className={styles.s2PickTileTop}>
                  <span className={styles.s2PickTileMatch}>
                    {(away.shortName || away.abbrev || '?')} @ {(home.shortName || home.abbrev || '?')}
                  </span>
                  <span className={styles.s2PickTileType}>{p._cat}</span>
                </div>
                <div className={styles.s2PickTileSel}>{p.pick?.label || '—'}</div>
                <div className={styles.s2PickTileConv}>{formatConv(p.confidence || p.tier)}</div>
              </div>
            );
          })}
          {allPicks.length === 0 && (
            <div className={styles.s2PickTile}>
              <div className={styles.s2PickTileSel}>Picks refresh before tip-off.</div>
            </div>
          )}
        </div>
      </div>

      <div className={styles.s2LeadersZone}>
        <div className={styles.s2LeadersHeader}>
          <span>🏆</span><span>SEASON LEADERS</span>
        </div>
        <div className={styles.s2LeadersGrid}>
          {leaderCards.map(c => (
            <div key={c.key} className={styles.s2LeaderCat}>
              <div className={styles.s2LeaderCatLabel}>{c.abbrev}</div>
              <div className={styles.s2LeaderName}>{c.name}</div>
              {c.teamAbbrev && <div className={styles.s2LeaderTeam}>{c.teamAbbrev}</div>}
              <div className={styles.s2LeaderValue}>{c.value}</div>
            </div>
          ))}
        </div>
      </div>

      <footer className={styles.s2Footer}>
        <div className={styles.s1CtaPill}>
          <span className={styles.s1CtaLabel}>MORE AT</span>
          <span className={styles.s1CtaSite}>maximussports.ai</span>
        </div>
      </footer>
    </div>
  );
}
