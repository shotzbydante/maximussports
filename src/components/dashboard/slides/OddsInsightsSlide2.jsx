import SlideShell from './SlideShell';
import TeamLogo from '../../shared/TeamLogo';
import { getTeamSlug } from '../../../utils/teamSlug';
import styles from './OddsInsightsSlide2.module.css';
import { buildMaximusPicks } from '../../../utils/maximusPicksModel';
import { getSlideColors, getConfidenceLabel } from '../../../utils/confidenceSystem';

function makeTeamObj(name) {
  if (!name) return null;
  const cleaned = name.replace(/^(?:The |the )/, '').trim();
  return { name: cleaned, slug: getTeamSlug(cleaned) };
}

function buildAtsRationale(pick) {
  if (pick.whyValue) return pick.whyValue;
  const conf = getConfidenceLabel(pick.confidence);
  if (conf === 'HIGH') return 'Strong cover profile gives this side a clear edge. Market still looks light.';
  if (conf === 'MEDIUM') return 'Recent cover trend is solid and the number looks a bit off.';
  return 'Slight lean based on ATS form. Watch for line movement closer to tip.';
}

function PickRow({ pick }) {
  const cs = getSlideColors(pick.confidence);
  const teamObj = makeTeamObj(pick.pickTeam);
  const rationale = buildAtsRationale(pick);
  return (
    <div className={styles.pickRow}>
      <div className={styles.pickTop}>
        <span className={styles.pickType}>SPREAD</span>
        <span
          className={styles.confBadge}
          style={{ background: cs.bg, color: cs.text, border: `1px solid ${cs.border}` }}
        >
          {getConfidenceLabel(pick.confidence)}
        </span>
      </div>
      <div className={styles.pickTeamRow}>
        {teamObj && <TeamLogo team={teamObj} size={30} />}
        <div className={styles.pickLine}>{pick.pickLine || '—'}</div>
      </div>
      {pick.opponentTeam && (
        <div className={styles.vsLine}>vs {pick.opponentTeam}</div>
      )}
      <div className={styles.whyValue}>{rationale}</div>
      {pick.slipTips?.length > 0 && (
        <div className={styles.slipTip}>{pick.slipTips[0]}</div>
      )}
    </div>
  );
}

function buildMlRationale(pick) {
  if (pick.whyValue) return pick.whyValue;
  const conf = getConfidenceLabel(pick.confidence);
  if (conf === 'HIGH') return 'Implied probability gap is real. The market hasn\'t fully caught up on this one.';
  if (conf === 'MEDIUM') return 'Model sees a slight pricing edge vs the implied number. Worth a look.';
  return 'Thin value edge on the moneyline. Lean, not a hammer.';
}

function MlPickRow({ pick }) {
  const cs = getSlideColors(pick.confidence);
  const teamObj = makeTeamObj(pick.pickTeam);
  const rationale = buildMlRationale(pick);
  return (
    <div className={styles.pickRow}>
      <div className={styles.pickTop}>
        <span className={`${styles.pickType} ${styles.pickTypeML}`}>ML</span>
        <span className={styles.mlPrice}>{pick.mlPriceLabel}</span>
        <span
          className={styles.confBadge}
          style={{ background: cs.bg, color: cs.text, border: `1px solid ${cs.border}` }}
        >
          {getConfidenceLabel(pick.confidence)}
        </span>
      </div>
      <div className={styles.pickTeamRow}>
        {teamObj && <TeamLogo team={teamObj} size={30} />}
        <div className={styles.pickLine}>{pick.pickTeam || '—'}</div>
      </div>
      {pick.opponentTeam && (
        <div className={styles.vsLine}>vs {pick.opponentTeam}</div>
      )}
      <div className={styles.whyValue}>{rationale}</div>
    </div>
  );
}

/**
 * Slide 2: ATS Leans (4-slide mode) OR ATS+ML combined (3-slide mode).
 * Determined by slideTotal prop.
 */
export default function OddsInsightsSlide2({ data, asOf, slideNumber, slideTotal, options = {}, ...rest }) {
  const { riskMode = 'standard', picksMode = 'top3' } = options;

  const games = data?.picksGames ?? data?.odds?.games ?? [];
  const atsLeaders = data?.atsLeaders ?? { best: [], worst: [] };

  let picks = { atsPicks: [], mlPicks: [] };
  try {
    picks = buildMaximusPicks({ games, atsLeaders });
  } catch { /* ignore */ }

  const maxPicks = picksMode === 'full' ? 5 : 3;

  // ATS picks — no risk filter needed for ATS
  const atsPicks = (picks.atsPicks ?? []).slice(0, maxPicks);

  // ML picks — apply risk mode filter (conservative hides odds > +800)
  let mlPicks = picks.mlPicks ?? [];
  if (riskMode === 'conservative') {
    mlPicks = mlPicks.filter(p => {
      if (!p.mlPriceLabel) return true;
      const n = parseInt(p.mlPriceLabel.replace('+', ''), 10);
      return isNaN(n) || n <= 800;
    });
  }

  const isCombined = !slideTotal || slideTotal <= 3;

  if (isCombined) {
    // Combined mode: 2 ATS + 2 ML
    const atsShow = atsPicks.slice(0, 2);
    const mlShow = mlPicks.slice(0, 2);
    const hasPicks = atsShow.length > 0 || mlShow.length > 0;

    return (
      <SlideShell
        asOf={asOf}
        accentColor="#B7986C"
        brandMode="standard"
        category="odds"
        slideNumber={slideNumber}
        slideTotal={slideTotal}
        rest={rest}
      >
        <div className={styles.titleSup}>ODDS INSIGHTS · SLIDE {slideNumber ?? 2}</div>
        <h2 className={styles.title}>Spread + ML<br />Leans</h2>
        <div className={styles.divider} />

        {!hasPicks ? (
          <div className={styles.empty}>No qualified leans available yet.</div>
        ) : (
          <div className={styles.combinedGrid}>
            {atsShow.length > 0 && (
              <div className={styles.colSection}>
                <div className={styles.colLabel}>AGAINST THE SPREAD</div>
                <div className={styles.picksList}>
                  {atsShow.map((p, i) => <PickRow key={i} pick={p} />)}
                </div>
              </div>
            )}
            {mlShow.length > 0 && (
              <div className={styles.colSection}>
                <div className={styles.colLabel}>ML LEANS</div>
                <div className={styles.picksList}>
                  {mlShow.map((p, i) => <MlPickRow key={i} pick={p} />)}
                </div>
              </div>
            )}
          </div>
        )}

        <div className={styles.disclaimer}>Algorithmic leans. Not financial advice.</div>
      </SlideShell>
    );
  }

  // 4-slide mode: ATS only
  return (
    <SlideShell
      asOf={asOf}
      accentColor="#B7986C"
      brandMode="standard"
      category="odds"
      slideNumber={slideNumber}
      slideTotal={slideTotal}
      rest={rest}
    >
      <div className={styles.titleSup}>ODDS INSIGHTS · SLIDE {slideNumber ?? 2}</div>
      <h2 className={styles.title}>Against the<br />Spread Leans</h2>
      <div className={styles.divider} />

      {atsPicks.length === 0 ? (
        <div className={styles.empty}>No ATS leans qualify today.</div>
      ) : (
        <div className={styles.picksList}>
          {atsPicks.slice(0, 3).map((p, i) => <PickRow key={i} pick={p} />)}
        </div>
      )}

      <div className={styles.disclaimer}>Algorithmic leans. Not financial advice.</div>
    </SlideShell>
  );
}
