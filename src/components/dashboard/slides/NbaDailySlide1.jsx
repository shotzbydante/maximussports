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
import { resolveSlidePicks } from '../../../features/nba/contentStudio/resolveSlidePicks';
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
  // Always render exactly 3 HOTP rows. If the upstream feed is short,
  // pad with a neutral placeholder so the module height stays stable
  // and Slide 1 never collapses around an empty zone.
  const rawBullets = (payload.bullets || []).slice(0, 3);
  const padded = [...rawBullets];
  while (padded.length < 3) {
    padded.push({ text: 'Updates rolling in — refresh closer to tip-off.', logoSlug: null, source: 'placeholder' });
  }
  const bullets = padded;

  // Slide 1 + Slide 2 must consume the SAME canonical bullets array.
  // Logging at the slide level (not just at the normalizer) means a
  // future divergence shows up in BOTH places loudly. Window-side, we
  // also emit [NBA_PLAYOFF_WINDOW_FETCH] per date so any "missing
  // games" situation is traceable end-to-end.
  if (typeof window !== 'undefined') {
    // eslint-disable-next-line no-console
    console.log('[NBA_HOTP_PAYLOAD]', {
      slide: 1,
      count: payload.bullets?.length || 0,
      first: payload.bullets?.[0]?.text,
      sources: (payload.bullets || []).map(b => b.source),
    });
  }

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

  // Picks: SAME 3-pick subset as Slide 2. resolveSlidePicks() is the
  // shared canonical resolver — Slide 1 (cap 3) === Slide 2 (cap 3).
  // No drift, no recomputation, no separate sort key.
  const allPicks = resolveSlidePicks(payload, 3);
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
      // Compact label for Slide 1 ("SPR" / "ML" / "O/U" / "LEAN") so
      // the small pill stays readable. Slide 2 uses the long label.
      type: p._catShort || p._cat,
      selection: p.pick?.label || '—',
      conviction: formatConv(p.confidence || p.tier),
    };
  });
  // True only when EVERY pick on Slide 1 came from the spread market —
  // drives the editorial sublabel ("Model Spread Leans"). Otherwise we
  // fall back to a generic sublabel that still makes the model framing
  // obvious without over-claiming the market.
  const allSpread = picks.length > 0 && picks.every(p => p.type === 'SPR');

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
          <div className={styles.s1SectionSublabel}>
            {allSpread ? 'Model Spread Leans' : 'Model Leans'}
          </div>
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

  // Detect dramatic context from narrative — never fabricated.
  // Used to enrich the card title with "in OT" / "on a buzzer-beater"
  // / "after erasing a 22-pt deficit" suffixes.
  const narr = story.narrative || {};
  const ot = !!narr.isOvertime;
  const otTag = (narr.overtimeCount && narr.overtimeCount > 1) ? `${narr.overtimeCount}OT` : 'OT';
  const notes = String(narr.notesText || '').toLowerCase();
  const buzzer = /buzzer[-\s]*beater|game[-\s]*winn|last[-\s]*second|walk[-\s]*off|ot three|overtime three/.test(notes);

  // Comeback margin from per-quarter linescores (winner side).
  let comebackDef = 0;
  const winSide = story.winSide;
  const winLine = winSide === 'home' ? narr.homeLine : winSide === 'away' ? narr.awayLine : null;
  const losLine = winSide === 'home' ? narr.awayLine : winSide === 'away' ? narr.homeLine : null;
  if (Array.isArray(winLine) && Array.isArray(losLine)) {
    let cumW = 0, cumL = 0;
    for (let i = 0; i < Math.min(winLine.length, losLine.length); i++) {
      cumW += winLine[i] || 0;
      cumL += losLine[i] || 0;
      if (i === winLine.length - 1) break;
      const def = cumL - cumW;
      if (def > comebackDef) comebackDef = def;
    }
  }

  // Grammar-correct playoff titles
  let title;
  // 3-1 SERIES COMEBACK — outranks every other clincher template.
  if (story.isComebackFrom31) {
    title = `${winName} complete 3-1 comeback to stun ${nicknameFor(loseSlug)}`;
  }
  else if (story.isSweep) title = `${winName} complete sweep over ${nicknameFor(loseSlug)}`;
  else if (story.isGame7Win) {
    if (ot && buzzer) title = `${winName} survive Game 7 ${score} on a last-second OT shot`;
    else if (ot) title = `${winName} survive Game 7 ${score} in ${otTag}`;
    else if (buzzer) title = `${winName} win Game 7 ${score} on a last-second shot`;
    else if (comebackDef >= 15) title = `${winName} erase ${comebackDef}-pt Game 7 deficit to advance`;
    // Path-verified Game 7 survival — winner wasn't down 3-1, so the
    // story is "outlast / survive" not "stun".
    else if (story.game7Survival) title = `${winName} survive ${nicknameFor(loseSlug)} in Game 7 ${score}`;
    else title = `${winName} win Game 7 ${score} and advance`;
  }
  else if (story.isClinch) title = `${winName} eliminate ${nicknameFor(loseSlug)} ${score} and advance`;
  else if (story.forcesGame7) {
    if (ot && buzzer) title = `${winName} force Game 7 in OT on a last-second shot`;
    else if (ot) title = `${winName} outlast ${nicknameFor(loseSlug)} in ${otTag} to force Game 7`;
    else if (buzzer) title = `${winName} force Game 7 on a last-second shot`;
    else if (comebackDef >= 15) title = `${winName} rally from ${comebackDef} down to force Game 7`;
    else title = `${winName} force Game 7 over ${nicknameFor(loseSlug)} ${score}`;
  }
  else if (story.closeoutFailed) {
    title = `${winName} stay alive — push series to Game ${(story.winSeriesWins||0) + (story.loseSeriesWins||0) + 1}`;
  }
  else if (story.eliminationAvoided) {
    title = `${winName} avoid elimination ${score} over ${nicknameFor(loseSlug)}`;
  }
  else if (story.isElimWin) title = `${winName} push ${nicknameFor(loseSlug)} to brink`;
  else if (story.isUpset) {
    const gameNum = story.series?.gamesPlayed || 0;
    if (ot && buzzer) {
      title = `${winName} stun ${nicknameFor(loseSlug)} ${score} in OT on a last-second three`;
    } else if (ot) {
      title = `${winName} stun ${nicknameFor(loseSlug)} ${score} in ${otTag}`;
    } else if (buzzer) {
      title = `${winName} stun ${nicknameFor(loseSlug)} ${score} on a last-second shot`;
    } else if (gameNum) {
      title = `${winName} steal Game ${gameNum} from ${nicknameFor(loseSlug)}`;
    } else {
      title = `${winName} steal one from ${nicknameFor(loseSlug)}`;
    }
  }
  else if (story.isStolenRoadWin) {
    if (ot) title = `${winName} steal one on the road from ${nicknameFor(loseSlug)} in ${otTag}`;
    else title = `${winName} steal one on the road from ${nicknameFor(loseSlug)}`;
  }
  else if (comebackDef >= 25) title = `${winName} cap historic ${comebackDef}-pt comeback over ${nicknameFor(loseSlug)} ${score}`;
  else if (comebackDef >= 20) title = `${winName} erase ${comebackDef}-pt deficit to beat ${nicknameFor(loseSlug)} ${score}`;
  else if (comebackDef >= 15) title = `${winName} rally past ${nicknameFor(loseSlug)} from ${comebackDef}-pt hole, ${score}`;
  else if (ot && buzzer) title = `${winName} edge ${nicknameFor(loseSlug)} ${score} on a last-second OT shot`;
  else if (ot) title = `${winName} edge ${nicknameFor(loseSlug)} ${score} in ${otTag}`;
  else if (buzzer) title = `${winName} beat ${nicknameFor(loseSlug)} ${score} on a last-second shot`;
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

export function buildFallbackStoryCard(pc) {
  const elim = pc?.eliminationGames?.[0];
  if (elim) {
    const ts = elim.seriesScore?.top ?? 0;
    const bs = elim.seriesScore?.bottom ?? 0;
    // Game 7 special-case (audit Part 1): when the series is tied 3-3,
    // both teams face elimination — "X try to close out Y" is wrong,
    // and rendering "3-3" as the big right-side display reads like a
    // fake final score sitting next to the real score on the card
    // above. Use a neutral "GAME 7" label instead.
    const isTiedGame7 = (ts === 3 && bs === 3) || !!elim.isGameSeven;
    if (isTiedGame7) {
      const topT = elim.topTeam || {};
      const botT = elim.bottomTeam || {};
      return {
        winSlug: topT.slug,
        loseSlug: botT.slug,
        winAbbrev: topT.abbrev,
        loseAbbrev: botT.abbrev,
        title: `${topT.name || topT.abbrev} and ${botT.name || botT.abbrev} go to Game 7`,
        sub: elim.seriesScore?.summary || `Series tied ${ts}-${bs}`,
        // "GAME 7" replaces the score-shaped "3-3" so it doesn't read
        // like a final next to the real game score above. The
        // scoreIsLabel flag drops the gold-glow score styling so it
        // renders as a state label, not a result.
        score: 'GAME 7',
        scoreIsLabel: true,
      };
    }
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
      {card.score && (
        <div className={card.scoreIsLabel ? styles.s1StoryStateLabel : styles.s1StoryScore}>
          {card.score}
        </div>
      )}
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
