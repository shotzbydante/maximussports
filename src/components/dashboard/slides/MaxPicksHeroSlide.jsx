import PicksSlideShell from './PicksSlideShell';
import TeamLogo from '../../shared/TeamLogo';
import { getTeamSlug } from '../../../utils/teamSlug';
import { buildMaximusPicks } from '../../../utils/maximusPicksModel';
import {
  getSlideColors, getConfidenceLabel, getBarBlocks, getEdgeText,
  getEditorialLine,
} from '../../../utils/confidenceSystem';
import styles from './MaxPicksHeroSlide.module.css';

const ENGAGEMENT_HOOKS = [
  'Which signal do you trust most today?',
  'Which side are you riding tonight?',
  'Do you agree with the model?',
  'Which of these plays would you back?',
  'Where do you see the biggest edge?',
];

function engagementHookForDate() {
  const d = new Date();
  const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  return ENGAGEMENT_HOOKS[dayOfYear % ENGAGEMENT_HOOKS.length];
}

function makeTeamObj(name) {
  if (!name) return null;
  return { name: name.replace(/^(?:The |the )/, '').trim(), slug: getTeamSlug(name) };
}

const MULTI_MASCOTS = [
  'Blue Devils', 'Crimson Tide', 'Tar Heels', 'Golden Eagles',
  'Yellow Jackets', 'Red Raiders', 'Nittany Lions', 'Fighting Irish',
  'Fighting Illini', 'Demon Deacons', 'Sun Devils', 'Green Wave',
  'Wolf Pack', 'Horned Frogs', 'Golden Gophers', 'Golden Bears',
  'Mean Green', 'Thundering Herd', 'Red Storm', 'Running Rebels',
];

function heroDisplayName(fullName) {
  if (!fullName) return '';
  const name = fullName.replace(/^(?:The |the )/, '').trim();
  const parts = name.split(/\s+/);
  if (parts.length <= 1) return name;

  const last2 = parts.slice(-2).join(' ');
  let short;
  if (MULTI_MASCOTS.includes(last2) && parts.length > 2) {
    short = parts.slice(0, -2).join(' ');
  } else {
    short = parts.slice(0, -1).join(' ');
  }

  if (short.length > 15) short = short.replace(/\bState\b/, 'St');
  return short || name;
}

const CAT = {
  pickem: { label: "PICK 'EM",             emoji: '🏀' },
  ats:    { label: 'AGAINST THE SPREAD',   emoji: '📉' },
  value:  { label: 'VALUE LEANS',          emoji: '💰' },
  total:  { label: 'GAME TOTALS',          emoji: '🔢' },
};

/* ── Compact inline edge meter for pick rows ──────────────────── */

function MiniEdge({ pick }) {
  const filled = getBarBlocks(pick);
  const cs = getSlideColors(pick.confidence);
  const h = cs.barHeight ?? 6;
  return (
    <div className={styles.miniEdge}>
      <div className={styles.miniBar}>
        {Array.from({ length: 6 }, (_, i) => (
          <span
            key={i}
            className={`${styles.miniBlock} ${i < filled ? styles.miniOn : ''}`}
            style={
              i < filled
                ? { height: h, background: cs.barFill, boxShadow: `0 0 4px ${cs.barGlow}` }
                : { height: h }
            }
          />
        ))}
      </div>
      <span className={styles.miniVal} style={{ color: cs.text }}>{getEdgeText(pick)}</span>
    </div>
  );
}

/* ── Pick Row — one ranked row per pick ───────────────────────── */

function PickRow({ pick, rank }) {
  const cs = getSlideColors(pick.confidence);
  const isTot = pick.pickType === 'total';
  const teamObj = !isTot ? makeTeamObj(pick.pickTeam) : null;
  const homeObj = isTot ? makeTeamObj(pick.homeTeam) : null;
  const awayObj = isTot ? makeTeamObj(pick.awayTeam) : null;

  const teamDisplay = !isTot ? heroDisplayName(pick.pickTeam) : null;
  const pricePart = !isTot && pick.pickLine && pick.pickTeam && pick.pickLine.length > pick.pickTeam.length
    ? pick.pickLine.slice(pick.pickTeam.length).trim()
    : null;

  const opponentLabel = !isTot && pick.opponentTeam
    ? `vs ${heroDisplayName(pick.opponentTeam)}`
    : (isTot ? `${heroDisplayName(pick.awayTeam)} vs ${heroDisplayName(pick.homeTeam)}` : null);

  return (
    <div className={`${styles.pickRow} ${pick.isTopSignal ? styles.topSignalRow : ''}`}>
      {pick.isTopSignal && (
        <span className={styles.topSignalBadge}>TOP SIGNAL</span>
      )}
      <div className={styles.pickMain}>
        <span className={styles.pickRank}>#{rank}</span>
        <div className={styles.pickLogos}>
          {isTot ? (
            <>
              {awayObj && <TeamLogo team={awayObj} size={24} />}
              {homeObj && <TeamLogo team={homeObj} size={24} />}
            </>
          ) : (
            teamObj && <TeamLogo team={teamObj} size={26} />
          )}
        </div>
        {isTot ? (
          <span className={styles.pickLine}>{pick.pickLine || '—'}</span>
        ) : (
          <>
            <span className={styles.pickLine}>{teamDisplay || '—'}</span>
            {pricePart && <span className={styles.pickPrice}>{pricePart}</span>}
          </>
        )}
        <span
          className={styles.pickConf}
          style={{ background: cs.bg, color: cs.text, borderColor: cs.border }}
        >
          {getConfidenceLabel(pick.confidence)}
        </span>
        <MiniEdge pick={pick} />
      </div>
      {opponentLabel && <div className={styles.pickMatchup}>{opponentLabel}</div>}
      <div className={styles.pickExplain}>{getEditorialLine(pick)}</div>
    </div>
  );
}

/* ── Intelligence Module — shows top 3 picks per category ─────── */

function IntelModule({ picks, cat }) {
  const meta = CAT[cat];

  return (
    <div className={styles.modCard}>
      <div className={styles.modHead}>
        <span className={styles.modEmoji}>{meta.emoji}</span>
        <span className={styles.modLabel}>{meta.label}</span>
      </div>
      {picks.length === 0 ? (
        <div className={styles.modNone}>No qualified leans</div>
      ) : (
        <div className={styles.modRows}>
          {picks.map((p, i) => (
            <PickRow key={p.key || i} pick={p} rank={i + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main slide export ────────────────────────────────────────── */

export default function MaxPicksHeroSlide({ data, asOf, slideNumber, slideTotal, options = {}, ...rest }) {
  const games      = data?.odds?.games ?? [];
  const atsLeaders = data?.atsLeaders ?? { best: [], worst: [] };
  const rankMap    = data?.rankMap ?? {};
  const champOdds  = data?.championshipOdds ?? {};

  let picks = { pickEmPicks: [], atsPicks: [], valuePicks: [], totalsPicks: [] };
  try { picks = buildMaximusPicks({ games, atsLeaders, rankMap, championshipOdds: champOdds }); } catch { /* ignore */ }

  const pe  = picks.pickEmPicks  ?? [];
  const ats = picks.atsPicks     ?? [];
  const val = picks.valuePicks   ?? [];
  const tot = (picks.totalsPicks ?? []).filter(p => p.leanDirection);

  const topLeans = (arr, n = 3) =>
    arr.filter(p => p.itemType === 'lean')
       .sort((a, b) => (b.confidence - a.confidence) || (b.edgeMag - a.edgeMag))
       .slice(0, n);

  const peTop  = topLeans(pe);
  const atsTop = topLeans(ats);
  const valTop = topLeans(val);
  const totTop = topLeans(tot);

  const leanCt = a => a.filter(p => p.itemType === 'lean').length;
  const totalSignals = leanCt(pe) + leanCt(ats) + leanCt(val) + leanCt(tot);
  const totalPicks = pe.length + ats.length + val.length + tot.length;

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles',
  });

  return (
    <PicksSlideShell asOf={asOf} slideNumber={slideNumber} slideTotal={slideTotal} rest={rest} hideMascot>
      {/* ── Title row with mascot icon ── */}
      <div className={styles.heroHeader}>
        <img
          src="/mascot.png"
          alt=""
          className={styles.heroMascot}
          crossOrigin="anonymous"
        />
        <div className={styles.heroTitleBlock}>
          <div className={styles.datePill}>{today}</div>
          <h2 className={styles.title}>MAXIMUS&apos;S PICKS</h2>
          <div className={styles.subtitle}>Today&apos;s Top Data-Driven Leans</div>
        </div>
      </div>
      <div className={styles.divider} />

      {totalPicks === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📊</div>
          <p className={styles.emptyTitle}>No qualified leans today</p>
          <p className={styles.emptyText}>
            The model found no edges meeting its threshold. Check back closer to tip-off.
          </p>
        </div>
      ) : (
        <>
          <div className={styles.countGrid}>
            {[
              [totalSignals, 'Leans Today'],
              [leanCt(pe), "Pick 'Ems"],
              [leanCt(ats), 'Spread Edges'],
              [leanCt(val), 'Value Spots'],
              [leanCt(tot), 'Totals'],
            ].map(([v, l]) => (
              <div key={l} className={styles.countCell}>
                <span className={styles.countValue}>{v}</span>
                <span className={styles.countLabel}>{l}</span>
              </div>
            ))}
          </div>

          <div className={styles.modsGrid}>
            <IntelModule picks={peTop} cat="pickem" />
            <IntelModule picks={atsTop} cat="ats" />
            <IntelModule picks={valTop} cat="value" />
            <IntelModule picks={totTop} cat="total" />
          </div>

          <div className={styles.engagementHook}>
            {engagementHookForDate()}
          </div>
        </>
      )}
    </PicksSlideShell>
  );
}
