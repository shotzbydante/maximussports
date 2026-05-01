/**
 * NbaDailySlide1 — Cover (Slide 1 of NBA Daily Briefing carousel).
 *
 * Premium upgrade:
 *   - Mascot integrated into hero composition (right of title)
 *   - Story cards now carry BOTH team logos + prominent scoreline
 *   - HOT OFF THE PRESS bullets show team logo chips
 *   - Playoff Contenders + Maximus's Picks cards both show team logos
 *   - Grammar-corrected playoff copy (Raptors lead, not leads)
 *
 * 1080×1350 · IG 4:5 portrait.
 */

import { normalizeNbaImagePayload } from '../../../features/nba/contentStudio/normalizeNbaImagePayload';
import { getNbaEspnLogoUrl } from '../../../utils/espnNbaLogos';
import { NBA_TEAMS } from '../../../sports/nba/teams';
import styles from './NbaSlides.module.css';

const EAST_SLUGS = new Set(['bos','det','cle','tor','nyk','atl','ind','mia','phi','mil','orl','chi','was','cha','bkn']);

function fmtDate() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/Los_Angeles',
  });
}

function trim(text, max = 140) {
  if (!text) return '';
  let s = String(text).trim();
  if (s.length <= max) return s;
  const sentEnd = s.lastIndexOf('.', max);
  if (sentEnd > max * 0.4) return s.slice(0, sentEnd + 1);
  return s.slice(0, max).replace(/\s+\S*$/, '') + '.';
}

/**
 * Fix singular-verb agreement for plural team nicknames in auto-generated
 * copy. "Raptors leads" → "Raptors lead", "Hawks pulls" → "Hawks pull".
 *
 * Narrow rule: applies only to a small set of verbs we emit in our own
 * builders; never touches user content. Plural names ending in 's' plus
 * team names like "Heat" / "Jazz" / "Magic" / "Thunder" that are
 * grammatically singular are left alone.
 */
function fixPlural(text) {
  if (!text) return text;
  return text
    .replace(/\bleads\b/gi, 'lead')
    .replace(/\btrails\b/gi, 'trail')
    .replace(/\bpulls\b/gi, 'pull')
    .replace(/\btakes\b/gi, 'take')
    .replace(/\bsteals\b/gi, (m, i, full) => {
      // "Pacers steal a Game 1 win" — keep if already plural context.
      // Revert to "steal" only when preceded by a plural team noun.
      const before = full.slice(Math.max(0, i - 30), i);
      if (/(Pacers|Raptors|Knicks|Bucks|Lakers|Rockets|Nuggets|Timberwolves|Thunder|Spurs|Pistons|Cavaliers|Celtics|Hawks|Warriors|Suns|Mavericks|Kings|Clippers|Heat|Nets|76ers|Grizzlies|Pelicans|Bulls|Wizards|Hornets|Magic|Jazz|Blazers)\s$/i.test(before)) {
        return m === 'Steals' ? 'Steal' : 'steal';
      }
      return m;
    });
}

function Logo({ slug, size = 22, backplate = false, abbrev }) {
  const src = slug ? getNbaEspnLogoUrl(slug) : null;
  if (!src) {
    if (!abbrev) return null;
    // Fallback badge
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

export default function NbaDailySlide1({ data, asOf: _a, slideNumber: _s, slideTotal: _t, ...rest }) {
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

  const topStory = payload.topStory;
  const secondStory = payload.secondStory;

  const card1 = buildStoryCard(topStory, payload);
  const card2 = buildStoryCard(secondStory, payload) || buildFallbackStoryCard(pc);

  // Playoff contenders — top 5 from the outlook (ranked by implied prob).
  // Bumping from 3 → 5 fills the bottom-card real estate that was empty
  // and brings parity with the MLB Pennant Race module density.
  const allOutlook = [...(payload.playoffOutlook?.east || []), ...(payload.playoffOutlook?.west || [])]
    .filter(t => t.prob != null)
    .sort((a, b) => (b.prob ?? 0) - (a.prob ?? 0));
  const raceTeams = allOutlook.slice(0, 5);

  // Picks: top 3 from V2 engine
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
    const pickSide = p.pick?.side || p.selection?.side;
    const selectedTeam = pickSide === 'away' ? away : pickSide === 'home' ? home : null;
    return {
      awaySlug: away.slug,
      awayAbbrev: away.shortName || away.abbrev || '?',
      homeSlug: home.slug,
      homeAbbrev: home.shortName || home.abbrev || '?',
      selectedSlug: selectedTeam?.slug || null,
      selectedAbbrev: selectedTeam?.shortName || selectedTeam?.abbrev,
      matchup: `${away.shortName || away.abbrev || '?'} @ ${home.shortName || home.abbrev || '?'}`,
      type: p._cat,
      selection: p.pick?.label || '—',
      conviction: formatConv(p.confidence || p.tier),
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

      {/* Title + mascot composition */}
      <div className={styles.s1TitleRow}>
        <div className={styles.s1TitleBlock}>
          <h1 className={styles.s1Title}>
            DAILY <span className={styles.s1TitleAccent}>NBA</span>
            <span style={{ display: 'block' }}>BRIEFING</span>
          </h1>
          <div className={styles.s1Date}>{fmtDate()}</div>
        </div>
        <img
          src="/mascot.png" alt="Maximus"
          className={styles.s1Mascot}
          loading="eager" decoding="sync" crossOrigin="anonymous"
          onError={e => { e.currentTarget.style.display = 'none'; }}
        />
      </div>

      {/* Story cards — matchup + score forward */}
      <div className={styles.s1StoryZone}>
        <StoryCard card={card1} />
        <StoryCard card={card2} />
      </div>

      {/* HOT OFF THE PRESS with team logo chips */}
      <div className={styles.s1HotpZone}>
        <div className={styles.s1HotpPill}>
          <span>🔔</span><span>HOT OFF THE PRESS</span>
        </div>
        <div className={styles.s1HotpBullets}>
          {bullets.map((b, i) => (
            <div key={i} className={styles.s1HotpRow}>
              <span className={styles.s1BulletDot}>▸</span>
              {b.logoSlug && <Logo slug={b.logoSlug} size={26} backplate />}
              <span className={styles.s1BulletText}>{fixPlural(trim(b.text, 130))}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom two-column — Contenders + Picks */}
      <div className={styles.s1BottomGrid}>
        <div className={styles.s1BottomCard}>
          <div className={styles.s1SectionLabel}>PLAYOFF CONTENDERS</div>
          <div className={styles.s1RaceList}>
            {raceTeams.map((t, i) => (
              <div key={i} className={styles.s1RaceRow}>
                <div className={styles.s1RaceTeamId}>
                  <Logo slug={t.slug} size={36} backplate abbrev={t.abbrev} />
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
                    {EAST_SLUGS.has(t.slug) ? 'EAST' : 'WEST'}
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
                <div className={styles.s1PickLogoWrap}>
                  <Logo slug={p.selectedSlug || p.homeSlug} size={34} backplate abbrev={p.selectedAbbrev || p.homeAbbrev} />
                </div>
                <div className={styles.s1PickBody}>
                  <span className={styles.s1PickMatchup}>{p.matchup}</span>
                  <div className={styles.s1PickSel}>{p.selection}</div>
                </div>
                <div className={styles.s1PickRight}>
                  <span className={styles.s1PickType}>{p.type}</span>
                  <span className={styles.s1PickConv}>{p.conviction}</span>
                </div>
              </div>
            ))}
            {picks.length === 0 && (
              <div className={styles.s1PickRow}>
                <div className={styles.s1PickBody}>
                  <div className={styles.s1PickSel}>Board refreshes before tip-off.</div>
                </div>
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

// ── Story card builder (used by both top + second story) ──────────────

function buildStoryCard(story, payload) {
  if (!story) return null;
  const winSlug = story.winSlug;
  const loseSlug = story.loseSlug;
  const winAbbrev = abbrevFor(winSlug);
  const loseAbbrev = abbrevFor(loseSlug);
  const winName = nicknameFor(winSlug);
  const score = `${story.winScore}–${story.loseScore}`;

  // Grammar-correct playoff titles
  let title;
  if (story.isSweep) title = `${winName} complete sweep over ${nicknameFor(loseSlug)}`;
  else if (story.isGame7Win) title = `${winName} win Game 7 ${score}`;
  else if (story.isClinch) title = `${winName} close out ${nicknameFor(loseSlug)} ${score}`;
  else if (story.isElimWin) title = `${winName} push ${nicknameFor(loseSlug)} to brink`;
  else if (story.isUpset) title = `${winName} steal Game ${(story.series?.gamesPlayed || 0)} from ${nicknameFor(loseSlug)}`;
  else if (story.isStolenRoadWin) title = `${winName} steal one on the road from ${nicknameFor(loseSlug)}`;
  else title = `${winName} top ${nicknameFor(loseSlug)} ${score}`;

  // Series subline
  let sub = '';
  if (story.inSeries && story.series) {
    const ts = story.series.seriesScore?.top ?? 0;
    const bs = story.series.seriesScore?.bottom ?? 0;
    const topAbbr = story.series.topTeam?.abbrev;
    const botAbbr = story.series.bottomTeam?.abbrev;
    if (ts > bs) sub = `${topAbbr} lead ${botAbbr} ${ts}-${bs}`;
    else if (bs > ts) sub = `${botAbbr} lead ${topAbbr} ${bs}-${ts}`;
    else sub = `Series tied ${ts}-${bs}`;
  } else {
    sub = `${winAbbrev} wins ${score}`;
  }

  return {
    winSlug, loseSlug, winAbbrev, loseAbbrev,
    title, sub, score,
  };
}

function buildFallbackStoryCard(pc) {
  const elim = pc?.eliminationGames?.[0];
  if (elim) {
    const leader = elim.eliminationFor === 'top' ? elim.bottomTeam : elim.topTeam;
    const trailer = elim.eliminationFor === 'top' ? elim.topTeam : elim.bottomTeam;
    return {
      winSlug: leader?.slug,
      loseSlug: trailer?.slug,
      winAbbrev: leader?.abbrev,
      loseAbbrev: trailer?.abbrev,
      title: `${leader?.name || leader?.abbrev} try to close out ${trailer?.name || trailer?.abbrev}`,
      sub: elim.seriesScore?.summary || 'Closeout opportunity ahead',
      score: elim.seriesScore ? `${elim.seriesScore.top}-${elim.seriesScore.bottom}` : '',
    };
  }
  const upset = pc?.upsetWatch?.[0];
  if (upset) {
    const leader = upset.leader === 'top' ? upset.topTeam : upset.bottomTeam;
    const trailer = upset.leader === 'top' ? upset.bottomTeam : upset.topTeam;
    return {
      winSlug: leader?.slug,
      loseSlug: trailer?.slug,
      winAbbrev: leader?.abbrev,
      loseAbbrev: trailer?.abbrev,
      title: `${leader?.abbrev} (#${leader?.seed}) flipping the bracket on ${trailer?.abbrev}`,
      sub: upset.seriesScore?.summary || 'Upset watch',
      score: upset.seriesScore ? `${upset.seriesScore.top}-${upset.seriesScore.bottom}` : '',
    };
  }
  const activeRound = pc?.round || 'Round 1';
  return {
    winSlug: null, loseSlug: null,
    title: `${activeRound} rolls on across the bracket`,
    sub: 'Tonight\'s results reshape seeding and matchup edges',
    score: '',
  };
}

function StoryCard({ card }) {
  if (!card) return null;
  return (
    <div className={styles.s1StoryCard}>
      <div className={styles.s1StoryLogos}>
        {card.winSlug && <Logo slug={card.winSlug} size={58} backplate abbrev={card.winAbbrev} />}
        {card.loseSlug && (
          <>
            <span className={styles.s1StoryVs}>VS</span>
            <Logo slug={card.loseSlug} size={58} backplate abbrev={card.loseAbbrev} />
          </>
        )}
      </div>
      <div className={styles.s1StoryBody}>
        <div className={styles.s1StoryTitle}>{card.title}</div>
        {card.sub && <div className={styles.s1StorySub}>{card.sub}</div>}
      </div>
      {card.score && <div className={styles.s1StoryScore}>{card.score}</div>}
    </div>
  );
}

// ── Utilities ─────────────────────────────────────────────────────

function abbrevFor(slug) {
  const t = NBA_TEAMS.find(t => t.slug === slug);
  return t?.abbrev || slug?.toUpperCase() || '';
}

function nicknameFor(slug) {
  const t = NBA_TEAMS.find(t => t.slug === slug);
  if (!t) return '???';
  if (/Trail Blazers$/i.test(t.name)) return 'Trail Blazers';
  return t.name.split(' ').slice(-1)[0];
}

function formatConv(tier) {
  if (!tier) return 'Edge';
  const t = String(tier).toLowerCase();
  if (t === 'high' || t === 'tier1' || t === 'elite') return 'High';
  if (t === 'medium' || t === 'tier2' || t === 'strong') return 'Medium';
  if (t === 'low' || t === 'tier3' || t === 'solid') return 'Lean';
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}
