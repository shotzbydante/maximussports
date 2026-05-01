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
            {east.slice(0, 5).map((t, i) => (
              <ConfRow key={t.slug} rank={i + 1} team={t} />
            ))}
          </div>
        </div>

        <div className={styles.s3ConfCard}>
          <div className={styles.s3ConfHeader}>
            <span>🌅</span><span>WESTERN CONFERENCE</span>
          </div>
          <div className={styles.s3TeamList}>
            {west.slice(0, 5).map((t, i) => (
              <ConfRow key={t.slug} rank={i + 1} team={t} />
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

function ConfRow({ rank, team }) {
  // Top-seed emphasis: rank #1 in either conference card gets a stronger
  // gold border + subtle glow via data attribute (CSS handles the styling).
  const isTopSeed = rank === 1 || team.seed === 1;
  return (
    <div className={styles.s3TeamRow} data-top-seed={isTopSeed ? 'true' : 'false'}>
      <div className={styles.s3TeamRank}>{rank}</div>
      <div className={styles.s3TeamLogoBox}>
        <Logo slug={team.slug} size={50} backplate abbrev={team.abbrev} />
      </div>
      <div className={styles.s3TeamBody}>
        <div className={styles.s3TeamTop}>
          <span className={styles.s3TeamAbbrev}>{team.abbrev}</span>
          <span className={styles.s3TeamLabel}>{team.label}</span>
        </div>
        <div className={styles.s3TeamRationale}>{team.rationale}</div>
      </div>
      <div className={styles.s3TeamRight}>
        <div className={styles.s3TeamOdds}>🏆 {team.odds}</div>
        {team.seed && <div className={styles.s3TeamSeed}>#{team.seed} seed</div>}
      </div>
    </div>
  );
}
