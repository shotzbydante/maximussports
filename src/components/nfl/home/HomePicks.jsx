/**
 * HomePicks — this week's picks on the NFL home page.
 *
 * A recommended pick is a specific book's line and price that beats the
 * market's fair number, so each one shows that price, the chance the bet
 * wins at the fair number next to the chance the price needs, and its
 * expected value. Everything else on the board is a lean: tracked and
 * graded, never recommended.
 *
 *   variant="home"  top play, a rail of the rest, one line for the record
 *   variant="full"  every recommended pick with reasons, then every game
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../../workspaces/WorkspaceContext';
import { fetchNflScorecard } from '../../../api/nfl';
import { getNflTeamBySlug } from '../../../sports/nfl/teams';
import NflLogo from '../NflLogo';
import { SectionHead, Rail, ScoreRing, ModelMarketBars, Chevron } from './HomeParts';
import { kickoffShort } from './format';
import h from './home.module.css';

const ENDPOINT = '/api/nfl/picks/built';
const RAIL_MAX = 6;
const MARKET = { moneyline: 'To win', runline: 'Spread', total: 'Total' };
/** Why a game is held to tracking. A plain "no price edge" needs no chip. */
const HELD_BACK = {
  qb_uncertain: 'Quarterback in doubt',
  injury_feed_down: 'No injury report',
  stale_price: 'Stale price',
  price_outlier: 'Price out of line',
  outside_window: 'Opens 3 days out',
  price_guard: 'Extreme price',
  thin_market: 'Few books',
  data_gap: 'Thin data',
};

const isRecommended = (p) => p?.pickRole === 'hero';
const fmtOdds = (v) => (typeof v === 'number' ? (v > 0 ? `+${v}` : `${v}`) : '');

const nick = (t) => getNflTeamBySlug(t?.slug)?.nickname || t?.shortName || t?.name || '';
const score = (p) => p?.conviction?.score ?? Math.round((p?.betScore?.total || 0) * 100);

function matchupText(p) {
  const m = p.matchup || {};
  const when = kickoffShort(m.startTime);
  return `${nick(m.awayTeam)} at ${nick(m.homeTeam)}${when ? `, ${when}` : ''}`;
}

/**
 * One sentence on why. A recommended pick is about its price; a lean is
 * about where the ratings sit against the market.
 */
function reason(p) {
  const head = p.rationale?.headline || '';
  if (isRecommended(p)) {
    const wind = head.match(/(\d+) mph wind/);
    const fair = fmtOdds(p.fair?.priceAmerican);
    const parts = [];
    if (wind) parts.push(`${wind[1]} mph wind in the forecast`);
    if (fair) parts.push(`${wind ? 'fair' : 'Fair'} price ${fair}`);
    return parts.join(', ');
  }
  const lean = head.match(/^Model lean: .*?\. (.+)$/);
  return lean ? lean[1] : '';
}

/** "-110 at Circa" for spreads and totals; the book alone for a moneyline, whose label is the price. */
function priceText(p) {
  if (p.market?.type === 'moneyline') return p.book?.title ? `At ${p.book.title}` : '';
  return p.selection?.priceLabel || '';
}

function recordText(r) {
  if (!r) return null;
  const n = (r.won || 0) + (r.lost || 0) + (r.push || 0);
  if (n === 0) return null;
  return r.push > 0 ? `${r.won}-${r.lost}-${r.push}` : `${r.won}-${r.lost}`;
}

function Reasons({ pick }) {
  const bullets = pick.rationale?.bullets || [];
  if (bullets.length === 0) return null;
  return (
    <details className={h.why}>
      <summary>Why this pick</summary>
      <ul>{bullets.map((b) => <li key={b}>{b}</li>)}</ul>
    </details>
  );
}

function TopPlay({ pick, to }) {
  const m = pick.matchup || {};
  const Tag = to ? Link : 'div';
  const tagProps = to
    ? { to, 'aria-label': `Top play: ${pick.selection?.label}. Open all picks and results` }
    : {};
  return (
    <Tag className={h.top} {...tagProps}>
      <div className={h.topHead}>
        <span className={h.chipRow}>
          <span className={`${h.chip} ${h.chipInk}`}>Top play</span>
          <span className={h.chip}>{MARKET[pick.market?.type] || 'Pick'}</span>
          {pick.displayMetrics?.edgeValue && (
            <span className={`${h.chip} ${h.chipUp}`}>{pick.displayMetrics.edgeValue} expected value</span>
          )}
        </span>
        <span>{kickoffShort(m.startTime)}</span>
      </div>
      <div className={h.topMain}>
        <div>
          <p className={h.topPick}>{pick.selection?.label}</p>
          {pick.selection?.priceLabel && pick.market?.type !== 'moneyline' && (
            <p className={h.topPrice}>{pick.selection.priceLabel}</p>
          )}
          {pick.market?.type === 'moneyline' && pick.book?.title && (
            <p className={h.topPrice}>at {pick.book.title}</p>
          )}
          <p className={h.topWhy}>{nick(m.awayTeam)} at {nick(m.homeTeam)}{reason(pick) ? `. ${reason(pick)}.` : '.'}</p>
        </div>
        <div>
          <ScoreRing value={score(pick)} />
          <div className={h.ringCaption}>Conviction</div>
        </div>
      </div>
      <ModelMarketBars model={pick.modelProb} market={pick.impliedProb} />
      {!to && <Reasons pick={pick} />}
    </Tag>
  );
}

function PickTile({ pick, to, lean }) {
  const m = pick.matchup || {};
  const side = pick.selection?.side;
  const logoTeam = side === 'home' ? m.homeTeam : side === 'away' ? m.awayTeam : null;
  const Tag = to ? Link : 'article';
  return (
    <Tag {...(to ? { to } : {})} className={h.tile} role="listitem">
      <div className={h.pickTop}>
        <span className={h.chipRow}>
          <span className={h.chip}>{MARKET[pick.market?.type] || 'Pick'}</span>
          {!lean && pick.displayMetrics?.edgeValue && (
            <span className={`${h.chip} ${h.chipUp}`}>{pick.displayMetrics.edgeValue}</span>
          )}
          {lean && <span className={h.chip}>Lean</span>}
          {lean && HELD_BACK[pick.lowSignalReason] && (
            <span className={`${h.chip} ${h.chipWarn}`}>{HELD_BACK[pick.lowSignalReason]}</span>
          )}
        </span>
        <ScoreRing value={score(pick)} small />
      </div>
      <div>
        <div className={h.team}>
          {logoTeam && <NflLogo slug={logoTeam.slug} src={logoTeam.logo} size={24} />}
          <span className={h.pickLabel}>{pick.selection?.label}</span>
        </div>
        <div className={h.pickGame}>
          {priceText(pick) && <b>{priceText(pick)}</b>}
          {priceText(pick) ? '. ' : ''}{matchupText(pick)}
        </div>
      </div>
      <ModelMarketBars model={pick.modelProb} market={pick.impliedProb} />
      {to
        ? reason(pick) && <p className={h.pickWhy}>{reason(pick)}.</p>
        : <Reasons pick={pick} />}
    </Tag>
  );
}

/** Every lean on the board, one block per game. */
function EveryGame({ picks, recommendedIds }) {
  const games = new Map();
  for (const p of picks) {
    if (!games.has(p.gameId)) games.set(p.gameId, []);
    games.get(p.gameId).push(p);
  }
  const order = { runline: 0, moneyline: 1, total: 2 };
  const blocks = [...games.values()].sort((a, b) =>
    Date.parse(a[0].matchup?.startTime || 0) - Date.parse(b[0].matchup?.startTime || 0));
  return (
    <div className={h.gameList}>
      {blocks.map((rows) => {
        const m = rows[0].matchup || {};
        const flag = HELD_BACK[rows.find((r) => r.lowSignalReason)?.lowSignalReason];
        const picked = rows.some((r) => recommendedIds.has(r.id));
        const best = [...rows].sort((a, b) =>
          (recommendedIds.has(b.id) - recommendedIds.has(a.id)) || (score(b) - score(a)))[0];
        return (
          <details key={rows[0].gameId} className={`${h.card} ${h.cardFlush}`}>
            <summary className={h.leanHead}>
              <span>
                <span className={h.teamName}>{nick(m.awayTeam)} at {nick(m.homeTeam)}</span>
                <span className={h.leanSub}>
                  <span className={h.small}>{kickoffShort(m.startTime)}</span>
                  {picked && <span className={`${h.chip} ${h.chipUp}`}>Recommended</span>}
                  {!picked && flag && <span className={`${h.chip} ${h.chipWarn}`}>{flag}</span>}
                </span>
              </span>
              {picked
                ? <span className={h.leanBest}>{best.selection?.label}</span>
                : <span className={h.leanNone}>Leans only</span>}
              <span className={h.leanCaret}><Chevron size={12} /></span>
            </summary>
            {[...rows].sort((a, b) => (order[a.market?.type] ?? 9) - (order[b.market?.type] ?? 9)).map((p) => (
              <div key={p.id} className={h.leanRow}>
                <span className={h.small}>{MARKET[p.market?.type]}</span>
                <span className={h.leanPick}>
                  {p.selection?.label}
                  {recommendedIds.has(p.id) && <span className={`${h.chip} ${h.chipUp}`}>{p.displayMetrics?.edgeValue || 'Recommended'}</span>}
                </span>
                <span className={h.leanNum}>
                  {p.market?.type !== 'moneyline' && fmtOdds(p.market?.priceAmerican)}
                  {p.book?.title && <span className={h.small}> {p.book.title}</span>}
                </span>
                <span className={h.leanScore} aria-label={`Conviction ${score(p)}`}>{score(p)}</span>
              </div>
            ))}
          </details>
        );
      })}
    </div>
  );
}

export default function HomePicks({ variant = 'home' }) {
  const full = variant === 'full';
  const { buildPath } = useWorkspace();
  const [board, setBoard] = useState(undefined);
  const [card, setCard] = useState(null);
  const insights = buildPath('/insights');

  useEffect(() => {
    let cancelled = false;
    fetch(ENDPOINT)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setBoard(d || null); })
      .catch(() => { if (!cancelled) setBoard(null); });
    fetchNflScorecard().then((d) => { if (!cancelled) setCard(d); });
    return () => { cancelled = true; };
  }, []);

  const tiers = board?.tiers || {};
  const recommended = [...(tiers.tier1 || []), ...(tiers.tier2 || []), ...(tiers.tier3 || [])]
    .sort((a, b) => score(b) - score(a));
  const recommendedIds = new Set(recommended.map((p) => p.id));
  const leans = (board?.fullSlatePicks || board?.coverage || [])
    .filter((p) => !recommendedIds.has(p.id))
    .sort((a, b) => score(b) - score(a));

  const top = recommended[0] || null;
  const rest = recommended.slice(1, 1 + RAIL_MAX);
  const showLeans = recommended.length === 0 && leans.length > 0;
  const total = recommended.length + leans.length;

  const season = recordText(card?.season?.record);
  const recent = recordText(card?.record);
  const picked = recordText(card?.byPickRole?.hero);

  if (full) {
    return (
      <>
        <section className={h.section} aria-label="Recommended picks">
          <SectionHead title="Recommended" count={recommended.length > 0 ? recommended.length : null} />
          {board === undefined ? (
            <div className={h.skeleton} aria-busy="true" />
          ) : recommended.length === 0 ? (
            <div className={h.empty}>
              <b>{total === 0 ? 'No picks yet this week' : 'Nothing recommended right now'}</b>
              {total === 0
                ? 'Picks are recommended and locked inside three days of kickoff, once enough books have posted lines.'
                : 'No book is beating the market’s fair price by enough. Every game’s leans are below, tracked and graded.'}
            </div>
          ) : (
            <>
              <TopPlay pick={top} />
              {recommended.length > 1 && (
                <div className={h.stack} role="list">
                  {recommended.slice(1).map((p) => <PickTile key={p.id} pick={p} />)}
                </div>
              )}
            </>
          )}
        </section>

        {total > 0 && (
          <section className={h.section} aria-label="Every game">
            <SectionHead title="Every game" />
            <p className={h.sectionNote}>
Open a game for its spread, winner and total, each with the best price on the board and
              a conviction score out of 100. Only the picks marked with an expected value beat the market’s
              fair price. The rest are the ratings’ leans: saved and graded, never recommended.
            </p>
            <EveryGame picks={board.fullSlatePicks || [...recommended, ...leans]} recommendedIds={recommendedIds} />
          </section>
        )}
      </>
    );
  }

  return (
    <section className={h.section} aria-label="This week's picks">
      <SectionHead
        title="Picks"
        count={recommended.length > 0 ? `${recommended.length} recommended` : null}
        to={insights}
        moreLabel="All picks and results"
      />

      {board === undefined ? (
        <div className={h.skeleton} aria-busy="true" />
      ) : total === 0 ? (
        <div className={h.empty}>
          <b>No picks yet this week</b>
          Picks are recommended and locked inside three days of kickoff, once enough books have posted lines.
        </div>
      ) : (
        <>
          {top && <TopPlay pick={top} to={insights} />}
          {rest.length > 0 && (
            <Rail label="More recommended picks" cap={6}>
              {rest.map((p) => <PickTile key={p.id} pick={p} to={insights} />)}
            </Rail>
          )}
          {showLeans && (
            <>
              <p className={h.sectionNote}>
                No book is beating the market’s fair price by enough to recommend a bet right now.
                These are the ratings’ strongest leans. They are tracked and graded, not recommended.
              </p>
              <Rail label="Model leans" cap={6}>
                {leans.slice(0, RAIL_MAX).map((p) => <PickTile key={p.id} pick={p} to={insights} lean />)}
              </Rail>
            </>
          )}
        </>
      )}

      {(season || recent) ? (
        <Link to={insights} className={h.recordLine}>
          {recent && <span><b>{recent}</b> last 9 days</span>}
          {picked && <span><b>{picked}</b> recommended</span>}
          {season && <span><b>{season}</b> season</span>}
        </Link>
      ) : card !== null && total > 0 ? (
        <p className={h.fine}>
          No results yet. A recommended pick is locked at its line, price and book, then graded against the final score.
        </p>
      ) : null}

      {!showLeans && leans.length > 0 && (
        <Link to={insights} className={h.more} style={{ marginLeft: 0, alignSelf: 'flex-start' }}>
          <span>See every game’s leans and prices</span>
          <span className={h.moreIcon}><Chevron /></span>
        </Link>
      )}
    </section>
  );
}
