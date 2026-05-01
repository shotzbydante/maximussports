/**
 * NbaDailySlide3 — NBA Playoff Outlook.
 *
 * Premium upgrade:
 *   - 64px gold title
 *   - 14px gold divider
 *   - Each contender card now carries a large team logo, abbreviation,
 *     contender label, rationale, odds, and seed
 *   - Subtle mascot watermark anchored near the footer
 */

import { normalizeNbaImagePayload } from '../../../features/nba/contentStudio/normalizeNbaImagePayload';
import { getNbaEspnLogoUrl } from '../../../utils/espnNbaLogos';
import styles from './NbaSlides.module.css';

function Logo({ slug, size = 26, backplate = true, abbrev }) {
  const src = slug ? getNbaEspnLogoUrl(slug) : null;
  if (!src) {
    if (!abbrev) return null;
    return (
      <span
        className={styles.logoFallback}
        style={{ width: size + 10, height: size + 10, fontSize: Math.max(9, Math.round(size * 0.42)) }}
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

export default function NbaDailySlide3({ data, asOf: _a, slideNumber: _s, slideTotal: _t, ...rest }) {
  const payload = data?.section === 'daily-briefing' && data?.playoffOutlook
    ? data
    : normalizeNbaImagePayload({
        activeSection: 'nba-daily',
        nbaPicks: data?.nbaPicks,
        nbaLiveGames: data?.nbaLiveGames || [],
        nbaChampOdds: data?.nbaChampOdds || null,
        nbaStandings: data?.nbaStandings || null,
        nbaLeaders: data?.nbaLeaders || null,
      });

  const east = payload.playoffOutlook?.east || [];
  const west = payload.playoffOutlook?.west || [];
  const round = payload.nbaPlayoffContext?.round || 'Round 1';

  return (
    <div className={styles.s3} data-slide="3" {...rest}>
      <div className={styles.bgBase} />
      <div className={styles.bgGlow} />
      <div className={styles.bgStreaks} />
      <div className={styles.bgNoise} />

      {/* Subtle mascot watermark */}
      <img
        src="/mascot.png" alt=""
        className={styles.s3MascotWatermark}
        loading="eager" decoding="sync" crossOrigin="anonymous"
        onError={e => { e.currentTarget.style.display = 'none'; }}
      />

      <header className={styles.s3TopBar}>
        <div className={styles.s2Pill}>
          <span>🏆</span><span>TITLE PATH</span>
        </div>
        <div className={styles.s1RoundPill}>{round.toUpperCase()}</div>
      </header>

      <div className={styles.s3TitleBlock}>
        <h2 className={styles.s3Title}>NBA PLAYOFF OUTLOOK</h2>
        <div className={styles.s3SubTitle}>Title paths and contenders by conference.</div>
        <div className={styles.s3TitleDivider} />
      </div>

      <div className={styles.s3ConfGrid}>
        <div className={styles.s3ConfCard}>
          <div className={styles.s3ConfHeader}>
            <span>🧭</span><span>EASTERN CONFERENCE</span>
          </div>
          <div className={styles.s3TeamList}>
            {/* Audit Part 4: show ALL active teams. Audit Part 6: when
                more than 5 teams are still alive in a conference, switch
                to compact mode (smaller logos, single-line rationale) so
                the slide remains readable without dropping any team. */}
            {east.map((t, i) => (
              <ConfRow key={t.slug} rank={i + 1} team={t} compact={east.length > 5} />
            ))}
          </div>
        </div>

        <div className={styles.s3ConfCard}>
          <div className={styles.s3ConfHeader}>
            <span>🌅</span><span>WESTERN CONFERENCE</span>
          </div>
          <div className={styles.s3TeamList}>
            {west.map((t, i) => (
              <ConfRow key={t.slug} rank={i + 1} team={t} compact={west.length > 5} />
            ))}
          </div>
        </div>
      </div>

      <footer className={styles.s3Footer}>
        <div className={styles.s1CtaPill}>
          <span className={styles.s1CtaLabel}>MORE AT</span>
          <span className={styles.s1CtaSite}>maximussports.ai</span>
        </div>
      </footer>
    </div>
  );
}

/**
 * ConfRow — single contender card. Audit Part 5 layout:
 *   Top line:   rank | logo | abbrev + contender pill | odds + seed
 *   Below:      rationale (clamped 2 lines, or 1 in compact mode)
 *
 * `compact` mode kicks in when a conference has more than 5 active
 * teams (audit Part 6). Compact rows shrink padding + logo + clamp
 * rationale to a single line so 6-8 teams remain readable.
 */
function ConfRow({ rank, team, compact = false }) {
  const isTopSeed = rank === 1 || team.seed === 1;
  // Audit Part 6: every card gets a prominent seed badge. Falls back
  // to "—" when seed isn't published so the badge stays aligned.
  const seedDisplay = team.seed != null ? `#${team.seed} seed` : '—';
  const logoSize = compact ? 36 : 50;
  return (
    <div
      className={`${styles.s3TeamRow} ${compact ? styles.s3TeamRowCompact : ''}`}
      data-top-seed={isTopSeed ? 'true' : 'false'}
    >
      <div className={styles.s3TeamTopLine}>
        <div className={styles.s3TeamRank}>{rank}</div>
        <div className={styles.s3TeamLogoBox}>
          <Logo slug={team.slug} size={logoSize} backplate abbrev={team.abbrev} />
        </div>
        <div className={styles.s3TeamIdentity}>
          <span className={styles.s3TeamAbbrev}>{team.abbrev}</span>
          <span className={styles.s3TeamLabel}>{team.label}</span>
        </div>
        <div className={styles.s3MarketBlock}>
          <div className={styles.s3TeamOdds}>🏆 {team.odds}</div>
          <div className={styles.s3SeedBadge}>{seedDisplay}</div>
        </div>
      </div>
      {team.rationale && (
        <div className={styles.s3Rationale}>{team.rationale}</div>
      )}
    </div>
  );
}
