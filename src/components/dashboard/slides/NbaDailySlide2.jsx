/**
 * NbaDailySlide2 — Today's Intel Briefing.
 *
 * Premium upgrade:
 *   - 58px playoff-framed headline + gold divider
 *   - HOT OFF THE PRESS bullets carry team logo chips
 *   - Maximus's Picks tiles carry team logos
 *   - Season Leaders grid shows top 3 per category (PPG/APG/RPG/SPG/BPG)
 *     with player + team abbreviation + value
 *   - Subtle mascot watermark anchored near the header
 */

import { normalizeNbaImagePayload } from '../../../features/nba/contentStudio/normalizeNbaImagePayload';
import { LEADER_CATEGORIES } from '../../../data/nba/seasonLeaders';
import { getNbaEspnLogoUrl } from '../../../utils/espnNbaLogos';
import styles from './NbaSlides.module.css';

function formatConv(tier) {
  if (!tier) return 'Edge';
  const t = String(tier).toLowerCase();
  if (t === 'high' || t === 'tier1' || t === 'elite') return 'High';
  if (t === 'medium' || t === 'tier2' || t === 'strong') return 'Medium';
  if (t === 'low' || t === 'tier3' || t === 'solid') return 'Lean';
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

function fixPlural(text) {
  if (!text) return text;
  return text
    .replace(/\bleads\b/gi, 'lead')
    .replace(/\btrails\b/gi, 'trail')
    .replace(/\bpulls\b/gi, 'pull')
    .replace(/\btakes\b/gi, 'take');
}

function Logo({ slug, size = 22, backplate = false, abbrev }) {
  const src = slug ? getNbaEspnLogoUrl(slug) : null;
  if (!src) {
    if (!abbrev) return null;
    return (
      <span
        className={styles.logoFallback}
        style={{ width: size + 8, height: size + 8, fontSize: Math.max(9, Math.round(size * 0.42)) }}
      >
        {abbrev}
      </span>
    );
  }
  const img = (
    <img
      src={src} alt={abbrev || slug} width={size} height={size}
      style={{ objectFit: 'contain', flexShrink: 0 }}
      data-team-slug={slug}
      loading="eager" decoding="sync" crossOrigin="anonymous"
      onError={e => {
        console.warn('[NBA_LOGO_MISSING]', { slug, abbrev });
        e.currentTarget.style.display = 'none';
      }}
    />
  );
  if (!backplate) return img;
  return <span className={styles.logoBackplate} style={{ width: size + 10, height: size + 10 }}>{img}</span>;
}

export default function NbaDailySlide2({ data, asOf: _a, slideNumber: _s, slideTotal: _t, ...rest }) {
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

  // Leaders — top 3 per category w/ team logos
  const leadersRaw = payload.nbaLeaders?.categories || {};
  const leaderCards = LEADER_CATEGORIES.map(cat => {
    const leaders = (leadersRaw[cat.key]?.leaders || []).slice(0, 3).map(l => {
      const slug = l.teamAbbrev ? abbrevToSlug(l.teamAbbrev) : null;
      return {
        name: l.name || '—',
        teamAbbrev: l.teamAbbrev || '',
        slug,
        value: l.display || (l.value != null ? String(l.value) : '—'),
      };
    });
    return { key: cat.key, abbrev: cat.abbrev, leaders };
  });

  return (
    <div className={styles.s2} data-slide="2" {...rest}>
      <div className={styles.bgBase} />
      <div className={styles.bgGlow} />
      <div className={styles.bgStreaks} />
      <div className={styles.bgNoise} />

      {/* Subtle mascot watermark */}
      <img
        src="/mascot.png" alt=""
        className={styles.s2MascotWatermark}
        loading="eager" decoding="sync" crossOrigin="anonymous"
        onError={e => { e.currentTarget.style.display = 'none'; }}
      />

      <header className={styles.s2TopBar}>
        <div className={styles.s2Pill}>
          <span>🏀</span><span>TODAY'S INTEL BRIEFING</span>
        </div>
        <div className={styles.s1RoundPill}>🏆 {payload.nbaPlayoffContext?.round || 'Round 1'}</div>
      </header>

      <div className={styles.s2HeadlineBlock}>
        <div className={styles.s2HeadlineDivider} />
        <h2 className={styles.s2Headline}>{fixPlural(payload.mainHeadline || payload.heroTitle)}</h2>
        {payload.subhead && <div className={styles.s2Subhead}>{fixPlural(payload.subhead)}</div>}
      </div>

      <div className={styles.s2HotpZone}>
        <div className={styles.s2HotpHeader}>
          <span>🔔</span><span>HOT OFF THE PRESS</span>
        </div>
        <div className={styles.s2HotpList}>
          {bullets.map((b, i) => (
            <div key={i} className={styles.s2HotpRow}>
              <span className={styles.s2HotpDot}>▸</span>
              {b.logoSlug && <Logo slug={b.logoSlug} size={28} backplate />}
              <span className={styles.s2HotpText}>{fixPlural(b.text)}</span>
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
            const pickSide = p.pick?.side || p.selection?.side;
            const selectedTeam = pickSide === 'away' ? away : home;
            return (
              <div key={i} className={styles.s2PickTile}>
                <div className={styles.s2PickTileTop}>
                  <div className={styles.s2PickTileLogoRow}>
                    <Logo slug={away.slug} size={22} abbrev={away.shortName || away.abbrev} />
                    <span style={{ fontSize: 11, color: 'rgba(212,175,55,0.55)', fontWeight: 900 }}>@</span>
                    <Logo slug={home.slug} size={22} abbrev={home.shortName || home.abbrev} />
                  </div>
                  <span className={styles.s2PickTileType}>{p._cat}</span>
                </div>
                <div className={styles.s2PickTileMatch}>
                  {(away.shortName || away.abbrev || '?')} @ {(home.shortName || home.abbrev || '?')}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Logo slug={selectedTeam?.slug} size={24} backplate abbrev={selectedTeam?.shortName || selectedTeam?.abbrev} />
                  <span className={styles.s2PickTileSel}>{p.pick?.label || '—'}</span>
                </div>
                <div className={styles.s2PickTileConv}>{formatConv(p.confidence || p.tier)}</div>
              </div>
            );
          })}
          {allPicks.length === 0 && (
            <div className={styles.s2PickTile}>
              <div className={styles.s2PickTileSel}>Board refreshes before tip-off.</div>
            </div>
          )}
        </div>
      </div>

      <div className={styles.s2LeadersZone}>
        <div className={styles.s2LeadersHeader}>
          <span>🏆</span><span>SEASON LEADERS</span>
        </div>
        <div className={styles.s2LeadersGrid}>
          {leaderCards.map(cat => (
            <div key={cat.key} className={styles.s2LeaderCat}>
              <div className={styles.s2LeaderCatLabel}>{cat.abbrev}</div>
              {cat.leaders.length === 0 ? (
                <div className={styles.s2LeaderName}>—</div>
              ) : (
                cat.leaders.map((l, i) => (
                  <div key={i} className={styles.s2LeaderRow}>
                    <div className={styles.s2LeaderTopRow}>
                      {l.slug && <Logo slug={l.slug} size={16} abbrev={l.teamAbbrev} />}
                      <span className={styles.s2LeaderName}>{l.name}</span>
                    </div>
                    <div className={styles.s2LeaderValue}>{l.value}</div>
                  </div>
                ))
              )}
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

// Abbrev → slug helper (duplicates a small lookup so Slide 2 stays self-contained)
const ABBREV_TO_SLUG = {
  ATL: 'atl', BOS: 'bos', BKN: 'bkn', CHA: 'cha', CHI: 'chi',
  CLE: 'cle', DAL: 'dal', DEN: 'den', DET: 'det', GSW: 'gsw',
  HOU: 'hou', IND: 'ind', LAC: 'lac', LAL: 'lal', MEM: 'mem',
  MIA: 'mia', MIL: 'mil', MIN: 'min', NOP: 'nop', NYK: 'nyk',
  OKC: 'okc', ORL: 'orl', PHI: 'phi', PHX: 'phx', POR: 'por',
  SAC: 'sac', SAS: 'sas', TOR: 'tor', UTA: 'uta', WAS: 'was',
};
function abbrevToSlug(abbrev) {
  if (!abbrev) return null;
  return ABBREV_TO_SLUG[abbrev.toUpperCase()] || null;
}
