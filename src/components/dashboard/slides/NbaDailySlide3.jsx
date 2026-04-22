/**
 * NbaDailySlide3 — NBA Playoff Outlook (Slide 3 of NBA Daily Briefing).
 *
 * Mirrors MlbDailySlide3 (World Series Outlook) structure, replacing
 * MLB's projected-wins framing with NBA-appropriate:
 *   - Title odds
 *   - Contender label (Title Favorite / Contender / Upside Team / Long Shot)
 *   - Series-state rationale (e.g. "lead Rockets 2-1 in the first round")
 *
 * Data: top 5 Eastern + top 5 Western from payload.playoffOutlook, built
 * by normalizeNbaImagePayload from championship odds + playoff context.
 */

import { normalizeNbaImagePayload } from '../../../features/nba/contentStudio/normalizeNbaImagePayload';
import { getNbaEspnLogoUrl } from '../../../utils/espnNbaLogos';
import styles from './NbaSlides.module.css';

function Logo({ slug, size = 26 }) {
  const src = slug ? getNbaEspnLogoUrl(slug) : null;
  if (!src) return null;
  return (
    <span className={styles.logoBackplate} style={{ width: size + 8, height: size + 8 }}>
      <img src={src} alt="" width={size} height={size}
           style={{ objectFit: 'contain' }}
           loading="eager" decoding="sync" crossOrigin="anonymous"
           onError={e => { e.currentTarget.style.display = 'none'; }} />
    </span>
  );
}

export default function NbaDailySlide3({ data, asOf: _asOf, slideNumber: _sn, slideTotal: _st, ...rest }) {
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

      <header className={styles.s3TopBar}>
        <div className={styles.s2Pill}>
          <span>🏆</span><span>TITLE PATH</span>
        </div>
        <div className={styles.s1RoundPill}>{round.toUpperCase()}</div>
      </header>

      <div className={styles.s3TitleBlock}>
        <h2 className={styles.s3Title}>NBA PLAYOFF OUTLOOK</h2>
        <div className={styles.s3SubTitle}>Top contenders by championship odds, shaped by live series state.</div>
      </div>

      <div className={styles.s3ConfGrid}>
        <div className={styles.s3ConfCard}>
          <div className={styles.s3ConfHeader}>
            <span>🧭</span><span>EASTERN CONFERENCE</span>
          </div>
          <div className={styles.s3TeamList}>
            {east.slice(0, 5).map((t, i) => (
              <div key={t.slug} className={styles.s3TeamRow}>
                <div className={styles.s3TeamRank}>{i + 1}</div>
                <div className={styles.s3TeamBody}>
                  <span className={styles.s3TeamAbbrev}>
                    <Logo slug={t.slug} size={22} /> {t.abbrev}
                  </span>
                  <span className={styles.s3TeamLabel}>{t.label}</span>
                  <div className={styles.s3TeamRationale}>{t.rationale}</div>
                </div>
                <div className={styles.s3TeamRight}>
                  <div className={styles.s3TeamOdds}>🏆 {t.odds}</div>
                  {t.seed && <div className={styles.s3TeamSeed}>#{t.seed} seed</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.s3ConfCard}>
          <div className={styles.s3ConfHeader}>
            <span>🌅</span><span>WESTERN CONFERENCE</span>
          </div>
          <div className={styles.s3TeamList}>
            {west.slice(0, 5).map((t, i) => (
              <div key={t.slug} className={styles.s3TeamRow}>
                <div className={styles.s3TeamRank}>{i + 1}</div>
                <div className={styles.s3TeamBody}>
                  <span className={styles.s3TeamAbbrev}>
                    <Logo slug={t.slug} size={22} /> {t.abbrev}
                  </span>
                  <span className={styles.s3TeamLabel}>{t.label}</span>
                  <div className={styles.s3TeamRationale}>{t.rationale}</div>
                </div>
                <div className={styles.s3TeamRight}>
                  <div className={styles.s3TeamOdds}>🏆 {t.odds}</div>
                  {t.seed && <div className={styles.s3TeamSeed}>#{t.seed} seed</div>}
                </div>
              </div>
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
