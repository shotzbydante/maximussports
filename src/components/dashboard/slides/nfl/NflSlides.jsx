/**
 * NFL Content Studio slides (1080 x 1350, Instagram 4:5).
 *
 * Every slide reads the normalized payload from normalizeNflStudioPayload and
 * nothing else. Design rules these slides follow, so they stay legible in a
 * phone feed where the artboard is shown at roughly a third of its size:
 *   - one idea per slide, a headline of 80px or more
 *   - no text under 24px
 *   - numbers carry the slide; sentences are short
 */

import { leadSentences } from '../../../../features/nfl/contentStudio/text';
import styles from './NflSlides.module.css';

const IMG = { loading: 'eager', decoding: 'sync', crossOrigin: 'anonymous' };
const hide = (e) => { e.currentTarget.style.visibility = 'hidden'; };

function Logo({ team, size = 64 }) {
  if (!team?.logo) return <span className={styles.logoGap} style={{ width: size, height: size }} />;
  return <img src={team.logo} alt="" width={size} height={size} className={styles.logo} onError={hide} {...IMG} />;
}

function Shell({ payload, kicker, children, slideNumber, slideTotal, rest }) {
  const slideAttr = rest?.['data-slide'] != null ? { 'data-slide': rest['data-slide'] } : {};
  return (
    <div className={styles.artboard} {...slideAttr}>
      <div className={styles.bg} />
      <div className={styles.bgGlow} />
      <div className={styles.bgLines} />
      <header className={styles.header}>
        <img src="/logo-wordmark.png" alt="Maximus Sports" className={styles.brand} {...IMG} onError={hide} />
        <span className={styles.pill}>{kicker || `NFL · ${payload?.slateLabel || ''}`}</span>
      </header>
      <main className={styles.body}>{children}</main>
      <footer className={styles.footer}>
        <span className={styles.site}>maximussports.ai</span>
        <span className={styles.legal}>21+ · For entertainment only</span>
        {slideTotal > 1 && (
          <span className={styles.dots} aria-hidden="true">
            {Array.from({ length: slideTotal }).map((_, i) => (
              <i key={i} className={i + 1 === slideNumber ? styles.dotOn : styles.dot} />
            ))}
          </span>
        )}
      </footer>
    </div>
  );
}

function Empty({ title, note }) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyTitle}>{title}</div>
      <div className={styles.emptyNote}>{note}</div>
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className={styles.stat}>
      <div className={`${styles.statValue} ${tone ? styles[tone] : ''}`}>{value ?? '—'}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}

function Matchup({ away, home, size = 72 }) {
  return (
    <div className={styles.matchup}>
      <Logo team={away} size={size} />
      <span className={styles.matchupText}>{away?.abbrev}</span>
      <span className={styles.at}>@</span>
      <span className={styles.matchupText}>{home?.abbrev}</span>
      <Logo team={home} size={size} />
    </div>
  );
}

/* ───────────────────────── Slate briefing: 3 slides ───────────────────────── */

export function NflSlateHeroSlide({ data: p, slideNumber, slideTotal, ...rest }) {
  const top = p?.topPick;
  const games = p?.upcoming?.length || p?.meta?.gamesOnSlate || 0;
  const n = p?.meta?.picksPublished || 0;
  const withSpread = (p?.upcoming || []).filter((g) => g.spreadHome != null);
  const biggest = [...withSpread].sort((a, b) => Math.abs(b.spreadHome) - Math.abs(a.spreadHome))[0];
  const tightest = [...withSpread].sort((a, b) => Math.abs(a.spreadHome) - Math.abs(b.spreadHome))[0];

  return (
    <Shell payload={p} slideNumber={slideNumber} slideTotal={slideTotal} rest={rest}>
      <div className={styles.kicker}>{p?.slateLabel} · {p?.dateLabel}</div>
      <div className={styles.heroRow}>
        <h1 className={styles.h1}>
          {games} {games === 1 ? 'game' : 'games'}.<br />
          <span className={styles.accent}>{n > 0 ? `${n} ${n === 1 ? 'bet' : 'bets'}.` : 'No bet yet.'}</span>
        </h1>
        <img src="/mascot.png" alt="" className={styles.mascot} {...IMG} onError={hide} />
      </div>
      {p?.meta?.marketsChecked > 0 && (
        <p className={styles.lede}>
          {n > 0 ? 'That is all that cleared the bar. ' : ''}We priced {p.meta.marketsChecked} markets{p.meta.booksCount ? ` across ${p.meta.booksCount} books` : ''} and passed on {p.meta.held}.
        </p>
      )}

      {top ? (
        <section className={styles.card}>
          <div className={styles.cardLabel}>Best number on the board</div>
          <div className={styles.topPick}>{top.label}</div>
          <div className={styles.topMeta}>
            <Matchup away={top.away} home={top.home} size={52} />
            <span className={styles.topWhen}>{top.kickoffLabel}</span>
          </div>
          <div className={styles.stats}>
            <Stat label={top.book || 'Offered'} value={top.offeredPrice} />
            <Stat label="Fair price" value={top.fairPrice} />
            <Stat label="Expected value" value={top.evLabel} tone="good" />
          </div>
        </section>
      ) : (
        <section className={styles.card}>
          <div className={styles.cardLabel}>Where we stand</div>
          <div className={styles.passNote}>Every price on the board is fair right now. When a book hangs a bad number, it shows up here.</div>
        </section>
      )}

      <ul className={styles.facts}>
        {biggest && <li><span>Biggest favorite</span><b>{biggest.spreadLabel}</b></li>}
        {tightest && tightest !== biggest && <li><span>Closest line</span><b>{tightest.away.abbrev} @ {tightest.home.abbrev} · {tightest.spreadLabel}</b></li>}
      </ul>
    </Shell>
  );
}

export function NflSlateBoardSlide({ data: p, slideNumber, slideTotal, ...rest }) {
  const games = p?.games || [];
  const rowH = Math.max(44, Math.min(76, Math.floor(770 / Math.max(games.length, 1))));
  return (
    <Shell payload={p} slideNumber={slideNumber} slideTotal={slideTotal} rest={rest}>
      <div className={styles.kicker}>{p?.slateLabel} · every game</div>
      <h2 className={`${styles.h2} ${styles.h2Tight}`}>The board</h2>
      {games.length === 0 ? (
        <Empty title="No games listed" note="The schedule feed has not posted this week yet." />
      ) : (
        <div className={styles.board} style={{ '--row-h': `${rowH}px` }}>
          <div className={`${styles.boardRow} ${styles.boardHead}`}>
            <span>Matchup</span><span>Kickoff</span><span>Line</span><span>Total</span><span>Maximus</span>
          </div>
          {games.map((g) => (
            <div key={g.id} className={`${styles.boardRow} ${g.picks.length ? styles.boardRowPick : ''}`}>
              <span className={styles.boardTeams}>
                <Logo team={g.away} size={Math.round(rowH * 0.56)} />
                <b>{g.away?.abbrev}</b><i>@</i><b>{g.home?.abbrev}</b>
                <Logo team={g.home} size={Math.round(rowH * 0.56)} />
              </span>
              {g.isFinal ? (
                <>
                  <span className={styles.muted}>Final</span>
                  <span className={styles.boardFinal}>{g.away?.score}–{g.home?.score}</span>
                  <span />
                  <span />
                </>
              ) : (
                <>
                  <span className={styles.muted}>{g.kickoffDay} {g.kickoffTime?.replace(' ET', '')}</span>
                  <span>{g.spreadLabel || '—'}</span>
                  <span>{g.total ?? '—'}</span>
                  <span className={g.picks.length ? styles.boardPick : styles.muted}>
                    {g.picks.length ? g.picks[0].label : (g.winProbLabel || '—')}
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      <p className={styles.note}>
        Highlighted rows are bets that cleared the bar. Elsewhere the last column is our win probability. Times Eastern.
      </p>
    </Shell>
  );
}

export function NflTitleRaceSlide({ data: p, slideNumber, slideTotal, ...rest }) {
  const race = p?.titleRace || [];
  const max = race[0]?.titleImpliedPct || 1;
  return (
    <Shell payload={p} slideNumber={slideNumber} slideTotal={slideTotal} rest={rest}>
      <div className={styles.kicker}>{p?.slateLabel} · market prices</div>
      <h2 className={styles.h2}>The Super Bowl race</h2>
      {race.length === 0 ? (
        <Empty title="Title odds unavailable" note="The futures feed did not load. Regenerate to try again." />
      ) : (
        <div className={styles.race}>
          {race.slice(0, p?.sendLine && (p?.bubble || []).length ? 7 : 8).map((t, i) => (
            <div key={t.slug} className={styles.raceRow}>
              <span className={styles.raceRank}>{i + 1}</span>
              <Logo team={t} size={62} />
              <span className={styles.raceName}>
                <b>{t.nickname || t.abbrev}</b>
                <i>{t.record}{t.playoffLabel ? ` · ${t.playoffLabel} playoffs` : ''}</i>
              </span>
              <span className={styles.raceBar}><em style={{ width: `${Math.max(6, (t.titleImpliedPct / max) * 100)}%` }} /></span>
              <span className={styles.raceOdds}>{t.titleOddsLabel}</span>
            </div>
          ))}
        </div>
      )}
      {p?.sendLine && <p className={styles.send}>{p.sendLine}</p>}
      {(p?.bubble || []).length > 0 && (
        <section className={styles.bubble}>
          <div className={styles.cardLabel}>Coin flips to make the playoffs</div>
          <div className={styles.bubbleRow}>
            {p.bubble.slice(0, 4).map((t) => (
              <span key={t.slug} className={styles.bubbleChip}><Logo team={t} size={40} /><b>{t.abbrev}</b>{t.playoffLabel}</span>
            ))}
          </div>
        </section>
      )}
    </Shell>
  );
}

/* ───────────────────────── Maximus's Picks: cover + one slide per pick ───────────────────────── */

export function NflPicksCoverSlide({ data: p, slideNumber, slideTotal, ...rest }) {
  const picks = p?.heroPicks || [];
  const r = p?.receipts;
  return (
    <Shell payload={p} slideNumber={slideNumber} slideTotal={slideTotal} rest={rest}>
      <div className={styles.kicker}>{p?.slateLabel} · Maximus&rsquo;s picks</div>
      <div className={styles.heroRow}>
        <h1 className={`${styles.h1} ${styles.h1Cover}`}>
          {picks.length} {picks.length === 1 ? 'bet' : 'bets'}<br />
          <span className={styles.accent}>made the cut.</span>
        </h1>
        <img src="/mascot.png" alt="" className={styles.mascot} {...IMG} onError={hide} />
      </div>
      {p?.meta?.marketsChecked > 0 && (
        <p className={styles.lede}>Out of {p.meta.marketsChecked} markets priced{p.meta.booksCount ? ` at ${p.meta.booksCount} books` : ''}. The rest were fair, so we passed.</p>
      )}
      {picks.length === 0 ? (
        <Empty title="Nothing to post" note="No price beat our number this week." />
      ) : (
        <div className={styles.coverList}>
          {picks.slice(0, 4).map((k, i) => (
            <div key={k.id} className={styles.coverPick}>
              <span className={styles.coverNum}>{i + 1}</span>
              <span className={styles.coverMain}>
                <b>{k.label}</b>
                <i>{k.matchupLabel} · {k.kickoffLabel}</i>
              </span>
              <span className={styles.coverPrice}>
                <b>{k.offeredPrice}</b>
                <i>{k.book}</i>
              </span>
            </div>
          ))}
        </div>
      )}
      <div className={styles.promise}>
        <b>Locked at a real price. Graded in public.</b>
        {r?.hasGraded ? <span>{r.scope}: {r.recordLabel}{r.unitsLabel ? `, ${r.unitsLabel}` : ''}</span> : <span>Swipe for the reasoning →</span>}
      </div>
    </Shell>
  );
}

export function NflPickSlide({ data: p, slideNumber, slideTotal, ...rest }) {
  const k = (p?.heroPicks || [])[slideNumber - 2];
  if (!k) {
    return (
      <Shell payload={p} slideNumber={slideNumber} slideTotal={slideTotal} rest={rest}>
        <Empty title="No pick for this slide" note="Regenerate to rebuild the carousel." />
      </Shell>
    );
  }
  const locked = k.lockedAt
    ? new Date(k.lockedAt).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
    : null;
  return (
    <Shell payload={p} slideNumber={slideNumber} slideTotal={slideTotal} rest={rest}>
      <div className={styles.kicker}>
        Pick {slideNumber - 1} of {p.heroPicks.length} · {k.tierLabel}{k.convictionScore != null ? ` · conviction ${k.convictionScore}` : ''}
      </div>
      <div className={styles.pickMatch}>
        <Matchup away={k.away} home={k.home} size={96} />
        <span className={styles.pickWhen}>{k.kickoffLabel}{k.network ? ` · ${k.network}` : ''}</span>
      </div>
      <h1 className={styles.pickLabel}>{k.label}</h1>
      <div className={styles.stats}>
        <Stat label={k.book || 'Offered'} value={k.offeredPrice} />
        <Stat label="Fair price" value={k.fairPrice} />
        <Stat label="Wins" value={k.hitPct} />
        <Stat label="Expected value" value={k.evLabel} tone="good" />
      </div>
      {k.marketProb != null && k.modelProb != null && (
        <div className={styles.gap}>
          <span>Market <b>{k.marketPct}</b></span>
          <div className={styles.gapBar}>
            <i style={{ left: `${Math.max(2, Math.min(98, (k.marketProb - 0.4) * 500))}%` }} className={styles.gapMarket} />
            <i style={{ left: `${Math.max(2, Math.min(98, (k.modelProb - 0.4) * 500))}%` }} className={styles.gapModel} />
          </div>
          <span>Maximus <b className={styles.good}>{k.modelPct}</b></span>
        </div>
      )}
      <section className={styles.why}>
        <div className={styles.cardLabel}>Why</div>
        <ol>
          {/* The stat tiles already carry the hit-rate line, so it is not repeated here. */}
          {k.reasons.filter((reason) => !/^At that number/i.test(reason)).map((reason, i) => <li key={i}>{leadSentences(reason)}</li>)}
        </ol>
      </section>
      <p className={styles.note}>
        {locked ? `Locked ${locked} ET at ${k.lockedPrice || k.offeredPrice}. That ticket is the one we grade.` : 'Graded at the price shown.'}
        {k.pushPct ? ` Pushes ${k.pushPct} of the time.` : ''}
        {k.movedAgainst ? ' The line has moved since, so shop for this number or better.' : ''}
        {slideNumber === slideTotal && p.sendLine ? ` ${p.sendLine}` : ''}
      </p>
    </Shell>
  );
}

/* ───────────────────────── Game breakdown: 1 slide ───────────────────────── */

export function NflGameSlide({ data: p, slideNumber, slideTotal, ...rest }) {
  const g = p?.selectedGame;
  if (!g) {
    return (
      <Shell payload={p} slideNumber={slideNumber} slideTotal={slideTotal} rest={rest}>
        <Empty title="Pick a game" note="Choose a matchup in the controls." />
      </Shell>
    );
  }
  const homeProb = g.homeWinProb != null ? Math.round(g.homeWinProb * 100) : null;
  const qb = (q) => (q ? `${q.name}${q.changed ? ' (new starter)' : ''}` : 'TBD');
  const wx = g.weather
    ? (g.weather.indoor ? 'Indoors' : [g.weather.temp != null ? `${g.weather.temp}°F` : null, g.weather.wind != null ? `${g.weather.wind} mph wind` : null].filter(Boolean).join(' · '))
    : null;
  return (
    <Shell payload={p} kicker="NFL · Game breakdown" slideNumber={slideNumber} slideTotal={slideTotal} rest={rest}>
      <div className={styles.kicker}>{g.kickoffLabel}{g.network ? ` · ${g.network}` : ''}{g.venue ? ` · ${g.venue}` : ''}</div>
      <div className={styles.gameHead}>
        <div className={styles.gameTeam}>
          <Logo team={g.away} size={124} />
          <b>{g.away?.abbrev}</b><i>{g.away?.record}</i>
        </div>
        <div className={styles.gameMid}>
          {g.isFinal ? (
            <><span className={styles.gameScore}>{g.away?.score}–{g.home?.score}</span><i>Final</i></>
          ) : g.projection?.homePoints != null ? (
            <><span className={styles.gameScore}>{Math.round(g.projection.awayPoints)}–{Math.round(g.projection.homePoints)}</span><i>Maximus projection</i></>
          ) : (
            <span className={styles.gameAt}>@</span>
          )}
        </div>
        <div className={styles.gameTeam}>
          <Logo team={g.home} size={124} />
          <b>{g.home?.abbrev}</b><i>{g.home?.record}</i>
        </div>
      </div>

      {homeProb != null && !g.isFinal && (
        <div className={styles.prob}>
          <span>{100 - homeProb}%</span>
          <div className={styles.probBar}><em style={{ width: `${100 - homeProb}%` }} /></div>
          <span>{homeProb}%</span>
        </div>
      )}

      <div className={styles.stats}>
        <Stat label="Line" value={g.spreadLabel} />
        <Stat label="Total" value={g.total} />
        <Stat label="Model total" value={g.projection?.total != null ? g.projection.total.toFixed(1) : null} />
      </div>

      <ul className={`${styles.facts} ${styles.factsFlow}`}>
        <li><span>Quarterbacks</span><b>{qb(g.quarterbacks.away)} vs {qb(g.quarterbacks.home)}</b></li>
        {wx && <li><span>Conditions</span><b>{wx}</b></li>}
        {g.situations[0] && <li><span>Angle</span><b>{g.situations[0].label}{g.situations[0].team ? ` · ${g.situations[0].team}` : ''}</b></li>}
      </ul>

      <section className={`${styles.card} ${styles.verdict}`}>
        <div className={styles.cardLabel}>Maximus verdict</div>
        {g.picks.length > 0 ? (
          <>
            <div className={styles.verdictPick}>{g.picks[0].label} <span>{g.picks[0].priceLabel}</span></div>
            <div className={styles.verdictNote}>Fair price {g.picks[0].fairPrice}. Expected value {g.picks[0].evLabel}.</div>
          </>
        ) : (
          <>
            <div className={styles.verdictPick}>No bet.</div>
            <div className={styles.verdictNote}>The price is fair, so we pass.</div>
          </>
        )}
      </section>
    </Shell>
  );
}

/* ───────────────────────── Receipts: 1 slide ───────────────────────── */

export function NflReceiptsSlide({ data: p, slideNumber, slideTotal, ...rest }) {
  const r = p?.receipts;
  if (!r?.hasGraded) {
    return (
      <Shell payload={p} kicker="NFL · Receipts" slideNumber={slideNumber} slideTotal={slideTotal} rest={rest}>
        <Empty title="No graded picks yet" note="Receipts unlock after the first settled slate. Until then there is nothing honest to post." />
      </Shell>
    );
  }
  const mark = { won: 'W', lost: 'L', push: 'P' };
  return (
    <Shell payload={p} kicker="NFL · Receipts" slideNumber={slideNumber} slideTotal={slideTotal} rest={rest}>
      <div className={styles.kicker}>{r.scope} · published picks only</div>
      <div className={styles.heroRow}>
        <h1 className={styles.record}>{r.recordLabel}</h1>
        <img src="/mascot.png" alt="" className={styles.mascot} {...IMG} onError={hide} />
      </div>
      <div className={styles.stats}>
        <Stat label="Units" value={r.unitsLabel} tone={r.units >= 0 ? 'good' : 'bad'} />
        <Stat label="Return" value={r.roiLabel} tone={r.units >= 0 ? 'good' : 'bad'} />
        <Stat label="Beat the close" value={r.beatCloseLabel} />
      </div>
      <div className={styles.ledger}>
        {r.recent.slice(0, 6).map((k) => (
          <div key={k.id} className={styles.ledgerRow}>
            <span className={`${styles.mark} ${styles[k.status]}`}>{mark[k.status]}</span>
            <span className={styles.ledgerMain}><b>{k.label}</b><i>{k.matchupLabel}{k.priceLabel ? ` · ${k.priceLabel}` : ''}</i></span>
            <span className={styles.ledgerScore}>{k.finalScore}</span>
          </div>
        ))}
      </div>
      <div className={styles.promise}>
        <b>Locked before kickoff. Graded at the posted price.</b>
        <span>The losses stay up.</span>
      </div>
    </Shell>
  );
}

/* ───────────────────────── Team card: 1 slide, one per team ───────────────────────── */

export function NflTeamSlide({ data: p, slideNumber, slideTotal, ...rest }) {
  const t = p?.team;
  if (!t) {
    return (
      <Shell payload={p} kicker="NFL · Team card" slideNumber={slideNumber} slideTotal={slideTotal} rest={rest}>
        <Empty title="Pick a team" note="Choose a team in the controls." />
      </Shell>
    );
  }
  const n = t.next;
  return (
    <Shell payload={p} kicker={`NFL · ${p.slateLabel}`} slideNumber={slideNumber} slideTotal={slideTotal} rest={rest}>
      <div className={styles.kicker}>{t.standingLabel || 'Team card'}{t.streak ? ` · ${t.streak}` : ''}</div>
      <div className={styles.teamHead}>
        <Logo team={t} size={190} />
        <div>
          <h1 className={styles.teamName}>{t.nickname}</h1>
          <div className={styles.teamRecord}>{t.record}</div>
        </div>
      </div>
      <div className={styles.stats}>
        <Stat label="Make the playoffs" value={t.playoffLabel} tone={t.playoffPct >= 0.5 ? 'good' : undefined} />
        <Stat label="Projected wins" value={t.projectedWinsLabel} />
        <Stat label="Super Bowl" value={t.titleOddsLabel} />
      </div>
      <ul className={`${styles.facts} ${styles.factsFlow} ${styles.factsRoomy}`}>
        {t.seedLabel && <li><span>If the playoffs started today</span><b>{t.seedLabel}</b></li>}
        {t.powerRank && <li><span>Maximus power rank</span><b>{t.powerRank} of 32</b></li>}
        {t.pointDiffLabel && <li><span>Point differential</span><b>{t.pointDiffLabel}</b></li>}
        {t.lastResult && <li><span>Last game</span><b>{t.lastResult}</b></li>}
      </ul>
      <section className={`${styles.card} ${styles.verdict}`}>
        <div className={styles.cardLabel}>{n ? `Next · ${n.kickoffLabel || ''}` : 'This week'}</div>
        {n ? (
          <>
            <div className={styles.verdictPick}>
              {n.isHome ? 'vs' : 'at'} {n.opponent?.abbrev} <span>{[n.spreadLabel, n.total != null ? `total ${n.total}` : null].filter(Boolean).join(' · ')}</span>
            </div>
            <div className={styles.verdictNote}>
              {n.winPct ? `${n.winPct} to win. ` : ''}{n.pick ? `Our bet: ${n.pick.label} (${n.pick.priceLabel}).` : 'No bet here. The price is fair.'}
            </div>
          </>
        ) : (
          <div className={styles.verdictPick}>{t.onBye ? 'Bye week.' : 'No game listed.'}</div>
        )}
      </section>
    </Shell>
  );
}

/* ───────────────────────── Weekly review: what the model got wrong ───────────────────────── */

export function NflReviewSlide({ data: p, slideNumber, slideTotal, ...rest }) {
  const r = p?.review;
  if (!r || r.finals === 0) {
    return (
      <Shell payload={p} kicker="NFL · The review" slideNumber={slideNumber} slideTotal={slideTotal} rest={rest}>
        <Empty title="No finals yet" note="The review unlocks after the first finished game of the week." />
      </Shell>
    );
  }
  return (
    <Shell payload={p} kicker="NFL · The review" slideNumber={slideNumber} slideTotal={slideTotal} rest={rest}>
      <div className={styles.kicker}>{p.slateLabel} · projections against results</div>
      <h1 className={`${styles.h1} ${styles.h1Cover}`}>
        What we<br /><span className={styles.accent}>got wrong.</span>
      </h1>
      <div className={styles.stats}>
        <Stat label="Winners called" value={`${r.rightSide} of ${r.finals}`} />
        <Stat label="Average miss" value={r.avgMiss != null ? `${r.avgMiss} pts` : null} />
        <Stat label="Losing bets" value={r.lostPicks.length} tone={r.lostPicks.length ? 'bad' : 'good'} />
      </div>
      <div className={styles.ledger}>
        {r.misses.map((m) => (
          <div key={m.id} className={`${styles.ledgerRow} ${styles.reviewRow}`}>
            <span className={`${styles.mark} ${m.rightSide ? styles.push : styles.lost}`}>{Math.round(m.missPts)}</span>
            <span className={styles.ledgerMain}><b>{m.matchupLabel}</b><i>We said {m.projected}</i></span>
            <span className={styles.ledgerScore}>{m.actual}</span>
          </div>
        ))}
      </div>
      {r.lostPicks.length > 0 && r.misses.length <= 2 && (
        <section className={styles.card}>
          <div className={styles.cardLabel}>Bets that lost</div>
          {r.lostPicks.map((k) => (
            <div key={k.id} className={styles.passNote}>{k.label} ({k.priceLabel}), {k.finalScore || k.matchupLabel}</div>
          ))}
        </section>
      )}
      <div className={styles.promise}>
        <b>The number in the box is how many points we missed the margin by.</b>
        <span>We post the misses the same way we post the wins.</span>
      </div>
    </Shell>
  );
}

/* ───────────────────────── Explainer: evergreen, saveable ───────────────────────── */

export function NflExplainerSlide({ data: p, slideNumber, slideTotal, ...rest }) {
  const e = p?.explainer;
  if (!e) return null;
  return (
    <Shell payload={p} kicker="Maximus explains" slideNumber={slideNumber} slideTotal={slideTotal} rest={rest}>
      <div className={styles.kicker}>{e.kicker}</div>
      <div className={styles.heroRow}>
        <h1 className={`${styles.h1} ${styles.h1Wrap}`}>{e.title}</h1>
        <img src="/mascot.png" alt="" className={styles.mascot} {...IMG} onError={hide} />
      </div>
      <section className={`${styles.why} ${styles.explain}`}>
        <ol>
          {e.points.map((point, i) => <li key={i}>{point}</li>)}
        </ol>
      </section>
      {e.example && (
        <section className={styles.card}>
          <div className={styles.cardLabel}>For example</div>
          <div className={styles.passNote}>{e.example}</div>
        </section>
      )}
      <div className={styles.promise}>
        <b>{e.closer}</b>
        <span>Save this for the next time someone calls a bet a lock.</span>
      </div>
    </Shell>
  );
}
