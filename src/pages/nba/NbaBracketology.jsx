/**
 * NBA Bracketology — premium dark-mode playoff bracket.
 * West left, East right, NBA Finals center.
 * Championship metallic gold on black.
 *
 * State model:
 * - picks: { matchupId: 'top'|'bottom' } — which team won each series
 * - seriesResults: { matchupId: { winner, loser, seriesCall, seriesLength, ... } }
 * - predictions: deterministic model output for display (not picks)
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { NBA_PLAYOFF_YEAR } from '../../config/nbaBracketology';
import { buildFullNbaBracket, applyPicksToBracket } from '../../data/nba/playoffBracket';
import {
  resolveFullNbaBracket, simulateNbaBracket,
  simulateRound, simulateRemainingBracket,
} from '../../utils/nbaSeriesResolver';
import { fetchNbaChampionshipOdds } from '../../api/nbaChampionshipOdds';
import { getNbaEspnLogoUrl } from '../../utils/espnNbaLogos';
import { NBA_TEAMS } from '../../sports/nba/teams';
import styles from './NbaBracketology.module.css';

const slugToName = Object.fromEntries(NBA_TEAMS.map(t => [t.slug, t.shortName || t.name]));

const ROUND_NAMES = { 1: '1st Round', 2: 'Conf. Semis', 3: 'Conf. Finals', 4: 'NBA Finals' };

/* ── Series Card ── */
function SeriesCard({ matchup, result, prediction, userPick, onPick }) {
  if (!matchup) return null;
  const { topTeam, bottomTeam, matchupId, status, spread, network, startDate } = matchup;
  const isWaiting = status === 'waiting';
  const topPicked = userPick === 'top';
  const btmPicked = userPick === 'bottom';
  const isResolved = topPicked || btmPicked;
  const topIsWinner = isResolved && topPicked;
  const btmIsWinner = isResolved && btmPicked;

  function pick(pos) {
    if (isWaiting) return;
    const t = pos === 'top' ? topTeam : bottomTeam;
    if (!t || t.isPlaceholder) return;
    onPick(matchupId, pos);
  }

  const resultLabel = result?.seriesCall;

  return (
    <div className={`${styles.card} ${isWaiting ? styles.cardWaiting : ''} ${isResolved ? styles.cardResolved : ''}`}>
      {spread && <span className={styles.spread}>{spread}</span>}

      <button type="button"
        className={`${styles.slot} ${topPicked ? styles.slotWinner : ''} ${btmPicked && !topPicked ? styles.slotLoser : ''}`}
        onClick={() => pick('top')} disabled={isWaiting || topTeam?.isPlaceholder}>
        {topTeam?.logo && <img src={topTeam.logo} alt="" className={styles.slotLogo} />}
        <span className={styles.seed}>{topTeam?.seed ?? ''}</span>
        <span className={styles.slotName}>{topTeam?.shortName || topTeam?.name || 'TBD'}</span>
        {result && <span className={styles.seriesWins}>{result.topWins}</span>}
      </button>

      <button type="button"
        className={`${styles.slot} ${btmPicked ? styles.slotWinner : ''} ${topPicked && !btmPicked ? styles.slotLoser : ''}`}
        onClick={() => pick('bottom')} disabled={isWaiting || bottomTeam?.isPlaceholder}>
        {bottomTeam?.logo && <img src={bottomTeam.logo} alt="" className={styles.slotLogo} />}
        <span className={styles.seed}>{bottomTeam?.seed ?? ''}</span>
        <span className={styles.slotName}>{bottomTeam?.shortName || bottomTeam?.name || 'TBD'}</span>
        {result && <span className={styles.seriesWins}>{result.bottomWins}</span>}
      </button>

      <div className={styles.cardMeta}>
        {resultLabel ? (
          <span className={styles.resultBadge}>{resultLabel}</span>
        ) : prediction ? (
          <span className={styles.predBadge}>{prediction.seriesCall}</span>
        ) : null}
        {!resultLabel && startDate && <span className={styles.metaDate}>{startDate}</span>}
        {!resultLabel && network && <span className={styles.metaNet}>{network}</span>}
      </div>
    </div>
  );
}

/* ── Round Column with CTA ── */
function RoundColumn({ matchups, round, picks, seriesResults, predictions, onPick, onSimRound, className }) {
  const hasResolvable = matchups.some(m =>
    !picks[m.matchupId] && m.topTeam && !m.topTeam.isPlaceholder && m.bottomTeam && !m.bottomTeam.isPlaceholder
  );

  return (
    <div className={`${styles.col} ${className || ''}`}>
      {matchups.map(m => (
        <SeriesCard key={m.matchupId} matchup={m} result={seriesResults[m.matchupId]}
          prediction={predictions[m.matchupId]} userPick={picks[m.matchupId]} onPick={onPick} />
      ))}
      {hasResolvable && onSimRound && (
        <button type="button" className={styles.simRoundBtn} onClick={() => onSimRound(round)}>
          Simulate Round
        </button>
      )}
    </div>
  );
}

/* ── Main Page ── */
export default function NbaBracketology() {
  const [picks, setPicks] = useState({});
  const [seriesResults, setSeriesResults] = useState({});
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

  // Deterministic predictions for display
  useEffect(() => {
    const { predictions: preds } = resolveFullNbaBracket(allMatchups, context);
    setPredictions(preds);
  }, [allMatchups, context]);

  // Cascade-clearing pick handler
  const handlePick = useCallback((matchupId, position) => {
    setPicks(prev => {
      const next = { ...prev, [matchupId]: position };
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
    // Clear series results for downstream
    setSeriesResults(prev => {
      const next = { ...prev };
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

  // Simulate a single round probabilistically
  const handleSimRound = useCallback((round) => {
    const current = applyPicksToBracket(rawBracket, picks);
    const { picks: roundPicks, results: roundResults } = simulateRound(current, round, context);
    setPicks(prev => {
      // Clear downstream of newly-picked matchups
      const next = { ...prev, ...roundPicks };
      for (const mid of Object.keys(roundPicks)) {
        const queue = [mid];
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
      }
      // Re-add the round picks (they were deleted if they were also downstream of themselves)
      Object.assign(next, roundPicks);
      return next;
    });
    setSeriesResults(prev => ({ ...prev, ...roundResults }));
  }, [rawBracket, picks, context]);

  // Maximus's Picks — simulate next unresolved round only
  const handleMaximus = useCallback(() => {
    // Find the first round with resolvable matchups
    const current = applyPicksToBracket(rawBracket, picks);
    for (let round = 1; round <= 4; round++) {
      const roundMatchups = Object.values(current).filter(m => m.round === round);
      const hasResolvable = roundMatchups.some(m =>
        !picks[m.matchupId] && m.topTeam && !m.topTeam.isPlaceholder && m.bottomTeam && !m.bottomTeam.isPlaceholder
      );
      if (hasResolvable) {
        handleSimRound(round);
        return;
      }
    }
  }, [rawBracket, picks, handleSimRound]);

  // Simulate Bracket — fill all remaining rounds
  const handleSimBracket = useCallback(() => {
    setSimRunning(true);
    setTimeout(() => {
      const { picks: newPicks, results: newResults } = simulateRemainingBracket(rawBracket, picks, applyPicksToBracket, context);
      setPicks(newPicks);
      setSeriesResults(prev => ({ ...prev, ...newResults }));

      // Also run Monte Carlo for probability panel
      const mcResults = simulateNbaBracket(rawBracket, context, 1000);
      setSimResults(mcResults);
      setSimRunning(false);
    }, 50);
  }, [rawBracket, picks, context]);

  const handleClear = useCallback(() => {
    setPicks({});
    setSeriesResults({});
    setSimResults(null);
  }, []);

  const getMatchups = (conference, round) =>
    Object.values(allMatchups)
      .filter(m => m.conference === conference && m.round === round)
      .sort((a, b) => a.position - b.position);

  const finals = allMatchups['finals'];
  const champion = finals && picks['finals']
    ? (picks['finals'] === 'top' ? finals.topTeam : finals.bottomTeam)
    : null;
  const finalsResult = seriesResults['finals'];
  const finalsLoser = finalsResult?.loser;

  const simChamps = useMemo(() => {
    if (!simResults) return [];
    return Object.entries(simResults.champCounts)
      .map(([slug, count]) => ({ slug, name: slugToName[slug] || slug.toUpperCase(), pct: Math.round(count / simResults.numSims * 1000) / 10 }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 10);
  }, [simResults]);

  const confChamps = useMemo(() => {
    if (!simResults) return null;
    const fmt = (counts) => Object.entries(counts)
      .map(([slug, count]) => ({ slug, name: slugToName[slug] || slug, pct: Math.round(count / simResults.numSims * 1000) / 10 }))
      .sort((a, b) => b.pct - a.pct).slice(0, 4);
    return { west: fmt(simResults.confChampCounts.Western || {}), east: fmt(simResults.confChampCounts.Eastern || {}) };
  }, [simResults]);

  const roundLabels = ['1st Round', 'Conf. Semis', 'Conf. Finals', 'NBA Finals', 'Conf. Finals', 'Conf. Semis', '1st Round'];

  return (
    <div className={styles.page}>
      {/* Hero */}
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
              onClick={handleSimBracket} disabled={simRunning}>
              {simRunning ? 'Simulating\u2026' : 'Simulate Bracket'}
            </button>
            <button type="button" className={styles.btnGhost} onClick={handleClear}>Clear</button>
          </div>
        </div>
      </header>

      {/* Round Labels */}
      <div className={styles.roundRow}>
        {roundLabels.map((r, i) => (
          <span key={i} className={`${styles.roundLabel} ${i === 3 ? styles.roundLabelGold : ''}`}>{r}</span>
        ))}
      </div>

      {/* Conference Labels */}
      <div className={styles.confRow}>
        <span className={styles.confLeft}><img src="/nba-west-logo.png" alt="" className={styles.confIcon} /> WESTERN CONFERENCE</span>
        <span className={styles.confRight}>EASTERN CONFERENCE <img src="/nba-east-logo.png" alt="" className={styles.confIcon} /></span>
      </div>

      {/* Bracket */}
      <div className={styles.bracketScroll}>
        <div className={styles.bracket}>
          <RoundColumn matchups={getMatchups('Western', 1)} round={1} picks={picks} seriesResults={seriesResults}
            predictions={predictions} onPick={handlePick} onSimRound={handleSimRound} />
          <RoundColumn matchups={getMatchups('Western', 2)} round={2} picks={picks} seriesResults={seriesResults}
            predictions={predictions} onPick={handlePick} onSimRound={handleSimRound} className={styles.colR2} />
          <RoundColumn matchups={getMatchups('Western', 3)} round={3} picks={picks} seriesResults={seriesResults}
            predictions={predictions} onPick={handlePick} onSimRound={handleSimRound} className={styles.colCF} />

          {/* Finals Center */}
          <div className={styles.finalsCol}>
            <div className={styles.finalsGlow} />
            <span className={styles.finalsTag}>NBA Finals</span>
            {finals && <SeriesCard matchup={finals} result={seriesResults['finals']}
              prediction={predictions['finals']} userPick={picks['finals']} onPick={handlePick} />}
            {champion && !champion.isPlaceholder && (
              <div className={styles.champ}>
                {champion.logo && <img src={champion.logo} alt="" className={styles.champLogo} />}
                <span className={styles.champTrophy}>{'\uD83C\uDFC6'}</span>
                <span className={styles.champName}>{champion.shortName || champion.name}</span>
                {finalsResult && finalsLoser && (
                  <span className={styles.champResult}>
                    def. {finalsLoser.shortName || finalsLoser.name} {finalsResult.seriesScore}
                  </span>
                )}
                <span className={styles.champLabel}>NBA Champion</span>
              </div>
            )}
          </div>

          <RoundColumn matchups={getMatchups('Eastern', 3)} round={3} picks={picks} seriesResults={seriesResults}
            predictions={predictions} onPick={handlePick} onSimRound={handleSimRound} className={styles.colCF} />
          <RoundColumn matchups={getMatchups('Eastern', 2)} round={2} picks={picks} seriesResults={seriesResults}
            predictions={predictions} onPick={handlePick} onSimRound={handleSimRound} className={styles.colR2} />
          <RoundColumn matchups={getMatchups('Eastern', 1)} round={1} picks={picks} seriesResults={seriesResults}
            predictions={predictions} onPick={handlePick} onSimRound={handleSimRound} />
        </div>
      </div>

      {/* Simulation Results */}
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
          {confChamps && (
            <div className={styles.confChampsRow}>
              <div className={styles.confChampCard}>
                <span className={styles.confChampLabel}>West Champion</span>
                {confChamps.west.slice(0, 3).map(t => (
                  <div key={t.slug} className={styles.confChampTeam}>
                    <img src={getNbaEspnLogoUrl(t.slug)} alt="" className={styles.confChampLogo} />
                    <span>{t.name}</span><span className={styles.confChampPct}>{t.pct}%</span>
                  </div>
                ))}
              </div>
              <div className={styles.confChampCard}>
                <span className={styles.confChampLabel}>East Champion</span>
                {confChamps.east.slice(0, 3).map(t => (
                  <div key={t.slug} className={styles.confChampTeam}>
                    <img src={getNbaEspnLogoUrl(t.slug)} alt="" className={styles.confChampLogo} />
                    <span>{t.name}</span><span className={styles.confChampPct}>{t.pct}%</span>
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
