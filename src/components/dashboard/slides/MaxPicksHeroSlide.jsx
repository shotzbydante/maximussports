import PicksSlideShell from './PicksSlideShell';
import TeamLogo from '../../shared/TeamLogo';
import { getTeamSlug } from '../../../utils/teamSlug';
import { buildMaximusPicks } from '../../../utils/maximusPicksModel';
import {
  getSlideColors, getConfidenceLabel, getBarBlocks, getEdgeText,
  getEditorialLine, getMaximusTake, getModelEdgeDisplay,
} from '../../../utils/confidenceSystem';
import MaximusTakeCard from '../../shared/MaximusTakeCard';
import styles from './MaxPicksHeroSlide.module.css';

function makeTeamObj(name) {
  if (!name) return null;
  return { name: name.replace(/^(?:The |the )/, '').trim(), slug: getTeamSlug(name) };
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
  const edgeData = getModelEdgeDisplay(pick);

  const opponentLabel = !isTot && pick.opponentTeam
    ? `vs ${pick.opponentTeam}`
    : (isTot ? `${pick.awayTeam} vs ${pick.homeTeam}` : null);

  return (
    <div className={styles.pickRow}>
      <div className={styles.pickMain}>
        <span className={styles.pickRank}>#{rank}</span>
        <div className={styles.pickLogos}>
          {isTot ? (
            <>
              {awayObj && <TeamLogo team={awayObj} size={26} />}
              {homeObj && <TeamLogo team={homeObj} size={26} />}
            </>
          ) : (
            teamObj && <TeamLogo team={teamObj} size={28} />
          )}
        </div>
        <span className={styles.pickLine}>{pick.pickLine || '—'}</span>
        <span
          className={styles.pickConf}
          style={{ background: cs.bg, color: cs.text, borderColor: cs.border }}
        >
          {getConfidenceLabel(pick.confidence)}
        </span>
        <MiniEdge pick={pick} />
      </div>
      {opponentLabel && <div className={styles.pickMatchup}>{opponentLabel}</div>}
      {edgeData && (
        <div className={styles.pickEdge}>
          {edgeData.lines.map((l) => (
            <span key={l.label} className={styles.edgeStat}>
              <span className={styles.edgeStatLabel}>{l.label} </span>
              <span className={styles.edgeStatValue}>{l.value}</span>
            </span>
          ))}
        </div>
      )}
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
  const tot = picks.totalsPicks  ?? [];

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
  const allPicks = [...pe, ...ats, ...val, ...tot];

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
              [totalSignals, 'Signals Today'],
              [leanCt(pe), "Pick 'Ems"],
              [leanCt(ats), 'Spread Edges'],
              [leanCt(val), 'Value Spots'],
              [leanCt(tot), 'Total Signals'],
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

          {getMaximusTake(allPicks) ? (
            <div className={styles.takeStrip}>
              <MaximusTakeCard allPicks={allPicks} variant="slide" />
            </div>
          ) : (
            <div className={styles.edgeNote}>
              Higher bar = stronger model signal vs the market
            </div>
          )}
        </>
      )}
    </PicksSlideShell>
  );
}
