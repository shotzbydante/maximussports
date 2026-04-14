/**
 * NBA Bracketology — premium dark-mode playoff bracket.
 * West left, East right, NBA Finals center.
 * Black + gold hero surface.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { NBA_PLAYOFF_YEAR } from '../../config/nbaBracketology';
import { buildFullNbaBracket, applyPicksToBracket } from '../../data/nba/playoffBracket';
import { resolveFullNbaBracket, simulateNbaBracket } from '../../utils/nbaSeriesResolver';
import { fetchNbaChampionshipOdds } from '../../api/nbaChampionshipOdds';
import { getNbaEspnLogoUrl } from '../../utils/espnNbaLogos';
import { NBA_TEAMS } from '../../sports/nba/teams';
import styles from './NbaBracketology.module.css';

const slugToName = Object.fromEntries(NBA_TEAMS.map(t => [t.slug, t.shortName || t.name]));

/* ── Series Card ── */
function SeriesCard({ matchup, prediction, userPick, onPick }) {
  if (!matchup) return null;
  const { topTeam, bottomTeam, matchupId, status, seriesScore, spread, network, startDate } = matchup;
  const isWaiting = status === 'waiting';
  const topPicked = userPick === 'top';
  const btmPicked = userPick === 'bottom';

  function pick(pos) {
    if (isWaiting) return;
    const t = pos === 'top' ? topTeam : bottomTeam;
    if (!t || t.isPlaceholder) return;
    onPick(matchupId, pos);
  }

  return (
    <div className={`${styles.card} ${isWaiting ? styles.cardWaiting : ''}`}>
      {spread && <span className={styles.spread}>{spread}</span>}

      <button type="button" className={`${styles.slot} ${topPicked ? styles.slotPicked : ''}`}
        onClick={() => pick('top')} disabled={isWaiting || topTeam?.isPlaceholder}>
        {topTeam?.logo && <img src={topTeam.logo} alt="" className={styles.slotLogo} />}
        <span className={styles.seed}>{topTeam?.seed ?? ''}</span>
        <span className={styles.slotName}>{topTeam?.shortName || topTeam?.name || 'TBD'}</span>
        {seriesScore && !topTeam?.isPlaceholder && <span className={styles.wins}>{seriesScore.top}</span>}
      </button>

      <button type="button" className={`${styles.slot} ${btmPicked ? styles.slotPicked : ''}`}
        onClick={() => pick('bottom')} disabled={isWaiting || bottomTeam?.isPlaceholder}>
        {bottomTeam?.logo && <img src={bottomTeam.logo} alt="" className={styles.slotLogo} />}
        <span className={styles.seed}>{bottomTeam?.seed ?? ''}</span>
        <span className={styles.slotName}>{bottomTeam?.shortName || bottomTeam?.name || 'TBD'}</span>
        {seriesScore && !bottomTeam?.isPlaceholder && <span className={styles.wins}>{seriesScore.bottom}</span>}
      </button>

      <div className={styles.cardMeta}>
        {startDate && <span className={styles.metaDate}>{startDate}</span>}
        {network && <span className={styles.metaNet}>{network}</span>}
        {prediction && <span className={styles.metaPred}>{prediction.seriesCall}</span>}
      </div>
    </div>
  );
}

/* ── Main Page ── */
export default function NbaBracketology() {
  const [picks, setPicks] = useState({});
  const [predictions, setPredictions] = useState({});
  const [odds, setOdds] = useState({});
  const [simResults, setSimResults] = useState(null);
  const [simRunning, setSimRunning] = useState(false);

  useEffect(() => {
    fetchNbaChampionshipOdds().then(d => setOdds(d.odds || {})).catch(() => {});
  }, []);

  const context = useMemo(() => ({ championshipOdds: odds }), [odds]);
  const rawBracket = useMemo(() => buildFullNbaBracket(), []);
  const allMatchups = useMemo(() => applyPicksToBracket(rawBracket, picks), [rawBracket, picks]);

  // Regenerate predictions whenever picks or odds change
  useEffect(() => {
    const { predictions: preds } = resolveFullNbaBracket(allMatchups, context);
    setPredictions(preds);
  }, [allMatchups, context]);

  const handlePick = useCallback((matchupId, position) => {
    setPicks(prev => {
      const next = { ...prev, [matchupId]: position };
      // Cascade-clear all downstream picks
      const queue = [matchupId];
      const cleared = new Set();
      while (queue.length > 0) {
        const cur = queue.pop();
        for (const [id, m] of Object.entries(rawBracket)) {
          if ((m.topSourceId === cur || m.bottomSourceId === cur) && !cleared.has(id)) {
            delete next[id];
            cleared.add(id);
            queue.push(id);
          }
        }
      }
      return next;
    });
  }, [rawBracket]);

  const handleMaximus = useCallback(() => {
    // Resolve from the RAW bracket (not user-picks bracket) so TBD-free matchups still get picked
    const { picks: modelPicks } = resolveFullNbaBracket(
      applyPicksToBracket(rawBracket, {}), context
    );
    setPicks(modelPicks);
  }, [rawBracket, context]);

  const handleSimulate = useCallback(() => {
    setSimRunning(true);
    setTimeout(() => {
      const results = simulateNbaBracket(rawBracket, context, 1000);
      setSimResults(results);
      setSimRunning(false);
    }, 50);
  }, [rawBracket, context]);

  const getMatchups = (conference, round) =>
    Object.values(allMatchups)
      .filter(m => m.conference === conference && m.round === round)
      .sort((a, b) => a.position - b.position);

  const finals = allMatchups['finals'];
  const champion = finals && picks['finals']
    ? (picks['finals'] === 'top' ? finals.topTeam : finals.bottomTeam)
    : null;

  const simChamps = useMemo(() => {
    if (!simResults) return [];
    return Object.entries(simResults.champCounts)
      .map(([slug, count]) => ({ slug, name: slugToName[slug] || slug.toUpperCase(), pct: Math.round(count / simResults.numSims * 1000) / 10, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [simResults]);

  // Conference champion probabilities from sim
  const confChamps = useMemo(() => {
    if (!simResults) return null;
    const fmt = (counts) => Object.entries(counts)
      .map(([slug, count]) => ({ slug, name: slugToName[slug] || slug, pct: Math.round(count / simResults.numSims * 1000) / 10 }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 4);
    return { west: fmt(simResults.confChampCounts.Western || {}), east: fmt(simResults.confChampCounts.Eastern || {}) };
  }, [simResults]);

  return (
    <div className={styles.page}>
      {/* ── Hero Header ── */}
      <header className={styles.hero}>
        <div className={styles.heroGlow} />
        <div className={styles.heroInner}>
          <div className={styles.heroText}>
            <span className={styles.heroEyebrow}>2026 NBA Playoffs</span>
            <h1 className={styles.heroTitle}>NBA Bracketology</h1>
            <p className={styles.heroSub}>Interactive playoff bracket with series predictions and championship simulation</p>
          </div>
          <div className={styles.heroActions}>
            <button type="button" className={styles.btn} onClick={handleMaximus}>
              Maximus&rsquo;s Picks
            </button>
            <button type="button" className={`${styles.btn} ${styles.btnGold}`}
              onClick={handleSimulate} disabled={simRunning}>
              {simRunning ? 'Simulating\u2026' : 'Simulate 1,000'}
            </button>
            <button type="button" className={styles.btnGhost} onClick={() => { setPicks({}); setSimResults(null); }}>
              Clear
            </button>
          </div>
        </div>
      </header>

      {/* ── Round Labels ── */}
      <div className={styles.roundRow}>
        {['1st Round', 'Conf. Semis', 'Conf. Finals', 'NBA Finals', 'Conf. Finals', 'Conf. Semis', '1st Round'].map((r, i) => (
          <span key={i} className={`${styles.roundLabel} ${i === 3 ? styles.roundLabelGold : ''}`}>{r}</span>
        ))}
      </div>

      {/* ── Conference Labels ── */}
      <div className={styles.confRow}>
        <span className={styles.confLeft}><img src="/nba-west-logo.png" alt="" className={styles.confIcon} /> WESTERN CONFERENCE</span>
        <span className={styles.confRight}>EASTERN CONFERENCE <img src="/nba-east-logo.png" alt="" className={styles.confIcon} /></span>
      </div>

      {/* ── Bracket Grid ── */}
      <div className={styles.bracketScroll}>
        <div className={styles.bracket}>
          {/* West R1 */}
          <div className={styles.col}>{getMatchups('Western', 1).map(m =>
            <SeriesCard key={m.matchupId} matchup={m} prediction={predictions[m.matchupId]} userPick={picks[m.matchupId]} onPick={handlePick} />
          )}</div>
          {/* West R2 */}
          <div className={`${styles.col} ${styles.colR2}`}>{getMatchups('Western', 2).map(m =>
            <SeriesCard key={m.matchupId} matchup={m} prediction={predictions[m.matchupId]} userPick={picks[m.matchupId]} onPick={handlePick} />
          )}</div>
          {/* West CF */}
          <div className={`${styles.col} ${styles.colCF}`}>{getMatchups('Western', 3).map(m =>
            <SeriesCard key={m.matchupId} matchup={m} prediction={predictions[m.matchupId]} userPick={picks[m.matchupId]} onPick={handlePick} />
          )}</div>

          {/* Finals Center */}
          <div className={styles.finalsCol}>
            <div className={styles.finalsGlow} />
            <span className={styles.finalsTag}>NBA Finals</span>
            {finals && <SeriesCard matchup={finals} prediction={predictions['finals']} userPick={picks['finals']} onPick={handlePick} />}
            {champion && !champion.isPlaceholder && (
              <div className={styles.champ}>
                {champion.logo && <img src={champion.logo} alt="" className={styles.champLogo} />}
                <span className={styles.champTrophy}>{'\uD83C\uDFC6'}</span>
                <span className={styles.champName}>{champion.shortName || champion.name}</span>
                <span className={styles.champLabel}>NBA Champion</span>
              </div>
            )}
          </div>

          {/* East CF */}
          <div className={`${styles.col} ${styles.colCF}`}>{getMatchups('Eastern', 3).map(m =>
            <SeriesCard key={m.matchupId} matchup={m} prediction={predictions[m.matchupId]} userPick={picks[m.matchupId]} onPick={handlePick} />
          )}</div>
          {/* East R2 */}
          <div className={`${styles.col} ${styles.colR2}`}>{getMatchups('Eastern', 2).map(m =>
            <SeriesCard key={m.matchupId} matchup={m} prediction={predictions[m.matchupId]} userPick={picks[m.matchupId]} onPick={handlePick} />
          )}</div>
          {/* East R1 */}
          <div className={styles.col}>{getMatchups('Eastern', 1).map(m =>
            <SeriesCard key={m.matchupId} matchup={m} prediction={predictions[m.matchupId]} userPick={picks[m.matchupId]} onPick={handlePick} />
          )}</div>
        </div>
      </div>

      {/* ── Simulation Results Panel ── */}
      {simResults && (
        <section className={styles.simPanel}>
          <div className={styles.simHeader}>
            <h2 className={styles.simTitle}>Championship Probabilities</h2>
            <span className={styles.simRuns}>{simResults.numSims.toLocaleString()} simulations</span>
          </div>

          <div className={styles.simGrid}>
            {simChamps.map(({ slug, name, pct }, i) => {
              const logo = getNbaEspnLogoUrl(slug);
              return (
                <div key={slug} className={`${styles.simRow} ${i === 0 ? styles.simRowTop : ''}`}>
                  <span className={styles.simRank}>{i + 1}</span>
                  {logo && <img src={logo} alt="" className={styles.simLogo} />}
                  <span className={styles.simName}>{name}</span>
                  <span className={styles.simPct}>{pct}%</span>
                  <div className={styles.simBar}><div className={styles.simFill} style={{ width: `${Math.min(pct / (simChamps[0]?.pct || 1) * 100, 100)}%` }} /></div>
                </div>
              );
            })}
          </div>

          {/* Conference Champions */}
          {confChamps && (
            <div className={styles.confChampsRow}>
              <div className={styles.confChampCard}>
                <span className={styles.confChampLabel}>West Champion</span>
                {confChamps.west.slice(0, 3).map(t => (
                  <div key={t.slug} className={styles.confChampTeam}>
                    <img src={getNbaEspnLogoUrl(t.slug)} alt="" className={styles.confChampLogo} />
                    <span>{t.name}</span>
                    <span className={styles.confChampPct}>{t.pct}%</span>
                  </div>
                ))}
              </div>
              <div className={styles.confChampCard}>
                <span className={styles.confChampLabel}>East Champion</span>
                {confChamps.east.slice(0, 3).map(t => (
                  <div key={t.slug} className={styles.confChampTeam}>
                    <img src={getNbaEspnLogoUrl(t.slug)} alt="" className={styles.confChampLogo} />
                    <span>{t.name}</span>
                    <span className={styles.confChampPct}>{t.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
