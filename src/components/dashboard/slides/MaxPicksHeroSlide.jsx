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

function parseNum(v) { const n = parseFloat(v); return isNaN(n) ? null : n; }

function mlToImplied(ml) {
  if (ml == null || isNaN(ml)) return null;
  return ml > 0 ? 100 / (ml + 100) : Math.abs(ml) / (Math.abs(ml) + 100);
}

function makeTeamObj(name) {
  if (!name) return null;
  return { name: name.replace(/^(?:The |the )/, '').trim(), slug: getTeamSlug(name) };
}

function findGame(games, pick) {
  return games.find(g => g.homeTeam === pick.homeTeam && g.awayTeam === pick.awayTeam) ?? null;
}

function getPickML(game, team) {
  if (!game?.moneyline) return null;
  const [h, a] = String(game.moneyline).split('/');
  return team === game.homeTeam ? parseNum(h) : parseNum(a);
}

function marketProbForTeam(game, team) {
  if (!game?.moneyline) return null;
  const [h, a] = String(game.moneyline).split('/');
  const hI = mlToImplied(parseNum(h));
  const aI = mlToImplied(parseNum(a));
  if (!hI || !aI) return null;
  const tot = hI + aI;
  return Math.round((team === game.homeTeam ? hI / tot : aI / tot) * 100);
}

const CAT = {
  pickem: { label: "PICK 'EMS",           emoji: '🏀' },
  ats:    { label: 'AGAINST THE SPREAD',  emoji: '📉' },
  value:  { label: 'VALUE LEANS',         emoji: '💰' },
  total:  { label: 'GAME TOTALS',         emoji: '🔢' },
};

/* ── Model Edge Meter ─────────────────────────────────────────── */

function edgePctScale(pick) {
  const e = pick.edgeMag ?? 0;
  const s = { value: 0.12, total: 0.18, ats: 0.25, pickem: 0.18 }[pick.pickType] ?? 0.18;
  return Math.min(Math.round((e / s) * 100), 100);
}

function edgeText(pick) {
  if (pick.pickType === 'value' && pick.edgePp != null) return `+${pick.edgePp}%`;
  return `+${Math.round((pick.edgeMag ?? 0) * 100)}%`;
}

function EdgeMeter({ pick }) {
  const pct = edgePctScale(pick);
  const filled = Math.round(pct / 10);
  return (
    <div className={styles.edgeMeter}>
      <span className={styles.emTitle}>MODEL EDGE</span>
      <div className={styles.emRow}>
        <div className={styles.emBar}>
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className={`${styles.emBlock} ${i < filled ? styles.emBlockOn : ''}`} />
          ))}
        </div>
        <span className={styles.emVal}>{edgeText(pick)}</span>
      </div>
    </div>
  );
}

/* ── Model vs Market ──────────────────────────────────────────── */

function buildMvm(pick, game) {
  if (pick.pickType === 'value' && pick.modelPct != null && pick.marketImpliedPct != null) {
    return {
      mktLbl: 'Win probability', mktVal: `${pick.marketImpliedPct}%`,
      mdlLbl: 'Win probability', mdlVal: `${pick.modelPct}%`,
      edge: `+${pick.edgePp ?? (pick.modelPct - pick.marketImpliedPct)}%`,
    };
  }
  if (pick.pickType === 'pickem' && game) {
    const mkt = marketProbForTeam(game, pick.pickTeam);
    if (mkt != null) {
      const mdl = Math.min(99, mkt + Math.round((pick.edgeMag ?? 0) * 50));
      return {
        mktLbl: 'Win probability', mktVal: `${mkt}%`,
        mdlLbl: 'Win probability', mdlVal: `${mdl}%`,
        edge: `+${mdl - mkt}%`,
      };
    }
  }
  if (pick.pickType === 'ats' && pick.spread != null) {
    const s = pick.spread;
    const proj = s - (pick.edgeMag ?? 0) * 15;
    const f = n => (n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1));
    return {
      mktLbl: 'Market line', mktVal: f(s),
      mdlLbl: 'Model projection', mdlVal: f(proj),
      edge: `+${Math.abs(proj - s).toFixed(1)}`,
    };
  }
  if (pick.pickType === 'total' && pick.lineValue != null) {
    const dir = pick.leanDirection === 'OVER' ? 1 : -1;
    const proj = (pick.lineValue + dir * (pick.edgeMag ?? 0) * 40).toFixed(1);
    return {
      mktLbl: 'Market total', mktVal: String(pick.lineValue),
      mdlLbl: 'Model projection', mdlVal: proj,
      edge: `+${Math.abs(parseFloat(proj) - pick.lineValue).toFixed(1)}`,
    };
  }
  return null;
}

function MvmSection({ mvm }) {
  if (!mvm) return null;
  return (
    <div className={styles.mvm}>
      <div className={styles.mvmCell}>
        <span className={styles.mvmH}>MARKET</span>
        <span className={styles.mvmS}>{mvm.mktLbl}</span>
        <span className={styles.mvmV}>{mvm.mktVal}</span>
      </div>
      <span className={styles.mvmArr}>→</span>
      <div className={styles.mvmCell}>
        <span className={styles.mvmH}>MAXIMUS</span>
        <span className={styles.mvmS}>{mvm.mdlLbl}</span>
        <span className={styles.mvmV}>{mvm.mdlVal}</span>
      </div>
      <div className={styles.mvmEdge}>
        <span className={styles.mvmEH}>EDGE</span>
        <span className={styles.mvmEV}>{mvm.edge}</span>
      </div>
    </div>
  );
}

/* ── Bracket Buster ───────────────────────────────────────────── */

function checkBB(pick, game) {
  if (pick.pickType === 'total') return null;
  const ml = game ? getPickML(game, pick.pickTeam) : null;
  if (ml != null && ml >= 300) {
    const mkt = game ? marketProbForTeam(game, pick.pickTeam) : null;
    let upProb = pick.modelPct;
    if (!upProb && mkt != null) upProb = Math.min(45, mkt + Math.round((pick.edgeMag ?? 0) * 50));
    return { ml, upProb };
  }
  if (pick.modelPct != null && pick.marketImpliedPct != null &&
      pick.modelPct - pick.marketImpliedPct >= 6 && pick.marketImpliedPct < 40) {
    return { ml, upProb: pick.modelPct };
  }
  return null;
}

function BBTag({ bb }) {
  return (
    <div className={styles.bb}>
      <span className={styles.bbIco}>🚨</span>
      <span className={styles.bbLbl}>BRACKET BUSTER</span>
      {bb.upProb != null && <span className={styles.bbP}>Upset prob: {bb.upProb}%</span>}
    </div>
  );
}

/* ── Intelligence Module (one per category) ───────────────────── */

function IntelModule({ pick, game, cat }) {
  const meta = CAT[cat];
  if (!pick) {
    return (
      <div className={styles.modCard}>
        <div className={styles.modHead}>{meta.emoji} {meta.label}</div>
        <div className={styles.modNone}>No qualified leans</div>
      </div>
    );
  }

  const cs = confStyle(pick.confidence);
  const isTot = pick.pickType === 'total';
  const teamObj = !isTot ? makeTeamObj(pick.pickTeam) : null;
  const homeObj = isTot ? makeTeamObj(pick.homeTeam) : null;
  const awayObj = isTot ? makeTeamObj(pick.awayTeam) : null;
  const sigs = (pick.signals || []).slice(0, 3);
  const mvm = buildMvm(pick, game);
  const bb = checkBB(pick, game);

  return (
    <div className={styles.modCard}>
      <div className={styles.modHead}>{meta.emoji} {meta.label}</div>

      {isTot && (
        <div className={styles.modMatch}>
          {awayObj && <TeamLogo team={awayObj} size={16} />}
          {homeObj && <TeamLogo team={homeObj} size={16} />}
          <span className={styles.modMatchText}>{pick.awayTeam} vs {pick.homeTeam}</span>
        </div>
      )}

      <div className={styles.modTeam}>
        {!isTot && teamObj && <TeamLogo team={teamObj} size={22} />}
        <span className={styles.modLine}>{pick.pickLine || '—'}</span>
      </div>

      <span
        className={styles.confBadge}
        style={{ background: cs.bg, color: cs.text, borderColor: cs.border }}
      >
        {confidenceLabel(pick.confidence)}
      </span>

      {sigs.length > 0 && (
        <div className={styles.modSigs}>
          {sigs.map((s, i) => (
            <div key={i} className={styles.sigRow}>
              <span className={styles.sigChk}>✔</span>
              <span className={styles.sigTxt}>{s}</span>
            </div>
          ))}
        </div>
      )}

      <EdgeMeter pick={pick} />
      <MvmSection mvm={mvm} />
      {bb && <BBTag bb={bb} />}
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

  const leanCt = a => a.filter(p => p.itemType === 'lean').length;
  const totalLeans = leanCt(pe) + leanCt(ats) + leanCt(val) + leanCt(tot);
  const totalPicks = pe.length + ats.length + val.length + tot.length;

  const bestLean = arr => {
    const l = arr.filter(p => p.itemType === 'lean');
    return l.length ? l.sort((a, b) => (b.confidence - a.confidence) || (b.edgeMag - a.edgeMag))[0] : null;
  };

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles',
  });

  const categories = ['pickem', 'ats', 'value', 'total'];
  const best = {
    pickem: bestLean(pe),
    ats:    bestLean(ats),
    value:  bestLean(val),
    total:  bestLean(tot),
  };

  return (
    <PicksSlideShell asOf={asOf} slideNumber={slideNumber} slideTotal={slideTotal} rest={rest}>
      <div className={styles.datePill}>{today}</div>
      <div className={styles.titleSup}>MAXIMUS PICKS</div>
      <h2 className={styles.title}>MAXIMUS&apos;S PICKS</h2>
      <div className={styles.subtitle}>Today&apos;s Top Data-Driven Leans</div>
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
              [totalLeans, 'Total Leans'],
              [leanCt(pe), "Pick 'Ems"],
              [leanCt(ats), 'ATS'],
              [leanCt(val), 'Value'],
              [leanCt(tot), 'Totals'],
            ].map(([v, l]) => (
              <div key={l} className={styles.countCell}>
                <span className={styles.countValue}>{v}</span>
                <span className={styles.countLabel}>{l}</span>
              </div>
            ))}
          </div>

          <div className={styles.modsGrid}>
            {categories.map(cat => (
              <IntelModule
                key={cat}
                pick={best[cat]}
                game={best[cat] ? findGame(games, best[cat]) : null}
                cat={cat}
              />
            ))}
          </div>

          <div className={styles.methodNote}>
            Model combines rankings, ATS trends, price inefficiencies, and matchup signals.
          </div>
        </>
      )}
    </PicksSlideShell>
  );
}
