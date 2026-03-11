import PicksSlideShell from './PicksSlideShell';
import TeamLogo from '../../shared/TeamLogo';
import { getTeamSlug } from '../../../utils/teamSlug';
import { buildMaximusPicks, confidenceLabel } from '../../../utils/maximusPicksModel';
import styles from './MaxPicksHeroSlide.module.css';

const CONF_COLOR = {
  high:   { bg: 'rgba(45,138,110,0.22)', text: '#2d8a6e', border: 'rgba(45,138,110,0.40)' },
  medium: { bg: 'rgba(183,152,108,0.22)', text: '#B7986C', border: 'rgba(183,152,108,0.40)' },
  low:    { bg: 'rgba(60,121,180,0.15)', text: '#3C79B4', border: 'rgba(60,121,180,0.30)' },
};

function confStyle(l) {
  return CONF_COLOR[l >= 2 ? 'high' : l >= 1 ? 'medium' : 'low'];
}

function makeTeamObj(name) {
  if (!name) return null;
  return { name: name.replace(/^(?:The |the )/, '').trim(), slug: getTeamSlug(name) };
}

function edgePctScale(pick) {
  const e = pick.edgeMag ?? 0;
  const s = { value: 0.12, total: 0.18, ats: 0.25, pickem: 0.18 }[pick.pickType] ?? 0.18;
  return Math.min(Math.round((e / s) * 100), 100);
}

function edgeText(pick) {
  if (pick.pickType === 'value' && pick.edgePp != null) return `+${pick.edgePp}%`;
  return `+${Math.round((pick.edgeMag ?? 0) * 100)}%`;
}

function editorialLine(pick) {
  const c = pick.confidence;
  switch (pick.pickType) {
    case 'pickem':
      if (c >= 2) return 'Strong model conviction — significant edge detected';
      if (c >= 1) return 'Model sees value the market may be underrating';
      return 'Marginal edge — market price looks close to fair';
    case 'ats':
      if (c >= 2) return 'ATS trends strongly favor this side to cover';
      if (c >= 1) return 'Recent form suggests a cover opportunity';
      return 'Directional lean — spread value at the margin';
    case 'value':
      if (c >= 2) return 'Model sees significantly more value than the market';
      if (c >= 1) return 'Moderate value gap between model and market price';
      return 'Price looks efficient but edge still qualifies';
    case 'total':
      if (pick.leanDirection === 'OVER') {
        if (c >= 2) return 'Strongest scoring environment on the board';
        if (c >= 1) return 'Scoring trends point toward the over';
        return 'Combined tempo leans toward higher scoring';
      }
      if (c >= 2) return 'Defensive matchup strongly favors the under';
      if (c >= 1) return 'Scoring pace suggests total may be set too high';
      return 'Marginal lean toward lower-scoring outcome';
    default:
      return 'Model edge detected';
  }
}

const CAT = {
  pickem: { label: "PICK 'EM",             emoji: '🏀' },
  ats:    { label: 'AGAINST THE SPREAD',   emoji: '📉' },
  value:  { label: 'VALUE LEANS',          emoji: '💰' },
  total:  { label: 'GAME TOTALS',          emoji: '🔢' },
};

/* ── Compact inline edge meter for pick rows ──────────────────── */

function MiniEdge({ pick }) {
  const pct = edgePctScale(pick);
  const filled = Math.max(1, Math.round((pct / 100) * 6));
  return (
    <div className={styles.miniEdge}>
      <div className={styles.miniBar}>
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className={`${styles.miniBlock} ${i < filled ? styles.miniOn : ''}`} />
        ))}
      </div>
      <span className={styles.miniVal}>{edgeText(pick)}</span>
    </div>
  );
}

/* ── Pick Row — one ranked row per pick ───────────────────────── */

function PickRow({ pick, rank }) {
  const cs = confStyle(pick.confidence);
  const isTot = pick.pickType === 'total';
  const teamObj = !isTot ? makeTeamObj(pick.pickTeam) : null;
  const homeObj = isTot ? makeTeamObj(pick.homeTeam) : null;
  const awayObj = isTot ? makeTeamObj(pick.awayTeam) : null;

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
          {confidenceLabel(pick.confidence)}
        </span>
        <MiniEdge pick={pick} />
      </div>
      <div className={styles.pickExplain}>{editorialLine(pick)}</div>
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

          <div className={styles.edgeNote}>
            Higher bar = stronger model signal vs the market
          </div>
        </>
      )}
    </PicksSlideShell>
  );
}
