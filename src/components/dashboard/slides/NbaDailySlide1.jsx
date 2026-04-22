/**
 * NbaDailySlide1 — Cover (Slide 1 of NBA Daily Briefing carousel).
 *
 * Structure mirrors MlbDailySlide1 exactly:
 *   Brand pill → "DAILY NBA BRIEFING" title + date → 2 story cards
 *   → HOT OFF THE PRESS strip → Lower 2-column (Playoff Race + Picks)
 *   → Bottom CTA pill
 *
 * Content is PLAYOFF-AWARE end-to-end — no regular-season tone anywhere.
 * All data flows from normalizeNbaImagePayload() so Slide 1 and Slide 2
 * can never drift: they consume the same canonical payload.
 *
 * 1080×1350 · IG 4:5 portrait.
 */

import { normalizeNbaImagePayload } from '../../../features/nba/contentStudio/normalizeNbaImagePayload';
import { getNbaEspnLogoUrl } from '../../../utils/espnNbaLogos';
import styles from './NbaSlides.module.css';

function trim(text, max = 120) {
  if (!text) return '';
  let s = String(text).trim();
  if (s.length <= max) return s;
  const sentEnd = s.lastIndexOf('.', max);
  if (sentEnd > max * 0.4) return s.slice(0, sentEnd + 1);
  return s.slice(0, max).replace(/\s+\S*$/, '') + '.';
}

function fmtDate() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/Los_Angeles',
  });
}

function Logo({ slug, size = 22, backplate = false }) {
  const src = slug ? getNbaEspnLogoUrl(slug) : null;
  if (!src) return null;
  const img = (
    <img
      src={src} alt="" width={size} height={size}
      style={{ objectFit: 'contain', flexShrink: 0 }}
      loading="eager" decoding="sync" crossOrigin="anonymous"
      onError={e => { e.currentTarget.style.display = 'none'; }}
    />
  );
  if (!backplate) return img;
  return <span className={styles.logoBackplate} style={{ width: size + 8, height: size + 8 }}>{img}</span>;
}

export default function NbaDailySlide1({ data, asOf: _asOf, slideNumber: _sn, slideTotal: _st, ...rest }) {
  // Normalize — single canonical entry point. If the caller already passed
  // the canonical fields (Dashboard does), this is a no-op pass-through.
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

  const pc = payload.nbaPlayoffContext;
  const round = pc?.round || 'Round 1';
  const bullets = (payload.bullets || []).slice(0, 3);

  // Build 2 story cards from topStory + secondStory for the hero strip
  const topStory = payload.topStory;
  const secondStory = payload.secondStory;

  const storyCard1Title = topStory
    ? `${(topStory.winSlug || '').toUpperCase()} ${storyVerb(topStory)} ${(topStory.loseSlug || '').toUpperCase()} ${topStory.winScore}-${topStory.loseScore}`
    : (payload.heroTitle || 'PLAYOFFS ROLL ON');
  const storyCard1Sub = topStory && topStory.inSeries
    ? seriesLine(topStory)
    : trim(payload.subhead || '', 120);

  const storyCard2Title = secondStory
    ? `${(secondStory.winSlug || '').toUpperCase()} ${storyVerb(secondStory)} ${(secondStory.loseSlug || '').toUpperCase()} ${secondStory.winScore}-${secondStory.loseScore}`
    : (pc?.eliminationGames?.[0]
        ? 'CLOSEOUT ALERT'
        : pc?.upsetWatch?.[0]
          ? 'UPSET WATCH'
          : 'ACROSS THE BRACKET');
  const storyCard2Sub = secondStory && secondStory.inSeries
    ? seriesLine(secondStory)
    : (pc?.eliminationGames?.[0]
        ? `${eliminationLeaderName(pc.eliminationGames[0])} can close out ${eliminationTrailerName(pc.eliminationGames[0])} tonight.`
        : (pc?.upsetWatch?.[0] ? upsetLine(pc.upsetWatch[0]) : 'Tonight\'s results reshape seeding and matchup edges.'));

  // Race card: top 3 from playoffOutlook (mix of East + West, ranked by odds)
  const allOutlook = [...(payload.playoffOutlook?.east || []), ...(payload.playoffOutlook?.west || [])]
    .filter(t => t.prob != null)
    .sort((a, b) => (b.prob ?? 0) - (a.prob ?? 0));
  const raceTeams = allOutlook.slice(0, 3);

  // Picks: top 3 from categories
  const cats = payload.nbaPicks?.categories || {};
  const allPicks = [
    ...(cats.pickEms || []).map(p => ({ ...p, _cat: 'ML' })),
    ...(cats.ats     || []).map(p => ({ ...p, _cat: 'SPR' })),
    ...(cats.totals  || []).map(p => ({ ...p, _cat: 'O/U' })),
    ...(cats.leans   || []).map(p => ({ ...p, _cat: 'LEAN' })),
  ].sort((a, b) => (b.betScore?.total ?? b.confidenceScore ?? 0) - (a.betScore?.total ?? a.confidenceScore ?? 0)).slice(0, 3);
  const picks = allPicks.map(p => {
    const away = p.matchup?.awayTeam || {};
    const home = p.matchup?.homeTeam || {};
    return {
      matchup: `${away.shortName || away.abbrev || '?'} @ ${home.shortName || home.abbrev || '?'}`,
      type: p._cat,
      selection: p.pick?.label || '—',
      conviction: p.confidence ? formatConv(p.confidence) : (p.tier || 'Edge'),
    };
  });

  return (
    <div className={styles.s1} data-slide="1" {...rest}>
      <div className={styles.bgBase} />
      <div className={styles.bgGlow} />
      <div className={styles.bgStreaks} />
      <div className={styles.bgNoise} />

      <header className={styles.s1TopBar}>
        <div className={styles.s1BrandPill}>
          <img src="/nba-logo.png" alt="" className={styles.s1BrandIcon}
               loading="eager" decoding="sync" crossOrigin="anonymous"
               onError={e => { e.currentTarget.style.display = 'none'; }} />
          <span>MAXIMUS SPORTS</span>
        </div>
        <div className={styles.s1RoundPill}>🏆 {round}</div>
      </header>

      <div className={styles.s1TitleBlock}>
        <h1 className={styles.s1Title}>
          DAILY <span className={styles.s1TitleAccent}>NBA</span> BRIEFING
        </h1>
        <div className={styles.s1Date}>{fmtDate()}</div>
      </div>

      <div className={styles.s1StoryZone}>
        <div className={styles.s1StoryCard}>
          <div className={styles.s1StoryTitle}>{storyCard1Title}</div>
          {storyCard1Sub && <div className={styles.s1StorySub}>{storyCard1Sub}</div>}
        </div>
        <div className={styles.s1StoryCard}>
          <div className={styles.s1StoryTitle}>{storyCard2Title}</div>
          {storyCard2Sub && <div className={styles.s1StorySub}>{storyCard2Sub}</div>}
        </div>
      </div>

      <div className={styles.s1HotpZone}>
        <div className={styles.s1HotpPill}>
          <span>🔔</span><span>HOT OFF THE PRESS</span>
        </div>
        <div className={styles.s1HotpBullets}>
          {bullets.map((b, i) => (
            <div key={i} className={styles.s1HotpRow}>
              <span className={styles.s1BulletDot}>▸</span>
              {b.logoSlug && <Logo slug={b.logoSlug} size={22} backplate />}
              <span className={styles.s1BulletText}>{trim(b.text, 120)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.s1BottomGrid}>
        <div className={styles.s1BottomCard}>
          <div className={styles.s1SectionLabel}>PLAYOFF CONTENDERS</div>
          <div className={styles.s1RaceList}>
            {raceTeams.map((t, i) => (
              <div key={i} className={styles.s1RaceRow}>
                <div className={styles.s1RaceTeamId}>
                  <Logo slug={t.slug} size={30} backplate />
                  <div className={styles.s1RaceTeamInfo}>
                    <span className={styles.s1RaceAbbrev}>{t.abbrev}</span>
                    {t.record && <span className={styles.s1RaceRecord}>{t.record}</span>}
                  </div>
                </div>
                <div className={styles.s1RaceCenter}>
                  <div className={styles.s1RaceLabel}>{t.label}</div>
                  {t.seed && <div className={styles.s1RaceSub}>#{t.seed} seed</div>}
                </div>
                <div className={styles.s1RaceRight}>
                  <div className={styles.s1RaceConf}>
                    {t.abbrev && ['bos','det','cle','tor','nyk','atl','ind','mia','phi','mil','orl','chi','was','cha','bkn'].includes(t.slug) ? 'EAST' : 'WEST'}
                  </div>
                  <div className={styles.s1RaceOdds}>🏆 {t.odds}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.s1BottomCard}>
          <div className={styles.s1SectionLabel}>MAXIMUS'S PICKS</div>
          <div className={styles.s1PicksList}>
            {picks.map((p, i) => (
              <div key={i} className={styles.s1PickRow}>
                <div className={styles.s1PickTop}>
                  <span className={styles.s1PickMatchup}>{p.matchup}</span>
                  <span className={styles.s1PickType}>{p.type}</span>
                </div>
                <div className={styles.s1PickMid}>
                  <span className={styles.s1PickSel}>{p.selection}</span>
                  <span className={styles.s1PickConv}>{p.conviction}</span>
                </div>
              </div>
            ))}
            {picks.length === 0 && (
              <div className={styles.s1PickRow}>
                <div className={styles.s1PickSel}>Board refreshes before tip-off.</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <footer className={styles.s1Footer}>
        <div className={styles.s1CtaPill}>
          <span className={styles.s1CtaLabel}>MORE AT</span>
          <span className={styles.s1CtaSite}>maximussports.ai</span>
        </div>
      </footer>
    </div>
  );
}

// ── Helpers (self-contained) ─────────────────────────────────────────────

function storyVerb(s) {
  if (!s) return 'TOP';
  if (s.isSweep) return 'SWEEP';
  if (s.isClinch) return 'CLOSE OUT';
  if (s.isGame7Win) return 'WIN GAME 7 OVER';
  if (s.isUpset) return 'STUN';
  if (s.isElimWin) return 'BEAT';
  if (s.type === 'blowout') return 'ROLL PAST';
  if (s.type === 'close') return 'EDGE';
  return 'TOP';
}

function seriesLine(s) {
  if (!s || !s.series) return '';
  const top = s.series.topTeam?.abbrev || '';
  const bot = s.series.bottomTeam?.abbrev || '';
  const ts = s.series.seriesScore?.top ?? 0;
  const bs = s.series.seriesScore?.bottom ?? 0;
  if (ts > bs) return `${top} leads ${bot} ${ts}-${bs}.`;
  if (bs > ts) return `${bot} leads ${top} ${bs}-${ts}.`;
  return `Series tied ${ts}-${bs}.`;
}

function eliminationLeaderName(s) {
  const leader = s.eliminationFor === 'top' ? s.bottomTeam : s.topTeam;
  return leader?.name || leader?.abbrev || '?';
}
function eliminationTrailerName(s) {
  const trailer = s.eliminationFor === 'top' ? s.topTeam : s.bottomTeam;
  return trailer?.name || trailer?.abbrev || '?';
}
function upsetLine(s) {
  const leader = s.leader === 'top' ? s.topTeam : s.bottomTeam;
  const trailer = s.leader === 'top' ? s.bottomTeam : s.topTeam;
  if (!leader || !trailer) return 'Upset brewing in the bracket.';
  return `${leader.abbrev} (${leader.seed}) leading ${trailer.abbrev} (${trailer.seed}).`;
}

function formatConv(tier) {
  if (!tier) return 'Edge';
  const t = String(tier).toLowerCase();
  if (t === 'high' || t === 'tier1' || t === 'elite') return 'High';
  if (t === 'medium' || t === 'tier2' || t === 'strong') return 'Medium';
  if (t === 'low' || t === 'tier3' || t === 'solid') return 'Lean';
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}
